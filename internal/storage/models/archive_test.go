package models

import (
	"bytes"
	"fmt"
	"io"
	"testing"
)

type memStorage map[string][]byte

func (m memStorage) GetRootIndex() (string, int64, error) { return "", 0, nil }
func (m memStorage) GetReader(hash string) (io.ReadCloser, error) {
	b, ok := m[hash]
	if !ok {
		return nil, fmt.Errorf("no blob %s", hash)
	}
	return &seekCloser{Reader: bytes.NewReader(b)}, nil
}

type seekCloser struct{ *bytes.Reader }

func (*seekCloser) Close() error { return nil }

// archiveFixture builds a document with the given .content and page blobs
// (page id -> bytes). Pages not listed have no .rm file.
func archiveFixture(content string, pages map[string][]byte, extra ...*HashEntry) (*HashDoc, memStorage) {
	store := memStorage{"content-h": []byte(content)}
	doc := &HashDoc{HashEntry: HashEntry{EntryName: "doc1"}}
	doc.Files = append(doc.Files, &HashEntry{EntryName: "doc1.content", Hash: "content-h"})
	for id, b := range pages {
		h := "rm-" + id
		store[h] = b
		doc.Files = append(doc.Files, &HashEntry{EntryName: "doc1/" + id + ".rm", Hash: h})
	}
	doc.Files = append(doc.Files, extra...)
	return doc, store
}

const v6Header = "reMarkable .lines file, version=6          "

func TestArchiveUsesCPagesOrderSkipsDeletedAndKeepsBlankPages(t *testing.T) {
	content := `{"fileType":"notebook","cPages":{"pages":[
		{"id":"p2","idx":{"value":"bb"}},
		{"id":"gone","idx":{"value":"bc"},"deleted":{"value":1}},
		{"id":"p3","idx":{"value":"bd"}},
		{"id":"p1","idx":{"value":"ba"}}]}}`
	doc, store := archiveFixture(content, map[string][]byte{
		"p1":   []byte(v6Header + "one"),
		"p2":   []byte(v6Header + "two"),
		"gone": []byte(v6Header + "deleted"),
	})

	a, err := ArchiveFromHashDoc(doc, store)
	if err != nil {
		t.Fatal(err)
	}
	if len(a.PageData) != 3 {
		t.Fatalf("got %d pages: %+v", len(a.PageData), a.PageData)
	}
	wantIDs := []string{"p1", "p2", "p3"}
	for i, id := range wantIDs {
		if a.PageData[i].ID != id {
			t.Errorf("page %d is %s, want %s", i, a.PageData[i].ID, id)
		}
	}
	if string(a.PageData[0].Raw) != v6Header+"one" || string(a.PageData[1].Raw) != v6Header+"two" {
		t.Fatalf("raw data not kept: %q %q", a.PageData[0].Raw, a.PageData[1].Raw)
	}
	if a.PageData[2].Raw != nil {
		t.Fatal("a page that was never drawn on is blank (nil Raw)")
	}
	if a.PageData[0].DocPage != -1 {
		t.Fatalf("notebook pages have no PDF page, got %d", a.PageData[0].DocPage)
	}
	if len(a.Pages) != 3 {
		t.Fatalf("legacy Pages must keep every page, got %d", len(a.Pages))
	}
}

func TestArchiveUnparseablePageDoesNotFailTheDocument(t *testing.T) {
	doc, store := archiveFixture(`{"cPages":{"pages":[{"id":"p1","idx":{"value":"a"}}]}}`,
		map[string][]byte{"p1": []byte("not an rm file")})
	a, err := ArchiveFromHashDoc(doc, store)
	if err != nil {
		t.Fatal(err)
	}
	if len(a.PageData) != 1 || string(a.PageData[0].Raw) != "not an rm file" {
		t.Fatalf("got %+v", a.PageData)
	}
	if a.Pages[0].Data != nil {
		t.Fatal("unparseable page should have no parsed data")
	}
}

func TestArchiveLegacyPagesAndRedirection(t *testing.T) {
	content := `{"fileType":"pdf","pages":["a","b","c"],"redirectionPageMap":[0,2,-1]}`
	doc, store := archiveFixture(content, map[string][]byte{"b": []byte("b-data")})

	a, err := ArchiveFromHashDoc(doc, store)
	if err != nil {
		t.Fatal(err)
	}
	if len(a.PageData) != 3 {
		t.Fatalf("got %d", len(a.PageData))
	}
	if a.PageData[1].ID != "b" || a.PageData[1].DocPage != 2 || string(a.PageData[1].Raw) != "b-data" {
		t.Fatalf("page b: %+v", a.PageData[1])
	}
	if a.PageData[0].Raw != nil || a.PageData[2].DocPage != -1 {
		t.Fatalf("a: %+v c: %+v", a.PageData[0], a.PageData[2])
	}
}

func TestArchiveCPagesRedirGivesThePDFPage(t *testing.T) {
	content := `{"fileType":"pdf","cPages":{"pages":[
		{"id":"p1","idx":{"value":"a"},"redir":{"value":4}}]}}`
	doc, store := archiveFixture(content, map[string][]byte{"p1": []byte("x")})
	a, _ := ArchiveFromHashDoc(doc, store)
	if a.PageData[0].DocPage != 4 {
		t.Fatalf("got %d", a.PageData[0].DocPage)
	}
}

func TestArchiveWithoutPagesIsEmptyNotAnError(t *testing.T) {
	doc, store := archiveFixture(`{"fileType":"pdf"}`, nil)
	a, err := ArchiveFromHashDoc(doc, store)
	if err != nil || len(a.PageData) != 0 || len(a.Pages) != 0 {
		t.Fatalf("got %+v, %v", a, err)
	}
}

func TestArchiveKeepsThePDFPayload(t *testing.T) {
	doc, store := archiveFixture(`{"fileType":"pdf"}`, nil,
		&HashEntry{EntryName: "doc1.pdf", Hash: "pdf-h"})
	store["pdf-h"] = []byte("%PDF-1.4")
	a, err := ArchiveFromHashDoc(doc, store)
	if err != nil || a.PayloadReader == nil {
		t.Fatalf("payload: %v %v", a.PayloadReader, err)
	}
}
