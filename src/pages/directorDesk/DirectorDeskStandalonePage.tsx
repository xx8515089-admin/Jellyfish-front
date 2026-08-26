import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import DirectorDeskCaptureBridge from './DirectorDeskCaptureBridge'
import DirectorDeskApp from './runtime/DirectorDeskApp'
import {
  applyDirectorDeskTheme,
  registerDirectorDeskDom,
  unregisterDirectorDeskDom,
} from './runtime/editor/io/directorDeskDom'
import directorDeskStyles from './runtime/styles/index.css?inline'

interface DirectorDeskStandalonePageProps {
  embeddedHome?: boolean
}

export default function DirectorDeskStandalonePage({ embeddedHome = false }: DirectorDeskStandalonePageProps) {
  const navigate = useNavigate()
  const { projectId, chapterId, deskId } = useParams()
  const [searchParams] = useSearchParams()
  const hostRef = useRef<HTMLDivElement>(null)
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null)
  const initialInstanceId = projectId && chapterId
    ? `project:${projectId}:chapter:${chapterId}`
    : deskId

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    const root = document.createElement('div')

    style.textContent = directorDeskStyles
    root.className = embeddedHome
      ? 'director-desk-root director-desk-root--embedded'
      : 'director-desk-root'
    shadowRoot.replaceChildren(style, root)
    registerDirectorDeskDom(host, shadowRoot)
    applyDirectorDeskTheme('dark')
    setMountNode(root)

    return () => {
      unregisterDirectorDeskDom(host)
      shadowRoot.replaceChildren()
    }
  }, [embeddedHome])

  const handleOpenDesk = (id: string) => {
    navigate(`/director-desk/workspace/${encodeURIComponent(id)}`)
  }

  const handleClose = () => {
    if (projectId && chapterId) {
      navigate(`/projects/${projectId}/chapters/${chapterId}/studio`)
      return
    }
    navigate('/director-desk')
  }

  return (
    <>
      <div
        ref={hostRef}
        className="director-desk-host"
        aria-label="3D导演台"
        style={{
          display: 'block',
          width: '100%',
          height: embeddedHome ? '100%' : '100dvh',
          minHeight: 0,
          overflow: 'hidden',
          background: '#090909',
        }}
      >
        {mountNode ? createPortal(
          <DirectorDeskApp
            key={initialInstanceId ?? 'standalone'}
            initialInstanceId={initialInstanceId}
            initialInstanceName={projectId && chapterId ? '当前章节导演台' : undefined}
            onClose={handleClose}
            onOpenDesk={embeddedHome ? handleOpenDesk : undefined}
          />,
          mountNode,
        ) : null}
      </div>
      <DirectorDeskCaptureBridge
        chapterId={chapterId}
        initialShotId={searchParams.get('shotId') || undefined}
        projectId={projectId}
      />
    </>
  )
}
