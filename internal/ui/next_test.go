package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/gin-gonic/gin"
)

// the new app is the default, the old one lives under /legacy
func routedApp() (*gin.Engine, *ReactAppWrapper) {
	app := newTestApp()
	app.fs = http.FS(fstest.MapFS{
		"index.html":    {Data: []byte("<title>old shell</title>")},
		"assets/old.js": {Data: []byte("old js")},
		"favicon.ico":   {Data: []byte("old icon")},
	})
	app.next = fstest.MapFS{
		"index.html":           {Data: []byte("<title>new shell</title>")},
		"assets/new.js":        {Data: []byte("new js")},
		"favicon.ico":          {Data: []byte("new icon")},
		"manifest.webmanifest": {Data: []byte("{}")},
	}
	r := gin.New()
	// a registered route, like the device and sync endpoints
	r.GET("/token/json/2/device/new", func(c *gin.Context) { c.String(200, "device") })
	app.RegisterRoutes(r)
	return r, app
}

func fetch(r http.Handler, method, url string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(method, url, nil))
	return w
}

func TestTheNewAppIsServedAtTheRoot(t *testing.T) {
	r, _ := routedApp()
	for _, url := range []string{"/", "/documents", "/settings/devices", "/pair/app"} {
		w := fetch(r, http.MethodGet, url)
		if w.Code != 200 || !strings.Contains(w.Body.String(), "new shell") {
			t.Errorf("%s: %d %q", url, w.Code, w.Body.String())
		}
	}
}

func TestTheNewAppsAssetsComeFromTheNewBuild(t *testing.T) {
	r, _ := routedApp()
	for url, want := range map[string]string{"/assets/new.js": "new js", "/favicon.ico": "new icon"} {
		if w := fetch(r, http.MethodGet, url); w.Code != 200 || w.Body.String() != want {
			t.Errorf("%s: %d %q", url, w.Code, w.Body.String())
		}
	}
	// the old app's file is not reachable at the new app's asset path
	if w := fetch(r, http.MethodGet, "/assets/old.js"); w.Code != http.StatusNotFound {
		t.Errorf("old asset at /assets: %d", w.Code)
	}
}

func TestTheOldAppMovedToLegacy(t *testing.T) {
	r, _ := routedApp()
	for _, url := range []string{"/legacy/", "/legacy/documents", "/legacy/documents/abc", "/legacy/login"} {
		w := fetch(r, http.MethodGet, url)
		if w.Code != 200 || !strings.Contains(w.Body.String(), "old shell") {
			t.Errorf("%s: %d %q", url, w.Code, w.Body.String())
		}
	}
	if w := fetch(r, http.MethodGet, "/legacy/assets/old.js"); w.Code != 200 || w.Body.String() != "old js" {
		t.Errorf("legacy asset: %d %q", w.Code, w.Body.String())
	}
	if w := fetch(r, http.MethodGet, "/legacy/assets/missing.js"); w.Code != http.StatusNotFound {
		t.Errorf("missing legacy asset: %d", w.Code)
	}
}

func TestLegacyWithoutTheSlashRedirects(t *testing.T) {
	r, _ := routedApp()
	w := fetch(r, http.MethodGet, "/legacy")
	if w.Code != http.StatusMovedPermanently || w.Header().Get("Location") != "/legacy/" {
		t.Fatalf("%d %q", w.Code, w.Header().Get("Location"))
	}
}

func TestTheApiIsNeverTheShell(t *testing.T) {
	r, _ := routedApp()
	for _, url := range []string{"/api/nope", "/ui/api/nope"} {
		if w := fetch(r, http.MethodGet, url); w.Code != http.StatusNotFound {
			t.Errorf("%s: %d", url, w.Code)
		}
	}
}

func TestNonGetRequestsAreNotAnswered(t *testing.T) {
	r, _ := routedApp()
	for _, url := range []string{"/documents", "/legacy/documents"} {
		if w := fetch(r, http.MethodPost, url); w.Code != http.StatusNotFound {
			t.Errorf("POST %s: %d", url, w.Code)
		}
	}
}

func TestRegisteredRoutesAreNotSwallowed(t *testing.T) {
	r, _ := routedApp()
	if w := fetch(r, http.MethodGet, "/token/json/2/device/new"); w.Body.String() != "device" {
		t.Fatalf("%d %q", w.Code, w.Body.String())
	}
}

func TestAnUnbuiltNewAppSaysSo(t *testing.T) {
	_, app := routedApp()
	app.next = fstest.MapFS{".gitkeep": {}}
	r := gin.New()
	app.RegisterRoutes(r)
	if w := fetch(r, http.MethodGet, "/"); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("%d", w.Code)
	}
}
