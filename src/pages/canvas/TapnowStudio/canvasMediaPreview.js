import { indexConnections } from './canvasConnections.js'
import { imageGeneratorTypes, videoGeneratorTypes, readNodeMedia } from './canvasNodeOutputs.js'
const generationType = node => videoGeneratorTypes.has(node?.type) ? 'video' : imageGeneratorTypes.has(node?.type) ? 'image' : null
export const previewSourceMediaType = node => generationType(node) || (node?.type === 'input-image' ? 'image' : node?.type === 'video-input' ? 'video' : node?.type === 'storyboard-node' ? (String(node.settings?.mode).toLowerCase() === 'video' ? 'video' : 'image') : null)

export function readNodePreview(node, options = {}) {
  if (!previewSourceMediaType(node)) return null
  const selected = readNodeMedia(node, { ...options, rawVideo: true })[0]
  if (!selected) return null
  const images = selected.type === 'image' ? readNodeMedia(node, { ...options, allImages: true }).filter(item => item.type === 'image').map(item => item.url) : []
  return { content: selected.url, previewType: selected.type, previewMjImages: images.length > 1 ? images : null, previewFilename: '' }
}

const previewValue = node => ({ content: node.content || '', previewType: node.previewType, previewMjImages: node.previewMjImages || null, previewFilename: node.previewFilename || '' })
const same = (a, b) => {
  if (a === b) return true
  if (!a || !b || a.content !== b.content || a.previewType !== b.previewType || a.previewFilename !== b.previewFilename) return false
  const left = a.previewMjImages || [], right = b.previewMjImages || []
  return left === right || (left.length === right.length && left.every((url, index) => url === right[index]))
}

// Effect dependencies must compare media values without serializing the same
// large image payload once for every outgoing preview edge.
export function stablePreviewLinks(links, previous = []) {
  const empty = link => !link.expectedPreview.content && !link.expectedPreview.previewMjImages?.length
  if (links.length !== previous.length) return links
  const unchanged = links.every((link, index) => {
    const before = previous[index]
    return link.previewId === before.previewId && link.connectionId === before.connectionId &&
      link.sourceId === before.sourceId && link.type === before.type && link.recoverTask === before.recoverTask &&
      empty(link) === empty(before) && same(link.media, before.media)
  })
  return unchanged ? previous : links
}

export function connectedPreviewLinks(nodes, connections) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const index = indexConnections(connections)
  const incoming = id => index.incoming.get(id) || []
  const options = { nodesMap: byId, incoming, mediaCache: new Map() }
  const sourcePreviews = new Map()
  return nodes.filter(node => node.type === 'preview').flatMap(preview => {
    const connection = incoming(preview.id).find(edge => previewSourceMediaType(byId.get(edge.from)))
    const source = connection && byId.get(connection.from)
    if (!source) return []
    if (!sourcePreviews.has(source.id)) sourcePreviews.set(source.id, readNodePreview(source, options))
    return [{ previewId: preview.id, connectionId: connection.id, sourceId: source.id, type: previewSourceMediaType(source), media: sourcePreviews.get(source.id), recoverTask: Boolean(generationType(source)), expectedPreview: previewValue(preview) }]
  })
}

// Keep an explicitly applied source result; otherwise recover a completed task for display only.
export async function loadPreviewMedia(link, { session, tasks, listGenerations, outputCache }) {
  if (link.media) return link.media
  if (link.recoverTask === false) return null
  const canvasId = session.document.canvasId
  const page = await listGenerations(canvasId, 1, link.sourceId, { status: 3 })
  const candidates = [...(page.items || []), ...tasks].filter(task =>
    String(task.canvasId) === String(canvasId) && task.nodeId === link.sourceId && task.shotId == null &&
    task.status === 3 && task.operation === (link.type === 'video' ? 'videoGenerate' : 'imageGenerate') && task.outputs?.length
  )
  candidates.sort((a, b) =>
    (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) ||
    Number(b.revisionNo || 0) - Number(a.revisionNo || 0) ||
    String(b.generationId).localeCompare(String(a.generationId), undefined, { numeric: true })
  )
  const task = candidates[0]
  if (!task) return null
  const outputs = link.type === 'video' ? task.outputs.slice(0, 1) : task.outputs
  const urls = await Promise.all(outputs.map(asset => {
    const key = `${canvasId}:${asset.assetId}`
    if (!outputCache.has(key)) {
      const pending = session.output(asset).catch(error => { outputCache.delete(key); throw error })
      outputCache.set(key, pending)
    }
    return outputCache.get(key)
  }))
  return { content: urls[0], previewType: link.type, previewMjImages: link.type === 'image' && urls.length > 1 ? urls : null, previewFilename: '' }
}

export function applyPreviewUpdates(nodes, connections, updates) {
  const currentLinks = new Map(connectedPreviewLinks(nodes, connections).map(link => [link.previewId, link]))
  const byPreview = new Map(updates.map(update => [update.previewId, update]))
  let changed = false
  const next = nodes.map(node => {
    const update = byPreview.get(node.id)
    const current = currentLinks.get(node.id)
    if (!update?.result || !current || current.sourceId !== update.sourceId || current.connectionId !== update.connectionId || current.type !== update.type ||
        !same(current.media, update.media) || !same(previewValue(node), update.expectedPreview) ||
        (same(previewValue(node), update.result) && node.previewSourceNodeId === update.sourceId)) return node
    changed = true
    return { ...node, ...update.result, previewSourceNodeId: update.sourceId }
  })
  return changed ? next : nodes
}

// Only auto-fed preview content belongs to a wire. Independent drops use a null owner.
export function clearDisconnectedPreviewMedia(nodes, connections, previousNodes = nodes, previousConnections = connections) {
  const previousLinks = new Map(connectedPreviewLinks(previousNodes, previousConnections).map(link => [link.previewId, link]))
  const previousById = new Map(previousNodes.map(node => [node.id, node]))
  let current = nodes
  // Clearing one preview can invalidate an image-input pass-through farther downstream.
  for (let pass = 0; pass < nodes.length; pass++) {
    const links = new Map(connectedPreviewLinks(current, connections).map(link => [link.previewId, link]))
    let changed = false
    const next = current.map(node => {
      if (node.type !== 'preview') return node
      const before = previousLinks.get(node.id)
      const link = links.get(node.id)
      const owner = node.previewSourceNodeId ?? (node.previewSourceNodeId === undefined ? before?.sourceId : null)
      if (!owner) return node
      const previous = previousById.get(node.id)
      // An independent edit made during the disconnect must not be discarded.
      if (node.previewSourceNodeId === undefined && previous && !same(previewValue(node), previewValue(previous))) return node
      const removed = !link || link.sourceId !== owner
      const inputEmptied = link && !link.recoverTask && !link.media
      if (!removed && !inputEmptied) return node
      changed = true
      return { ...node, content: '', previewType: null, previewMjImages: null, previewFilename: '', previewSourceNodeId: null,
        videoMeta: undefined, dimensions: undefined, frames: [], selectedKeyframes: [] }
    })
    if (!changed) break
    current = next
  }
  return current
}
