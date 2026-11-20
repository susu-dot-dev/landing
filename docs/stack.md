# Frontend stack

The susu.dev frontend is a static, client-side bundle. No server rendering and
no server code here: auth lives in `authsu` (auth.susu.dev); anything else goes
to a separate `api.susu.dev` Worker. The build output is a directory of files
uploaded to S3/R2 and served as-is.

## Decision

| Concern            | Choice                                                                              |
| ------------------ | ----------------------------------------------------------------------------------- |
| UI framework       | React 19 (client-only SPA)                                                          |
| Components         | shadcn/ui + Radix + `lucide-react`, consumed from `nteract/src/components/ui`       |
| Styling            | Tailwind CSS v4, nteract semantic tokens (`notebook-tokens.css`)                    |
| Build / dev server | Rsbuild 2 (`@rsbuild/core`, `@rsbuild/plugin-react`, `@rsbuild/plugin-tailwindcss`) |
| Language           | TypeScript (`tsx`); type-check with `tsc --noEmit`, Rsbuild only transpiles         |
| Routing            | React Router 8, data mode (`createBrowserRouter`)                                   |
| Package manager    | pnpm                                                                                |

## Why React

The UI we want to reuse is React. Evidence from `~/code/nteract`:

- `apps/pages/viewer` is React 19 (42 `.jsx` files: Library, SharingControls,
  ChoiceMenu, TrashView, CommentsPanel, ...) on `lucide-react`, with
  `react`/`react-dom`/`lucide-react` explicitly aliased so that shared source
  outside the Pages workspace gets one React instance.
- The shared primitives in `nteract/src/components/ui` (button, dialog,
  dropdown-menu, popover, tabs, select, command, sheet, tooltip, ...) are
  shadcn components on Radix, `class-variance-authority`, `clsx` and
  `tailwind-merge`.
- Pages already imports shared source across the repo boundary
  (`src/components/sharing/SharingPanel.tsx`, `src/styles/notebook-tokens.css`).
- Any other framework (Svelte, Solid, Vue) would mean rewriting every
  component we want to reuse. Not an option.

The Pages editor (Wordgard + Automerge) is a separate matter: it is a large,
bespoke, esbuild-built subsystem tied to celld. It is not part of the initial
site; if we later want it, treat it as a lazily loaded chunk or a separate
app, not as a reason to adopt its build.

## Why Rsbuild

- Static output is the default (`rsbuild build` writes `dist/` with
  content-hashed assets under `static/`); no server runtime to configure.
- Dev server has `server.historyApiFallback` for SPA routing and
  `server.proxy` for forwarding `/api` to a local authsu (`make dev` on :8787)
  so cookies stay same-origin in development.
- Tailwind v4 via `@rsbuild/plugin-tailwindcss`, React Fast Refresh via
  `@rsbuild/plugin-react`. No PostCSS config.
- Vite is the alternative (and is what nteract's `apps/notebook` uses), but
  nothing here needs its ecosystem, and you asked to try Rsbuild.

### Verified spike

A throwaway project (Rsbuild 2.3.2, React 19.3, Tailwind 4.3.5) built
successfully while importing real nteract source through an `@/` alias:
`ui/button`, `ui/dialog`, `ui/theme-toggle` and `sharing/SharingPanel`, plus
`styles/notebook-tokens.css`. Result: 480 kB JS+CSS total, 124 kB gzipped,
with the tokens, `dark:` variants and utilities from nteract's components all
present in the CSS. Build time 0.4 s.

Three things were required, and are the non-obvious part of the config:

1. **Compile the external source**: `source.include: [nteractSrc]`. Files
   outside the project root are not transpiled by default.
2. **Resolve bare imports from this project**: nteract files import `clsx`,
   `tailwind-merge`, `@radix-ui/*`. Resolving from nteract's own location finds
   nothing (or a second React). Set
   `tools.rspack.resolve.modules = [path.resolve("node_modules"), "node_modules"]`
   and `resolve.dedupe = ["react", "react-dom", "lucide-react"]`.
3. **Tell Tailwind to scan the external source**: in the entry CSS,
   `@import "tailwindcss"; @import ".../notebook-tokens.css";
   @source ".../nteract/src/components";`. Without `@source`, classes used only
   by shared components are not generated.

```ts
// rsbuild.config.ts
import path from "node:path";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";

const nteract = path.resolve(import.meta.dirname, "vendor/nteract/src");

export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  source: { entry: { index: "./src/index.tsx" }, include: [nteract] },
  resolve: { alias: { "@": nteract }, dedupe: ["react", "react-dom", "lucide-react"] },
  tools: { rspack: { resolve: { modules: [path.resolve("node_modules"), "node_modules"] } } },
  server: { historyApiFallback: true, proxy: { "/api": "http://localhost:8787" } },
});
```

## Sharing nteract components

The `@/` alias worked in the spike, but `@/` is also what nteract's own
components use internally (`@/lib/utils`, `@/hooks/useTheme`), so whatever we
point `@` at must be nteract's `src/`. That makes this repo's own code unable
to use `@/` for itself (use `~/`, as `apps/notebook` does).

How the source reaches this repo, in order of preference:

1. **shadcn registry copy (recommended to start)**. nteract's `components.json`
   already declares an `@nteract` registry. Copy only the primitives we use
   (`pnpm dlx shadcn add ...`) into `src/components/ui`. Zero cross-repo
   coupling, standard shadcn workflow, and we diverge freely. Cost: updates are
   manual. (`https://nteract-elements.vercel.app/r/{name}.json` returned 404
   when I tried it, so confirm that registry is actually published before
   relying on it; otherwise copy files from nteract.)
2. **Git submodule / pinned checkout + alias** (what the spike did). One source
   of truth, but nteract's `src` is a large Tauri notebook tree and
   `src/components/ui` has imports like `@/hooks/useTheme`, so the alias pulls
   in a web of transitive files and a Tauri-flavoured codebase.
3. **Extract `@nteract/ui` as a workspace package** in nteract. Cleanest end
   state, needs work in that repo; not something to block on.

The scaffold follows (1): `src/components/ui/button.tsx` is a verbatim copy
from nteract, and `components.json` is set up for `shadcn add`. Revisit (3) if we find ourselves re-copying often.

## Differences from Pages to be aware of

- Pages builds with a custom esbuild script, npm, and its own lockfile
  (nteract's pnpm workspace explicitly excludes `apps/pages`). We are not
  copying that build; we only reuse components.
- Version drift: Pages pins `lucide-react 1.17`, nteract root `^0.513`,
  `pele 1.5.2` vs `1.8.0`. Pick current versions for this repo and let
  `resolve.dedupe` keep a single copy.
- nteract uses a Tailwind token set (`--background`, `--primary`, ...) with
  `.dark` class strategy (`@custom-variant dark (&:is(.dark *))`). Pages adds
  its own `theme.js` bootstrap in `<head>` to avoid a flash; we need an
  equivalent tiny inline script.

## Deployment shape

- `rsbuild build` -> `dist/` (hashed `static/js|css`, `index.html`).
  Upload `static/*` with `Cache-Control: public, max-age=31536000, immutable`
  and `index.html` with `no-cache`.
- SPA fallback must be configured on the host (R2 behind a Worker or CDN rule
  that serves `/index.html` for unknown non-asset paths). If we want zero
  routing config, use hash routing or per-route prerendered HTML instead.
- Auth: authsu issues cookies for `susu.dev` (`RP_ID: susu.dev`, origin
  `auth.susu.dev`). The SPA is served from the apex or a sibling subdomain and
  calls `auth.susu.dev` / `api.susu.dev` cross-origin with credentials, so
  authsu and the API need explicit CORS (`Allow-Origin` = the exact frontend
  origin, `Allow-Credentials: true`). That is not implemented in authsu yet
  (it currently serves only `/healthz` and `GET /api/first-run`).

## Open decisions

- **Router**: decided, React Router in data mode. Pages itself uses a
  hand-rolled History API router (`shared/routes.mjs`), so there was nothing to
  reuse either way. Revisit TanStack Router only if URL search-param state gets
  heavy.
- **Data layer**: TanStack Query for `api.susu.dev` calls; add when the first
  endpoint exists.
- **Frontend origin**: apex `susu.dev` vs `app.susu.dev`; drives cookie scope
  and CORS above.
- **Pages editor**: whether/when to embed (see above).
- **Lint/format/test**: decided. Biome (lint + format), Rstest with happy-dom
  and Testing Library, Istanbul coverage held at 100%, `tsc --noEmit`.
