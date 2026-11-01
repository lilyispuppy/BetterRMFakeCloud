// Package devices keeps a small registry of the devices (tablets, rmapi clients)
// that talk to the server, so the web UI can list them. Device tokens are
// stateless JWTs, so without this nothing records which devices exist.
package devices

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"
)

const (
	usersDir    = "users"
	fileName    = "devices.json"
	minWriteGap = time.Minute
)

// Device is one known device of a user.
type Device struct {
	ID          string    `json:"id"`
	Description string    `json:"description"`
	FirstSeen   time.Time `json:"firstSeen"`
	LastSeen    time.Time `json:"lastSeen"`
	LastIP      string    `json:"lastIP,omitempty"`
	UserAgent   string    `json:"userAgent,omitempty"`
	SyncVersion string    `json:"syncVersion,omitempty"`
}

type userDevices struct {
	byID        map[string]*Device
	lastWritten time.Time
}

// Store persists devices under <datadir>/users/<uid>/devices.json. Sightings
// are kept current in memory, but the file is only rewritten when something
// changed or the last write is older than a minute, to avoid disk churn on
// every request.
type Store struct {
	dir string
	now func() time.Time

	mu    sync.Mutex
	users map[string]*userDevices
}

// NewStore creates a store rooted at the server data directory.
func NewStore(dataDir string) *Store {
	return &Store{
		dir:   dataDir,
		now:   time.Now,
		users: make(map[string]*userDevices),
	}
}

func validUID(uid string) error {
	if uid == "" || uid == "." || uid == ".." || strings.ContainsAny(uid, `/\`) {
		return fmt.Errorf("invalid user id %q", uid)
	}
	return nil
}

func (s *Store) path(uid string) string {
	return filepath.Join(s.dir, usersDir, uid, fileName)
}

// load returns the user's devices, reading the file the first time. Callers hold s.mu.
func (s *Store) load(uid string) (*userDevices, error) {
	if u, ok := s.users[uid]; ok {
		return u, nil
	}
	u := &userDevices{byID: make(map[string]*Device)}

	b, err := os.ReadFile(s.path(uid))
	switch {
	case errors.Is(err, os.ErrNotExist):
		// no devices yet
	case err != nil:
		return nil, err
	default:
		var list []Device
		if err := json.Unmarshal(b, &list); err != nil {
			return nil, fmt.Errorf("reading %s: %w", s.path(uid), err)
		}
		for i := range list {
			d := list[i]
			u.byID[d.ID] = &d
		}
	}
	s.users[uid] = u
	return u, nil
}

func (s *Store) save(uid string, u *userDevices) error {
	list := make([]Device, 0, len(u.byID))
	for _, d := range u.byID {
		list = append(list, *d)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })

	b, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	p := s.path(uid)
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, p); err != nil {
		return err
	}
	u.lastWritten = s.now()
	return nil
}

// Seen records that a device just made a request. Empty fields in d never
// erase what is already known (a pairing request knows no sync version, a
// later request may carry no user agent).
func (s *Store) Seen(uid string, d Device) error {
	if err := validUID(uid); err != nil {
		return err
	}
	if d.ID == "" {
		return errors.New("device id is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	u, err := s.load(uid)
	if err != nil {
		return err
	}

	now := s.now()
	cur, known := u.byID[d.ID]
	if !known {
		cur = &Device{ID: d.ID, FirstSeen: now}
		u.byID[d.ID] = cur
	}

	changed := !known
	set := func(dst *string, v string) {
		if v != "" && *dst != v {
			*dst = v
			changed = true
		}
	}
	set(&cur.Description, d.Description)
	set(&cur.LastIP, d.LastIP)
	set(&cur.UserAgent, d.UserAgent)
	set(&cur.SyncVersion, d.SyncVersion)
	cur.LastSeen = now

	if changed || now.Sub(u.lastWritten) >= minWriteGap {
		return s.save(uid, u)
	}
	return nil
}

// List returns a user's devices, most recently seen first.
func (s *Store) List(uid string) ([]Device, error) {
	if err := validUID(uid); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	u, err := s.load(uid)
	if err != nil {
		return nil, err
	}
	out := make([]Device, 0, len(u.byID))
	for _, d := range u.byID {
		out = append(out, *d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastSeen.After(out[j].LastSeen) })
	return out, nil
}

// ListAll returns the devices of every user that has any. A user whose file
// cannot be read is logged and skipped rather than failing the whole listing.
func (s *Store) ListAll() (map[string][]Device, error) {
	entries, err := os.ReadDir(filepath.Join(s.dir, usersDir))
	if errors.Is(err, os.ErrNotExist) {
		return map[string][]Device{}, nil
	}
	if err != nil {
		return nil, err
	}

	all := make(map[string][]Device)
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		list, err := s.List(e.Name())
		if err != nil {
			log.Warn("[devices] skipping ", e.Name(), ": ", err)
			continue
		}
		if len(list) > 0 {
			all[e.Name()] = list
		}
	}
	return all, nil
}
