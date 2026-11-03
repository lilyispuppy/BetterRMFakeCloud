package exporter

import "testing"

func header(v string) []byte {
	return []byte("reMarkable .lines file, version=" + v + "          rest of the file")
}

func TestDetectVersion(t *testing.T) {
	cases := []struct {
		name string
		data []byte
		want RmVersion
	}{
		{"v3", header("3"), VersionV3},
		{"v5", header("5"), VersionV5},
		{"v6", header("6"), VersionV6},
		{"v6 exactly the header", []byte("reMarkable .lines file, version=6          "), VersionV6},
		{"unknown version", header("7"), VersionUnknown},
		{"too short", []byte("reMarkable"), VersionUnknown},
		{"not an rm file", []byte("%PDF-1.7 and some more bytes to pass the length"), VersionUnknown},
		{"nil", nil, VersionUnknown},
	}
	for _, c := range cases {
		if got := DetectVersion(c.data); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestVersionString(t *testing.T) {
	if VersionV6.String() != "v6" || VersionUnknown.String() != "unknown" {
		t.Fatalf("%s %s", VersionV6, VersionUnknown)
	}
}

func TestDetectArchiveVersionUsesTheDrawnPages(t *testing.T) {
	a := &MyArchive{PageData: []PageData{
		{ID: "blank"},
		{ID: "p", Raw: header("6")},
	}}
	if got := DetectArchiveVersion(a); got != VersionV6 {
		t.Fatalf("got %v", got)
	}
	if got := DetectArchiveVersion(&MyArchive{PageData: []PageData{{ID: "blank"}}}); got != VersionUnknown {
		t.Fatalf("all blank: got %v", got)
	}
	// one v6 page makes the document v6: mixed documents render with the v6 path
	mixed := &MyArchive{PageData: []PageData{{Raw: header("5")}, {Raw: header("6")}}}
	if got := DetectArchiveVersion(mixed); got != VersionV6 {
		t.Fatalf("mixed: got %v", got)
	}
}
