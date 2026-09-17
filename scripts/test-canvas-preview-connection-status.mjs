import assert from 'node:assert/strict'
import test from 'node:test'
import { indexConnections } from '../src/pages/canvas/TapnowStudio/canvasConnections.js'
import { connectedPreviewLinks } from '../src/pages/canvas/TapnowStudio/canvasMediaPreview.js'
import { getPreviewConnectionStatus, previewSourceLabel } from '../src/pages/canvas/TapnowStudio/canvasPreviewConnectionStatus.js'

const preview = { id: 'preview', type: 'preview' }
const source = (type = 'gen-image', patch = {}) => ({ id: 'source', type, ...patch })
const edge = { id: 'edge', from: 'source', to: 'preview' }
function status(nodes, edges, id = 'preview') {
  const index = indexConnections(edges)
  return getPreviewConnectionStatus(id, {
    nodesMap: new Map(nodes.map(node => [node.id, node])),
    incoming: key => index.incoming.get(key) || [],
    outgoing: key => index.outgoing.get(key) || [],
  })
}

test('all preview-supported empty inputs report connection before their first output', () => {
  for (const type of ['gen-image', 'gen-video', 'generate-character-image', 'generate-scene-image', 'generate-character-video', 'generate-scene-video', 'input-image', 'video-input', 'storyboard-node']) {
    const from = source(type)
    const nodes = [from, preview]
    assert.deepEqual(status(nodes, [edge]), { kind: 'incoming', source: from })
    assert.equal(connectedPreviewLinks(nodes, [edge])[0].sourceId, from.id)
  }
})

test('input selection matches synchronization and skips missing and unsupported sources', () => {
  const text = source('text-node', { id: 'text' })
  const first = source('gen-video')
  const second = source('gen-image', { id: 'second' })
  const nodes = [preview, text, first, second]
  const edges = [{ from: 'missing', to: 'preview' }, { from: 'text', to: 'preview' }, edge, { from: 'second', to: 'preview' }]
  assert.strictEqual(status(nodes, edges).source, first)
  assert.equal(connectedPreviewLinks(nodes, edges)[0].sourceId, first.id)
})

test('reverse links report downstream reference direction instead of waiting for an upstream output', () => {
  const nodes = [source(), preview]
  assert.deepEqual(status(nodes, [{ from: 'preview', to: 'source' }]), { kind: 'outgoing' })
  assert.equal(connectedPreviewLinks(nodes, [{ from: 'preview', to: 'source' }]).length, 0)
  assert.equal(status(nodes, [edge, { from: 'preview', to: 'source' }]).kind, 'incoming')
})

test('unsupported and disconnected inputs never promise media that cannot be resolved', () => {
  for (const type of ['text-node', 'preview', 'image-compare', 'character-description']) {
    const nodes = [source(type), preview]
    assert.deepEqual(status(nodes, [edge]), { kind: 'unsupported' })
    assert.equal(connectedPreviewLinks(nodes, [edge]).length, 0)
  }
  assert.deepEqual(status([source(), preview], []), { kind: 'disconnected' })
  assert.deepEqual(status([preview], [edge, { from: 'preview', to: 'missing' }]), { kind: 'disconnected' })
})

test('disconnecting and reconnecting a preview reads the current edge index', () => {
  const nodes = [preview, source(), source('gen-video', { id: 'video' })]
  assert.equal(status(nodes, [edge]).source.type, 'gen-image')
  assert.deepEqual(status(nodes, []), { kind: 'disconnected' })
  assert.equal(status(nodes, [{ from: 'video', to: 'preview' }]).source.type, 'gen-video')
})

test('status only reads the preview adjacency list and never resolves upstream media', () => {
  const from = { id: 'source', type: 'input-image',
    get content() { assert.fail('status must not read or resolve media') },
  }
  const incomingCalls = []
  const result = getPreviewConnectionStatus('preview', {
    nodesMap: new Map([[from.id, from], ['preview', preview]]),
    incoming: id => { incomingCalls.push(id); return [edge] },
    outgoing: () => assert.fail('a valid input already determines the status'),
  })
  assert.strictEqual(result.source, from)
  assert.deepEqual(incomingCalls, ['preview'])
})

test('source labels retain custom names and explain the source type', () => {
  const t = text => text
  assert.equal(previewSourceLabel(source('gen-image'), t), 'AI 绘图')
  assert.equal(previewSourceLabel(source('gen-video', { title: '雨夜镜头' }), t), '雨夜镜头 · AI 视频')
  assert.equal(previewSourceLabel(source('storyboard-node', { settings: { projectTitle: '第一集' } }), t), '第一集 · 分镜节点')
})
