import assert from 'node:assert/strict'
import test from 'node:test'
import { performance } from 'node:perf_hooks'
import { readNodeMedia } from '../src/pages/canvas/TapnowStudio/canvasNodeOutputs.js'
import { connectedPreviewLinks, stablePreviewLinks } from '../src/pages/canvas/TapnowStudio/canvasMediaPreview.js'
import { buildConnectedVideoInputCache } from '../src/pages/canvas/TapnowStudio/canvasVideoInput.js'

function graph(nodes, edges) {
  const nodesMap = new Map(nodes.map(node => [node.id, node]))
  const incoming = new Map()
  for (const edge of edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, [])
    incoming.get(edge.to).push(edge)
  }
  let reads = 0
  return {
    nodesMap, incoming: id => { reads++; return incoming.get(id) || [] },
    get reads() { return reads },
  }
}

test('deep image-input chains resolve without recursive stack overflow', t => {
  const count = 12000
  const nodes = [{ id: 'source', type: 'gen-image', content: 'image.png' }]
  const edges = []
  for (let index = 0; index < count; index++) {
    nodes.push({ id: `input-${index}`, type: 'input-image' })
    edges.push({ from: index ? `input-${index - 1}` : 'source', to: `input-${index}` })
  }
  const options = graph(nodes, edges)
  const start = performance.now()
  assert.deepEqual(readNodeMedia(nodes.at(-1), options), [{ url: 'image.png', type: 'image' }])
  assert.equal(options.reads, count)
  t.diagnostic(`${count} pass-through nodes: ${options.reads} input lookups, ${(performance.now() - start).toFixed(1)} ms`)
})

test('empty shared branches are visited once instead of expanding every DAG path', t => {
  const levels = 28
  const nodes = [{ id: 'empty', type: 'input-image' }], edges = []
  let previous = ['empty']
  for (let level = 0; level < levels; level++) {
    const current = [`a-${level}`, `b-${level}`]
    for (const id of current) {
      nodes.push({ id, type: 'input-image' })
      edges.push(...previous.map(from => ({ from, to: id })))
    }
    previous = current
  }
  nodes.push({ id: 'target', type: 'input-image' })
  edges.push(...previous.map(from => ({ from, to: 'target' })))
  const options = graph(nodes, edges)
  const incoming = options.incoming
  options.incoming = id => {
    assert.ok(options.reads < nodes.length * 2, 'shared branches were expanded repeatedly')
    return incoming(id)
  }
  assert.deepEqual(readNodeMedia(nodes.at(-1), options), [])
  assert.equal(options.reads, nodes.length)
  t.diagnostic(`${levels}-level shared DAG: ${options.reads} lookups for ${nodes.length} nodes / ${edges.length} edges`)
})

test('single-image pass-through stops at the first available input', () => {
  const nodes = [{ id: 'source', type: 'gen-image', content: 'chosen.png' }, { id: 'target', type: 'input-image' }, { id: 'unused', type: 'input-image' }]
  const options = graph(nodes, [{ from: 'source', to: 'target' }, { from: 'unused', to: 'target' }])
  const incoming = options.incoming
  options.incoming = id => { assert.notEqual(id, 'unused'); return incoming(id) }
  assert.equal(readNodeMedia(nodes[1], options)[0].url, 'chosen.png')
})

test('path-dependent cycle results do not poison a later branch or a different root', () => {
  const nodes = [
    { id: 'source', type: 'gen-image', content: 'valid.png' },
    { id: 'a', type: 'input-image' }, { id: 'b', type: 'input-image' },
    { id: 'preview', type: 'preview', previewType: 'video', content: 'cached.mp4', previewSourceNodeId: 'a' },
    { id: 'target', type: 'input-image' },
  ]
  const options = { ...graph(nodes, [
    { from: 'b', to: 'a' }, { from: 'a', to: 'b' }, { from: 'source', to: 'a' },
    { from: 'a', to: 'preview' }, { from: 'preview', to: 'target' }, { from: 'b', to: 'target' },
  ]), mediaCache: new Map() }
  assert.deepEqual(readNodeMedia(nodes.at(-1), options), [{ url: 'valid.png', type: 'image' }])
  assert.equal(readNodeMedia(nodes[2], options)[0].url, 'valid.png')
})

test('shared media caches keep keyframes, raw video, selected images and galleries distinct', () => {
  const video = { id: 'video', type: 'video-input', content: 'video.mp4', frames: [{ url: 'frame.png' }] }
  const image = { id: 'image', type: 'gen-image', settings: { imageUrls: ['a.png', 'b.png'], selectedImageIndex: 1 } }
  const options = { mediaCache: new Map() }
  assert.equal(readNodeMedia(video, options)[0].url, 'frame.png')
  assert.equal(readNodeMedia(video, { ...options, rawVideo: true })[0].url, 'video.mp4')
  assert.deepEqual(readNodeMedia(image, options).map(item => item.url), ['b.png'])
  assert.deepEqual(readNodeMedia(image, { ...options, allImages: true }).map(item => item.url), ['a.png', 'b.png'])
  assert.equal(readNodeMedia(video, options)[0].url, 'frame.png')
})

test('large preview and analysis fan-out derives each source output once per graph snapshot', () => {
  let reads = 0
  const source = { id: 'source', type: 'gen-image', get content() { reads++; return 'source.png' } }
  const previews = Array.from({ length: 1000 }, (_, index) => ({ id: `preview-${index}`, type: 'preview' }))
  const edges = previews.map(node => ({ from: source.id, to: node.id }))
  const nodes = [source, ...previews]
  assert.equal(connectedPreviewLinks(nodes, edges).length, previews.length)
  assert.equal(reads, 2, 'selected image and gallery should be read once each for the shared source')
  reads = 0
  const cache = buildConnectedVideoInputCache(new Map(nodes.map(node => [node.id, node])), edges, value => value || 'image')
  assert.equal(cache.size, previews.length)
  assert.ok(reads <= 2, `analysis fan-out read the source ${reads} times`)
  assert.strictEqual(cache.get('preview-0'), cache.get('preview-999'))
})


test('preview sync dependencies remain stable without serializing image payloads', () => {
  const media = { content: 'data:image/png;base64,payload', previewType: 'image', previewMjImages: ['first', 'second'], previewFilename: '', toJSON() { assert.fail('media payload was serialized') } }
  const original = [{ previewId: 'p', connectionId: 'edge', sourceId: 'source', type: 'image', recoverTask: true, media, expectedPreview: { content: '', previewMjImages: null } }]
  const copy = [{ ...original[0], media: { ...media, previewMjImages: [...media.previewMjImages] }, expectedPreview: { content: '', previewMjImages: null } }]
  assert.strictEqual(stablePreviewLinks(copy, original), original)
  for (const patch of [
    { connectionId: 'replacement' }, { sourceId: 'other' },
    { media: { ...media, content: 'new-image' } }, { media: { ...media, previewMjImages: ['new-gallery'] } },
    { expectedPreview: { content: 'filled' } },
  ]) {
    const changed = [{ ...copy[0], ...patch }]
    assert.strictEqual(stablePreviewLinks(changed, original), changed)
  }
})


test('dense imported cycles have bounded work and still reach a later valid input', t => {
  const count = 120
  const nodes = Array.from({ length: count }, (_, index) => ({ id: `cycle-${index}`, type: 'input-image' }))
  const edges = nodes.flatMap(to => nodes.filter(from => from !== to).map(from => ({ from: from.id, to: to.id })))
  const source = { id: 'source', type: 'gen-image', content: 'valid.png' }
  nodes.push(source)
  edges.push({ from: source.id, to: nodes[0].id })
  const options = graph(nodes, edges)
  const incoming = options.incoming
  options.incoming = id => {
    assert.ok(options.reads < count * 3, 'cyclic branches were expanded repeatedly')
    return incoming(id)
  }
  const started = performance.now()
  assert.deepEqual(readNodeMedia(nodes[0], options), [{ url: 'valid.png', type: 'image' }])
  assert.ok(options.reads <= count * 2)
  t.diagnostic(`${count} cyclic nodes / ${edges.length} edges: ${options.reads} input lookups, ${(performance.now() - started).toFixed(1)} ms`)
})
