package ui

import (
	"github.com/ddvk/rmfakecloud/internal/model"
	"github.com/golang-jwt/jwt/v4"
)

// WebUserClaims the claims
type WebUserClaims struct {
	UserID    string `json:"UserID"`
	BrowserID string `json:"BrowserID"`
	Email     string
	Scopes    string `json:"scopes,omitempty"`
	Roles     []string
	jwt.RegisteredClaims
}

// WebUsage used for the uid
const WebUsage = "web"

// AdminRole is admin
const AdminRole = "Admin"

// DevRole marks users with developer features enabled
const DevRole = "Dev"

// rolesForUser lists the roles put in the web token. The UI treats the first
// role as the primary one (Admin or User), so it must stay first.
func rolesForUser(u *model.User) []string {
	roles := []string{"User"}
	if u.IsAdmin {
		roles = []string{AdminRole}
	}
	if u.Dev {
		roles = append(roles, DevRole)
	}
	return roles
}
