# frontend-next

The new web app, served by the Go server at `/`. It is independent of `../ui`:
nothing is imported from it. See `docs/usage/web-ui.md` in the repository root.

```
pnpm install
pnpm dev      # http://localhost:3002/, proxies /ui/api to localhost:3000
pnpm test     # vitest
pnpm lint
pnpm build    # into dist/, which the Go server embeds
```
