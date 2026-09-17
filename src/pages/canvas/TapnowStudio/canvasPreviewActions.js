import { readNodeMedia } from './canvasNodeOutputs.js'

export function previewMedia(node) {
  const media = readNodeMedia(node)[0]
  if (!media) throw new Error('当前预览没有可用素材')
  return media
}

export function previewLink(node, session, location) {
  const media = previewMedia(node)
  const asset = session?.media.get(media.url)
  if (asset?.assetId != null) {
    const url = new URL('/canvas/' + encodeURIComponent(session.document.canvasId), location)
    url.searchParams.set('previewAsset', String(asset.assetId))
    url.searchParams.set('previewMedia', media.type)
    return { url: url.href, authenticated: true }
  }
  if (/^https?:\/\//i.test(media.url)) return { url: media.url, authenticated: false }
  throw new Error('此素材只有本地临时地址，暂时无法复制可重新打开的链接；可先保存到云端或下载素材')
}

export async function writeClipboardText(text, navigator, document) {
  try {
    if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(text); return }
  } catch { /* HTTP deployments and denied clipboard permissions can use native copy. */ }
  const active = document.activeElement
  const input = document.createElement('textarea')
  input.value = text
  input.readOnly = true
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  input.addEventListener('copy', event => event.stopPropagation())
  document.body.appendChild(input)
  try {
    input.focus(); input.select()
    if (!document.execCommand('copy')) throw new Error('复制失败，请允许浏览器访问剪贴板后重试')
  } finally { input.remove(); active?.focus?.({ preventScroll: true }) }
}

export function insertPreviewMedia(node, { addNode, setSelectedNodeId, setSelectedNodeIds, setView, viewport, zoom }) {
  const media = previewMedia(node)
  const isVideo = media.type === 'video'
  const width = isVideo ? 580 : 320
  const center = { x: node.x + node.width + 100 + width / 2, y: node.y + node.height / 2 }
  const created = addNode(isVideo ? 'video-input' : 'input-image', center.x, center.y, null, media.url, isVideo ? undefined : node.dimensions)
  if (!created?.id) throw new Error('未能创建素材节点，请重试')
  setSelectedNodeId(created.id)
  setSelectedNodeIds(new Set([created.id]))
  if (viewport?.width > 0 && viewport?.height > 0) {
    const nextZoom = Math.max(0.1, Math.min(zoom || 1, (viewport.width - 80) / created.width, (viewport.height - 80) / created.height))
    setView({ x: viewport.width / 2 - (created.x + created.width / 2) * nextZoom, y: viewport.height / 2 - (created.y + created.height / 2) * nextZoom, zoom: nextZoom })
  }
  return created
}
