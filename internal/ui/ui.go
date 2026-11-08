package ui

import (
	"io"
	"io/fs"
	iofs "io/fs"
	"net/http"
	"path/filepath"
	"time"

	"github.com/ddvk/rmfakecloud/internal/app/hub"
	"github.com/ddvk/rmfakecloud/internal/app/passcodestore"
	"github.com/ddvk/rmfakecloud/internal/common"
	"github.com/ddvk/rmfakecloud/internal/config"
	"github.com/ddvk/rmfakecloud/internal/devices"
	"github.com/ddvk/rmfakecloud/internal/logbuf"
	"github.com/ddvk/rmfakecloud/internal/messages"
	"github.com/ddvk/rmfakecloud/internal/rmtools"
	"github.com/ddvk/rmfakecloud/internal/screenshare"
	"github.com/ddvk/rmfakecloud/internal/storage"
	"github.com/ddvk/rmfakecloud/internal/storage/exporter"
	"github.com/ddvk/rmfakecloud/internal/storage/models"
	"github.com/ddvk/rmfakecloud/internal/thumbnails"
	"github.com/ddvk/rmfakecloud/internal/ui/viewmodel"
	webui "github.com/ddvk/rmfakecloud/ui"
	"github.com/gin-gonic/gin"
)

type backend interface {
	GetDocumentTree(uid string) (tree *viewmodel.DocumentTree, err error)
	Export(uid, doc, exporttype string, opt storage.ExportOption) (stream io.ReadCloser, err error)
	CreateDocument(uid, name, parent string, stream io.Reader) (doc *storage.Document, err error)
	CreateFolder(uid, name, parent string) (doc *storage.Document, err error)
	UpdateDocument(uid, docID, name, parent string) (err error)
	DeleteDocument(uid, docID string) (err error)
	Sync(uid string)
}
type codeGenerator interface {
	NewCode(string) (string, error)
}

type documentHandler interface {
	CreateDocument(uid, name, parent string, stream io.Reader) (doc *storage.Document, err error)
	CreateFolder(uid, name, parent string) (doc *storage.Document, err error)
	GetAllMetadata(uid string) (documents []*messages.RawMetadata, err error)
	ExportDocument(uid, id, format string, exportOption storage.ExportOption) (stream io.ReadCloser, err error)
	GetMetadata(uid, id string) (*messages.RawMetadata, error)
	UpdateMetadata(uid string, r *messages.RawMetadata) error
	RemoveDocument(uid, docid string) error
}

type blobHandler interface {
	GetCachedTree(uid string) (tree *models.HashTree, err error)
	LoadBlob(uid, blobid string) (reader io.ReadCloser, gen int64, size int64, hash string, err error)
	CreateBlobDocument(uid, name, parent string, reader io.Reader) (doc *storage.Document, err error)
	UpdateBlobDocument(uid, docID, name, parent string) (err error)
	DeleteBlobDocument(uid, docID string) (err error)
	CreateBlobFolder(uid, name, parent string) (doc *storage.Document, err error)
	Export(uid, docid string) (io.ReadCloser, error)
	ExportRmDoc(uid, docid string) (io.ReadCloser, error)
}

type notificationHub interface {
	Deleted(uid, docID string) error
	Added(uid, docID string) error
	Updated(uid, docID string) error
	Sync(uid string) error
}

type mqttBridge interface {
	PublishSignaling(userID, clientID string, payload []byte)
	HasConnectedClient(userID string) bool
}

// ReactAppWrapper encapsulates an app
type ReactAppWrapper struct {
	fs            http.FileSystem // the old web app's build, served under /legacy
	next          iofs.FS         // the new web app's build, served at the root; nil means the embedded one
	cfg           *config.Config
	userStorer    storage.UserStorer
	codeConnector codeGenerator
	h             *hub.Hub
	passcodeStore passcodestore.Store
	backends      map[common.SyncVersion]backend
	roomManager   *screenshare.RoomManager
	mqtt          mqttBridge
	logs          *logbuf.Buffer
	devices       deviceLister
	online        onlineChecker
	rm            *rmtools.Service
	// renderPage draws a v6 page as an SVG
	renderPage func(raw []byte) ([]byte, error)
	// thumbs keeps pictures of the first page of documents; nil switches them off
	thumbs *thumbnails.Store
}

type deviceLister interface {
	List(uid string) ([]devices.Device, error)
	ListAll() (map[string][]devices.Device, error)
}

type onlineChecker interface {
	ConnectedDevices(uid string) []string
}

const jsBuildFolder = "dist"

// New Create a React app
func New(cfg *config.Config,
	userStorer storage.UserStorer,
	codeConnector codeGenerator,
	h *hub.Hub,
	pcStore passcodestore.Store,
	docHandler documentHandler,
	blobHandler blobHandler,
	roomManager *screenshare.RoomManager,
	mqttBroker mqttBridge,
	deviceStore deviceLister) *ReactAppWrapper {

	sub, err := fs.Sub(webui.Assets, jsBuildFolder)
	if err != nil {
		panic("not embedded?")
	}
	backend15 := &backend15{
		blobHandler: blobHandler,
		h:           h,
	}
	backend10 := &backend10{
		documentHandler: docHandler,
		hub:             h,
	}
	staticWrapper := ReactAppWrapper{
		fs:            common.NewLastModifiedFS(http.FS(sub), time.Now()),
		cfg:           cfg,
		userStorer:    userStorer,
		codeConnector: codeConnector,
		h:             h,
		passcodeStore: pcStore,
		backends: map[common.SyncVersion]backend{
			common.Sync10: backend10,
			common.Sync15: backend15,
		},
		roomManager: roomManager,
		mqtt:        mqttBroker,
		logs:        logbuf.Default(),
		devices:     deviceStore,
		online:      h,
		rm:          rmtools.New(rmSource{blobs: blobHandler}),
		renderPage: func(raw []byte) ([]byte, error) {
			return exporter.V6.RenderSVG(raw)
		},
		thumbs: thumbnails.New(filepath.Join(cfg.DataDir, "thumbnails"), thumbnails.Pdftoppm),
	}
	return &staticWrapper
}

func badReq(c *gin.Context, message string) {
	c.AbortWithStatusJSON(http.StatusBadRequest, viewmodel.NewErrorResponse(message))
}
