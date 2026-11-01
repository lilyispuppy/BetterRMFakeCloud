package hub

import (
	"sort"
	"testing"
	"time"

	"github.com/ddvk/rmfakecloud/internal/messages"
)

func waitForClients(t *testing.T, h *Hub, uid string, want []string) {
	t.Helper()
	sort.Strings(want)
	deadline := time.Now().Add(2 * time.Second)
	for {
		got := h.ConnectedDevices(uid)
		sort.Strings(got)
		if equal(got, want) {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("connected devices for %s: got %v, want %v", uid, got, want)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestConnectedDevicesTracksAdditionsAndRemovals(t *testing.T) {
	h := NewHub()

	a := &wsClient{uid: "alice", deviceID: "RM1", notifications: make(chan *messages.WsMessage, 1)}
	b := &wsClient{uid: "alice", deviceID: "RM2", notifications: make(chan *messages.WsMessage, 1)}
	c := &wsClient{uid: "bob", deviceID: "RM3", notifications: make(chan *messages.WsMessage, 1)}

	if got := h.ConnectedDevices("alice"); len(got) != 0 {
		t.Fatalf("expected nothing connected, got %v", got)
	}

	h.additions <- a
	h.additions <- b
	h.additions <- c
	waitForClients(t, h, "alice", []string{"RM1", "RM2"})
	waitForClients(t, h, "bob", []string{"RM3"})

	h.removals <- a
	waitForClients(t, h, "alice", []string{"RM2"})

	h.removals <- b
	waitForClients(t, h, "alice", []string{})
	waitForClients(t, h, "nobody", []string{})
}
