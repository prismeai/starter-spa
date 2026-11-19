#!/usr/bin/env node
/**
 * Can the Builder still edit this app? The Builder compiles an isolated app
 * with the libraries its platform provides (/vendor/index.json); this repo
 * can use any npm package. `npm run check` lists the imports of src/ the
 * Builder of your platform does not provide: the app still builds and deploys
 * from here, but opened in the Builder, its preview and its Deploy fail.
 * Reads PRISMEAI_PLATFORM_URL from .env, or --from=https://<your platform>.
 */
import dotenv from 'dotenv'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env') })
const from = process.argv.find((a) => a.startsWith('--from='))?.slice(7) || process.env.PRISMEAI_PLATFORM_URL
if (!from) {
  console.error('✗ Give the platform URL: PRISMEAI_PLATFORM_URL in .env, or --from=https://<your platform>')
  process.exit(1)
}

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(abs)))
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(abs)
  }
  return out
}

const res = await fetch(from.replace(/\/$/, '') + '/vendor/index.json')
if (!res.ok) {
  console.error(`✗ ${from}/vendor/index.json: ${res.status}`)
  process.exit(1)
}
const provided = new Set(Object.keys((await res.json()).modules ?? {}))
// Local development files never reach the Builder's build.
const files = (await walk(path.join(ROOT, 'src'))).filter((f) => !f.includes(`${path.sep}dev${path.sep}`) && !f.endsWith('main.tsx'))
const missing = new Map()
for (const file of files) {
  const text = await readFile(file, 'utf8')
  for (const [, spec] of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"./@][^'"]*|@(?!\/)[^'"]+)['"]/g)) {
    if (spec.endsWith('.css') || provided.has(spec)) continue
    if (!missing.has(spec)) missing.set(spec, new Set())
    missing.get(spec).add(path.relative(ROOT, file))
  }
}
if (!missing.size) {
  console.log(`✓ Every import is provided by ${from}: the Builder can edit this app.`)
} else {
  console.warn(`⚠ Not provided by the Builder of ${from}:`)
  for (const [spec, where] of missing) console.warn(`  - ${spec} (${[...where].join(', ')})`)
  console.warn('  Build and deploy from this repo; editing the app in the Builder would fail.')
  process.exitCode = 1
}
