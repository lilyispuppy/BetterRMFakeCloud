// Package nextui serves the new progressive web app at /next.
//
// It is deliberately independent of the existing web UI: it takes the built
// files as an fs.FS, answers only below /next, and shares nothing with the old
// app's routing except being registered on the same router.
package nextui

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// Prefix is where the app is served
const Prefix = "/next"

const (
	cacheNever     = "no-cache"
	cacheForever   = "public, max-age=31536000, immutable"
	cacheShort     = "public, max-age=3600"
	indexName      = "index.html"
	manifestName   = "manifest.webmanifest"
	manifestType   = "application/manifest+json"
	notBuiltPrompt = "The new web app has not been built. Run `pnpm build` in frontend-next, or use the Docker image."
)

// Register serves assets below /next. Files are served as they are, hashed
// build output with a far future cache, and any other path without a file
// extension gets the app shell so that client side routes work.
func Register(router *gin.Engine, assets fs.FS) {
	h := handler{assets: http.FS(assets), files: assets}

	router.GET(Prefix, func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, Prefix+"/")
	})
	router.Match([]string{http.MethodGet, http.MethodHead}, Prefix+"/*filepath", h.serve)
}

type handler struct {
	assets http.FileSystem
	files  fs.FS
}

func (h handler) serve(c *gin.Context) {
	name := strings.TrimPrefix(path.Clean("/"+c.Param("filepath")), "/")
	if name == "" {
		name = indexName
	}
	if !fs.ValidPath(name) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	if info, err := fs.Stat(h.files, name); err == nil && !info.IsDir() {
		h.send(c, name, cacheFor(name))
		return
	}

	// a path that looks like a file, but is not one
	if name != indexName && path.Ext(name) != "" {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	// a client side route: the app shell
	if _, err := fs.Stat(h.files, indexName); err != nil {
		c.String(http.StatusServiceUnavailable, notBuiltPrompt)
		c.Abort()
		return
	}
	h.send(c, indexName, cacheNever)
}

func (h handler) send(c *gin.Context, name, cache string) {
	f, err := h.assets.Open(name)
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	defer f.Close()

	c.Header("Cache-Control", cache)
	if name == manifestName {
		c.Header("Content-Type", manifestType)
	}
	http.ServeContent(c.Writer, c.Request, name, time.Time{}, f)
}

// cacheFor decides how long a browser may keep a file. The files that decide
// what the app is (shell, service worker, manifest) must always be revalidated;
// build output with a hash in its name never changes.
func cacheFor(name string) string {
	base := path.Base(name)
	switch {
	case name == indexName, name == manifestName, base == "sw.js", base == "registerSW.js", strings.HasPrefix(base, "workbox-"):
		return cacheNever
	case strings.HasPrefix(name, "assets/"):
		return cacheForever
	}
	return cacheShort
}
