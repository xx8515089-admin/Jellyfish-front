import { Alert, Modal, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { StudioCanvases } from '../../../services/studioCanvases'

// This is an authenticated app link, never a public or token-bearing asset URL.
export default function CanvasLinkedAssetPreview({ canvasId }: { canvasId: string }) {
  const [params, setParams] = useSearchParams()
  const assetId = params.get('previewAsset') || ''
  const hint = params.get('previewMedia') || ''
  const [media, setMedia] = useState<{ url: string; type: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    let url = ''
    setMedia(null); setError('')
    if (!assetId) { setLoading(false); return }
    setLoading(true)
    void StudioCanvases.content(canvasId, assetId).then(blob => {
      if (!active) return
      const mimeType = blob.type.split('/')[0]
      const type = ['image', 'video', 'audio'].includes(mimeType) ? mimeType : hint
      if (!['image', 'video', 'audio'].includes(type)) throw new Error('此素材不支持在页面中预览')
      url = URL.createObjectURL(blob)
      setMedia({ url, type })
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : '素材读取失败，请确认当前账号拥有访问权限')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [canvasId, assetId, hint])
  const close = () => setParams(previous => {
    const next = new URLSearchParams(previous)
    next.delete('previewAsset'); next.delete('previewMedia')
    return next
  }, { replace: true })
  return <Modal title="素材预览" open={!!assetId} onCancel={close} footer={null} width={800} destroyOnClose>
    {loading && <Spin />}
    {error && <Alert type="error" showIcon message={error} description="请使用有权限的账号打开；素材也可能已被移除。" />}
    {media && (media.type === 'video'
      ? <video src={media.url} controls playsInline style={{ width: '100%', maxHeight: '70vh' }} />
      : media.type === 'audio' ? <audio src={media.url} controls />
        : <img src={media.url} alt="预览素材" style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', margin: 'auto' }} />)}
  </Modal>
}
