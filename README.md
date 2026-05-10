# `starter-spa`

> Build a Prisme.ai SPA (React frontend + backend automations) locally in VS Code, deploy to a workspace with one command.

This is the **SPA starter** in the [Prisme.ai starter family](#related-starters). It ships the same React + Radix UI + Tailwind template the in-platform Builder seeds when you click **+ Page → New SPA**, lifted into a normal repo so you can edit it in your favorite editor, version it on GitHub, and ship it via CI. The deploy script is byte-compatible with the Builder's own **Deploy** button — your repo and the in-platform Builder stay in sync.

---

## Prerequisites

- **Node.js 20+** and **npm**
- A **Prisme.ai workspace** you own
- A **personal access token** (see below)
- The URL of **your Prisme.ai platform** (self-hosted, or `https://api.sandbox.prisme.ai/v2` for the public sandbox)

### Minting a personal access token

1. Open your Prisme.ai platform UI and make sure you're logged in.
2. Go to **Settings → Access Tokens** (URL: `/settings/tokens`).
3. Click **Create**, give it a name (e.g. `starter-deploy`) and an expiry date.
4. **Copy the token immediately** — the value is shown only once at creation. Format: `at:<uuid>`.
5. Paste it into `.env` as `PRISME_ACCESS_TOKEN=at:...`.

You can list, see days-until-expiry, and revoke your tokens from the same screen.

> **Alternative**: org-scoped API keys (created in the AI Governance app → API Keys) are also supported via `PRISME_API_KEY`. Use ONE of `PRISME_ACCESS_TOKEN` or `PRISME_API_KEY`. Access tokens are preferred for individual contributors; API keys for shared CI service accounts.

---

## Quick start

```bash
git clone <this-repo> my-app
cd my-app
npm install
cp .env.example .env
# Edit .env and fill in PRISME_API_URL, PRISME_API_KEY, PRISME_WORKSPACE_ID

npm run dev      # local Vite dev server with mocked sdk/workspace
npm run release  # build + deploy to your workspace
```

After `npm run release`, your app is reachable in your platform at `/apps/<workspace-slug>`.

---

## Project structure

The repo follows the **workspace export shape at root** (so `zip -r workspace.zip .` minus `node_modules`/`dist`/`.env` produces an import-compatible archive) plus standard JS conventions for the React app:

```
.
├── automations/                      # DSUL automations — pushed to workspace.automations
│   ├── on-app-greeting-requested.yml
│   └── v1/status.yml
├── imports/                          # DSUL imports — installed apps (empty in this starter)
├── index.yml                         # workspace metadata (optional; created by `npm run pull`)
├── security.yml                      # workspace RBAC (optional; created by `npm run pull`)
│
├── src/                              # React app — what gets bundled and deployed
│   ├── App.tsx                       # ← edit this. Default export is what the platform renders.
│   ├── main.tsx                      # local-dev only; the platform never runs this file.
│   ├── lib/
│   │   ├── utils.ts                  # cn() helper
│   │   └── mockHost.ts               # local-dev stub for sdk + workspace props
│   ├── components/ui/                # shadcn-style components (button, card, dialog, ...)
│   └── styles/globals.css
│
├── scripts/                          # build + deploy + pull tooling (Node)
│   ├── build.mjs                     # esbuild → dist/bundle.js (CJS, externals stripped)
│   ├── deploy.mjs                    # push: automations + source files + bundle + config + version
│   ├── pull.mjs                      # pull workspace state → local
│   └── externals.mjs                 # canonical list of host-provided modules
│
├── AGENTS.md                         # AI-agent instructions (CLAUDE.md, .cursorrules point here)
├── TODO.md                           # roadmap for production-ready v1
├── README.md
├── .env.example                      # copy to .env (gitignored)
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

**Why this layout**: The DSUL artifacts at root (`automations/`, `index.yml`, `security.yml`, `imports/`) match the workspace export format 1:1 — the in-builder Builder's "Import Workspace" feature can ingest a zip of these directly. The React app stays under `src/` because that's both the universal JS convention and the path the platform's in-builder Builder hardcodes as the SPA entry.

You should normally only touch:

- `src/App.tsx` — your app
- New files under `src/components/`, `src/hooks/`, `src/pages/`, etc.

The files in `src/components/ui/` and `src/lib/utils.ts` are scaffolded shadcn-style components — feel free to edit them but they exist as a sensible default.

---

## The host contract

In production, the Prisme.ai platform loads `dist/bundle.js` and renders the **default export** of `src/App.tsx` with these props:

```ts
interface AppProps {
  sdk: SDK                                                // authenticated client (host singleton)
  user: { id: string; email: string; ... }                // current user
  workspace: { id: string; slug: string; name: string }   // the workspace hosting your app
  backends?: Record<string, { slug: string }>             // optional named backend workspaces
  agents?: Record<string, string>                         // optional pre-resolved agent IDs
}
```

> **Built-in apps and customer apps share the exact same loader and contract.**
> The platform's `AppRenderer` resolves a built-in app from a static manifest and a custom app via `GET /v2/pages/<slug>/_bundle`, but both paths converge on `loadAppBundle(url)` and the **same render branch** (`AppRenderer.tsx:244-256`). What you build with this starter is loaded the same way as a first-party app shipped in the platform docker image.

Locally (`npm run dev`), `src/main.tsx` provides a stub via `src/lib/mockHost.ts` so the demo renders without a live backend.

### Calling your workspace

The starter ships with two reference patterns — see `src/App.tsx` for full code.

**REST webhook** (synchronous request → JSON response):

```ts
const url = sdk.host + '/workspaces/slug:' + workspace.slug + '/webhooks/v1/status'
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({}),
})
const data = await res.json()
```

The matching automation in your workspace:

```yaml
when:
  endpoint: v1/status
do:
  - set:
      name: result
      value: { status: ok, timestamp: '{{run.date}}' }
output: '{{result}}'
```

**WebSocket events** (asynchronous fire-and-listen):

```ts
const events = await sdk.streamEvents(workspace.id, { 'source.sessionId': true })
events.on('app.greeting.completed', (data) => { /* ... */ })
events.emit('app.greeting.requested', { name: 'World' })
```

The `'source.sessionId': true` filter ensures you only receive events tied to *this* user session. The matching automation listens for `app.greeting.requested` and emits `app.greeting.completed` back.

---

## Local development

```bash
npm run dev
```

Opens `http://localhost:5173`. The mock host intercepts:

- `sdk.streamEvents(...)` — returns an in-memory event bus that locally echoes `app.greeting.requested` → `app.greeting.completed`.
- The webhook URL is built from `sdk.host`. If you set `VITE_PRISME_API_URL` and `VITE_PRISME_API_KEY` in `.env`, the REST tab will hit your real workspace.

The Tabs panel is a demo. Replace it with your actual UI once you understand the patterns.

---

## Build

```bash
npm run build
```

Compiles `src/App.tsx` → `dist/bundle.js` using esbuild:

- **Format**: CommonJS (the platform's loader expects `module.exports.default`).
- **Externals**: React, Radix, lucide-react, clsx, tailwind-merge, class-variance-authority, jotai, `@prisme.ai/sdk` — these are provided by the platform at runtime. **Never** bundle them or you will duplicate React and break hooks.
- **Minified**, no source map.

Full externals list lives in `scripts/externals.mjs`.

---

## Deploy

```bash
npm run deploy        # uploads + patches workspace
npm run release       # alias for npm run build && npm run deploy
```

The deploy script mirrors the **in-builder Deploy button** (`BundlePublishModal.handlePublish` → `useAppBuild.buildAndDeploy`) plus an extra step for DSUL automations:

| # | Step | What it writes | Skip with |
|---|---|---|---|
| 0 | **Automations sync** | Walks `automations/**/*.yml`, parses each, diffs against `workspace.automations`. Creates new, updates changed, deletes removed. | `PRISME_SKIP_AUTOMATIONS_SYNC=true` |
| 1 | **Source sync** | Walks `src/` + root config files, SHA-256 hashes each, diffs against existing `metadata.type=source` files. Uploads new, replaces changed, deletes removed. | `PRISME_SKIP_SOURCE_SYNC=true` |
| 2 | **Bundle upload** | `POST /workspaces/:id/files` (`public=true`) — returns the CDN URL. | — |
| 3 | **embed.js upload** | Fetches `${PRISME_PLATFORM_URL}/embed.js` and uploads as a public file. Only needed for 3rd-party `<script>` embedding. | unset `PRISME_PLATFORM_URL` |
| 4 | **Patch workspace config** | `PATCH /workspaces/:id` writes `config.value.bundles[<slug>] = { bundle, embed?, version, name, builtAt }`. **This is the live pointer `AppRenderer` reads on every page load.** | — |
| 5 | **Version snapshot** | `POST /workspaces/:id/versions` creates a Prisme.ai workspace version. | `PRISME_SKIP_VERSION_SNAPSHOT=true` |

### Pulling workspace state → local

```bash
npm run pull
```

Inverse of deploy. Fetches:
- All workspace automations → written to `automations/<slug>.yml`
- All `metadata.type=source` files → written to local at their `metadata.path`

Use after a teammate edited automations or source files in the in-builder Builder, OR to bootstrap from an existing workspace. Writes a hash manifest to `.prisme/last-pull.json` for future conflict detection (not yet enforced — see TODO.md P0 #2).

> ⚠ Pull **overwrites local files without confirmation**. Commit your local changes first; review with `git diff` after.

After deploy, hard-reload your browser to bypass any cached bundle.

### Environment variables

| Var | Required | Purpose |
|---|---|---|
| `PRISME_API_URL` | yes | Your platform's API URL **including `/v2`** (e.g. `https://api.acme.example.com/v2`) |
| `PRISME_ACCESS_TOKEN` | one of these | Personal access token (`at:<uuid>`). Sent as `Authorization: Bearer ...` |
| `PRISME_API_KEY` | one of these | Org-scoped API key. Sent as `x-prismeai-api-key`. Use access token instead when possible. |
| `PRISME_WORKSPACE_ID` | yes | Short ID of the target workspace (e.g. `B4eoHS6`) |
| `PRISME_PLATFORM_URL` | no | UI host (e.g. `https://app.acme.example.com`). Only needed for embed.js. |
| `PRISME_BUNDLE_SLUG` | no | Override the bundles[<key>] (default: workspace slug) |
| `PRISME_APP_VERSION` | no | Version label written to workspace config (default `1.0.0`) |
| `PRISME_SKIP_AUTOMATIONS_SYNC` | no | `true` to skip step 0 |
| `PRISME_SKIP_SOURCE_SYNC` | no | `true` to skip step 1 |
| `PRISME_SKIP_VERSION_SNAPSHOT` | no | `true` to skip step 5 |

---

## Choose your source of truth

Step 1 (source sync) writes your `src/*` files into the workspace as `metadata.type=source` files — exactly what the in-builder Builder's `useSandbox` reads. Both ends can technically write, but **today this starter only pushes; it does not pull**:

```
Local repo  ────  npm run deploy  ────▶  workspace files (metadata.type=source)
                                          ▲
                                          │  in-builder Builder also writes here
Builder UI / AI chat  ────────────────────┘  (when teammates Save)

                    ⚠  No automated pull from workspace → local.
                       Builder edits are invisible to git until manually
                       fetched (see "Pulling from the Builder" below).
```

> **Last write wins.** If a teammate edits in the Builder and you then run `npm run deploy` without manually pulling first, **the source-sync step will silently overwrite their edits** with your local copy. There is no conflict detection in v0.1.

To avoid surprises, pick **one** of these three modes per workspace and commit to it:

### Mode A — Git only (recommended for customer-built apps)

All edits happen in VS Code. Nobody opens the in-builder Builder for source changes.

- Set `PRISME_SKIP_SOURCE_SYNC=true` to avoid leaving stale files in the workspace.
- The deploy script then only writes the bundle + config + version snapshot.
- Code review happens in your git host (GitHub PRs, GitLab MRs).

### Mode B — Builder only

All edits happen in the platform UI. This starter isn't useful for that workflow — work directly in the in-builder Builder and use its own Deploy button.

### Mode C — Hybrid (advanced, requires discipline)

Both ends edit. Treat the **workspace as the source of truth** and **always pull before deploying**.

1. Pull workspace state into local before editing (see recipe below).
2. Commit the pulled state to git as a checkpoint.
3. Make local edits.
4. `npm run deploy`.
5. Coordinate with teammates via async messaging — no git lock equivalent on the workspace side.

Until v0.2 ships `npm run pull`, the recipe is manual.

### Pulling from the Builder (manual recipe — until v0.2)

```bash
# Requires: jq, curl
source .env
mkdir -p .pull-cache && cd .pull-cache

# 1. List source files in the workspace
curl -sS "$PRISME_API_URL/workspaces/$PRISME_WORKSPACE_ID/files?metadata.type=source&limit=1000" \
  -H "Authorization: Bearer $PRISME_ACCESS_TOKEN" > files.json

# 2. Download each file to its metadata.path
jq -r '.[] | "\(.url)\t\(.metadata.path)"' files.json | while IFS=$'\t' read -r url path; do
  mkdir -p "$(dirname "$path")"
  curl -sS "$url" -H "Authorization: Bearer $PRISME_ACCESS_TOKEN" -o "$path"
  echo "← $path"
done

# 3. Diff against your repo
cd .. && diff -r .pull-cache src
# Inspect, then copy the desired bits over and rm -rf .pull-cache
```

---

## Constraints worth knowing

### Tailwind utility classes

Your bundle does **not** ship CSS. The platform serves a single Tailwind stylesheet that all hosted apps share. **Only utility classes already present in that stylesheet will style your app.** The classes used in this starter (`bg-background`, `text-muted-foreground`, `rounded-md`, the standard color/spacing/layout palette) are guaranteed because they match the platform's own design system. Exotic classes may not render — stick to the standard set or use inline `style={...}`.

### lucide-react icons

The platform pre-loads a curated subset (~250 icons) for tree-shaking. Common ones (`ZapIcon`, `BotIcon`, `GlobeIcon`, `Loader2Icon`, `CheckCircleIcon`, ...) are guaranteed. If you import an icon and it renders as `undefined` at runtime, it isn't in the subset — pick a different one or open a request to add it.

### Authentication context

When the platform mounts your app, the user is already authenticated and `sdk.token` is set. You do not need to sign in. For REST calls, **use `credentials: 'include'`** so the browser sends the auth cookie. The example in `src/App.tsx` does this.

### Bundle size

Aim to keep your bundle under ~500 KB minified. Tree-shake unused exports, code-split heavy panels with `React.lazy`, and don't import `lodash` whole — use the per-method imports.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module 'react'` at runtime | esbuild bundled React instead of treating it as external | Check `scripts/externals.mjs` — the package must be listed |
| `XIcon is not defined` | Icon not in the platform's curated lucide subset | Pick another icon; report the missing one to the platform team |
| Webhook returns 401 | Missing auth cookie on the request | Add `credentials: 'include'` to the `fetch()` |
| Webhook returns 404 | Automation slug mismatch — `endpoint:` in the YAML must equal the path in the URL | Open the automation in the Builder, copy its endpoint |
| `streamEvents` never connects | Wrong workspace identifier | Use `workspace.id` (UUID), not `workspace.slug` — the events service requires the UUID for non-`slug:` identifiers |
| `npm run deploy` → `404 /v2/v2/...` | `PRISME_API_URL` doesn't include `/v2`, or includes it twice | Set it to `https://api.example.com/v2` (one `/v2`, no trailing slash) |
| Deploy succeeds but app doesn't update | CDN cache | Hard-reload (Cmd+Shift+R) or wait ~30s |
| `Failed to upload bundle: server returned no file` | Token/key lacks write access to that workspace | Check the workspace's RBAC; the token's owner must be a workspace admin |
| Deploy fails with 401 | Token expired or wrong | Mint a new one in **Settings → Access Tokens**; re-check `PRISME_API_URL` includes `/v2` |
| Source sync deletes a teammate's edits | They edited in the Builder but you ran `npm run deploy` without pulling first | Set `PRISME_SKIP_SOURCE_SYNC=true` for solo deploys, or coordinate via git PRs |

---

## Limitations & roadmap

This is **v0.1**. Things this starter does NOT do today, with the intended path forward:

| Gap | Today | Planned |
|---|---|---|
| Pull workspace edits → local | Manual `curl` recipe (above) | `npm run pull` script |
| Conflict detection on deploy | Last write wins | Refuse if remote source-files diverged from last `pull` |
| Bundle file accumulation | Each deploy uploads a new `<hash>.bundle.js`; old ones stay | `npm run prune` cleanup script |
| Auth UX | Paste `at:<uuid>` from `/settings/tokens` into `.env` | `prisme login` CLI (OIDC PKCE + local cache) |
| Multi-environment | Single `.env` | `.env.development` / `.env.staging` / `.env.production` |
| CI/CD | Run `npm run release` manually | GitHub Actions + GitLab CI examples |
| Smoke test after deploy | None | Auto-fetch `/v2/pages/<slug>/_bundle` and verify HTTP 200 + `module.default` |
| HTTP retries / timeouts | Default fetch (waits forever) | Bounded retries on 5xx, configurable timeout |
| Bundle size guard | None | Warn at >500 KB, fail at >2 MB |
| Partial-failure recovery | Workspace can be left in inconsistent state | Two-phase deploy: stage all files, then atomically swap the bundles[<slug>] pointer |
| `npm run undeploy` | None | Delete `bundles[<slug>]` from workspace config + revoke files |
| CSS support in bundle | Not bundled (relies on platform CSS) | Optional CSS injection via `<style>` tag at runtime |
| Test setup | None | Vitest + a sample test for App.tsx |
| Linting / formatting | None | ESLint + Prettier configs |
| Type sharing | `AppProps` duplicated in `App.tsx` and `mockHost.ts` | Extract to `src/types.ts` |

See `TODO.md` for a prioritized roadmap.

---

## Going further

- **Multiple pages**: split your app under `src/pages/` and add a tiny client-side router (`useState` works, or import `react-router-dom` — host-provided external).
- **Calling other backends**: install named backends in the platform and read them from the `backends` prop instead of hardcoding slugs.
- **Streaming responses**: subscribe to multiple event types via `events.on(...)`; backends can emit progress events and a final `*.completed`.
- **CI**: add a GitHub Action that runs `npm run release` on push to `main`, with the access token in repo secrets.

---

## Related starters

This is part of the [`prismeai/starter-*`](https://github.com/orgs/prismeai/repositories?q=starter-) family:

| Repo | What it's for |
|---|---|
| **`prismeai/starter-spa`** (this one) | React SPA + DSUL automations — full UI for end users |
| `prismeai/starter-mcp` *(planned)* | Workspace exposing automations as MCP tools, no UI |
| `prismeai/starter-webhooks` *(planned)* | Workspace with webhook-triggered automations only |
| `prismeai/starter-agent` *(planned)* | Agent-factory style workspace for LLM agents |

---

## License

MIT — fork it, change it, ship it.
