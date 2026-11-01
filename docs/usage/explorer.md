# Explorer

The **Explorer** tab shows the data your tablet has synced to rmfakecloud, in
the way the [rmapi](https://github.com/ddvk/rmapi) command line tool shows it:
folders, documents, tags, stars and the structure of each notebook. It is
read-only for now.

It reads the sync 1.5 hash tree stored on the server, so it shows what the
server holds, not what is on the tablet at this moment. If an account uses the
old sync 1.0, the tab says that it is not supported.

## Browse

The left side is the folder tree, including the **trash**. You can filter it by
name, by tag, and by starred. Matching documents are shown together with the
folders that contain them.

Selecting an entry shows:

- **Overview**: name, path, ID, kind (notebook, pdf, epub), version, starred,
  tags, modified, last opened and created times, current page, page count,
  orientation, format version, cover page, fonts, margins, last pen and the
  stored size.
- **Files**: the blobs the document is made of (`.metadata`, `.content`, the
  PDF, one `.rm` per page and so on) with their sizes.
- **Pages**: the pages in reading order, with their page ID, the PDF page they
  show, the template and any page tags.
- **Raw JSON** (Dev users only): the `.metadata` and `.content` files exactly as
  the tablet wrote them.

Documents can be downloaded as an **rmdoc** archive (rmapi `get`) or as a
**PDF with the annotations drawn in** (rmapi `geta`).

Dev users also see content hashes (the root hash in the header, and the hash of
each document and file).

## Tools

The **Tools** tab mirrors the rmapi commands.

| Command   | What it does                                                    | State       |
| --------- | --------------------------------------------------------------- | ----------- |
| `ls`      | List a folder, or show a document                               | Available   |
| `find`    | Search below a path by regular expression, tag (any of) or star | Available   |
| `stat`    | Everything known about an entry, as JSON                        | Available   |
| `get`     | Download a document as an rmdoc archive                         | Available   |
| `geta`    | Download a document with its annotations as a PDF               | Available   |
| `account` | Show the synced account                                         | Available   |
| `version` | Show what the explorer follows                                  | Available   |
| `put`, `mput`, `mget`, `mkdir`, `mv`, `rm`, `nuke` | Change or bulk transfer data | Coming soon |

`cd` and `pwd` have no equivalent, as the tools take full paths. As in rmapi,
`find` skips the trash unless the search starts inside it, and several tags
match documents that have any one of them.

## HTTP API

The tools are also available on the web API, for the signed in user only:

| Route                                      | rmapi equivalent |
| ------------------------------------------ | ---------------- |
| `GET /ui/api/rm/info`                      | `account`        |
| `GET /ui/api/rm/tree`                      | the whole tree   |
| `GET /ui/api/rm/ls?path=/Folder`           | `ls --json`      |
| `GET /ui/api/rm/find?path=&pattern=&tag=&starred=` | `find`   |
| `GET /ui/api/rm/stat?path=/Folder/Doc` or `?id=<id>` | `stat` |

`ls` and `find` return the same fields as `rmapi ls --json` (`id`, `name`,
`type`, `version`, `modifiedClient`, `currentPage`, `parent`, `tags`, `starred`)
plus the `path`. `tag` can be repeated. Accounts on sync 1.0 get `501`. Hashes
and the raw JSON are only returned to Dev users.

## Limits

- Per-page stroke data is not read. The `.rm` files written by firmware 3.x
  use the v6 format, which rmapi cannot parse either.
- Names are not unique on a tablet. If two entries in a folder share a name, a
  path finds the first one; use `stat?id=` to be exact.

## Reference code

The rmapi source used as the reference is included as a read-only git submodule
in `reference/rmapi`, pinned to the release that rmfakecloud builds against.
Clone with `--recurse-submodules` to get it. rmapi is AGPL-3.0, like
rmfakecloud.
