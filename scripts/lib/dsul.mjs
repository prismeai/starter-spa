// DSUL import helpers for scripts/deploy.mjs (step "DSUL import"). Generic:
// nothing here is specific to one workspace.
//
// The starter pushes automations one by one, but not index.yml (config.value,
// labels), security.yml nor imports/ (installed apps, Collections). The DSUL
// import step zips them with the automations and posts the archive to
// POST /workspaces/:id/import, the way the platform imports a workspace: the
// platform then emits workspaces.imported, which runs the auto-init listeners.
//
// index.yml replaces the workspace config on import, so the keys the platform
// or the workspace itself write at runtime are taken from the live workspace
// first (PRISMEAI_DSUL_PRESERVE_CONFIG, default "bundles,agent.id"): the app
// pointer written by the deploy, and the agent id written by update-agent.

export const DEFAULT_PRESERVE = ['bundles', 'agent.id']

export function parsePreserve(value) {
  // An empty value would wipe bundles (app down) and agent.id (duplicate agent): default instead.
  if (value === undefined || value === null || !String(value).trim()) return DEFAULT_PRESERVE
  return String(value).split(',').map((s) => s.trim()).filter(Boolean)
}

function getPath(obj, segs) {
  let o = obj
  for (const s of segs) {
    if (o === null || typeof o !== 'object' || !(s in o)) return undefined
    o = o[s]
  }
  return o
}

function setPath(obj, segs, value) {
  let o = obj
  for (const s of segs.slice(0, -1)) {
    if (o[s] === null || typeof o[s] !== 'object' || Array.isArray(o[s])) o[s] = {}
    o = o[s]
  }
  o[segs[segs.length - 1]] = value
}

// Returns a copy of the local index.yml with the preserved config.value keys
// taken from the live workspace (when the live workspace has them), and the
// id of the target workspace.
export function mergeIndex(localIndex, liveWorkspace, preserve = DEFAULT_PRESERVE, workspaceId) {
  const index = JSON.parse(JSON.stringify(localIndex || {}))
  if (workspaceId) index.id = workspaceId
  const liveValue = liveWorkspace?.config?.value || {}
  if (!index.config || typeof index.config !== 'object') index.config = {}
  if (!index.config.value || typeof index.config.value !== 'object') index.config.value = {}
  const kept = []
  for (const key of preserve) {
    const segs = key.split('.')
    const live = getPath(liveValue, segs)
    if (live === undefined) continue
    setPath(index.config.value, segs, live)
    kept.push(key)
  }
  return { index, kept }
}

// Which files of the workspace folder go in the archive.
export function isDsulFile(rel) {
  const p = rel.split('\\').join('/')
  if (p === 'index.yml' || p === 'security.yml') return true
  return /^(automations|imports|pages)\/.+\.ya?ml$/.test(p)
}
