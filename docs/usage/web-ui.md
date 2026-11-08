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

## The new app

The primary navigation is **Library** (browse, upload, preview and download
documents; page previews, document information, file lists and search are part
of it) and **Screen share**. **Settings** is in the account menu at the top
right: Devices (with Connect), Profile, Integrations, Developer settings (Logs
and Explorer, for developers) and Admin (for administrators). The same menu
links to the legacy app.

### Library and documents

The library shows documents as a **grid** of thumbnails or as a **list**; the
choice is remembered (a grid on wide screens, a list on phones, until you
choose). Opening a document opens a **viewer**: its pages, with your
annotations merged into the PDF, with page indicator, zoom and a PDF download.
Everything else is behind **Details**: type, dates, tags, page overview, the
files it is made of, rename, move, delete and the raw `.rmdoc` download.

Thumbnails are the first page of the same annotated PDF. They are drawn once per
version of a document, kept in `<DATADIR>/thumbnails`, and drawn in the
background when the library is listed. They need `pdftoppm` (from
poppler-utils), which the Docker image contains; without it the library shows
icons instead. The viewer needs nothing on the server: the PDF is drawn in the
browser.

### Installing it and using it offline

The new app is a progressive web app. Browsers only offer installation, and
only run the service worker, on a secure origin: serve the site over HTTPS (or
use `localhost`).

- **Install**: use "Install app" in the account menu, or the browser's own
  option (on iOS, Share, then Add to Home Screen).
- **Offline**: the app itself opens without a connection, the last document list
  and page previews already viewed are kept, and a banner says when you are
  offline. Everything else, including sign in and any change, needs the server.
- **Share to the app**: on Android and desktop Chromium, files shared to the
  installed app are uploaded to the top level of the library.
- **Updates**: a "new version available" prompt appears when the server has been
  upgraded; choose Reload to switch to it.
- Signing out removes the cached document list and page previews.

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
