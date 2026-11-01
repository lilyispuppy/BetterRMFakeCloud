package model

import "testing"

func TestUserDevFlagRoundTrip(t *testing.T) {
	u := &User{ID: "a", Dev: true}
	b, err := u.Serialize()
	if err != nil {
		t.Fatal(err)
	}
	got, err := DeserializeUser(b)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Dev {
		t.Fatal("expected Dev to survive a YAML round trip")
	}
}

func TestUserDevFlagDefaultsOff(t *testing.T) {
	got, err := DeserializeUser([]byte("id: a\nemail: a@b.c\n"))
	if err != nil {
		t.Fatal(err)
	}
	if got.Dev {
		t.Fatal("existing profiles without the field must not become dev users")
	}
}
