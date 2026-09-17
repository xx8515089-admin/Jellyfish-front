import assert from 'node:assert/strict'
import test from 'node:test'
import { performance } from 'node:perf_hooks'
import { connectCanvasNodes, stableMediaNodes } from '../src/pages/canvas/TapnowStudio/canvasConnections.js'
import { applyPreviewUpdates, clearDisconnectedPreviewMedia, connectedPreviewLinks } from '../src/pages/canvas/TapnowStudio/canvasMediaPreview.js'
import { readNodeMedia } from '../src/pages/canvas/TapnowStudio/canvasNodeOutputs.js'
import { buildConnectedVideoInputCache } from '../src/pages/canvas/TapnowStudio/canvasVideoInput.js'
const source = { id: 'source', type: 'gen-video', content: 'blob:source' }
const other = { id: 'other', type: 'gen-video', content: 'blob:other' }
const preview = { id: 'preview', type: 'preview', content: '' }
const edge = { id: 'edge', from: 'source', to: 'preview' }
const nodesMap = new Map([source, other, preview].map(node => [node.id, node]))
const connect = (edges, patch = {}, map = nodesMap) => connectCanvasNodes(edges, map, { ...edge, ...patch })
const populated = () => {
  const nodes = [source, other, preview]
  const link = connectedPreviewLinks(nodes, [edge])[0]
  return applyPreviewUpdates(nodes, [edge], [{ ...link, result: link.media }])
}

test('single-input connections are replaced atomically instead of leaving an invisible older input', () => {
  const result = connect([edge], { id: 'replacement', from: 'other' })
  assert.equal(result.connections.length, 1)
  assert.equal(result.connections[0].from, 'other')
  assert.equal(result.reason, undefined)
})
test('multi-reference generation inputs retain other inputs, while explicit ports replace only that port', () => {
  const map = new Map(nodesMap).set('preview', { ...preview, type: 'gen-image' })
  assert.equal(connect([edge], { id: 'new', from: 'other' }, map).connections.length, 2)
  const edges = [{ ...edge, inputType: 'first-frame' }, { ...edge, id: 'end', inputType: 'last-frame' }]
  const result = connect(edges, { id: 'new', from: 'other', inputType: 'first-frame' }, map)
  assert.equal(result.connections.length, 2)
  assert.strictEqual(result.connections[0], edges[1])
})
test('duplicate connections are no-ops and invalid/self/cyclic connections preserve the graph', () => {
  const edges = [edge]
  assert.strictEqual(connect(edges).connections, edges)
  for (const patch of [{ to: 'source' }, { to: 'missing' }, { from: 'preview', to: 'source' }]) {
    const result = connect(edges, patch)
    assert.strictEqual(result.connections, edges)
    assert.ok(result.reason)
  }
})
test('cycle detection terminates on an imported graph that already contains cycles', () => {
  const edges = [{ from: 'source', to: 'other' }, { from: 'other', to: 'source' }]
  assert.equal(connect(edges).connections.length, 3)
})
for (const type of ['image', 'video']) test(`disconnect removes inherited ${type}, gallery and metadata and stops downstream consumption`, () => {
  const nodes = populated().map(node => node.id === 'preview' ? { ...node, previewType: type, previewMjImages: type === 'image' ? ['blob:source', 'blob:second'] : null, videoMeta: { duration: 5 }, selectedKeyframes: [{ url: 'old-frame' }] } : node)
  const cleaned = clearDisconnectedPreviewMedia(nodes, [], nodes, [edge])
  const result = cleaned.find(node => node.id === 'preview')
  assert.equal(result.content, '')
  assert.equal(result.previewMjImages, null)
  assert.equal(result.videoMeta, undefined)
  assert.deepEqual(readNodeMedia(result), [])
  assert.strictEqual(cleaned[0], nodes[0])
  assert.strictEqual(clearDisconnectedPreviewMedia(cleaned, []), cleaned)
})
test('a disconnected owned preview cannot feed another node even before state cleanup finishes', () => {
  const nodes = populated(), map = new Map(nodes.map(node => [node.id, node]))
  assert.deepEqual(readNodeMedia(map.get('preview'), { nodesMap: map, incoming: () => [] }), [])
})
test('reconnect to an empty source clears old content and rejects an old async response', () => {
  const nodes = populated()
  const pending = connectedPreviewLinks(nodes, [edge])[0]
  const edges = [{ ...edge, id: 'new', from: 'other' }]
  const changed = nodes.map(node => node.id === 'other' ? { ...node, content: '' } : node)
  const cleaned = clearDisconnectedPreviewMedia(changed, edges, nodes, [edge])
  assert.equal(cleaned[2].content, '')
  assert.strictEqual(applyPreviewUpdates(cleaned, edges, [{ ...pending, result: pending.media }]), cleaned)
})
test('disconnect and reconnect to the same source rejects responses belonging to the removed connection', () => {
  const nodes = [source, preview]
  const pending = connectedPreviewLinks(nodes, [edge])[0]
  const replacement = [{ ...edge, id: 'new' }]
  assert.strictEqual(applyPreviewUpdates(nodes, replacement, [{ ...pending, result: pending.media }]), nodes)
})
test('removing an upstream node and reopening an already disconnected saved preview both clear inherited content', () => {
  const nodes = populated()
  assert.equal(clearDisconnectedPreviewMedia(nodes.filter(node => node.id !== 'source'), [], nodes, [edge]).find(node => node.id === 'preview').content, '')
  assert.equal(clearDisconnectedPreviewMedia(nodes, [])[2].content, '')
})
test('legacy connected previews clear on disconnect; manually dropped and standalone media survive', () => {
  const legacy = populated().map(node => node.id === 'preview' ? { ...node, previewSourceNodeId: undefined } : node)
  assert.equal(clearDisconnectedPreviewMedia(legacy, [], legacy, [edge])[2].content, '')
  const manual = legacy.map(node => node.id === 'preview' ? { ...node, previewSourceNodeId: null, content: 'manual' } : node)
  assert.strictEqual(clearDisconnectedPreviewMedia(manual, [], legacy, [edge]), manual)
  assert.strictEqual(clearDisconnectedPreviewMedia(legacy, [], legacy, []), legacy)
})
test('an independent legacy edit made while disconnecting is preserved', () => {
  const before = populated().map(node => node.id === 'preview' ? { ...node, previewSourceNodeId: undefined } : node)
  const edited = before.map(node => node.id === 'preview' ? { ...node, content: 'manual-replacement' } : node)
  assert.strictEqual(clearDisconnectedPreviewMedia(edited, [], before, [edge]), edited)
})
test('unrelated edge removal preserves content; undo restores the original graph and preview', () => {
  const nodes = populated()
  assert.strictEqual(clearDisconnectedPreviewMedia(nodes, [edge], nodes, [edge, { from: 'source', to: 'other' }]), nodes)
  const disconnected = clearDisconnectedPreviewMedia(nodes, [], nodes, [edge])
  assert.strictEqual(clearDisconnectedPreviewMedia(nodes, [edge], disconnected, []), nodes)
})
test('disconnect cascades through preview and image pass-through without erasing independent inputs or generated results', () => {
  const src = { id: 'source', type: 'gen-image', content: 'still' }
  const p = { ...preview, content: 'still', previewType: 'image', previewSourceNodeId: 'source' }
  const input = { id: 'input', type: 'input-image' }
  const last = { id: 'last', type: 'preview', content: 'still', previewType: 'image', previewSourceNodeId: 'input' }
  const nodes = [src, p, input, last]
  const edges = [edge, { from: 'preview', to: 'input' }, { from: 'input', to: 'last' }]
  const cleaned = clearDisconnectedPreviewMedia(nodes, edges.slice(1), nodes, edges)
  assert.equal(cleaned[1].content, '')
  assert.equal(cleaned[3].content, '')
  assert.strictEqual(cleaned[0], src)
  const independent = nodes.map(node => node.id === 'input' ? { ...node, content: 'manual' } : node)
  assert.equal(clearDisconnectedPreviewMedia(independent, edges.slice(1), independent, edges)[2].content, 'manual')
})
test('upstream image pass-through and video analysis caches drop their inputs on disconnect', () => {
  const nodes = [source, { id: 'analysis', type: 'video-analyze' }]
  const map = new Map(nodes.map(node => [node.id, node]))
  const mode = value => value || 'image'
  assert.equal(buildConnectedVideoInputCache(map, [{ from: 'source', to: 'analysis' }], mode).get('analysis').content, 'blob:source')
  assert.equal(buildConnectedVideoInputCache(map, [], mode).get('analysis'), undefined)
})
test('moving or resizing nodes keeps the same media graph, while new media/selection/topology invalidates it', () => {
  const original = populated()
  const moved = original.map(node => ({ ...node, x: 200, y: 100, width: 500, height: 400 }))
  assert.strictEqual(stableMediaNodes(moved, original), original)
  const changed = moved.map(node => node.id === 'source' ? { ...node, content: 'new' } : node)
  assert.notStrictEqual(stableMediaNodes(changed, original), original)
  assert.notStrictEqual(stableMediaNodes(original.slice(1), original), original)
  assert.notStrictEqual(stableMediaNodes([...original].reverse(), original), original)
})
test('large preview fan-out uses indexed edge access and does not repeatedly scan all connections', t => {
  const count = 1200
  const nodes = [source, ...Array.from({ length: count }, (_, index) => ({ id: `p${index}`, type: 'preview', content: 'blob:source', previewType: 'video', previewSourceNodeId: source.id }))]
  const edges = nodes.slice(1).map(node => ({ id: node.id, from: source.id, to: node.id }))
  edges.find = () => assert.fail('full connection scans are not allowed per preview')
  edges.filter = () => assert.fail('full connection scans are not allowed per preview')
  const started = performance.now()
  assert.equal(connectedPreviewLinks(nodes, edges).length, count)
  const cleaned = clearDisconnectedPreviewMedia(nodes, [], nodes, edges)
  assert.equal(cleaned.filter(node => node.type === 'preview' && !node.content).length, count)
  t.diagnostic(`Indexed lookup and disconnect for ${count} previews: ${(performance.now() - started).toFixed(1)} ms`)
})
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as connectionHelpers from '../src/pages/canvas/TapnowStudio/canvasConnections.js'
import * as previewHelpers from '../src/pages/canvas/TapnowStudio/canvasMediaPreview.js'

const hookCode = ts.transpileModule(readFileSync(new URL('../src/pages/canvas/TapnowStudio/useCanvasMediaPreviews.js', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function hookHarness(initialNodes, initialEdges, options = {}) {
  let nodes = initialNodes, edges = initialEdges, index = 0, slots = [], dirty = false, updates = 0
  let layouts = [], effects = []
  const same = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]))
  const effect = queue => (fn, deps) => {
    const slot = index++, old = slots[slot]
    if (old && same(old.deps, deps)) return
    slots[slot] = { deps, cleanup: old?.cleanup }
    queue.push(() => { slots[slot].cleanup?.(); slots[slot].cleanup = fn() })
  }
  const hooks = {
    useRef: initial => { const slot = index++; if (!slots[slot]) slots[slot] = { current: initial }; return slots[slot] },
    useMemo: (fn, deps) => { const slot = index++; if (!slots[slot] || !same(slots[slot].deps, deps)) slots[slot] = { deps, value: fn() }; return slots[slot].value },
    useLayoutEffect: (fn, deps) => effect(layouts)(fn, deps), useEffect: (fn, deps) => effect(effects)(fn, deps),
  }
  const exports = {}
  vm.runInNewContext(hookCode, { exports, queueMicrotask, require: name => name === 'react' ? hooks : name.endsWith('canvasConnections') ? connectionHelpers : name.endsWith('canvasMediaPreview') ? previewHelpers : { StudioCanvases: { generations: options.list || (async () => ({ items: [] })) } } })
  const setNodes = fn => { updates++; const next = fn(nodes); if (next !== nodes) { nodes = next; dirty = true } }
  const session = options.session === null ? null : { document: { canvasId: 12 }, output: async asset => 'blob:' + asset.assetId }
  const tasks = [], report = error => { throw error }
  function render() {
    let passes = 0
    do {
      if (++passes > 10) assert.fail('render loop')
      dirty = false; index = 0; layouts = []; effects = []
      exports.useCanvasMediaPreviews({ session, enabled: options.enabled !== false, nodes, connections: edges, tasks, setNodes: options.unstableCallbacks ? fn => setNodes(fn) : setNodes, report: options.unstableCallbacks ? error => report(error) : report })
      layouts.forEach(fn => fn()); effects.forEach(fn => fn())
    } while (dirty)
  }
  return { render, get nodes() { return nodes }, get updates() { return updates }, changeEdges(next) { edges = next; render() }, move() { nodes = nodes.map(node => ({ ...node, x: 123 })); render() }, async flush() { await new Promise(resolve => setImmediate(resolve)); render(); await new Promise(resolve => setImmediate(resolve)); render() } }
}

test('actual preview hook clears disconnects even when cloud syncing is paused or in local mode', async () => {
  for (const options of [{ enabled: false }, { session: null }]) {
    const h = hookHarness(populated(), [edge], options)
    h.render(); h.changeEdges([])
    assert.equal(h.nodes.find(node => node.id === 'preview').content, '')
    const updates = h.updates
    h.move(); h.render()
    assert.equal(h.updates, updates)
  }
})
test('new preview connections receive applied media in local mode and while cloud syncing is paused', async () => {
  for (const state of [{ session: null }, { enabled: false }, { session: null, enabled: false }]) {
    let requests = 0
    const h = hookHarness([source, preview], [], {
      ...state, unstableCallbacks: true,
      list: async () => { requests++; return { items: [] } },
    })
    h.render(); await h.flush()
    assert.equal(h.updates, 0)
    h.changeEdges([edge]); await h.flush()
    assert.equal(h.nodes[1].content, source.content)
    assert.equal(h.nodes[1].previewType, 'video')
    assert.equal(h.nodes[1].previewSourceNodeId, source.id)
    assert.equal(h.updates, 1)
    h.move(); await h.flush(); await h.flush()
    assert.equal(h.updates, 1)
    assert.equal(requests, 0)
  }
})

test('missing source media never queries cloud history or erases independent previews while local or paused', async () => {
  for (const state of [{ session: null }, { enabled: false }, { session: null, enabled: false }]) {
    for (const content of ['', 'blob:manually-dropped']) {
      let requests = 0
      const independent = { ...preview, content, previewType: content ? 'image' : null, previewSourceNodeId: null }
      const h = hookHarness([{ ...source, content: '' }, independent], [edge], {
        ...state, list: async () => { requests++; return { items: [] } },
      })
      h.render(); await h.flush()
      assert.equal(h.nodes[1].content, content)
      assert.equal(h.updates, 0)
      assert.equal(requests, 0)
    }
  }
})

test('cloud history recovery resumes only after cloud syncing is enabled', async () => {
  let requests = 0
  const options = {
    enabled: false,
    list: async () => {
      requests++
      return { items: [{ canvasId: 12, nodeId: 'source', status: 3, operation: 'videoGenerate', outputs: [{ assetId: 1 }] }] }
    },
  }
  const h = hookHarness([{ ...source, content: '' }, preview], [edge], options)
  h.render(); await h.flush()
  assert.equal(h.updates, 0)
  assert.equal(requests, 0)
  options.enabled = true
  h.render(); await h.flush()
  assert.equal(h.nodes[1].content, 'blob:1')
  assert.equal(h.updates, 1)
  assert.ok(requests > 0)
})

test('actual hook cancels pending task results when the wire is removed', async () => {
  let resolve
  const h = hookHarness([{ ...source, content: '' }, preview], [edge], { list: () => new Promise(done => { resolve = done }) })
  h.render(); h.changeEdges([])
  resolve({ items: [{ canvasId: 12, nodeId: 'source', status: 3, operation: 'videoGenerate', outputs: [{ assetId: 1 }] }] })
  await h.flush()
  assert.equal(h.nodes[1].content, '')
})
test('actual hook batches preview fan-out and performs no preview updates on pure node movement', async () => {
  const previews = Array.from({ length: 50 }, (_, index) => ({ ...preview, id: 'p' + index }))
  const edges = previews.map(node => ({ ...edge, id: node.id, to: node.id }))
  const h = hookHarness([source, ...previews], edges)
  h.render(); await h.flush()
  assert.ok(h.nodes.slice(1).every(node => node.content === 'blob:source'))
  assert.ok(h.updates <= 2, `expected batched updates, received ${h.updates}`)
  const updates = h.updates
  h.move(); await h.flush()
  assert.equal(h.updates, updates)
})

const app = ts.createSourceFile('App.jsx', readFileSync(new URL('../src/pages/canvas/TapnowStudio/App.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
let connectHandler
function findConnect(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(app) === 'handleNodeMouseUp') connectHandler = node.initializer.arguments[0].getText(app)
  ts.forEachChild(node, findConnect)
}
findConnect(app)
test('actual forward and reverse drag handlers apply the same replacement in one update and record undo', () => {
  for (const reverse of [false, true]) {
    let result = [edge], updates = 0, undo = 0
    const noop = () => {}
    const handler = vm.runInNewContext('(' + connectHandler + ')', {
      connectingSource: reverse ? null : 'other', connectingTarget: reverse ? 'preview' : null, connectingInputType: 'default',
      connections: result, nodesMap, connectCanvasNodes, canvasRequestId: () => 'new',
      cancelCanvasConnection: noop, commitNodeDragSession: noop, dragPriorityNodeIdsRef: { current: [] }, touchNodeSelectionPriorityBatch: noop,
      showToast: message => assert.fail(message), saveToUndoStack: () => undo++, setConnections: fn => { updates++; result = fn(result) },
      setConnectingSource: noop, setConnectingTarget: noop, setConnectingInputType: noop, setHoverTargetId: noop, setIsPanning: noop, setDragNodeId: noop, setResizingNodeId: noop,
    })
    handler(reverse ? 'other' : 'preview', { stopPropagation() {} })
    assert.equal(updates, 1)
    assert.equal(undo, 1)
    assert.equal(result.length, 1)
    assert.equal(result[0].from, 'other')
    assert.equal(result[0].to, 'preview')
  }
})

test('reconnecting an existing single input repairs legacy multiple inputs instead of silently retaining the old source', () => {
  const existing = { ...edge, id: 'other-edge', from: 'other' }
  const result = connect([edge, existing], { from: 'other' })
  assert.deepEqual(result.connections, [existing])
})

test('actual connection handler clears the gesture and reports failures during connection commit', () => {
  let cleared = 0, message = ''
  const handler = vm.runInNewContext('(' + connectHandler + ')', {
    commitNodeDragSession() { throw new Error('snapshot failed') },
    cancelCanvasConnection() { cleared++ },
    showToast(value) { message = value },
  })
  handler('preview', { stopPropagation() {} })
  assert.equal(cleared, 1)
  assert.equal(message, 'snapshot failed')
})

// Count dispatches, not just changed arrays: a no-op dispatch can still participate
// in an effect/render feedback loop when surrounding callbacks are refreshed.
test('already synchronized previews dispatch no node state updates', async () => {
  const h = hookHarness(populated(), [edge])
  h.render(); await h.flush()
  assert.equal(h.updates, 0)
})

test('connecting a preview writes once and stops even if effect callback identities change', async () => {
  const h = hookHarness([source, preview], [edge], { unstableCallbacks: true })
  h.render()
  for (let pass = 0; pass < 12; pass++) await h.flush()
  assert.equal(h.nodes[1].content, 'blob:source')
  assert.equal(h.updates, 1)
})

test('a preview update must not schedule a second redundant state write from its own result', async () => {
  const h = hookHarness([source, preview], [edge])
  h.render(); await h.flush()
  assert.equal(h.updates, 1)
})
