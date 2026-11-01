// Package rmtools offers read-only equivalents of the ddvk/rmapi commands
// (ls, find, stat) over the data synced to this server. It works on the
// sync 1.5 hash tree directly, so nothing is fetched from a tablet or cloud.
package rmtools

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ddvk/rmfakecloud/internal/common"
	"github.com/ddvk/rmfakecloud/internal/storage/models"
)

const (
	// TrashID is the id rmapi (and the tablet) use for the trash folder
	TrashID = "trash"

	maxBlobSize = 8 << 20
)

// ErrNotFound means the path or id does not exist
var ErrNotFound = errors.New("not found")

// Source is where the tree and blobs come from
type Source interface {
	// Tree returns the user's hash tree
	Tree(uid string) (*models.HashTree, error)
	// Blob opens a blob by hash
	Blob(uid, hash string) (io.ReadCloser, error)
}

// Node mirrors the JSON of `rmapi ls --json`, plus the path
type Node struct {
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	Type           common.EntryType `json:"type"`
	Version        int              `json:"version"`
	ModifiedClient string           `json:"modifiedClient"`
	CurrentPage    int              `json:"currentPage"`
	Parent         string           `json:"parent"`
	Tags           []string         `json:"tags"`
	Starred        bool             `json:"starred"`

	Path     string `json:"path"`
	Children []Node `json:"children,omitempty"`
}

// FindOptions mirrors the flags of `rmapi find`
type FindOptions struct {
	// Pattern is a Go regular expression matched against the full path
	Pattern string
	// Tags matches documents with any of these tags
	Tags []string
	// Starred filters on the starred (pinned) state when set
	Starred *bool
}

// FileEntry is one blob belonging to a document
type FileEntry struct {
	Name string `json:"name"`
	Hash string `json:"hash"`
	Size int64  `json:"size"`
}

// Stat is everything known about one entry
type Stat struct {
	Node
	Hash         string `json:"hash"`
	FileType     string `json:"fileType"`
	CreatedTime  string `json:"createdTime"`
	LastModified string `json:"lastModified"`
	LastOpened   string `json:"lastOpened"`

	Files     []FileEntry            `json:"files"`
	TotalSize int64                  `json:"totalSize"`
	Content   *models.ContentDetails `json:"content,omitempty"`
	Pages     []models.PageInfo      `json:"pages"`

	RawMetadata json.RawMessage `json:"rawMetadata,omitempty"`
	RawContent  json.RawMessage `json:"rawContent,omitempty"`
}

// Info summarises a user's synced data
type Info struct {
	Generation    int64  `json:"generation"`
	RootHash      string `json:"rootHash"`
	SchemaVersion string `json:"schemaVersion"`
	Documents     int    `json:"documents"`
	Folders       int    `json:"folders"`
	Trashed       int    `json:"trashed"`
}

// Service implements the tools
type Service struct {
	src Source

	mu      sync.Mutex
	content map[string]*models.ContentDetails // by content blob hash, nil when unreadable
}

// New creates a Service
func New(src Source) *Service {
	return &Service{src: src, content: map[string]*models.ContentDetails{}}
}

// index is the tree arranged for lookup
type index struct {
	byID     map[string]*models.HashDoc
	children map[string][]*models.HashDoc
	tree     *models.HashTree
}

func (s *Service) index(uid string) (*index, error) {
	tree, err := s.src.Tree(uid)
	if err != nil {
		return nil, err
	}
	trash := &models.HashDoc{
		HashEntry: models.HashEntry{EntryName: TrashID},
		MetadataFile: models.MetadataFile{
			DocumentName:   TrashID,
			CollectionType: common.CollectionType,
		},
	}
	idx := &index{
		byID:     map[string]*models.HashDoc{TrashID: trash},
		children: map[string][]*models.HashDoc{},
		tree:     tree,
	}
	for _, d := range tree.Docs {
		idx.byID[d.EntryName] = d
	}
	idx.children[""] = append(idx.children[""], trash)
	for _, d := range tree.Docs {
		parent := d.Parent
		if parent != "" && parent != TrashID {
			if p, ok := idx.byID[parent]; !ok || p.CollectionType != common.CollectionType {
				parent = "" // orphan, show at the root
			}
		}
		idx.children[parent] = append(idx.children[parent], d)
	}
	for _, list := range idx.children {
		sort.SliceStable(list, func(i, j int) bool {
			return strings.ToLower(list[i].DocumentName) < strings.ToLower(list[j].DocumentName)
		})
	}
	return idx, nil
}

func (i *index) parentOf(d *models.HashDoc) string {
	if d.EntryName == TrashID {
		return ""
	}
	parent := d.Parent
	if parent == "" || parent == TrashID {
		return parent
	}
	if p, ok := i.byID[parent]; !ok || p.CollectionType != common.CollectionType {
		return ""
	}
	return parent
}

func (i *index) pathOf(d *models.HashDoc) string {
	var parts []string
	cur := d
	for depth := 0; cur != nil && depth < 100; depth++ {
		parts = append([]string{cur.DocumentName}, parts...)
		parent := i.parentOf(cur)
		if parent == "" {
			break
		}
		cur = i.byID[parent]
	}
	return "/" + strings.Join(parts, "/")
}

// resolve finds an entry by path; the root is returned as nil
func (i *index) resolve(path string) (doc *models.HashDoc, err error) {
	var cur *models.HashDoc
	parentID := ""
	for _, seg := range strings.Split(strings.Trim(path, "/"), "/") {
		if seg == "" {
			continue
		}
		if cur != nil && cur.CollectionType != common.CollectionType {
			return nil, ErrNotFound
		}
		var found *models.HashDoc
		for _, c := range i.children[parentID] {
			if c.DocumentName == seg {
				found = c
				break
			}
		}
		if found == nil {
			return nil, ErrNotFound
		}
		cur = found
		parentID = found.EntryName
	}
	return cur, nil
}

func (s *Service) contentFor(uid string, d *models.HashDoc) *models.ContentDetails {
	var entry *models.HashEntry
	for _, f := range d.Files {
		if f.IsContent() {
			entry = f
			break
		}
	}
	if entry == nil {
		return nil
	}

	s.mu.Lock()
	c, ok := s.content[entry.Hash]
	s.mu.Unlock()
	if ok {
		return c
	}

	if b, err := s.readBlob(uid, entry.Hash); err == nil {
		c, _ = models.ParseContent(b)
	}
	s.mu.Lock()
	s.content[entry.Hash] = c
	s.mu.Unlock()
	return c
}

func (s *Service) readBlob(uid, hash string) ([]byte, error) {
	r, err := s.src.Blob(uid, hash)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(io.LimitReader(r, maxBlobSize))
}

func modifiedClient(lastModified string) string {
	ms, err := strconv.ParseInt(lastModified, 10, 64)
	if err != nil {
		return ""
	}
	if len(lastModified) > 18 { // some clients wrote nanoseconds
		ms /= 1000000
	}
	return time.Unix(ms/1000, 0).UTC().Format(time.RFC3339Nano)
}

func (s *Service) node(uid string, idx *index, d *models.HashDoc) Node {
	tags := []string{}
	if c := s.contentFor(uid, d); c != nil {
		tags = c.TagNames()
	}
	return Node{
		ID:             d.EntryName,
		Name:           d.DocumentName,
		Type:           d.CollectionType,
		Version:        d.Version,
		ModifiedClient: modifiedClient(d.LastModified),
		CurrentPage:    d.LastOpenedPage,
		Parent:         idx.parentOf(d),
		Tags:           tags,
		Starred:        d.Pinned,
		Path:           idx.pathOf(d),
	}
}

// Ls lists a folder, or returns the document when the path is one
func (s *Service) Ls(uid, path string) ([]Node, error) {
	idx, err := s.index(uid)
	if err != nil {
		return nil, err
	}
	d, err := idx.resolve(path)
	if err != nil {
		return nil, err
	}
	if d != nil && d.CollectionType != common.CollectionType {
		return []Node{s.node(uid, idx, d)}, nil
	}
	parentID := ""
	if d != nil {
		parentID = d.EntryName
	}
	nodes := []Node{}
	for _, c := range idx.children[parentID] {
		nodes = append(nodes, s.node(uid, idx, c))
	}
	return nodes, nil
}

// Find walks from start and returns the entries matching the options.
// Like rmapi, the trash is skipped unless the search starts inside it.
func (s *Service) Find(uid, start string, opts FindOptions) ([]Node, error) {
	var re *regexp.Regexp
	if opts.Pattern != "" {
		var err error
		if re, err = regexp.Compile(opts.Pattern); err != nil {
			return nil, fmt.Errorf("invalid pattern: %w", err)
		}
	}
	idx, err := s.index(uid)
	if err != nil {
		return nil, err
	}
	startDoc, err := idx.resolve(start)
	if err != nil {
		return nil, err
	}
	skipTrash := startDoc == nil || (startDoc.EntryName != TrashID && idx.parentOf(startDoc) != TrashID)

	results := []Node{}
	match := func(d *models.HashDoc) {
		n := s.node(uid, idx, d)
		if re != nil && !re.MatchString(n.Path) {
			return
		}
		if opts.Starred != nil && n.Starred != *opts.Starred {
			return
		}
		if len(opts.Tags) > 0 && !anyIn(opts.Tags, n.Tags) {
			return
		}
		results = append(results, n)
	}

	var walk func(parentID string)
	walk = func(parentID string) {
		for _, c := range idx.children[parentID] {
			if skipTrash && (c.EntryName == TrashID || idx.parentOf(c) == TrashID) {
				continue
			}
			match(c)
			if c.CollectionType == common.CollectionType {
				walk(c.EntryName)
			}
		}
	}

	switch {
	case startDoc == nil:
		walk("")
	case startDoc.CollectionType == common.CollectionType:
		walk(startDoc.EntryName)
	default:
		match(startDoc)
	}
	return results, nil
}

func anyIn(wanted, have []string) bool {
	for _, w := range wanted {
		for _, h := range have {
			if w == h {
				return true
			}
		}
	}
	return false
}

// Stat describes one entry, addressed by path or by id
func (s *Service) Stat(uid, target string) (*Stat, error) {
	idx, err := s.index(uid)
	if err != nil {
		return nil, err
	}
	d, ok := idx.byID[target]
	if !ok || strings.HasPrefix(target, "/") {
		if d, err = idx.resolve(target); err != nil {
			return nil, err
		}
	}
	if d == nil {
		return nil, ErrNotFound
	}

	st := &Stat{
		Node:         s.node(uid, idx, d),
		Hash:         d.Hash,
		CreatedTime:  d.CreatedTime,
		LastModified: d.LastModified,
		LastOpened:   d.LastOpened,
		Files:        []FileEntry{},
		Pages:        []models.PageInfo{},
	}
	for _, f := range d.Files {
		st.Files = append(st.Files, FileEntry{Name: f.EntryName, Hash: f.Hash, Size: f.Size})
		st.TotalSize += f.Size
		if f.IsMetadata() {
			if b, err := s.readBlob(uid, f.Hash); err == nil && json.Valid(b) {
				st.RawMetadata = b
			}
		}
	}
	if c := s.contentFor(uid, d); c != nil {
		st.Content = c
		st.FileType = c.FileType
		st.RawContent = c.Raw
		st.Pages = c.PageList()
	}
	return st, nil
}

// Info summarises the user's tree
func (s *Service) Info(uid string) (*Info, error) {
	idx, err := s.index(uid)
	if err != nil {
		return nil, err
	}
	info := &Info{
		Generation:    idx.tree.Generation,
		RootHash:      idx.tree.Hash,
		SchemaVersion: idx.tree.SchemaVersion,
	}
	for _, d := range idx.tree.Docs {
		switch {
		case d.Parent == TrashID:
			info.Trashed++
		case d.CollectionType == common.CollectionType:
			info.Folders++
		default:
			info.Documents++
		}
	}
	return info, nil
}

// Tree returns the whole tree, nested, below a synthetic root
func (s *Service) Tree(uid string) (*Node, error) {
	idx, err := s.index(uid)
	if err != nil {
		return nil, err
	}
	var build func(parentID string) []Node
	build = func(parentID string) []Node {
		var nodes []Node
		for _, c := range idx.children[parentID] {
			n := s.node(uid, idx, c)
			if c.CollectionType == common.CollectionType {
				n.Children = build(c.EntryName)
			}
			nodes = append(nodes, n)
		}
		return nodes
	}
	return &Node{
		Name:     "/",
		Type:     common.CollectionType,
		Path:     "/",
		Tags:     []string{},
		Children: build(""),
	}, nil
}
