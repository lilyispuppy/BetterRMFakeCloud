// Package logbuf keeps the most recent log lines in memory so the web UI can show them.
package logbuf

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

// DefaultCapacity is how many entries the shared buffer holds.
const DefaultCapacity = 5000

// Entry is one stored log line.
type Entry struct {
	Seq     uint64    `json:"seq"`
	Time    time.Time `json:"time"`
	Level   string    `json:"level"`
	Message string    `json:"message"`

	lower string // lowercased message, used for searching
	sev   logrus.Level
}

// Query selects entries. Level keeps that level and anything more severe
// (logrus.TraceLevel keeps everything). Since keeps only entries with a higher
// sequence number. Limit keeps the most recent N (0 means no limit).
type Query struct {
	Since    uint64
	Level    logrus.Level
	Contains string
	Limit    int
}

// Buffer is a fixed size ring of log entries and a logrus hook.
type Buffer struct {
	mu      sync.Mutex
	entries []Entry
	start   int
	count   int
	nextSeq uint64
}

// New creates a buffer holding at most capacity entries.
func New(capacity int) *Buffer {
	if capacity < 1 {
		capacity = 1
	}
	return &Buffer{entries: make([]Entry, capacity), nextSeq: 1}
}

var shared = New(DefaultCapacity)

// Default returns the process wide buffer.
func Default() *Buffer { return shared }

// Levels makes Buffer a logrus.Hook that sees every level.
func (b *Buffer) Levels() []logrus.Level { return logrus.AllLevels }

// Fire stores a log entry.
func (b *Buffer) Fire(e *logrus.Entry) error {
	msg := e.Message
	if len(e.Data) > 0 {
		keys := make([]string, 0, len(e.Data))
		for k := range e.Data {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var sb strings.Builder
		sb.WriteString(msg)
		for _, k := range keys {
			fmt.Fprintf(&sb, " %s=%v", k, e.Data[k])
		}
		msg = sb.String()
	}
	msg = Redact(msg)

	b.mu.Lock()
	defer b.mu.Unlock()

	entry := Entry{
		Seq:     b.nextSeq,
		Time:    e.Time,
		Level:   e.Level.String(),
		Message: msg,
		lower:   strings.ToLower(msg),
		sev:     e.Level,
	}
	b.nextSeq++

	size := len(b.entries)
	if b.count < size {
		b.entries[(b.start+b.count)%size] = entry
		b.count++
	} else {
		b.entries[b.start] = entry
		b.start = (b.start + 1) % size
	}
	return nil
}

// Entries returns the matching entries, oldest first.
func (b *Buffer) Entries(q Query) []Entry {
	needle := strings.ToLower(q.Contains)

	b.mu.Lock()
	defer b.mu.Unlock()

	out := make([]Entry, 0, b.count)
	size := len(b.entries)
	for i := 0; i < b.count; i++ {
		e := b.entries[(b.start+i)%size]
		if e.Seq <= q.Since || e.sev > q.Level {
			continue
		}
		if needle != "" && !strings.Contains(e.lower, needle) {
			continue
		}
		out = append(out, e)
	}
	if q.Limit > 0 && len(out) > q.Limit {
		out = out[len(out)-q.Limit:]
	}
	return out
}

var (
	jwtPattern    = regexp.MustCompile(`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*`)
	authPattern   = regexp.MustCompile(`(?i)\b(authorization)\b[:= ]+(?:bearer\s+)?\S+`)
	bearerPattern = regexp.MustCompile(`(?i)\b(bearer)\s+\S+`)
)

// Redact removes tokens and authorization values from a log line.
func Redact(s string) string {
	s = jwtPattern.ReplaceAllString(s, "[redacted-jwt]")
	s = authPattern.ReplaceAllString(s, "$1 [redacted]")
	s = bearerPattern.ReplaceAllString(s, "$1 [redacted]")
	return s
}
