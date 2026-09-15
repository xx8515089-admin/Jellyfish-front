import { useEffect, useState } from 'react'
import { Alert, Button, Modal, Spin } from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'
import { loadDirectorMedia } from './directorImageSource'

type Props = { src?: string | null; alt?: string; width?: number | string; height?: number; mediaType?: 'video' | 'audio'; onRetry?: () => void | Promise<void> }

export default function LazyDirectorVideo({ src, alt, width = 96, height = 72, mediaType = 'video', onRetry }: Props) {
  const [open, setOpen] = useState(false)
  const [resource, setResource] = useState<{ source: string; url: string }>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open) return
    setError('')
    setResource(undefined)
    if (!src) { setError('媒体地址暂不可用'); return }
    const controller = new AbortController()
    let release: (() => void) | undefined
    void loadDirectorMedia(src, controller.signal, mediaType).then((media) => {
      if (controller.signal.aborted) { media.release(); return }
      release = media.release
      setResource({ source: src, url: media.url })
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '媒体加载失败') })
    return () => { controller.abort(); release?.() }
  }, [open, src, mediaType, retry])
  const label = mediaType === 'video' ? '视频' : '音频'
  return <>
    <Button aria-label={`播放${alt || label}`} style={{ width, height, flexShrink: 0, whiteSpace: 'normal' }} onClick={() => setOpen(true)}><PlayCircleOutlined />{`播放${label}`}</Button>
    <Modal open={open} title={alt || `参考${label}`} width={800} centered destroyOnClose footer={null} onCancel={() => setOpen(false)}>
      {error ? <Alert type="error" message={error} action={<Button onClick={async () => {
        try { await onRetry?.(); setRetry((value) => value + 1) } catch (reason) { setError(reason instanceof Error ? reason.message : '刷新失败') }
      }}>重试</Button>} /> : open && resource?.source === src && resource ? (mediaType === 'video'
        ? <video key={resource.url} src={resource.url} controls autoPlay playsInline preload="metadata" style={{ width: '100%', maxHeight: '70vh' }} onError={() => setError('视频无法播放，请检查文件格式或重试')} />
        : <audio key={resource.url} src={resource.url} controls autoPlay preload="metadata" style={{ width: '100%' }} onError={() => setError('音频无法播放，请重试')} />)
        : <div style={{ padding: 40, textAlign: 'center' }}><Spin /><p>正在加载{label}…</p></div>}
    </Modal>
  </>
}
