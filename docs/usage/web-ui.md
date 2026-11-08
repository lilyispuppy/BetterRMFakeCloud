# Web interface

The server has two web interfaces:

- The **new web app**, a progressive web app for phones and desktops, is the
  default. It is served at the root of the site (for example
  `https://your-server/`).
- The **legacy web app**, the original interface, is served at `/legacy/`
  (for example `https://your-server/legacy/`).

Both use the same sign in and the same API, so there is nothing to configure.
The session is shared, so signing in to one signs you in to the other.

Old bookmarks such as `/documents` or `/devices` open the new app, which sends
them to the matching page.

## Status

The new app is being built in phases, so for now some features are only in the
legacy app. The primary navigation will be Library and Screen share. Settings
(Devices, Profile, Integrations and the developer tools) will be in the account
menu at the top right, which also links to the legacy app.

## How it is served

- The code for the new app is in `frontend-next/`, built with Vite, React,
  TypeScript and Tailwind CSS. The legacy app is in `ui/`.
- Both builds are embedded into the server binary. The server answers every
  request that no other route claimed: paths below `/legacy` go to the legacy
  app, everything else goes to the new app.
- Within the new app, files with a hash in their name are cached for a year,
  while the app shell, service worker and manifest are always revalidated.
  Paths without a file extension get the app shell, so in-app routes work, and
  `/api` and `/ui/api` never do.
- If the binary was built without the new app, `/` answers
  `503 Service Unavailable` with a message saying so.

## Developing it

```
make runnext     # new app: dev server on http://localhost:3002/, proxies /ui/api to :3000
make runui       # legacy app: dev server on http://localhost:3001/legacy/
make testnext    # unit tests and lint for the new app
make nextui      # production build into frontend-next/dist
```

Build both apps before `go build` (or use the Docker image, which does it for
you) to have them embedded.
