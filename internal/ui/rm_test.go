package ui

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/ddvk/rmfakecloud/internal/common"
	"github.com/ddvk/rmfakecloud/internal/model"
	"github.com/ddvk/rmfakecloud/internal/rmtools"
	"github.com/ddvk/rmfakecloud/internal/storage/models"
	"github.com/gin-gonic/gin"
)

type fakeRMSource struct {
	tree  *models.HashTree
	blobs map[string]string
}

const v6Page = "reMarkable .lines file, version=6          "

func (f *fakeRMSource) Tree(uid string) (*models.HashTree, error) { return f.tree, nil }
func (f *fakeRMSource) Blob(uid, hash string) (io.ReadCloser, error) {
	if b, ok := f.blobs[hash]; ok {
		return io.NopCloser(strings.NewReader(b)), nil
	}
	return nil, errors.New("missing")
}

func rmDoc(id, name, parent string, t common.EntryType, pinned bool) *models.HashDoc {
	return &models.HashDoc{
		HashEntry: models.HashEntry{EntryName: id, Hash: "doc-" + id},
		Files: []*models.HashEntry{
			{EntryName: id + ".metadata", Hash: "meta-" + id, Size: 10},
			{EntryName: id + ".content", Hash: "content-" + id, Size: 20},
		},
		MetadataFile: models.MetadataFile{DocumentName: name, CollectionType: t, Parent: parent, Pinned: pinned},
	}
}

func rmRouter(version common.SyncVersion, uid string) (*gin.Engine, *ReactAppWrapper) {
	r, app, _ := rmRouterSrc(version, uid)
	return r, app
}

func rmRouterSrc(version common.SyncVersion, uid string) (*gin.Engine, *ReactAppWrapper, *fakeRMSource) {
	app := newTestApp(
		&model.User{ID: "dev", Dev: true},
		&model.User{ID: "plain"},
	)
	d1 := rmDoc("d1", "Notes", "f1", common.DocumentType, true)
	d1.Files = append(d1.Files, &models.HashEntry{EntryName: "d1/p1.rm", Hash: "rm-p1", Size: 5})
	src := &fakeRMSource{
		tree: &models.HashTree{
			Hash: "roothash", Generation: 3, SchemaVersion: "4",
			Docs: []*models.HashDoc{
				rmDoc("f1", "Work", "", common.CollectionType, false),
				d1,
			},
		},
		blobs: map[string]string{
			"content-d1": `{"fileType":"notebook","tags":[{"name":"work","timestamp":1}],
				"cPages":{"pages":[{"id":"p1","idx":{"value":"a"}},{"id":"p2","idx":{"value":"b"}}]}}`,
			"meta-d1": `{"visibleName":"Notes"}`,
			"rm-p1":   v6Page + "ink",
		},
	}
	app.rm = rmtools.New(src)
	r := gin.New()
	r.Use(asUser(uid, false), func(c *gin.Context) {
		c.Set(backendVersionKey, version)
	})
	app.registerRMRoutes(r.Group("/rm"))
	return r, app, src
}

func getJSON(t *testing.T, r http.Handler, url string, out any) int {
	t.Helper()
	w := do(r, http.MethodGet, url, nil)
	if out != nil && w.Code == http.StatusOK {
		if err := json.Unmarshal(w.Body.Bytes(), out); err != nil {
			t.Fatalf("%s: %v (%s)", url, err, w.Body.String())
		}
	}
	return w.Code
}

func TestRMLs(t *testing.T) {
	r, _ := rmRouter(common.Sync15, "plain")
	var nodes []rmtools.Node
	if code := getJSON(t, r, "/rm/ls?path=/Work", &nodes); code != 200 {
		t.Fatalf("status %d", code)
	}
	if len(nodes) != 1 || nodes[0].ID != "d1" || len(nodes[0].Tags) != 1 || !nodes[0].Starred {
		t.Fatalf("got %+v", nodes)
	}
	// path defaults to the root
	if code := getJSON(t, r, "/rm/ls", &nodes); code != 200 || len(nodes) != 2 {
		t.Fatalf("root: %d %+v", code, nodes)
	}
}

func TestRMLsMissingPathIs404(t *testing.T) {
	r, _ := rmRouter(common.Sync15, "plain")
	if code := getJSON(t, r, "/rm/ls?path=/nope", nil); code != http.StatusNotFound {
		t.Fatalf("status %d", code)
	}
}

func TestRMToolsNeedSync15(t *testing.T) {
	r, _ := rmRouter(common.Sync10, "plain")
	for _, url := range []string{"/rm/ls", "/rm/tree", "/rm/find", "/rm/stat?path=/", "/rm/info", "/rm/page?id=d1&page=0"} {
		w := do(r, http.MethodGet, url, nil)
		if w.Code != http.StatusNotImplemented || !strings.Contains(w.Body.String(), "1.5") {
			t.Errorf("%s: %d %s", url, w.Code, w.Body.String())
		}
	}
}

func TestRMFind(t *testing.T) {
	r, _ := rmRouter(common.Sync15, "plain")
	var nodes []rmtools.Node
	if code := getJSON(t, r, "/rm/find?pattern=Notes", &nodes); code != 200 || len(nodes) != 1 || nodes[0].Path != "/Work/Notes" {
		t.Fatalf("pattern: %d %+v", code, nodes)
	}
	if code := getJSON(t, r, "/rm/find?tag=nothing&tag=work", &nodes); code != 200 || len(nodes) != 1 {
		t.Fatalf("tags: %d %+v", code, nodes)
	}
	if code := getJSON(t, r, "/rm/find?starred=true", &nodes); code != 200 || len(nodes) != 1 {
		t.Fatalf("starred: %d %+v", code, nodes)
	}
	if code := getJSON(t, r, "/rm/find?starred=false", &nodes); code != 200 || len(nodes) != 1 || nodes[0].Name != "Work" {
		t.Fatalf("not starred: %d %+v", code, nodes)
	}
	if code := getJSON(t, r, "/rm/find?pattern=(", nil); code != http.StatusBadRequest {
		t.Fatalf("bad pattern status %d", code)
	}
	if code := getJSON(t, r, "/rm/find?starred=maybe", nil); code != http.StatusBadRequest {
		t.Fatalf("bad starred status %d", code)
	}
}

func TestRMStatByPathAndID(t *testing.T) {
	r, _ := rmRouter(common.Sync15, "plain")
	var st rmtools.Stat
	if code := getJSON(t, r, "/rm/stat?path=/Work/Notes", &st); code != 200 || st.ID != "d1" || st.FileType != "notebook" {
		t.Fatalf("by path: %d %+v", code, st)
	}
	if code := getJSON(t, r, "/rm/stat?id=d1", &st); code != 200 || st.Path != "/Work/Notes" {
		t.Fatalf("by id: %d %+v", code, st)
	}
	if code := getJSON(t, r, "/rm/stat", nil); code != http.StatusBadRequest {
		t.Fatalf("no target status %d", code)
	}
	if code := getJSON(t, r, "/rm/stat?id=zzz", nil); code != http.StatusNotFound {
		t.Fatalf("missing status %d", code)
	}
}

func TestRMStatHidesInternalsFromNonDevUsers(t *testing.T) {
	r, _ := rmRouter(common.Sync15, "plain")
	var st rmtools.Stat
	getJSON(t, r, "/rm/stat?path=/Work/Notes", &st)
	if st.Hash != "" || st.RawContent != nil || st.RawMetadata != nil {
		t.Fatalf("leaked dev details: %+v", st)
	}
	for _, f := range st.Files {
		if f.Hash != "" {
			t.Fatalf("file hash leaked: %+v", f)
		}
	}
	if len(st.Files) != 3 || st.Files[0].Name == "" || st.TotalSize != 35 {
		t.Fatalf("files should still be listed: %+v", st.Files)
	}
}

func TestRMStatShowsInternalsToDevUsers(t *testing.T) {
	r, _ := rmRouter(common.Sync15, "dev")
	var st rmtools.Stat
	getJSON(t, r, "/rm/stat?path=/Work/Notes", &st)
	if st.Hash != "doc-d1" || st.RawContent == nil || st.RawMetadata == nil || st.Files[0].Hash == "" {
		t.Fatalf("missing dev details: %+v", st)
	}
}

func TestRMInfo(t *testing.T) {
	r, _ := rmRouter(common.Sync15, "plain")
	var info struct {
		rmtools.Info
		SyncVersion string `json:"syncVersion"`
		UserID      string `json:"userId"`
	}
	if code := getJSON(t, r, "/rm/info", &info); code != 200 {
		t.Fatalf("status %d", code)
	}
	if info.Generation != 3 || info.Documents != 1 || info.Folders != 1 || info.SchemaVersion != "4" ||
		info.SyncVersion != "1.5" || info.UserID != "plain" {
		t.Fatalf("info: %+v", info)
	}
	if info.RootHash != "" {
		t.Fatalf("root hash is for developers: %q", info.RootHash)
	}

	r, _ = rmRouter(common.Sync15, "dev")
	getJSON(t, r, "/rm/info", &info)
	if info.RootHash != "roothash" {
		t.Fatalf("dev should see the root hash, got %q", info.RootHash)
	}
}

func TestRMTree(t *testing.T) {
	r, _ := rmRouter(common.Sync15, "plain")
	var root rmtools.Node
	if code := getJSON(t, r, "/rm/tree", &root); code != 200 {
		t.Fatalf("status %d", code)
	}
	if len(root.Children) != 2 { // Work, trash
		t.Fatalf("root: %+v", root)
	}
}

func stubRenderer(app *ReactAppWrapper, calls *int, err error) {
	app.renderPage = func(raw []byte) ([]byte, error) {
		*calls++
		if err != nil {
			return nil, err
		}
		return []byte("<svg>stub:" + string(raw[len(v6Page):]) + "</svg>"), nil
	}
}

func TestRMPageRendersAV6PageAsSVG(t *testing.T) {
	r, app := rmRouter(common.Sync15, "plain")
	calls := 0
	stubRenderer(app, &calls, nil)
	w := do(r, http.MethodGet, "/rm/page?id=d1&page=0", nil)
	if w.Code != 200 || w.Body.String() != "<svg>stub:ink</svg>" {
		t.Fatalf("%d %q", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "image/svg+xml") {
		t.Fatalf("content type %q", ct)
	}
	// by path as well
	if w := do(r, http.MethodGet, "/rm/page?path=/Work/Notes&page=0", nil); w.Code != 200 {
		t.Fatalf("by path: %d", w.Code)
	}
}

func TestRMPageOfABlankPageNeedsNoRenderer(t *testing.T) {
	r, app := rmRouter(common.Sync15, "plain")
	calls := 0
	stubRenderer(app, &calls, nil)
	w := do(r, http.MethodGet, "/rm/page?id=d1&page=1", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "<svg") || calls != 0 {
		t.Fatalf("%d %q calls=%d", w.Code, w.Body.String(), calls)
	}
}

func TestRMPageErrors(t *testing.T) {
	r, app, src := rmRouterSrc(common.Sync15, "plain")
	calls := 0
	stubRenderer(app, &calls, nil)

	for url, want := range map[string]int{
		"/rm/page?id=d1&page=9":   http.StatusNotFound,
		"/rm/page?id=nope&page=0": http.StatusNotFound,
		"/rm/page?id=d1&page=x":   http.StatusBadRequest,
		"/rm/page?id=d1":          http.StatusBadRequest,
		"/rm/page?page=0":         http.StatusBadRequest,
	} {
		if w := do(r, http.MethodGet, url, nil); w.Code != want {
			t.Errorf("%s: got %d want %d", url, w.Code, want)
		}
	}

	// pages from before firmware 3 are not drawn by the v6 renderer
	src.blobs["rm-p1"] = "reMarkable .lines file, version=5          ink"
	if w := do(r, http.MethodGet, "/rm/page?id=d1&page=0", nil); w.Code != http.StatusUnsupportedMediaType {
		t.Errorf("v5 page: got %d", w.Code)
	}
}

func TestRMPageRendererFailureIsAJSONError(t *testing.T) {
	r, app := rmRouter(common.Sync15, "plain")
	calls := 0
	stubRenderer(app, &calls, errors.New("cairo exploded"))
	w := do(r, http.MethodGet, "/rm/page?id=d1&page=0", nil)
	if w.Code != http.StatusInternalServerError || !strings.Contains(w.Body.String(), `"error"`) {
		t.Fatalf("%d %q", w.Code, w.Body.String())
	}
}
