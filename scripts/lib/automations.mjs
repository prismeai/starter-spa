/**
 * Which automation calls a deploy makes (pure, tested in automations.test.mjs).
 *
 * Each POST/PATCH/DELETE of an automation makes the runtime rebuild the whole
 * workspace model; the DSUL import rebuilds it once. So:
 * - DSUL import on: no POST nor PATCH, the import creates and updates the
 *   automations. Only the automations the workspace holds and the repo no
 *   longer has are deleted, one by one, after the import.
 * - DSUL import off: POST the new ones, PATCH only those that changed (local
 *   content or remote checksum differs from the last deploy), DELETE the
 *   removed ones.
 */
import { createHash } from 'node:crypto'

/** JSON with object keys sorted at every depth, so equal bodies hash equal. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function contentHash(body) {
  return createHash('sha256').update(canonicalJson(body), 'utf8').digest('hex')
}

/**
 * @param {object} o
 * @param {{slug: string, hash: string}[]} o.locals  automations of the repo
 * @param {Record<string, {checksum?: string}>} o.remote  GET /workspaces/:id → automations
 * @param {{automations?: Record<string,string>, automationHashes?: Record<string,string>}} [o.manifest]  .prismeai/last-pull.json
 * @param {boolean} o.dsulImport  whether the DSUL import runs in this deploy
 * @returns {{create: string[], update: string[], remove: string[], unchanged: string[]}}
 */
export function planAutomations({ locals, remote, manifest = {}, dsulImport }) {
  const remoteSlugs = new Set(Object.keys(remote || {}))
  const localSlugs = new Set(locals.map((l) => l.slug))
  const remove = [...remoteSlugs].filter((s) => !localSlugs.has(s)).sort()
  if (dsulImport) return { create: [], update: [], remove, unchanged: [] }

  const create = []
  const update = []
  const unchanged = []
  const lastHashes = manifest.automationHashes || {}
  const lastChecksums = manifest.automations || {}
  for (const { slug, hash } of locals) {
    if (!remoteSlugs.has(slug)) { create.push(slug); continue }
    const remoteChecksum = remote[slug]?.checksum
    const changed =
      !lastHashes[slug] || lastHashes[slug] !== hash || // edited here, or never deployed by this script
      !remoteChecksum || !lastChecksums[slug] || remoteChecksum !== lastChecksums[slug] // edited there
    ;(changed ? update : unchanged).push(slug)
  }
  return { create, update, remove, unchanged }
}

/** Automation calls of the previous script (POST or PATCH each, DELETE removed) vs this plan. */
export function callCounts({ locals, plan }) {
  return {
    before: locals.length + plan.remove.length,
    after: plan.create.length + plan.update.length + plan.remove.length,
  }
}
