import type { ComponentType } from 'react'

export type TapnowAppProps = {
  workspaceId?: string
  workspaceName?: string
  onWorkspaceChanged?: () => void
}

declare const TapnowApp: ComponentType<TapnowAppProps>

export default TapnowApp
