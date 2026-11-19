#!/usr/bin/env node
/**
 * Builds the app in the isolated format, as the Builder does when it deploys:
 * one self-contained bundle per view.
 *
 *   src/App.tsx            → dist/app.<hash>.js     the full app (pages, /p/<slug>)
 *   src/views/<Name>.tsx   → dist/<name>.<hash>.js  a view a tool can show in the chat
 *   dist/manifest.json     what was copied in (kit, React…), and the views
 *
 * Everything is bundled: React, your npm dependencies and the kit
 * (@prisme.ai/mcp-apps, from vendor/). Nothing is loaded from the platform at
 * run time, so a platform upgrade never changes a deployed app.
 *
 * Each bundle is an IIFE whose entry is generated: your component, started by
 * the kit's `mountView`, which connects it to the page or to the chat.
 */
import * as esbuild from 'esbuild'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KIT, bootEntrySource, contentHash, cssModule, findEntries } from './lib/isolated.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'dist')
const KIT_DIR = path.join(ROOT, 'vendor', KIT)
const KIT_FILES = { [KIT]: 'index.js', [`${KIT}/react`]: 'react.js', [`${KIT}/boot`]: 'boot.js' }

async function listFiles(dir, prefix) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const rel = `${prefix}/${e.name}`
    if (e.isDirectory()) out.push(...(await listFiles(path.join(dir, e.name), rel)))
    else out.push(rel)
  }
  return out
}

function packageOf(file) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(file)
  return m?.[1]
}

function versionOf(pkg) {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version
  } catch {
    return undefined
  }
}

const isolatedPlugin = (entrySource) => ({
  name: 'isolated-app',
  setup(build) {
    build.onResolve({ filter: /^__entry__$/ }, () => ({ path: 'entry', namespace: 'entry' }))
    build.onLoad({ filter: /.*/, namespace: 'entry' }, () => ({ contents: entrySource, loader: 'tsx', resolveDir: ROOT }))
    // The kit comes from vendor/ (copied from the platform), not from npm.
    build.onResolve({ filter: /^@prisme\.ai\/mcp-apps(\/(react|boot))?$/ }, (args) => ({ path: path.join(KIT_DIR, KIT_FILES[args.path]) }))
    build.onResolve({ filter: /^@prisme\.ai\/sdk$|^@prisme\// }, (args) => ({
      errors: [{ text: `${args.path} is a platform module, not available in isolated apps: use the \`app\` object (app.webhooks, app.events, app.user, app.callServerTool…).` }],
    }))
    // A stylesheet goes to the kit, which puts it where the view renders
    // (its frame in the chat, its shadow root in a page).
    build.onLoad({ filter: /\.css$/ }, async (args) => ({ contents: cssModule(await readFile(args.path, 'utf8')), loader: 'js', resolveDir: path.dirname(args.path) }))
  },
})

const start = Date.now()
if (!existsSync(path.join(KIT_DIR, 'boot.js'))) {
  console.error(`✗ The kit is missing (vendor/${KIT}/boot.js): run npm run sync-kit, or restore vendor/ from git.`)
  process.exit(1)
}
const kitVersion = JSON.parse(await readFile(path.join(KIT_DIR, 'kit.json'), 'utf8')).version
const sources = (await listFiles(path.join(ROOT, 'src'), 'src')).filter((f) => !f.startsWith('src/dev/'))
const entries = findEntries(sources)
if (!entries.length) {
  console.error('✗ Nothing to build: add src/App.tsx or a view in src/views/<Name>.tsx')
  process.exit(1)
}

await rm(OUT_DIR, { recursive: true, force: true })
await mkdir(OUT_DIR, { recursive: true })

const used = new Map([[KIT, kitVersion]])
const views = []
const SIZE_WARN = parseInt(process.env.PRISMEAI_BUNDLE_SIZE_WARN || '1048576', 10) // 1 MB
const SIZE_MAX = parseInt(process.env.PRISMEAI_BUNDLE_SIZE_MAX || '4194304', 10) // 4 MB
let failed = false

for (const entry of entries) {
  let result
  try {
    result = await esbuild.build({
      entryPoints: ['__entry__'],
      absWorkingDir: ROOT,
      plugins: [isolatedPlugin(bootEntrySource(entry))],
      alias: { '@': path.join(ROOT, 'src') },
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      minify: true,
      metafile: true,
      write: false,
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' },
    })
  } catch (err) {
    for (const e of err.errors ?? [err]) {
      const where = e.location ? `${e.location.file}:${e.location.line}:${e.location.column} ` : ''
      console.error(`✗ [${entry.name}] ${where}${e.text ?? e.message}`)
    }
    failed = true
    continue
  }
  for (const w of result.warnings) console.warn(`⚠ [${entry.name}] ${w.text}`)
  for (const input of Object.keys(result.metafile.inputs)) {
    const pkg = packageOf(input)
    if (pkg && !used.has(pkg)) used.set(pkg, versionOf(pkg))
  }
  const code = result.outputFiles[0].text
  const fileName = `${entry.name}.${contentHash(code)}.js`
  await writeFile(path.join(OUT_DIR, fileName), code)
  const bytes = Buffer.byteLength(code)
  views.push({ name: entry.name, fileName, bytes })
  console.log(`✓ dist/${fileName} (${(bytes / 1024).toFixed(1)} KB)`)
  if (bytes > SIZE_MAX) {
    console.error(`✗ [${entry.name}] over ${(SIZE_MAX / 1024).toFixed(0)} KB (PRISMEAI_BUNDLE_SIZE_MAX): trim it or raise the limit.`)
    failed = true
  } else if (bytes > SIZE_WARN) {
    console.warn(`⚠ [${entry.name}] over ${(SIZE_WARN / 1024).toFixed(0)} KB: consider dropping heavy dependencies.`)
  }
}
if (failed) process.exit(1)

const vendor = Object.fromEntries([...used.entries()].filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b)))
const manifest = { v: 1, vendor, builtAt: new Date().toISOString() }
await writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({ manifest, views }, null, 2) + '\n')
console.log(`✓ dist/manifest.json (kit ${kitVersion}, ${views.length} view${views.length > 1 ? 's' : ''}) in ${Date.now() - start}ms`)
