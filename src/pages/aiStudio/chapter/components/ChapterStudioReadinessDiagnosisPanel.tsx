import { Button, Progress, Tag, Tooltip } from 'antd'
import { useBilingualText } from '../../../../i18n/useBilingualText'
import { CheckCircleOutlined, EditOutlined } from '@ant-design/icons'
import type { ShotRead } from '../../../../services/generated'

type ReadinessCheckKey = 'characters' | 'scene' | 'props' | 'costumes'

type ReadinessEntry = {
  id: number
  name: string
  status: 'pending' | 'linked' | 'ignored'
}

type ReadinessCheck = {
  key: ReadinessCheckKey
  label: string
  importance: string
  entries: ReadinessEntry[]
  missing: string[]
  expectedCount: number
  actualCount: number
  ignoredCount: number
  resolvedCount: number
  ready: boolean
}

type PromptAssetReadiness = {
  checks: ReadinessCheck[]
  expectedChecks: ReadinessCheck[]
  readyCount: number
  totalCount: number
  percent: number
  hasMissing: boolean
}

type ChapterStudioReadinessDiagnosisPanelProps = {
  selectedShot: ShotRead | null
  shotAssetsOverview: unknown | null
  promptAssetReadiness: PromptAssetReadiness
  promptAssetReadinessNote: string
  shotExtractStatusSource: 'idle'
  shotExtractStatusText: string
  onGoToShotEdit: () => void
  onHandleMissingAction: (kind: ReadinessCheckKey, name: string) => void
  getReadinessExistenceLabel: (kind: ReadinessCheckKey, name: string) => string | null
}

export function ChapterStudioReadinessDiagnosisPanel({
  selectedShot,
  shotAssetsOverview,
  promptAssetReadiness,
  promptAssetReadinessNote,
  shotExtractStatusSource,
  shotExtractStatusText,
  onGoToShotEdit,
  onHandleMissingAction,
  getReadinessExistenceLabel,
}: ChapterStudioReadinessDiagnosisPanelProps) {
  const l = useBilingualText()
  return (
    <div className="cs-group cs-readiness-card">
      <div className="cs-group-title">
        <CheckCircleOutlined /> {l('信息确认诊断', 'Information confirmation diagnosis')}
      </div>
      <div className="cs-readiness-note">{promptAssetReadinessNote}</div>
      {selectedShot ? (
        <div className="mt-3">
          <Button icon={<EditOutlined />} onClick={onGoToShotEdit}>
            {l('去分镜编辑确认', 'Confirm in storyboard editor')}
          </Button>
        </div>
      ) : null}
      {shotExtractStatusText ? (
        <div className={`cs-readiness-status is-${shotExtractStatusSource}`}>
          <span>{shotExtractStatusText}</span>
          <Tooltip title={l('前往分镜编辑页处理提取与确认', 'Open the storyboard editor for extraction and confirmation')}>
            <Button
              type="text"
              size="small"
              className="cs-readiness-status__refresh"
              icon={<EditOutlined />}
              onClick={onGoToShotEdit}
            />
          </Tooltip>
        </div>
      ) : null}

      {!selectedShot ? (
        <div className="text-xs text-gray-400 mt-3">{l('请先选择一个分镜。', 'Select a storyboard first.')}</div>
      ) : selectedShot.skip_extraction ? (
        <div className="space-y-4 mt-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="text-sm font-medium text-emerald-800">{l('当前分镜已标记为无需提取', 'This storyboard is marked as requiring no extraction')}</div>
            <div className="text-xs text-emerald-700 mt-1">
              {l('系统会直接按“提取确认已完成”处理；如果需要修改这项决定，建议前往分镜编辑页处理。', 'The system treats extraction confirmation as complete. Change this decision in the storyboard editor.')}
            </div>
          </div>
        </div>
      ) : !shotAssetsOverview ? (
        <div className="text-xs text-gray-400 mt-3">{l('当前分镜还没有可用的资产总览数据，请前往分镜编辑页处理提取与确认。', 'No asset overview is available for this storyboard. Use the storyboard editor for extraction and confirmation.')}</div>
      ) : (
        <div className="space-y-4 mt-3">
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
            {l('这里主要用于诊断当前镜头为什么仍然是 ', 'This panel diagnoses why the current shot remains ')}<span className="font-medium text-slate-700">pending</span>{l('。如果需要修改提取结果、忽略候选或调整“无需提取”，请前往分镜编辑页处理。', '. Use the storyboard editor to change extraction results, ignore candidates, or adjust the no-extraction setting.')}
          </div>
          <div className="cs-readiness-summary">
            <div>
              <div className="cs-readiness-summary__title">
                {promptAssetReadiness.hasMissing ? l('当前仍有未确认提取项', 'Extraction items still need confirmation') : l('当前镜头的信息确认已完成', 'Information confirmation is complete for this shot')}
              </div>
              <div className="cs-readiness-summary__desc">
                {l(`已完成 ${promptAssetReadiness.readyCount}/${promptAssetReadiness.totalCount || 0} 项关键确认；如需调整，请前往分镜编辑页处理`, `${promptAssetReadiness.readyCount}/${promptAssetReadiness.totalCount || 0} key confirmations complete. Use the storyboard editor to make changes.`)}
              </div>
            </div>
            <div className="cs-readiness-summary__progress">
              <Progress
                type="circle"
                size={68}
                percent={promptAssetReadiness.percent}
                strokeColor={promptAssetReadiness.hasMissing ? '#f59e0b' : '#10b981'}
              />
            </div>
          </div>

          <div>
            <Button icon={<EditOutlined />} onClick={onGoToShotEdit}>
              {l('去分镜编辑确认', 'Confirm in storyboard editor')}
            </Button>
          </div>

          <div className="cs-readiness-grid">
            {promptAssetReadiness.checks.map((item) => (
              <div key={item.key} className={`cs-readiness-item ${item.ready ? 'is-ready' : 'is-missing'}`}>
                <div className="cs-readiness-item__header">
                  <span className="cs-readiness-item__label">{item.label}</span>
                  <Tag color={item.ready ? 'success' : item.expectedCount === 0 ? 'default' : 'warning'}>
                    {item.expectedCount === 0 ? '无候选' : item.ready ? '已就绪' : `待处理 ${item.missing.length}`}
                  </Tag>
                </div>
                <div className="cs-readiness-item__meta">
                  {l(`提取到 ${item.expectedCount} 项，已关联 ${item.actualCount} 项，已忽略 ${item.ignoredCount} 项`, `${item.expectedCount} extracted, ${item.actualCount} linked, ${item.ignoredCount} ignored`)}
                </div>
                <div className="cs-readiness-item__importance">{item.importance}</div>
                {item.expectedCount > 0 ? (
                  <div className="cs-readiness-item__chips">
                    {item.entries.map((entry) => {
                      const missing = entry.status === 'pending'
                      const ignored = entry.status === 'ignored'
                      const existenceLabel = missing ? getReadinessExistenceLabel(item.key, entry.name) : null
                      return (
                        <span key={entry.id} className="cs-readiness-chip-wrap">
                          <Tag
                            color={missing ? 'orange' : ignored ? 'default' : 'green'}
                            className={missing ? 'cs-readiness-tag-action' : undefined}
                            onClick={missing ? () => onHandleMissingAction(item.key, entry.name) : undefined}
                          >
                            {missing ? `待处理：${entry.name}` : ignored ? `已忽略：${entry.name}` : entry.name}
                          </Tag>
                          {missing && existenceLabel ? (
                            <span className="cs-readiness-chip-meta">{existenceLabel}</span>
                          ) : null}
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <div className="cs-readiness-item__empty">{l('当前分镜的剧本提取结果里还没有这类候选资产', 'No candidate assets of this type were extracted for the current storyboard')}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
