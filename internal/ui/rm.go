package ui

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/ddvk/rmfakecloud/internal/common"
	"github.com/ddvk/rmfakecloud/internal/rmtools"
	"github.com/ddvk/rmfakecloud/internal/storage/models"
	"github.com/ddvk/rmfakecloud/internal/ui/viewmodel"
	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

// rmSource feeds rmtools from the blob storage
type rmSource struct {
	blobs interface {
		GetCachedTree(uid string) (*models.HashTree, error)
		LoadBlob(uid, blobid string) (io.ReadCloser, int64, int64, string, error)
	}
}

func (s rmSource) Tree(uid string) (*models.HashTree, error) { return s.blobs.GetCachedTree(uid) }

func (s rmSource) Blob(uid, hash string) (io.ReadCloser, error) {
	r, _, _, _, err := s.blobs.LoadBlob(uid, hash)
	return r, err
}

// registerRMRoutes adds the read-only rmapi style tools (ls, find, stat ...)
func (app *ReactAppWrapper) registerRMRoutes(g *gin.RouterGroup) {
	g.Use(app.requireSync15())
	g.GET("info", app.rmInfo)
	g.GET("tree", app.rmTree)
	g.GET("ls", app.rmLs)
	g.GET("find", app.rmFind)
	g.GET("stat", app.rmStat)
}

// requireSync15: the tools read the sync 1.5 hash tree, nothing else
func (app *ReactAppWrapper) requireSync15() gin.HandlerFunc {
	return func(c *gin.Context) {
		if v, ok := c.Get(backendVersionKey); !ok || v != common.Sync15 {
			c.AbortWithStatusJSON(http.StatusNotImplemented,
				viewmodel.NewErrorResponse("The explorer needs sync 1.5. Your account uses an older sync version."))
			return
		}
		c.Next()
	}
}

func (app *ReactAppWrapper) isDev(uid string) bool {
	user, err := app.userStorer.GetUser(uid)
	return err == nil && user != nil && user.Dev
}

func (app *ReactAppWrapper) rmFail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, rmtools.ErrNotFound):
		c.AbortWithStatusJSON(http.StatusNotFound, viewmodel.NewErrorResponse("Not found."))
	case errors.Is(err, rmtools.ErrInvalidPattern):
		c.AbortWithStatusJSON(http.StatusBadRequest, viewmodel.NewErrorResponse(err.Error()))
	default:
		log.Error("[ui] explorer: ", err)
		c.AbortWithStatusJSON(http.StatusInternalServerError, viewmodel.NewErrorResponse("Unable to read the synced data."))
	}
}

func queryPath(c *gin.Context) string {
	if p := c.Query("path"); p != "" {
		return p
	}
	return "/"
}

func (app *ReactAppWrapper) rmInfo(c *gin.Context) {
	uid := userID(c)
	info, err := app.rm.Info(uid)
	if err != nil {
		app.rmFail(c, err)
		return
	}
	if !app.isDev(uid) {
		info.RootHash = ""
	}
	c.JSON(http.StatusOK, struct {
		*rmtools.Info
		SyncVersion string `json:"syncVersion"`
		UserID      string `json:"userId"`
	}{info, "1.5", uid})
}

func (app *ReactAppWrapper) rmTree(c *gin.Context) {
	root, err := app.rm.Tree(userID(c))
	if err != nil {
		app.rmFail(c, err)
		return
	}
	c.JSON(http.StatusOK, root)
}

func (app *ReactAppWrapper) rmLs(c *gin.Context) {
	nodes, err := app.rm.Ls(userID(c), queryPath(c))
	if err != nil {
		app.rmFail(c, err)
		return
	}
	c.JSON(http.StatusOK, nodes)
}

func (app *ReactAppWrapper) rmFind(c *gin.Context) {
	opts := rmtools.FindOptions{
		Pattern: c.Query("pattern"),
		Tags:    c.QueryArray("tag"),
	}
	if s := c.Query("starred"); s != "" {
		starred, err := strconv.ParseBool(s)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, viewmodel.NewErrorResponse("starred must be true or false"))
			return
		}
		opts.Starred = &starred
	}
	nodes, err := app.rm.Find(userID(c), queryPath(c), opts)
	if err != nil {
		app.rmFail(c, err)
		return
	}
	c.JSON(http.StatusOK, nodes)
}

func (app *ReactAppWrapper) rmStat(c *gin.Context) {
	uid := userID(c)
	target := c.Query("id")
	if target == "" {
		target = c.Query("path")
	}
	if target == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, viewmodel.NewErrorResponse("path or id is required"))
		return
	}
	st, err := app.rm.Stat(uid, target)
	if err != nil {
		app.rmFail(c, err)
		return
	}
	if !app.isDev(uid) {
		// hashes and raw JSON are for developers
		st.Hash = ""
		st.RawMetadata = nil
		st.RawContent = nil
		for i := range st.Files {
			st.Files[i].Hash = ""
		}
	}
	c.JSON(http.StatusOK, st)
}
