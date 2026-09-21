import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { createUiTextFixture } from './ui-text-fixture.mjs'
const ui = createUiTextFixture()
import ts from 'typescript'

/** Exercise authenticated attachment reads and object-URL ownership without a server. */
function harness(api = {}) {
  const created = [], revoked = [], effects = []
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: value => [value, () => {}], useRef: value => ({ current: value }),
    useEffect: effect => effects.push(effect),
  }
  const exports = {}
  const source = readFileSync(new URL('../src/pages/canvas/TapnowStudio/components/CanvasChatAttachment.jsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { fileName: 'CanvasChatAttachment.jsx', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText
  vm.runInNewContext(code, { exports, URL: { createObjectURL: blob => { created.push(blob); return `blob:preview-${created.length}` }, revokeObjectURL: url => revoked.push(url) }, require: name => {
    if (name.endsWith('/uiText')) return ui
    if (name === 'react') return { ...React, default: React }
    if (name.endsWith('studioCanvases')) return { StudioCanvases: api }
    return {}
  } })
  return { ...exports, created, revoked, effects }
}
const session = { document: { canvasId: 12 }, resolveMedia: async source => source }
test('persisted attachments use the authenticated canvas content endpoint, not arbitrary asset URLs', async () => {
  const calls = [], h = harness({ content: async (...args) => { calls.push(args); return { type: 'image/png' } } })
  const result = await h.readChatAttachment(session, { assetId: 71, canvasId: 12, url: 'https://untrusted.test' })
  assert.deepEqual(calls, [[12, 71]])
  assert.equal(result.mimeType, 'image/png'); assert.equal(result.url, 'blob:preview-1'); assert.equal(result.owned, true)
  await assert.rejects(h.readChatAttachment(session, { assetId: 71, canvasId: 13 }), /当前画布/)
  assert.equal(calls.length, 1)
})
test('newly uploaded media previews its original bytes without another download', async () => {
  const h = harness({ content: () => { throw new Error('must not download') } })
  const file = { type: 'video/mp4' }
  const result = await h.readChatAttachment(session, { assetId: 71, canvasId: 12, previewFile: file })
  assert.equal(result.mimeType, 'video/mp4'); assert.equal(h.created[0], file)
})
test('queued canvas media resolves existing URLs without taking ownership', async () => {
  const h = harness()
  const result = await h.readChatAttachment({ ...session, resolveMedia: async value => { assert.equal(value, 'img_cached'); return 'blob:canvas-owned' } }, null, { content: 'img_cached', isVideo: true })
  assert.equal(result.url, 'blob:canvas-owned'); assert.equal(result.owned, false); assert.equal(result.mimeType, 'video/mp4')
  assert.equal(h.created.length, 0)
  await assert.rejects(h.readChatAttachment(session, null, { content: 'javascript:alert(1)' }), /无法预览/)
})
test('failed authenticated reads do not create a broken object URL', async () => {
  const h = harness({ content: async () => { throw new Error('forbidden') } })
  await assert.rejects(h.readChatAttachment(session, { assetId: 71 }), /forbidden/)
  assert.equal(h.created.length, 0)
})
test('a download finishing after attachment removal immediately releases its object URL', async () => {
  let resolve
  const h = harness({ content: () => new Promise(done => { resolve = done }) })
  h.default({ session, asset: { assetId: 71, mimeType: 'image/png' } })
  const cleanup = h.effects[0]()
  cleanup()
  resolve({ type: 'image/png' })
  await new Promise(done => setImmediate(done))
  assert.deepEqual(h.revoked, ['blob:preview-1'])
})
test('unmount releases preview URLs but preserves queued canvas URLs', async () => {
  const h = harness({ content: async () => ({ type: 'image/png' }) })
  h.default({ session, asset: { assetId: 71, mimeType: 'image/png' } })
  const cleanup = h.effects[0]()
  await new Promise(done => setImmediate(done))
  cleanup()
  assert.deepEqual(h.revoked, ['blob:preview-1'])
  const queued = harness()
  queued.default({ session, file: { content: 'blob:canvas-owned', type: 'image/png' } })
  const stop = queued.effects[0]()
  await new Promise(done => setImmediate(done))
  stop()
  assert.deepEqual(queued.revoked, [])
})
