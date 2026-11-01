package ui

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/ddvk/rmfakecloud/internal/devices"
	"github.com/ddvk/rmfakecloud/internal/model"
	"github.com/ddvk/rmfakecloud/internal/ui/viewmodel"
	"github.com/gin-gonic/gin"
)

type fakeDeviceStore struct {
	byUser map[string][]devices.Device
}

func (f *fakeDeviceStore) List(uid string) ([]devices.Device, error) { return f.byUser[uid], nil }
func (f *fakeDeviceStore) ListAll() (map[string][]devices.Device, error) {
	return f.byUser, nil
}

type fakeOnline map[string][]string

func (f fakeOnline) ConnectedDevices(uid string) []string { return f[uid] }

var seenAt = time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)

func devicesApp(users ...*model.User) *ReactAppWrapper {
	app := newTestApp(users...)
	app.devices = &fakeDeviceStore{byUser: map[string][]devices.Device{
		"alice": {{ID: "A1", Description: "alice rM2", LastSeen: seenAt, LastIP: "10.0.0.2", UserAgent: "xochitl", SyncVersion: "1.5"}},
		"bob":   {{ID: "B1", Description: "bob rM1", LastSeen: seenAt, LastIP: "10.0.0.3", UserAgent: "xochitl", SyncVersion: "1.0"}},
	}}
	app.online = fakeOnline{"alice": {"A1"}}
	return app
}

func devicesRouter(app *ReactAppWrapper, uid string, admin bool) *gin.Engine {
	r := gin.New()
	r.Use(asUser(uid, admin))
	r.GET("/devices", app.getDevices)
	return r
}

func listDevices(t *testing.T, r http.Handler, query string) (int, []viewmodel.Device) {
	t.Helper()
	w := do(r, http.MethodGet, "/devices"+query, nil)
	var out []viewmodel.Device
	if w.Code == http.StatusOK {
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("bad json %q: %v", w.Body.String(), err)
		}
	}
	return w.Code, out
}

func TestDevicesListsOnlyTheCallersOwn(t *testing.T) {
	app := devicesApp(&model.User{ID: "alice"}, &model.User{ID: "bob"})
	code, got := listDevices(t, devicesRouter(app, "alice", false), "")
	if code != http.StatusOK || len(got) != 1 || got[0].ID != "A1" {
		t.Fatalf("got %d %+v", code, got)
	}
}

func TestDevicesShowsOnlineState(t *testing.T) {
	app := devicesApp(&model.User{ID: "alice"}, &model.User{ID: "bob"})

	_, got := listDevices(t, devicesRouter(app, "alice", false), "")
	if !got[0].Online {
		t.Fatal("alice's connected device should be online")
	}
	_, got = listDevices(t, devicesRouter(app, "bob", false), "")
	if got[0].Online {
		t.Fatal("bob's device is not connected")
	}
}

func TestDevicesHidesIPAndUserAgentFromNonDevUsers(t *testing.T) {
	app := devicesApp(&model.User{ID: "alice"})
	_, got := listDevices(t, devicesRouter(app, "alice", false), "")
	if got[0].LastIP != "" || got[0].UserAgent != "" {
		t.Fatalf("leaked dev details: %+v", got[0])
	}
	if got[0].Description != "alice rM2" || got[0].SyncVersion != "1.5" || !got[0].LastSeen.Equal(seenAt) {
		t.Fatalf("basic details missing: %+v", got[0])
	}
}

func TestDevicesShowsIPAndUserAgentToDevUsers(t *testing.T) {
	app := devicesApp(&model.User{ID: "alice", Dev: true})
	_, got := listDevices(t, devicesRouter(app, "alice", false), "")
	if got[0].LastIP != "10.0.0.2" || got[0].UserAgent != "xochitl" {
		t.Fatalf("dev details missing: %+v", got[0])
	}
}

func TestDevicesAllRequiresAdmin(t *testing.T) {
	app := devicesApp(&model.User{ID: "alice"}, &model.User{ID: "bob"})
	if code, _ := listDevices(t, devicesRouter(app, "alice", false), "?all=1"); code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", code)
	}
}

func TestDevicesAllForAdminIncludesEveryUser(t *testing.T) {
	app := devicesApp(&model.User{ID: "admin", IsAdmin: true}, &model.User{ID: "alice"}, &model.User{ID: "bob"})
	code, got := listDevices(t, devicesRouter(app, "admin", true), "?all=1")
	if code != http.StatusOK || len(got) != 2 {
		t.Fatalf("got %d %+v", code, got)
	}
	owners := map[string]string{}
	for _, d := range got {
		owners[d.ID] = d.UserID
	}
	if owners["A1"] != "alice" || owners["B1"] != "bob" {
		t.Fatalf("owners wrong: %v", owners)
	}
}

func TestDevicesWithNoStoreIsEmptyNotAnError(t *testing.T) {
	app := newTestApp(&model.User{ID: "alice"})
	code, got := listDevices(t, devicesRouter(app, "alice", false), "")
	if code != http.StatusOK || len(got) != 0 {
		t.Fatalf("got %d %+v", code, got)
	}
}

func TestGetAppUsersIncludesDeviceCountAndLastSeen(t *testing.T) {
	app := devicesApp(&model.User{ID: "alice"}, &model.User{ID: "bob"}, &model.User{ID: "carol"})
	app.devices.(*fakeDeviceStore).byUser["alice"] = []devices.Device{
		{ID: "A1", LastSeen: seenAt.Add(-time.Hour)},
		{ID: "A2", LastSeen: seenAt},
	}
	r := gin.New()
	r.GET("/users", app.getAppUsers)

	w := do(r, http.MethodGet, "/users", nil)
	var got []viewmodel.User
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	byID := map[string]viewmodel.User{}
	for _, u := range got {
		byID[u.ID] = u
	}
	if byID["alice"].DeviceCount != 2 || byID["alice"].LastSeen == nil || !byID["alice"].LastSeen.Equal(seenAt) {
		t.Fatalf("alice: %+v", byID["alice"])
	}
	if byID["carol"].DeviceCount != 0 || byID["carol"].LastSeen != nil {
		t.Fatalf("carol has no devices: %+v", byID["carol"])
	}
}
