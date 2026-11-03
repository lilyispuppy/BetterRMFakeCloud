package rmtools

import (
	"errors"
	"io"
	"reflect"
	"strings"
	"testing"

	"github.com/ddvk/rmfakecloud/internal/common"
	"github.com/ddvk/rmfakecloud/internal/storage/models"
)

type fakeSource struct {
	tree  *models.HashTree
	blobs map[string]string
	reads map[string]int
	err   error
}

func (f *fakeSource) Tree(uid string) (*models.HashTree, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.tree, nil
}

func (f *fakeSource) Blob(uid, hash string) (io.ReadCloser, error) {
	f.reads[hash]++
	b, ok := f.blobs[hash]
	if !ok {
		return nil, errors.New("no such blob")
	}
	return io.NopCloser(strings.NewReader(b)), nil
}

func doc(id, name, parent string, t common.EntryType, pinned bool) *models.HashDoc {
	return &models.HashDoc{
		HashEntry: models.HashEntry{EntryName: id, Hash: "doc-" + id},
		Files: []*models.HashEntry{
			{EntryName: id + ".metadata", Hash: "meta-" + id, Size: 100},
			{EntryName: id + ".content", Hash: "content-" + id, Size: 200},
			{EntryName: id + ".pdf", Hash: "pdf-" + id, Size: 5000},
		},
		MetadataFile: models.MetadataFile{
			DocumentName:   name,
			CollectionType: t,
			Parent:         parent,
			LastModified:   "1700000000000",
			LastOpenedPage: 2,
			Version:        7,
			Pinned:         pinned,
		},
	}
}

func fixture() (*Service, *fakeSource) {
	src := &fakeSource{
		tree: &models.HashTree{
			Hash:          "roothash",
			Generation:    42,
			SchemaVersion: "4",
			Docs: []*models.HashDoc{
				doc("d3", "Todo", "", common.DocumentType, false),
				doc("f1", "Work", "", common.CollectionType, false),
				doc("d2", "Spec", "f1", common.DocumentType, false),
				doc("d1", "Notes", "f1", common.DocumentType, true),
				doc("d4", "Old", "trash", common.DocumentType, false),
			},
		},
		blobs: map[string]string{
			"content-d1": `{"fileType":"notebook","formatVersion":2,"pageCount":2,"tags":[{"name":"work","timestamp":1}],
				"cPages":{"pages":[{"id":"p1","idx":{"value":"ba"}},{"id":"p2","idx":{"value":"bb"}}]}}`,
			"content-d2": `{"fileType":"pdf","pageCount":10,"tags":[{"name":"ref","timestamp":1}]}`,
			"content-d3": `{"fileType":"notebook","tags":[]}`,
			"content-d4": `{}`,
			"content-f1": `{"tags":[]}`,
			"meta-d1":    `{"visibleName":"Notes","type":"DocumentType"}`,
		},
		reads: map[string]int{},
	}
	// d1 has one drawn page (p1) and one that was never drawn on (p2)
	d1 := src.tree.Docs[3]
	d1.Files = append(d1.Files, &models.HashEntry{EntryName: "d1/p1.rm", Hash: "rm-p1", Size: 9})
	src.blobs["rm-p1"] = "page-one!"
	return New(src), src
}

func names(nodes []Node) []string {
	var out []string
	for _, n := range nodes {
		out = append(out, n.Name)
	}
	return out
}

func TestLsRootListsFoldersDocumentsAndTrashByName(t *testing.T) {
	s, _ := fixture()
	nodes, err := s.Ls("u", "/")
	if err != nil {
		t.Fatal(err)
	}
	if got := names(nodes); !reflect.DeepEqual(got, []string{"Todo", "trash", "Work"}) {
		t.Fatalf("got %v", got)
	}
	if nodes[1].Type != common.CollectionType || nodes[1].ID != "trash" {
		t.Fatalf("trash node: %+v", nodes[1])
	}
}

func TestLsFolderGivesRmapiNodeFields(t *testing.T) {
	s, _ := fixture()
	nodes, err := s.Ls("u", "/Work")
	if err != nil {
		t.Fatal(err)
	}
	if got := names(nodes); !reflect.DeepEqual(got, []string{"Notes", "Spec"}) {
		t.Fatalf("got %v", got)
	}
	n := nodes[0]
	if n.ID != "d1" || n.Type != common.DocumentType || n.Version != 7 || n.CurrentPage != 2 ||
		n.Parent != "f1" || !n.Starred || n.ModifiedClient != "2023-11-14T22:13:20Z" {
		t.Fatalf("node: %+v", n)
	}
	if !reflect.DeepEqual(n.Tags, []string{"work"}) {
		t.Fatalf("tags: %v", n.Tags)
	}
	if nodes[1].Starred || !reflect.DeepEqual(nodes[1].Tags, []string{"ref"}) {
		t.Fatalf("second node: %+v", nodes[1])
	}
}

func TestLsOfADocumentReturnsThatDocument(t *testing.T) {
	s, _ := fixture()
	nodes, err := s.Ls("u", "/Work/Notes")
	if err != nil || len(nodes) != 1 || nodes[0].ID != "d1" {
		t.Fatalf("got %+v, %v", nodes, err)
	}
}

func TestLsTrashAndMissingPaths(t *testing.T) {
	s, _ := fixture()
	nodes, err := s.Ls("u", "/trash")
	if err != nil || !reflect.DeepEqual(names(nodes), []string{"Old"}) {
		t.Fatalf("trash: %v %v", names(nodes), err)
	}
	if _, err := s.Ls("u", "/nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
	if _, err := s.Ls("u", "/Work/Notes/deeper"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestPathsToleratesMissingLeadingAndTrailingSlashes(t *testing.T) {
	s, _ := fixture()
	for _, p := range []string{"Work", "/Work/", "Work/"} {
		nodes, err := s.Ls("u", p)
		if err != nil || len(nodes) != 2 {
			t.Fatalf("%q: %v %v", p, nodes, err)
		}
	}
}

func TestContentIsReadOncePerHash(t *testing.T) {
	s, src := fixture()
	_, _ = s.Ls("u", "/Work")
	_, _ = s.Ls("u", "/Work")
	if src.reads["content-d1"] != 1 {
		t.Fatalf("content-d1 read %d times", src.reads["content-d1"])
	}
}

func TestMissingContentBlobStillListsTheDocument(t *testing.T) {
	s, src := fixture()
	delete(src.blobs, "content-d2")
	nodes, err := s.Ls("u", "/Work")
	if err != nil || len(nodes) != 2 || len(nodes[1].Tags) != 0 || nodes[1].Tags == nil {
		t.Fatalf("got %+v, %v", nodes, err)
	}
}

func TestFindByRegexpSkipsTrash(t *testing.T) {
	s, _ := fixture()
	res, err := s.Find("u", "/", FindOptions{Pattern: "^/Work/"})
	if err != nil {
		t.Fatal(err)
	}
	var paths []string
	for _, r := range res {
		paths = append(paths, r.Path)
	}
	if !reflect.DeepEqual(paths, []string{"/Work/Notes", "/Work/Spec"}) {
		t.Fatalf("paths: %v", paths)
	}

	all, _ := s.Find("u", "/", FindOptions{})
	for _, r := range all {
		if strings.HasPrefix(r.Path, "/trash") {
			t.Fatalf("trash should be skipped: %v", r.Path)
		}
	}
	if len(all) != 4 { // Todo, Work, Work/Notes, Work/Spec
		t.Fatalf("got %d results", len(all))
	}
}

func TestFindBadRegexpIsAnError(t *testing.T) {
	s, _ := fixture()
	if _, err := s.Find("u", "/", FindOptions{Pattern: "("}); err == nil {
		t.Fatal("expected an error")
	}
}

func TestFindByTagsUsesOrSemantics(t *testing.T) {
	s, _ := fixture()
	res, err := s.Find("u", "/", FindOptions{Tags: []string{"work", "ref"}})
	if err != nil || len(res) != 2 {
		t.Fatalf("got %+v, %v", res, err)
	}
	res, _ = s.Find("u", "/", FindOptions{Tags: []string{"ref"}})
	if len(res) != 1 || res[0].Path != "/Work/Spec" {
		t.Fatalf("got %+v", res)
	}
}

func TestFindByStarred(t *testing.T) {
	s, _ := fixture()
	yes, no := true, false
	res, _ := s.Find("u", "/", FindOptions{Starred: &yes})
	if len(res) != 1 || res[0].Path != "/Work/Notes" {
		t.Fatalf("starred: %+v", res)
	}
	res, _ = s.Find("u", "/", FindOptions{Starred: &no})
	if len(res) != 3 {
		t.Fatalf("unstarred: %+v", res)
	}
}

func TestFindStartsAtAPath(t *testing.T) {
	s, _ := fixture()
	res, err := s.Find("u", "/Work", FindOptions{})
	if err != nil || len(res) != 2 {
		t.Fatalf("got %+v, %v", res, err)
	}
	if _, err := s.Find("u", "/nope", FindOptions{}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestStatReportsEverythingWeKnow(t *testing.T) {
	s, _ := fixture()
	st, err := s.Stat("u", "/Work/Notes")
	if err != nil {
		t.Fatal(err)
	}
	if st.ID != "d1" || st.Path != "/Work/Notes" || st.Hash != "doc-d1" || st.FileType != "notebook" {
		t.Fatalf("stat: %+v", st)
	}
	if st.TotalSize != 5309 || len(st.Files) != 4 || st.Files[1].Name != "d1.content" || st.Files[1].Hash != "content-d1" {
		t.Fatalf("files: %+v total %d", st.Files, st.TotalSize)
	}
	if st.Content == nil || st.Content.FormatVersion != 2 {
		t.Fatalf("content: %+v", st.Content)
	}
	if len(st.Pages) != 2 || st.Pages[0].ID != "p1" {
		t.Fatalf("pages: %+v", st.Pages)
	}
	if !strings.Contains(string(st.RawMetadata), "visibleName") || !strings.Contains(string(st.RawContent), "notebook") {
		t.Fatalf("raw: %s | %s", st.RawMetadata, st.RawContent)
	}
	if st.LastModified != "1700000000000" {
		t.Fatalf("last modified: %q", st.LastModified)
	}
}

func TestStatByID(t *testing.T) {
	s, _ := fixture()
	st, err := s.Stat("u", "d2")
	if err != nil || st.Path != "/Work/Spec" {
		t.Fatalf("got %+v, %v", st, err)
	}
	if _, err := s.Stat("u", "/missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestStatSurvivesMissingBlobs(t *testing.T) {
	s, _ := fixture()
	st, err := s.Stat("u", "/Work/Spec") // no .metadata blob in the fixture
	if err != nil {
		t.Fatal(err)
	}
	if st.RawMetadata != nil {
		t.Fatalf("expected no raw metadata, got %s", st.RawMetadata)
	}
}

func TestInfo(t *testing.T) {
	s, _ := fixture()
	info, err := s.Info("u")
	if err != nil {
		t.Fatal(err)
	}
	if info.Generation != 42 || info.RootHash != "roothash" || info.SchemaVersion != "4" ||
		info.Documents != 3 || info.Folders != 1 || info.Trashed != 1 {
		t.Fatalf("info: %+v", info)
	}
}

func TestTreeNestsChildren(t *testing.T) {
	s, _ := fixture()
	root, err := s.Tree("u")
	if err != nil {
		t.Fatal(err)
	}
	if got := names(root.Children); !reflect.DeepEqual(got, []string{"Todo", "trash", "Work"}) {
		t.Fatalf("root children %v", got)
	}
	work := root.Children[2]
	if got := names(work.Children); !reflect.DeepEqual(got, []string{"Notes", "Spec"}) {
		t.Fatalf("work children %v", got)
	}
	if work.Path != "/Work" || work.Children[0].Path != "/Work/Notes" {
		t.Fatalf("paths: %s %s", work.Path, work.Children[0].Path)
	}
}

func TestSourceErrorsPropagate(t *testing.T) {
	s, src := fixture()
	src.err = errors.New("boom")
	if _, err := s.Ls("u", "/"); err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("got %v", err)
	}
	if _, err := s.Info("u"); err == nil {
		t.Fatal("expected an error")
	}
}

func TestPageDataReturnsTheRmFileOfAPage(t *testing.T) {
	s, _ := fixture()
	raw, err := s.PageData("u", "/Work/Notes", 0)
	if err != nil || string(raw) != "page-one!" {
		t.Fatalf("got %q, %v", raw, err)
	}
	// by id too
	if raw, err := s.PageData("u", "d1", 0); err != nil || string(raw) != "page-one!" {
		t.Fatalf("by id: %q, %v", raw, err)
	}
}

func TestPageDataOfABlankPageIsNilWithoutError(t *testing.T) {
	s, _ := fixture()
	raw, err := s.PageData("u", "/Work/Notes", 1)
	if err != nil || raw != nil {
		t.Fatalf("got %q, %v", raw, err)
	}
}

func TestPageDataErrors(t *testing.T) {
	s, _ := fixture()
	for _, c := range []struct {
		target string
		page   int
	}{{"/Work/Notes", 2}, {"/Work/Notes", -1}, {"/Work", 0}, {"/nope", 0}, {"/Todo", 0}} {
		if _, err := s.PageData("u", c.target, c.page); !errors.Is(err, ErrNotFound) {
			t.Errorf("%v: want ErrNotFound, got %v", c, err)
		}
	}
}
