/**
 * What `npm run build` and `npm run deploy` share with the Builder's
 * compiler and deploy (services/platform: lib/isolatedApps/compileIsolated.ts,
 * builder hooks/useAppBuild.ts): the same entries, the same CSS rewrite, the
 * same bundle entry. Pure functions, tested in isolated.test.mjs.
 */
import { createHash } from 'node:crypto'

export const APP_VIEW = 'app'
export const APP_ENTRY = 'src/App.tsx'
const VIEW_ENTRY = /^src\/views\/([A-Za-z0-9_-]+)\.(tsx|ts|jsx|js)$/
export const KIT = '@prisme.ai/mcp-apps'
export const BOOT_SPECIFIER = `${KIT}/boot`
/** A view bundle as deployed: `<view>.<16 hex>.js`. */
export const VIEW_FILE = /^[a-z0-9-]+\.[0-9a-f]{16}\.js$/
/** Workspace assets folder of the views, under the app folder (the app's sharing). */
export const ISOLATED_FOLDER = 'dist/app/isolated'
const SHARINGS = ['private', 'authenticated', 'public']

/**
 * Who can open the app: PRISMEAI_SHARING, else PRISMEAI_PUBLIC=true (public),
 * else what the deployed entry says (`sharing`, or `public` of older deploys),
 * else private.
 */
export function appSharing(previous, env = process.env) {
  if (env.PRISMEAI_SHARING) {
    if (!SHARINGS.includes(env.PRISMEAI_SHARING)) throw new Error(`PRISMEAI_SHARING must be one of ${SHARINGS.join(', ')}`)
    return env.PRISMEAI_SHARING
  }
  if (env.PRISMEAI_PUBLIC === 'true') return 'public'
  if (env.PRISMEAI_PUBLIC === 'false') return 'private'
  if (SHARINGS.includes(previous?.sharing)) return previous.sharing
  if (previous?.public === true) return 'public'
  return 'private'
}

export function toViewName(fileBase) {
  return fileBase
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
}

/** Views of the app, the full app first: src/App.tsx, then each src/views/<Name>.tsx. */
export function findEntries(files) {
  const entries = []
  if (files.includes(APP_ENTRY)) entries.push({ name: APP_VIEW, file: APP_ENTRY })
  const seen = new Set(entries.map((e) => e.name))
  for (const file of [...files].sort()) {
    const m = VIEW_ENTRY.exec(file)
    if (!m) continue
    const name = toViewName(m[1])
    if (seen.has(name)) throw new Error(`Two views are named "${name}" (${file})`)
    seen.add(name)
    entries.push({ name, file })
  }
  return entries
}

/** The generated entry of a view: the component, started by the kit. */
export function bootEntrySource(entry) {
  const importPath = '@/' + entry.file.replace(/^src\//, '').replace(/\.(tsx|ts|jsx|js)$/, '')
  return [
    `import View from ${JSON.stringify(importPath)}`,
    `import { mountView } from ${JSON.stringify(BOOT_SPECIFIER)}`,
    `mountView(View, { appName: ${JSON.stringify(entry.name)} })`,
  ].join('\n')
}

export function contentHash(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

/** Class the page host puts on the element that carries its theme (`dark`…). */
const PAGE_THEME_CLASS = 'prisme-app-theme'

function splitSelectors(list) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i))
      start = i + 1
    }
  }
  out.push(list.slice(start))
  return out
}

function hostSelector(selector) {
  return selector.replace(/:root((?:\.[\w-]+|\[[^\]]*\])*)/g, (_, compound) => (compound ? `.${PAGE_THEME_CLASS}${compound}` : ':host'))
}

/**
 * In a page the app renders under a shadow root, where `:root` matches
 * nothing: every selector naming `:root` gets a `:host` twin (`:root.dark`
 * targets the element that carries the theme). The chat's frame still
 * matches `:root`.
 */
export function shadowCompatibleCss(css) {
  if (!css.includes(':root')) return css
  const comments = []
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (c) => `/*${comments.push(c) - 1}*/`)
  const rewritten = bare.replace(/(^|[{};])([^{};@]*:root\b[^{};]*)\{/g, (_, before, prelude) => {
    const lead = prelude.match(/^(?:\s|\/\*\d+\*\/)*/)?.[0] ?? ''
    const selectors = splitSelectors(prelude.slice(lead.length)).flatMap((sel) => {
      const trimmed = sel.trim()
      return /:root\b/.test(trimmed) ? [trimmed, hostSelector(trimmed)] : [trimmed]
    })
    return `${before}${lead}${selectors.join(', ')} {`
  })
  return rewritten.replace(/\/\*(\d+)\*\//g, (_, i) => comments[Number(i)])
}

/** A stylesheet import: handed to the kit, which puts it where the view renders. */
export function cssModule(css) {
  return `import { addStyle } from ${JSON.stringify(BOOT_SPECIFIER)}\naddStyle(${JSON.stringify(shadowCompatibleCss(css))})`
}

/**
 * The deployed entry of the app (`config.value.bundles[<slug>]`): merged into
 * the previous one, so what is set elsewhere (metadata for link previews,
 * displayMode…) survives; `embed` goes, an isolated app has none.
 */
export function isolatedEntry(previous, { views, manifest, version, name, sharing, mcp, agent }) {
  const { embed: _embed, public: _public, ...kept } = previous ?? {}
  return {
    ...kept,
    format: 'isolated',
    bundle: views[APP_VIEW] ?? Object.values(views)[0],
    views,
    manifest,
    version,
    name,
    builtAt: manifest.builtAt,
    sharing,
    // Read by the serving of older platform versions.
    displayMode: sharing === 'public' ? 'standalone' : 'platform',
    ...(mcp && { mcp }),
    ...(agent !== undefined && (agent ? { agent } : { agent: undefined })),
  }
}

/** Every view bundle URL a workspace's apps still point at. */
export function referencedFiles(bundles) {
  const urls = new Set()
  for (const entry of Object.values(bundles ?? {})) {
    if (entry?.bundle) urls.add(entry.bundle)
    if (entry?.embed) urls.add(entry.embed)
    for (const url of Object.values(entry?.views ?? {})) urls.add(url)
  }
  return urls
}

/** The Builder keeps an app's sources as workspace assets under this folder. */
export const SOURCES_FOLDER = 'src'
export const toSourceAssetPath = (rel) => `${SOURCES_FOLDER}/${rel}`
export const fromSourceAssetPath = (assetPath) =>
  assetPath.startsWith(`${SOURCES_FOLDER}/`) ? assetPath.slice(SOURCES_FOLDER.length + 1) : assetPath

/**
 * Version of a source asset as the server lists it (no content hash on the
 * server): it changes whenever the asset is written, by this repo or the Builder.
 */
export const assetVersion = (asset) => `${asset.updatedAt}:${asset.size}`

/**
 * What a deploy writes, against the content hashes it last synced: new and
 * changed files uploaded, files gone locally deleted.
 */
export function diffSources(local, synced, remotePaths) {
  const localPaths = new Set(local.map((f) => f.rel))
  return {
    toUpload: local.filter((f) => !remotePaths.has(f.rel) || synced?.[f.rel] !== f.hash),
    toDelete: [...remotePaths].filter((rel) => !localPaths.has(rel)),
  }
}
