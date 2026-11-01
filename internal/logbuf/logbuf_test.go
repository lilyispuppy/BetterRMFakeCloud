package logbuf

import (
	"fmt"
	"sync"
	"testing"

	"github.com/sirupsen/logrus"
)

func fire(t *testing.T, b *Buffer, level logrus.Level, msg string, fields logrus.Fields) {
	t.Helper()
	e := &logrus.Entry{Level: level, Message: msg, Data: fields}
	if err := b.Fire(e); err != nil {
		t.Fatal(err)
	}
}

func messages(es []Entry) []string {
	out := make([]string, len(es))
	for i, e := range es {
		out[i] = e.Message
	}
	return out
}

func eq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func all() Query { return Query{Level: logrus.TraceLevel} }

func TestEntriesAreOrderedWithIncreasingSeq(t *testing.T) {
	b := New(10)
	fire(t, b, logrus.InfoLevel, "one", nil)
	fire(t, b, logrus.InfoLevel, "two", nil)

	got := b.Entries(all())
	if !eq(messages(got), []string{"one", "two"}) {
		t.Fatalf("got %v", messages(got))
	}
	if got[0].Seq >= got[1].Seq {
		t.Fatalf("seq not increasing: %d %d", got[0].Seq, got[1].Seq)
	}
}

func TestOldestEntriesAreEvictedAtCapacity(t *testing.T) {
	b := New(3)
	for i := 1; i <= 5; i++ {
		fire(t, b, logrus.InfoLevel, fmt.Sprint("m", i), nil)
	}
	got := messages(b.Entries(all()))
	if !eq(got, []string{"m3", "m4", "m5"}) {
		t.Fatalf("got %v", got)
	}
}

func TestSinceReturnsOnlyNewerEntries(t *testing.T) {
	b := New(10)
	fire(t, b, logrus.InfoLevel, "a", nil)
	fire(t, b, logrus.InfoLevel, "b", nil)
	first := b.Entries(all())[0]

	q := all()
	q.Since = first.Seq
	if got := messages(b.Entries(q)); !eq(got, []string{"b"}) {
		t.Fatalf("got %v", got)
	}

	q.Since = b.Entries(all())[1].Seq
	if got := b.Entries(q); len(got) != 0 {
		t.Fatalf("expected nothing newer, got %v", messages(got))
	}
}

func TestSinceStillWorksAfterEviction(t *testing.T) {
	b := New(2)
	for i := 1; i <= 4; i++ {
		fire(t, b, logrus.InfoLevel, fmt.Sprint("m", i), nil)
	}
	q := all()
	q.Since = 1 // long gone
	if got := messages(b.Entries(q)); !eq(got, []string{"m3", "m4"}) {
		t.Fatalf("got %v", got)
	}
}

func TestLevelFilterKeepsThatLevelAndMoreSevere(t *testing.T) {
	b := New(10)
	fire(t, b, logrus.DebugLevel, "debug", nil)
	fire(t, b, logrus.InfoLevel, "info", nil)
	fire(t, b, logrus.WarnLevel, "warn", nil)
	fire(t, b, logrus.ErrorLevel, "error", nil)

	got := messages(b.Entries(Query{Level: logrus.WarnLevel}))
	if !eq(got, []string{"warn", "error"}) {
		t.Fatalf("got %v", got)
	}
}

func TestContainsIsCaseInsensitiveAndSearchesFields(t *testing.T) {
	b := New(10)
	fire(t, b, logrus.InfoLevel, "Syncing documents", nil)
	fire(t, b, logrus.InfoLevel, "unrelated", logrus.Fields{"device": "RM110-ABC"})
	fire(t, b, logrus.InfoLevel, "other", nil)

	q := all()
	q.Contains = "sYnC"
	if got := messages(b.Entries(q)); !eq(got, []string{"Syncing documents"}) {
		t.Fatalf("message search: %v", got)
	}
	q.Contains = "rm110"
	if got := messages(b.Entries(q)); !eq(got, []string{"unrelated device=RM110-ABC"}) {
		t.Fatalf("field search: %v", got)
	}
}

func TestLimitKeepsTheMostRecentEntries(t *testing.T) {
	b := New(10)
	for i := 1; i <= 5; i++ {
		fire(t, b, logrus.InfoLevel, fmt.Sprint("m", i), nil)
	}
	q := all()
	q.Limit = 2
	if got := messages(b.Entries(q)); !eq(got, []string{"m4", "m5"}) {
		t.Fatalf("got %v", got)
	}
}

func TestFieldsAreRenderedSortedIntoTheMessage(t *testing.T) {
	b := New(10)
	fire(t, b, logrus.InfoLevel, "hello", logrus.Fields{"b": 2, "a": "x"})
	got := b.Entries(all())[0]
	if got.Message != "hello a=x b=2" {
		t.Fatalf("got %q", got.Message)
	}
	if got.Level != "info" {
		t.Fatalf("level %q", got.Level)
	}
}

func TestSecretsAreRedactedBeforeStoring(t *testing.T) {
	jwt := "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJl"
	cases := map[string]string{
		"token " + jwt + " seen":            "token [redacted-jwt] seen",
		"Authorization: Bearer abc.def-ghi": "Authorization [redacted]",
		"authorization=sometoken next":      "authorization [redacted] next",
		"sent Bearer abc123 to server":      "sent Bearer [redacted] to server",
		"nothing secret here":               "nothing secret here",
	}
	for in, want := range cases {
		if got := Redact(in); got != want {
			t.Errorf("Redact(%q) = %q, want %q", in, got, want)
		}
	}

	b := New(5)
	fire(t, b, logrus.InfoLevel, "login "+jwt, logrus.Fields{"hdr": "Bearer zzz"})
	got := b.Entries(all())[0].Message
	if got != "login [redacted-jwt] hdr=Bearer [redacted]" {
		t.Fatalf("got %q", got)
	}
}

func TestConcurrentWritersAndReaders(t *testing.T) {
	b := New(50)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 200; j++ {
				_ = b.Fire(&logrus.Entry{Level: logrus.InfoLevel, Message: "x"})
				_ = b.Entries(all())
			}
		}()
	}
	wg.Wait()
	if n := len(b.Entries(all())); n != 50 {
		t.Fatalf("got %d entries, want 50", n)
	}
}

func TestBufferIsALogrusHookForEveryLevel(t *testing.T) {
	b := New(5)
	if len(b.Levels()) != len(logrus.AllLevels) {
		t.Fatalf("hook should fire for all levels, got %v", b.Levels())
	}
	l := logrus.New()
	l.SetOutput(discard{})
	l.SetLevel(logrus.DebugLevel)
	l.AddHook(b)
	l.Info("through logrus")
	if got := messages(b.Entries(all())); !eq(got, []string{"through logrus"}) {
		t.Fatalf("got %v", got)
	}
}

type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }
