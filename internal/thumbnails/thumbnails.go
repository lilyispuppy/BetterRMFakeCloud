// Package thumbnails keeps a small picture of the first page of each document,
// for the library's grid. A picture is drawn from the document's PDF (which
// already has the annotations merged in) once per version of the document and
// kept on disk, so showing the library again costs nothing.
package thumbnails

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sync"

	log "github.com/sirupsen/logrus"
)

var (
	// ErrBadKey is returned for names that are not safe to use in a file path
	ErrBadKey = errors.New("thumbnails: invalid document id or version")
	// ErrUnavailable is returned by a rasteriser that cannot work on this machine
	ErrUnavailable = errors.New("thumbnails: no tool to draw PDF pages is installed")
)

// Key names one thumbnail: a version of a document of a person
type Key struct {
	User    string
	Doc     string
	Version string
}

// Item is a document that should have a thumbnail
type Item struct {
	Doc     string
	Version string
}

// Source produces the PDF of a document
type Source func() ([]byte, error)

// Rasteriser draws the first page of a PDF as a JPEG
type Rasteriser func(ctx context.Context, pdf []byte) ([]byte, error)

type call struct {
	done chan struct{}
	data []byte
	err  error
}

// Store draws thumbnails and keeps them in a folder
type Store struct {
	dir    string
	raster Rasteriser

	mu       sync.Mutex
	inflight map[string]*call
	warming  map[string]bool
	jobs     sync.WaitGroup
	// drawing is limited, drawing a page is the expensive part
	slots chan struct{}
}

// New makes a store that keeps its files in dir
func New(dir string, raster Rasteriser) *Store {
	return &Store{
		dir:      dir,
		raster:   raster,
		inflight: map[string]*call{},
		warming:  map[string]bool{},
		slots:    make(chan struct{}, 2),
	}
}

var safeName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

func (k Key) valid() bool {
	return k.User != "" && safeName.MatchString(k.Doc) && safeName.MatchString(k.Version)
}

func (s *Store) folder(k Key) string {
	// people's ids can be anything, e.g. an email address
	sum := sha256.Sum256([]byte(k.User))
	return filepath.Join(s.dir, hex.EncodeToString(sum[:8]), k.Doc)
}

func (s *Store) path(k Key) string {
	return filepath.Join(s.folder(k), k.Version+".jpg")
}

// Has says whether the thumbnail is already drawn
func (s *Store) Has(k Key) bool {
	if !k.valid() {
		return false
	}
	_, err := os.Stat(s.path(k))
	return err == nil
}

// Get returns the thumbnail, drawing it from the source when it is not kept yet
func (s *Store) Get(ctx context.Context, k Key, source Source) ([]byte, error) {
	if !k.valid() {
		return nil, ErrBadKey
	}
	if data, err := os.ReadFile(s.path(k)); err == nil {
		return data, nil
	}

	id := k.User + "\x00" + k.Doc + "\x00" + k.Version
	s.mu.Lock()
	if c, ok := s.inflight[id]; ok {
		s.mu.Unlock()
		select {
		case <-c.done:
			return c.data, c.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	c := &call{done: make(chan struct{})}
	s.inflight[id] = c
	s.mu.Unlock()

	c.data, c.err = s.draw(ctx, k, source)

	s.mu.Lock()
	delete(s.inflight, id)
	s.mu.Unlock()
	close(c.done)
	return c.data, c.err
}

func (s *Store) draw(ctx context.Context, k Key, source Source) ([]byte, error) {
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	pdf, err := source()
	if err != nil {
		return nil, err
	}
	img, err := s.raster(ctx, pdf)
	if err != nil {
		return nil, err
	}
	if err := s.keep(k, img); err != nil {
		// not being able to keep it should not stop it being shown
		log.Warn("[thumbnails] keeping a thumbnail: ", err)
	}
	return img, nil
}

// keep writes the file and drops the thumbnails of older versions
func (s *Store) keep(k Key, img []byte) error {
	dir := s.folder(k)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	_, werr := tmp.Write(img)
	cerr := tmp.Close()
	if err := errors.Join(werr, cerr); err != nil {
		_ = os.Remove(tmp.Name())
		return err
	}
	if err := os.Rename(tmp.Name(), s.path(k)); err != nil {
		_ = os.Remove(tmp.Name())
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	for _, e := range entries {
		if e.Name() != k.Version+".jpg" {
			_ = os.Remove(filepath.Join(dir, e.Name()))
		}
	}
	return nil
}

// Warm draws the missing thumbnails of a person's documents in the background,
// one after the other, so that opening the library finds them ready. It returns
// at once. A second call for the same person while one is running does nothing.
func (s *Store) Warm(user string, items []Item, source func(doc string) Source) {
	s.mu.Lock()
	if s.warming[user] {
		s.mu.Unlock()
		return
	}
	s.warming[user] = true
	s.mu.Unlock()

	s.jobs.Add(1)
	go func() {
		defer s.jobs.Done()
		defer func() {
			s.mu.Lock()
			delete(s.warming, user)
			s.mu.Unlock()
		}()
		for _, it := range items {
			k := Key{User: user, Doc: it.Doc, Version: it.Version}
			if !k.valid() || s.Has(k) {
				continue
			}
			if _, err := s.Get(context.Background(), k, source(it.Doc)); err != nil {
				if errors.Is(err, ErrUnavailable) {
					return
				}
				log.Debug(fmt.Sprintf("[thumbnails] %s: %v", it.Doc, err))
			}
		}
	}()
}

// Wait blocks until the background work is done; for tests
func (s *Store) Wait() { s.jobs.Wait() }
