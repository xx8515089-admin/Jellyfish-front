import { previewSourceMediaType } from './canvasMediaPreview.js'

// Match preview synchronization's first supported input without resolving media
// or walking upstream. The caller already owns the canvas's connection index.
export function getPreviewConnectionStatus(previewId, { nodesMap, incoming, outgoing }) {
  let hasUnsupportedInput = false
  for (const edge of incoming(previewId)) {
    const source = nodesMap.get(edge.from)
    if (previewSourceMediaType(source)) return { kind: 'incoming', source }
    if (source) hasUnsupportedInput = true
  }
  if (hasUnsupportedInput) return { kind: 'unsupported' }
  if (outgoing(previewId).some(edge => nodesMap.has(edge.to))) return { kind: 'outgoing' }
  return { kind: 'disconnected' }
}

const sourceLabels = {
  'gen-image': 'AI 绘图',
  'gen-video': 'AI 视频',
  'generate-character-image': '生成角色图片',
  'generate-scene-image': '生成场景图片',
  'generate-character-video': '生成角色视频',
  'generate-scene-video': '生成场景视频',
  'input-image': '图片输入',
  'video-input': '视频输入 / 关键帧整理',
  'storyboard-node': '分镜节点',
}

export function previewSourceLabel(source, t) {
  const typeLabel = t(sourceLabels[source.type])
  const name = String(source.title || (source.type === 'storyboard-node' ? source.settings?.projectTitle : '') || '').trim()
  return name ? `${name} · ${typeLabel}` : typeLabel
}
