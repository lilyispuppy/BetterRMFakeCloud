package exporter

import (
	"bytes"
	"errors"
	"io"
	"strings"
	"testing"
)

type fakeV6 struct {
	pages [][]byte
	err   error
}

func (f *fakeV6) RenderPDF(pages [][]byte, w io.Writer) error {
	f.pages = pages
	if f.err != nil {
		return f.err
	}
	_, err := w.Write([]byte("%PDF-fake"))
	return err
}

func (f *fakeV6) RenderSVG(page []byte) ([]byte, error) { return []byte("<svg/>"), f.err }

func TestEmbeddedBlankPageIsAV6Scene(t *testing.T) {
	if DetectVersion(blankV6) != VersionV6 {
		t.Fatalf("blank page header: %q", blankV6[:20])
	}
}

func TestRenderV6NotebookKeepsOrderAndFillsBlankPages(t *testing.T) {
	a := &MyArchive{PageData: []PageData{
		{ID: "a", Raw: header("6")},
		{ID: "b"}, // never drawn on
		{ID: "c", Raw: append(header("6"), 'c')},
	}}
	r := &fakeV6{}
	var out bytes.Buffer
	if err := RenderV6Notebook(a, r, &out); err != nil {
		t.Fatal(err)
	}
	if out.String() != "%PDF-fake" {
		t.Fatalf("output %q", out.String())
	}
	if len(r.pages) != 3 {
		t.Fatalf("got %d pages", len(r.pages))
	}
	if !bytes.Equal(r.pages[0], header("6")) || !bytes.Equal(r.pages[1], blankV6) || r.pages[2][len(r.pages[2])-1] != 'c' {
		t.Fatal("pages out of order or blank not substituted")
	}
}

func TestRenderV6NotebookWithoutPagesIsAnError(t *testing.T) {
	err := RenderV6Notebook(&MyArchive{}, &fakeV6{}, io.Discard)
	if err == nil || !strings.Contains(err.Error(), "no pages") {
		t.Fatalf("got %v", err)
	}
}

func TestRenderV6NotebookPassesRendererErrorsOn(t *testing.T) {
	boom := errors.New("boom")
	err := RenderV6Notebook(&MyArchive{PageData: []PageData{{Raw: header("6")}}}, &fakeV6{err: boom}, io.Discard)
	if !errors.Is(err, boom) {
		t.Fatalf("got %v", err)
	}
}

func TestRenderChoosesTheV6PathForNotebooksOnly(t *testing.T) {
	r := &fakeV6{}
	old := V6
	V6 = r
	defer func() { V6 = old }()

	nb := &MyArchive{PageData: []PageData{{Raw: header("6")}}}
	var out bytes.Buffer
	if err := Render(nb, &out); err != nil || out.String() != "%PDF-fake" {
		t.Fatalf("notebook: %q %v", out.String(), err)
	}

	// a PDF background goes through the annotation renderer, not rmc
	r.pages = nil
	pdfDoc := &MyArchive{PageData: []PageData{{Raw: header("6")}}, PayloadReader: NewSeekCloser([]byte("%PDF"))}
	_ = Render(pdfDoc, io.Discard)
	if r.pages != nil {
		t.Fatal("PDF documents must not use the notebook renderer")
	}
}

func TestIsNotebookV6(t *testing.T) {
	if !IsV6Notebook(&MyArchive{PageData: []PageData{{Raw: header("6")}}}) {
		t.Fatal("v6 without payload is a v6 notebook")
	}
	if IsV6Notebook(&MyArchive{PageData: []PageData{{Raw: header("5")}}}) {
		t.Fatal("v5 is not")
	}
}
