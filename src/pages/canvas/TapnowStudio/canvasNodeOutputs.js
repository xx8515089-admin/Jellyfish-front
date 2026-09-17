export const imageGeneratorTypes = new Set(['gen-image', 'generate-character-image', 'generate-scene-image'])
export const videoGeneratorTypes = new Set(['gen-video', 'generate-character-video', 'generate-scene-video'])
export const isVideoContent = value => /(?:\.(?:mp4|webm|mov|m4v|ogg)(?:[?#]|$)|^data:video\/)/i.test(String(value || ''))
const isImageContent = value => /(?:\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)|^data:image\/)/i.test(String(value || ''))

export function readShotMedia(shot, mode, allImages = false) {
  if (!shot?.outputEnabled) return []
  if (String(mode).toLowerCase() === 'video') {
    const legacy = shot.output_url
    const video = shot.video_url || (legacy && !isImageContent(legacy) && !shot.output_images?.includes(legacy) && legacy !== shot.image_url ? legacy : '')
    const url = video || shot.image_url
    return url ? [{ url, type: video ? 'video' : 'image' }] : []
  }
  const images = shot.output_images?.length ? shot.output_images : (shot.output_url && !isVideoContent(shot.output_url) && shot.output_url !== shot.video_url ? [shot.output_url] : [])
  const index = shot.selectedImageIndex ?? (images.length === 1 ? 0 : -1)
  return (allImages ? images : [index >= 0 ? images[index] : null]).filter(Boolean).map(url => ({ url, type: 'image' }))
}

// Yield dependencies instead of recursing: imported graphs can contain very long
// pass-through chains and a shared branch must not be expanded for every path.
function* resolveNodeMedia(node, options) {
  const settings = node.settings || {}
  let media = []
  if (node.type === 'storyboard-node') {
    media = (settings.shots || []).flatMap(shot => readShotMedia(shot, settings.mode, options.allImages))
  } else if (videoGeneratorTypes.has(node.type)) {
    media = [{ url: node.content, type: 'video' }]
  } else if (node.type === 'video-input') {
    const frames = node.selectedKeyframes?.length ? node.selectedKeyframes : node.frames?.slice(0, 1) || []
    media = !options.rawVideo && frames.length ? frames.map(frame => ({ url: frame.url, type: 'image' })) : [{ url: node.content, type: 'video' }]
  } else if (node.type === 'preview') {
    if (node.previewSourceNodeId && options.incoming && options.nodesMap) {
      const owner = options.nodesMap.get(node.previewSourceNodeId)
      if (!owner || !options.incoming(node.id).some(edge => edge.from === owner.id)) return []
      if (!imageGeneratorTypes.has(owner.type) && !videoGeneratorTypes.has(owner.type)) {
        const ownerMedia = yield { node: owner, options: { ...options, rawVideo: true } }
        if (!ownerMedia.length) return []
      }
    }
    const type = node.previewType || (isVideoContent(node.content) ? 'video' : 'image')
    media = [{ url: node.content, type }, ...(type === 'image' ? (node.previewMjImages || []).map(url => ({ url, type })) : [])]
  } else if (imageGeneratorTypes.has(node.type) || node.type === 'input-image') {
    const images = settings.imageUrls || []
    const selected = images[settings.selectedImageIndex ?? 0] || node.content || images[0]
    media = (options.allImages && images.length ? images : [selected]).map(url => ({ url, type: 'image' }))
    if (!selected && node.type === 'input-image' && options.nodesMap && options.incoming) {
      // input-image has a single displayed image. Stop as soon as it is found;
      // flatMap eagerly traversed every branch, even after a usable result.
      for (const edge of options.incoming(node.id)) {
        const upstream = yield { node: options.nodesMap.get(edge.from), options: { ...options, allImages: false } }
        const first = upstream.find(item => item.type === 'image')
        if (first) { media = [first]; break }
      }
    }
  }
  const seen = new Map()
  return media.filter(item => {
    if (!item.url) return false
    if (!seen.has(item.type)) seen.set(item.type, new Set())
    const urls = seen.get(item.type)
    if (urls.has(item.url)) return false
    urls.add(item.url)
    return true
  })
}

// The optional mediaCache belongs to ONE immutable nodes/connections snapshot.
// Share it while deriving many outputs, then discard it when that graph changes.
export function readNodeMedia(node, options = {}, visited = new Set()) {
  const cache = options.mediaCache || new Map()
  const active = new Set(visited)
  const expansions = new Map()
  const stack = []
  let result = [], cycleVersion = 0
  const deliver = value => {
    if (stack.length) stack[stack.length - 1].input = value
    else result = value
  }
  const push = (source, settings) => {
    if (!source) { deliver([]); return }
    if (active.has(source.id)) { cycleVersion++; deliver([]); return }
    const mode = (settings.rawVideo ? 1 : 0) | (settings.allImages ? 2 : 0)
    const prior = cache.get(source)?.get(mode)
    if (prior) { deliver(prior); return }
    // A cyclic branch cannot safely share an empty result with another path.
    // Allow one revisit, then treat further expansion as a back-edge and keep
    // checking the next input. This bounds malformed imported graphs without
    // changing ordered input selection in valid DAGs (which use the cache).
    if (!expansions.has(source)) expansions.set(source, new Map())
    const counts = expansions.get(source)
    const count = counts.get(mode) || 0
    if (count >= 2) { cycleVersion++; deliver([]); return }
    counts.set(mode, count + 1)
    active.add(source.id)
    stack.push({ node: source, mode, iterator: resolveNodeMedia(source, settings), cycleVersion, input: undefined })
  }
  push(node, options)
  while (stack.length) {
    const frame = stack[stack.length - 1]
    const step = frame.iterator.next(frame.input)
    frame.input = undefined
    if (!step.done) { push(step.value.node, step.value.options); continue }
    stack.pop()
    active.delete(frame.node.id)
    // A back-edge result depends on the active path. Do not reuse it from a
    // different root, where the same node may have a valid non-cyclic input.
    if (frame.cycleVersion === cycleVersion) {
      if (!cache.has(frame.node)) cache.set(frame.node, new Map())
      cache.get(frame.node).set(frame.mode, step.value)
    }
    deliver(step.value)
  }
  return result
}

export function applyNodeMediaResult(node, task, url, imageUrls, index) {
  const images = imageUrls ? { imageUrls, selectedImageIndex: index } : {}
  if (task.shotId == null) return { ...node, content: url, ...(imageUrls ? { settings: { ...node.settings, ...images } } : {}) }
  return { ...node, settings: { ...node.settings, shots: node.settings.shots.map(shot => String(shot.id) === String(task.shotId) ? {
    ...shot, ...(task.operation === 'videoGenerate' ? { video_url: url } : { output_url: url, output_images: imageUrls || [url], selectedImageIndex: index }), status: 'done', errorMsg: '',
  } : shot) } }
}
