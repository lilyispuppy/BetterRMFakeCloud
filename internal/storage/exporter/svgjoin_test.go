package exporter

import (
	"strings"
	"testing"
)

func TestRoundJoinsAreAddedToEveryPolyline(t *testing.T) {
	in := `<g><polyline style="fill:none" points="0,0 1,1"/>` + "\n" + `<polyline style="fill:none" stroke-linecap="round" points="1,1 2,0"/></g>`
	out := string(roundJoins([]byte(in)))
	if n := strings.Count(out, `stroke-linejoin="round"`); n != 2 {
		t.Fatalf("want 2 round joins, got %d: %s", n, out)
	}
	if !strings.Contains(out, `points="1,1 2,0"`) {
		t.Fatal("the points were changed")
	}
}

func TestRoundJoinsLeavesOtherSVGAlone(t *testing.T) {
	in := `<svg><text>polyline</text><rect/></svg>`
	if out := string(roundJoins([]byte(in))); out != in {
		t.Fatalf("changed: %s", out)
	}
}
