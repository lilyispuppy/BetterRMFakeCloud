package exporter

import (
	"io"

	"github.com/juruen/rmapi/archive"
	"github.com/juruen/rmapi/log"
)

// rmapi's logging stuff
func init() {
	log.InitLog()
}

// PageData is one page of a document, in reading order
type PageData struct {
	ID string
	// DocPage is the page of the underlying PDF, or -1 when there is none
	DocPage int
	// Raw is the page's .rm file; nil for a page that was never drawn on
	Raw []byte
}

// MyArchive but having the payload reader
type MyArchive struct {
	archive.Zip
	PayloadReader io.ReadSeekCloser
	// PageData lists every page in order, including blank ones. Zip.Pages
	// holds the same pages parsed by rmapi (Data is nil when rmapi cannot
	// read the file, e.g. v6).
	PageData []PageData
}

func (f *MyArchive) Close() {
	if f.PayloadReader != nil {
		f.PayloadReader.Close()
	}
}
