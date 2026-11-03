package models

import (
	"encoding/json"
	"io"
	"path"
	"strings"

	"github.com/ddvk/rmfakecloud/internal/storage"
	"github.com/ddvk/rmfakecloud/internal/storage/exporter"
	"github.com/juruen/rmapi/archive"
	"github.com/juruen/rmapi/encoding/rm"
	log "github.com/sirupsen/logrus"
)

// ArchiveFromHashDoc reads an archive
func ArchiveFromHashDoc(doc *HashDoc, rs RemoteStorage) (*exporter.MyArchive, error) {
	uuid := doc.EntryName
	a := exporter.MyArchive{
		Zip: archive.Zip{
			UUID: uuid,
		},
	}

	var details *ContentDetails
	pageMap := make(map[string]string)
	for _, f := range doc.Files {
		filext := path.Ext(f.EntryName)
		name := strings.TrimSuffix(path.Base(f.EntryName), filext)
		switch filext {
		case storage.ContentFileExt:
			blob, err := rs.GetReader(f.Hash)
			if err != nil {
				return nil, err
			}
			contentBytes, err := io.ReadAll(blob)
			blob.Close()
			if err != nil {
				return nil, err
			}
			err = json.Unmarshal(contentBytes, &a.Content)
			if err != nil {
				return nil, err
			}
			details, err = ParseContent(contentBytes)
			if err != nil {
				return nil, err
			}
		case storage.EpubFileExt:
			fallthrough
		case storage.PdfFileExt:
			blob, err := rs.GetReader(f.Hash)
			if err != nil {
				return nil, err
			}
			//HACK:
			a.PayloadReader = blob.(io.ReadSeekCloser)

		case ".json":
			//metadata
		case storage.RmFileExt:
			log.Debug("adding page ", name)
			pageMap[name] = f.Hash
		}
	}

	if details == nil {
		return &a, nil
	}

	// firmware 3.x lists pages in cPages, older documents in pages
	for _, p := range details.PageList() {
		pd := exporter.PageData{ID: p.ID, DocPage: p.DocPage}
		page := archive.Page{Pagedata: "Blank", DocPage: p.DocPage}

		if hash, ok := pageMap[p.ID]; ok {
			log.Debug("page ", hash)
			reader, err := rs.GetReader(hash)
			if err != nil {
				return nil, err
			}
			pageBin, err := io.ReadAll(reader)
			reader.Close()
			if err != nil {
				return nil, err
			}
			pd.Raw = pageBin

			// rmapi cannot read everything (v6 text, for one): keep the raw
			// data and carry on without the parsed strokes
			rmpage := rm.New()
			if err := rmpage.UnmarshalBinary(pageBin); err != nil {
				log.Warnf("page %s of %s: rmapi cannot parse it: %v", p.ID, uuid, err)
			} else {
				page.Data = rmpage
			}
		}
		a.PageData = append(a.PageData, pd)
		a.Pages = append(a.Pages, page)
	}

	return &a, nil
}
