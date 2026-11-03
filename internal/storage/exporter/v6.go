package exporter

import (
	"bytes"
	_ "embed"
	"errors"
	"fmt"
	"io"

	rmc "github.com/joagonca/rmc-go"
)

// blankV6 is an empty v6 scene, used for pages that were never drawn on (the
// tablet writes no .rm file for them)
//
//go:embed blank_v6.rm
var blankV6 []byte

// V6Renderer draws v6 (firmware 3.x) pages. It is an interface so that the
// renderer can be replaced.
type V6Renderer interface {
	// RenderPDF writes the pages, in order, as one PDF. Needs a Cairo build.
	RenderPDF(pages [][]byte, w io.Writer) error
	// RenderSVG draws a single page
	RenderSVG(page []byte) ([]byte, error)
}

// V6 is the renderer used for v6 pages
var V6 V6Renderer = rmcRenderer{}

// rmcRenderer uses joagonca/rmc-go. Its PDF output needs a build with
// -tags cairo, the SVG output does not.
type rmcRenderer struct{}

func (rmcRenderer) RenderPDF(pages [][]byte, w io.Writer) error {
	pdf, err := rmc.ConvertMultipleFromBytes(pages, nil)
	if err != nil {
		return fmt.Errorf("rendering v6 pages: %w", err)
	}
	_, err = io.Copy(w, bytes.NewReader(pdf))
	return err
}

func (rmcRenderer) RenderSVG(page []byte) ([]byte, error) {
	svg, err := rmc.ConvertFromBytes(page, rmc.FormatSVG, nil)
	if err != nil {
		return nil, fmt.Errorf("rendering v6 page: %w", err)
	}
	return svg, nil
}

// IsV6Notebook is true for a document of v6 pages that has no PDF or epub
// behind it. Those are drawn entirely by the v6 renderer.
func IsV6Notebook(a *MyArchive) bool {
	return a.PayloadReader == nil && DetectArchiveVersion(a) == VersionV6
}

// RenderV6Notebook writes all the pages of a v6 notebook as a PDF
func RenderV6Notebook(a *MyArchive, r V6Renderer, w io.Writer) error {
	if len(a.PageData) == 0 {
		return errors.New("the document has no pages")
	}
	pages := make([][]byte, 0, len(a.PageData))
	for _, p := range a.PageData {
		if p.Raw == nil {
			pages = append(pages, blankV6)
			continue
		}
		pages = append(pages, p.Raw)
	}
	return r.RenderPDF(pages, w)
}

// Render draws a document as a PDF with its annotations
func Render(a *MyArchive, w io.Writer) error {
	if IsV6Notebook(a) {
		return RenderV6Notebook(a, V6, w)
	}
	return RenderRmapi(a, w)
}
