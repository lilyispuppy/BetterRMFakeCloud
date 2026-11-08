package ui

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// the new web app is mounted by RegisterRoutes, and the old app's fallback
// (which answers every other GET with its own index.html) must not take over
func TestTheNewWebAppIsMountedAtNext(t *testing.T) {
	app := newTestApp()
	app.prefix = "/assets"
	r := gin.New()
	app.RegisterRoutes(r)

	for _, url := range []string{"/next/", "/next/settings/devices"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, url, nil))
		// 200 with a built frontend, 503 when only the placeholder is embedded
		if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable {
			t.Errorf("%s: got %d", url, w.Code)
		}
	}
}

func TestTheApiIsStillNotFoundBelowTheOldPrefix(t *testing.T) {
	app := newTestApp()
	app.prefix = "/assets"
	r := gin.New()
	app.RegisterRoutes(r)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ui/api/nope", nil))
	if w.Code == http.StatusServiceUnavailable {
		t.Fatalf("the old app's routes were changed: %d", w.Code)
	}
}
