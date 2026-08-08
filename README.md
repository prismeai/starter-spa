# `starter-spa`

> Build a Prisme.ai SPA (React frontend + backend automations) locally in VS Code, deploy to a workspace with one command.

This is the **SPA starter** in the [`prismeai/starter-*`](#related-starters) family. It ships the same React + Radix UI + Tailwind template the in-platform Builder seeds when you click **+ Page → New SPA**. Edit it locally, version it on GitHub, deploy via CI — your repo and the in-platform Builder stay in sync.

---

## Quick start

```bash
git clone https://github.com/prismeai/starter-spa my-app
cd my-app
npm install
cp .env.example .env
# Fill in PRISMEAI_API_URL, PRISMEAI_ACCESS_TOKEN, PRISMEAI_WORKSPACE_ID

npm run dev       # local Vite dev server with mocked sdk/workspace
npm run release   # build + deploy
```

After `npm run release`, your app is live at `<your-platform-ui>/apps/<workspace-slug>`.

---

## Prerequisites

- **Node.js 20+** and **npm**
- A **Prisme.ai workspace** you own
- A **personal access token** (see below)
- Your platform's **API URL** including `/v2` (e.g. `https://api.sandbox.prisme.ai/v2`)

### Minting a personal access token

1. Open your Prisme.ai platform UI and log in.
2. Go to **Settings → Access Tokens** (`/settings/tokens`).
3. Click **Create**, give it a name (e.g. `starter-deploy`) and an expiry date.
4. **Copy the token immediately** — the value is shown only once. Format: `at:<uuid>`.
5. Paste it into `.env` as `PRISMEAI_ACCESS_TOKEN=at:...`.

You can list, see days-until-expiry, and revoke your tokens from the same screen.

> **Alternative**: org-scoped API keys (created in the AI Governance app → API Keys) are also supported via `PRISMEAI_API_KEY`. Use ONE of `PRISMEAI_ACCESS_TOKEN` or `PRISMEAI_API_KEY`. Access tokens are preferred for individual contributors; API keys for shared CI service accounts.

---

## Project structure

```
.
├── automations/                      # DSUL automations — pushed to workspace.automations
│   ├── _auth.yml                     # auth guard — reject anonymous webhook callers (401)
│   ├── on-app-greeting-requested.yml
│   └── v1/status.yml                 # protected webhook — calls _auth first
├── imports/                          # DSUL imports — installed apps (empty by default)
├── index.yml                         # workspace metadata (optional; created by npm run pull)
├── security.yml                      # workspace RBAC (optional; created by npm run pull)
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
│
├── AGENTS.md                         # AI-agent instructions (CLAUDE.md, .cursorrules point here)
├── README.md
├── .env.example                      # copy to .env (gitignored)
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

**Two independent transport channels — by design:**

| What | How it gets to a workspace |
|---|---|
| DSUL artifacts (`automations/`, `index.yml`, `security.yml`, `imports/`) | **Workspace export/import zip** — these match the export format 1:1. Zip them up, drop into the in-builder Builder's "Import Workspace", done. Also pushed by `npm run deploy`. |
| React source (`src/`, `package.json`, configs) | **Git + npm** — clone the repo, `npm install`, edit, `npm run deploy`. The workspace import zip does NOT carry these (and shouldn't — large source trees don't belong in a portable DSUL archive). |

That's why `src/` is a normal JS layout (universal convention + the in-builder Builder hardcodes `src/App.tsx` as the SPA entry) while DSUL stays at root (zip-and-import compatible). The deploy script bridges them: pushes DSUL via the workspace API AND uploads each `src/*` file as `metadata.type=source` so the in-builder Builder's sandbox sees the same code.

You should normally only touch:

- `src/App.tsx` — your app
- New files under `src/components/`, `src/hooks/`, `src/pages/`, etc.
- `automations/*.yml` — your backend automations

---

## The host contract

In production, the platform loads `dist/bundle.js` and renders the **default export** of `src/App.tsx` with these props:

```ts
interface AppProps {
  sdk: SDK                                                // authenticated client
  user: { id: string; email: string; ... }                // current user
  workspace: { id: string; slug: string; name: string }   // the workspace hosting your app
  backends?: Record<string, { slug: string }>             // optional named backend workspaces
  agents?: Record<string, string>                         // optional pre-resolved agent IDs
}
```

> **Built-in apps and customer apps share the exact same loader and contract.** The platform's `AppRenderer` resolves a built-in app from a static manifest and a custom app via `GET /v2/pages/<slug>/_bundle`, but both paths converge on the same render call. What you build with this starter is loaded the same way as a first-party app shipped in the platform docker image.

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

The matching automation calls the `_auth` guard first, so anonymous callers get a
401 instead of a response (see [Webhook auth](#webhook-auth-important) below):

```yaml
when:
  endpoint: v1/status
do:
  - _auth:                       # reject anonymous callers with 401
      output: auth
  - conditions:
      '{{auth.error}}':
        - set:
            name: $http
            value: { status: '{{auth.status}}' }
        - set:
            name: result
            value: { error: '{{auth.message}}', code: '{{auth.error}}' }
        - break:
            scope: automation
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

## Webhook auth (important)

**Prisme.ai webhook endpoints are public by default.** A `when: endpoint: v1/status`
automation is reachable at `POST /workspaces/slug:<slug>/webhooks/v1/status` by
**anyone with the URL** — no session, no token. The platform does not gate webhooks
for you; the automation must gate itself.

Early versions of this starter shipped `v1/status` with no guard, so the endpoint
was open. That was the top piece of feedback we got. **How you gate a webhook is
your call** — the starter ships one simple, sensible default (the `_auth` guard),
but it is one option among several (see [Choosing an auth strategy](#choosing-an-auth-strategy)).

The shipped default: every protected webhook calls `_auth` first:

```yaml
do:
  - _auth:
      output: auth
  - conditions:
      '{{auth.error}}':
        - set: { name: $http, value: { status: '{{auth.status}}' } }
        - set: { name: result, value: { error: '{{auth.message}}', code: '{{auth.error}}' } }
        - break: { scope: automation }
  # ...your business logic — auth.user_id / auth.orgSlug / auth.auth_type are now trusted
```

`_auth` resolves the caller identity into a single `auth` object and rejects
anonymous callers with `401`. It recognises three caller types:

| `auth.auth_type` | When | `auth.user_id` |
|---|---|---|
| `user` | Browser call with `credentials: 'include'`, or a personal access token | the user's id |
| `apikey` | Org-scoped API key (`x-prismeai-api-key`) | the API key id |
| `workspace` | Another workspace listed in `config.trusted_source_workspaces` (opt-in) | — |

Because the SPA's `fetch` already sends `credentials: 'include'` (and `Authorization`
when `sdk.token` is set), a logged-in user sails through; an unauthenticated visitor
is rejected. **The front end changed nothing — the automation is what closed the hole.**

### Choosing an auth strategy

`_auth` is a deliberately thin "is this caller authenticated?" gate. It is **not**
the only way, and not always the right one. Pick per endpoint:

| Strategy | Use when | How |
|---|---|---|
| **`_auth` guard** (shipped default) | The endpoint should only serve logged-in Prisme.ai users / valid API keys | `- _auth: { output: auth }` then `break` on `{{auth.error}}` |
| **Public + custom check** | The endpoint is intentionally open, but you still filter by your own rule | `_auth: { allow_public: true }`, then branch on `{{auth.user_id}}` or any business condition |
| **Centralised RBAC** (access-manager) | You want per-resource permissions / sharing managed in **AI Governance** (roles, scopes, bindings) | `run: { module: access-manager, function: checkAccess, ... }` — advanced; see below |
| **Bring your own auth** | Auth lives in an external IdP / signed token / HMAC | a `fetch` to your verifier inside the automation; gate on its response |

There is no platform-imposed choice here — a bare webhook is open, and whatever
guard you write (or don't) is what runs.

### What the platform already hands you

Before you reach for any module, the API gateway has already resolved the caller and
exposed this in the automation context (this is what `_auth` reads):

| In the automation | Meaning |
|---|---|
| `{{user.id}}` | Logged-in user id (empty for anonymous / pure workspace-JWT calls) |
| `{{session.org.slug}}` | Active organisation slug |
| `{{session.org.groups}}` | Caller's groups in that org |
| `{{run.permissions}}` | Permission map from the caller's **AI Governance org role** — e.g. `{ "*": { manage: true } }`, `{ "storage:agents": { read: true } }` |
| `{{run.scopes}}` | Scope list from the org role or API key — e.g. `["*"]`, `["storage:agents:<id>"]` |
| `{{run.sourceWorkspaceId}}` | Calling workspace id (for cross-workspace calls) |
| `{{user.platformRole}}` | `superadmin` / `root` for platform admins |

So even without a module you can already authorise on `{{user.id}}`, the org, or the
role's permissions/scopes — those come straight from the roles defined in AI Governance.

### Option: centralise RBAC in AI Governance (access-manager)

For real per-resource access control and sharing (a document owned by user A, shared
with group B, org-readable), the platform ships the **`access-manager`** runtime
module. `checkAccess` combines two things:

1. **RBAC** — the `run.permissions` / `run.scopes` above (org roles from AI Governance).
2. **Bindings** — a per-resource ACL entry (`resourceType` + `resourceId` + principal
   `user|group|org|service_account` + `roleSlug`).

**You do not create or provision any collection for this.** The binding store is owned
and auto-migrated by the runtime module. You inject a resource through the module's own
API — the `insertBinding` function — and query/remove with `findBindings` /
`deleteOneBinding`. Same call surface as `checkAccess`:

```yaml
  - run:
      module: access-manager
      function: insertBinding      # register the resource + its owner in access-manager
      parameters:
        data:
          resourceType: documents
          resourceId: '{{doc_id}}'
          principalType: user
          principalId: '{{user.id}}'
          roleSlug: owner
      output: binding
```

```yaml
  - run:
      module: access-manager
      function: checkAccess
      parameters:
        action: read              # read | write | manage | delete
        resourceType: documents
        resourceId: '{{doc_id}}'  # omit + list:true to get grantedIds for a list view
        roles: '{{config.roles}}'
      output: access
  # access.granted / access.reason / access.grantedIds / access.isWorkspaceAdmin
```

The trade-off (why it is opt-in, not the default): **you own the resource lifecycle**.
Register an `owner` binding when a resource is created, and you cannot delete a
resource's last binding (a guard against orphaning access). No collection to manage,
but there is a lifecycle to respect. The `storage` workspace's `_auth` is the full
reference implementation of this pattern if you go this route. Keep it for when you
actually have resources to protect — a status endpoint does not need it.

### Leaving an endpoint public on purpose

Public-facing apps (`PRISMEAI_PUBLIC=true`, `user` is `null`) legitimately need open
endpoints. Opt in explicitly per endpoint — the default stays closed:

```yaml
  - _auth:
      allow_public: true      # anonymous callers pass through as auth_type=anonymous
      output: auth
```

### Cross-workspace calls

If another workspace calls this one with a workspace JWT, its `user.id` is not
populated — only `run.sourceWorkspaceId` identifies it. Set
`allow_trusted_workspaces: true` on the `_auth` call and list the caller's slug in
`config.trusted_source_workspaces` to accept it. Off by default.

### Guard every new webhook

When you add a `when: endpoint:` automation, add the `_auth` block at the top **unless
you deliberately want it open** (then use `allow_public: true` so the intent is
explicit in the YAML). `on-app-greeting-requested.yml` is an event listener
(`when: events:`), not a webhook — it is only reachable by callers already allowed to
emit events into the workspace, so it needs no guard.

---

## Local development

```bash
npm run dev
```

Opens `http://localhost:5173`. The mock host intercepts:

- `sdk.streamEvents(...)` — returns an in-memory event bus that locally echoes `app.greeting.requested` → `app.greeting.completed`.
- The webhook URL is built from `sdk.host`. If you set `VITE_PRISMEAI_API_URL` and `VITE_PRISMEAI_API_KEY` in `.env`, the REST tab will hit your real workspace.

---

## Build

```bash
npm run build
```

Compiles `src/App.tsx` → `dist/bundle.js` using esbuild:

- **Format**: CommonJS — the platform's loader expects `module.exports.default`.
- **Externals**: React, Radix, lucide-react, clsx, tailwind-merge, class-variance-authority, jotai, `@prisme.ai/sdk` — provided by the platform at runtime. **Never** bundle them or you will duplicate React and break hooks.
- **Minified**, no source map.

Full externals list: `scripts/externals.mjs`.

---

## Deploy

```bash
npm run deploy        # uploads + patches workspace
npm run release       # alias for npm run build && npm run deploy
```

The deploy script does eight steps in order:

| # | Step | What it writes | Skip with |
|---|---|---|---|
| 0 | **Conflict detection** | Reads `.prismeai/last-pull.json`, refuses if remote diverged from your last pull. Pre-flight check; no state change. | `--force` flag, `PRISMEAI_FORCE=true` |
| 1 | **Automations sync** | Walks `automations/**/*.yml`, parses each, upserts via `POST/PATCH /workspaces/:id/automations[/:slug]`. Deletes any remote slug not present locally. | `PRISMEAI_SKIP_AUTOMATIONS_SYNC=true` |
| 2 | **Source files sync** | Walks `src/` + root config files, SHA-256 hashes each, diffs against existing `metadata.type=source` files. Uploads new, replaces changed, deletes removed. | `PRISMEAI_SKIP_SOURCE_SYNC=true` |
| 3 | **Bundle upload** | `POST /workspaces/:id/files` (`public=true`) — returns the CDN URL. | — |
| 4 | **embed.js upload** | Fetches `${PRISMEAI_PLATFORM_URL}/embed.js` and uploads as a public file. Only needed for 3rd-party `<script>` embedding. | unset `PRISMEAI_PLATFORM_URL` |
| 5 | **Patch workspace config** | `PATCH /workspaces/:id` writes `config.value.bundles[<slug>] = { bundle, embed?, version, name, builtAt }`. **This is the live pointer `AppRenderer` reads on every page load.** | — |
| 6 | **Cleanup orphan bundles** | Lists all public `bundle.js` / `embed.js` files; deletes any not currently referenced in `bundles[*]`. Stops storage growth. | `PRISMEAI_SKIP_BUNDLE_CLEANUP=true` |
| 7 | **Smoke test** | Resolves `/pages/<slug>/_bundle`, fetches the bundle JS, parse-checks via `new Function(...)`, verifies the CJS exports pattern is present. Catches "deploy succeeded but bundle is broken". | `PRISMEAI_SKIP_SMOKE=true` |
| 8 | **Version snapshot** | `POST /workspaces/:id/versions` creates a Prisme.ai workspace version. | `PRISMEAI_SKIP_VERSION_SNAPSHOT=true` |

After successful deploy, the script also refreshes `.prismeai/last-pull.json` with the current workspace state so the next deploy doesn't trip conflict detection on changes you just pushed.

After deploy, hard-reload your browser to bypass any cached bundle.

If a step fails mid-deploy, the script prints a structured summary and per-step recovery guidance — what completed, what failed, what to do next. The atomic boundary is step 5: failures BEFORE it leave the live UI on the previous version (safe to retry); failures AFTER mean deploy succeeded but a side-effect failed (also safe).

### Multi-environment

Use one `.env` file per environment. The deploy and pull scripts pick the right one via `--env=<name>` flag or `PRISMEAI_ENV=<name>` env var:

```
.env                  # default (used when no --env or PRISMEAI_ENV)
.env.staging          # used by `npm run deploy -- --env=staging`
.env.production       # used by `PRISMEAI_ENV=production npm run release`
```

Each file should hold its own `PRISMEAI_API_URL`, `PRISMEAI_WORKSPACE_ID`, and `PRISMEAI_ACCESS_TOKEN` (you don't want sandbox credentials on a prod workspace).

The script prints which file it loaded at start (`· using .env.staging (env=staging)`) so you can't accidentally push dev code to prod.

All `.env*` files except `.env.example` are gitignored.

### Environment variables

| Var | Required | Purpose |
|---|---|---|
| `PRISMEAI_API_URL` | yes | Your platform's API URL **including `/v2`** (e.g. `https://api.acme.example.com/v2`) |
| `PRISMEAI_ACCESS_TOKEN` | one of these | Personal access token (`at:<uuid>`). Sent as `Authorization: Bearer ...` |
| `PRISMEAI_API_KEY` | one of these | Org-scoped API key. Sent as `x-prismeai-api-key`. Use access token instead when possible. |
| `PRISMEAI_WORKSPACE_ID` | yes | Short ID of the target workspace (e.g. `B4eoHS6`) |
| `PRISMEAI_PLATFORM_URL` | no | UI host (e.g. `https://app.acme.example.com`). Only needed for embed.js. |
| `PRISMEAI_PUBLIC` | no | `true` to open the app without login — renderer skips `/v2/me`, `user` is `null`. |
| `PRISMEAI_BUNDLE_SLUG` | no | Override the bundles[<key>] (default: workspace slug) |
| `PRISMEAI_APP_VERSION` | no | Version label written to workspace config (default `1.0.0`) |
| `PRISMEAI_HTTP_TIMEOUT` | no | Per-request timeout in ms (default `30000`) |
| `PRISMEAI_HTTP_RETRIES` | no | Max retries on 5xx / network errors (default `3`) |
| `PRISMEAI_BUNDLE_SIZE_WARN` | no | Bundle size warn threshold in bytes (default `512000` = 500 KB) |
| `PRISMEAI_BUNDLE_SIZE_MAX` | no | Bundle size hard limit in bytes (default `2097152` = 2 MB) |
| `PRISMEAI_FORCE` | no | `true` to bypass conflict detection |
| `PRISMEAI_SKIP_AUTOMATIONS_SYNC` | no | `true` to skip step 1 |
| `PRISMEAI_SKIP_SOURCE_SYNC` | no | `true` to skip step 2 |
| `PRISMEAI_SKIP_BUNDLE_CLEANUP` | no | `true` to skip step 6 |
| `PRISMEAI_SKIP_SMOKE` | no | `true` to skip step 7 |
| `PRISMEAI_SKIP_VERSION_SNAPSHOT` | no | `true` to skip step 8 |

---

## In-platform vs standalone (public)

Your deployed app is served at **both** URLs, always:

- **`/apps/<slug>`** — wrapped in the Platform Shell (sidebar, top-bar).
- **`/p/<slug>`** — standalone, full-viewport (no platform chrome).

The visitor's URL picks the chrome — you don't have to choose.

- **`public: true`** (`PRISMEAI_PUBLIC=true`): the renderer skips the `/v2/me`
  call, passes `user: null`, and the `_bundle` endpoint is public — visitors open
  the app **without signing in**. Ideal for public-facing pages; your app gates
  anything that actually needs a session.

> A public app has no session user, so any webhook it calls hits `_auth` as an
> anonymous caller and gets `401`. For the endpoints such an app is allowed to
> call without login, add `allow_public: true` to their `_auth` block (see
> [Webhook auth](#webhook-auth-important)). Keep everything else closed.

Enable public (no login) from `.env`:

```bash
PRISMEAI_PUBLIC=true
npm run release   # → reachable at /apps/<slug> and /p/<slug>, no login required
```

> Note: in standalone mode the host still mounts your app inside its own
> react-router `<Router>`, so do **not** render your own `<BrowserRouter>` /
> `<HashRouter>` (it throws "Router inside Router"). Drive routing from the
> hash, or let the host route.

---

## Undeploy

```bash
npm run undeploy                  # remove bundles[<workspace.slug>] from workspace config
npm run undeploy -- --slug=foo    # remove bundles[foo] (different key)
npm run undeploy -- --purge-files # also DELETE the underlying bundle/embed files
```

Inverse of step 5. Removes the live pointer so `/apps/<slug>` no longer serves a bundle. Source files and automations are left intact (they may be shared across multiple bundles or you may want to keep them for re-deploy). Without `--purge-files`, the bundle artifacts stay in workspace storage — next `npm run deploy` will clean them up via step 6.

Idempotent: running on a workspace that has no `bundles[<slug>]` is a noop.

## Pull workspace state

```bash
npm run pull
```

Inverse of deploy. Fetches:

- All workspace automations → written to `automations/<slug>.yml`
- All `metadata.type=source` files → written to local at their `metadata.path`

Use after a teammate edited automations or source files in the in-builder Builder, OR to bootstrap from an existing workspace. Writes a hash manifest to `.prismeai/last-pull.json` consumed by the deploy script's conflict detection.

> ⚠ Pull **overwrites local files without confirmation**. Commit your local changes first; review with `git diff` after.

### Conflict detection

Before pushing, the deploy script compares server-side hashes against `.prismeai/last-pull.json`. If anything changed remotely since your last pull, the deploy is **refused**:

```
✗ Deploy refused: 2 item(s) changed remotely since your last pull.
    ~ automations/v1/status.yml — modified remotely since last pull
    + src/NewComponent.tsx — added remotely since last pull
```

Resolution paths:
- `npm run pull` → fetch the remote changes, `git diff` to review, then `npm run release`
- `PRISMEAI_FORCE=true npm run release` → ⚠ overwrite remote changes with your local copy
- `npm run deploy -- --force` → same, skips the build step
- *(Heads-up: `npm run release -- --force` does NOT work — npm consumes `--force` as its own flag. Use the env var instead.)*

When **no manifest** exists (first deploy from a clean clone), conflict detection is skipped silently. When the manifest's `workspaceId` doesn't match `PRISMEAI_WORKSPACE_ID`, the deploy refuses with an explanation.

---

## Choose your source of truth

Both this repo and the in-builder Builder UI can write source files and automations to the same workspace. To avoid surprises, pick **one** of these three modes per workspace and commit to it:

### Mode A — Git only (recommended for customer-built apps)

All edits happen in VS Code. Nobody opens the in-builder Builder for source changes.

- Set `PRISMEAI_SKIP_SOURCE_SYNC=true` to avoid leaving stale files in the workspace.
- The deploy script then only writes the bundle + config + version snapshot.
- Code review happens in your git host (GitHub PRs, GitLab MRs).

### Mode B — Builder only

All edits happen in the platform UI. This starter isn't useful for that workflow — work directly in the in-builder Builder and use its own Deploy button.

### Mode C — Hybrid

Both ends edit. Treat the **workspace as the source of truth** and **always pull before deploying**.

1. Pull workspace state into local before editing.
2. Commit the pulled state to git as a checkpoint.
3. Make local edits.
4. `npm run release`.
5. Conflict detection refuses if a teammate edited remotely while you were working — pull first.

---

## Constraints worth knowing

### Tailwind / CSS

`npm run build` compiles `src/styles/globals.css` with Tailwind and **injects it into the bundle** at runtime (a `<style id="prismeai-app-styles">` appended on load). So your theme overrides, custom utilities, `@keyframes` and `@font-face` ship with the app — the deployed result matches local dev.

> Earlier versions of this starter relied solely on the platform's shared stylesheet, so anything beyond the platform's own utility set rendered unstyled in production. That's fixed: your compiled CSS is bundled. The platform stylesheet still loads too; your injected `<style>` is appended last, so your rules win. Keep the bundle lean — large `@font-face` files are better referenced by URL (CORS-enabled) than base64-embedded.

### lucide-react icons

The platform pre-loads a curated subset (~250 icons) for tree-shaking. Common ones (`ZapIcon`, `BotIcon`, `GlobeIcon`, `Loader2Icon`, `CheckCircleIcon`, ...) are guaranteed. If you import an icon and it renders as `undefined` at runtime (React error #130), it isn't in the subset — pick a different one or open a request to add it. **Brand logos (e.g. `Linkedin`) are typically NOT in the subset** — use an inline `<svg>` for those.

### Authentication context

When the platform mounts your app, the user is already authenticated and `sdk.token` is set. You do not need to sign in. For REST calls, **use `credentials: 'include'`** so the browser sends the auth cookie. The example in `src/App.tsx` does this.

### Bundle size

Aim to keep your bundle under ~500 KB minified. Tree-shake unused exports, code-split heavy panels with `React.lazy`, and don't import `lodash` whole — use the per-method imports.

---

## Secret hygiene

`.env` is gitignored by default. The deploy script warns at start if it's tracked anyway (force-added) — that means your token may be in commit history.

For long-term storage, prefer your OS keychain over a plaintext `.env`:

**macOS** — store once, fetch at deploy time:
```bash
security add-generic-password -s prismeai-sandbox -a $USER -w  # prompts silently
# Then in your shell or CI:
export PRISMEAI_ACCESS_TOKEN=$(security find-generic-password -s prismeai-sandbox -w)
npm run release
```

**Linux** (GNOME / `libsecret`):
```bash
secret-tool store --label="Prisme.ai sandbox" service prismeai-sandbox account $USER
export PRISMEAI_ACCESS_TOKEN=$(secret-tool lookup service prismeai-sandbox account $USER)
```

**Windows** (Credential Manager via `cmdkey`):
```cmd
cmdkey /generic:prismeai-sandbox /user:%USERNAME% /pass
```

**CI** (GitHub Actions / GitLab CI): use the platform's secrets store — never put the token in repo files. Inject as `PRISMEAI_ACCESS_TOKEN` env at job start.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module 'react'` at runtime | esbuild bundled React instead of treating it as external | Check `scripts/externals.mjs` — the package must be listed |
| `XIcon is not defined` | Icon not in the platform's curated lucide subset | Pick another icon |
| Webhook returns 401 | The `_auth` guard rejected the caller — either the request carries no session/token, or the endpoint is genuinely meant to be public | Logged-in user: ensure `credentials: 'include'` (and `Authorization` when `sdk.token` is set) on the `fetch()`. Public endpoint: add `allow_public: true` to the `_auth` call. See [Webhook auth](#webhook-auth-important) |
| Webhook returns 404 | Automation slug mismatch — `endpoint:` in the YAML must equal the path in the URL | Open the automation in the Builder, copy its endpoint |
| `streamEvents` never connects | Wrong workspace identifier | Use `workspace.id` (UUID), not `workspace.slug` — the events service requires the UUID for non-`slug:` identifiers |
| `npm run deploy` → `404 /v2/v2/...` | `PRISMEAI_API_URL` doesn't include `/v2`, or includes it twice | Set it to `https://api.example.com/v2` (one `/v2`, no trailing slash) |
| Deploy succeeds but app doesn't update | CDN cache | Hard-reload (Cmd+Shift+R) or wait ~30s |
| `Failed to upload bundle: server returned no file` | Token/key lacks write access to that workspace | Check the workspace's RBAC; the token's owner must be a workspace admin |
| Deploy fails with 401 | Token expired or wrong | Mint a new one in **Settings → Access Tokens**; re-check `PRISMEAI_API_URL` includes `/v2` |
| Deploy refused after a teammate edited in Builder | Conflict detection working as intended | Run `npm run pull` to fetch their changes, review with `git diff`, then `npm run release` |

---

## CI/CD

Two recipes ship with the starter:

- **GitHub Actions** — `.github/workflows/deploy.yml`. Triggers on push to `main` (and via manual `workflow_dispatch`). Uses Node 20, caches npm, runs `npm run release`.
- **GitLab CI** — `.gitlab-ci.yml`. Same shape. Includes commented branch-based env routing (`develop` → staging, `main` → production with manual approval).

### Setting secrets

| Where | How |
|---|---|
| GitHub | Repo **Settings → Secrets and variables → Actions → New repository secret** |
| GitLab | Project **Settings → CI/CD → Variables** — mark them **Masked** and **Protected** |
| Both | Add `PRISMEAI_API_URL`, `PRISMEAI_ACCESS_TOKEN`, `PRISMEAI_WORKSPACE_ID`. Optional: `PRISMEAI_PLATFORM_URL`, `PRISMEAI_BUNDLE_SLUG` |

The token used in CI should be a service-account or shared-account access token with explicit expiry. Rotate quarterly. Don't reuse a personal access token.

## Related starters

This is part of the [`prismeai/starter-*`](https://github.com/orgs/prismeai/repositories?q=starter-) family:

| Repo | What it's for |
|---|---|
| **`prismeai/starter-spa`** (this one) | React SPA + DSUL automations — full UI for end users |
| `prismeai/starter-mcp` | Workspace exposing automations as MCP tools, no UI |
| `prismeai/starter-webhooks` | Workspace with webhook-triggered automations only |
| `prismeai/starter-agent` | Agent-factory style workspace for LLM agents |

> Some starters in the family may not be published yet — check the org page for the current set.

---

## License

MIT — fork it, change it, ship it.
