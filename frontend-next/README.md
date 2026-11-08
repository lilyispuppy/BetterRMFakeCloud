# frontend-next

The new web app, served by the Go server at `/next`. It is independent of `../ui`:
nothing is imported from it. See `docs/usage/next-ui.md` in the repository root.

```
pnpm install
pnpm dev      # http://localhost:3002/next/, proxies /ui/api to localhost:3000
pnpm test     # vitest
pnpm lint
pnpm build    # into dist/, which the Go server embeds
```
