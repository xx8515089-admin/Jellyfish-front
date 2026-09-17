import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPreviewUpdates, connectedPreviewLinks, loadPreviewMedia, readNodePreview } from '../src/pages/canvas/TapnowStudio/canvasMediaPreview.js'

const source = (type = 'gen-video', patch = {}) => ({ id: 'source', type, settings: {}, ...patch })
const preview = (patch = {}) => ({ id: 'preview', type: 'preview', content: '', ...patch })
const edges = [{ from: 'source', to: 'preview' }]
const task = (patch = {}) => ({ canvasId: 12, generationId: 20, nodeId: 'source', operation: 'videoGenerate', status: 3, revisionNo: 2, createdAt: '2026-09-16T08:00:00Z', outputs: [{ assetId: 30 }], ...patch })
function harness(items = [], tasks = []) {
  const queries = [], downloads = []
  return {
    queries, downloads,
    session: { document: { canvasId: 12 }, output: async asset => { downloads.push(asset.assetId); return `blob:asset-${asset.assetId}` } },
    tasks, outputCache: new Map(),
    listGenerations: async (...args) => { queries.push(args); return { items } },
  }
}
async function sync(nodes, h) {
  const link = connectedPreviewLinks(nodes, edges)[0]
  const result = await loadPreviewMedia(link, h)
  return applyPreviewUpdates(nodes, edges, [{ ...link, result }])
}

test('an applied video reaches its connected preview without relying on a file extension', async () => {
  const nodes = [source('gen-video', { content: 'blob:chosen-video' }), preview({ previewType: 'image', previewMjImages: ['old.png'] })]
  const h = harness()
  const result = await sync(nodes, h)
  assert.equal(result[1].content, 'blob:chosen-video')
  assert.equal(result[1].previewType, 'video')
  assert.equal(result[1].previewMjImages, null)
  assert.equal(h.queries.length, 0)
  assert.strictEqual(result[0], nodes[0])
})

test('applied images preview the selected output and preserve the multiple-image gallery', async () => {
  const nodes = [source('gen-image', { content: 'first.png', settings: { imageUrls: ['first.png', 'second.png'], selectedImageIndex: 1 } }), preview()]
  const result = await sync(nodes, harness())
  assert.equal(result[1].content, 'second.png')
  assert.equal(result[1].previewType, 'image')
  assert.deepEqual(result[1].previewMjImages, ['first.png', 'second.png'])
})

test('a single image clears an old video type and stale gallery', async () => {
  const nodes = [source('gen-image', { content: 'blob:still' }), preview({ content: 'old.mp4', previewType: 'video', previewMjImages: ['old.png'] })]
  const result = await sync(nodes, harness())
  assert.equal(result[1].content, 'blob:still')
  assert.equal(result[1].previewType, 'image')
  assert.equal(result[1].previewMjImages, null)
})

test('reloading or connecting after completion recovers a video outside the visible history page', async () => {
  const nodes = [source(), preview()]
  const h = harness([task()])
  const result = await sync(nodes, h)
  assert.deepEqual(h.queries, [[12, 1, 'source', { status: 3 }]])
  assert.equal(result[1].content, 'blob:asset-30')
  assert.equal(result[1].previewType, 'video')
  assert.strictEqual(result[0], nodes[0])
  assert.equal(nodes[0].content, undefined)
})

test('completed image tasks recover all outputs for the preview gallery', async () => {
  const result = await sync([source('gen-image'), preview()], harness([task({ operation: 'imageGenerate', outputs: [{ assetId: 1 }, { assetId: 2 }] })]))
  assert.equal(result[1].content, 'blob:asset-1')
  assert.equal(result[1].previewType, 'image')
  assert.deepEqual(result[1].previewMjImages, ['blob:asset-1', 'blob:asset-2'])
})

test('recently polled completion wins over stale history and unrelated tasks are excluded', async () => {
  const h = harness([
    task(),
    task({ canvasId: 99, createdAt: '2026-09-17', outputs: [{ assetId: 99 }] }),
    task({ nodeId: 'other', createdAt: '2026-09-17', outputs: [{ assetId: 98 }] }),
    task({ shotId: 'shot', createdAt: '2026-09-17', outputs: [{ assetId: 97 }] }),
    task({ status: 2, createdAt: '2026-09-17', outputs: [{ assetId: 96 }] }),
    task({ operation: 'imageGenerate', createdAt: '2026-09-17', outputs: [{ assetId: 95 }] }),
  ], [task({ generationId: 21, createdAt: '2026-09-16T09:00:00Z', outputs: [{ assetId: 31 }] })])
  const result = await sync([source(), preview()], h)
  assert.equal(result[1].content, 'blob:asset-31')
  assert.deepEqual(h.downloads, [31])
})

test('explicitly applied source output takes precedence over other completed tasks', async () => {
  const h = harness([task()])
  const result = await sync([source('gen-video', { content: 'blob:user-choice' }), preview()], h)
  assert.equal(result[1].content, 'blob:user-choice')
  assert.equal(h.downloads.length, 0)
})

test('no completed output preserves the existing preview', async () => {
  const nodes = [source(), preview({ content: 'keep.mp4', previewType: 'video' })]
  assert.strictEqual(await sync(nodes, harness([task({ outputs: [] })])), nodes)
})

test('identical applied media does not cause another node update or autosave loop', async () => {
  const initial = [source('gen-video', { content: 'blob:video' }), preview()]
  const once = await sync(initial, harness())
  assert.strictEqual(await sync(once, harness()), once)
})

test('late asset resolution cannot overwrite a removed link, changed source or edited preview', () => {
  const nodes = [source(), preview()]
  const link = connectedPreviewLinks(nodes, edges)[0]
  const updates = [{ ...link, result: { content: 'late.mp4', previewType: 'video', previewMjImages: null, previewFilename: '' } }]
  assert.strictEqual(applyPreviewUpdates(nodes, [], updates), nodes)
  const changedSource = [source('gen-video', { content: 'chosen.mp4' }), nodes[1]]
  assert.strictEqual(applyPreviewUpdates(changedSource, edges, updates), changedSource)
  const editedPreview = [nodes[0], preview({ content: 'dropped.mp4' })]
  assert.strictEqual(applyPreviewUpdates(editedPreview, edges, updates), editedPreview)
  const removedPreview = [nodes[0]]
  assert.strictEqual(applyPreviewUpdates(removedPreview, edges, updates), removedPreview)
})

test('reconnected previews cannot receive the old source result', () => {
  const nodes = [source(), { ...source(), id: 'other' }, preview()]
  const link = connectedPreviewLinks(nodes, edges)[0]
  const updates = [{ ...link, result: { content: 'late.mp4', previewType: 'video', previewMjImages: null, previewFilename: '' } }]
  assert.strictEqual(applyPreviewUpdates(nodes, [{ from: 'other', to: 'preview' }], updates), nodes)
})

test('multiple previews reuse downloaded assets and a failed download can be retried', async () => {
  const h = harness([task()])
  const link = connectedPreviewLinks([source(), preview()], edges)[0]
  await Promise.all([loadPreviewMedia(link, h), loadPreviewMedia({ ...link, previewId: 'second' }, h)])
  assert.deepEqual(h.downloads, [30])
  h.outputCache.clear()
  let attempts = 0
  h.session.output = async () => { if (++attempts === 1) throw new Error('temporary failure'); return 'blob:recovered' }
  await assert.rejects(loadPreviewMedia(link, h), /temporary failure/)
  assert.equal((await loadPreviewMedia(link, h)).content, 'blob:recovered')
})

test('character and scene media generators share image/video preview behavior', () => {
  for (const type of ['generate-character-image', 'generate-scene-image']) assert.equal(readNodePreview(source(type, { content: 'blob:image' })).previewType, 'image')
  for (const type of ['generate-character-video', 'generate-scene-video']) assert.equal(readNodePreview(source(type, { content: 'blob:video' })).previewType, 'video')
  assert.equal(connectedPreviewLinks([source('text-node', { content: 'text' }), preview()], edges).length, 0)
})
