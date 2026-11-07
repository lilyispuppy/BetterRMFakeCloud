package exporter

import (
	"bytes"
	"fmt"
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

func TestStrokesOnPDFPagesHaveRoundJoinsAndCaps(t *testing.T) {
	a := a4Archive(t, archive.Page{Data: v6Stroke(), DocPage: 0})
	r, _, err := generated(t, a)
	if err != nil {
		t.Fatal(err)
	}
	page, _ := r.GetPage(1)
	streams, err := page.GetAllContentStreams()
	if err != nil {
		t.Fatal(err)
	}
	// the default mitre join draws long spikes at sharp turns
	for _, op := range []string{"1 j", "1 J"} {
		if !strings.Contains(streams, op) {
			t.Errorf("missing %q in %q", op, streams)
		}
	}
}

// a4 with a crop box that leaves 100pt off the left and 50pt off the top
func croppedArchive(t *testing.T, pages ...archive.Page) *MyArchive {
	t.Helper()
	b, err := os.ReadFile("testdata/a4.pdf")
	if err != nil {
		t.Fatal(err)
	}
	r, err := pdf.NewPdfReader(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	p, _ := r.GetPage(1)
	mb, _ := p.GetMediaBox()
	p.CropBox = &pdf.PdfRectangle{Llx: mb.Llx + 100, Lly: mb.Lly, Urx: mb.Urx, Ury: mb.Ury - 50}
	w := pdf.NewPdfWriter()
	if err := w.AddPage(p); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := w.Write(&buf); err != nil {
		t.Fatal(err)
	}
	a := &MyArchive{PayloadReader: NewSeekCloser(buf.Bytes())}
	a.Pages = pages
	return a
}

// Ink is placed from the top left of the visible page, and x=0 of v6 pages is
// the middle of it. Cropping 100pt off the left moves the origin by +100 and
// the middle by -50, so the stroke moves by +50; 50pt off the top moves it
// down by 50 (-50 in PDF coordinates).
func TestStrokesStartAtTheTopLeftOfACroppedPage(t *testing.T) {
	plain, _, err := generated(t, a4Archive(t, archive.Page{Data: v6Stroke(), DocPage: 0}))
	if err != nil {
		t.Fatal(err)
	}
	cropped, _, err := generated(t, croppedArchive(t, archive.Page{Data: v6Stroke(), DocPage: 0}))
	if err != nil {
		t.Fatal(err)
	}
	first := func(r *pdf.PdfReader) (x, y float64) {
		page, _ := r.GetPage(1)
		s, _ := page.GetAllContentStreams()
		// the last path is the overlay; earlier ones belong to the PDF itself
		found := false
		for _, l := range strings.Split(s, "\n") {
			if strings.HasSuffix(l, " m") {
				var a, b float64
				if _, err := fmt.Sscanf(l, "%f %f m", &a, &b); err == nil {
					x, y, found = a, b, true
				}
			}
		}
		if !found {
			t.Fatalf("no path in %q", s)
		}
		return
	}
	px, py := first(plain)
	cx, cy := first(cropped)
	if !near2(cx-px, 50) || !near2(cy-py, -50) {
		t.Fatalf("plain (%v, %v) cropped (%v, %v): want the stroke moved by (+50, -50)", px, py, cx, cy)
	}
}

func near2(a, b float64) bool { return math.Abs(a-b) < 0.01 }
