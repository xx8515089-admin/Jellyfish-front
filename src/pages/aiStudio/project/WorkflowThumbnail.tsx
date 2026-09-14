import { memo, useEffect, useRef, useState } from 'react'
import { workflowMediaRead } from './workflowMediaTransport'

/** Fetch only visible authenticated JPEG previews; never decode a full video for a thumbnail. */
export default memo(function WorkflowThumbnail({ mediaType, id, ready }: { mediaType: 'image' | 'video'; id: string; ready: boolean }) {
  const host = useRef<HTMLSpanElement>(null)
  const [url, setUrl] = useState('')
  useEffect(() => {
    setUrl('')
    if (!ready || !host.current) return
    let active = true
    let objectUrl = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    let request: AbortController | undefined
    const load = async () => {
      request = new AbortController()
      try {
        const blob = await workflowMediaRead<Blob>(`/api/v1/studio/storyboards/media/thumbnail?mediaType=${mediaType}&generationRecordId=${encodeURIComponent(id)}`, request.signal, true)
        if (!active) return
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl)
      } catch (error) {
        if (!active) return
        const delay = (error as { retryAfter?: number }).retryAfter
        if (delay) timer = setTimeout(() => void load(), delay * 1000)
      }
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { observer.disconnect(); void load() }
    })
    observer.observe(host.current)
    return () => { active = false; observer.disconnect(); clearTimeout(timer); request?.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [mediaType, id, ready])
  return <span ref={host} style={{ display: 'block', width: '100%', height: '100%', background: 'var(--jf-panel-2, #202023)' }}>
    {url && <img src={url} alt="" />}
  </span>
})
