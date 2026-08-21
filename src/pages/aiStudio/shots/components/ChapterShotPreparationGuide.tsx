import { useMemo, useState } from 'react'
import { Button, Tag, Tooltip } from 'antd'
import { DownOutlined, UpOutlined } from '@ant-design/icons'
import { useBilingualText } from '../../../../i18n/useBilingualText'

type ChecklistItem = {
  key: string
  label: string
  tone: 'success' | 'warning' | 'default'
  text: string
}

type ChapterShotPreparationGuideProps = {
  statusReady: boolean
  checklistItems: readonly ChecklistItem[]
  nextStepTitle: string
  nextStepDescription: string
  onGoToStudio: () => void
}

export function ChapterShotPreparationGuide({
  statusReady,
  checklistItems,
  nextStepTitle,
  nextStepDescription,
  onGoToStudio,
}: ChapterShotPreparationGuideProps) {
  const l = useBilingualText()
  const [expanded, setExpanded] = useState(false)

  const warningCount = useMemo(
    () => checklistItems.filter((item) => item.tone !== 'success').length,
    [checklistItems],
  )

  const summaryText = statusReady
    ? l('已完成准备，可进入工作室继续生成。', 'Preparation is complete. Continue generation in the studio.')
    : l(`还有 ${warningCount} 项待处理，建议先继续完成准备。`, `${warningCount} items still need attention. Complete preparation first.`)

  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{
        borderColor: statusReady ? '#86efac' : '#cbd5e1',
        background: statusReady ? '#f0fdf4' : '#f8fafc',
      }}
    >
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Tag color={statusReady ? 'green' : 'gold'} className="m-0">
              {statusReady ? l('准备完成', 'Preparation complete') : l('待继续准备', 'Preparation needed')}
            </Tag>
            <span className="text-sm font-medium text-slate-900">{nextStepTitle}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{summaryText}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="small"
            type="text"
            icon={expanded ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? l('收起', 'Collapse') : l('详情', 'Details')}
          </Button>
          <Tooltip title={statusReady ? l('进入分镜工作室继续关键帧、图片和视频生成。', 'Open the storyboard studio for keyframes, images, and video generation.') : l('可以先进入工作室查看视频准备度；如需真正继续生成，建议先完成当前准备项。', 'You can inspect video readiness in the studio, but complete the current preparation items before generating.')}>
            <Button
              type={statusReady ? 'primary' : 'default'}
              size="small"
              onClick={onGoToStudio}
            >
              {l('进入工作室', 'Open studio')}
            </Button>
          </Tooltip>
        </div>
      </div>

      {expanded ? (
        <div className="mt-2 space-y-2 border-t border-slate-200/70 pt-2">
          <div className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-600">
            {l('这里负责当前镜头的准备工作：提取并确认资产、对白和基础信息。准备完成后，再进入分镜工作室继续关键帧、图片和视频生成。', 'This area prepares the current shot by extracting and confirming assets, dialogue, and basic information. After preparation, continue with keyframes, images, and video in the storyboard studio.')}
          </div>

          <div className="flex flex-wrap gap-2">
            {checklistItems.map((item) => (
              <div
                key={item.key}
                className="rounded-lg border px-3 py-2 bg-white/70 min-w-[160px] flex-1"
                style={{
                  borderColor:
                    item.tone === 'success'
                      ? '#86efac'
                      : item.tone === 'warning'
                        ? '#fcd34d'
                        : '#dbeafe',
                  background:
                    item.tone === 'success'
                      ? '#f0fdf4'
                      : item.tone === 'warning'
                        ? '#fffbeb'
                        : '#f8fafc',
                }}
              >
                <div className="text-[11px] text-gray-500 mb-1">{item.label}</div>
                <div className="text-xs font-medium text-gray-900">{item.text}</div>
              </div>
            ))}
          </div>

          <div className="text-[11px] text-slate-500">{nextStepDescription}</div>
        </div>
      ) : null}
    </div>
  )
}
