# Agent instructions

This file gives AI coding agents (Claude Code, OpenAI Codex, Cursor, Gemini, etc.) the context they need to work productively in this repo. Humans should also read it.

`CLAUDE.md` and `.cursorrules` exist as one-liner pointers to this file — don't duplicate content across them.

---

## What this repo is

A starter for building a Prisme.ai app locally in VS Code, then deploying it to a workspace via `npm run deploy`.

The app is in the **isolated** format: `npm run build` makes one self-contained bundle per view (`dist/<view>.<hash>.js`: React, your dependencies and the app kit inside), plus declarative automations under `automations/` (YAML, the format the Prisme.ai docs call DSUL) that the app calls. The app reaches the platform only through the `app` object it receives. The shared format (CJS bundle, host props) lives on the `legacy-shared` branch.

**Read [`README.md`](./README.md) before making changes.** It explains the `app` object, the deploy pipeline, webhook auth and the constraints (styles in a shadow root, portals, bundle size).

---

## Repo layout

```
.
├── prisme.app.json               # {"format": "isolated"}: read by the Builder
├── src/
│   ├── App.tsx                   # ← the app: default export, receives { app }
│   ├── pages/, components/, lib/ # the guided example; replace with your own
│   ├── views/                    # one view per file, shown by a tool in the chat (HelloCard.tsx)
│   ├── styles.css                # plain CSS, host theme variables
│   ├── main.tsx, dev/devApp.ts   # local dev only: a local `app` object
├── automations/                  # declarative automations (YAML), pushed by deploy (_auth, v1/status, mcp, events)
├── vendor/@prisme.ai/mcp-apps/   # the app kit (JS + types), copied from the platform
├── scripts/
│   ├── build.mjs                 # esbuild → dist/<view>.<hash>.js + dist/manifest.json
│   ├── deploy.mjs                # format guard, automations, sources, views, config, cleanup, smoke, version
│   ├── pull.mjs / undeploy.mjs   # workspace → local / remove the live pointer
│   ├── sync-kit.mjs / check.mjs  # take the platform's kit / imports the Builder lacks
│   └── lib/isolated.mjs          # shared with the Builder's compiler: entries, CSS, entry merge (tested)
├── README.md                     # read first
└── AGENTS.md                     # this file
```

---

## Hard rules

1. **Only the `app` object talks to the platform.** No `@prisme.ai/sdk`, no `@prisme/*` imports (the build fails), no `fetch` with a token to the API. Webhooks: `app.webhooks.call`; tools: `app.callServerTool`; events: `app.events`. To reach another workspace or an external API, write an automation and call it.

2. **Don't change the entry contract.** `src/App.tsx` exports `default function App({ app }: { app?: McpApp })`; each `src/views/<Name>.tsx` exports a component with the same props. The generated entry (`scripts/lib/isolated.mjs`, `bootEntrySource`) starts them with the kit's `mountView`. Don't call `createRoot` yourself outside `src/main.tsx`.

3. **Don't add `process.env.*` access in `src/`.** That's Node-only. Browser code uses `import.meta.env.VITE_*` (Vite convention). Server-side scripts (`scripts/*.mjs`) use `process.env.*` via `dotenv/config`.

4. **Don't commit `.env`.** `.gitignore` already excludes it. If you add new required env vars, document them in `.env.example` AND in the README "Environment variables" table.

5. **Don't bypass the deploy pipeline.** No "quick" `curl` deploys, no manual file uploads. If you need behavior the deploy script doesn't have, extend `scripts/deploy.mjs` and document it.

6. **Don't change auth without good reason.** The script accepts `PRISMEAI_ACCESS_TOKEN` (Bearer) or `PRISMEAI_API_KEY` (`x-prismeai-api-key`). Keep both paths working.

7. **Don't introduce a build for `automations/, imports/, etc.`.** YAMLs under `automations/` are pushed as-is. Don't add a templating layer; keep the YAML plain.

8. **Guard every webhook.** Prisme.ai `when: endpoint:` automations are PUBLIC by default — anyone with the URL can call them, no auth. Every protected webhook MUST call the `_auth` guard first and `break` on `{{auth.error}}` (see `automations/v1/status.yml` for the canonical block; `automations/mcp.yml` is guarded the same way). Leave an endpoint open ONLY by passing `allow_public: true` to `_auth`, so the intent is explicit in the YAML. Event listeners (`when: events:`) don't need it. Never ship a bare `when: endpoint:` automation with no guard. See README → "Webhook auth".

9. **Keep the kit in `vendor/`.** Update it with `npm run sync-kit` only, never by hand; it is copied into every bundle. Don't add `@prisme.ai/mcp-apps` to package.json.

---

## Common tasks

| Task | Command / file |
|---|---|
| Run dev server | `npm run dev` (simulated) or `npm run dev:live` (your workspace) |
| Build the bundle | `npm run build` |
| Deploy to workspace | `npm run deploy` (or `npm run release` to build+deploy) |
| Pull workspace state | `npm run pull` |
| Add a new automation | Add a YAML under `automations/` with top-level `slug` field |
| Add a page | A file in `src/pages/` + a line in `PAGES` (`src/App.tsx`) |
| Add a view for the chat | `src/views/<Name>.tsx`, same props as the app |
| Take the platform's kit | `npm run sync-kit` |
| Check the Builder can still edit the app | `npm run check` |
| Add a UI component | `src/components/` |
| Add a dependency | Check `npm-dependency-evaluator` agent (if available); mind the bundle size, and `npm run check` if the Builder must edit the app |

---

## Conventions

- **Auth header**: `Authorization: Bearer at:<uuid>` for personal access tokens; `x-prismeai-api-key: <key>` for org keys. The deploy script picks one based on which env var is set.
- **API base**: `PRISMEAI_API_URL` MUST include `/v2` (e.g. `https://api.sandbox.prisme.ai/v2`). Append paths starting with `/`.
- **Workspace IDs**: short alphanumeric (e.g. `B4eoHS6`), NOT UUIDs. `slug:` prefix works for some endpoints (webhooks) but not all (files).
- **Automation slugs** can contain `/` (e.g. `v1/status`). URL-encode in API paths (`%2F`); use as-is in YAML and file paths.
- **Hash algorithm**: SHA-256 hex for content addressing (matches the platform's own `computeHash`).
- **YAML quoting**: `js-yaml` with `quotingType: "'"` to match the export format.

---

## Things I see agents do wrong

- Importing `@prisme.ai/sdk` or calling the API with `fetch` and a token from `src/`. Use the `app` object.
- Rendering a dialog or a menu without `container={app.portalContainer}`: it loses the app's styles.
- Styling `html` or `body`: in a page the app renders in a shadow root, where they match nothing. Style a root element of the app (`.app`); `:root` rules get a `:host` twin at build.
- Calling `process.env.X` in browser code — undefined in Vite/esbuild output.
- Writing a "test deploy" that calls the real API without checking which workspace is in `.env`. Always print `PRISMEAI_WORKSPACE_ID` and confirm before destructive ops.

---

## Before you finish a change

1. `npm run typecheck` passes
2. `npm run build` succeeds and each `dist/<view>.<hash>.js` is a reasonable size
3. `npm test` passes (scripts/lib)
4. If you touched `scripts/*.mjs`, `node --check` on each
5. If you touched `automations/, imports/, etc.`, `npm run deploy` against a sandbox workspace before claiming "done"
6. Update `README.md` if you changed user-facing behavior
7. Update `TODO.md` if you closed an item or surfaced a new one
