import { Button, Spin } from 'antd'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import type React from 'react'
import { lazy, Suspense, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import appI18n, { type SupportedLanguage } from '../../i18n'
import { useBilingualText } from '../../i18n/useBilingualText'
import { useAppStore } from '../../store/useAppStore'
import { getCanvasWorkspace, touchCanvasWorkspace } from './canvasWorkspaces'
import './CanvasStudioPage.css'

const TapnowApp = lazy(() => import('./TapnowStudio/App.jsx'))

const CanvasStudioPage: React.FC = () => {
  const l = useBilingualText()
  const navigate = useNavigate()
  const { canvasId = '' } = useParams()
  const language = useAppStore((state) => state.language)
  const setLanguage = useAppStore((state) => state.setLanguage)
  const workspace = useMemo(() => getCanvasWorkspace(canvasId), [canvasId])
  const handleWorkspaceChanged = useCallback(() => {
    touchCanvasWorkspace(canvasId)
  }, [canvasId])
  const handleCanvasLanguageChange = useCallback((nextLanguage: SupportedLanguage) => {
    setLanguage(nextLanguage)
    void appI18n.changeLanguage(nextLanguage)
  }, [setLanguage])

  if (!workspace) {
    return (
      <main className="canvas-studio-error">
        <AlertCircle className="canvas-studio-error__icon" size={32} strokeWidth={1.7} />
        <h1>{l('\u753b\u5e03\u4e0d\u5b58\u5728', 'Canvas not found')}</h1>
        <p>{l('\u8be5\u753b\u5e03\u53ef\u80fd\u5df2\u88ab\u5220\u9664\uff0c\u8fd4\u56de\u753b\u5e03\u5217\u8868\u91cd\u65b0\u9009\u62e9\u3002', 'This canvas may have been deleted. Return to the canvas list to continue.')}</p>
        <Button type="primary" onClick={() => navigate('/canvases')}>
          {l('\u8fd4\u56de\u753b\u5e03\u5217\u8868', 'Back to canvases')}
        </Button>
      </main>
    )
  }

  return (
    <div className="canvas-studio-page">
      <header className="canvas-studio-page__header">
        <Button
          type="text"
          className="canvas-studio-page__back"
          icon={<ArrowLeft size={17} strokeWidth={1.75} />}
          onClick={() => navigate('/canvases')}
        >
          {l('\u753b\u5e03\u5217\u8868', 'Canvases')}
        </Button>
        <div className="canvas-studio-page__title" title={workspace.name}>{workspace.name}</div>
        <span className="canvas-studio-page__status">
          {l('\u81ea\u52a8\u4fdd\u5b58', 'Autosave')}
        </span>
      </header>
      <div className="canvas-studio-page__viewport">
        <Suspense
          fallback={(
            <div className="canvas-studio-page__loading" aria-live="polite">
              <Spin size="large" />
              <span>{l('\u6b63\u5728\u6253\u5f00\u753b\u5e03...', 'Opening canvas...')}</span>
            </div>
          )}
        >
          <TapnowApp
            key={canvasId}
            workspaceId={canvasId}
            workspaceName={workspace.name}
            language={language}
            onLanguageChange={handleCanvasLanguageChange}
            onWorkspaceChanged={handleWorkspaceChanged}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default CanvasStudioPage
