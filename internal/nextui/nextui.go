// Package nextui serves the new progressive web app at the root of the site.
//
// It is deliberately independent of the old web UI: it takes the built files
// as an fs.FS and answers GET and HEAD requests that nothing else claimed.
package nextui

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	cacheNever     = "no-cache"
	cacheForever   = "public, max-age=31536000, immutable"
	cacheShort     = "public, max-age=3600"
	indexName      = "index.html"
	manifestName   = "manifest.webmanifest"
	manifestType   = "application/manifest+json"
	notBuiltPrompt = "The new web app has not been built. Run `pnpm build` in frontend-next, or use the Docker image."
)

// notMine are the prefixes that belong to the API and the old app, which must
// never be answered with the app shell
var notMine = []string{"/api", "/ui/api", "/legacy"}

// Handler serves the app. Files are served as they are, hashed build output
// with a far future cache, and any other path without a file extension gets
// the app shell so that client side routes work. Mount it on "/" and as the
// router's NoRoute handler, so registered routes always win.
func Handler(assets fs.FS) gin.HandlerFunc {
	h := handler{assets: http.FS(assets), files: assets}
	return h.serve
}

type handler struct {
	assets http.FileSystem
	files  fs.FS
}

func (h handler) serve(c *gin.Context) {
	if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	clean := path.Clean("/" + c.Request.URL.Path)
	for _, p := range notMine {
		if clean == p || strings.HasPrefix(clean, p+"/") {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
	}
	name := strings.TrimPrefix(clean, "/")
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
