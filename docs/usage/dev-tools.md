# Devices and Dev Tools

## Devices tab

The **Devices** tab lists the devices that have talked to your rmfakecloud:
tablets, `rmapi` clients and so on. For each one you get:

- whether it is **Online** (it currently has a live notification connection),
- its name, when it was last seen and when it was first seen,
- the sync version it uses (`1.0` or `1.5`).

Device tokens are stateless, so rmfakecloud keeps its own small registry in
`data/users/<user>/devices.json`. A device is added when it is paired, and
updated whenever it makes an authenticated request. To avoid writing to disk
on every request, the file is only rewritten when something changes or at most
once a minute; the page always shows the up-to-date in-memory values.

A tablet that was paired before this feature existed appears after its next
sync.

Admins get an **All users** switch that shows every user's devices.

The list is read-only. Removing a device from the registry does not revoke its
token.

## Dev flag

Admins can switch on developer features per user from **Admin > Users**, with
the **Dev** switch (stored as `dev: true` in the user's
[profile](userprofile.md)). The flag is checked on the server for every dev-only
request, so switching it off applies straight away. The extra menu entries
and columns appear (or disappear) after the user's next login.

With the flag on, a user gets:

- a **Logs** tab,
- the raw device ID, IP address and user agent in the Devices tab,
- extra columns in the Users list (if they are also an admin): sync 1.5,
  integration count, device count and last seen.

## Logs tab

The **Logs** tab shows the server's recent log lines, with a minimum level
filter, a text search, pause and follow.

- Lines are kept **in memory only** (the last 5000), so they are lost when the
  server restarts. The container's own log output is unchanged.
- JWT tokens and `Authorization` values are removed before a line is stored.
- Other request details can still appear in the log, so only give the Dev flag
  to people you trust with them.
- With `LOGLEVEL=debug` the buffer fills quickly; use the level filter to
  narrow it down.
