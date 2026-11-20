# susu-landing

The susu.dev frontend: a static, client-side React app. `pnpm build` writes
`dist/`, which is uploaded to S3/R2 and served as-is. There is no server code
here; auth is [authsu](../authsu) and any other data comes from a separate
`api.susu.dev` Worker.

See [docs/stack.md](docs/stack.md) for why this stack.

| Layer         | Tool                                                  |
| ------------- | ----------------------------------------------------- |
| UI            | React 19, shadcn/ui (Radix), Tailwind CSS v4          |
| Routing       | React Router 8 (data mode, `createBrowserRouter`)     |
| Build / dev   | Rsbuild 2 (Fast Refresh HMR)                          |
| Tests         | Rstest, happy-dom, Testing Library, Istanbul coverage |
| Lint / format | Biome                                                 |
| Types         | TypeScript (`tsc --noEmit`)                           |

## Requirements

Node `^20.19.0 || >=22.12.0` and pnpm.

## Commands

```sh
pnpm install
pnpm dev            # http://localhost:3000, hot reloading
pnpm test           # run tests once
pnpm test:watch     # re-run tests on change
pnpm coverage       # tests + coverage, fails below 100%
pnpm lint           # biome check (lint + format + import order)
pnpm lint:fix       # apply safe fixes and formatting
pnpm typecheck
pnpm check          # lint + typecheck + coverage (the pre-commit gate)
pnpm ci             # check + production build
pnpm build          # static bundle in dist/
pnpm preview        # serve dist/ locally
```

Dev proxies `/api` to `http://localhost:8787` (authsu's `make dev`), so
requests stay same-origin and cookies work without CORS.

## Layout

```
src/
  index.html        HTML template (inline theme bootstrap, no flash of light mode)
  index.tsx         entry; the only file excluded from coverage
  App.tsx           RouterProvider wrapper (takes a router, so tests can inject one)
  router.tsx        route table, createRouter (browser) / createTestRouter (memory)
  routes/           route components
  components/ui/    shadcn primitives (copied, not authored; excluded from lint)
  lib/              utils (cn), theme
```

Add routes in `src/router.tsx`. Add shadcn primitives with
`pnpm dlx shadcn@latest add <name>` (`components.json` is configured), or copy
them from `nteract/src/components/ui`.

## Testing

Tests sit next to the code as `*.test.ts(x)`. Render routes with
`createTestRouter(["/path"])` and `<App router={...} />`; no real browser
history is involved. Coverage is held at 100% (statements, branches,
functions, lines). `src/index.tsx` is the only excluded file, since it just
mounts into the real DOM.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests, as
four parallel jobs that call the same scripts you run locally:

| Job               | Runs                                                        |
| ----------------- | ----------------------------------------------------------- |
| Lint              | `pnpm run lint` (Biome: lint, format, import order)         |
| Typecheck         | `pnpm run typecheck`                                        |
| Test and coverage | `pnpm run coverage` (fails below 100%); uploads `coverage/` |
| Build             | `pnpm run build`; uploads `dist/`, the static bundle        |

`pnpm run ci` runs all of these locally in sequence.

The supply chain is kept small. Only first-party `actions/*` are used, each
pinned to a full commit SHA with its version in a trailing comment, and a new
third-party action needs explicit approval. pnpm is installed from the npm
registry at the version in `packageManager` (not through an action), so bump
that one field to upgrade it. Dependencies install with `--frozen-lockfile
--ignore-scripts`. The token is read-only and there are no secrets or deploy
steps. Shared setup lives in `.github/actions/setup`.

## Deploying

Upload `dist/static/*` with `Cache-Control: public, max-age=31536000,
immutable` (filenames are content-hashed) and `dist/index.html` with
`no-cache`.

The host must serve `index.html` for unknown paths so deep links work, but
must return a real 404 for missing files under `/static/`. The local dev and
preview servers do not make that distinction (a missing `/static/js/x.js`
returns `index.html` with 200), so do not rely on them to catch it.
