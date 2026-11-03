//go:build cairo

package exporter

import (
	"bytes"
	"testing"
)

// needs a build with Cairo: go test -tags cairo
func TestRealRendererMakesAPDFFromV6Pages(t *testing.T) {
	a := &MyArchive{PageData: []PageData{{Raw: blankV6}, {ID: "never drawn"}, {Raw: blankV6}}}
	var out bytes.Buffer
	if err := RenderV6Notebook(a, V6, &out); err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(out.Bytes(), []byte("%PDF-")) {
		t.Fatalf("not a PDF: %q", out.Bytes()[:10])
	}
}

func TestRealRendererMakesAnSVGFromAV6Page(t *testing.T) {
	svg, err := V6.RenderSVG(blankV6)
	if err != nil || !bytes.Contains(svg, []byte("<svg")) {
		t.Fatalf("%v %q", err, svg)
	}
}
