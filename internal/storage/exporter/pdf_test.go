package exporter

import (
	"bytes"
	"math"
	"os"
	"strings"
	"testing"

	"github.com/juruen/rmapi/archive"
	"github.com/juruen/rmapi/encoding/rm"
	pdf "github.com/unidoc/unipdf/v3/model"
)

func near(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

func TestPageScaleForV6PDFPagesUsesTheDeviceDPI(t *testing.T) {
	scale, shift := pageScale(true, 595.0, 842.0)
	want := 72.0 / 226.0
	if !near(scale, want) {
		t.Fatalf("scale %v want %v", scale, want)
	}
	if !near(shift, 595.0/2-float64(rm.Width)/2*want) {
		t.Fatalf("shift %v", shift)
	}
}

func TestPageScaleForOtherPagesFitsTheDevicePage(t *testing.T) {
	// squarish: fit the width
	if s, shift := pageScale(false, 1404, 1500); !near(s, 1.0) || shift != 0 {
		t.Fatalf("%v %v", s, shift)
	}
	// tall: fit the height
	if s, shift := pageScale(false, 700, 1872); !near(s, 1.0) || shift != 0 {
		t.Fatalf("%v %v", s, shift)
	}
}

func TestBackgroundPageNumber(t *testing.T) {
	if backgroundPageNumber(2) != 3 {
		t.Fatal("pdf pages are 1 based")
	}
	if backgroundPageNumber(-1) != 0 {
		t.Fatal("no pdf page means a blank page")
	}
}

func v6Stroke() *rm.Rm {
	var pts []rm.Point
	for i := 0; i < 20; i++ {
		pts = append(pts, rm.Point{X: float32(i * 10), Y: float32(i * 5), Width: 3})
	}
	return &rm.Rm{
		Version: rm.V6,
		Layers: []rm.Layer{{Lines: []rm.Line{
			{BrushType: rm.Fineliner, BrushColor: rm.Black, Points: pts},
		}}},
	}
}

func a4Archive(t *testing.T, pages ...archive.Page) *MyArchive {
	t.Helper()
	b, err := os.ReadFile("testdata/a4.pdf")
	if err != nil {
		t.Fatal(err)
	}
	a := &MyArchive{PayloadReader: NewSeekCloser(b)}
	a.Pages = pages
	return a
}

func generated(t *testing.T, a *MyArchive) (*pdf.PdfReader, string, error) {
	t.Helper()
	var out bytes.Buffer
	if err := RenderRmapi(a, &out); err != nil {
		return nil, "", err
	}
	r, err := pdf.NewPdfReader(bytes.NewReader(out.Bytes()))
	if err != nil {
		t.Fatalf("output is not a PDF: %v", err)
	}
	return r, out.String(), nil
}

func TestV6StrokesAreDrawnOnTheirPDFPage(t *testing.T) {
	a := a4Archive(t, archive.Page{Data: v6Stroke(), DocPage: 0})
	r, _, err := generated(t, a)
	if err != nil {
		t.Fatal(err)
	}
	n, _ := r.GetNumPages()
	if n != 1 {
		t.Fatalf("got %d pages", n)
	}
	page, _ := r.GetPage(1)
	streams, err := page.GetAllContentStreams()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(streams, "S") || !strings.Contains(streams, "l") {
		t.Fatalf("no stroke drawn: %q", streams)
	}
}

func TestPDFPagesWithoutAnnotationsAreKept(t *testing.T) {
	a := a4Archive(t,
		archive.Page{Data: v6Stroke(), DocPage: 0},
		archive.Page{DocPage: -1}, // a blank page added on the tablet
	)
	r, _, err := generated(t, a)
	if err != nil {
		t.Fatal(err)
	}
	if n, _ := r.GetNumPages(); n != 2 {
		t.Fatalf("got %d pages", n)
	}
}

func TestPDFPageOutOfRangeIsAnErrorNotAPanic(t *testing.T) {
	a := a4Archive(t, archive.Page{Data: v6Stroke(), DocPage: 7})
	if _, _, err := generated(t, a); err == nil {
		t.Fatal("expected an error")
	}
}
