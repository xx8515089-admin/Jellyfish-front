import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { applyVideoMetadata, asVideoAnalysisInput, buildConnectedVideoInputCache } from '../src/pages/canvas/TapnowStudio/canvasVideoInput.js'

const mode = value => value === 'video' ? 'video' : 'image'
const input = (node) => asVideoAnalysisInput(node, mode)

test('applied AI video and character/scene videos are usable analysis inputs', () => {
  for (const type of ['gen-video', 'generate-character-video', 'generate-scene-video']) {
    const node = { id: type, type, content: 'blob:applied-video', title: '雨夜归途', videoMeta: { duration: 5 } }
    const adapted = input(node)
    assert.equal(adapted.id, node.id)
    assert.equal(adapted.content, 'blob:applied-video')
    assert.equal(adapted.videoFileName, '雨夜归途')
    assert.equal(adapted.videoMeta.duration, 5)
    assert.equal(adapted.isImageInput, false)
  }
})

test('blob-backed video previews are recognized by their declared media type', () => {
  const adapted = input({ id: 'preview', type: 'preview', content: 'blob:opaque-id', previewType: 'video' })
  assert.equal(adapted.content, 'blob:opaque-id')
  assert.equal(adapted.isImageInput, false)
})

test('legacy preview URLs can identify video when no explicit type was saved', () => {
  assert.equal(input({ id: 'preview', type: 'preview', content: 'https://example.test/result.mp4?sig=demo' }).isImageInput, false)
})

test('uploaded video inputs keep their selected keyframes and metadata intact', () => {
  const original = { id: 'upload', type: 'video-input', content: 'blob:upload', selectedKeyframes: [{ time: 1, url: 'frame.png' }], videoMeta: { duration: 12 } }
  assert.strictEqual(input(original), original)
})

test('a connected AI video without an applied result remains identifiable without inventing content', () => {
  const adapted = input({ id: 'ai-video', type: 'gen-video', settings: { duration: '5s' } })
  assert.equal(adapted.id, 'ai-video')
  assert.equal(adapted.content, undefined)
  assert.equal(adapted.videoMeta.duration, 0)
})

test('selected generated images and preview images retain single-frame analysis behavior', () => {
  for (const type of ['input-image', 'gen-image', 'generate-character-image', 'generate-scene-image']) {
    const adapted = input({ id: type, type, content: 'first.png', settings: { imageUrls: ['first.png', 'second.png'], selectedImageIndex: 1 } })
    assert.equal(adapted.isImageInput, true)
    assert.deepEqual(adapted.selectedKeyframes, [{ time: 0, url: 'second.png' }])
  }
  assert.equal(input({ id: 'preview', type: 'preview', previewType: 'image', content: 'still.png' }).selectedKeyframes[0].url, 'still.png')
})

test('storyboard analysis still uses enabled shots and selected images only', () => {
  const adapted = input({ id: 'board', type: 'storyboard-node', settings: { mode: 'image', shots: [
    { id: 1, outputEnabled: true, selectedImageIndex: 1, output_images: ['a.png', 'b.png'] },
    { id: 2, outputEnabled: false, selectedImageIndex: 0, output_images: ['hidden.png'] },
    { id: 3, outputEnabled: true, selectedImageIndex: -1, output_images: ['unselected.png'] },
  ] } })
  assert.equal(adapted.isStoryboardInput, true)
  assert.deepEqual(adapted.selectedKeyframes.map(frame => frame.url), ['b.png'])
})

test('reconnecting analysis picks up the newly applied source and ignores unrelated text nodes', () => {
  const text = { id: 'text', type: 'text-node', content: 'Not a video' }
  const video = { id: 'video', type: 'gen-video', content: 'blob:first' }
  const links = [{ from: 'text', to: 'analysis' }, { from: 'video', to: 'analysis' }]
  const nodes = new Map([[text.id, text], [video.id, video]])
  assert.equal(buildConnectedVideoInputCache(nodes, links, mode).get('analysis').content, 'blob:first')
  nodes.set('video', { ...video, content: 'blob:second' })
  assert.equal(buildConnectedVideoInputCache(nodes, links, mode).get('analysis').content, 'blob:second')
  assert.equal(buildConnectedVideoInputCache(nodes, [], mode).size, 0)
})

test('real media duration and dimensions are stored once without touching unrelated nodes', () => {
  const nodes = [{ id: 'video', type: 'gen-video', content: 'blob:video' }, { id: 'other' }]
  const metadata = { duration: 5.04, width: 1280, height: 720 }
  const result = applyVideoMetadata(nodes, 'video', 'blob:video', metadata)
  assert.deepEqual(result[0].videoMeta, metadata)
  assert.strictEqual(result[1], nodes[1])
  assert.strictEqual(applyVideoMetadata(result, 'video', 'blob:video', metadata), result)
})

test('stale metadata and invalid dimensions cannot overwrite a changed source', () => {
  const nodes = [{ id: 'video', content: 'blob:new', videoMeta: { duration: 8 } }]
  assert.strictEqual(applyVideoMetadata(nodes, 'video', 'blob:old', { duration: 5 }), nodes)
  assert.strictEqual(applyVideoMetadata(nodes, 'video', 'blob:new', { duration: Infinity, width: 0, height: NaN }), nodes)
})

const path = new URL('../src/pages/canvas/TapnowStudio/freeCanvasShared.jsx', import.meta.url)
const ast = ts.createSourceFile('shared.jsx', readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
let component
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'ResolvedVideo') component = node.initializer.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
const code = ts.transpileModule(`var RenderVideo = ${component}`, { compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText
const context = vm.createContext({
  React: { createElement: (type, props) => ({ type, props }) },
  useState: () => ['blob:video', () => {}], useEffect() {},
})
vm.runInContext(code, context)

for (const name of ['onPointerDown', 'onMouseDown', 'onMouseUp', 'onTouchStart', 'onClick', 'onDoubleClick', 'onKeyDown']) {
  test(`native controls isolate ${name} without cancelling playback or losing caller callbacks`, () => {
    let stopped = 0, prevented = 0, called = 0
    const rendered = context.RenderVideo({ src: 'blob:video', controls: true, [name]: () => called++ })
    rendered.props[name]({ stopPropagation() { stopped++ }, preventDefault() { prevented++ } })
    assert.equal(rendered.type, 'video')
    assert.equal(rendered.props.controls, true)
    assert.equal(stopped, 1)
    assert.equal(prevented, 0)
    assert.equal(called, 1)
  })
}

test('noninteractive video thumbnails keep their existing click behavior', () => {
  let stopped = false, clicked = false
  const rendered = context.RenderVideo({ src: 'blob:video', controls: false, onClick: () => { clicked = true } })
  rendered.props.onClick({ stopPropagation() { stopped = true } })
  assert.equal(stopped, false)
  assert.equal(clicked, true)
})
