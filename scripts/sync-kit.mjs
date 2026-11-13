#!/usr/bin/env node
/**
 * Takes the app kit (@prisme.ai/mcp-apps) of YOUR platform into vendor/, with
 * its types: `npm run sync-kit` (reads PRISMEAI_PLATFORM_URL from .env) or
 * `npm run sync-kit -- --from=https://app.acme.example.com`.
 *
 * Optional: the starter ships with a copy of the kit. Run it to build with
 * exactly the kit of the platform you deploy to, then commit vendor/.
 * Every platform serves its kit under /vendor/, the same files its Builder
 * copies into the apps it deploys.
 */
import dotenv from 'dotenv'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env') })
const KIT = '@prisme.ai/mcp-apps'
const OUT = path.join(ROOT, 'vendor', KIT)

const from = process.argv.find((a) => a.startsWith('--from='))?.slice(7) || process.env.PRISMEAI_PLATFORM_URL
if (!from) {
  console.error('✗ Give the platform URL: PRISMEAI_PLATFORM_URL in .env, or --from=https://<your platform>')
  process.exit(1)
}
const base = from.replace(/\/$/, '') + '/vendor/'

async function get(file) {
  const res = await fetch(base + file)
  // A platform without the file may answer its app page (HTML).
  if (!res.ok || /html/i.test(res.headers.get('content-type') ?? '')) throw new Error(`${base}${file}: ${res.ok ? 'not found' : res.status}`)
  return res.text()
}

const index = JSON.parse(await get('index.json'))
const entries = Object.entries(index.modules ?? {}).filter(([specifier]) => specifier === KIT || specifier.startsWith(`${KIT}/`))
const main = index.modules?.[KIT]
if (!main) {
  console.error(`✗ ${from} serves no ${KIT}: it cannot run isolated apps.`)
  process.exit(1)
}
if (!entries.every(([, m]) => m.types)) {
  console.error(`✗ ${from} serves ${KIT} ${main.version} without its types: upgrade the platform, or keep the kit of this repo.`)
  process.exit(1)
}

const files = new Map()
const kitPrefix = `${KIT}@${main.version}/`
const queue = []
for (const [, mod] of entries) queue.push(mod.file, mod.types)
// Types import each other by relative path: follow them.
while (queue.length) {
  const file = queue.shift()
  if (files.has(file)) continue
  const text = await get(file)
  files.set(file, text)
  if (file.endsWith('.d.ts')) {
    for (const [, spec] of text.matchAll(/from ['"](\.{1,2}\/[^'"]+)['"]/g)) {
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) + '.d.ts')
    }
  }
}

await rm(OUT, { recursive: true, force: true })
for (const [file, text] of files) {
  const target = path.join(OUT, file.slice(kitPrefix.length))
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, text)
}
await writeFile(
  path.join(OUT, 'kit.json'),
  JSON.stringify({ package: KIT, version: main.version, source: `${base}${kitPrefix}` }, null, 2) + '\n'
)
console.log(`✓ vendor/${KIT}: ${main.version} from ${from} (${files.size} files). Commit vendor/ to keep it.`)
