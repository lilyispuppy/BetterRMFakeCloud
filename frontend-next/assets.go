// Package frontendnext embeds the build of the new web app (frontend-next).
package frontendnext

import (
	"embed"
	"io/fs"
)

// dist holds the output of `pnpm build`. A placeholder keeps the directory
// present, so Go builds without a frontend build; the app then answers 503.
//
//go:embed all:dist
var dist embed.FS

// Dist is the built web app, rooted at its index.html
func Dist() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic("frontend-next dist not embedded: " + err.Error())
	}
	return sub
}
