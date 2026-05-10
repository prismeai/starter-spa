# TODO — road to production-ready v1

Tracks gaps between today's published starter and a v1.0 release.

Each item has: **Why** (real risk it addresses), **Symptoms** (what goes wrong without it), **Approach** (rough plan).

---

## v0.1 — shipped

All 6 P0 + 6 P1 items shipped (see commits). Repo is on GitHub at `prismeai/starter-spa`.

### P0 (production blockers, all ✅)

| # | Item | Notes |
|---|---|---|
| 1 | `npm run pull` script | Pulls automations + source files; writes `.prismeai/last-pull.json` manifest. Used by conflict detection. |
| 2 | Conflict detection on deploy | Refuses if remote diverged from manifest; `--force` / `PRISMEAI_FORCE=true` opts out. Manifest auto-refreshed after successful deploy. |
| 3 | HTTP timeouts + retries | 30s timeout, 3 retries on 5xx with backoff, fail fast on 4xx. Configurable via env. |
| 4 | Partial-failure summary | 8-step status tracker, per-step recovery guidance on failure, atomic boundary documented (step 5 = config patch = live pointer swap). |
| 5 | Bundle file accumulation cleanup | Step 6 deletes orphan `bundle.js` / `embed.js` files not in current `bundles[*]`. |
| 6 | Secret hygiene | Deploy warns if `.env` is git-tracked; README documents per-OS keychain integration. |

### P1 (needed for production, all ✅)

| # | Item | Notes |
|---|---|---|
| 7 | Multi-environment support | `--env=<name>` or `PRISMEAI_ENV=<name>` picks `.env.<name>`. Falls back to `.env`. |
| 8 | CI/CD recipes | `.github/workflows/deploy.yml` + `.gitlab-ci.yml` shipped. README documents secrets setup. |
| 9 | Smoke test after deploy | Step 7: parse-checks bundle + verifies CJS exports pattern. Doesn't execute (browser-only). |
| 10 | Bundle size guard | Warn at 500 KB, fail at 2 MB. Configurable. |
| 11 | `npm run undeploy` | Removes `bundles[<slug>]` from workspace config. Idempotent. `--purge-files` to also delete artifacts. |
| 12 | Type sharing | `AppProps` lives in `src/types.ts`; both `App.tsx` and `mockHost.ts` import from there. |

### Other shipped

- `automations/` with demo YAMLs (matches the React app calls)
- Auto-push of automations in deploy
- `AGENTS.md` (canonical) + `CLAUDE.md` + `.cursorrules` for AI agents
- README rewritten customer-facing (no dev history)
- Two-channel transport documented (DSUL via zip, React via git+npm)

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

### 19. Better deploy progress

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

## Workspace round-trip — DSUL artifact support

### 32. `index.yml` push/pull (workspace metadata)

- **Why**: Customer may want to version workspace name, labels, `config.value` (except `bundles`, which deploy manages).
- **Approach**: If `index.yml` exists at root, PATCH `/workspaces/:id` with the parsed YAML, stripping `config.value.bundles` to avoid clobbering deploy's writes. Pull script writes it on demand.

### 33. `security.yml` push/pull (RBAC)

- **Why**: Some customers will want RBAC under git.
- **Approach**: PUT to the workspace security endpoint. **Risky** — bad RBAC can lock the customer out of their own workspace. Add a confirmation prompt or `--apply-security` opt-in flag.

### 34. `imports/` push/pull (installed app instances)

- **Why**: Workspaces can install apps from the AppStore; the config lives in `imports[<slug>]`.
- **Approach**: Walk `imports/**/*.yml`, diff against `workspace.imports`, upsert/delete.

---

## Local dev parity

### 35. Real-host upgrade in `mockHost.ts`

- **Why**: Today local dev mocks `streamEvents` with a 400ms echo. Customer ships, finds the real workspace doesn't have the matching automation.
- **Approach**: When `VITE_PRISMEAI_API_URL`, `VITE_PRISMEAI_ACCESS_TOKEN`, `VITE_PRISMEAI_WORKSPACE_ID` are set, build a real SDK shim that hits the workspace. Falls back to mock with warning. Document hostname-alias trick if WebSocket origin restrictions hit.

### 36. `src/lib/prismeClient.ts` — minimal hand-rolled SDK

- **Why**: `@prisme.ai/sdk` is not on public npm.
- **Approach**: Tiny shim — REST via `fetch` + Bearer token; WebSocket via `socket.io-client` with token in `auth` handshake. Just enough surface for `streamEvents`, `webhookUrl`, `host`, `token`, `_csrfToken`. Pairs with #35.

### 37. Document hostname alias trick

- **Why**: Browser WebSocket from `localhost` may be blocked by CORS or cookie-domain mismatches.
- **Approach**: README section showing `/etc/hosts` alias setup + `vite --host app.local.example.com`.

---

## Doc / repo polish

- [ ] **LICENSE file** (README mentions MIT but no `LICENSE` in the repo)
- [ ] **CHANGELOG.md** (per-release notes; first entry: v0.1)
- [ ] CONTRIBUTING.md (for the starter itself, not the customer's app)
- [ ] CODE_OF_CONDUCT.md (boilerplate)
- [ ] Issue templates (.github/ISSUE_TEMPLATE/)
- [ ] PR template
- [ ] Architecture diagram in README (mermaid or SVG)
- [ ] Add `engines: { "node": ">=20" }` to package.json
- [ ] DSUL conventions primer (link to public docs OR embed key bits inline)
- [ ] GitHub repo: add topics (`prisme-ai`, `starter`, `react`, `vite`, `low-code`, `automation`)
- [ ] GitHub repo: pin to org page

---

## Notes

- Keep the starter **minimal**. Every script + config we add is something the customer must understand or remove.
- Prefer **opt-in** flags over default behavior changes. Don't surprise existing users on upgrade.
- v0.2 milestone: `prisme login` CLI + workspace round-trip (index/security/imports) + real-host dev mode.
- v0.3 milestone: ESLint + Vitest + watch mode + bundle analyzer.
