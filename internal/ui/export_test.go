package ui

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/ddvk/rmfakecloud/internal/common"
	"github.com/ddvk/rmfakecloud/internal/storage"
	"github.com/ddvk/rmfakecloud/internal/ui/viewmodel"
	"github.com/gin-gonic/gin"
)

type exportBackend struct {
	backend
	err error
}

func (e exportBackend) Export(uid, doc, exporttype string, opt storage.ExportOption) (io.ReadCloser, error) {
	if e.err != nil {
		return nil, e.err
	}
	return io.NopCloser(strings.NewReader("%PDF-ok")), nil
}

func exportRouter(b backend) *gin.Engine {
	app := newTestApp()
	app.backends = map[common.SyncVersion]backend{common.Sync15: b}
	r := gin.New()
	r.Use(asUser("u", false), func(c *gin.Context) { c.Set(backendVersionKey, common.Sync15) })
	r.GET("/documents/:docid", app.getDocument)
	return r
}

func TestExportFailureIsAJSONErrorNotAnEmptyOK(t *testing.T) {
	w := do(exportRouter(exportBackend{err: errors.New("the document has no pages")}), http.MethodGet, "/documents/d1", nil)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"error"`) {
		t.Fatalf("expected a JSON error, got %q", w.Body.String())
	}
	var _ viewmodel.ErrorResponse
}

func TestExportSuccessStreamsTheDocument(t *testing.T) {
	w := do(exportRouter(exportBackend{}), http.MethodGet, "/documents/d1", nil)
	if w.Code != http.StatusOK || w.Body.String() != "%PDF-ok" {
		t.Fatalf("%d %q", w.Code, w.Body.String())
	}
}
