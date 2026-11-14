# `starter-spa`

> Build a **full-stack agentic app** on Prisme.ai locally in VS Code: a React front end, declarative automations, MCP tools and an agent that works next to your app. Deploy it to a workspace with one command.

What you get, working out of the box:

| Layer | In the starter | In your app |
|---|---|---|
| **Front end** | `src/App.tsx`, a guided example of every mechanism | Your pages, in React, with any npm package |
| **Backend** | `automations/`: a webhook, an event listener, an auth guard | Your business logic as declarative YAML automations, called with the user's session |
| **Tools** | `automations/mcp.yml`: an MCP server with a `hello` tool | Tools your app and your agent share |
| **Agent** | `app.agent`: the chat of an agent, next to the app | An agent that sees what is on screen and drives the app with its buttons |
| **Chat views** | `src/views/HelloCard.tsx`, shown by `hello` in the conversation | Cards, forms, charts your tools show in the chat |

The app is in the **isolated** format, the format the Builder creates by default: it embeds its own libraries (React, Radix, lucide, the Prisme.ai app kit) and reaches the platform only through its `app` object. It ships the same guided example as the Builder's **+** on **Pages** ("Example · Full-stack agentic app"): edit it here, version it in Git, deploy from CI, or open it in the Builder, the code is the same.

Working on an app in the older **shared** format? Use the [`legacy-shared`](https://github.com/prismeai/starter-spa/tree/legacy-shared) branch.

---

## Quick start

```bash
git clone https://github.com/prismeai/starter-spa my-app
cd my-app
npm install
cp .env.example .env
# Fill in PRISMEAI_API_URL, PRISMEAI_ACCESS_TOKEN, PRISMEAI_WORKSPACE_ID

npm run dev        # the app in your browser, its workspace simulated
npm run dev:live   # same, with your workspace's webhooks and MCP tools
npm run release    # build + deploy
```

After `npm run release`, the app is live at `<your-platform>/apps/<workspace-slug>` and `/p/<workspace-slug>`.

Nothing is fetched from a public registry beyond your usual npm dependencies: the app kit is in `vendor/` (see [The app kit](#the-app-kit)).

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

## How it works

```
 your repo                          the platform, in the user's browser
 ─────────                          ───────────────────────────────────
 src/App.tsx ──npm run build──▶ app.<hash>.js ──▶ page /apps/<slug>, /p/<slug>
   uses the `app` object             (React, kit,      the page mounts the app in a
                                      your code)        shadow root and answers `app`
                                                         │
             app.webhooks.call ──────────────────────────┼──▶ webhook  ─┐
             app.callServerTool ─────────────────────────┼──▶ mcp      ─┤ _auth checks the
             app.events.on / emit ───────────────────────┼──▶ events    │ user's session
             app.agent.open ─────────────────────────────┘   agent chat next to the app
```

- **One bundle per view**, self-contained: a platform upgrade never changes a deployed app; deploy again to take library fixes.
- **No token in the app**: the page holds the user's session and makes the calls. The app reaches only its own workspace.
- **Same code in a page and in the chat**: a view in `src/views/` is built like the app, with the same `app` object, and a tool shows it in the conversation (MCP Apps). The starter's `hello` tool shows `src/views/HelloCard.tsx`: see [Show a view in the chat](#show-a-view-in-the-chat).

---

## Project structure

```
.
├── prisme.app.json          # {"format": "isolated"}: the Builder opens the app in this format
├── src/
│   ├── App.tsx              # the app: default export, receives { app }
│   ├── pages/Home.tsx       # the guided example: one tile per mechanism
│   ├── pages/Dashboard.tsx  # every step, with the file and the code it uses
│   ├── components/ui.tsx    # a card, a dialog in app.portalContainer
│   ├── lib/router.tsx       # routes mirrored in the page URL (app.navigation)
│   ├── lib/hello.ts         # calls the "hello" MCP tool
│   ├── styles.css           # plain CSS with the host's theme variables
│   ├── views/HelloCard.tsx  # a view the hello tool shows in the chat
│   ├── main.tsx, dev/       # local development only (npm run dev)
├── automations/             # declarative automations (YAML), pushed by npm run deploy
│   ├── _auth.yml            # the guard every webhook calls first
│   ├── v1/status.yml        # a webhook (app.webhooks)
│   ├── mcp.yml              # the MCP server: tools, and the view of hello (resources/read)
│   └── on-app-greeting-requested.yml   # an event listener (app.events)
├── vendor/@prisme.ai/mcp-apps/   # the app kit: JS + types, copied from the platform
├── scripts/                 # build, deploy, pull, undeploy, sync-kit, check
└── AGENTS.md                # instructions for AI coding agents
```

Replace the example pages with your own; keep `src/App.tsx` as the entry.

---

## The `app` object

`src/App.tsx` exports a component that receives `{ app }`. Everything the app does with the platform goes through it:

| Need | Code | Example in the starter |
|---|---|---|
| Who is signed in | `app.user` (absent on a public page) | Who is here |
| Call a webhook of the workspace | `await app.webhooks.call('v1/status', { method: 'POST', body: {} })` | Your backend |
| Real-time events | `app.events.on('app.greeting.completed', cb)`, `await app.events.emit('app.greeting.requested', { name })` | Real time |
| A tool of the workspace MCP server | `await app.callServerTool('hello', { name })` | Shared tools |
| The app's agent | `app.agent.open()`, `app.updateModelContext(...)` | Your agent |
| Buttons the agent draws (A2UI) | `app.events.on('agent.action', cb, { scope: 'page' })` | Agent buttons |
| Routes in the page URL | `app.navigation.current()`, `navigate(path)`, `onChange(cb)` | `src/lib/router.tsx` |
| Files | `app.files.upload(blob, { public })`, `app.files.download(urlOrBlob, name)` | |
| Values kept per user and app | `app.storageGet / storageSet / storageDelete / storageKeys` | |
| Menus and dialogs inside the app | `container={app.portalContainer}` on a portal | `src/components/ui.tsx` |

Each capability is announced by the host: check `app.hasCapability(...)` (`WEBHOOKS_EXTENSION`, `AGENT_EXTENSION`…) before using it in code that can also run in the chat. Types come with the kit: your editor completes `app.` out of the box.

There is no `@prisme.ai/sdk` in an isolated app and no `fetch` with a token: to reach another workspace or an external API, call one of your automations, which makes the call server side, with the user's context.

---

## Your app's agent

An app can have an **agent**: its chat opens next to the app, floating over the page or docked as a column beside it on a wide page. The user asks about what is on screen; the agent answers with its own tools and starters, as in Secure Chat, and can draw buttons the app reacts to.

### Give the app an agent

Pick an agent of Agent Factory, then deploy:

```bash
# .env
PRISMEAI_APP_AGENT=<agent id>     # from the agent's URL in Agent Factory
```

`npm run release` writes it in `bundles[<slug>].agent`. In the Builder, the same setting is **Deploy → Agent of the app**. Unset, the variable keeps the agent already set; empty, it removes it.

The page offers the agent only to a user who can use it (owner, shared with, or published): for anyone else, `app.hasCapability(AGENT_EXTENSION)` is false and there is no chat.

### Drive it from the app

```ts
import { AGENT_EXTENSION } from '@prisme.ai/mcp-apps'

if (app.hasCapability(AGENT_EXTENSION)) {
  const name = app.agent.name()          // "Sales assistant"
  await app.agent.open()                 // opens its chat next to the app
  await app.agent.close()
}
```

Call `open()` from a user action (a click): the page limits bursts of opens and closes.

### Tell it what is on screen

```ts
await app.updateModelContext({
  content: [{ type: 'text', text: 'The user is looking at the order #1042: 3 items, 1,200 EUR, pending approval.' }],
})
```

The latest context goes with the user's next question, so "can I approve this?" needs no copy-paste. Update it when the screen changes (a selected record, a filter); keep it short and leave secrets out.

### React to its buttons (A2UI)

The agent can answer with interactive components (A2UI): cards, forms, buttons. A click reaches the app at once, as a page event:

```ts
app.events.on('agent.action', (event) => {
  const { name, data } = event.payload as { name: string; data: Record<string, unknown> }
  if (name === 'approve') openApprovalForm(data)
}, { scope: 'page' })
```

`name` is the action the agent wrote on the button, `data` the values of its form. The agent needs an A2UI tool that waits for the user (`wait_for_action: true`). Nothing goes to the server: the app decides what the click does.

### Share your tools with it

Add the app's MCP server to the agent (Agent Factory → the agent → MCP servers):

- URL: `<PRISMEAI_API_URL>/workspaces/<workspace id>/webhooks/mcp`
- No header: the platform calls a server it hosts **as the user who talks to the agent**, so `_auth` sees that user (`auth_type: user`) and the tool runs with their rights.

The app calls `hello` with `app.callServerTool`, the agent calls the same tool in the conversation, and the result shows as the `hello-card` view (next section). One backend, two ways in, the same user and the same rights.

An org API key (`x-prismeai-api-key` header) is only for a caller without a user: a scheduled automation, a system outside the platform. The tool then sees the key, not a person.

### Try it in the starter

The home page's **Your agent** and **Agent buttons (A2UI)** tiles run the code above (`src/pages/Dashboard.tsx`, `AgentStep` and `AgentButtonsStep`):

1. Set `PRISMEAI_APP_AGENT`, `npm run release`, open `/apps/<slug>`.
2. **Your agent** → **Ask** (followed by the agent's name): the chat opens, and knows you are on that step.
3. **Agent buttons (A2UI)** → open the agent, ask "Show me an approval card for a 1,200 EUR laptop", click **Approve**: the app shows the action it received.

Locally, `npm run dev` simulates the agent: `open()` sends an `agent.action` after a moment, so the A2UI step can be tried without the platform.

---

## Show a view in the chat

When an agent calls the `hello` tool, the chat shows `src/views/HelloCard.tsx` under the tool call: the greeting, a button that calls `hello` again from the view, and one that proposes a message to the user.

1. **The view**: a file in `src/views/` (`HelloCard.tsx` → view `hello-card`), a component that receives `{ app }`. `useToolInput(app)` and `useToolResult(app)` (from `@prisme.ai/mcp-apps/react`) give the tool call it shows.
2. **The build**: `npm run build` makes `dist/hello-card.<hash>.js`; `npm run deploy` uploads it as a workspace asset with the app's sharing and writes its path in `bundles[<slug>].views["hello-card"]`.
3. **The tool**: in `automations/mcp.yml`, `tools/list` declares `hello` with `_meta.ui.resourceUri: ui://app/hello-card`.
4. **The page**: `mcp` answers `resources/read` for `ui://app/hello-card` with an HTML page that **holds** the view's code. It reads the bundle itself, as the user who asks: a private app's view stays private, and a user who cannot open the app gets no view (`View not available to this user`). The chat's frame runs without the user's session, so it could not download a private file on its own; with the code inline, it has nothing to download.
5. **The agent**: give an agent the app's MCP server ([Share your tools with it](#share-your-tools-with-it)) and ask it to say hello to someone.

The view's actions go through the agent: `app.callServerTool` runs with the agent's tool permissions and approvals, `app.sendMessage` asks the user before filling the composer. A view has no `app.webhooks` and no workspace events in the chat. The model never sees the view's code: it gets the tool's result, the chat reads the view apart.

Locally, `npm run dev` opens a view with `?view=<name>` (`http://localhost:5173/?view=hello-card`), as if the tool had just shown it.

To add a view: a file in `src/views/`, a tool that points at `ui://app/<view-name>`, and a `resources/read` branch in `mcp.yml` like the `hello-card` one. See [MCP Apps views](https://docs.prisme.ai/products/agent-factory/mcp-app-views) for the details (display modes, CSP, errors).

---

## Webhook auth (important)

**Prisme.ai webhook endpoints are public by default.** A `when: endpoint: v1/status`
automation is reachable at `POST /workspaces/slug:<slug>/webhooks/v1/status` by
**anyone with the URL** — no session, no token. The platform does not gate webhooks
for you; the automation must gate itself.

**How you gate a webhook is your call** — the starter ships one simple, sensible default (the `_auth` guard),
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
| `user` | The app (`app.webhooks`, `app.callServerTool`: the page adds the session), or a personal access token | the user's id |
| `apikey` | Org-scoped API key (`x-prismeai-api-key`) | the API key id |
| `workspace` | Another workspace listed in `config.trusted_source_workspaces` (opt-in) | — |

`app.webhooks.call()` and `app.callServerTool()` go through the page, which adds the
signed-in user's session: a logged-in user sails through, an anonymous caller is
rejected. The app never holds a token. An **agent** given the `mcp` server calls it
as the user who talks to it: the platform carries that user's identity to the
servers it hosts, so `_auth` resolves them as `user` too.

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

Public-facing apps (`PRISMEAI_SHARING=public`, `user` is `null`) legitimately need open
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
emit events into the workspace, so it needs no guard. `mcp` is a webhook like any
other: it is guarded.

---

## Local development

```bash
npm run dev        # http://localhost:5173
npm run dev:live   # same, wired to your workspace
```

`src/main.tsx` mounts the app with a local `app` object (`src/dev/devApp.ts`), checked by TypeScript against the kit's:

| | `npm run dev` | `npm run dev:live` |
|---|---|---|
| `app.webhooks`, `app.callServerTool` | Simulated answers | Your workspace, through the Vite proxy (`/__prisme`), which adds the token of `.env` server side: the browser never sees it |
| `app.user` | A local user | You (`/me` with your token) |
| `app.events` | Simulated: `app.greeting.requested` answers `app.greeting.completed` | Simulated |
| `app.agent` | Simulated: `open()` then sends an `agent.action`, to try the A2UI step | Simulated |

`dev:live` calls the deployed automations: run `npm run deploy` once first. The agent and the chat need the platform: deploy, then open `/apps/<slug>`.

---

## Build

```bash
npm run build
```

One self-contained bundle per view, as the Builder builds them:

- `src/App.tsx` → `dist/app.<hash>.js`: the full app, shown at `/apps/<slug>` and `/p/<slug>`;
- `src/views/<Name>.tsx` → `dist/<name>.<hash>.js`: a view a tool shows in the chat (`HelloCard.tsx` → `hello-card`);
- `dist/manifest.json`: the versions copied in (kit, React, your dependencies) and the views.

Each bundle is an IIFE with everything in it; its generated entry starts your component with the kit's `mountView`. Imported `.css` files go to the kit, which puts them where the view renders (its shadow root in a page, its frame in the chat); a `:root` rule also gets a `:host` twin, so theme variables apply in both. Size guard: warning above 1 MB, failure above 4 MB per view (`PRISMEAI_BUNDLE_SIZE_WARN`, `PRISMEAI_BUNDLE_SIZE_MAX`).

---

## Deploy

```bash
npm run deploy        # uploads + patches the workspace
npm run release       # npm run build && npm run deploy
```

| # | Step | What it does | Skip with |
|---|---|---|---|
| — | **Format guard** | Refuses if `bundles[<slug>]` is an app in the shared format: deploying would replace it and its sources. Read only. | `PRISMEAI_ALLOW_FORMAT_SWITCH=true` |
| 0 | **Conflict detection** | Refuses if the workspace changed since your last pull (`.prismeai/last-pull.json`). No state change. | `--force`, `PRISMEAI_FORCE=true` |
| 1 | **Automations sync** | Upserts `automations/**/*.yml`; deletes remote automations not present locally. | `PRISMEAI_SKIP_AUTOMATIONS_SYNC=true` |
| 2 | **Sources sync** | Uploads `src/`, `prisme.app.json` and the root configs as workspace assets under `src/` (private), where the Builder keeps an app's sources: it opens the same code. Only the files changed since the last sync are uploaded; files removed locally are deleted. | `PRISMEAI_SKIP_SOURCE_SYNC=true` |
| 3 | **View bundles upload** | Uploads each `dist/<view>.<hash>.js` as a workspace asset, `dist/app/isolated/<view>.<hash>.js`, with the app's sharing (`PRISMEAI_SHARING`). | — |
| 4 | **Patch workspace config** | Merges into `config.value.bundles[<slug>]`: `format: 'isolated'`, `bundle` (the `app` view) and `views` as relative asset paths, `manifest`, `version`, `name`, `builtAt`, `sharing`, and `mcp` / `agent` when set. Keeps the other keys (`metadata`…), drops `embed` and the legacy `public`. **The live pointer.** | — |
| 5 | **Cleanup** | Deletes the views of earlier deploys (`dist/app/isolated/`) and the public bundle files of older deploys (`bundle.js`, `embed.js`, `<view>.<hash>.js`) no app of the workspace points at. | `PRISMEAI_SKIP_BUNDLE_CLEANUP=true` |
| 6 | **Smoke test** | Resolves `/pages/<slug>/_bundle`, checks the entry is isolated, fetches and parses each view. | `PRISMEAI_SKIP_SMOKE=true` |
| 7 | **Version snapshot** | `POST /workspaces/:id/versions`. | `PRISMEAI_SKIP_VERSION_SNAPSHOT=true` |

On failure the script prints what completed and what to do next. The atomic boundary is step 4: before it, users still see the previous version.

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
| `PRISMEAI_ACCESS_TOKEN` | one of these | Personal access token (`at:<uuid>`), sent as `Authorization: Bearer …` |
| `PRISMEAI_API_KEY` | one of these | Org-scoped API key, sent as `x-prismeai-api-key` |
| `PRISMEAI_WORKSPACE_ID` | yes | Short ID of the target workspace (e.g. `B4eoHS6`) |
| `PRISMEAI_APP_AGENT` | no | Agent whose chat the app opens (`app.agent`). Unset keeps the current one; empty removes it. |
| `PRISMEAI_MCP_WEBHOOK` | no | Webhook of the MCP endpoint the views call (default `mcp`) |
| `PRISMEAI_SHARING` | no | Who opens the app, and reads its views: `private` (workspace members and the organizations / groups it is shared with), `authenticated` (any signed-in user), `public` (anyone, `app.user` absent). Unset keeps the current setting; a first deploy is `private`. `PRISMEAI_PUBLIC=true` still means `public`. |
| `PRISMEAI_PLATFORM_URL` | no | Your platform's UI URL, for `npm run sync-kit` and `npm run check` |
| `PRISMEAI_BUNDLE_SLUG` | no | Override the `bundles[<key>]` (default: workspace slug) |
| `PRISMEAI_APP_VERSION` | no | Version label (default `1.0.0`) |
| `PRISMEAI_ALLOW_FORMAT_SWITCH` | no | `true` to replace an app in the shared format |
| `PRISMEAI_HTTP_TIMEOUT` / `PRISMEAI_HTTP_RETRIES` | no | Per-request timeout in ms (default `30000`) / retries on 5xx (default `3`) |
| `PRISMEAI_BUNDLE_SIZE_WARN` / `PRISMEAI_BUNDLE_SIZE_MAX` | no | Per-view size thresholds in bytes (default 1 MB / 4 MB) |
| `PRISMEAI_FORCE` | no | `true` to bypass conflict detection |
| `PRISMEAI_SKIP_AUTOMATIONS_SYNC`, `_SOURCE_SYNC`, `_BUNDLE_CLEANUP`, `_SMOKE`, `_VERSION_SNAPSHOT` | no | `true` to skip that step |

---

## In-platform vs standalone (public)

The app is served at **both** URLs, always:

- **`/apps/<slug>`**: in the platform shell (sidebar, top bar);
- **`/p/<slug>`**: standalone, full viewport. A route of the app shows as `/p/<slug>#/<route>`.

With **`PRISMEAI_SHARING=public`** the app opens without sign-in: `app.user` is absent, and every webhook it calls reaches `_auth` as an anonymous caller (`401`). Add `allow_public: true` to the `_auth` call of the endpoints such an app may call without sign-in; keep the others closed. The example's home page asks visitors to sign in before trying a step.

---

## The app kit

`vendor/@prisme.ai/mcp-apps/` holds the kit an isolated app is built with (about 20 KB, plus its types):

| Import | What |
|---|---|
| `@prisme.ai/mcp-apps` | `McpApp` (the `app` object), the capability names, the types |
| `@prisme.ai/mcp-apps/react` | `useToolInput`, `useToolResult`, `useHostContext` |
| `@prisme.ai/mcp-apps/boot` | `mountView`: started by the generated entry, you do not call it |

It is copied into every bundle, like React, so the app keeps the kit it was built with. The platform stays compatible with older kits; a kit newer than your platform negotiates: a capability your platform does not have yet is refused cleanly (check `app.hasCapability`). `vendor/@prisme.ai/mcp-apps/kit.json` gives its version.

Every platform serves its own kit under `/vendor/`, the files its Builder uses. To build with exactly the kit of the platform you deploy to:

```bash
npm run sync-kit                                        # PRISMEAI_PLATFORM_URL from .env
npm run sync-kit -- --from=https://app.acme.example.com
git add vendor && git commit -m "Take the platform's app kit"
```

---

## Pull workspace state

```bash
npm run pull
```

Inverse of deploy. Fetches:

- All workspace automations → written to `automations/<slug>.yml`
- The sources (workspace assets under `src/`, where the Builder keeps them) → written to local at their path. A workspace not migrated yet keeps them as files (`metadata.type=source`): they are read from there, and the next deploy writes them as assets.

Use after a teammate edited automations or source files in the in-builder Builder, OR to bootstrap from an existing workspace. Writes a manifest to `.prismeai/last-pull.json` (the version of each automation and source, the hash of each source): the deploy's conflict detection compares the workspace against it, and uploads only the sources changed since.

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

## The repo and the Builder

The repo and the Builder hold the same format and the same files (`npm run deploy` pushes `src/` and `prisme.app.json`; `npm run pull` brings back what the Builder changed), so a teammate can open the app in the Builder, preview it and deploy it.

One difference: this repo builds with **any npm package**, the Builder only with the libraries its platform provides. `npm run check` lists the imports the Builder of your platform does not provide:

```bash
npm run check   # PRISMEAI_PLATFORM_URL from .env, or -- --from=<url>
```

The app still builds and deploys from the repo; opened in the Builder, its preview and Deploy would fail. Pick a source of truth per workspace:

- **Git only**: edits in VS Code, review in pull requests. `PRISMEAI_SKIP_SOURCE_SYNC=true` keeps the sources out of the workspace if nobody opens the Builder.
- **Hybrid**: both edit; the workspace is the source of truth. `npm run pull` before editing, commit, edit, `npm run release`. Conflict detection refuses a deploy over a teammate's changes. Keep `npm run check` clean.

---

## Constraints worth knowing

- **Styles stay inside the app.** In a page the app renders in a shadow root: the platform's CSS does not reach it, and yours does not leak out. The host gives its theme as CSS variables (`--color-background-primary`, `--color-text-primary`…, light or dark): use them with a fallback, as `src/styles.css` does.
- **Portals**: render menus, dialogs and tooltips in `app.portalContainer`, or they lose the app's styles.
- **No platform modules**: `@prisme.ai/sdk` and `@prisme/*` fail the build. Use the `app` object.
- **No router of your own on the page URL**: use `app.navigation` (`src/lib/router.tsx`); the host mirrors the route in the URL.
- **Bundle size**: everything is in the bundle; keep heavy dependencies out of the views shown in the chat.

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
| Deploy refused: `bundles[<slug>] is an app in the shared format` | The workspace holds an app built before isolated apps | Deploy to another `PRISMEAI_BUNDLE_SLUG` or workspace, `PRISMEAI_ALLOW_FORMAT_SWITCH=true` to replace it, or use the `legacy-shared` branch |
| Build: `@prisme.ai/sdk is a platform module` | An import of the platform SDK | Use the `app` object (`app.webhooks`, `app.callServerTool`…) |
| Build: `The kit is missing` | `vendor/` was deleted | `git checkout vendor` or `npm run sync-kit` |
| A webhook or tool answers 401 | `_auth` rejected the caller: an anonymous visitor, or a caller without user (a scheduled automation, an external system) | Signed-in app or agent: check the user is signed in. Caller without user: an org API key header. Public endpoint: `allow_public: true` |
| Webhook returns 404 | The path differs from the automation's `endpoint` | Use the `endpoint` of the YAML in `app.webhooks.call(...)` |
| `npm run dev:live` fails at start | Missing `.env` values | Set `PRISMEAI_API_URL`, `PRISMEAI_WORKSPACE_ID` and a token |
| `npm run deploy` → `404 /v2/v2/...` | `/v2` missing or doubled in `PRISMEAI_API_URL` | One `/v2`, no trailing slash |
| Deployed app unstyled | CSS not imported from the app's code | Import it in `src/App.tsx` (`import './styles.css'`) |
| A dialog loses its styles | Rendered outside the app | `container={app.portalContainer}` on its portal |
| Deploy fails with 401 | Token expired or wrong | Mint a new one in **Settings → Access Tokens** |
| Deploy refused after a teammate edited in the Builder | Conflict detection | `npm run pull`, review with `git diff`, then `npm run release` |
| Your agent does not see the app's tools | Wrong MCP server URL (a stray character is enough: the platform answers `Workspace not found` or no automation matches) | `<PRISMEAI_API_URL>/workspaces/<workspace id>/webhooks/mcp`, nothing after `mcp` |
| The card says `View not available to this user` | The user who talks to the agent cannot open the app (its sharing) | Share the app with them (`PRISMEAI_SHARING`, or its organizations / groups in the Builder) |

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
| Both | Add `PRISMEAI_API_URL`, `PRISMEAI_ACCESS_TOKEN`, `PRISMEAI_WORKSPACE_ID`. Optional: `PRISMEAI_BUNDLE_SLUG`, `PRISMEAI_APP_AGENT` |

The token used in CI should be a service-account or shared-account access token with explicit expiry. Rotate quarterly. Don't reuse a personal access token.

## Related starters

| Repo | What it's for |
|---|---|
| **`prismeai/starter-spa`** (this one) | Isolated app + declarative automations: a UI for end users, its agent and its tools |
| `prismeai/starter-spa`, branch `legacy-shared` | The same for apps in the shared format (maintenance only) |
| `prismeai/starter-mcp` | Workspace exposing automations as MCP tools, no UI |

---

## License

MIT — fork it, change it, ship it.
