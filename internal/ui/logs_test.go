package ui

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"

	"github.com/ddvk/rmfakecloud/internal/logbuf"
	"github.com/ddvk/rmfakecloud/internal/model"
	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

func itoa(n uint64) string { return strconv.FormatUint(n, 10) }

type logsBody struct {
	Entries []logbuf.Entry `json:"entries"`
	Last    uint64         `json:"last"`
}

func logsRouter(app *ReactAppWrapper, uid string) *gin.Engine {
	r := gin.New()
	// same chain as the real route: dev users only
	r.Use(asUser(uid, false), app.devMiddleware())
	r.GET("/logs", app.getLogs)
	return r
}

func appWithLogs(users ...*model.User) *ReactAppWrapper {
	app := newTestApp(users...)
	app.logs = logbuf.New(100)
	for _, m := range []struct {
		lvl logrus.Level
		msg string
	}{
		{logrus.DebugLevel, "debug line"},
		{logrus.InfoLevel, "sync started"},
		{logrus.WarnLevel, "slow request"},
		{logrus.ErrorLevel, "boom"},
	} {
		_ = app.logs.Fire(&logrus.Entry{Level: m.lvl, Message: m.msg})
	}
	return app
}

func getLogs(t *testing.T, r http.Handler, query string) (int, logsBody) {
	t.Helper()
	w := do(r, http.MethodGet, "/logs"+query, nil)
	var out logsBody
	if w.Code == http.StatusOK {
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("bad json %q: %v", w.Body.String(), err)
		}
	}
	return w.Code, out
}

func TestLogsForbiddenForNonDevUsers(t *testing.T) {
	app := appWithLogs(&model.User{ID: "plain"}, &model.User{ID: "admin", IsAdmin: true})

	for _, uid := range []string{"plain", "admin"} {
		code, _ := getLogs(t, logsRouter(app, uid), "")
		if code != http.StatusForbidden {
			t.Errorf("%s: got %d, want 403", uid, code)
		}
	}
}

func TestLogsReturnsEntriesForDevUsers(t *testing.T) {
	app := appWithLogs(&model.User{ID: "dev", Dev: true})
	code, out := getLogs(t, logsRouter(app, "dev"), "")
	if code != http.StatusOK {
		t.Fatalf("got %d", code)
	}
	if len(out.Entries) != 4 {
		t.Fatalf("got %d entries", len(out.Entries))
	}
	if out.Last != out.Entries[3].Seq {
		t.Fatalf("last=%d, want %d", out.Last, out.Entries[3].Seq)
	}
}

func TestLogsQueryParameters(t *testing.T) {
	app := appWithLogs(&model.User{ID: "dev", Dev: true})
	r := logsRouter(app, "dev")

	_, out := getLogs(t, r, "?level=warn")
	if len(out.Entries) != 2 || out.Entries[0].Message != "slow request" {
		t.Fatalf("level filter: %+v", out.Entries)
	}

	_, out = getLogs(t, r, "?q=SYNC")
	if len(out.Entries) != 1 || out.Entries[0].Message != "sync started" {
		t.Fatalf("search: %+v", out.Entries)
	}

	_, all := getLogs(t, r, "")
	_, out = getLogs(t, r, "?since="+itoa(all.Entries[2].Seq))
	if len(out.Entries) != 1 || out.Entries[0].Message != "boom" {
		t.Fatalf("since: %+v", out.Entries)
	}

	_, out = getLogs(t, r, "?limit=2")
	if len(out.Entries) != 2 || out.Entries[1].Message != "boom" {
		t.Fatalf("limit: %+v", out.Entries)
	}
}

func TestLogsNothingNewKeepsTheCursor(t *testing.T) {
	app := appWithLogs(&model.User{ID: "dev", Dev: true})
	r := logsRouter(app, "dev")

	_, all := getLogs(t, r, "")
	_, out := getLogs(t, r, "?since="+itoa(all.Last))
	if len(out.Entries) != 0 {
		t.Fatalf("expected no entries, got %d", len(out.Entries))
	}
	if out.Last != all.Last {
		t.Fatalf("cursor moved from %d to %d with no new entries", all.Last, out.Last)
	}
}

func TestLogsRejectsBadParameters(t *testing.T) {
	app := appWithLogs(&model.User{ID: "dev", Dev: true})
	r := logsRouter(app, "dev")

	for _, q := range []string{"?level=loud", "?since=abc", "?limit=-1"} {
		if code, _ := getLogs(t, r, q); code != http.StatusBadRequest {
			t.Errorf("%s: got %d, want 400", q, code)
		}
	}
}

func TestLogsLimitIsCapped(t *testing.T) {
	app := newTestApp(&model.User{ID: "dev", Dev: true})
	app.logs = logbuf.New(5000)
	for i := 0; i < 3000; i++ {
		_ = app.logs.Fire(&logrus.Entry{Level: logrus.InfoLevel, Message: "x"})
	}
	_, out := getLogs(t, logsRouter(app, "dev"), "?limit=100000")
	if len(out.Entries) != maxLogLimit {
		t.Fatalf("got %d entries, want cap of %d", len(out.Entries), maxLogLimit)
	}
}
