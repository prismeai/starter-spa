import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VIEW_FILE, appSharing, bootEntrySource, cssModule, findEntries, isolatedEntry, referencedFiles, shadowCompatibleCss, toViewName } from './isolated.mjs'

test('views: the full app first, then src/views in file order, by kebab-case name', () => {
  const entries = findEntries(['src/views/TicketCard.tsx', 'src/App.tsx', 'src/pages/Home.tsx', 'src/views/sales_chart.ts'])
  assert.deepEqual(entries, [
    { name: 'app', file: 'src/App.tsx' },
    { name: 'ticket-card', file: 'src/views/TicketCard.tsx' },
    { name: 'sales-chart', file: 'src/views/sales_chart.ts' },
  ])
  assert.equal(toViewName('MyView'), 'my-view')
  assert.throws(() => findEntries(['src/views/A_b.tsx', 'src/views/a-b.tsx']), /Two views are named "a-b"/)
})

test('entry: the component, started by the kit', () => {
  assert.equal(
    bootEntrySource({ name: 'ticket-card', file: 'src/views/TicketCard.tsx' }),
    `import View from "@/views/TicketCard"\nimport { mountView } from "@prisme.ai/mcp-apps/boot"\nmountView(View, { appName: "ticket-card" })`
  )
})

test('css: :root rules get a :host twin, :root.dark targets the theme element', () => {
  assert.equal(shadowCompatibleCss('.a { color: red; }'), '.a { color: red; }')
  assert.equal(shadowCompatibleCss(':root { --x: 1; }'), ':root, :host { --x: 1; }')
  assert.equal(shadowCompatibleCss(':root.dark .card { --x: 2; }'), ':root.dark .card, .prisme-app-theme.dark .card { --x: 2; }')
  assert.equal(shadowCompatibleCss('/* :root { } */ .a {}'), '/* :root { } */ .a {}')
  assert.equal(shadowCompatibleCss('h1, :is(:root, .x) p { a: b }'), 'h1, :is(:root, .x) p, :is(:host, .x) p { a: b }')
  assert.match(cssModule(':root { --x: 1 }'), /addStyle\(":root, :host \{ --x: 1 \}"\)/)
})

test('deployed entry: isolated, merged, without embed or the legacy public flag; agent kept unless given', () => {
  const previous = { bundle: 'old', embed: 'e', public: true, metadata: { title: 'T' }, agent: 'a1' }
  const manifest = { v: 1, vendor: { react: '18.3.1' }, builtAt: '2026-11-13T00:00:00.000Z' }
  const entry = isolatedEntry(previous, { views: { app: 'u-app', card: 'u-card' }, manifest, version: '1.0.0', name: 'N', sharing: 'private' })
  assert.deepEqual(entry, {
    bundle: 'u-app',
    metadata: { title: 'T' },
    agent: 'a1',
    format: 'isolated',
    views: { app: 'u-app', card: 'u-card' },
    manifest,
    version: '1.0.0',
    name: 'N',
    builtAt: manifest.builtAt,
    sharing: 'private',
    displayMode: 'platform',
  })
  assert.equal(isolatedEntry(undefined, { views: { app: 'u' }, manifest, sharing: 'public' }).displayMode, 'standalone')
  assert.equal(isolatedEntry(previous, { views: { app: 'u' }, manifest, agent: 'a2' }).agent, 'a2')
  assert.equal(JSON.parse(JSON.stringify(isolatedEntry(previous, { views: { app: 'u' }, manifest, agent: '' }))).agent, undefined)
  assert.equal(isolatedEntry(undefined, { views: { card: 'u-card' }, manifest, mcp: 'tools' }).bundle, 'u-card')
  assert.equal(isolatedEntry(undefined, { views: { app: 'u' }, manifest, mcp: 'tools' }).mcp, 'tools')
})

test('cleanup: every URL an app still points at, and only view files are candidates', () => {
  const urls = referencedFiles({ a: { bundle: 'b1', embed: 'e1' }, b: { bundle: 'v1', views: { app: 'v1', card: 'v2' } }, c: null })
  assert.deepEqual([...urls].sort(), ['b1', 'e1', 'v1', 'v2'])
  assert.ok(VIEW_FILE.test('app.0123456789abcdef.js'))
  assert.ok(VIEW_FILE.test('ticket-card.0123456789abcdef.js'))
  assert.ok(!VIEW_FILE.test('report.js'))
  assert.ok(!VIEW_FILE.test('app.0123.js'))
})

test('sharing: the variable, else the legacy public flag, else what is deployed, else private', () => {
  assert.equal(appSharing(undefined, {}), 'private')
  assert.equal(appSharing({ sharing: 'authenticated' }, {}), 'authenticated')
  assert.equal(appSharing({ public: true }, {}), 'public')
  assert.equal(appSharing({ sharing: 'public' }, { PRISMEAI_SHARING: 'private' }), 'private')
  assert.equal(appSharing({ sharing: 'private' }, { PRISMEAI_PUBLIC: 'true' }), 'public')
  assert.throws(() => appSharing(undefined, { PRISMEAI_SHARING: 'everyone' }), /must be one of/)
})

test('cleanup: assets paths count as referenced', () => {
  const urls = referencedFiles({ a: { bundle: 'assets/dist/app/isolated/app.0123456789abcdef.js', views: { 'hello-card': 'assets/dist/app/isolated/hello-card.0123456789abcdef.js' } } })
  assert.ok(urls.has('assets/dist/app/isolated/hello-card.0123456789abcdef.js'))
})
