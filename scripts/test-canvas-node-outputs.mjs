import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { insertPreviewMedia } from '../src/pages/canvas/TapnowStudio/canvasPreviewActions.js'
import * as outputs from '../src/pages/canvas/TapnowStudio/canvasNodeOutputs.js'
import { connectedPreviewLinks, loadPreviewMedia } from '../src/pages/canvas/TapnowStudio/canvasMediaPreview.js'
import { asVideoAnalysisInput, applyVideoMetadata } from '../src/pages/canvas/TapnowStudio/canvasVideoInput.js'
import { textInputFingerprint, prepareTextSnapshot } from '../src/pages/canvas/TapnowStudio/canvasTextTasks.js'
import { isCanvasInteractiveTarget } from '../src/pages/canvas/TapnowStudio/canvasInteractions.js'
const { readNodeMedia, readShotMedia, applyNodeMediaResult } = outputs
const base = '../src/pages/canvas/TapnowStudio/'
const parse = path => ts.createSourceFile(path, readFileSync(new URL(base + path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
const actions = parse('actions/nodesActions.jsx')
const globals = { ...outputs, normalizeStoryboardMode: value => value === 'video' ? 'video' : 'image', normalizeNodeIOMediaType: type => type }
const action = name => vm.runInNewContext('(' + actions.statements.find(s => ts.isFunctionDeclaration(s) && s.name.text === name).getText(actions).replace('export ', '') + ')', globals)
const extract = action('extractNodeIOMediaPayload')
const save = action('getLocalSaveMediaItems')
const plain = value => JSON.parse(JSON.stringify(value))
const board = shots => ({ id: 'board', type: 'storyboard-node', settings: { mode: 'image', shots } })
const mode = value => value === 'video' ? 'video' : 'image'

for (const type of [...outputs.imageGeneratorTypes, ...outputs.videoGeneratorTypes]) test(`${type} applied output reaches downstream and local save without legacy history`, () => {
  const node = { id: 'source', type, content: 'blob:applied', settings: {} }
  const nodesMap = new Map([[node.id, node]])
  const connectionsByNode = { to: new Map([['save', [{ from: node.id, to: 'save' }]]]) }
  const media = extract({ nodesMap, connectionsByNode, resolveAssetChannelUrl: x => x }, node)
  const files = save({ nodesMap, connectionsByNode, history: [], getApiConfigByKey: () => null, getItemProxyPreference: () => false }, 'save')
  assert.deepEqual(plain(media), [{ url: node.content, type: type.endsWith('video') ? 'video' : 'image' }])
  assert.equal(files[0].url, media[0].url)
  assert.equal(files[0].type, media[0].type)
})

test('selected cloud image reaches downstream while local save keeps all applied outputs', () => {
  const node = { id: 'source', type: 'gen-image', content: 'first', settings: { imageUrls: ['first', 'second'], selectedImageIndex: 1 } }
  assert.deepEqual(readNodeMedia(node), [{ url: 'second', type: 'image' }])
  assert.deepEqual(readNodeMedia(node, { allImages: true }).map(x => x.url), ['first', 'second'])
})

test('applying a storyboard image populates downstream fields and preserves output choice, IDs and unrelated shots', () => {
  const original = board([{ id: 7, outputEnabled: true, prompt: 'keep' }, { id: 8, outputEnabled: false }])
  const node = applyNodeMediaResult(original, { shotId: '7', operation: 'imageGenerate' }, 'second', ['first', 'second'], 1)
  assert.deepEqual(readNodeMedia(node), [{ url: 'second', type: 'image' }])
  assert.equal(node.settings.shots[0].prompt, 'keep')
  assert.equal(node.settings.shots[0].id, 7)
  assert.strictEqual(node.settings.shots[1], original.settings.shots[1])
  assert.equal(original.settings.shots[0].output_images, undefined)
  assert.deepEqual(readShotMedia({ ...node.settings.shots[0], outputEnabled: false }, 'image'), [])
  assert.deepEqual(readShotMedia({ ...node.settings.shots[0], selectedImageIndex: -1 }, 'image'), [])
})

test('storyboard opaque video beats old still output, and is never used as an image frame', () => {
  let node = board([{ id: 1, outputEnabled: true, output_url: 'blob:still', output_images: ['blob:still'], selectedImageIndex: 0 }])
  node.settings.mode = 'video'
  node = applyNodeMediaResult(node, { shotId: 1, operation: 'videoGenerate' }, 'blob:video', null, 0)
  assert.deepEqual(readNodeMedia(node), [{ url: 'blob:video', type: 'video' }])
  const input = asVideoAnalysisInput(node, mode)
  assert.equal(input.content, 'blob:video')
  assert.deepEqual(input.frames, [])
  assert.equal(input.isImageInput, false)
  const updated = applyVideoMetadata([node], node.id, 'blob:video', { duration: 5 })
  assert.equal(asVideoAnalysisInput(updated[0], mode).videoMeta.duration, 5)
  assert.strictEqual(applyVideoMetadata(updated, node.id, 'blob:old', { duration: 100 }), updated)
})

test('legacy storyboard image/video outputs remain readable without confusing known stills for videos', () => {
  assert.equal(readShotMedia({ outputEnabled: true, output_url: 'old.png' }, 'image')[0].url, 'old.png')
  assert.equal(readShotMedia({ outputEnabled: true, output_url: 'old.mp4' }, 'video')[0].type, 'video')
  assert.deepEqual(readShotMedia({ outputEnabled: true, output_url: 'blob:still', output_images: ['blob:still'] }, 'video'), [])
})

test('linked image inputs pass the displayed selected image onward and tolerate cycles', () => {
  const source = { id: 'source', type: 'gen-image', content: 'first', settings: { imageUrls: ['first', 'chosen'], selectedImageIndex: 1 } }
  const input = { id: 'input', type: 'input-image' }
  const other = { id: 'other', type: 'input-image' }
  const nodesMap = new Map([source, input, other].map(node => [node.id, node]))
  const edges = [{ from: 'other', to: 'input' }, { from: 'input', to: 'other' }, { from: 'source', to: 'input' }]
  const options = { nodesMap, incoming: id => edges.filter(edge => edge.to === id) }
  assert.deepEqual(readNodeMedia(input, options), [{ url: 'chosen', type: 'image' }])
  assert.deepEqual(readNodeMedia(input, { ...options, allImages: true }), [{ url: 'chosen', type: 'image' }])
  assert.equal(asVideoAnalysisInput(input, mode, options).frames[0].url, 'chosen')
  edges.pop()
  assert.deepEqual(readNodeMedia(input, options), [])
})

test('preview videos and uploads retain their type; keyframes are separate image outputs', () => {
  assert.deepEqual(readNodeMedia({ id: 'p', type: 'preview', content: 'blob:v', previewType: 'video', previewMjImages: ['stale'] }), [{ url: 'blob:v', type: 'video' }])
  const video = { id: 'v', type: 'video-input', content: 'blob:upload', selectedKeyframes: [{ url: 'frame' }] }
  assert.equal(readNodeMedia(video)[0].type, 'image')
  assert.deepEqual(readNodeMedia(video, { rawVideo: true }), [{ url: 'blob:upload', type: 'video' }])
})

test('uploaded and storyboard previews read applied media without querying generation history', async () => {
  const samples = [
    { id: 'source', type: 'input-image', content: 'blob:still' },
    { id: 'source', type: 'video-input', content: 'blob:video', frames: [{ url: 'frame' }] },
    { ...board([{ id: 1, outputEnabled: true, output_url: 'shot.png' }]), id: 'source' },
    { id: 'source', type: 'input-image' },
  ]
  for (const source of samples) {
    const links = connectedPreviewLinks([source, { id: 'preview', type: 'preview' }], [{ from: 'source', to: 'preview' }])
    const result = await loadPreviewMedia(links[0], { listGenerations: () => assert.fail('uploads must not query task history') })
    assert.equal(result?.content || null, source.type === 'storyboard-node' ? 'shot.png' : source.content || null)
  }
})

test('text extraction uses settings.text and detects edits and explicit clearing', () => {
  const project = { nodes: [{ id: 'text', type: 'text-node', content: 'stale', settings: { text: 'input text' } }, { id: 'extract', type: 'extract-characters-scenes', settings: { textModelId: 1 } }], connections: [{ from: 'text', to: 'extract' }] }
  const operation = 'extractCharactersScenes'
  const before = textInputFingerprint(project, 'extract', operation)
  assert.doesNotThrow(() => prepareTextSnapshot(project, 'extract', operation, [{ modelId: 1 }]))
  project.nodes[0].settings.text = ''
  assert.notEqual(textInputFingerprint(project, 'extract', operation), before)
  assert.throws(() => prepareTextSnapshot(project, 'extract', operation, [{ modelId: 1 }]), /请先填写文本/)
})

test('form controls, media, custom widgets and editable descendants own their keyboard/pointer interaction', () => {
  for (const selector of ['select', 'button', 'label', 'summary', 'video[controls]', '[role="combobox"]', '[role="slider"]', '[data-canvas-interactive]']) {
    assert.equal(isCanvasInteractiveTarget({ closest: query => query.split(', ').includes(selector) ? {} : null }), true, selector)
  }
  assert.equal(isCanvasInteractiveTarget({ isContentEditable: true }), true)
  assert.equal(isCanvasInteractiveTarget({ closest: () => null }), false)
  assert.equal(isCanvasInteractiveTarget(null), false)
})

const renderer = parse('views/renderCanvasNode.jsx')
const handlers = []
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.text === 'onClick' && node.initializer?.expression?.getText(renderer).includes("sendPreviewToCanvas(node)")) handlers.push(node.initializer.expression.getText(renderer))
  ts.forEachChild(node, visit)
}
visit(renderer)
test('preview send-to-canvas uses video-input for opaque videos and places it next to the source in canvas coordinates', async () => {
  assert.equal(handlers.length, 1)
  for (const previewType of ['video', 'image']) {
    const calls = []
    const fn = vm.runInNewContext('(' + handlers[0] + ')', {
      node: { id: 'preview', type: 'preview', content: 'blob:opaque', previewType, x: 100, y: 50, width: 300, height: 260 },
      showToast() {}, sendPreviewToCanvas: node => insertPreviewMedia(node, {
        addNode: (...args) => { calls.push(args); return { id: 'new' } }, setSelectedNodeId() {}, setSelectedNodeIds() {}, setView() {},
      }),
    })
    await fn({ stopPropagation() {} })
    assert.equal(calls[0][0], previewType === 'video' ? 'video-input' : 'input-image')
    assert.deepEqual(calls[0].slice(1, 3), [previewType === 'video' ? 790 : 660, 180])
  }
})

test('image comparison pointer gestures do not initiate node dragging or cancel native input', () => {
  const ast = parse('freeCanvasShared.jsx')
  let component
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'ImageCompareView') component = node.initializer.getText(ast)
    ts.forEachChild(node, find)
  }
  find(ast)
  const context = vm.createContext({
    React: { memo: fn => fn, createElement: (type, props, ...children) => ({ type, props, children }) },
    useState: initial => [initial, () => {}], useRef: () => ({ current: null }), useCallback: fn => fn, useEffect() {},
    LazyBase64Image: 'image', Split: 'split', t: value => value,
  })
  vm.runInContext(ts.transpileModule(`var Compare = ${component}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context)
  const rendered = context.Compare({ img1: 'a.png', img2: 'b.png' })
  for (const key of ['onPointerDown', 'onMouseDown', 'onTouchStart']) {
    let stopped = false
    rendered.props[key]({ stopPropagation() { stopped = true }, preventDefault() { assert.fail('native interaction cancelled') } })
    assert.equal(stopped, true)
  }
})

test('node interaction bubbles stop after capture handled a nested control', () => {
  const callbacks = []
  function find(node) {
    if (ts.isJsxAttribute(node) && node.name.text === 'onMouseDown' && node.initializer?.expression?.getText(renderer).includes('__tapnowSelectionHandled')) callbacks.push(node.initializer.expression.getText(renderer))
    ts.forEachChild(node, find)
  }
  find(renderer)
  assert.equal(callbacks.length, 2)
  for (const source of callbacks) {
    let stopped = false
    vm.runInNewContext('(' + source + ')')({ nativeEvent: { __tapnowSelectionHandled: true }, stopPropagation() { stopped = true } })
    assert.equal(stopped, true)
  }
})
