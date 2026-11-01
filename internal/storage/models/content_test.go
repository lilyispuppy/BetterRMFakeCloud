package models

import (
	"reflect"
	"strings"
	"testing"
)

// firmware 3.x notebook: pages live in cPages, with CRDT ordering
const notebookContent = `{
  "cPages": {
    "lastOpened": {"timestamp": "1:2", "value": "p2"},
    "original": {"timestamp": "0:0", "value": -1},
    "pages": [
      {"id": "p3", "idx": {"timestamp": "1:3", "value": "bc"}, "template": {"timestamp": "1:1", "value": "P Lines small"}},
      {"id": "p1", "idx": {"timestamp": "1:1", "value": "ba"}, "template": {"timestamp": "1:1", "value": "Blank"}},
      {"id": "gone", "idx": {"timestamp": "1:4", "value": "bb"}, "deleted": {"timestamp": "1:5", "value": 1}},
      {"id": "p2", "idx": {"timestamp": "1:2", "value": "bb"}, "template": {"timestamp": "1:1", "value": "Grid small"}}
    ]
  },
  "coverPageNumber": -1,
  "customZoomCenterX": 0,
  "documentMetadata": {"authors": ["me"], "title": "Notes"},
  "extraMetadata": {"LastPen": "Fineliner", "LastTool": "Fineliner"},
  "fileType": "notebook",
  "fontName": "",
  "formatVersion": 2,
  "lineHeight": -1,
  "margins": 125,
  "orientation": "portrait",
  "originalPageCount": -1,
  "pageCount": 3,
  "pageTags": [{"name": "todo", "pageId": "p2", "timestamp": 1700000000000}],
  "sizeInBytes": "12345",
  "tags": [{"name": "work", "timestamp": 1}, {"name": "Projects/2026", "timestamp": 2}],
  "textAlignment": "justify",
  "textScale": 1
}`

// older / PDF documents use pages plus a redirection map
const pdfContent = `{
  "fileType": "pdf",
  "orientation": "landscape",
  "pageCount": 3,
  "lastOpenedPage": 1,
  "pages": ["a", "b", "c"],
  "redirectionPageMap": [0, 2, -1],
  "textScale": 1.5,
  "coverPageNumber": 0,
  "viewBackgroundFilter": "off"
}`

func TestParseContentNotebook(t *testing.T) {
	c, err := ParseContent([]byte(notebookContent))
	if err != nil {
		t.Fatal(err)
	}
	if c.FileType != "notebook" || c.FormatVersion != 2 || c.Orientation != "portrait" ||
		c.PageCount != 3 || c.Margins != 125 || c.LineHeight != -1 || c.TextAlignment != "justify" ||
		c.SizeInBytes != "12345" || c.OriginalPageCount != -1 {
		t.Fatalf("scalar fields wrong: %+v", c)
	}
	if c.CoverPageNumber == nil || *c.CoverPageNumber != -1 {
		t.Fatalf("cover page: %v", c.CoverPageNumber)
	}
	if got := c.TagNames(); !reflect.DeepEqual(got, []string{"work", "Projects/2026"}) {
		t.Fatalf("tags: %v", got)
	}
	if len(c.PageTags) != 1 || c.PageTags[0].PageID != "p2" || c.PageTags[0].Name != "todo" {
		t.Fatalf("page tags: %+v", c.PageTags)
	}
	if c.ExtraMetadata["LastPen"] != "Fineliner" {
		t.Fatalf("extra metadata: %v", c.ExtraMetadata)
	}
	if c.DocumentMetadata["title"] != "Notes" {
		t.Fatalf("document metadata: %v", c.DocumentMetadata)
	}
}

func TestPageListFollowsCRDTOrderAndSkipsDeletedPages(t *testing.T) {
	c, _ := ParseContent([]byte(notebookContent))
	pages := c.PageList()

	var ids []string
	for _, p := range pages {
		ids = append(ids, p.ID)
	}
	if !reflect.DeepEqual(ids, []string{"p1", "p2", "p3"}) {
		t.Fatalf("order: %v", ids)
	}
	for i, p := range pages {
		if p.Index != i {
			t.Errorf("page %s index %d, want %d", p.ID, p.Index, i)
		}
		if p.DocPage != -1 {
			t.Errorf("a notebook page has no PDF page, got %d", p.DocPage)
		}
	}
	if pages[0].Template != "Blank" || pages[1].Template != "Grid small" {
		t.Fatalf("templates: %+v", pages)
	}
	if !reflect.DeepEqual(pages[1].Tags, []string{"todo"}) || len(pages[0].Tags) != 0 {
		t.Fatalf("page tags: %+v", pages)
	}
}

func TestPageListLegacyUsesRedirectionMap(t *testing.T) {
	c, err := ParseContent([]byte(pdfContent))
	if err != nil {
		t.Fatal(err)
	}
	if c.FileType != "pdf" || c.LastOpenedPage != 1 || c.TextScale != 1.5 {
		t.Fatalf("fields: %+v", c)
	}
	if c.CoverPageNumber == nil || *c.CoverPageNumber != 0 {
		t.Fatalf("cover page: %v", c.CoverPageNumber)
	}
	if c.ViewBackgroundFilter == nil || *c.ViewBackgroundFilter != "off" {
		t.Fatalf("background filter: %v", c.ViewBackgroundFilter)
	}

	pages := c.PageList()
	if len(pages) != 3 {
		t.Fatalf("got %d pages", len(pages))
	}
	want := []struct {
		id      string
		docPage int
	}{{"a", 0}, {"b", 2}, {"c", -1}}
	for i, w := range want {
		if pages[i].ID != w.id || pages[i].DocPage != w.docPage || pages[i].Index != i {
			t.Errorf("page %d: %+v, want %+v", i, pages[i], w)
		}
	}
}

func TestPageListLegacyWithoutRedirectionMapUsesPageIndex(t *testing.T) {
	c, _ := ParseContent([]byte(`{"pages": ["x", "y"], "pageCount": 2}`))
	pages := c.PageList()
	if len(pages) != 2 || pages[1].DocPage != 1 {
		t.Fatalf("got %+v", pages)
	}
}

func TestNoTagsAreAnEmptyNonNilSlice(t *testing.T) {
	c, err := ParseContent([]byte(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if c.TagNames() == nil || len(c.TagNames()) != 0 {
		t.Fatalf("want empty non-nil, got %#v", c.TagNames())
	}
	if len(c.PageList()) != 0 {
		t.Fatalf("no pages expected, got %v", c.PageList())
	}
	if c.CoverPageNumber != nil {
		t.Fatal("absent cover page must stay nil")
	}
}

func TestParseContentToleratesWrongFieldTypes(t *testing.T) {
	// a field with an unexpected type must not hide the rest of the document
	c, err := ParseContent([]byte(`{"fileType": "pdf", "textScale": "big", "pageCount": 4}`))
	if err != nil {
		t.Fatalf("type mismatches should not be fatal: %v", err)
	}
	if c.FileType != "pdf" || c.PageCount != 4 {
		t.Fatalf("lost valid fields: %+v", c)
	}
}

func TestParseContentRejectsInvalidJSON(t *testing.T) {
	if _, err := ParseContent([]byte(`{not json`)); err == nil {
		t.Fatal("expected an error")
	}
	if _, err := ParseContent(nil); err == nil {
		t.Fatal("empty content should be an error")
	}
}

func TestParseContentKeepsTheRawJSONIncludingUnknownFields(t *testing.T) {
	c, _ := ParseContent([]byte(notebookContent))
	if !strings.Contains(string(c.Raw), "customZoomCenterX") {
		t.Fatalf("raw lost unmodelled fields: %s", c.Raw)
	}
}
