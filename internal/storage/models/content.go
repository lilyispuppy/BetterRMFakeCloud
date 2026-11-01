package models

import (
	"encoding/json"
	"errors"
	"sort"
)

// This file reads a document's .content blob in full. It follows the
// structures used by ddvk/rmapi (archive.Content) and adds the extra fields
// that firmware 3.x writes. ContentFile, used when mirroring the tree, only
// needs a few of these, so this is a separate, richer reader.

// Tag is a document-level tag.
type Tag struct {
	Name      string `json:"name"`
	Timestamp int64  `json:"timestamp"`
}

// PageTag is a tag attached to a single page.
type PageTag struct {
	Name      string `json:"name"`
	PageID    string `json:"pageId"`
	Timestamp int64  `json:"timestamp"`
}

// CRDTString is a string value with its CRDT timestamp (firmware 3.x).
type CRDTString struct {
	Timestamp string `json:"timestamp"`
	Value     string `json:"value"`
}

// CRDTNumber is a numeric value with its CRDT timestamp (firmware 3.x).
type CRDTNumber struct {
	Timestamp string `json:"timestamp"`
	Value     int    `json:"value"`
}

// CPageEntry is one page in the firmware 3.x page list.
type CPageEntry struct {
	ID       string      `json:"id"`
	Idx      CRDTString  `json:"idx"`
	Template CRDTString  `json:"template"`
	Deleted  *CRDTNumber `json:"deleted,omitempty"`
	Redir    *CRDTNumber `json:"redir,omitempty"`
}

// CPages is the firmware 3.x page list.
type CPages struct {
	Pages []CPageEntry `json:"pages"`
}

// ContentDetails is everything we read from a .content file. Raw keeps the
// original JSON, so fields we do not model are not lost.
type ContentDetails struct {
	FileType             string         `json:"fileType"`
	FormatVersion        int            `json:"formatVersion"`
	Orientation          string         `json:"orientation"`
	PageCount            int            `json:"pageCount"`
	OriginalPageCount    int            `json:"originalPageCount"`
	LastOpenedPage       int            `json:"lastOpenedPage"`
	Margins              int            `json:"margins"`
	LineHeight           int            `json:"lineHeight"`
	TextScale            float64        `json:"textScale"`
	TextAlignment        string         `json:"textAlignment"`
	FontName             string         `json:"fontName"`
	SizeInBytes          string         `json:"sizeInBytes"`
	CoverPageNumber      *int           `json:"coverPageNumber,omitempty"`
	ViewBackgroundFilter *string        `json:"viewBackgroundFilter,omitempty"`
	DummyDocument        bool           `json:"dummyDocument"`
	Tags                 []Tag          `json:"tags"`
	PageTags             []PageTag      `json:"pageTags"`
	ExtraMetadata        map[string]any `json:"extraMetadata"`
	DocumentMetadata     map[string]any `json:"documentMetadata"`

	// legacy page list
	Pages              []string `json:"pages"`
	RedirectionPageMap []int    `json:"redirectionPageMap"`
	// firmware 3.x page list
	CPages *CPages `json:"cPages,omitempty"`

	Raw json.RawMessage `json:"-"`
}

// ParseContent reads a .content blob. A field with an unexpected type is
// skipped rather than failing the whole document; only broken JSON is an error.
func ParseContent(b []byte) (*ContentDetails, error) {
	if len(b) == 0 {
		return nil, errors.New("empty content")
	}
	c := &ContentDetails{}
	if err := json.Unmarshal(b, c); err != nil {
		var typeErr *json.UnmarshalTypeError
		if !errors.As(err, &typeErr) {
			return nil, err
		}
	}
	c.Raw = append(json.RawMessage(nil), b...)
	return c, nil
}

// TagNames returns the document tag names (never nil).
func (c *ContentDetails) TagNames() []string {
	names := make([]string, 0, len(c.Tags))
	for _, t := range c.Tags {
		names = append(names, t.Name)
	}
	return names
}

// PageInfo describes one page of a document.
type PageInfo struct {
	ID    string `json:"id"`
	Index int    `json:"index"`
	// DocPage is the page of the underlying PDF/epub, or -1 when there is none
	DocPage  int      `json:"docPage"`
	Template string   `json:"template,omitempty"`
	Tags     []string `json:"tags"`
}

// PageList returns the pages in reading order. Legacy documents use the pages
// list (mapped through redirectionPageMap when present); firmware 3.x documents
// use cPages, ordered by their CRDT index with deleted pages left out.
func (c *ContentDetails) PageList() []PageInfo {
	var pages []PageInfo

	switch {
	case len(c.Pages) > 0:
		for i, id := range c.Pages {
			docPage := i
			if len(c.RedirectionPageMap) == len(c.Pages) {
				docPage = c.RedirectionPageMap[i]
			}
			pages = append(pages, PageInfo{ID: id, Index: i, DocPage: docPage})
		}
	case c.CPages != nil && len(c.CPages.Pages) > 0:
		entries := make([]CPageEntry, len(c.CPages.Pages))
		copy(entries, c.CPages.Pages)
		sort.SliceStable(entries, func(i, j int) bool { return entries[i].Idx.Value < entries[j].Idx.Value })
		for _, e := range entries {
			if e.Deleted != nil {
				continue
			}
			docPage := -1
			if e.Redir != nil {
				docPage = e.Redir.Value
			}
			pages = append(pages, PageInfo{ID: e.ID, Index: len(pages), DocPage: docPage, Template: e.Template.Value})
		}
	}

	for i := range pages {
		pages[i].Tags = []string{}
		for _, t := range c.PageTags {
			if t.PageID == pages[i].ID {
				pages[i].Tags = append(pages[i].Tags, t.Name)
			}
		}
	}
	return pages
}
