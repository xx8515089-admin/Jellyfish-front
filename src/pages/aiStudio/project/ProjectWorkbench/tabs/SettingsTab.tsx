import { PlaceholderTab } from './PlaceholderTab'
import { useBilingualText } from '../../../../../i18n/useBilingualText'

/** 展示项目设置入口，并根据当前语言切换说明文案。 */
export function SettingsTab() {
  const l = useBilingualText()
  return (
    <PlaceholderTab
      title={l('项目设置', 'Project settings')}
      description={l('项目基础信息、全局风格/种子、协作成员、删除项目等。', 'Manage project details, global style/seed, collaborators, deletion, and more.')}
    />
  )
}
