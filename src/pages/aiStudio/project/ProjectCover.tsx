import { useEffect, useState } from 'react'
import { StudioCanvases } from '../../../services/studioCanvases'
import { Image as ImageIcon } from 'lucide-react'
import type { StudioScriptImportListItem } from '../../../services/studioScripts'
import { resolveAssetUrl } from '../assets/utils'

type ProjectCoverProps = Pick<StudioScriptImportListItem, 'coverUrl' | 'coverType'> & {
  canvasId?: string
  coverAssetId?: number | null
  coverContentUrl?: string | null
  placeholder: string
}

/** Parent keys this component by media identity so a replacement retries after an error. */
export default function ProjectCover({ coverUrl, coverType, canvasId, coverAssetId, coverContentUrl, placeholder }: ProjectCoverProps) {
  const [failed, setFailed] = useState(false)
  const directUrl = resolveAssetUrl(coverUrl)
  const [useProtected, setUseProtected] = useState(!directUrl)
  const [objectUrl, setObjectUrl] = useState<string>()
  const canReadProtected = Boolean(canvasId && coverAssetId && coverContentUrl?.trim())
  const validType = coverType === 'image' || coverType === 'video'
  const src = useProtected ? objectUrl : directUrl

  useEffect(() => {
    if (!useProtected || !canReadProtected || !validType || !canvasId || !coverAssetId) return
    const controller = new AbortController()
    let active = true
    let ownedUrl: string | undefined
    // Reconstruct the documented content endpoint from IDs using the existing loader.
    // Authorization is sent only to our backend, never to an arbitrary media URL.
    void StudioCanvases.content(canvasId, coverAssetId, false, controller.signal)
      .then((blob) => {
        if (!active) return
        ownedUrl = URL.createObjectURL(blob)
        setObjectUrl(ownedUrl)
      })
      .catch(() => { if (active) setFailed(true) })
    return () => {
      active = false
      controller.abort()
      if (ownedUrl) URL.revokeObjectURL(ownedUrl)
    }
  }, [useProtected, canReadProtected, validType, canvasId, coverAssetId])

  const handleError = () => {
    if (!useProtected && canReadProtected) setUseProtected(true)
    else setFailed(true)
  }

  if (failed || !src || (coverType !== 'image' && coverType !== 'video')) {
    return (
      <div className="project-lobby-card__placeholder" aria-hidden="true">
        <ImageIcon size={28} strokeWidth={1.6} />
        <span>{placeholder}</span>
      </div>
    )
  }

  if (coverType === 'video') {
    return (
      <video
        className="project-lobby-card__image"
        src={src}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        onMouseEnter={(event) => { void event.currentTarget.play().catch(() => undefined) }}
        onMouseLeave={(event) => event.currentTarget.pause()}
        onError={handleError}
      />
    )
  }

  return (
    <img
      className="project-lobby-card__image"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={handleError}
    />
  )
}
