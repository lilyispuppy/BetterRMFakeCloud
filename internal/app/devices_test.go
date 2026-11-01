package app

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ddvk/rmfakecloud/internal/common"
	"github.com/ddvk/rmfakecloud/internal/config"
	"github.com/ddvk/rmfakecloud/internal/devices"
	"github.com/gin-gonic/gin"
)

type seenCall struct {
	uid string
	dev devices.Device
}

type fakeRecorder struct {
	calls []seenCall
	err   error
}

func (f *fakeRecorder) Seen(uid string, d devices.Device) error {
	f.calls = append(f.calls, seenCall{uid, d})
	return f.err
}

var testKey = []byte("test-secret")

func appWithRecorder(rec *fakeRecorder) *App {
	gin.SetMode(gin.TestMode)
	return &App{
		cfg:           &config.Config{JWTSecretKey: testKey},
		devices:       rec,
		codeConnector: NewCodeConnector(),
	}
}

func userToken(t *testing.T, scopes string) string {
	t.Helper()
	tok, err := common.SignClaims(&UserClaims{
		Profile:    Auth0profile{UserID: "auth0|alice"},
		DeviceDesc: "alice's rM2",
		DeviceID:   "RM110-1",
		Scopes:     scopes,
		Version:    tokenVersion,
	}, testKey)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func authedRequest(app *App, token string) *httptest.ResponseRecorder {
	r := gin.New()
	r.Use(app.authMiddleware())
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "xochitl/3.24")
	req.RemoteAddr = "10.0.0.5:4242"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestAuthMiddlewareRecordsTheDevice(t *testing.T) {
	for scopes, wantSync := range map[string]string{
		"intgr sync:tortoise": "1.5",
		"intgr sync:default":  "1.0",
	} {
		rec := &fakeRecorder{}
		w := authedRequest(appWithRecorder(rec), userToken(t, scopes))
		if w.Code != http.StatusOK {
			t.Fatalf("got %d", w.Code)
		}
		if len(rec.calls) != 1 {
			t.Fatalf("expected one sighting, got %d", len(rec.calls))
		}
		got := rec.calls[0]
		if got.uid != "alice" || got.dev.ID != "RM110-1" || got.dev.Description != "alice's rM2" {
			t.Fatalf("wrong identity: %+v", got)
		}
		if got.dev.UserAgent != "xochitl/3.24" || got.dev.LastIP != "10.0.0.5" || got.dev.SyncVersion != wantSync {
			t.Fatalf("wrong details for %q: %+v", scopes, got.dev)
		}
	}
}

func TestAuthMiddlewareSurvivesARecorderFailure(t *testing.T) {
	rec := &fakeRecorder{err: errors.New("disk full")}
	if w := authedRequest(appWithRecorder(rec), userToken(t, "sync:tortoise")); w.Code != http.StatusOK {
		t.Fatalf("tablet request failed because device tracking did: %d", w.Code)
	}
}

func TestAuthMiddlewareDoesNotRecordRejectedRequests(t *testing.T) {
	rec := &fakeRecorder{}
	if w := authedRequest(appWithRecorder(rec), "garbage"); w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d", w.Code)
	}
	if len(rec.calls) != 0 {
		t.Fatalf("recorded a device for a bad token: %+v", rec.calls)
	}
}

func TestAuthMiddlewareWorksWithoutARecorder(t *testing.T) {
	app := appWithRecorder(nil)
	app.devices = nil
	if w := authedRequest(app, userToken(t, "sync:tortoise")); w.Code != http.StatusOK {
		t.Fatalf("got %d", w.Code)
	}
}

func TestPairingRecordsTheNewDevice(t *testing.T) {
	rec := &fakeRecorder{}
	app := appWithRecorder(rec)
	code, err := app.codeConnector.NewCode("alice")
	if err != nil {
		t.Fatal(err)
	}

	r := gin.New()
	r.POST("/new", app.newDevice)
	body := `{"code":"` + code + `","deviceDesc":"desktop-linux","deviceID":"DEV-9"}`
	req := httptest.NewRequest(http.MethodPost, "/new", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "rmapi")
	req.RemoteAddr = "192.168.1.20:5555"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("pairing failed: %d %s", w.Code, w.Body.String())
	}
	if len(rec.calls) != 1 {
		t.Fatalf("expected the new device to be recorded, got %d calls", len(rec.calls))
	}
	got := rec.calls[0]
	if got.uid != "alice" || got.dev.ID != "DEV-9" || got.dev.Description != "desktop-linux" ||
		got.dev.LastIP != "192.168.1.20" || got.dev.UserAgent != "rmapi" {
		t.Fatalf("wrong record: %+v", got)
	}
}
