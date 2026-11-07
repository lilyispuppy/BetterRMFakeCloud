package exporter

import "math"

// box is a PDF rectangle
type box struct{ llx, lly, urx, ury float64 }

// pageGeometry maps positions on the page as the tablet shows it (from the top
// left, in points) to the PDF's own coordinates. The tablet shows the crop box
// of a page, turned by its /Rotate, so a stroke is placed from the top left of
// that, not from the corner of the media box.
type pageGeometry struct {
	// Width and Height of the page as displayed
	Width, Height float64
	visible       box
	rotation      int
}

// newPageGeometry works out the displayed page from its media box, optional
// crop box and rotation (a multiple of 90 degrees)
func newPageGeometry(media box, crop *box, rotate int) pageGeometry {
	v := media
	if crop != nil {
		v = box{
			llx: math.Max(crop.llx, media.llx),
			lly: math.Max(crop.lly, media.lly),
			urx: math.Min(crop.urx, media.urx),
			ury: math.Min(crop.ury, media.ury),
		}
		if v.urx <= v.llx || v.ury <= v.lly {
			v = media
		}
	}
	rotate = ((rotate % 360) + 360) % 360

	w, h := v.urx-v.llx, v.ury-v.lly
	if rotate == 90 || rotate == 270 {
		w, h = h, w
	}
	return pageGeometry{Width: w, Height: h, visible: v, rotation: rotate}
}

// toUser converts a position (u across, v down) on the displayed page to
// PDF user space
func (g pageGeometry) toUser(u, v float64) (x, y float64) {
	b := g.visible
	switch g.rotation {
	case 90:
		return b.llx + v, b.lly + u
	case 180:
		return b.urx - u, b.lly + v
	case 270:
		return b.urx - v, b.ury - u
	}
	return b.llx + u, b.ury - v
}
