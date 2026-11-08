package ui

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ddvk/rmfakecloud/internal/common"
	"github.com/ddvk/rmfakecloud/internal/storage"
	"github.com/ddvk/rmfakecloud/internal/thumbnails"
	"github.com/ddvk/rmfakecloud/internal/ui/viewmodel"
	"github.com/gin-gonic/gin"
)

type thumbBackend struct {
	backend
	tree    *viewmodel.DocumentTree
	exports atomic.Int32
	err     error
}

func (b *thumbBackend) Export(uid, doc, exporttype string, opt storage.ExportOption) (io.ReadCloser, error) {
	b.exports.Add(1)
	if b.err != nil {
		return nil, b.err
	}
	return io.NopCloser(strings.NewReader("pdf of " + doc + " as " + exporttype)), nil
}

func (b *thumbBackend) GetDocumentTree(uid string) (*viewmodel.DocumentTree, error) {
	return b.tree, nil
}

func thumbRouter(t *testing.T, b *thumbBackend, raster thumbnails.Rasteriser) (*gin.Engine, *ReactAppWrapper) {
	app := newTestApp()
	app.backends = map[common.SyncVersion]backend{common.Sync15: b}
	if raster != nil {
		app.thumbs = thumbnails.New(t.TempDir(), raster)
	}
	r := gin.New()
	r.Use(asUser("u", false), func(c *gin.Context) { c.Set(backendVersionKey, common.Sync15) })
	r.GET("/documents", app.listDocuments)
	r.GET("/documents/:docid/thumbnail", app.getThumbnail)
	return r, app
}

func jpegOf(_ context.Context, pdf []byte) ([]byte, error) {
	return append([]byte("jpeg:"), pdf...), nil
}

func TestThumbnailIsAJPEGOfTheAnnotatedPDF(t *testing.T) {
	b := &thumbBackend{}
	r, _ := thumbRouter(t, b, jpegOf)
	w := do(r, http.MethodGet, "/documents/d1/thumbnail?v=7", nil)
	if w.Code != 200 || w.Body.String() != "jpeg:pdf of d1 as pdf" {
		t.Fatalf("%d %q", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "image/jpeg" {
		t.Fatalf("content type %q", ct)
	}
	if cc := w.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") || !strings.Contains(cc, "private") {
		t.Fatalf("cache control %q", cc)
	}
	do(r, http.MethodGet, "/documents/d1/thumbnail?v=7", nil)
	if b.exports.Load() != 1 {
		t.Fatalf("exported %d times", b.exports.Load())
	}
}

func TestThumbnailWithoutAVersionIsNotCachedForever(t *testing.T) {
	r, _ := thumbRouter(t, &thumbBackend{}, jpegOf)
	w := do(r, http.MethodGet, "/documents/d1/thumbnail", nil)
	if w.Code != 200 || strings.Contains(w.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("%d %q", w.Code, w.Header().Get("Cache-Control"))
	}
}

func TestThumbnailErrors(t *testing.T) {
	for _, tc := range []struct {
		name   string
		b      *thumbBackend
		raster thumbnails.Rasteriser
		url    string
		want   int
	}{
		{"unsafe id", &thumbBackend{}, jpegOf, "/documents/bad%20id/thumbnail?v=1", http.StatusBadRequest},
		{"unsafe version", &thumbBackend{}, jpegOf, "/documents/d1/thumbnail?v=../1", http.StatusBadRequest},
		{"no tool", &thumbBackend{}, func(context.Context, []byte) ([]byte, error) { return nil, thumbnails.ErrUnavailable }, "/documents/d1/thumbnail?v=1", http.StatusNotImplemented},
		{"disabled", &thumbBackend{}, nil, "/documents/d1/thumbnail?v=1", http.StatusNotImplemented},
		{"cannot export", &thumbBackend{err: errors.New("no pages")}, jpegOf, "/documents/d1/thumbnail?v=1", http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r, _ := thumbRouter(t, tc.b, tc.raster)
			w := do(r, http.MethodGet, tc.url, nil)
			if w.Code != tc.want {
				t.Fatalf("status %d: %s", w.Code, w.Body.String())
			}
			if !strings.Contains(w.Header().Get("Content-Type"), "json") {
				t.Fatalf("content type %q", w.Header().Get("Content-Type"))
			}
		})
	}
}

func TestListingTheLibraryDrawsMissingThumbnailsInTheBackground(t *testing.T) {
	when := time.UnixMilli(1700000000123)
	b := &thumbBackend{tree: &viewmodel.DocumentTree{Entries: []viewmodel.Entry{
		&viewmodel.Directory{ID: "f1", IsFolder: true, Entries: []viewmodel.Entry{
			&viewmodel.Document{ID: "inside", LastModified: when},
		}},
		&viewmodel.Document{ID: "top", LastModified: when},
	}}}
	r, app := thumbRouter(t, b, jpegOf)
	if w := do(r, http.MethodGet, "/documents", nil); w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
	app.thumbs.Wait()
	for _, id := range []string{"top", "inside"} {
		if !app.thumbs.Has(thumbnails.Key{User: "u", Doc: id, Version: "1700000000123"}) {
			t.Errorf("%s not drawn", id)
		}
	}
}
