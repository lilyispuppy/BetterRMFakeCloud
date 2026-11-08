package nextui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/gin-gonic/gin"
)

const shell = "<!doctype html><title>next</title>"

func assets() fstest.MapFS {
	return fstest.MapFS{
		"index.html":              {Data: []byte(shell)},
		"sw.js":                   {Data: []byte("// service worker")},
		"manifest.webmanifest":    {Data: []byte(`{"name":"x"}`)},
		"assets/app-abc123.js":    {Data: []byte("console.log(1)")},
		"assets/style-abc123.css": {Data: []byte("body{}")},
		"icons/icon-192.png":      {Data: []byte("png")},
		"registerSW.js":           {Data: []byte("// register")},
		"workbox-1a2b3c.js":       {Data: []byte("// workbox")},
	}
}

func router(fsys fstest.MapFS) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// like the existing app, which answers unknown GETs with its own index.html
	r.NoRoute(func(c *gin.Context) {
		if c.Request.Method != http.MethodGet {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		c.String(http.StatusOK, "old app")
	})
	Register(r, fsys)
	return r
}

func get(r http.Handler, method, url string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(method, url, nil))
	return w
}

func TestRootServesTheShellUncached(t *testing.T) {
	w := get(router(assets()), http.MethodGet, "/next/")
	if w.Code != 200 || w.Body.String() != shell {
		t.Fatalf("%d %q", w.Code, w.Body.String())
	}
	if cc := w.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Fatalf("Cache-Control %q", cc)
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Fatalf("Content-Type %q", ct)
	}
}

func TestWithoutTheTrailingSlashItRedirects(t *testing.T) {
	w := get(router(assets()), http.MethodGet, "/next")
	if w.Code != http.StatusMovedPermanently && w.Code != http.StatusPermanentRedirect {
		t.Fatalf("got %d", w.Code)
	}
	if loc := w.Header().Get("Location"); loc != "/next/" {
		t.Fatalf("Location %q", loc)
	}
}

func TestClientSideRoutesGetTheShell(t *testing.T) {
	for _, url := range []string{"/next/settings/devices", "/next/doc/123", "/next/share", "/next/settings/developer/logs"} {
		w := get(router(assets()), http.MethodGet, url)
		if w.Code != 200 || w.Body.String() != shell {
			t.Errorf("%s: %d %q", url, w.Code, w.Body.String())
		}
	}
}

func TestHashedAssetsAreCachedForever(t *testing.T) {
	r := router(assets())
	for url, want := range map[string]string{
		"/next/assets/app-abc123.js":    "console.log(1)",
		"/next/assets/style-abc123.css": "body{}",
	} {
		w := get(r, http.MethodGet, url)
		if w.Code != 200 || w.Body.String() != want {
			t.Fatalf("%s: %d %q", url, w.Code, w.Body.String())
		}
		if cc := w.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
			t.Errorf("%s: Cache-Control %q", url, cc)
		}
	}
}

func TestTheServiceWorkerAndManifestAreNeverCached(t *testing.T) {
	r := router(assets())
	for _, url := range []string{"/next/sw.js", "/next/manifest.webmanifest", "/next/registerSW.js", "/next/workbox-1a2b3c.js"} {
		w := get(r, http.MethodGet, url)
		if w.Code != 200 {
			t.Fatalf("%s: %d", url, w.Code)
		}
		if cc := w.Header().Get("Cache-Control"); cc != "no-cache" {
			t.Errorf("%s: Cache-Control %q", url, cc)
		}
	}
}

func TestTheManifestHasItsOwnContentType(t *testing.T) {
	w := get(router(assets()), http.MethodGet, "/next/manifest.webmanifest")
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/manifest+json") {
		t.Fatalf("Content-Type %q", ct)
	}
}

func TestOtherFilesAreServedWithAShortCache(t *testing.T) {
	w := get(router(assets()), http.MethodGet, "/next/icons/icon-192.png")
	if w.Code != 200 || w.Body.String() != "png" {
		t.Fatalf("%d %q", w.Code, w.Body.String())
	}
	if cc := w.Header().Get("Cache-Control"); cc != "public, max-age=3600" {
		t.Fatalf("Cache-Control %q", cc)
	}
}

func TestAMissingFileIsNotFoundNotTheShell(t *testing.T) {
	r := router(assets())
	for _, url := range []string{"/next/assets/gone.js", "/next/icons/nope.png", "/next/missing.map"} {
		if w := get(r, http.MethodGet, url); w.Code != http.StatusNotFound {
			t.Errorf("%s: got %d", url, w.Code)
		}
	}
}

func TestDirectoriesAreNotListed(t *testing.T) {
	w := get(router(assets()), http.MethodGet, "/next/assets/")
	if strings.Contains(w.Body.String(), "app-abc123.js") {
		t.Fatalf("listing leaked: %q", w.Body.String())
	}
}

func TestOnlyGetAndHeadAreAnswered(t *testing.T) {
	w := get(router(assets()), http.MethodPost, "/next/settings")
	if w.Code != http.StatusNotFound && w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST got %d", w.Code)
	}
	if w := get(router(assets()), http.MethodHead, "/next/"); w.Code != 200 {
		t.Fatalf("HEAD got %d", w.Code)
	}
}

func TestPathsCannotEscapeTheAssets(t *testing.T) {
	r := router(assets())
	for _, url := range []string{"/next/..%2f..%2fetc/passwd", "/next/%2e%2e/%2e%2e/etc/passwd", "/next/assets/..%2f..%2fgo.mod"} {
		w := get(r, http.MethodGet, url)
		if strings.Contains(w.Body.String(), "root:") || strings.Contains(w.Body.String(), "module ") {
			t.Errorf("%s leaked a file", url)
		}
	}
}

func TestAnUnbuiltFrontendSaysSo(t *testing.T) {
	empty := fstest.MapFS{".gitkeep": {Data: nil}}
	w := get(router(empty), http.MethodGet, "/next/")
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "not been built") {
		t.Fatalf("unhelpful body %q", w.Body.String())
	}
}

func TestTheOldAppIsLeftAlone(t *testing.T) {
	r := router(assets())
	if w := get(r, http.MethodGet, "/some/old/route"); w.Body.String() != "old app" {
		t.Fatalf("the old app's fallback was changed: %q", w.Body.String())
	}
	if w := get(r, http.MethodGet, "/nextish"); w.Body.String() != "old app" {
		t.Fatalf("/nextish should not be served by the new app: %q", w.Body.String())
	}
}
