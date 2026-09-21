import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { createUiTextFixture } from './ui-text-fixture.mjs'
const ui = createUiTextFixture()
import ts from 'typescript'
import { insertPreviewMedia, previewLink, writeClipboardText } from '../src/pages/canvas/TapnowStudio/canvasPreviewActions.js'
const preview = (patch = {}) => ({ id: 'preview', type: 'preview', content: 'blob:video', previewType: 'video', x: 100, y: 50, width: 300, height: 260, ...patch })
const session = { document: { canvasId: 12 }, media: new Map([['blob:video', { assetId: 34 }]]) }

test('cloud copy produces a reopenable authenticated app link, never blob or auth tokens', () => {
  const link = previewLink(preview(), session, 'https://app.test/canvas/12?token=private#old')
  assert.equal(link.url, 'https://app.test/canvas/12?previewAsset=34&previewMedia=video')
  assert.equal(link.authenticated, true)
})
test('copy supports direct web images and gallery-only previews', () => {
  const node = preview({ content: '', previewType: 'image', previewMjImages: ['https://cdn.test/still.png'] })
  assert.deepEqual(previewLink(node, null, 'https://app.test'), { url: 'https://cdn.test/still.png', authenticated: false })
})
test('local-only and empty previews give actionable errors instead of copying unusable addresses', () => {
  assert.throws(() => previewLink(preview(), null, 'https://app.test'), /临时地址/)
  assert.throws(() => previewLink(preview({ content: 'data:image/png;base64,abc' }), null, 'https://app.test'), /临时地址/)
  assert.throws(() => previewLink(preview({ content: '' }), session, 'https://app.test'), /没有可用素材/)
})

test('modern clipboard copies the link without creating temporary DOM', async () => {
  let value
  await writeClipboardText('https://app.test/link', { clipboard: { writeText: async text => { value = text } } }, { createElement() { assert.fail('fallback unnecessary') } })
  assert.equal(value, 'https://app.test/link')
})
function clipboardDocument(succeeds = true) {
  const events = {}, state = { stopped: false, restored: false, removed: false }
  const input = { style: {}, addEventListener: (name, fn) => { events[name] = fn }, focus() {}, select() { state.selected = input.value }, remove() { state.removed = true } }
  const document = { activeElement: { focus() { state.restored = true } }, createElement: () => input, body: { appendChild() {} }, execCommand: command => { assert.equal(command, 'copy'); events.copy({ stopPropagation() { state.stopped = true } }); return succeeds } }
  return { document, state }
}
for (const denied of [false, true]) test(`clipboard fallback works on ${denied ? 'denied permissions' : 'HTTP without clipboard API'} and isolates canvas copy handlers`, async () => {
  const h = clipboardDocument()
  await writeClipboardText('link', denied ? { clipboard: { writeText: async () => { throw Error('denied') } } } : {}, h.document)
  assert.deepEqual(h.state, { selected: 'link', stopped: true, restored: true, removed: true })
})
test('failed fallback reports an error and still removes temporary elements/restores focus', async () => {
  const h = clipboardDocument(false)
  await assert.rejects(writeClipboardText('link', {}, h.document), /复制失败/)
  assert.equal(h.state.removed, true)
  assert.equal(h.state.restored, true)
})

for (const type of ['video', 'image']) test(`send ${type} inserts immediately, selects its own node and centers the viewport`, () => {
  const selected = [], views = []
  const node = preview(type === 'image' ? { content: '', previewType: 'image', previewMjImages: ['blob:still'] } : {})
  const created = insertPreviewMedia(node, {
    addNode: (kind, x, y, source, content) => {
      assert.equal(kind, type === 'video' ? 'video-input' : 'input-image')
      assert.equal(content, type === 'video' ? 'blob:video' : 'blob:still')
      const width = type === 'video' ? 580 : 320, height = type === 'video' ? 460 : 320
      return { id: 'new', x: x - width / 2, y: y - height / 2, width, height }
    }, setSelectedNodeId: id => selected.push(id), setSelectedNodeIds: ids => selected.push([...ids]), setView: view => views.push(view), viewport: { width: 900, height: 600 }, zoom: 2,
  })
  assert.equal(created.x, node.x + node.width + 100)
  assert.deepEqual(selected, ['new', ['new']])
  const view = views[0]
  assert.equal((created.x + created.width / 2) * view.zoom + view.x, 450)
  assert.equal((created.y + created.height / 2) * view.zoom + view.y, 300)
  assert.ok(created.height * view.zoom <= 520)
})
test('missing media does not insert/select a phantom node', () => {
  assert.throws(() => insertPreviewMedia(preview({ content: '' }), { addNode() { assert.fail('no media') } }), /没有可用素材/)
})

const renderer = ts.createSourceFile('renderer.jsx', readFileSync(new URL('../src/pages/canvas/TapnowStudio/views/renderCanvasNode.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
let copyHandler, sendHandler
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.text === 'onClick' && node.initializer?.expression) {
    const text = node.initializer.expression.getText(renderer)
    if (text.includes('canvasCloud.getPreviewLink(node)')) copyHandler = text
    if (text.includes('sendPreviewToCanvas(node)')) sendHandler = text
  }
  ts.forEachChild(node, visit)
}
visit(renderer)
test('actual copy button reports both success and failure and stops canvas clicks', async () => {
  for (const fail of [false, true]) {
    const toasts = [], copied = []
    let stopped = false
    const fn = vm.runInNewContext('(' + copyHandler + ')', {
      ...ui,
      node: preview(), canvasCloud: { getPreviewLink: node => previewLink(node, session, 'https://app.test') },
      writeClipboardText: async text => { if (fail) throw Error('clipboard denied'); copied.push(text) }, navigator: {}, document: {}, showToast: (...args) => toasts.push(args),
    })
    await fn({ stopPropagation() { stopped = true } })
    assert.equal(stopped, true)
    assert.equal(toasts[0][1], fail ? 'error' : 'success')
    if (!fail) assert.match(copied[0], /previewAsset=34/)
  }
})
test('actual send button reports failures rather than silently ignoring clicks', () => {
  const toasts = []
  const fn = vm.runInNewContext('(' + sendHandler + ')', { node: preview(), sendPreviewToCanvas() { throw Error('insert failed') }, showToast: (...args) => toasts.push(args) })
  fn({ stopPropagation() {} })
  assert.deepEqual(toasts[0], ['insert failed', 'error'])
})

const linkedCode = ts.transpileModule(readFileSync(new URL('../src/pages/canvas/TapnowStudio/CanvasLinkedAssetPreview.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
function linkedPreview(content) {
  const state = [], effects = [], revoked = [], requests = []
  let counter = 0, params = new URLSearchParams('previewAsset=34&previewMedia=video&keep=yes')
  const exports = {}
  vm.runInNewContext(linkedCode, { exports, React: { createElement: (type, props) => ({ type, props }) }, URLSearchParams, URL: { createObjectURL: () => 'blob:linked', revokeObjectURL: url => revoked.push(url) }, require: name => {
    if (name.endsWith('/uiText')) return ui
    if (name === 'react') return { useState: initial => { const index = counter++; state[index] = initial; return [initial, value => { state[index] = value }] }, useEffect: fn => effects.push(fn) }
    if (name === 'react-router-dom') return { useSearchParams: () => [params, fn => { params = fn(params) }] }
    if (name === 'antd') return { Modal: 'Modal', Alert: 'Alert', Spin: 'Spin' }
    if (name.endsWith('studioCanvases')) return { StudioCanvases: { content: (canvas, asset) => { requests.push([canvas, asset]); return content() } } }
    assert.fail(name)
  } })
  const modal = exports.default({ canvasId: '12' })
  const cleanup = effects[0]()
  return { state, requests, revoked, cleanup, modal, params: () => params }
}
const flush = () => new Promise(resolve => setImmediate(resolve))
test('copied link reads the requested asset through authenticated API and releases its URL on close', async () => {
  const h = linkedPreview(async () => ({ type: 'video/mp4' }))
  await flush()
  assert.deepEqual(h.requests, [['12', '34']])
  assert.equal(h.state[0].type, 'video')
  assert.equal(h.state[0].url, 'blob:linked')
  h.modal.props.onCancel()
  assert.equal(h.params().toString(), 'keep=yes')
  h.cleanup()
  assert.deepEqual(h.revoked, ['blob:linked'])
})
test('closing a copied link while fetching prevents stale media from appearing', async () => {
  let resolve
  const h = linkedPreview(() => new Promise(done => { resolve = done }))
  h.cleanup()
  resolve({ type: 'video/mp4' })
  await flush()
  assert.equal(h.state[0], null)
})
test('copied link reports API failures and never creates a broken player', async () => {
  const h = linkedPreview(async () => { throw Error('403') })
  await flush()
  assert.equal(h.state[0], null)
  assert.ok(h.state[1])
  assert.equal(h.state[2], false)
  h.cleanup()
})
