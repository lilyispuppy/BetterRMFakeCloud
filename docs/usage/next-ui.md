# New web app (preview)

A new web interface, built from scratch as a progressive web app for phones and
desktops, is being developed next to the existing one. It is served at
`/next` (for example `https://your-server/next/`). The existing interface at `/`
is not changed.

The new app uses the same sign in and the same API as the existing one, so
there is nothing to configure. Sign in at the existing page first; the session
is shared.

## Status

This is the scaffold: the page at `/next/` shows a placeholder. The screens are
added in phases. The primary navigation will be Library and Screen share;
Settings (Devices, Profile, Integrations and the developer tools) will be in the
account menu at the top right.

## How it is served

- The code is in `frontend-next/` and is built with Vite, React, TypeScript
  and Tailwind CSS.
- The build is embedded into the server binary. `internal/nextui` serves it
  below `/next`: files with a hash in their name are cached for a year, while
  the app shell, service worker and manifest are always revalidated, and any
  other path without a file extension gets the app shell so that in-app routes
  work.
- If the binary was built without the web app, `/next/` answers
  `503 Service Unavailable` with a message saying so.

## Developing it

```
make runnext     # dev server on http://localhost:3002/next/, proxies /ui/api to :3000
make testnext    # unit tests and lint
make nextui      # production build into frontend-next/dist
```

Build the app before `go build` (or use the Docker image, which does it for
you) to have it embedded.
