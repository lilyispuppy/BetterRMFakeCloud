package exporter

import "testing"

func pt(t *testing.T, g pageGeometry, u, v, wantX, wantY float64) {
	t.Helper()
	x, y := g.toUser(u, v)
	if !near(x, wantX) || !near(y, wantY) {
		t.Errorf("toUser(%v, %v) = (%v, %v), want (%v, %v)", u, v, x, y, wantX, wantY)
	}
}

func TestGeometryOfAPlainPage(t *testing.T) {
	g := newPageGeometry(box{0, 0, 600, 800}, nil, 0)
	if g.Width != 600 || g.Height != 800 {
		t.Fatalf("size %vx%v", g.Width, g.Height)
	}
	pt(t, g, 0, 0, 0, 800) // the top left of the page
	pt(t, g, 10, 20, 10, 780)
}

func TestGeometryStartsAtTheTopLeftOfTheCropBox(t *testing.T) {
	g := newPageGeometry(box{0, 0, 600, 800}, &box{20, 30, 580, 770}, 0)
	if g.Width != 560 || g.Height != 740 {
		t.Fatalf("size %vx%v", g.Width, g.Height)
	}
	pt(t, g, 0, 0, 20, 770)
	pt(t, g, 10, 5, 30, 765)
}

func TestGeometryHonoursAMediaBoxThatDoesNotStartAtZero(t *testing.T) {
	g := newPageGeometry(box{-50, -100, 550, 700}, nil, 0)
	pt(t, g, 0, 0, -50, 700)
}

func TestGeometryCropBoxIsLimitedToTheMediaBox(t *testing.T) {
	g := newPageGeometry(box{0, 0, 600, 800}, &box{-10, -10, 700, 900}, 0)
	if g.Width != 600 || g.Height != 800 {
		t.Fatalf("size %vx%v", g.Width, g.Height)
	}
}

func TestGeometryOfRotatedPages(t *testing.T) {
	m, c := box{0, 0, 600, 800}, &box{20, 30, 580, 770}

	g := newPageGeometry(m, c, 90)
	if g.Width != 740 || g.Height != 560 {
		t.Fatalf("90: size %vx%v", g.Width, g.Height)
	}
	pt(t, g, 0, 0, 20, 30)
	pt(t, g, 10, 5, 25, 40)

	g = newPageGeometry(m, c, 180)
	if g.Width != 560 || g.Height != 740 {
		t.Fatalf("180: size %vx%v", g.Width, g.Height)
	}
	pt(t, g, 0, 0, 580, 30)
	pt(t, g, 10, 5, 570, 35)

	g = newPageGeometry(m, c, 270)
	if g.Width != 740 || g.Height != 560 {
		t.Fatalf("270: size %vx%v", g.Width, g.Height)
	}
	pt(t, g, 0, 0, 580, 770)
	pt(t, g, 10, 5, 575, 760)
}

func TestGeometryNormalisesRotation(t *testing.T) {
	m := box{0, 0, 600, 800}
	a := newPageGeometry(m, nil, -90)
	b := newPageGeometry(m, nil, 270)
	if a != b {
		t.Fatalf("-90 and 270 differ: %+v %+v", a, b)
	}
	if c := newPageGeometry(m, nil, 360); c != newPageGeometry(m, nil, 0) {
		t.Fatal("360 should be 0")
	}
}
