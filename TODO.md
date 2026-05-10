# TODO — road to production-ready v1

Tracks gaps between v0.1 (current) and a starter customers can confidently ship to production.

Each item has: **Why** (real risk it addresses), **Symptoms** (what goes wrong without it), **Approach** (rough plan).

---

## P0 — Production blockers

These cause silent data loss, security exposure, or unrecoverable inconsistency. Customers will hit them.

### 1. `npm run pull` — pull workspace edits → local ✅ partially done (v0.1)

- **Why**: Today the deploy script silently overwrites Builder edits because there's no way to fetch them first. The README's Hybrid mode is undocumentable without it.
- **Symptoms**: Teammate edits in Builder → developer runs `npm run deploy` → teammate's work is gone, no warning.
- **Approach**: Mirror `syncFilesToWorkspace` in reverse — `GET /workspaces/:id/files?metadata.type=source`, fetch each `.url`, write to local `metadata.path`. Print summary `pulled=X new=Y modified=Z`. Refuse to overwrite locally-modified files (compare against last-pull manifest in `.prismeai/last-pull.json`).
- **Status v0.1**: Pull script exists (`scripts/pull.mjs`), covers automations + source files, writes manifest. **NOT done**: locally-modified detection (overwrites unconditionally — manifest is written but not enforced).

### 2. Conflict detection on deploy ✅ done (v0.1)

- **Why**: Without it, `npm run deploy` is a destructive operation that pretends to be additive.
- **Symptoms**: Two devs (or dev + Builder user) make concurrent changes; whoever deploys second wins, no record of the loss.
- **Status v0.1**: Pre-flight in `deploy.mjs` reads `.prismeai/last-pull.json` and compares the server's `metadata.hash` (source files) and `checksum` (automations) against the manifest. Refuses on divergence with a list of conflicting items + 3 resolution paths. Override: `--force` flag on `deploy` directly OR `PRISMEAI_FORCE=true` env var (works for `release` too). Exit code 1 on refusal — CI-safe.
- **Verified**: 4 test scenarios — no manifest skipped silently; clean pull + deploy passes; remote PATCH detected and refused; --force overrides.

### 3. HTTP timeouts + retries

- **Why**: Native `fetch` waits forever. A flaky network or hung gateway will hang `npm run deploy` indefinitely with no signal.
- **Symptoms**: CI job stuck for hours; developer sees the script "running" but nothing happens.
- **Approach**: Wrap `api()` with `AbortController` (default 30s), retry 5xx/network errors up to 3× with exponential backoff. Treat 4xx as fatal (no retry).

### 4. Partial-failure atomicity

- **Why**: Steps run sequentially with no rollback. If the bundle uploads but config patch fails, the workspace lists a phantom bundle URL pointing to nothing the AppRenderer references. If config patches but version snapshot fails, the bundle is live without a recovery point.
- **Symptoms**: Deploy "succeeds halfway"; subsequent re-runs accumulate orphan files; rollback impossible.
- **Approach**: Two-phase commit pattern — stage all uploads first (collect URLs without touching config), then do the config PATCH last as the atomic swap. On any failure before PATCH, delete the staged files. On PATCH failure, keep staged files (next deploy can reuse).

### 5. Bundle file accumulation cleanup ✅ done (v0.1)

- **Why**: Each deploy uploads `<random>.bundle.js` and old ones stay forever. Workspace storage grows unbounded.
- **Symptoms**: After 100 deploys, the workspace has 100 dead bundle files. Hits storage limits or makes file-list slow.
- **Status v0.1**: Step 4b in `deploy.mjs` runs after config PATCH. Lists all public `bundle.js` / `embed.js` files; deletes any not in current `bundles[*]`. Skip flag: `PRISMEAI_SKIP_BUNDLE_CLEANUP=true`.

### 6. Secret hygiene ✅ done (v0.1)

- **Why**: `PRISMEAI_ACCESS_TOKEN` in plaintext `.env` is fine for local dev but invites mistakes (committed to git, posted in support tickets, copied to other machines).
- **Symptoms**: Token leaks; developer can't rotate easily because the token is in too many places.
- **Status v0.1**: deploy.mjs runs `git ls-files --error-unmatch .env` at start; warns loudly if tracked. README "Secret hygiene" section documents keychain integration (macOS `security`, Linux `secret-tool`, Windows `cmdkey`) and CI secrets pattern.
- **Future** (P2 #13): `prisme login` CLI for OIDC device-flow auth — eliminates plaintext tokens entirely.

---

## P1 — Needed before customers ship to production

These don't cause data loss but they break common workflows.

### 7. Multi-environment support

- **Why**: One `.env` means dev/staging/prod are mutually exclusive. Customers need to deploy the same code to multiple workspaces.
- **Symptoms**: Customer copies `.env` repeatedly between machines; accidental prod-deploys from dev branches.
- **Approach**: Support `.env.development`, `.env.staging`, `.env.production`. `npm run deploy --env=staging` selects the file. Default to `.env`. Document that per-env files are gitignored.

### 8. CI/CD recipes

- **Why**: Customers will want to deploy on `git push`. We promised this in "Going further" but ship nothing.
- **Symptoms**: Customer hand-rolls a brittle workflow that exposes the token in logs.
- **Approach**: Two example files — `.github/workflows/deploy.yml` and `.gitlab-ci.yml`. Each: install Node, `npm ci`, `npm run release`, with the token from repo secrets. Pin Node version. Cache npm.

### 9. Smoke test after deploy

- **Why**: A successful PATCH doesn't mean the app actually loads. Bundle could be syntactically broken, externals could mismatch, or the `bundles[<slug>]` lookup could fail.
- **Symptoms**: Deploy says ✓ but `/apps/<slug>` shows a blank screen or "Failed to load bundle". Customer doesn't notice until end users complain.
- **Approach**: After step 5, fetch `GET /v2/pages/<slug>/_bundle`, parse the response, fetch the bundle URL, run `new Function(bundle)(...stub require...)` to verify it parses and exposes `module.default`. Print ✓/✗ summary. Optional `--no-smoke` flag.

### 10. Bundle size guard

- **Why**: Bundles over a few MB load slowly and break mobile clients. Today nothing catches a customer accidentally bundling a 10 MB blob.
- **Symptoms**: App loads slow on first visit; mobile users see timeouts.
- **Approach**: After build, check `dist/bundle.js` size. Warn at 500 KB, fail at 2 MB by default. Configurable in `prismeai.config.json`.

### 11. `npm run undeploy`

- **Why**: No way to remove a deployed app. Deleting the workspace deletes everything; there's no "just remove the bundle pointer".
- **Symptoms**: Stale apps linger in the workspace's `bundles[]` map; `/apps/<slug>` keeps serving an old version.
- **Approach**: Script that `GET`s the workspace, removes `bundles[<slug>]` from `config.value`, PATCHes back. Optional `--purge-files` to also delete the underlying file artifacts.

### 12. Type sharing — extract `AppProps`

- **Why**: `AppProps` is duplicated in `src/App.tsx` and `src/lib/mockHost.ts`. Drift will silently break the mock.
- **Symptoms**: Adding a prop in `App.tsx` doesn't update mock; dev-mode renders with wrong shape; customer ships a regression they can't see locally.
- **Approach**: Move to `src/types.ts`. Both files import from there. Bonus: export the contract version so mismatches with the platform's `AppProps` type can be detected.

---

## P2 — Strong DX upgrades

Not blockers, but every customer will want these.

### 13. `prisme login` CLI

- **Why**: Pasting tokens from the UI is friction. AWS, gh, vercel, firebase, gcloud all use OIDC device flow.
- **Approach**: Spawn local HTTP server on `127.0.0.1:<random>`, open browser at the platform's OIDC URL, capture the code redirect, exchange for token, cache in `~/.prismeai/credentials.json` (mode 0600). Add refresh logic. Document opt-out for CI (uses access token from env).

### 14. ESLint + Prettier + EditorConfig

- **Why**: Customer team should agree on style; today everyone formats differently.
- **Approach**: Ship `.eslintrc.json`, `.prettierrc`, `.editorconfig`. Run on commit via `lint-staged` + `husky`. Use the platform's own configs as a starting point.

### 15. Vitest setup with sample test

- **Why**: Customers will copy whatever testing pattern we ship (or skip tests entirely if we ship none).
- **Approach**: Add `vitest.config.ts`, `npm test`, and `src/App.test.tsx` showing how to mock `sdk` and assert on rendered output.

### 16. `prismeai.config.json`

- **Why**: Multiple contributors each set different env vars; no shared config.
- **Approach**: Optional config file for non-secret settings: `bundleSlug`, `appVersion`, `bundleSizeLimit`, `skipSourceSync`. Env vars override.

### 17. Watch mode for dev

- **Why**: Today `npm run dev` is Vite-only. Doesn't catch deploy-time errors (esbuild externals mismatch, Tailwind class not in platform CSS).
- **Approach**: `npm run watch` — Vite + a parallel esbuild watch that runs the deploy-time bundling and reports if it would fail. Doesn't actually deploy.

### 18. VS Code launch.json + recommended settings

- **Why**: Small DX wins (debug TSX, format on save with Prettier).
- **Approach**: Already shipped `.vscode/extensions.json` and `settings.json`. Add `launch.json` for "Debug current file" and "Run npm run deploy".

### 19. Real-workspace dev mode

- **Why**: `mockHost.ts` only echoes a few events. Customers need to point their local `npm run dev` at a real workspace's WebSocket.
- **Approach**: If `VITE_PRISMEAI_API_URL` and `VITE_PRISMEAI_ACCESS_TOKEN` are set, `mockHost.ts` builds a real SDK via `new PrismeSDK.Api()` instead of stubs. Documented as the "advanced dev" path.

### 20. Better deploy progress

- **Why**: `uploaded=22 skipped=0 deleted=0` is fine for 22 files; useless for 200. No per-file progress.
- **Approach**: Print one line per upload with elapsed time. Concurrent uploads with a small pool (5-10) — sequential is wasteful.

---

## P3 — Future, lower urgency

### 21. CSS injection support

- **Why**: Customers will eventually want custom CSS that the platform doesn't ship.
- **Approach**: Optional `src/styles/app.css` → injected at build into a `<style>` tag in the bundle, mounted on App component mount. Trade-off: bundle size grows, CSP complications.

### 22. lucide icon validation

- **Why**: Importing an icon not in the host's curated subset breaks at runtime. We document the constraint but don't enforce it.
- **Approach**: Build-time check: parse all `lucide-react` imports, compare against the known curated list (committed to `scripts/lucide-allowlist.json`, kept in sync with platform), fail build on miss.

### 23. Tailwind class validation

- **Why**: Same as above for Tailwind classes.
- **Approach**: Build-time scan of source files for class strings, intersect with platform's compiled CSS class list, warn on misses. Hard because Tailwind is dynamic.

### 24. Source maps in dev, optional in prod

- **Why**: Debugging the deployed bundle is impossible without source maps; with them, you leak source.
- **Approach**: `--sourcemap` flag on `npm run build`, separate file uploaded as `<bundle>.js.map`, gated by env.

### 25. Bundle analyzer

- **Why**: `dist/bundle.js` is opaque. Customers hit size limits without knowing what's heavy.
- **Approach**: `npm run analyze` runs esbuild with `metafile: true`, prints a tree of which modules contribute what bytes.

### 26. Versioned starter releases

- **Why**: Customers fork the starter and never update. Breaking changes in the platform's loader contract will silently brick their apps.
- **Approach**: Cut versioned tags (`v0.1`, `v0.2`). Document upgrade paths in `CHANGELOG.md`. Maybe a `npm run check-compat` that hits a platform endpoint exposing the current loader contract version.

### 27. Multi-bundle workspaces

- **Why**: A workspace can host multiple bundles via different `bundles[<slug>]` entries. Today we assume one bundle per workspace.
- **Approach**: `prismeai.config.json` lists multiple bundle entries with their own entry files; `npm run deploy --bundle=admin` builds and deploys one of them.

### 28. Telemetry / observability

- **Why**: Hard to know how customers use the starter without telemetry. But also: privacy.
- **Approach**: Opt-in only. Anonymous usage events to a Prisme-hosted endpoint. Disabled by default.

---

## Added in v0.2 design pass — automations + collaboration

### 29. Ship `automations/` with demo YAMLs ✅ done

- Two automations ship: `on-app-greeting-requested` (matches the Events tab) and `v1/status` (matches the API tab). Marked `# DELETE ME — example` at top.

### 30. Extend `deploy.mjs` to push automations ✅ done

- New step 0 in deploy: walks `automations/`, diffs against workspace, upserts/deletes via `/v2/workspaces/:id/automations[/:slug]`. Uses `js-yaml` for parse + `JSON.stringify` with sorted keys for stable hashing.
- Skip flag: `PRISMEAI_SKIP_AUTOMATIONS_SYNC=true`.

### 31. `npm run pull` script ✅ done (see P0 #1)

### 32. Refactor mockHost.ts → host.ts (real-mode driven by env vars)

- **Why**: Today local dev mocks `streamEvents` with a 400ms echo. Customer thinks events work, ships, finds the real workspace doesn't have the matching automation.
- **Approach**: When `VITE_PRISMEAI_API_URL`, `VITE_PRISMEAI_ACCESS_TOKEN`, `VITE_PRISMEAI_WORKSPACE_ID` are set, build a real SDK shim that hits the workspace. Falls back to mock with warning if not set. Document hostname-alias trick if WebSocket origin restrictions hit.
- **Status**: NOT done. Mock host still echoes locally only.

### 33. `src/lib/prismeClient.ts` — minimal hand-rolled SDK

- **Why**: `@prisme.ai/sdk` is not on public npm. Customers can't install it.
- **Approach**: Tiny shim — REST via `fetch` + Bearer token; WebSocket via `socket.io-client` with token in `auth` handshake. Just enough surface for `streamEvents`, `webhookUrl`, `host`, `token`, `_csrfToken`.
- **Status**: NOT done. Goes hand-in-hand with #32.

### 34. Optional support for `index.yml at root` (workspace metadata patch)

- **Why**: Customer may want to version workspace name, slug, labels, config.value (excluding `bundles` which deploy manages).
- **Approach**: If `index.yml at root` exists, PATCH `/workspaces/:id` with the parsed YAML, but always strip `config.value.bundles` first to avoid clobbering deploy's own writes.
- **Status**: NOT done. Pull does not yet write index.yml either.

### 35. Optional support for `security.yml at root` (RBAC)

- **Why**: Some customers will want RBAC under git.
- **Approach**: If `security.yml at root` exists, push via the workspace security endpoint. Pull writes it on demand. **Risky**: bad RBAC locks the customer out of their own workspace.
- **Status**: NOT done. Need to verify the right endpoint and document the risk.

### 36. Optional support for `imports/ at root` (installed app instances)

- **Why**: Workspaces can install apps from the AppStore; their config (`imports[<slug>]`) is part of the DSUL.
- **Approach**: Walk `imports/ at root**/*.yml`, diff against workspace.imports, upsert/delete.
- **Status**: NOT done.

### 37. AGENTS.md / CLAUDE.md / .cursorrules ✅ done

- AGENTS.md is canonical (used by codex, gemini, others). CLAUDE.md and .cursorrules are one-line pointers to it.

### 38. Document hostname alias trick

- **Why**: Browser WebSocket from `localhost` may be blocked by CORS or cookie-domain mismatches when hitting the real workspace.
- **Approach**: README section showing `/etc/hosts` alias setup + `vite --host app.local.example.com` usage.
- **Status**: NOT done.

### 39. DSUL conventions doc

- **Why**: Customers writing automations need a primer on DSUL syntax (`when`, `do`, `output`, `{{...}}` expressions).
- **Approach**: Link to public docs OR embed key bits inline. Avoid duplicating the full DSUL spec.
- **Status**: NOT done.

---

## Doc / repo polish (small but visible)

- [ ] LICENSE file (currently only mentioned in README)
- [ ] CHANGELOG.md
- [ ] CONTRIBUTING.md (for the starter itself, not the customer's app)
- [ ] CODE_OF_CONDUCT.md (boilerplate)
- [ ] Issue templates (.github/ISSUE_TEMPLATE/)
- [ ] PR template
- [ ] Architecture diagram in README (mermaid or SVG)
- [ ] Add `engines: { "node": ">=20" }` to package.json
- [ ] Move duplicated `AppProps` to `src/types.ts` (also in P1 #12)

---

## Notes

- Keep the starter **minimal**. Every script + config we add is something the customer must understand or remove.
- Prefer **opt-in** flags over default behavior changes. Don't surprise existing users on upgrade.
- All P0 items are required before tagging `v1.0`.
- P1 items can ship in `v1.1` if customers ask for them.
- P2/P3 items are good for iterative improvement.
