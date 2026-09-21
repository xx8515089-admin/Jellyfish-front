import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Modal, Spin } from 'antd'
import { Eye, FileText, Image as ImageIcon, Music2, Play, X } from 'lucide-react'
import { StudioCanvases } from '../../../../services/studioCanvases'

/** Preview owned assets through authenticated content, or resolve media already on the canvas. */
export async function readChatAttachment(session, asset, file) {
  if (asset?.assetId != null) {
    if (asset.canvasId != null && String(asset.canvasId) !== String(session.document.canvasId)) throw new Error('附件不属于当前画布')
    const blob = asset.previewFile || await StudioCanvases.content(session.document.canvasId, asset.assetId)
    return { url: URL.createObjectURL(blob), mimeType: /^(image|video|audio)\//.test(blob.type) ? blob.type : asset.mimeType || blob.type || '', owned: true }
  }
  if (!file?.content) throw new Error('附件内容不可用')
  const url = await session.resolveMedia(file.content)
  if (typeof url !== 'string' || !/^(blob:|data:(image|video|audio)\/|https?:\/\/)/i.test(url)) throw new Error('附件暂时无法预览')
  return { url, mimeType: file.type || (file.isImage ? 'image/png' : file.isVideo ? 'video/mp4' : file.isAudio ? 'audio/mpeg' : ''), owned: false }
}

/** Compact attachment card shared by the composer, queued files and persisted messages. */
export default function CanvasChatAttachment({ session, asset, file, queued = false, disabled = false, onAttach, onRemove }) {
  useUiLanguage()

  const [media, setMedia] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const card = useRef(null), controller = useRef(null)
  const mimeType = media?.mimeType || asset?.mimeType || file?.type || (file?.isImage ? 'image/png' : file?.isVideo ? 'video/mp4' : file?.isAudio ? 'audio/mpeg' : '')
  const kind = mimeType.split('/')[0]
  const name = asset?.name || file?.name || `附件 ${asset?.assetId ?? ''}`
  const Icon = kind === 'video' ? Play : kind === 'audio' ? Music2 : kind === 'image' ? ImageIcon : FileText

  useEffect(() => {
    let alive = true, pending = null, resolved = null
    setMedia(null); setError(''); setOpen(false)
    // Own only URLs created here; queued canvas URLs belong to the editor.
    const load = async (force = false) => {
      if (pending) return pending
      if (force && resolved) {
        if (resolved.owned) URL.revokeObjectURL(resolved.url)
        resolved = null; setMedia(null)
      }
      if (resolved) return resolved
      setBusy(true); setError('')
      pending = readChatAttachment(session, asset, file).then(result => {
        if (!alive) { if (result.owned) URL.revokeObjectURL(result.url); return null }
        resolved = result; setMedia(result)
        return result
      }).catch(reason => { if (alive) setError(reason.message || '附件加载失败'); return null })
        .finally(() => { pending = null; if (alive) setBusy(false) })
      return pending
    }
    controller.current = load
    let observer
    // Load thumbnails only when their cards are visible; videos remain paused.
    const initialKind = (asset?.mimeType || file?.type || '').split('/')[0]
    if (!initialKind || initialKind === 'image' || initialKind === 'video') {
      if (typeof IntersectionObserver !== 'undefined' && card.current) {
        observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load() } }, { rootMargin: '80px' })
        observer.observe(card.current)
      } else void load()
    }
    return () => { alive = false; observer?.disconnect(); controller.current = null; if (resolved?.owned) URL.revokeObjectURL(resolved.url) }
  }, [session, asset?.assetId, asset?.canvasId, asset?.mimeType, file?.content, file?.type])

  return <div className="canvas-v4-attachment" ref={card}>
    <button type="button" className="canvas-v4-attachment__preview" aria-label={uiText("预览 {0}", name)} onClick={() => { setOpen(true); void controller.current?.(!!error) }}>
      <span className={`canvas-v4-attachment__thumbnail canvas-v4-attachment__thumbnail--${kind || 'file'}`}>
        {busy ? <Spin size="small" /> : media && kind === 'image' ? <img src={media.url} alt={name} loading="lazy" onError={() => setError('图片加载失败')} /> : media && kind === 'video' ? <><video src={media.url} muted playsInline preload="metadata" /><Play size={16} className="canvas-v4-attachment__play" /></> : <Icon size={21} strokeWidth={1.6} />}
      </span>
      <span className="canvas-v4-attachment__info"><strong title={name}>{name}</strong><small>{queued ? uiText("待关联") : ({ image: '图片', video: '视频', audio: '音频' }[kind] || uiText("画布附件"))}{asset?.sizeBytes != null && ` · ${(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB`}<span><Eye size={11} />{error ? uiText("点击重试预览") : uiText("点击预览")}</span></small></span>
    </button>
    {onAttach && <Button type="text" size="small" className="canvas-v4-chat__attach-action" disabled={disabled} onClick={onAttach}>{uiText("关联")}</Button>}
    {onRemove && <Button type="text" size="small" aria-label={uiText("移除附件 {0}", name)} disabled={disabled} icon={<X size={14} />} onClick={onRemove} />}
    <Modal title={name} open={open} onCancel={() => setOpen(false)} footer={null} width={820} destroyOnClose className="canvas-v4-attachment-modal">
      {open && <div className="canvas-v4-attachment__viewer">
        {busy && <Spin tip={uiText("正在加载附件…")}><div style={{ height: 100 }} /></Spin>}
        {error && <Alert type="error" message={error} action={<Button size="small" disabled={busy} onClick={() => void controller.current?.(true)}>{uiText("重试")}</Button>} />}
        {media && kind === 'image' && <img src={media.url} alt={name} onError={() => setError('图片加载失败')} />}
        {media && kind === 'video' && <video src={media.url} controls playsInline preload="metadata" onError={() => setError('视频无法播放，请检查文件格式')} />}
        {media && kind === 'audio' && <div className="canvas-v4-attachment__audio"><Music2 size={40} /><audio src={media.url} controls preload="metadata" onError={() => setError('音频无法播放，请检查文件格式')} /></div>}
        {media && !['image', 'video', 'audio'].includes(kind) && <Alert type="info" message={uiText("此附件格式暂不支持预览")} />}
      </div>}
    </Modal>
  </div>
}
