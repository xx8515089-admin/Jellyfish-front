import type { ComponentType } from 'react'

export type TapnowAppProps = {
  cloudDocument?: import('../../../services/studioCanvases').CanvasDocument
  cloudModels?: import('../../../services/studioModels').StudioGenerationModel[]
  workspaceId?: string
  workspaceName?: string
  language?: 'zh-CN' | 'en-US'
  onLanguageChange?: (language: 'zh-CN' | 'en-US') => void
  onWorkspaceChanged?: () => void
}

declare const TapnowApp: ComponentType<TapnowAppProps>

export default TapnowApp
