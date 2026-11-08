package ui

import (
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

// legacyPrefix is where the old web app is served
const legacyPrefix = "/legacy"

func isLegacyPath(p string) bool {
	return p == legacyPrefix || strings.HasPrefix(p, legacyPrefix+"/")
}

// legacyHandler serves the old web app below /legacy: its files as they are,
// and its index.html for any other route, so client side routing works.
func (app *ReactAppWrapper) legacyHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		if c.Request.URL.Path == legacyPrefix {
			c.Redirect(http.StatusMovedPermanently, legacyPrefix+"/")
			return
		}
		name := path.Clean("/" + strings.TrimPrefix(c.Request.URL.Path, legacyPrefix))

		if name != "/" && path.Ext(name) != "" {
			// a file, which may be missing, but is never the shell
			app.serveLegacyFile(c, name)
			return
		}
		c.Header("Cache-Control", "no-cache")
		app.serveLegacyFile(c, "/index.html")
	}
}

// serveLegacyFile serves one file of the old build. It does not go through
// http.ServeFile, which redirects /index.html to ./
func (app *ReactAppWrapper) serveLegacyFile(c *gin.Context, name string) {
	f, err := app.fs.Open(name)
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	http.ServeContent(c.Writer, c.Request, name, info.ModTime(), f)
}
