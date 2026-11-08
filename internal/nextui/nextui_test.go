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
	h := Handler(fsys)
	r.GET("/", h)
	r.NoRoute(h)
	return r
}

func get(r http.Handler, method, url string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(method, url, nil))
	return w
}

func TestRootServesTheShellUncached(t *testing.T) {
	w := get(router(assets()), http.MethodGet, "/")
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

func TestClientSideRoutesGetTheShell(t *testing.T) {
	for _, url := range []string{"/settings/devices", "/doc/123", "/share", "/settings/developer/logs", "/documents"} {
		w := get(router(assets()), http.MethodGet, url)
		if w.Code != 200 || w.Body.String() != shell {
			t.Errorf("%s: %d %q", url, w.Code, w.Body.String())
		}
	}
}

func TestHashedAssetsAreCachedForever(t *testing.T) {
	r := router(assets())
	for url, want := range map[string]string{
		"/assets/app-abc123.js":    "console.log(1)",
		"/assets/style-abc123.css": "body{}",
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
	for _, url := range []string{"/sw.js", "/manifest.webmanifest", "/registerSW.js", "/workbox-1a2b3c.js"} {
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
	w := get(router(assets()), http.MethodGet, "/manifest.webmanifest")
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/manifest+json") {
		t.Fatalf("Content-Type %q", ct)
	}
}

func TestOtherFilesAreServedWithAShortCache(t *testing.T) {
	w := get(router(assets()), http.MethodGet, "/icons/icon-192.png")
	if w.Code != 200 || w.Body.String() != "png" {
		t.Fatalf("%d %q", w.Code, w.Body.String())
	}
	if cc := w.Header().Get("Cache-Control"); cc != "public, max-age=3600" {
		t.Fatalf("Cache-Control %q", cc)
	}
}

func TestAMissingFileIsNotFoundNotTheShell(t *testing.T) {
	r := router(assets())
	for _, url := range []string{"/assets/gone.js", "/icons/nope.png", "/missing.map"} {
		if w := get(r, http.MethodGet, url); w.Code != http.StatusNotFound {
			t.Errorf("%s: got %d", url, w.Code)
		}
	}
}

func TestDirectoriesAreNotListed(t *testing.T) {
	w := get(router(assets()), http.MethodGet, "/assets/")
	if strings.Contains(w.Body.String(), "app-abc123.js") {
		t.Fatalf("listing leaked: %q", w.Body.String())
	}
}

func TestOnlyGetAndHeadAreAnswered(t *testing.T) {
	w := get(router(assets()), http.MethodPost, "/settings")
	if w.Code != http.StatusNotFound && w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST got %d", w.Code)
	}
	if w := get(router(assets()), http.MethodHead, "/"); w.Code != 200 {
		t.Fatalf("HEAD got %d", w.Code)
	}
}

func TestPathsCannotEscapeTheAssets(t *testing.T) {
	r := router(assets())
	for _, url := range []string{"/..%2f..%2fetc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/assets/..%2f..%2fgo.mod"} {
		w := get(r, http.MethodGet, url)
		if strings.Contains(w.Body.String(), "root:") || strings.Contains(w.Body.String(), "module ") {
			t.Errorf("%s leaked a file", url)
		}
	}
}

func TestAnUnbuiltFrontendSaysSo(t *testing.T) {
	empty := fstest.MapFS{".gitkeep": {Data: nil}}
	w := get(router(empty), http.MethodGet, "/")
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "not been built") {
		t.Fatalf("unhelpful body %q", w.Body.String())
	}
}

func TestOnlyGetAndHeadReachTheApp(t *testing.T) {
	for _, m := range []string{http.MethodPut, http.MethodDelete, http.MethodPatch} {
		if w := get(router(assets()), m, "/anything"); w.Code != http.StatusNotFound {
			t.Errorf("%s got %d", m, w.Code)
		}
	}
}

func TestTheApiPrefixesAreNeverTheShell(t *testing.T) {
	for _, url := range []string{"/api/nope", "/ui/api/nope", "/ui/api"} {
		w := get(router(assets()), http.MethodGet, url)
		if w.Code != http.StatusNotFound || strings.Contains(w.Body.String(), "<title>") {
			t.Errorf("%s: %d %q", url, w.Code, w.Body.String())
		}
	}
}

func TestLegacyIsNotTheNewAppsBusiness(t *testing.T) {
	if w := get(router(assets()), http.MethodGet, "/legacy/documents"); w.Code != http.StatusNotFound {
		t.Fatalf("got %d", w.Code)
	}
}
