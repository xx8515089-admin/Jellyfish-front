import { memo, useEffect, useRef, useState } from 'react'
import { Button, Image, type ImageProps } from 'antd'
import { loadDirectorImage } from './directorImageSource'

type Props = Omit<Pick<ImageProps, 'src' | 'alt' | 'width' | 'height' | 'style' | 'className' | 'preview'>, 'src'> & {
  src?: string | null
  onRetry?: () => void | Promise<void>
}

function DeferredImage({ src, onRetry, ...imageProps }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<string>()
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [retrying, setRetrying] = useState(false)
  useEffect(() => {
    const node = host.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '120px', threshold: 0 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible || !src?.trim()) return
    const controller = new AbortController()
    let release: (() => void) | undefined
    setPreviewSrc(undefined)
    setFailed(false)
    setError('')
    void loadDirectorImage(src, controller.signal).then((image) => {
      if (controller.signal.aborted) { image.release(); return }
      release = image.release
      setPreviewSrc(image.url)
    }).catch((reason) => { if (!controller.signal.aborted) { setFailed(true); setError(reason instanceof Error ? reason.message : '图片请求失败') } })
    return () => { controller.abort(); release?.() }
  }, [src, visible, retry])
  const unavailable = failed || !src?.trim()
  return <div ref={host} style={{ width: imageProps.width ?? '100%', height: imageProps.height, minHeight: imageProps.height == null ? 120 : undefined, overflow: 'hidden', flexShrink: 0 }}>
    {previewSrc && !failed ? <Image {...imageProps} src={previewSrc} loading="eager" decoding="async" placeholder={<div style={{ width: imageProps.width ?? '100%', height: imageProps.height ?? 120, display: 'grid', placeItems: 'center', background: '#23262b', color: '#89949e', fontSize: 11 }}>图片加载中…</div>} onError={() => { setFailed(true); setError('图片下载或解码失败，请重试或打开原图检查') }} /> : <div role="group" aria-label={imageProps.alt || '图片预览'} style={{ width: '100%', height: '100%', minHeight: imageProps.height == null ? 120 : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(128,146,165,.08)', color: '#89949e', fontSize: 11 }}>
      <span title={error || undefined}>{unavailable ? '图片暂不可用' : '图片加载中…'}</span>
      {failed && error && <span style={{ fontSize: 10, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={error}>{error}</span>}
      {failed && previewSrc && <a href={previewSrc} target="_blank" rel="noreferrer">打开原图</a>}
      {unavailable && <Button size="small" type="link" loading={retrying} aria-label={`重试加载${imageProps.alt || '图片'}`} onClick={async () => {
        setRetrying(true)
        try { await onRetry?.(); setFailed(false); setRetry((value) => value + 1) }
        catch (reason) { setFailed(true); setError(reason instanceof Error ? reason.message : '重试失败') }
        finally { setRetrying(false) }
      }}>重试</Button>}
    </div>}
  </div>
}

// Keep network and decode work outside offscreen rows, including authenticated Blob requests.
export default memo(function LazyDirectorImage(props: Props) {
  return <DeferredImage key={props.src ?? 'missing'} {...props} />
})
