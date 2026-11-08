package thumbnails

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

type fake struct {
	pdfs   atomic.Int32
	drawn  atomic.Int32
	failOn string
}

func (f *fake) source(content string) Source {
	return func() ([]byte, error) {
		f.pdfs.Add(1)
		return []byte(content), nil
	}
}

func (f *fake) raster(_ context.Context, pdf []byte) ([]byte, error) {
	f.drawn.Add(1)
	if string(pdf) == f.failOn {
		return nil, errors.New("cannot draw")
	}
	return []byte("jpeg of " + string(pdf)), nil
}

func newStore(t *testing.T, f *fake) *Store {
	t.Helper()
	return New(t.TempDir(), f.raster)
}

func TestDrawsOnceThenServesFromDisk(t *testing.T) {
	f := &fake{}
	s := newStore(t, f)
	k := Key{User: "ann", Doc: "d1", Version: "5"}

	for i := 0; i < 3; i++ {
		got, err := s.Get(context.Background(), k, f.source("a"))
		if err != nil || string(got) != "jpeg of a" {
			t.Fatalf("got %q, %v", got, err)
		}
	}
	if f.pdfs.Load() != 1 || f.drawn.Load() != 1 {
		t.Fatalf("pdfs %d, drawn %d", f.pdfs.Load(), f.drawn.Load())
	}
}

func TestSurvivesARestart(t *testing.T) {
	f := &fake{}
	dir := t.TempDir()
	k := Key{User: "ann", Doc: "d1", Version: "5"}
	if _, err := New(dir, f.raster).Get(context.Background(), k, f.source("a")); err != nil {
		t.Fatal(err)
	}
	if _, err := New(dir, f.raster).Get(context.Background(), k, f.source("a")); err != nil {
		t.Fatal(err)
	}
	if f.drawn.Load() != 1 {
		t.Fatalf("drawn %d", f.drawn.Load())
	}
}

func TestANewVersionReplacesTheOldOne(t *testing.T) {
	f := &fake{}
	s := newStore(t, f)
	ctx := context.Background()
	if _, err := s.Get(ctx, Key{"ann", "d1", "1"}, f.source("old")); err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(ctx, Key{"ann", "d1", "2"}, f.source("new"))
	if err != nil || string(got) != "jpeg of new" {
		t.Fatalf("got %q, %v", got, err)
	}
	entries, _ := os.ReadDir(filepath.Dir(s.path(Key{"ann", "d1", "2"})))
	if len(entries) != 1 {
		t.Fatalf("%d files left", len(entries))
	}
}

func TestPeopleDoNotShareThumbnails(t *testing.T) {
	f := &fake{}
	s := newStore(t, f)
	ctx := context.Background()
	a, _ := s.Get(ctx, Key{"ann", "d1", "1"}, f.source("ann's"))
	b, _ := s.Get(ctx, Key{"bob", "d1", "1"}, f.source("bob's"))
	if string(a) == string(b) {
		t.Fatal("shared")
	}
}

func TestRefusesNamesThatCouldEscapeTheFolder(t *testing.T) {
	f := &fake{}
	s := newStore(t, f)
	for _, k := range []Key{
		{"ann", "../x", "1"}, {"ann", "a/b", "1"}, {"ann", "", "1"},
		{"ann", "d1", "../1"}, {"ann", "d1", ""}, {"", "d1", "1"}, {"ann", "..", "1"},
	} {
		if _, err := s.Get(context.Background(), k, f.source("a")); !errors.Is(err, ErrBadKey) {
			t.Errorf("%+v: %v", k, err)
		}
	}
	if f.pdfs.Load() != 0 {
		t.Fatal("drew something")
	}
}

func TestFailuresAreNotRemembered(t *testing.T) {
	f := &fake{failOn: "bad"}
	s := newStore(t, f)
	k := Key{"ann", "d1", "1"}
	if _, err := s.Get(context.Background(), k, f.source("bad")); err == nil {
		t.Fatal("expected an error")
	}
	if got, err := s.Get(context.Background(), k, f.source("good")); err != nil || string(got) != "jpeg of good" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestSourceErrorsPassThrough(t *testing.T) {
	f := &fake{}
	s := newStore(t, f)
	want := errors.New("no such document")
	_, err := s.Get(context.Background(), Key{"ann", "d1", "1"}, func() ([]byte, error) { return nil, want })
	if !errors.Is(err, want) {
		t.Fatalf("got %v", err)
	}
}

func TestAskingTwiceAtOnceDrawsOnce(t *testing.T) {
	f := &fake{}
	s := newStore(t, f)
	k := Key{"ann", "d1", "1"}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Get(context.Background(), k, f.source("a")); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if f.drawn.Load() != 1 {
		t.Fatalf("drawn %d", f.drawn.Load())
	}
}

func TestWarmDrawsInTheBackgroundAndSkipsWhatExists(t *testing.T) {
	f := &fake{}
	s := newStore(t, f)
	ctx := context.Background()
	if _, err := s.Get(ctx, Key{"ann", "d1", "1"}, f.source("a")); err != nil {
		t.Fatal(err)
	}
	f.drawn.Store(0)

	s.Warm("ann", []Item{{"d1", "1"}, {"d2", "1"}, {"d3", "1"}}, func(id string) Source { return f.source(id) })
	s.Wait()
	if f.drawn.Load() != 2 {
		t.Fatalf("drawn %d", f.drawn.Load())
	}
	if !s.Has(Key{"ann", "d3", "1"}) {
		t.Fatal("d3 missing")
	}
}

func TestWarmGivesUpQuietlyWhenTheRasteriserIsMissing(t *testing.T) {
	s := New(t.TempDir(), func(context.Context, []byte) ([]byte, error) { return nil, ErrUnavailable })
	s.Warm("ann", []Item{{"d1", "1"}, {"d2", "1"}}, func(string) Source { return func() ([]byte, error) { return []byte("a"), nil } })
	s.Wait()
	if _, err := s.Get(context.Background(), Key{"ann", "d1", "1"}, func() ([]byte, error) { return []byte("a"), nil }); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("got %v", err)
	}
}
