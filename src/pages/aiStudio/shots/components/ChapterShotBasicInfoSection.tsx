import { Button, Input, InputNumber, Select, Tag } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import type { ActionBeatPhaseRead, CameraAngle, CameraMovement, CameraShotType } from '../../../../services/generated'
import { useBilingualText } from '../../../../i18n/useBilingualText'

const CAMERA_SHOT_OPTIONS: Array<{ value: CameraShotType; label: string; labelEn: string }> = [
  { value: 'ECU', label: '大特写', labelEn: 'Extreme close-up' },
  { value: 'CU', label: '特写', labelEn: 'Close-up' },
  { value: 'MCU', label: '中近景', labelEn: 'Medium close-up' },
  { value: 'MS', label: '中景', labelEn: 'Medium shot' },
  { value: 'MLS', label: '中远景', labelEn: 'Medium long shot' },
  { value: 'LS', label: '远景', labelEn: 'Long shot' },
  { value: 'ELS', label: '大远景', labelEn: 'Extreme long shot' },
]

const CAMERA_ANGLE_OPTIONS: Array<{ value: CameraAngle; label: string; labelEn: string }> = [
  { value: 'EYE_LEVEL', label: '平视', labelEn: 'Eye level' },
  { value: 'HIGH_ANGLE', label: '高角度', labelEn: 'High angle' },
  { value: 'LOW_ANGLE', label: '低角度', labelEn: 'Low angle' },
  { value: 'BIRD_EYE', label: '鸟瞰', labelEn: 'Birds-eye view' },
  { value: 'DUTCH', label: '荷兰式', labelEn: 'Dutch angle' },
  { value: 'OVER_SHOULDER', label: '过肩', labelEn: 'Over-the-shoulder' },
]

const CAMERA_MOVEMENT_OPTIONS: Array<{ value: CameraMovement; label: string; labelEn: string }> = [
  { value: 'STATIC', label: '固定镜头', labelEn: 'Static' },
  { value: 'PAN', label: '平移', labelEn: 'Pan' },
  { value: 'TILT', label: '俯仰', labelEn: 'Tilt' },
  { value: 'DOLLY_IN', label: '推近', labelEn: 'Dolly in' },
  { value: 'DOLLY_OUT', label: '拉远', labelEn: 'Dolly out' },
  { value: 'TRACK', label: '跟拍', labelEn: 'Tracking' },
  { value: 'CRANE', label: '摇臂', labelEn: 'Crane' },
  { value: 'HANDHELD', label: '手持', labelEn: 'Handheld' },
  { value: 'STEADICAM', label: '稳定器', labelEn: 'Steadicam' },
  { value: 'ZOOM_IN', label: '变焦推近', labelEn: 'Zoom in' },
  { value: 'ZOOM_OUT', label: '变焦拉远', labelEn: 'Zoom out' },
]

type ShotSemanticDraft = {
  camera_shot?: CameraShotType
  angle?: CameraAngle
  movement?: CameraMovement
  duration?: number
  action_beats?: Array<string>
}

type ChapterShotBasicInfoSectionProps = {
  title: string
  scriptExcerpt: string
  saving: boolean
  semanticSaving: boolean
  semantic: ShotSemanticDraft
  actionBeatPhases?: Array<ActionBeatPhaseRead>
  onTitleChange: (value: string) => void
  onScriptExcerptChange: (value: string) => void
  onSemanticChange: (patch: ShotSemanticDraft) => void
  onSave: () => void
}

export function ChapterShotBasicInfoSection({
  title,
  scriptExcerpt,
  saving,
  semanticSaving,
  semantic,
  actionBeatPhases,
  onTitleChange,
  onScriptExcerptChange,
  onSemanticChange,
  onSave,
}: ChapterShotBasicInfoSectionProps) {
  const l = useBilingualText()
  const phaseByText = new Map((actionBeatPhases ?? []).map((item) => [item.text.trim(), item.phase]))
  const phaseMeta = (phase?: ActionBeatPhaseRead['phase']) => {
    if (phase === 'trigger') return { label: l('触发', 'Trigger'), color: 'gold' as const }
    if (phase === 'peak') return { label: l('峰值', 'Peak'), color: 'blue' as const }
    if (phase === 'aftermath') return { label: l('收束', 'Resolution'), color: 'green' as const }
    return null
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm space-y-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900">{l('镜头基础信息', 'Shot basics')}</div>
        <div className="text-[11px] text-slate-500 mt-1">{l('先确认标题、摘录和镜头语言默认值，再继续处理系统提取结果。', 'Confirm the title, excerpt, and camera-language defaults before processing extracted results.')}</div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-xs text-gray-600 mb-1">{l('标题', 'Title')}</div>
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={l('标题', 'Title')}
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-xs text-gray-600">{l('内容 / 剧本摘录', 'Content / script excerpt')}</div>
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={onSave}
            >
              {l('保存', 'Save')}
            </Button>
          </div>
          <Input.TextArea
            value={scriptExcerpt}
            onChange={(e) => onScriptExcerptChange(e.target.value)}
            autoSize={{ minRows: 4, maxRows: 14 }}
            placeholder={l('剧本摘录', 'Script excerpt')}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-slate-800">{l('镜头语言默认值', 'Camera-language defaults')}</div>
              <div className="mt-1 text-[11px] text-slate-500">{l('这里确认的是镜头语义真值，后续工作室可以微调，但仍然写回同一份分镜详情。', 'These values are the semantic source of truth. The studio can refine them and writes back to the same storyboard details.')}</div>
            </div>
            <Button type="primary" size="small" loading={semanticSaving} onClick={onSave}>
              {l('保存', 'Save')}
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-gray-600">{l('景别', 'Shot size')}</div>
              <Select
                value={semantic.camera_shot ?? undefined}
                onChange={(value) => onSemanticChange({ camera_shot: value })}
                options={CAMERA_SHOT_OPTIONS.map((option) => ({ ...option, label: l(option.label, option.labelEn) }))}
                placeholder={l('选择景别', 'Select shot size')}
                className="w-full"
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-gray-600">{l('机位', 'Camera angle')}</div>
              <Select
                value={semantic.angle ?? undefined}
                onChange={(value) => onSemanticChange({ angle: value })}
                options={CAMERA_ANGLE_OPTIONS.map((option) => ({ ...option, label: l(option.label, option.labelEn) }))}
                placeholder={l('选择机位', 'Select camera angle')}
                className="w-full"
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-gray-600">{l('运镜', 'Camera movement')}</div>
              <Select
                value={semantic.movement ?? undefined}
                onChange={(value) => onSemanticChange({ movement: value })}
                options={CAMERA_MOVEMENT_OPTIONS.map((option) => ({ ...option, label: l(option.label, option.labelEn) }))}
                placeholder={l('选择运镜', 'Select camera movement')}
                className="w-full"
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-gray-600">{l('时长（秒）', 'Duration (seconds)')}</div>
              <InputNumber
                min={1}
                max={30}
                value={semantic.duration ?? 4}
                onChange={(value) => onSemanticChange({ duration: Math.max(1, Math.round(Number(value) || 1)) })}
                className="w-full"
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-slate-800">{l('动作拍点', 'Action beats')}</div>
                <div className="mt-1 text-[11px] text-slate-500">{l('按镜头内部时间顺序保留 2-4 条即可，后续关键帧和视频会优先消费这里的已确认版本。', 'Keep 2–4 beats in shot order. Keyframe and video generation prioritize this confirmed version.')}</div>
              </div>
              <Button
                size="small"
                onClick={() => onSemanticChange({ action_beats: [...(semantic.action_beats ?? []), ''] })}
              >
                {l('新增一条', 'Add beat')}
              </Button>
            </div>
            <div className="space-y-2">
              {(semantic.action_beats ?? []).length > 0 ? (semantic.action_beats ?? []).map((item, index) => (
                <div key={`action-beat-${index}`} className="flex items-start gap-2">
                  <div className="mt-2 w-5 shrink-0 text-xs text-slate-500">{index + 1}.</div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      {phaseMeta(phaseByText.get(item.trim())) ? (
                        <Tag color={phaseMeta(phaseByText.get(item.trim()))?.color} className="m-0">
                          {phaseMeta(phaseByText.get(item.trim()))?.label}
                        </Tag>
                      ) : null}
                    </div>
                    <Input.TextArea
                      value={item}
                      onChange={(e) => {
                        const next = [...(semantic.action_beats ?? [])]
                        next[index] = e.target.value
                        onSemanticChange({ action_beats: next })
                      }}
                      autoSize={{ minRows: 1, maxRows: 3 }}
                      placeholder={l('例如：听到异响后骤然僵住', 'For example: Freezes after hearing a strange sound')}
                    />
                  </div>
                  <Button
                    danger
                    size="small"
                    onClick={() => {
                      const next = [...(semantic.action_beats ?? [])]
                      next.splice(index, 1)
                      onSemanticChange({ action_beats: next })
                    }}
                  >
                    {l('删除', 'Delete')}
                  </Button>
                </div>
              )) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-500">
                  {l('当前还没有动作拍点。可以先用 AI 提取结果，再按需要补 2-4 条关键动作变化。', 'No action beats yet. Start with AI extraction, then add 2–4 key action changes as needed.')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
