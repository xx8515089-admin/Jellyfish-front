import { useNavigate, useParams } from 'react-router-dom'
import { PlaceholderTab } from './PlaceholderTab'
import { getProjectEditorPath } from '../routes'
import { useBilingualText } from '../../../../../i18n/useBilingualText'

/** 展示后期剪辑入口，并根据当前语言切换说明文案。 */
export function EditTab() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const l = useBilingualText()
  return (
    <PlaceholderTab
      title={l('后期剪辑', 'Post-production')}
      description={l('时间线编辑器，或从可剪辑章节列表进入。', 'Open the timeline editor or start from a chapter ready for editing.')}
      actionLabel={l('进入后期剪辑', 'Open post-production')}
      onAction={() => projectId && navigate(getProjectEditorPath(projectId))}
    />
  )
}
