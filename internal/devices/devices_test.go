package devices

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

var t0 = time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)

func newTestStore(t *testing.T) (*Store, string, *time.Time) {
	t.Helper()
	dir := t.TempDir()
	s := NewStore(dir)
	now := t0
	s.now = func() time.Time { return now }
	return s, dir, &now
}

func onDisk(t *testing.T, dir, uid string) []Device {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(dir, "users", uid, "devices.json"))
	if err != nil {
		t.Fatal(err)
	}
	var out []Device
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func dev(id string) Device {
	return Device{ID: id, Description: "remarkable", LastIP: "10.0.0.2", UserAgent: "xochitl", SyncVersion: "1.5"}
}

func TestSeenRegistersANewDevice(t *testing.T) {
	s, _, _ := newTestStore(t)
	if err := s.Seen("alice", dev("RM1")); err != nil {
		t.Fatal(err)
	}
	got, err := s.List("alice")
	if err != nil || len(got) != 1 {
		t.Fatalf("got %v, %v", got, err)
	}
	d := got[0]
	if d.ID != "RM1" || d.Description != "remarkable" || d.LastIP != "10.0.0.2" {
		t.Fatalf("unexpected device %+v", d)
	}
	if !d.FirstSeen.Equal(t0) || !d.LastSeen.Equal(t0) {
		t.Fatalf("times not set: %+v", d)
	}
}

func TestSeenAgainKeepsFirstSeenAndUpdatesTheRest(t *testing.T) {
	s, _, now := newTestStore(t)
	_ = s.Seen("alice", dev("RM1"))

	*now = t0.Add(time.Hour)
	changed := dev("RM1")
	changed.LastIP = "192.168.1.9"
	_ = s.Seen("alice", changed)

	got, _ := s.List("alice")
	if len(got) != 1 {
		t.Fatalf("expected one device, got %d", len(got))
	}
	if !got[0].FirstSeen.Equal(t0) || !got[0].LastSeen.Equal(t0.Add(time.Hour)) {
		t.Fatalf("times wrong: %+v", got[0])
	}
	if got[0].LastIP != "192.168.1.9" {
		t.Fatalf("ip not updated: %+v", got[0])
	}
}

func TestPersistsAcrossRestart(t *testing.T) {
	s, dir, _ := newTestStore(t)
	_ = s.Seen("alice", dev("RM1"))

	again := NewStore(dir)
	got, err := again.List("alice")
	if err != nil || len(got) != 1 || got[0].ID != "RM1" {
		t.Fatalf("got %v, %v", got, err)
	}
}

func TestRoutineSightingsDoNotHitTheDisk(t *testing.T) {
	s, dir, now := newTestStore(t)
	_ = s.Seen("alice", dev("RM1"))

	*now = t0.Add(10 * time.Second) // well inside the throttle window
	_ = s.Seen("alice", dev("RM1"))

	if got := onDisk(t, dir, "alice"); !got[0].LastSeen.Equal(t0) {
		t.Fatalf("disk was rewritten inside the throttle window: %v", got[0].LastSeen)
	}
	// memory is always current
	if got, _ := s.List("alice"); !got[0].LastSeen.Equal(t0.Add(10 * time.Second)) {
		t.Fatalf("memory not updated: %v", got[0].LastSeen)
	}

	*now = t0.Add(2 * time.Minute) // past it
	_ = s.Seen("alice", dev("RM1"))
	if got := onDisk(t, dir, "alice"); !got[0].LastSeen.Equal(t0.Add(2 * time.Minute)) {
		t.Fatalf("disk not refreshed after the window: %v", got[0].LastSeen)
	}
}

func TestAChangeIsWrittenImmediately(t *testing.T) {
	s, dir, now := newTestStore(t)
	_ = s.Seen("alice", dev("RM1"))

	*now = t0.Add(5 * time.Second)
	moved := dev("RM1")
	moved.LastIP = "172.16.0.5"
	_ = s.Seen("alice", moved)

	if got := onDisk(t, dir, "alice"); got[0].LastIP != "172.16.0.5" {
		t.Fatalf("ip change not persisted: %+v", got[0])
	}
}

func TestUsersAreIsolated(t *testing.T) {
	s, _, _ := newTestStore(t)
	_ = s.Seen("alice", dev("A1"))
	_ = s.Seen("bob", dev("B1"))

	a, _ := s.List("alice")
	if len(a) != 1 || a[0].ID != "A1" {
		t.Fatalf("alice sees %v", a)
	}
	if none, _ := s.List("carol"); len(none) != 0 {
		t.Fatalf("unknown user should have no devices, got %v", none)
	}
}

func TestListIsNewestFirst(t *testing.T) {
	s, _, now := newTestStore(t)
	_ = s.Seen("alice", dev("old"))
	*now = t0.Add(time.Hour)
	_ = s.Seen("alice", dev("new"))

	got, _ := s.List("alice")
	if got[0].ID != "new" || got[1].ID != "old" {
		t.Fatalf("order: %v, %v", got[0].ID, got[1].ID)
	}
}

func TestListAllCoversEveryUserIncludingUnloadedOnes(t *testing.T) {
	s, dir, _ := newTestStore(t)
	_ = s.Seen("alice", dev("A1"))
	_ = s.Seen("bob", dev("B1"))

	fresh := NewStore(dir) // nothing loaded yet, must scan disk
	all, err := fresh.ListAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(all["alice"]) != 1 || len(all["bob"]) != 1 || len(all) != 2 {
		t.Fatalf("got %v", all)
	}
}

func TestListAllWithNoUsersDirIsEmpty(t *testing.T) {
	all, err := NewStore(t.TempDir()).ListAll()
	if err != nil || len(all) != 0 {
		t.Fatalf("got %v, %v", all, err)
	}
}

func TestRejectsUnsafeUserIDsAndEmptyDeviceIDs(t *testing.T) {
	s, dir, _ := newTestStore(t)
	for _, uid := range []string{"", "..", "../evil", "a/b", `a\b`} {
		if err := s.Seen(uid, dev("RM1")); err == nil {
			t.Errorf("uid %q should be rejected", uid)
		}
	}
	if err := s.Seen("alice", Device{}); err == nil {
		t.Error("a device without an id should be rejected")
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(dir), "evil")); err == nil {
		t.Fatal("wrote outside the data dir")
	}
}

func TestCorruptFileIsAnErrorNotACrash(t *testing.T) {
	s, dir, _ := newTestStore(t)
	p := filepath.Join(dir, "users", "alice")
	_ = os.MkdirAll(p, 0o755)
	_ = os.WriteFile(filepath.Join(p, "devices.json"), []byte("{not json"), 0o644)

	if _, err := s.List("alice"); err == nil {
		t.Fatal("expected an error for a corrupt file")
	}
}

func TestEmptyFieldsInALaterSightingDoNotEraseKnownOnes(t *testing.T) {
	s, _, _ := newTestStore(t)
	_ = s.Seen("alice", dev("RM1"))
	// e.g. a pairing-style sighting that knows nothing but the id
	_ = s.Seen("alice", Device{ID: "RM1"})

	got, _ := s.List("alice")
	if got[0].Description != "remarkable" || got[0].LastIP != "10.0.0.2" ||
		got[0].UserAgent != "xochitl" || got[0].SyncVersion != "1.5" {
		t.Fatalf("known fields were erased: %+v", got[0])
	}
}
