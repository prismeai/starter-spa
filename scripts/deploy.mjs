#!/usr/bin/env node
/**
 * Deploy the built app to a Prisme.ai workspace, in the isolated format.
 *
 * Mirrors the Builder's Deploy button for an isolated app (useAppBuild):
 *
 *   0. Format guard: refuses to replace an app deployed in the shared format.
 *   1. Automations. Each POST/PATCH/DELETE of an automation rebuilds the whole
 *      runtime model, so:
 *      - DSUL import on (index.yml present, PRISMEAI_SKIP_DSUL_IMPORT unset):
 *        no POST nor PATCH, the import (step 4b) creates and updates them.
 *        Automations the workspace holds and the repo no longer has are
 *        deleted one by one AFTER the import (step 4c), so none is removed
 *        while still called.
 *      - DSUL import off: POST the new ones, PATCH only those changed since the
 *        last deploy (local content hash or remote checksum, recorded in
 *        .prismeai/last-pull.json), DELETE the removed ones.
 *      `--plan` prints these calls (and the count of the previous script) and
 *      exits without writing anything.
 *   2. Sync src/* (and prisme.app.json, the root configs) as workspace assets
 *      under src/, where the Builder keeps an app's sources: it opens the same
 *      code your repo holds.
 *   3. Upload each view bundle of dist/ as a workspace asset, with the app's
 *      sharing and the bindings of security.yml.
 *   4. PATCH workspace.config.value.bundles[<slug>]: format 'isolated', the
 *      views, the manifest, the MCP endpoint and the agent of the app.
 *   4b. DSUL import: zip index.yml, security.yml, imports/ and automations/ and
 *      POST /workspaces/:id/import (config keys written at runtime, such as
 *      bundles and agent.id, are taken from the live workspace first). The
 *      platform then emits workspaces.imported (auto-init). Skipped when there
 *      is no index.yml, or with PRISMEAI_SKIP_DSUL_IMPORT=true. Never with
 *      ?prune=true: it would also delete the assets absent from the archive
 *      (src/ sources and view bundles uploaded above).
 *   4c. Delete the automations removed from the repo (DSUL import on only).
 *   5. Clean up bundle files no app points at, smoke-test, snapshot a version.
 *
 * Required env (.env at repo root):
 *   PRISMEAI_API_URL          full URL incl. /v2 (e.g. https://api.acme.com/v2)
 *   PRISMEAI_ACCESS_TOKEN     personal access token (or PRISMEAI_API_KEY)
 *   PRISMEAI_WORKSPACE_ID     short ID of the target workspace
 *
 * Optional:
 *   PRISMEAI_BUNDLE_SLUG           override the bundles[<key>] (default: workspace.slug)
 *   PRISMEAI_APP_VERSION           default '1.0.0'
 *   PRISMEAI_APP_AGENT             agent whose chat the app opens (app.agent); empty removes it
 *   PRISMEAI_MCP_WEBHOOK           webhook of the MCP endpoint the views call (default 'mcp')
 *   PRISMEAI_SHARING               who opens the app: private | authenticated | public (default: kept, else private)
 *   PRISMEAI_ALLOW_FORMAT_SWITCH   'true' to replace an app deployed in the shared format
 *   PRISMEAI_SKIP_*                see README
 */

import dotenv from 'dotenv'
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { zipSync, strToU8 } from 'fflate'
import { mergeIndex, parsePreserve, isDsulFile } from './lib/dsul.mjs'
import { ISOLATED_FOLDER, VIEW_FILE, appSharing, assetVersion, diffSources, fromSourceAssetPath, isolatedEntry, referencedFiles, toSourceAssetPath, SOURCES_FOLDER } from './lib/isolated.mjs'
import { callCounts, contentHash, planAutomations } from './lib/automations.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

// Multi-env: pick .env.<name> if --env=<name> or PRISMEAI_ENV is set, else .env.
// Print which file we loaded so you never accidentally deploy to prod thinking
// you're on dev.
function loadEnv() {
  const argEnv = process.argv.find(a => a.startsWith('--env='))?.slice(6)
  const envName = argEnv || process.env.PRISMEAI_ENV || ''
  const candidates = envName ? [`.env.${envName}`] : ['.env']
  for (const rel of candidates) {
    const abs = path.join(ROOT, rel)
    if (existsSync(abs)) {
      dotenv.config({ path: abs })
      console.log(`· using ${rel}${envName ? ` (env=${envName})` : ''}`)
      return rel
    }
  }
  if (envName) {
    console.error(`✗ Env file not found: .env.${envName}`)
    process.exit(1)
  }
  // No .env at all — env vars must come from the shell/CI
  console.log('· no .env file (env vars must come from shell/CI)')
  return null
}
loadEnv()

const {
  PRISMEAI_API_URL,
  PRISMEAI_ACCESS_TOKEN,
  PRISMEAI_API_KEY,
  PRISMEAI_WORKSPACE_ID,
  PRISMEAI_APP_AGENT,
  PRISMEAI_MCP_WEBHOOK,
} = process.env
const PRISMEAI_APP_VERSION = process.env.PRISMEAI_APP_VERSION || '1.0.0'
const SKIP_SOURCE_SYNC = process.env.PRISMEAI_SKIP_SOURCE_SYNC === 'true'
const SKIP_VERSION_SNAPSHOT = process.env.PRISMEAI_SKIP_VERSION_SNAPSHOT === 'true'
const SKIP_AUTOMATIONS_SYNC = process.env.PRISMEAI_SKIP_AUTOMATIONS_SYNC === 'true'
const SKIP_BUNDLE_CLEANUP = process.env.PRISMEAI_SKIP_BUNDLE_CLEANUP === 'true'
const SKIP_SMOKE = process.env.PRISMEAI_SKIP_SMOKE === 'true'
const SKIP_DSUL_IMPORT = process.env.PRISMEAI_SKIP_DSUL_IMPORT === 'true'
const ALLOW_FORMAT_SWITCH = process.env.PRISMEAI_ALLOW_FORMAT_SWITCH === 'true'
const FORCE = process.argv.includes('--force') || process.env.PRISMEAI_FORCE === 'true'
const PLAN_ONLY = process.argv.includes('--plan')

// fail() throws so the top-level try/catch can print a deploy summary + recovery
// guidance before exiting non-zero. Don't call process.exit() directly here.
function fail(msg) { throw new Error(msg) }

if (!PRISMEAI_API_URL) fail('Missing PRISMEAI_API_URL in .env (must include /v2 suffix)')
if (!PRISMEAI_ACCESS_TOKEN && !PRISMEAI_API_KEY) {
  fail('Missing auth in .env: set either PRISMEAI_ACCESS_TOKEN (recommended) or PRISMEAI_API_KEY')
}
if (!PRISMEAI_WORKSPACE_ID) fail('Missing PRISMEAI_WORKSPACE_ID in .env')

const API_BASE = PRISMEAI_API_URL.replace(/\/$/, '')
const AUTH_HEADERS = PRISMEAI_ACCESS_TOKEN
  ? { Authorization: `Bearer ${PRISMEAI_ACCESS_TOKEN}` }
  : { 'x-prismeai-api-key': PRISMEAI_API_KEY }

// HTTP timeout (default 30s) + retry on 5xx/network errors with exponential
// backoff. 4xx are deterministic client errors and never retried.
const HTTP_TIMEOUT_MS = parseInt(process.env.PRISMEAI_HTTP_TIMEOUT || '30000', 10)
const HTTP_MAX_RETRIES = parseInt(process.env.PRISMEAI_HTTP_RETRIES || '3', 10)

async function api(method, pathSuffix, { body, headers, raw } = {}) {
  let lastError = ''
  for (let attempt = 0; attempt <= HTTP_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const waitMs = 1000 * Math.pow(2, attempt - 1) // 1s, 2s, 4s
      console.warn(`  ↻ retry ${attempt}/${HTTP_MAX_RETRIES} for ${method} ${pathSuffix} after ${waitMs}ms (last: ${lastError})`)
      await new Promise(r => setTimeout(r, waitMs))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)

    let res
    try {
      res = await fetch(`${API_BASE}${pathSuffix}`, {
        method,
        headers: {
          ...AUTH_HEADERS,
          ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (err) {
      // Network or timeout error — retry
      clearTimeout(timer)
      lastError = err?.name === 'AbortError' ? `timeout after ${HTTP_TIMEOUT_MS}ms` : (err?.message || String(err))
      continue
    }
    clearTimeout(timer)

    // 4xx — deterministic, fail fast (no retry)
    if (res.status >= 400 && res.status < 500) {
      const text = await res.text().catch(() => '')
      fail(`${method} ${pathSuffix} → ${res.status} ${res.statusText}\n${text}`)
    }
    // 5xx — transient, retry
    if (res.status >= 500) {
      lastError = `${res.status} ${res.statusText}`
      continue
    }
    // 2xx
    if (res.status === 204) return null
    if (raw) return res
    const ct = res.headers.get('content-type') || ''
    return ct.includes('application/json') ? res.json() : res.text()
  }
  fail(`${method} ${pathSuffix} failed after ${HTTP_MAX_RETRIES + 1} attempts: ${lastError}`)
}

function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

// ---------------------------------------------------------------------------
// Source-file collection — mirrors the template's scaffoldPaths + everything
// the customer added under src/. Equivalent to what the in-builder sandbox
// holds in memory.
// ---------------------------------------------------------------------------

const ROOT_SOURCE_FILES = [
  'prisme.app.json', // marks the app isolated for the Builder
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
]
const SOURCE_DIRS = ['src']
const EXCLUDE = new Set(['node_modules', 'dist', '.git', '.vite'])

async function walk(dir, prefix) {
  const out = []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    if (EXCLUDE.has(e.name)) continue
    const abs = path.join(dir, e.name)
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) {
      out.push(...(await walk(abs, rel)))
    } else if (e.isFile()) {
      out.push({ abs, rel })
    }
  }
  return out
}

async function collectSourceFiles() {
  const files = []
  for (const f of ROOT_SOURCE_FILES) {
    const abs = path.join(ROOT, f)
    if (await stat(abs).catch(() => null)) {
      files.push({ abs, rel: f })
    }
  }
  for (const d of SOURCE_DIRS) {
    const abs = path.join(ROOT, d)
    if (await stat(abs).catch(() => null)) {
      files.push(...(await walk(abs, d)))
    }
  }
  // Exclude DSUL artifacts and tooling — those are pushed via separate steps
  // or aren't relevant to the in-builder Builder's source view.
  const EXCLUDE_REL = new Set([
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    '.cursorrules',
    'TODO.md',
    '.env',
    '.env.example',
    '.gitignore',
  ])
  return files.filter(f =>
    !EXCLUDE_REL.has(f.rel) &&
    !f.rel.startsWith('automations/') &&
    !f.rel.startsWith('imports/') &&
    !f.rel.startsWith('pages/') &&
    !f.rel.startsWith('scripts/') &&
    !f.rel.endsWith('.yml') &&
    !f.rel.endsWith('.yaml')
  )
}

// ---------------------------------------------------------------------------
// Pre-flight: conflict detection vs .prismeai/last-pull.json
//
// Refuses to deploy if remote source files / automations changed since the
// last `npm run pull`. Compares server-side versions (source asset updatedAt:size and
// automation checksum) against the manifest. Bypassed with --force or
// PRISMEAI_FORCE=true. Skipped silently when no manifest exists (first-time
// deploy from a clean clone).
// ---------------------------------------------------------------------------

const MANIFEST_PATH = path.join(ROOT, '.prismeai/last-pull.json')

async function detectConflicts() {
  let manifest
  try {
    const raw = await readFile(MANIFEST_PATH, 'utf8')
    manifest = JSON.parse(raw)
  } catch {
    console.log('· no .prismeai/last-pull.json — first deploy, conflict detection skipped')
    return
  }

  if (manifest.workspaceId && manifest.workspaceId !== PRISMEAI_WORKSPACE_ID) {
    fail(
      `Manifest workspace (${manifest.workspaceId}) doesn't match current PRISMEAI_WORKSPACE_ID (${PRISMEAI_WORKSPACE_ID}).\n` +
      `Run \`rm .prismeai/last-pull.json && npm run pull\` to re-sync, or set PRISMEAI_WORKSPACE_ID to match.`
    )
  }

  console.log(`→ Conflict detection (vs .prismeai/last-pull.json)`)

  const ws = await api('GET', `/workspaces/${PRISMEAI_WORKSPACE_ID}`)
  const remoteAutomations = ws?.automations || {}

  const conflicts = []

  // Automations: compare server's checksum against manifest
  const manifestAutoSlugs = new Set(Object.keys(manifest.automations || {}))
  for (const slug of Object.keys(remoteAutomations)) {
    const remoteChecksum = remoteAutomations[slug]?.checksum
    const manifestChecksum = manifest.automations?.[slug]
    if (!manifestAutoSlugs.has(slug)) {
      conflicts.push(`+ automations/${slug}.yml — added remotely since last pull`)
    } else if (remoteChecksum && manifestChecksum && remoteChecksum !== manifestChecksum) {
      conflicts.push(`~ automations/${slug}.yml — modified remotely since last pull`)
    }
  }

  // Sources: the version of each source asset (src/…) against the manifest
  const assets = await listSourceAssets()
  const manifestSourcePaths = new Set(Object.keys(manifest.sourceFiles || {}))
  for (const asset of assets) {
    const relPath = fromSourceAssetPath(asset.path)
    const known = manifest.sourceFiles?.[relPath]
    if (!manifestSourcePaths.has(relPath)) {
      conflicts.push(`+ ${relPath} — added remotely since last pull`)
    } else if (known && known !== assetVersion(asset)) {
      conflicts.push(`~ ${relPath} — modified remotely since last pull`)
    }
  }

  if (conflicts.length === 0) {
    console.log('  ✓ no remote changes since last pull')
    return
  }

  if (FORCE) {
    console.log(`  ⚠ ${conflicts.length} remote change(s) detected — proceeding anyway (--force):`)
    for (const c of conflicts) console.log('    ' + c)
    return
  }

  console.error()
  console.error(`✗ Deploy refused: ${conflicts.length} item(s) changed remotely since your last pull.`)
  for (const c of conflicts) console.error('    ' + c)
  console.error()
  console.error(`To resolve, choose one:`)
  console.error(`  • npm run pull                            # fetch remote changes, review with git diff, then npm run release`)
  console.error(`  • PRISMEAI_FORCE=true npm run release     # ⚠ overwrite remote changes with your local copy`)
  console.error(`  • npm run deploy -- --force               # same, but skips the build step`)
  console.error(`    (note: \`npm run release -- --force\` does NOT work — npm consumes --force as its own flag)`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 0. Sync automations (automations/**/*.yml ↔ workspace.automations)
// ---------------------------------------------------------------------------

const AUTOMATIONS_DIR = path.join(ROOT, 'automations')

async function collectLocalAutomations() {
  const exists = await stat(AUTOMATIONS_DIR).catch(() => null)
  if (!exists) return []
  const files = await walk(AUTOMATIONS_DIR, '')
  const out = []
  for (const f of files) {
    if (!f.rel.endsWith('.yml') && !f.rel.endsWith('.yaml')) continue
    const content = await readFile(f.abs, 'utf8')
    const parsed = yaml.load(content)
    if (!parsed || typeof parsed !== 'object' || !parsed.slug) {
      console.warn(`⚠ skipping ${f.rel}: missing top-level slug`)
      continue
    }
    out.push({ filePath: f.rel, ...parsed })
  }
  return out
}

function automationBody(local) {
  // Strip filePath; the API receives the DSUL automation body directly.
  // eslint-disable-next-line no-unused-vars
  const { filePath, ...body } = local
  return body
}

/** Whether this deploy runs the DSUL import (step 4b), which then carries the automations. */
const DSUL_IMPORT = !SKIP_DSUL_IMPORT && existsSync(path.join(ROOT, 'index.yml'))

// Content hash of each local automation, recorded in the manifest after a
// deploy: the next one (DSUL import off) PATCHes only what changed.
let automationHashes = {}
// Automations to delete after the DSUL import (step 4c).
let pendingDeletes = []

async function automationPlan() {
  const locals = (await collectLocalAutomations()).map((local) => ({ local, slug: local.slug, hash: contentHash(automationBody(local)) }))
  const ws = await api('GET', `/workspaces/${PRISMEAI_WORKSPACE_ID}`)
  const plan = planAutomations({ locals, remote: ws?.automations || {}, manifest: await readManifest(), dsulImport: DSUL_IMPORT })
  return { locals, plan }
}

async function syncAutomations() {
  if (SKIP_AUTOMATIONS_SYNC) {
    console.log('· automations sync skipped (PRISMEAI_SKIP_AUTOMATIONS_SYNC=true)')
    return
  }

  const { locals, plan } = await automationPlan()
  automationHashes = Object.fromEntries(locals.map((l) => [l.slug, l.hash]))
  if (locals.length === 0) {
    console.log(`· ${existsSync(AUTOMATIONS_DIR) ? 'automations/ is empty' : 'no automations/ directory'} — skipping`)
    return
  }

  if (DSUL_IMPORT) {
    // One model rebuild (the import) instead of one per automation.
    pendingDeletes = plan.remove
    console.log(`→ ${locals.length} automations: created and updated by the DSUL import; ${plan.remove.length} to delete after it`)
    return
  }

  console.log(`→ Syncing automations: ${plan.create.length} new, ${plan.update.length} changed, ${plan.unchanged.length} unchanged, ${plan.remove.length} removed`)
  const bySlug = new Map(locals.map((l) => [l.slug, l.local]))
  for (const slug of plan.create) {
    await api('POST', `/workspaces/${PRISMEAI_WORKSPACE_ID}/automations`, { body: automationBody(bySlug.get(slug)) })
  }
  for (const slug of plan.update) {
    await api('PATCH', `/workspaces/${PRISMEAI_WORKSPACE_ID}/automations/${encodeURIComponent(slug)}`, { body: automationBody(bySlug.get(slug)) })
  }
  for (const slug of plan.remove) {
    console.log(`  ⚠ deleting remote automation not present locally: ${slug}`)
    await api('DELETE', `/workspaces/${PRISMEAI_WORKSPACE_ID}/automations/${encodeURIComponent(slug)}`)
  }
  console.log(`  created=${plan.create.length} updated=${plan.update.length} deleted=${plan.remove.length}`)
}

// 4c. After the DSUL import: delete, one by one, the automations removed from the repo.
async function deleteRemovedAutomations() {
  if (!DSUL_IMPORT || SKIP_AUTOMATIONS_SYNC || status.dsul !== 'done') { mark('prune', 'skipped'); return }
  if (!pendingDeletes.length) { console.log('· no removed automation to delete'); return }
  console.log(`→ Deleting ${pendingDeletes.length} automation(s) removed from the repo`)
  for (const slug of pendingDeletes) {
    console.log(`  ⚠ deleting remote automation not present locally: ${slug}`)
    await api('DELETE', `/workspaces/${PRISMEAI_WORKSPACE_ID}/automations/${encodeURIComponent(slug)}`)
  }
}

// ---------------------------------------------------------------------------
// 1. Sync source files (parity with syncFilesToWorkspace)
// ---------------------------------------------------------------------------

/** Sources the workspace holds, as the Builder keeps them: assets under src/. */
async function listSourceAssets() {
  const list = await api('GET', `/workspaces/${PRISMEAI_WORKSPACE_ID}/assets?prefix=${encodeURIComponent(SOURCES_FOLDER + '/')}`)
  return Array.isArray(list) ? list : []
}

async function readManifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8').catch(() => '{}'))
}

async function syncSourceFiles() {
  if (SKIP_SOURCE_SYNC) {
    console.log('· source sync skipped (PRISMEAI_SKIP_SOURCE_SYNC=true)')
    return {}
  }

  const files = await collectSourceFiles()
  const local = []
  for (const file of files) {
    const content = await readFile(file.abs, 'utf8')
    local.push({ rel: file.rel, content, hash: sha256(content) })
  }
  const remote = new Set((await listSourceAssets()).map((a) => fromSourceAssetPath(a.path)))
  // Content hashes of the last sync (the server keeps none): what changed since.
  const { sourceHashes } = await readManifest()
  const { toUpload, toDelete } = diffSources(local, sourceHashes, remote)
  console.log(`→ Syncing ${local.length} source files as assets (src/): ${toUpload.length} to upload, ${toDelete.length} to delete`)

  // A few files per request, like the Builder's batched save.
  for (let i = 0; i < toUpload.length; i += 20) {
    const fd = new FormData()
    for (const f of toUpload.slice(i, i + 20)) {
      const name = (f.rel.split('/').pop() || 'file').replace(/[;,\s]/g, '-')
      fd.append('file', new Blob([f.content], { type: 'text/plain' }), name)
      fd.append('path', toSourceAssetPath(f.rel))
    }
    await api('POST', `/workspaces/${PRISMEAI_WORKSPACE_ID}/assets`, { body: fd })
  }
  for (const rel of toDelete) {
    await api('DELETE', `/workspaces/${PRISMEAI_WORKSPACE_ID}/assets/${toSourceAssetPath(rel).split('/').map(encodeURIComponent).join('/')}`)
  }
  console.log(`  uploaded=${toUpload.length} skipped=${local.length - toUpload.length} deleted=${toDelete.length}`)
  return Object.fromEntries(local.map((f) => [f.rel, f.hash]))
}

// ---------------------------------------------------------------------------
// 3. Upload the view bundles (parity with useAppBuild buildIsolated)
//
// Workspace assets under dist/app/isolated/, with the app's sharing: a private
// app's views are private. Each name carries the hash of its content
// (`app.<hash>.js`): a new build gets new paths, no cache serves an old view.
// ---------------------------------------------------------------------------

/** Bindings of the workspace access (security.yml), given to the app's views. Undefined: the views keep the platform default. */
async function readViewBindings() {
  const sec = yaml.load(await readFile(path.join(ROOT, 'security.yml'), 'utf8').catch(() => '')) || {}
  const bindings = sec?.authorizations?.access?.bindings
  return Array.isArray(bindings) && bindings.length > 0 ? bindings : undefined
}

async function uploadViews({ sharing }) {
  const raw = await readFile(path.join(DIST, 'manifest.json'), 'utf8').catch(() =>
    fail('dist/manifest.json not found: run `npm run build` first.')
  )
  const { manifest, views } = JSON.parse(raw)
  const viewBindings = await readViewBindings()
  console.log(`→ Uploading ${views.length} view bundle${views.length > 1 ? 's' : ''} (sharing: ${sharing})`)
  const paths = {}
  for (const view of views) {
    const assetPath = `${ISOLATED_FOLDER}/${view.fileName}`
    const code = await readFile(path.join(DIST, view.fileName))
    const fd = new FormData()
    fd.append('file', new Blob([code], { type: 'application/javascript' }), view.fileName)
    fd.append('path', assetPath)
    fd.append('sharing', sharing)
    // The organizations and groups the workspace is shared with (security.yml,
    // authorizations.access.bindings) also open the app's views.
    if (viewBindings) fd.append('bindings', JSON.stringify(viewBindings))
    const res = await api('POST', `/workspaces/${PRISMEAI_WORKSPACE_ID}/assets`, { body: fd })
    if (!Array.isArray(res) || res[0]?.path !== assetPath) {
      fail(`Upload of the "${view.name}" view failed. Check that the token has write access to the workspace (and that the platform serves workspace assets).`)
    }
    // Relative: the platform resolves it against the API of the environment.
    paths[view.name] = `assets/${assetPath}`
    console.log(`✓ ${view.name}: assets/${assetPath}`)
  }
  return { views: paths, manifest }
}

// ---------------------------------------------------------------------------
// 4. Patch workspace config (the live pointer)
// ---------------------------------------------------------------------------

async function patchWorkspaceConfig({ views, manifest, ws, slug, sharing }) {
  console.log(`→ Patching config.value.bundles[${slug}]`)
  const existing = ws?.config?.value || {}
  const existingBundles = existing.bundles || {}
  const previous = existingBundles[slug]
  console.log(`  sharing=${sharing}${PRISMEAI_APP_AGENT ? ` agent=${PRISMEAI_APP_AGENT}` : ''}`)

  await api('PATCH', `/workspaces/${PRISMEAI_WORKSPACE_ID}`, {
    body: {
      config: {
        value: {
          ...existing,
          bundles: {
            ...existingBundles,
            // Merged: keys set from the Builder or the API (`metadata` for
            // link previews…) survive a redeploy.
            [slug]: isolatedEntry(previous, {
              views,
              manifest,
              version: PRISMEAI_APP_VERSION,
              name: ws?.name || slug,
              sharing,
              mcp: PRISMEAI_MCP_WEBHOOK,
              agent: PRISMEAI_APP_AGENT,
            }),
          },
        },
      },
    },
  })
}

// ---------------------------------------------------------------------------
// 4b. DSUL import (index.yml, security.yml, imports/, automations/)
//
// See scripts/lib/dsul.mjs. Runs after the config PATCH, reading the live
// config right before zipping, so the app pointer just written (bundles) and
// the ids written by the workspace at runtime (agent.id) are kept.
// ---------------------------------------------------------------------------

async function walkDsul(dir, rel = '') {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'src', 'scripts', 'vendor', '.git', '.prismeai', 'docs'].includes(entry.name) && !rel) continue
      out.push(...(await walkDsul(path.join(dir, entry.name), r)))
    } else if (isDsulFile(r)) out.push(r)
  }
  return out
}

async function importDsul() {
  if (SKIP_DSUL_IMPORT) { console.log('· DSUL import skipped (PRISMEAI_SKIP_DSUL_IMPORT=true)'); mark('dsul', 'skipped'); return }
  if (!existsSync(path.join(ROOT, 'index.yml'))) { console.log('· no index.yml, DSUL import skipped'); mark('dsul', 'skipped'); return }
  console.log('→ Importing DSUL (index.yml, security.yml, imports/, automations/)')
  const live = await api('GET', `/workspaces/${PRISMEAI_WORKSPACE_ID}`)
  const local = yaml.load(await readFile(path.join(ROOT, 'index.yml'), 'utf8'))
  const { index, kept } = mergeIndex(local, live, parsePreserve(process.env.PRISMEAI_DSUL_PRESERVE_CONFIG), PRISMEAI_WORKSPACE_ID)
  const files = {}
  for (const rel of await walkDsul(ROOT)) {
    // The platform reads archives with one top folder (as its own exports).
    files[`workspace/${rel}`] = rel === 'index.yml'
      ? strToU8(yaml.dump(index, { lineWidth: -1, quotingType: "'" }))
      : new Uint8Array(await readFile(path.join(ROOT, rel)))
  }
  const zip = zipSync(files)
  const fd = new FormData()
  fd.append('archive', new Blob([zip], { type: 'application/zip' }), 'workspace.zip')
  const res = await api('POST', `/workspaces/${PRISMEAI_WORKSPACE_ID}/import`, { body: fd })
  const errors = res?.errors || []
  console.log(`✓ imported ${Object.keys(files).length} file(s)${kept.length ? `, kept live ${kept.join(', ')}` : ''}`)
  for (const w of res?.warnings || []) console.warn(`  ⚠ ${w.message || JSON.stringify(w)}`)
  if (errors.length) fail(`DSUL import reported ${errors.length} error(s):\n` + errors.map(e => `  ✗ ${e.filepath || ''} ${e.message || JSON.stringify(e)}`).join('\n'))
}

// ---------------------------------------------------------------------------
// 4b. Cleanup of bundle files no app points at
//
// Each deploy uploads NEW view files (their name carries their hash).
// The platform doesn't dedupe; old files stay in workspace storage forever
// unless we clean them up. Run AFTER the config PATCH so we know which URLs
// are still referenced.
// ---------------------------------------------------------------------------

async function cleanupOrphanBundles() {
  if (SKIP_BUNDLE_CLEANUP) {
    console.log('· bundle cleanup skipped (PRISMEAI_SKIP_BUNDLE_CLEANUP=true)')
    return
  }

  console.log(`→ Cleaning up bundle files no app points at`)

  // Fetch the workspace fresh to get the canonical current bundles map
  const ws = await api('GET', `/workspaces/${PRISMEAI_WORKSPACE_ID}`)
  const bundles = ws?.config?.value?.bundles || {}
  const referenced = referencedFiles(bundles)

  // List public files (bundles + embeds are uploaded with public=true)
  const list = await api('GET', `/workspaces/${PRISMEAI_WORKSPACE_ID}/files?limit=1000`)
  const files = Array.isArray(list) ? list : list?.result || []
  // Bundles of shared apps (bundle.js, embed.js) and views of isolated ones
  // (<view>.<hash>.js), whichever app of the workspace deployed them.
  const candidates = files.filter(f =>
    f.public === true &&
    (f.name === 'bundle.js' || f.name === 'embed.js' || VIEW_FILE.test(f.name || ''))
  )

  let deleted = 0, kept = 0
  for (const f of candidates) {
    if (referenced.has(f.url)) {
      kept++
      continue
    }
    await api('DELETE', `/workspaces/${PRISMEAI_WORKSPACE_ID}/files/${encodeURIComponent(f.id)}`)
    deleted++
  }
  // Views of earlier deploys, as workspace assets (dist/app/isolated/).
  const assets = await api('GET', `/workspaces/${PRISMEAI_WORKSPACE_ID}/assets?prefix=${encodeURIComponent(ISOLATED_FOLDER + '/')}`)
  for (const asset of Array.isArray(assets) ? assets : []) {
    if (referenced.has(`assets/${asset.path}`)) {
      kept++
      continue
    }
    await api('DELETE', `/workspaces/${PRISMEAI_WORKSPACE_ID}/assets/${asset.path.split('/').map(encodeURIComponent).join('/')}`)
    deleted++
  }
  console.log(`  kept=${kept} deleted=${deleted}`)
}

// ---------------------------------------------------------------------------
// 4c. Smoke test
//
// A successful PATCH doesn't mean the app loads. Replays what the platform
// does: resolves the app through /pages/<slug>/_bundle, checks it is
// isolated, then fetches and parses each view bundle.
// ---------------------------------------------------------------------------

async function smokeTest({ slug }) {
  if (SKIP_SMOKE) {
    console.log('· smoke test skipped (PRISMEAI_SKIP_SMOKE=true)')
    return
  }
  console.log(`→ Smoke test`)
  const resolved = await api('GET', `/pages/${encodeURIComponent(slug)}/_bundle`)
  const entry = resolved?.bundles?.[slug]
  if (!entry?.bundle) fail(`Smoke: /pages/${slug}/_bundle has no bundles[${slug}].bundle`)
  if (entry.format !== 'isolated') fail(`Smoke: bundles[${slug}] is not isolated (format: ${entry.format ?? 'shared'})`)
  for (const [name, ref] of Object.entries(entry.views ?? { app: entry.bundle })) {
    // A relative asset path, as the platform resolves it; with the token, as a
    // private app's view needs a session.
    const url = /^https?:\/\//.test(ref) ? ref : `${API_BASE}/workspaces/${encodeURIComponent(slug)}/${ref}`
    const res = await fetch(url, { headers: AUTH_HEADERS })
    if (!res.ok) fail(`Smoke: view "${name}" returned ${res.status} ${res.statusText}`)
    const code = await res.text()
    if (!code) fail(`Smoke: view "${name}" is empty`)
    try {
      new Function(code)
    } catch (err) {
      fail(`Smoke: view "${name}" is not valid JavaScript (${err?.message || err})`)
    }
    console.log(`  ✓ ${name}: reachable, valid JS (${(code.length / 1024).toFixed(1)} KB)`)
  }
}

// ---------------------------------------------------------------------------
// 5. Version snapshot (parity with buildAndDeploy step 6)
// ---------------------------------------------------------------------------

// Refresh .prismeai/last-pull.json after successful deploy so subsequent
// deploys see "no remote changes" instead of falsely flagging our own pushes.
// Without this, every deploy after the first one needs --force.
async function refreshManifest(sourceHashes) {
  const ws = await api('GET', `/workspaces/${PRISMEAI_WORKSPACE_ID}`)
  const assets = await listSourceAssets()
  const previous = await readManifest()
  const manifest = {
    pulledAt: new Date().toISOString(),
    workspaceId: PRISMEAI_WORKSPACE_ID,
    automations: {},
    // Version of each source asset (updatedAt:size): a later change is the Builder's.
    sourceFiles: {},
    // Content hash of each source as last synced: the next deploy uploads only what changed.
    sourceHashes: sourceHashes && Object.keys(sourceHashes).length ? sourceHashes : previous.sourceHashes || {},
    // Content hash of each automation as last deployed: with the DSUL import
    // off, the next deploy PATCHes only what changed.
    automationHashes: Object.keys(automationHashes).length ? automationHashes : previous.automationHashes || {},
  }
  for (const slug of Object.keys(ws?.automations || {})) {
    manifest.automations[slug] = ws.automations[slug]?.checksum
  }
  for (const asset of assets) manifest.sourceFiles[fromSourceAssetPath(asset.path)] = assetVersion(asset)
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true })
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
}

async function versionSnapshot() {
  if (SKIP_VERSION_SNAPSHOT) {
    console.log('· version snapshot skipped (PRISMEAI_SKIP_VERSION_SNAPSHOT=true)')
    return
  }
  console.log(`→ Creating version snapshot v${PRISMEAI_APP_VERSION}`)
  const res = await api('POST', `/workspaces/${PRISMEAI_WORKSPACE_ID}/versions`, {
    body: { description: `v${PRISMEAI_APP_VERSION}` },
  })
  const name = res?.name || res?.version?.name || 'unknown'
  console.log(`✓ version=${name}`)
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

// Secret hygiene: warn loudly if .env is tracked by git (it's in .gitignore
// by default, so being tracked means someone force-added it and the access
// token may be in commit history).
function warnIfEnvTracked() {
  try {
    const tracked = execSync('git ls-files --error-unmatch .env', {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8',
    }).trim()
    if (tracked) {
      console.warn('⚠ .env is tracked by git. Your PRISMEAI_ACCESS_TOKEN may be in commit history.')
      console.warn('  Recommended:')
      console.warn('    git rm --cached .env && git commit -m "untrack .env"')
      console.warn('    Then rotate the token in your platform UI: Settings → Access Tokens')
      console.warn('')
    }
  } catch { /* not tracked, or not a git repo — both fine */ }
}

warnIfEnvTracked()

// Track each step's status so a partial failure can print exactly what
// happened and what the user should do next.
const steps = [
  { key: 'conflict',    label: 'Conflict detection' },
  { key: 'automations', label: DSUL_IMPORT ? 'Automations plan (carried by the DSUL import)' : 'Automations sync (new and changed only)' },
  { key: 'source',      label: 'Source files sync' },
  { key: 'bundle',      label: 'View bundles upload' },
  { key: 'config',      label: 'Workspace config PATCH (live pointer)' },
  { key: 'dsul',        label: 'DSUL import (index.yml, security.yml, imports/, automations/)' },
  { key: 'prune',       label: 'Delete automations removed from the repo (after the import)' },
  { key: 'cleanup',     label: 'Orphan bundle cleanup' },
  { key: 'smoke',       label: 'Smoke test (isolated entry, views load)' },
  { key: 'version',     label: 'Version snapshot' },
]
const status = Object.fromEntries(steps.map(s => [s.key, 'pending']))

function mark(key, value) { status[key] = value }

function printSummary() {
  console.log('\nSummary:')
  const icon = { done: '✓', failed: '✗', skipped: '·', pending: '○' }
  for (const s of steps) console.log(`  ${icon[status[s.key]] || '?'} ${s.label}`)
}

// Per-step recovery guidance — what the user should do next given which step failed.
// The CRITICAL boundary is `config`: before it, end users still see the previous
// version. After it, the new version is live.
const RECOVERY = {
  conflict:    'No state changed. Either run `npm run pull` to fetch remote changes, or use --force to override.',
  automations: DSUL_IMPORT
    ? 'Nothing was written (with the DSUL import, this step only reads the workspace). Re-run `npm run deploy`.'
    : 'Some automations may have been pushed before the failure. The live UI is unaffected. Re-run `npm run deploy` to retry (PATCHes are idempotent).',
  source:      'Some source files may have been uploaded. The live UI is unaffected. Re-run `npm run deploy` — differential sync will only push what changed.',
  bundle:      'A view upload failed. End users still see the previous version. Re-run `npm run deploy`.',
  config:      'CRITICAL: bundle was uploaded but workspace config was NOT updated. The new bundle is orphaned; end users still see the OLD version. Re-run `npm run deploy` — a new bundle upload will succeed and the config patch will retry.',
  dsul:        'The app is live, but index.yml / security.yml / imports/ / automations/ were not imported: the automations, the workspace config, its installed apps and its auto-init may be stale. Fix the reported file and re-run `npm run deploy`.',
  prune:       'The import succeeded; some automations removed from the repo are still in the workspace. Re-run `npm run deploy` to delete them.',
  cleanup:     'Deploy SUCCEEDED — the live UI is updated to the new bundle. Cleanup of orphan bundle files failed but is non-critical (will retry next deploy).',
  smoke:       'Bundle is live but the smoke test failed — the bundle may be syntactically broken or reference a missing external. End users will see a "Failed to load bundle" error. Run `npm run undeploy` to roll back, OR fix the bundle and re-deploy.',
  version:     'Deploy SUCCEEDED — the live UI is updated. Version snapshot failed; you may not have a rollback point for this release.',
}

console.log(`Deploying to ${API_BASE}, workspace=${PRISMEAI_WORKSPACE_ID}`)

// ---------------------------------------------------------------------------
// 0. Format guard
//
// This starter builds isolated apps. An app already deployed in the shared
// format (the format before isolated apps) is a different app: deploying over
// it would replace it, and overwrite its Builder sources with this repo's.
// Checked before anything is written.
// ---------------------------------------------------------------------------

async function checkFormat() {
  const ws = await api('GET', `/workspaces/${PRISMEAI_WORKSPACE_ID}`)
  const target = process.env.PRISMEAI_BUNDLE_SLUG || ws?.slug || PRISMEAI_WORKSPACE_ID
  const previous = ws?.config?.value?.bundles?.[target]
  if (!previous?.bundle || previous.format === 'isolated') return
  if (ALLOW_FORMAT_SWITCH) {
    console.log(`⚠ bundles[${target}] is a shared app: replaced by this isolated app (PRISMEAI_ALLOW_FORMAT_SWITCH=true)`)
    return
  }
  console.error(`✗ bundles[${target}] is an app in the shared format.`)
  console.error(`  This starter builds isolated apps; deploying would replace that app and its sources.`)
  console.error(`  Deploy to another key (PRISMEAI_BUNDLE_SLUG) or workspace, set PRISMEAI_ALLOW_FORMAT_SWITCH=true`)
  console.error(`  to replace it, or keep working on it with the legacy-shared branch of this starter.`)
  process.exit(1)
}

try {
  await checkFormat()
} catch (err) {
  console.error(`✗ Could not read the workspace: ${err?.message || err}`)
  process.exit(1)
}

// --plan: print the automation calls this deploy would make, then exit (reads only).
if (PLAN_ONLY) {
  try {
    const { locals, plan } = await automationPlan()
    const { before, after } = callCounts({ locals, plan })
    console.log(`DSUL import: ${DSUL_IMPORT ? 'on' : 'off'}; ${locals.length} local automations`)
    console.log(`  POST   ${plan.create.length}${plan.create.length ? ` (${plan.create.join(', ')})` : ''}`)
    console.log(`  PATCH  ${plan.update.length}${plan.update.length ? ` (${plan.update.join(', ')})` : ''}`)
    console.log(`  DELETE ${plan.remove.length}${plan.remove.length ? ` (${plan.remove.join(', ')})` : ''}${DSUL_IMPORT ? ', after the import' : ''}`)
    if (DSUL_IMPORT) console.log('  + 1 POST /import (creates and updates the automations)')
    console.log(`Automation calls: ${after} (previous script: ${before})`)
    process.exit(0)
  } catch (err) {
    console.error(`✗ ${err?.message || err}`)
    process.exit(1)
  }
}

let exitCode = 0
let slug

try {
  await detectConflicts();             mark('conflict', 'done')
  await syncAutomations();             mark('automations', SKIP_AUTOMATIONS_SYNC ? 'skipped' : 'done')
  const sourceHashes = await syncSourceFiles();  mark('source', SKIP_SOURCE_SYNC ? 'skipped' : 'done')

  const ws = await api('GET', `/workspaces/${PRISMEAI_WORKSPACE_ID}`)
  slug = process.env.PRISMEAI_BUNDLE_SLUG || ws?.slug || PRISMEAI_WORKSPACE_ID
  const sharing = appSharing(ws?.config?.value?.bundles?.[slug])
  const { views, manifest } = await uploadViews({ sharing });  mark('bundle', 'done')


  await patchWorkspaceConfig({ views, manifest, ws, slug, sharing });  mark('config', 'done')
  await importDsul();                  mark('dsul', status.dsul === 'pending' ? 'done' : status.dsul)
  await deleteRemovedAutomations();    mark('prune', status.prune === 'pending' ? 'done' : status.prune)
  await cleanupOrphanBundles();       mark('cleanup', SKIP_BUNDLE_CLEANUP ? 'skipped' : 'done')
  await smokeTest({ slug });           mark('smoke', SKIP_SMOKE ? 'skipped' : 'done')
  await versionSnapshot();             mark('version', SKIP_VERSION_SNAPSHOT ? 'skipped' : 'done')
  await refreshManifest(sourceHashes)  // refresh .prismeai/last-pull.json so subsequent deploys aren't blocked

  console.log()
  console.log(`✓ Deploy complete. App is live at <your-platform>/apps/${slug} (and /p/${slug})`)
  printSummary()
} catch (err) {
  exitCode = 1
  // First step still 'pending' is the one that threw.
  const failedKey = steps.find(s => status[s.key] === 'pending')?.key || 'unknown'
  mark(failedKey, 'failed')
  const errMsg = (err?.message || String(err)).split('\n').slice(0, 5).join('\n  ')

  console.error()
  console.error(`✗ Deploy FAILED at step: ${steps.find(s => s.key === failedKey)?.label || failedKey}`)
  console.error(`  ${errMsg}`)
  console.error()
  console.error(`Next action:`)
  console.error(`  ${RECOVERY[failedKey] || 'Re-run npm run deploy.'}`)
  printSummary()
} finally {
  process.exit(exitCode)
}
