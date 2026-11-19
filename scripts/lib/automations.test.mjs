import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalJson, contentHash, planAutomations, callCounts } from './automations.mjs'

const locals = [
  { slug: 'a', hash: 'ha' },
  { slug: 'b', hash: 'hb' },
  { slug: 'new', hash: 'hn' },
]
const remote = { a: { checksum: 'ca' }, b: { checksum: 'cb' }, gone: { checksum: 'cg' } }
const manifest = { automations: { a: 'ca', b: 'cb', gone: 'cg' }, automationHashes: { a: 'ha', b: 'old' } }

test('canonical JSON sorts keys at every depth (nested keys are kept)', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}')
  assert.equal(contentHash({ x: { b: 1, a: 2 } }), contentHash({ x: { a: 2, b: 1 } }))
  assert.notEqual(contentHash({ x: { a: 1 } }), contentHash({ x: { a: 2 } }))
})

test('DSUL import on: no POST nor PATCH, only the removed automations are deleted', () => {
  const plan = planAutomations({ locals, remote, manifest, dsulImport: true })
  assert.deepEqual(plan, { create: [], update: [], remove: ['gone'], unchanged: [] })
  assert.deepEqual(callCounts({ locals, plan }), { before: 4, after: 1 })
})

test('DSUL import off: POST the new, PATCH only what changed here or there', () => {
  const plan = planAutomations({ locals, remote, manifest, dsulImport: false })
  assert.deepEqual(plan.create, ['new'])
  assert.deepEqual(plan.update, ['b']) // local content changed since the last deploy
  assert.deepEqual(plan.unchanged, ['a'])
  assert.deepEqual(plan.remove, ['gone'])
})

test('DSUL import off: a remote edit (checksum moved) is overwritten by a PATCH', () => {
  const plan = planAutomations({ locals, remote: { ...remote, a: { checksum: 'other' } }, manifest, dsulImport: false })
  assert.ok(plan.update.includes('a'))
})

test('DSUL import off: without a manifest every existing automation is PATCHed once', () => {
  const plan = planAutomations({ locals, remote, dsulImport: false })
  assert.deepEqual(plan.update, ['a', 'b'])
})
