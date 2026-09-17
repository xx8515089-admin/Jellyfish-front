import { indexConnections } from './canvasConnections.js'
import { readNodeMedia, readShotMedia } from './canvasNodeOutputs.js'
const videoTypes = new Set(['gen-video', 'generate-character-video', 'generate-scene-video'])
const imageTypes = new Set(['input-image', 'gen-image', 'generate-character-image', 'generate-scene-image'])
const isVideoContent = value => /(?:\.(?:mp4|webm|mov|m4v|ogg)(?:[?#]|$)|^data:video\/)/i.test(String(value || ''))

export function asVideoAnalysisInput(source, normalizeStoryboardMode, options = {}) {
  if (!source) return null
  if (source.type === 'video-input') return source
  if (videoTypes.has(source.type) || (source.type === 'preview' && (source.previewType === 'video' || isVideoContent(source.content)))) {
    return {
      ...source,
      videoFileName: source.videoFileName || source.previewFilename || source.title || '已生成视频',
      videoMeta: source.videoMeta || { duration: 0 },
      frames: source.frames || [], selectedKeyframes: source.selectedKeyframes || [],
      isImageInput: false,
    }
  }
  if (imageTypes.has(source.type) || (source.type === 'preview' && source.previewType === 'image')) {
    const content = readNodeMedia(source, options).find(item => item.type === 'image')?.url || ''
    const frames = content ? [{ time: 0, url: content }] : []
    return {
      ...source, content, type: 'input-image-as-video', videoFileName: source.title || '图片输入',
      videoMeta: { duration: 0 }, frames, selectedKeyframes: frames, isImageInput: true,
    }
  }
  if (source.type === 'storyboard-node') {
    const shots = source.settings?.shots || []
    const mode = normalizeStoryboardMode(source.settings?.mode)
    const selectedFrames = shots.flatMap((shot, index) => {
      if (!shot.outputEnabled) return []
      return readShotMedia(shot, mode).filter(item => item.type === 'image').map(item => ({ time: index, url: item.url, filename: shot.image_filename || `镜头${index + 1}` }))
    })
    const video = mode === 'video' ? readNodeMedia(source).find(item => item.type === 'video') : null
    if (video) return { ...source, content: video.url, videoFileName: source.settings?.projectTitle || '分镜视频', videoMeta: source.videoMetaSource === video.url ? source.videoMeta : { duration: 0 }, frames: [], selectedKeyframes: [], isImageInput: false }
    return {
      ...source, type: 'storyboard-as-video', videoFileName: source.settings?.projectTitle || '分镜输出',
      videoMeta: { duration: shots.length }, frames: selectedFrames, selectedKeyframes: selectedFrames, isStoryboardInput: true,
    }
  }
  return null
}

export function buildConnectedVideoInputCache(nodesMap, connections, normalizeStoryboardMode) {
  const cache = new Map()
  const { incoming } = indexConnections(connections)
  const options = { nodesMap, incoming: id => incoming.get(id) || [], mediaCache: new Map() }
  const sources = new Map()
  for (const connection of connections) {
    if (cache.has(connection.to)) continue
    if (!sources.has(connection.from)) sources.set(connection.from, asVideoAnalysisInput(nodesMap.get(connection.from), normalizeStoryboardMode, options))
    const source = sources.get(connection.from)
    if (source) cache.set(connection.to, source)
  }
  return cache
}

export function applyVideoMetadata(nodes, sourceId, content, metadata) {
  let changed = false
  const next = nodes.map(node => {
    if (node.id !== sourceId) return node
    const isStoryboard = node.type === 'storyboard-node'
    const currentContent = isStoryboard ? readNodeMedia(node).find(item => item.type === 'video')?.url : node.content
    if (currentContent !== content) return node
    const currentMeta = isStoryboard && node.videoMetaSource !== content ? {} : node.videoMeta
    const patch = Object.fromEntries(Object.entries(metadata).filter(([key, value]) =>
      ['duration', 'width', 'height'].includes(key) && Number.isFinite(value) && value > 0
    ))
    if (!Object.keys(patch).some(key => currentMeta?.[key] !== patch[key])) return node
    changed = true
    return { ...node, videoMeta: { ...currentMeta, ...patch }, ...(isStoryboard ? { videoMetaSource: content } : {}) }
  })
  return changed ? next : nodes
}
