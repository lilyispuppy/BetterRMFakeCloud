package exporter

import (
	"errors"
	"fmt"
	"io"
	"math"

	"github.com/juruen/rmapi/encoding/rm"
	"github.com/sirupsen/logrus"
	"github.com/unidoc/unipdf/v3/annotator"
	"github.com/unidoc/unipdf/v3/contentstream"
	"github.com/unidoc/unipdf/v3/contentstream/draw"
	"github.com/unidoc/unipdf/v3/core"
	"github.com/unidoc/unipdf/v3/creator"
	pdf "github.com/unidoc/unipdf/v3/model"
)

const (
	DeviceWidth  = 1404
	DeviceHeight = 1872
)

var rmPageSize = creator.PageSize{445, 594}

type PdfGenerator struct {
	options   PdfGeneratorOptions
	pdfReader *pdf.PdfReader
	template  bool
}

type PdfGeneratorOptions struct {
	AddPageNumbers  bool
	AllPages        bool
	AnnotationsOnly bool //export the annotations without the background/pdf
}

func normalized(p1 rm.Point, scale, xShift float64) (float64, float64) {
	return float64(p1.X)*scale + xShift, float64(p1.Y) * scale
}

// pageScale converts device pixels to PDF points. Strokes of v6 pages on a
// PDF are at the device's 226 DPI and centred on the page (the v6 parser adds
// half the device width to x), so they need a shift as well.
func pageScale(v6Pdf bool, width, height float64) (scale, xShift float64) {
	if v6Pdf {
		scale = 72.0 / 226.0
		xShift = width/2 - float64(rm.Width)/2*scale
		return
	}
	if height/width < 1.33 {
		return width / DeviceWidth, 0
	}
	return height / DeviceHeight, 0
}

// backgroundPageNumber is the 1 based page of the source PDF for a page's
// DocPage; 0 means there is none and the page is blank
func backgroundPageNumber(docPage int) int {
	if docPage < 0 {
		return 0
	}
	return docPage + 1
}

func (p *PdfGenerator) Generate(zip *MyArchive, output io.Writer, options PdfGeneratorOptions) (err error) {

	p.options = options

	if len(zip.Pages) == 0 {
		if zip.PayloadReader != nil {
			_, err := io.Copy(output, zip.PayloadReader)
			return err
		}

		return errors.New("the document has no pages")
	}

	if err = p.initBackgroundPages(zip.PayloadReader); err != nil {
		return err
	}

	c := creator.New()
	if p.template {
		// use the standard page size
		c.SetPageSize(rmPageSize)
	}

	if p.pdfReader != nil && p.options.AllPages {
		logrus.Info("generating all pages")
		outlines := p.pdfReader.GetOutlineTree()
		c.SetOutlineTree(outlines)
	}

	for _, pageAnnotations := range zip.Pages {
		hasContent := pageAnnotations.Data != nil

		// For PDFs, always include all pages so the full document is
		// preserved with annotations overlaid. For notebooks (no source
		// PDF), skip blank pages unless AllPages is set.
		if !hasContent && !p.options.AllPages && p.pdfReader == nil {
			continue
		}
		//1 based, redirected page
		pageNum := backgroundPageNumber(pageAnnotations.DocPage)

		page, geo, err := p.addBackgroundPage(c, pageNum)
		if err != nil {
			return err
		}

		if page == nil {
			return errors.New("page is null")
		}
		if !hasContent {
			continue
		}

		isV6Pdf := pageAnnotations.Data.Version == rm.V6 && pageAnnotations.DocPage >= 0 && p.pdfReader != nil
		scale, xShift := pageScale(isV6Pdf, geo.Width, geo.Height)

		contentCreator := contentstream.NewContentCreator()
		contentCreator.Add_q()

		for _, layer := range pageAnnotations.Data.Layers {
			for _, line := range layer.Lines {
				if len(line.Points) < 1 {
					continue
				}
				if line.BrushType == rm.Eraser {
					continue
				}

				if line.BrushType == rm.HighlighterV5 {
					last := len(line.Points) - 1
					x1, y1 := normalized(line.Points[0], scale, xShift)
					x2, _ := normalized(line.Points[last], scale, xShift)
					// make horizontal lines only, use y1
					width := scale * 30
					y1 += width / 2

					ux1, uy1 := geo.toUser(x1-1, y1)
					ux2, uy2 := geo.toUser(x2, y1)
					lineDef := annotator.LineAnnotationDef{X1: ux1, Y1: uy1, X2: ux2, Y2: uy2}
					r, g, b := highlightRGB(line.BrushColor, nil)
					lineDef.LineColor = pdf.NewPdfColorDeviceRGB(r, g, b)
					lineDef.Opacity = 0.5
					lineDef.LineWidth = width
					ann, err := annotator.CreateLineAnnotation(lineDef)
					if err != nil {
						return err
					}
					page.AddAnnotation(ann)
				} else {
					path := draw.NewPath()
					for i := 0; i < len(line.Points); i++ {
						x1, y1 := normalized(line.Points[i], scale, xShift)
						ux, uy := geo.toUser(x1, y1)
						path = path.AppendPoint(draw.NewPoint(ux, uy))
					}

					var lineWidth float64
					if pageAnnotations.Data.Version == rm.V6 {
						// v6: per-point Width is in device pixels; average and scale to PDF points.
						var totalW float64
						for _, pt := range line.Points {
							totalW += float64(pt.Width)
						}
						lineWidth = totalW / float64(len(line.Points)) * scale
					} else {
						lineWidth = float64(line.BrushSize*6.0 - 10.8)
					}
					if lineWidth < 0.1 {
						lineWidth = 0.1
					}
					contentCreator.Add_w(lineWidth)
					// round joins and caps; the PDF default is a mitre join,
					// which draws long spikes at sharp turns
					contentCreator.AddOperand(contentstream.ContentStreamOperation{Operand: "j", Params: []core.PdfObject{core.MakeInteger(1)}})
					contentCreator.AddOperand(contentstream.ContentStreamOperation{Operand: "J", Params: []core.PdfObject{core.MakeInteger(1)}})

					switch line.BrushColor {
					case rm.Black:
						contentCreator.Add_rg(1.0, 1.0, 1.0)
					case rm.White:
						contentCreator.Add_rg(0.0, 0.0, 0.0)
					case rm.Grey:
						contentCreator.Add_rg(0.8, 0.8, 0.8)
					case rm.Blue:
						contentCreator.Add_rg(0.0, 0.38, 0.8)
					case rm.Red:
						contentCreator.Add_rg(0.85, 0.03, 0.03)
					}

					//TODO: use bezier
					draw.DrawPathWithCreator(path, contentCreator)

					contentCreator.Add_S()
				}
			}
		}
		for _, hl := range pageAnnotations.Data.Highlights {
			for _, rect := range hl.Rects {
				// Highlight rects don't have the +Width/2 X offset that strokes do;
				// for v6 PDF pages, x=0 is at the horizontal center of the page.
				hlXOff := xShift
				if isV6Pdf {
					hlXOff = geo.Width / 2
				}
				u1 := rect.X*scale + hlXOff
				u2 := (rect.X+rect.W)*scale + hlXOff
				vTop := rect.Y * scale
				vBottom := (rect.Y + rect.H) * scale
				x1, y2 := geo.toUser(u1, vBottom)
				x2, y1 := geo.toUser(u2, vTop)

				lineDef := annotator.LineAnnotationDef{X1: x1, Y1: y2, X2: x2, Y2: y1}
				r, g, b := highlightRGB(hl.Color, hl.ColorRGBA)
				lineDef.LineColor = pdf.NewPdfColorDeviceRGB(r, g, b)
				lineDef.Opacity = 0.3
				lineDef.LineWidth = math.Abs(vBottom - vTop)
				ann, err := annotator.CreateLineAnnotation(lineDef)
				if err != nil {
					continue
				}
				page.AddAnnotation(ann)
			}
		}

		contentCreator.Add_Q()
		drawingOperations := contentCreator.Operations().String()
		pageContentStreams, err := page.GetAllContentStreams()
		if err != nil {
			return err
		}
		//hack: wrap the page content in a context to prevent transformation matrix misalignment
		wrapper := []string{"q", pageContentStreams, "Q", drawingOperations}
		page.SetContentStreams(wrapper, core.NewFlateEncoder())
	}

	return c.Write(output)
}

func (p *PdfGenerator) initBackgroundPages(r io.ReadSeeker) error {
	if r != nil {
		pdfReader, err := pdf.NewPdfReader(r)
		if err != nil {
			return err
		}

		encrypted, err := pdfReader.IsEncrypted()
		if err != nil {
			return nil
		}
		if encrypted {
			valid, err := pdfReader.Decrypt([]byte(""))
			if err != nil {
				return err
			}
			if !valid {
				return fmt.Errorf("cannot decrypt")
			}

		}

		p.pdfReader = pdfReader
		p.template = false
		return nil
	}

	logrus.Info("template")
	p.template = true
	return nil
}

func (p *PdfGenerator) addBackgroundPage(c *creator.Creator, pageNum int) (*pdf.PdfPage, pageGeometry, error) {
	var page *pdf.PdfPage
	var geo pageGeometry

	// if the page number is 0 the page is empty
	if !p.template && !p.options.AnnotationsOnly && pageNum > 0 {
		tmpPage, err := p.pdfReader.GetPage(pageNum)
		if err != nil {
			return nil, geo, err
		}
		mbox, err := tmpPage.GetMediaBox()
		if err != nil {
			return nil, geo, err
		}

		var crop *box
		if cb := tmpPage.CropBox; cb != nil {
			crop = &box{cb.Llx, cb.Lly, cb.Urx, cb.Ury}
		}
		rotate := 0
		if tmpPage.Rotate != nil {
			rotate = int(*tmpPage.Rotate)
		}
		geo = newPageGeometry(box{mbox.Llx, mbox.Lly, mbox.Urx, mbox.Ury}, crop, rotate)

		// use the pdf's page size
		c.SetPageSize(creator.PageSize{mbox.Urx - mbox.Llx, mbox.Ury - mbox.Lly})
		c.AddPage(tmpPage)
		page = tmpPage
	} else {
		page = c.NewPage()
		geo = newPageGeometry(box{0, 0, c.Width(), c.Height()}, nil, 0)
	}

	if p.options.AddPageNumbers {
		c.DrawFooter(func(block *creator.Block, args creator.FooterFunctionArgs) {
			p := c.NewParagraph(fmt.Sprintf("%d", args.PageNum))
			p.SetFontSize(8)
			w := block.Width() - 20
			h := block.Height() - 10
			p.SetPos(w, h)
			block.Draw(p)
		})
	}
	return page, geo, nil
}

// highlightRGB resolves a v6 highlight color to RGB components in [0,1].
// rgba (when non-nil) overrides the enum and carries an explicit color from
// firmware 3.6+. Falls back to yellow for unknown codes.
func highlightRGB(c rm.BrushColor, rgba *[4]uint8) (r, g, b float64) {
	if rgba != nil {
		return float64(rgba[0]) / 255, float64(rgba[1]) / 255, float64(rgba[2]) / 255
	}
	switch c {
	case rm.HighlightYellow, rm.Yellow2:
		return 1.0, 0.93, 0.0
	case rm.HighlightGreen, rm.Green2:
		return 0.36, 0.86, 0.36
	case rm.HighlightPink, rm.Magenta:
		return 1.0, 0.45, 0.75
	case rm.Blue, rm.Cyan:
		return 0.40, 0.75, 1.0
	case rm.Red:
		return 1.0, 0.45, 0.45
	case rm.Black, rm.Grey, rm.GreyOverlap:
		return 0.7, 0.7, 0.7
	}
	return 1.0, 0.93, 0.0
}
