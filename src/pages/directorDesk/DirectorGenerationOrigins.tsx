import { uiText, useUiLanguage } from '../../i18n/uiText'
import { useState } from 'react'
import { Alert, Button, List, Modal, message } from 'antd'
import { StudioDirectorDesks as api, type DirectorOrigin } from '../../services/studioDirectorDesks'
import { getApiErrorMessage } from '../../services/apiErrors'

export default function DirectorGenerationOrigins({ generationId, generationType, segmentId, segmentLabel, visualStyleId }: {
  generationId: string | number; generationType: 'image' | 'video'; segmentId: string; segmentLabel?: string; visualStyleId?: number | null
}) {
  useUiLanguage()

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<DirectorOrigin[]>([])
  return <>
    <Button loading={busy} onClick={async () => {
      setBusy(true)
      try { setItems((await api.generationOrigins(generationType, generationId)).origins); setOpen(true) }
      catch (error) { message.error(getApiErrorMessage(error)) }
      finally { setBusy(false) }
    }}>{uiText("查看导演台来源")}</Button>
    <Modal title={uiText("此生成记录的导演台来源")} open={open} onCancel={() => setOpen(false)} footer={null}>
      <Alert type="info" message={uiText("查看生成时使用的准确修订；继续编辑可在导演台复制该修订。")} />
      <List dataSource={items} locale={{ emptyText: uiText("此生成记录未使用导演台产物") }} renderItem={(item) => {
        const params = new URLSearchParams({ cloudDeskId: String(item.directorDeskId), revisionNo: String(item.directorRevisionNo), segmentId, returnTo: `${window.location.pathname}${window.location.search}` })
        params.set('visualStyleId', visualStyleId == null ? 'none' : String(visualStyleId))
        if (segmentLabel) params.set('segmentLabel', segmentLabel)
        return <List.Item><a href={`/director-desk/workspace/source-${item.directorDeskId}?${params}`} target="_blank" rel="noreferrer">{item.name} {uiText("· 修订") + " "}{item.directorRevisionNo}{item.deleted ? uiText("（已删除，仍可查看历史）") : ''}</a></List.Item>
      }} />
    </Modal>
  </>
}
