import type { ComponentType } from 'react'

export type TapnowAppProps = {
  cloudDocument?: import('../../../services/studioCanvases').CanvasDocument
  cloudModels?: import('../../../services/studioModels').StudioGenerationModel[]
  cloudCapabilities?: import('../../../services/studioCanvasV3Types').CanvasCapabilities
  cloudTextModels?: import('../../../services/studioCanvasV3Types').CanvasTextModel[]
  onRefreshCloudModels?: () => Promise<void>
  workspaceId?: string
  workspaceName?: string
  language?: 'zh-CN' | 'en-US'
  onLanguageChange?: (language: 'zh-CN' | 'en-US') => void
  onWorkspaceChanged?: () => void
}

declare const TapnowApp: ComponentType<TapnowAppProps>

export default TapnowApp
