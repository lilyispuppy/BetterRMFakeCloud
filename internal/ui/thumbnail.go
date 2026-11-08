package ui

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/ddvk/rmfakecloud/internal/common"
	"github.com/ddvk/rmfakecloud/internal/thumbnails"
	"github.com/ddvk/rmfakecloud/internal/ui/viewmodel"
	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

// pdfSource is how a thumbnail gets its document: the PDF with the
// annotations merged in, the same as the download
func (app *ReactAppWrapper) pdfSource(b backend, uid, docid string) thumbnails.Source {
	return func() ([]byte, error) {
		r, err := b.Export(uid, docid, "pdf", 0)
		if err != nil {
			return nil, err
		}
		defer r.Close()
		return io.ReadAll(r)
	}
}

// getThumbnail answers with a small picture of the first page. The version in
// the query is the document's modification time; it names the picture in the
// store and lets the browser keep it for good.
func (app *ReactAppWrapper) getThumbnail(c *gin.Context) {
	if app.thumbs == nil {
		c.AbortWithStatusJSON(http.StatusNotImplemented, viewmodel.NewErrorResponse("Thumbnails are not enabled."))
		return
	}
	uid := userID(c)
	docid := common.ParamS(docIDParam, c)
	version := c.Query("v")
	cacheable := version != ""
	if !cacheable {
		version = "0"
	}

	key := thumbnails.Key{User: uid, Doc: docid, Version: version}
	img, err := app.thumbs.Get(c.Request.Context(), key, app.pdfSource(app.getBackend(c), uid, docid))
	switch {
	case errors.Is(err, thumbnails.ErrBadKey):
		c.AbortWithStatusJSON(http.StatusBadRequest, viewmodel.NewErrorResponse("Not a valid document id or version."))
		return
	case errors.Is(err, thumbnails.ErrUnavailable):
		c.AbortWithStatusJSON(http.StatusNotImplemented, viewmodel.NewErrorResponse("This server cannot draw thumbnails."))
		return
	case err != nil:
		log.Debug("[ui] thumbnail of ", docid, ": ", err)
		c.AbortWithStatusJSON(http.StatusNotFound, viewmodel.NewErrorResponse("No preview is available for this document."))
		return
	}

	if cacheable {
		c.Header("Cache-Control", "private, max-age=31536000, immutable")
	} else {
		c.Header("Cache-Control", "private, no-cache")
	}
	c.Data(http.StatusOK, "image/jpeg", img)
}

// thumbnailItems lists the documents in a tree, folders included
func thumbnailItems(entries []viewmodel.Entry, into []thumbnails.Item) []thumbnails.Item {
	for _, e := range entries {
		switch v := e.(type) {
		case *viewmodel.Directory:
			into = thumbnailItems(v.Entries, into)
		case *viewmodel.Document:
			into = append(into, thumbnails.Item{Doc: v.ID, Version: thumbnailVersion(v)})
		}
	}
	return into
}

// thumbnailVersion is what the web app also sends as v: the modification time
// in milliseconds
func thumbnailVersion(d *viewmodel.Document) string {
	return strconv.FormatInt(d.LastModified.UnixMilli(), 10)
}

// warmThumbnails starts drawing the missing thumbnails of a library
func (app *ReactAppWrapper) warmThumbnails(b backend, uid string, tree *viewmodel.DocumentTree) {
	if app.thumbs == nil || tree == nil {
		return
	}
	items := thumbnailItems(tree.Entries, nil)
	app.thumbs.Warm(uid, items, func(doc string) thumbnails.Source { return app.pdfSource(b, uid, doc) })
}
