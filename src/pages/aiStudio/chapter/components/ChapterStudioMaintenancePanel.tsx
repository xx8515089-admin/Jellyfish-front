import { AppstoreOutlined, DeleteOutlined, EditOutlined, FileTextOutlined } from '@ant-design/icons'
import { useBilingualText } from '../../../../i18n/useBilingualText'
import { Button, Input, Space, Switch } from 'antd'

type ChapterStudioMaintenancePanelProps = {
  opsTitleDraft: string
  opsNoteDraft: string
  hideShot: boolean
  onChangeTitle: (value: string) => void
  onBlurTitle: () => void
  onChangeNote: (value: string) => void
  onBlurNote: () => void
  onToggleHidden: (value: boolean) => void
  onRequestDelete: () => void
}

export function ChapterStudioMaintenancePanel({
  opsTitleDraft,
  opsNoteDraft,
  hideShot,
  onChangeTitle,
  onBlurTitle,
  onChangeNote,
  onBlurNote,
  onToggleHidden,
  onRequestDelete,
}: ChapterStudioMaintenancePanelProps) {
  const l = useBilingualText()
  return (
    <div>
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
        {l('这里放的是次级维护动作，例如修改标题、补备注、隐藏或删除分镜。生成主线仍然建议优先使用“视频生成”“关键帧与参考图”“生成参数”这些模块。', 'These are secondary maintenance actions such as changing the title, adding notes, hiding, or deleting a storyboard. For generation, prioritize Video Generation, Keyframes & References, and Generation Parameters.')}
      </div>

      <div className="cs-group">
        <div className="cs-group-title">
          <EditOutlined /> {l('基本维护', 'Basic maintenance')}
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-gray-500 text-xs mb-1">{l('分镜标题', 'Storyboard title')}</div>
            <Input
              value={opsTitleDraft}
              placeholder={l('分镜标题…', 'Storyboard title…')}
              onChange={(e) => onChangeTitle(e.target.value)}
              onBlur={onBlurTitle}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{l('隐藏此分镜', 'Hide this storyboard')}</div>
              <div className="text-xs text-gray-500">{l('隐藏后将不参与预览整章与导出', 'Hidden storyboards are excluded from chapter preview and export')}</div>
            </div>
            <Switch checked={hideShot} onChange={onToggleHidden} />
          </div>
        </div>
      </div>

      <div className="cs-group">
        <div className="cs-group-title">
          <FileTextOutlined /> {l('维护备注', 'Maintenance notes')}
        </div>
        <Input.TextArea
          rows={3}
          value={opsNoteDraft}
          placeholder={l('备注…', 'Notes…')}
          onChange={(e) => onChangeNote(e.target.value)}
          onBlur={onBlurNote}
        />
      </div>

      <div className="cs-group">
        <div className="cs-group-title">
          <AppstoreOutlined /> {l('高风险操作', 'High-risk actions')}
        </div>
        <div className="text-xs text-gray-500 mb-3">{l('删除属于维护动作，不影响当前生成主线；如非必要，建议保留分镜并继续生成准备。', 'Deletion is a maintenance action and is separate from generation. Keep the storyboard and continue preparation unless deletion is necessary.')}</div>
        <Space wrap>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={onRequestDelete}
          >
            {l('删除', 'Delete')}
          </Button>
        </Space>
      </div>
    </div>
  )
}
