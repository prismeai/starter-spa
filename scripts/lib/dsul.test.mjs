import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeIndex, parsePreserve, isDsulFile, DEFAULT_PRESERVE } from './dsul.mjs'

test('mergeIndex: the live app pointer and agent id survive the import of index.yml', () => {
  const local = { slug: 'w', config: { value: { agent: { name: 'A', instructions: 'new' }, bundles: { w: { stale: true } } } } }
  const live = { config: { value: { agent: { id: 'agent_1', name: 'old' }, bundles: { w: { format: 'isolated', agent: 'agent_1' } } } } }
  const { index, kept } = mergeIndex(local, live, DEFAULT_PRESERVE, 'WS1')
  assert.equal(index.id, 'WS1')
  assert.deepEqual(index.config.value.bundles, { w: { format: 'isolated', agent: 'agent_1' } })
  assert.equal(index.config.value.agent.id, 'agent_1')
  assert.equal(index.config.value.agent.instructions, 'new', 'local values win for keys not preserved')
  assert.equal(index.config.value.agent.name, 'A')
  assert.deepEqual(kept, ['bundles', 'agent.id'])
  assert.equal(local.config.value.agent.id, undefined, 'input not mutated')
})

test('mergeIndex: first deploy (nothing live) keeps the local index as is', () => {
  const { index, kept } = mergeIndex({ slug: 'w' }, {}, DEFAULT_PRESERVE)
  assert.deepEqual(index.config.value, {})
  assert.deepEqual(kept, [])
})

test('parsePreserve: default, custom list, an empty value keeps the default', () => {
  assert.deepEqual(parsePreserve(undefined), ['bundles', 'agent.id'])
  assert.deepEqual(parsePreserve('bundles, x.y'), ['bundles', 'x.y'])
  assert.deepEqual(parsePreserve(''), ['bundles', 'agent.id'])
  assert.deepEqual(parsePreserve('  '), ['bundles', 'agent.id'])
})

test('isDsulFile: index, security, automations, imports and pages only', () => {
  for (const f of ['index.yml', 'security.yml', 'automations/v1/x.yml', 'imports/Custom Code.yml', 'pages/home.yml']) assert.equal(isDsulFile(f), true, f)
  for (const f of ['src/App.tsx', 'automations/readme.md', 'docs/x.yml', '.env', 'scripts/a.yml']) assert.equal(isDsulFile(f), false, f)
})
