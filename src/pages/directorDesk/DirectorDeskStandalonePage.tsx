import { uiText, useUiLanguage } from '../../i18n/uiText'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
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
import DirectorDeskCloudPanel from './DirectorDeskCloudPanel'
import type { DirectorDesk } from '../../services/studioDirectorDesks'
import { Modal } from 'antd'

interface DirectorDeskStandalonePageProps {
  embeddedHome?: boolean
}

export default function DirectorDeskStandalonePage({ embeddedHome = false }: DirectorDeskStandalonePageProps) {
  useUiLanguage()

  const navigate = useNavigate()
  const { projectId, chapterId, deskId } = useParams()
  const [searchParams] = useSearchParams()
  const styleParam = Number(searchParams.get('visualStyleId'))
  const initialVisualStyleId = Number.isSafeInteger(styleParam) && styleParam > 0 ? styleParam : null
  const hostRef = useRef<HTMLDivElement>(null)
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null)
  const [initialCloudPending, setInitialCloudPending] = useState(() => Boolean(searchParams.get('cloudDeskId') || searchParams.get('segmentId')))
  const [cloudDesk, setCloudDesk] = useState<DirectorDesk>()
  const [cloudLoad, setCloudLoad] = useState(0)
  const [cloudReady, setCloudReady] = useState(0)
  const [panelKey, setPanelKey] = useState(0)
  const dirtyRef = useRef(false)
  const handleDirtyChange = useCallback((value: boolean) => { dirtyRef.current = value }, [])
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
    if (dirtyRef.current) {
      Modal.confirm({ title: uiText("当前云工程有未保存修改"), content: '离开前请确认已保存需要的修改。', okText: uiText("离开"), cancelText: uiText("继续编辑"), onOk: leave })
      return
    }
    leave()
  }

  const leave = () => {
    const returnTo = searchParams.get('returnTo')
    if (returnTo?.startsWith('/') && !returnTo.startsWith('//')) { navigate(returnTo); return }
    if (projectId && chapterId) {
      navigate(`/projects/${projectId}/chapters/${chapterId}/studio`)
      return
    }
    setCloudDesk(undefined)
    setCloudReady(0)
    setPanelKey((value) => value + 1)
    dirtyRef.current = false
    navigate('/director-desk')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: embeddedHome ? '100%' : '100dvh', minHeight: 0 }}>
      <DirectorDeskCloudPanel
        key={panelKey}
        editorRoot={hostRef}
        initialSegmentId={searchParams.get('segmentId') || undefined}
        initialVisualStyleId={initialVisualStyleId}
        initialSegmentLabel={searchParams.get('segmentLabel') || undefined}
        cloudReady={cloudReady}
        onInitialLoadSettled={() => setInitialCloudPending(false)}
        onDirtyChange={handleDirtyChange}
        onOpen={(detail) => { setInitialCloudPending(false); setCloudDesk(detail); setCloudLoad((value) => value + 1) }}
      />
      <div
        ref={hostRef}
        className="director-desk-host"
        aria-label={uiText("3D导演台")}
        style={{
          display: 'block',
          width: '100%',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          background: '#090909',
        }}
      >
        {mountNode ? createPortal(
          initialCloudPending ? <div role="status" style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#aaa' }}>{uiText("正在加载导演台工程…")}</div> : <DirectorDeskApp
            key={cloudDesk ? `cloud-${cloudLoad}` : initialInstanceId ?? 'standalone'}
            cloudDesk={cloudDesk}
            onCloudReady={() => setCloudReady((value) => value + 1)}
            initialInstanceId={cloudDesk?.instanceId ?? initialInstanceId}
            initialInstanceName={cloudDesk?.name ?? (projectId && chapterId ? '当前章节导演台' : undefined)}
            onBackHome={handleClose}
            onClose={handleClose}
            onOpenDesk={embeddedHome ? handleOpenDesk : undefined}
          />,
          mountNode,
        ) : null}
      </div>
      {!initialCloudPending && !cloudDesk && <DirectorDeskCaptureBridge
        chapterId={chapterId}
        initialShotId={searchParams.get('shotId') || undefined}
        projectId={projectId}
      />}
    </div>
  )
}
