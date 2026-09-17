import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { arrangeCanvasNodes, nodesForArrangement } from '../src/pages/canvas/TapnowStudio/canvasAutoArrange.js'
const node = (id, extra = {}) => ({ id, x: 0, y: 0, width: 300, height: 220, content: 'keep', settings: { prompt: 'keep' }, ...extra })
const edge = (from, to) => ({ from, to })
function noOverlap(nodes) {
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    const x = nodes[a], y = nodes[b]
    assert.ok(x.x + x.width <= y.x || y.x + y.width <= x.x || x.y + x.height <= y.y || y.y + y.height <= x.y, `overlap: ${x.id}, ${y.id}`)
  }
}
test('multiple selected nodes take precedence over the active single node', () => {
  const nodes = [node('a'), node('b'), node('c')]
  assert.deepEqual(nodesForArrangement(nodes, new Set(['a', 'b']), 'a').map(n => n.id), ['a', 'b'])
  assert.strictEqual(nodesForArrangement(nodes), nodes)
  assert.deepEqual(nodesForArrangement(nodes, new Set(), 'a').map(n => n.id), ['a'])
})
test('mixed-size branches and merges flow left to right without changing content or wires', () => {
  const nodes = [node('a', { width: 600 }), node('b', { height: 900 }), node('c'), node('d')]
  const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]
  const result = arrangeCanvasNodes(nodes, edges)
  noOverlap(result.nodes)
  const map = new Map(result.nodes.map(n => [n.id, n]))
  for (const e of edges) assert.ok(map.get(e.to).x > map.get(e.from).x + map.get(e.from).width)
  result.nodes.forEach((n, i) => { assert.strictEqual(n.settings, nodes[i].settings); assert.equal(n.content, nodes[i].content) })
  assert.equal(nodes[0].x, 0)
  assert.strictEqual(arrangeCanvasNodes(result.nodes, edges).nodes, result.nodes)
})
test('selection avoids stationary nodes and keeps unselected identities and positions', () => {
  const nodes = [node('a'), node('b'), node('fixed', { x: 450, height: 800 })]
  const result = arrangeCanvasNodes(nodes, [edge('a', 'b')], new Set(['a', 'b']), 'a')
  assert.strictEqual(result.nodes[2], nodes[2]); noOverlap(result.nodes)
  assert.strictEqual(arrangeCanvasNodes(result.nodes, [edge('a', 'b')], new Set(['a', 'b']), 'a').nodes, result.nodes)
})
test('disconnected nodes use a compact grid, and empty/single selections are no-ops', () => {
  const nodes = Array.from({ length: 9 }, (_, i) => node(String(i)))
  const result = arrangeCanvasNodes(nodes, [])
  noOverlap(result.nodes)
  assert.equal(new Set(result.nodes.map(n => n.x)).size, 3)
  assert.equal(new Set(result.nodes.map(n => n.y)).size, 3)
  assert.strictEqual(arrangeCanvasNodes(result.nodes, []).nodes, result.nodes)
  assert.equal(arrangeCanvasNodes([], []).changed, false)
  assert.strictEqual(arrangeCanvasNodes(nodes, [], new Set(['0'])).nodes, nodes)
})
test('legacy cycles, duplicate edges, self-links and missing endpoints terminate safely', () => {
  const nodes = [node('a'), node('b'), node('c'), node('d')]
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a'), edge('a', 'b'), edge('d', 'd'), edge('missing', 'a')]
  const result = arrangeCanvasNodes(nodes, edges)
  noOverlap(result.nodes)
  assert.ok(result.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)))
})
test('long branching DAGs do not enumerate all paths or stop at depth 20', () => {
  const nodes = Array.from({ length: 180 }, (_, i) => node(String(i)))
  const edges = []
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push(edge(String(i), String(i + 1)))
    if (i + 2 < nodes.length) edges.push(edge(String(i), String(i + 2)))
  }
  const result = arrangeCanvasNodes(nodes, edges)
  for (let i = 1; i < nodes.length; i++) assert.ok(result.nodes[i].x > result.nodes[i - 1].x)
})
const actionSource = readFileSync(new URL('../src/pages/canvas/TapnowStudio/actions/mediaActions.js', import.meta.url), 'utf8')
const ast = ts.createSourceFile('actions.js', actionSource, ts.ScriptTarget.Latest, true)
const action = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'autoArrangeNodes').getText(ast).replace('export ', '')
const run = vm.runInNewContext('(' + action + ')', { arrangeCanvasNodes, t: (text, args) => text.replace('{{count}}', args?.count) })
test('actual action records one undo before moving and uses system notifications', () => {
  let nodes = [node('a'), node('b')], history = [], notices = [], writes = 0
  const context = { nodesRef: { current: nodes }, connectionsRef: { current: [edge('a', 'b')] }, selectedNodeIdsRef: { current: new Set(['a', 'b']) }, selectedNodeIdRef: { current: 'a' },
    saveToUndoStack() { history.push(nodes) }, notify: (...args) => notices.push(args), setNodes(fn) { writes++; nodes = fn(nodes) },
  }
  const original = nodes
  run(context)
  assert.strictEqual(history[0], original); assert.equal(writes, 1); assert.equal(notices[0][0], 'success')
  context.nodesRef.current = nodes; run(context)
  assert.equal(writes, 1); assert.equal(history.length, 1); assert.equal(notices[1][0], 'info')
  context.selectedNodeIdsRef.current = new Set(['a']); run(context)
  assert.equal(writes, 1); assert.equal(notices[2][0], 'info')
  nodes = history.pop(); assert.strictEqual(nodes, original)
})
