package fs

import (
	"io"
	"strings"
	"testing"

	"github.com/ddvk/rmfakecloud/internal/storage/exporter"
)

func TestRenderArchiveReportsFailuresInsteadOfAnEmptyStream(t *testing.T) {
	r, err := renderArchive(&exporter.MyArchive{}) // no pages, nothing to show
	if err == nil || r != nil {
		t.Fatalf("expected an error, got %v %v", r, err)
	}
	if !strings.Contains(err.Error(), "no pages") {
		t.Fatalf("unhelpful error: %v", err)
	}
}

func TestRenderArchiveReturnsTheRenderedDocument(t *testing.T) {
	a := &exporter.MyArchive{PayloadReader: exporter.NewSeekCloser([]byte("%PDF-original"))}
	r, err := renderArchive(a) // no annotations: the PDF is returned as it is
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	b, _ := io.ReadAll(r)
	if string(b) != "%PDF-original" {
		t.Fatalf("got %q", b)
	}
}
