import { memo, useSyncExternalStore } from 'react'
import { useBilingualText } from '../../../i18n/useBilingualText'
import type { AssetImageGenerationViewState } from './AssetGenerationWorkspace'
import { getAssetLookGenerationTask } from './assetLookGenerationTask'
import { normalizeAssetGenerationProgress } from './assetGenerationProgressState'
import './AssetGenerationProgress.css'

export const hasAssetGenerationProgress = (state?: { phase: string }) => Boolean(
  state && ['submitting', 'running', 'refreshing', 'poll-failed', 'refresh-failed'].includes(state.phase),
)

export default function AssetGenerationProgress({
  state,
  compact = false,
  label: customLabel,
}: {
  state?: AssetImageGenerationViewState
  compact?: boolean
  label?: string
}) {
  const l = useBilingualText()
  if (!state || !hasAssetGenerationProgress(state)) return null
  const progress = normalizeAssetGenerationProgress(state.progress)
  const resultLoading = state.phase === 'refreshing' && progress >= 100
  const label = customLabel ?? (state.phase === 'submitting'
    ? l('正在提交', 'Submitting')
    : state.phase === 'refreshing'
      ? l('正在加载结果', 'Loading result')
      : state.phase === 'poll-failed'
        ? l('查询中断，等待重试', 'Query interrupted; retry needed')
        : state.phase === 'refresh-failed'
          ? l('生成完成，结果待加载', 'Generated; result needs loading')
          : l('AI生成中', 'AI generating'))
  const statusText = resultLoading ? label : `${label}${l(`${progress}%`, ` ${progress}%`)}`
  return (
    <span
      className={`asset-generation-progress${compact ? ' is-compact' : ''}${resultLoading ? ' is-result-loading' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-valuetext={resultLoading ? label : `${label} ${progress}%`}
      title={statusText}
    >
      <span className="asset-generation-progress__sparkle" aria-hidden="true">
        <span className="asset-generation-progress__sparkle-core">✦</span>
      </span>
      <span className="asset-generation-progress__status">{statusText}</span>
    </span>
  )
}

const emptyLookTask = { phase: 'idle' as const, progress: 0, revision: 0 }
const getEmptyLookTask = () => emptyLookTask
const subscribeToEmptyLookTask = () => () => {}

export const AssetCardGenerationProgress = memo(function AssetCardGenerationProgress({
  assetId,
  state,
}: {
  assetId: number | null
  state?: AssetImageGenerationViewState
}) {
  const l = useBilingualText()
  const task = assetId === null ? undefined : getAssetLookGenerationTask(assetId)
  const lookState = useSyncExternalStore(
    task?.subscribe ?? subscribeToEmptyLookTask,
    task?.getSnapshot ?? getEmptyLookTask,
    getEmptyLookTask,
  )
  const displayState: AssetImageGenerationViewState | undefined = lookState.phase !== 'idle' && lookState.phase !== 'failed'
    ? { ...lookState, phase: lookState.phase }
    : state
  if (!hasAssetGenerationProgress(displayState)) return null
  return (
    <span className="project-assets-step__card-generation">
      <AssetGenerationProgress
        state={displayState}
        label={lookState.phase === 'refreshing' ? l('生成完成，打开查看', 'Generated; open to view') : undefined}
      />
    </span>
  )
})
