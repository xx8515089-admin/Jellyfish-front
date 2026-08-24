import type { ComponentType } from 'react'

export type TapnowAppProps = {
  workspaceId?: string
  workspaceName?: string
  language?: 'zh-CN' | 'en-US'
  onLanguageChange?: (language: 'zh-CN' | 'en-US') => void
  onWorkspaceChanged?: () => void
}

declare const TapnowApp: ComponentType<TapnowAppProps>

export default TapnowApp
