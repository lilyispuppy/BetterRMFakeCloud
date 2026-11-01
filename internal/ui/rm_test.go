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

type fakeRMSource struct{ tree *models.HashTree }

func (f *fakeRMSource) Tree(uid string) (*models.HashTree, error) { return f.tree, nil }
func (f *fakeRMSource) Blob(uid, hash string) (io.ReadCloser, error) {
	blobs := map[string]string{
		"content-d1": `{"fileType":"notebook","tags":[{"name":"work","timestamp":1}]}`,
		"meta-d1":    `{"visibleName":"Notes"}`,
	}
	if b, ok := blobs[hash]; ok {
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
	app := newTestApp(
		&model.User{ID: "dev", Dev: true},
		&model.User{ID: "plain"},
	)
	app.rm = rmtools.New(&fakeRMSource{tree: &models.HashTree{
		Hash: "roothash", Generation: 3, SchemaVersion: "4",
		Docs: []*models.HashDoc{
			rmDoc("f1", "Work", "", common.CollectionType, false),
			rmDoc("d1", "Notes", "f1", common.DocumentType, true),
		},
	}})
	r := gin.New()
	r.Use(asUser(uid, false), func(c *gin.Context) {
		c.Set(backendVersionKey, version)
	})
	app.registerRMRoutes(r.Group("/rm"))
	return r, app
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
	for _, url := range []string{"/rm/ls", "/rm/tree", "/rm/find", "/rm/stat?path=/", "/rm/info"} {
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
	if len(st.Files) != 2 || st.Files[0].Name == "" || st.TotalSize != 30 {
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
