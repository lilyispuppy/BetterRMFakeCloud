package ui

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ddvk/rmfakecloud/internal/model"
	"github.com/ddvk/rmfakecloud/internal/ui/viewmodel"
	"github.com/gin-gonic/gin"
)

type fakeUserStore struct {
	users map[string]*model.User
}

func (f *fakeUserStore) GetUsers() ([]*model.User, error) {
	var out []*model.User
	for _, u := range f.users {
		out = append(out, u)
	}
	return out, nil
}
func (f *fakeUserStore) GetUser(id string) (*model.User, error) { return f.users[id], nil }
func (f *fakeUserStore) RegisterUser(u *model.User) error       { f.users[u.ID] = u; return nil }
func (f *fakeUserStore) UpdateUser(u *model.User) error         { f.users[u.ID] = u; return nil }
func (f *fakeUserStore) RemoveUser(id string) error             { delete(f.users, id); return nil }

func newTestApp(users ...*model.User) *ReactAppWrapper {
	gin.SetMode(gin.TestMode)
	store := &fakeUserStore{users: map[string]*model.User{}}
	for _, u := range users {
		store.users[u.ID] = u
	}
	return &ReactAppWrapper{userStorer: store}
}

// asUser fakes what authMiddleware would have set.
func asUser(uid string, admin bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(userIDContextKey, uid)
		if admin {
			c.Set(AdminRole, true)
		}
	}
}

func do(r http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestDevMiddlewareRejectsNonDevUsers(t *testing.T) {
	app := newTestApp(&model.User{ID: "plain"}, &model.User{ID: "dev", Dev: true})

	for _, tc := range []struct {
		uid  string
		want int
	}{
		{"plain", http.StatusForbidden},
		{"dev", http.StatusOK},
		{"missing", http.StatusForbidden},
	} {
		r := gin.New()
		r.Use(asUser(tc.uid, false), app.devMiddleware())
		r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

		if got := do(r, http.MethodGet, "/x", nil).Code; got != tc.want {
			t.Errorf("user %q: got %d, want %d", tc.uid, got, tc.want)
		}
	}
}

func TestDevMiddlewareIgnoresStaleTokenRole(t *testing.T) {
	// the flag was revoked after the token was issued: storage is the authority
	app := newTestApp(&model.User{ID: "was-dev", Dev: false})
	r := gin.New()
	r.Use(asUser("was-dev", true), app.devMiddleware())
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	if got := do(r, http.MethodGet, "/x", nil).Code; got != http.StatusForbidden {
		t.Fatalf("got %d, want 403", got)
	}
}

func TestUpdateUserSetsAndPreservesDevFlag(t *testing.T) {
	app := newTestApp(&model.User{ID: "u", Email: "u@x.y"})
	r := gin.New()
	r.Use(asUser("admin", true), app.adminMiddleware())
	r.PUT("/users", app.updateUser)

	on := true
	if w := do(r, http.MethodPut, "/users", map[string]any{"userid": "u", "dev": on}); w.Code >= 300 {
		t.Fatalf("set dev: %d", w.Code)
	}
	if u, _ := app.userStorer.GetUser("u"); !u.Dev {
		t.Fatal("dev flag was not set")
	}

	// a request that does not mention dev (the existing password/email form) must not reset it
	if w := do(r, http.MethodPut, "/users", map[string]any{"userid": "u", "email": "new@x.y"}); w.Code >= 300 {
		t.Fatalf("update email: %d", w.Code)
	}
	if u, _ := app.userStorer.GetUser("u"); !u.Dev || u.Email != "new@x.y" {
		t.Fatalf("dev flag lost or email not updated: %+v", u)
	}

	off := false
	do(r, http.MethodPut, "/users", map[string]any{"userid": "u", "dev": off})
	if u, _ := app.userStorer.GetUser("u"); u.Dev {
		t.Fatal("dev flag was not cleared")
	}
}

func TestUpdateUserRouteIsAdminOnly(t *testing.T) {
	app := newTestApp(&model.User{ID: "u"})
	r := gin.New()
	r.Use(asUser("someone", false), app.adminMiddleware())
	r.PUT("/users", app.updateUser)

	w := do(r, http.MethodPut, "/users", map[string]any{"userid": "u", "dev": true})
	if w.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", w.Code)
	}
	if u, _ := app.userStorer.GetUser("u"); u.Dev {
		t.Fatal("non-admin managed to set the dev flag")
	}
}

func TestGetAppUsersReturnsDevFlag(t *testing.T) {
	app := newTestApp(&model.User{ID: "d", Dev: true})
	r := gin.New()
	r.GET("/users", app.getAppUsers)

	w := do(r, http.MethodGet, "/users", nil)
	var got []viewmodel.User
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || len(got) != 1 {
		t.Fatalf("bad response %q: %v", w.Body.String(), err)
	}
	if !got[0].Dev {
		t.Fatal("dev flag missing from the users listing")
	}
}

func TestGetAppUsersReturnsDetailsForDevView(t *testing.T) {
	app := newTestApp(&model.User{
		ID:           "d",
		Sync15:       true,
		Integrations: []model.IntegrationConfig{{ID: "1"}, {ID: "2"}},
	})
	r := gin.New()
	r.GET("/users", app.getAppUsers)

	w := do(r, http.MethodGet, "/users", nil)
	var got []viewmodel.User
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || len(got) != 1 {
		t.Fatalf("bad response %q: %v", w.Body.String(), err)
	}
	if !got[0].Sync15 || got[0].IntegrationCount != 2 {
		t.Fatalf("missing details: %+v", got[0])
	}
}

func TestRolesForUser(t *testing.T) {
	cases := []struct {
		name string
		user model.User
		want []string
	}{
		{"plain", model.User{}, []string{"User"}},
		{"admin", model.User{IsAdmin: true}, []string{AdminRole}},
		{"dev", model.User{Dev: true}, []string{"User", DevRole}},
		{"admin and dev", model.User{IsAdmin: true, Dev: true}, []string{AdminRole, DevRole}},
	}
	for _, tc := range cases {
		got := rolesForUser(&tc.user)
		if len(got) != len(tc.want) {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
			continue
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
			}
		}
	}
}
