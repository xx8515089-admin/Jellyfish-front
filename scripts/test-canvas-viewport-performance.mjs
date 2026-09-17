import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { getCanvasViewportBounds, filterVisibleCanvasNodes, createCanvasZoomScheduler } from '../src/pages/canvas/TapnowStudio/canvasViewport.js'
import { buildConnectedNodeIOEnvelopeCache } from '../src/pages/canvas/TapnowStudio/canvasNodeIOCache.js'
import { applyVideoMetadata, buildConnectedVideoInputCache } from '../src/pages/canvas/TapnowStudio/canvasVideoInput.js'
import { stableMediaNodes } from '../src/pages/canvas/TapnowStudio/canvasConnections.js'

function zoomHarness(initial = { x: 10, y: 20, zoom: 1 }) {
  const frames = new Map(), commits = [], viewRef = { current: initial }
  let sequence = 0
  const scheduler = createCanvasZoomScheduler({ viewRef, commit: value => commits.push(value), requestFrame: callback => { frames.set(++sequence, callback); return sequence }, cancelFrame: id => frames.delete(id) })
  return { scheduler, frames, commits, viewRef, tick() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()) } }
}

test('a burst of wheel events commits once per frame without dropping zoom deltas or pointer anchor', () => {
  const h = zoomHarness()
  const anchor = { x: (400 - 10), y: (300 - 20) }
  for (let index = 0; index < 8; index++) h.scheduler.zoomAt(400, 300, -1)
  assert.equal(h.frames.size, 1)
  assert.equal(h.commits.length, 0)
  h.tick()
  assert.equal(h.commits.length, 1)
  assert.ok(Math.abs(h.viewRef.current.zoom - 1.1 ** 8) < 1e-10)
  assert.ok(Math.abs((400 - h.viewRef.current.x) / h.viewRef.current.zoom - anchor.x) < 1e-10)
  assert.ok(Math.abs((300 - h.viewRef.current.y) / h.viewRef.current.zoom - anchor.y) < 1e-10)
})

test('zoom limits and zero deltas do not schedule work; unmount cancels pending updates', () => {
  const h = zoomHarness({ x: 0, y: 0, zoom: 3 })
  assert.equal(h.scheduler.zoomAt(1, 1, -1), false)
  assert.equal(h.scheduler.zoomAt(1, 1, 0), false)
  assert.equal(h.frames.size, 0)
  h.scheduler.zoomAt(1, 1, 1)
  h.scheduler.dispose()
  h.tick()
  assert.equal(h.commits.length, 0)
})

test('culling handles saved transforms, panel resize, missing sizes, and retains interaction nodes', () => {
  const nodes = [{ id: 'visible', x: 500, y: 0 }, { id: 'outside', x: 2000, y: 0 }, { id: 'dragging', x: -3000, y: -3000 }]
  const view = { x: -400, y: 0, zoom: 1 }
  const small = getCanvasViewportBounds(view, { width: 200, height: 200 }, 0)
  assert.deepEqual(filterVisibleCanvasNodes(nodes, small).map(node => node.id), ['visible'])
  const wide = getCanvasViewportBounds(view, { width: 2000, height: 200 }, 0)
  assert.deepEqual(filterVisibleCanvasNodes(nodes, wide).map(node => node.id), ['visible', 'outside'])
  assert.deepEqual(filterVisibleCanvasNodes(nodes, small, new Set(['dragging'])).map(node => node.id), ['visible', 'dragging'])
  assert.strictEqual(filterVisibleCanvasNodes(nodes, null), nodes)
  assert.equal(getCanvasViewportBounds(view, { width: 0, height: 10 }), null)
})

test('500 outgoing connections extract one source payload while retaining target and port metadata', () => {
  const source = { id: 'source', type: 'input-image', content: 'image.png' }
  const connections = Array.from({ length: 500 }, (_, index) => ({ from: source.id, to: 'target-' + index, inputType: index % 2 ? 'oref' : undefined }))
  let mediaReads = 0, textReads = 0
  const cache = buildConnectedNodeIOEnvelopeCache({ connections, nodesMap: new Map([[source.id, source]]), readMedia(node, options) { mediaReads++; assert.ok(options.mediaCache instanceof Map); return [{ url: node.content, type: 'image' }] }, readText() { textReads++; return ['prompt'] }, version: 1, isValid: () => true })
  assert.equal(mediaReads, 1)
  assert.equal(textReads, 1)
  assert.equal(cache.size, 500)
  assert.equal(cache.get('target-1').get('oref')[0].meta.targetNodeId, 'target-1')
  assert.equal(cache.get('target-2').get('default')[0].kind, 'mixed')
  assert.strictEqual(cache.get('target-1').get('oref')[0].media, cache.get('target-2').get('default')[0].media)
})

test('geometry-only edits retain the semantic graph; changing upstream content invalidates it', () => {
  const before = [{ id: 'a', type: 'input-image', x: 0, y: 0, content: 'a.png', settings: {} }]
  const moved = [{ ...before[0], x: 100, y: 200, width: 500 }]
  assert.strictEqual(stableMediaNodes(moved, before), before)
  const changed = [{ ...moved[0], content: 'b.png' }]
  assert.notStrictEqual(stableMediaNodes(changed, before), before)
})

test('node interaction cache skips pointer-only renders but accepts upstream changes and LOD transitions', () => {
  const source = fs.readFileSync(new URL('../src/pages/canvas/TapnowStudio/components/CanvasNodeRenderBoundary.jsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: () => ({ memo: (render, equal) => ({ render, equal }) }) })
  const equal = exports.default.equal
  const previous = { node: {}, renderState: {}, isInteracting: true, isLowDetail: false, renderNode: () => {} }
  assert.equal(equal(previous, { ...previous, renderNode: () => {} }), true)
  assert.equal(equal(previous, { ...previous, renderState: {} }), false)
  assert.equal(equal(previous, { ...previous, node: {} }), false)
  assert.equal(equal(previous, { ...previous, isLowDetail: true }), false)
  assert.equal(equal(previous, { ...previous, isInteracting: false }), false)
})


test('video duration and filename updates invalidate semantic inputs after metadata loads', () => {
  const before = [{ id: 'video', type: 'video-input', content: 'clip.mp4', videoFileName: 'before.mp4' }]
  const updated = applyVideoMetadata(before, 'video', 'clip.mp4', { duration: 12, width: 1920, height: 1080 })
  const semantic = stableMediaNodes(updated, before)
  assert.notStrictEqual(semantic, before)
  const cache = buildConnectedVideoInputCache(new Map(semantic.map(node => [node.id, node])), [{ from: 'video', to: 'analysis' }], mode => mode)
  assert.equal(cache.get('analysis').videoMeta.duration, 12)
  assert.notStrictEqual(stableMediaNodes([{ ...semantic[0], videoFileName: 'after.mp4' }], semantic), semantic)
})
