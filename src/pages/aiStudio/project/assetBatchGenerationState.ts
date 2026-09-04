import type { StudioEpisodeAssetsGenerateStatusItem, StudioEpisodeAssetsGenerateStatusResult } from '../../../services/studioAssetGeneration'
import type { AssetImageGenerationViewState } from './AssetGenerationWorkspace'
import { normalizeAssetGenerationProgress } from './assetGenerationProgressState'

export type BatchGenerationState = {
  assets: Record<string, AssetImageGenerationViewState>
  looks: Record<string, Record<string, AssetImageGenerationViewState>>
}

export const EMPTY_BATCH_GENERATION_STATE: BatchGenerationState = { assets: {}, looks: {} }

const succeeded = (item: StudioEpisodeAssetsGenerateStatusItem) => (
  Number(item.status) === 3 || /已就绪|成功|success|succeeded|complete/i.test(item.statusName ?? '')
)
const failed = (item: StudioEpisodeAssetsGenerateStatusItem) => !succeeded(item) && (
  Number(item.status) > 3 || /失败|取消|failed|cancel/i.test(item.statusName ?? '') || Boolean(item.error?.trim())
)
const assetKey = (scriptImportId: string | number, item: StudioEpisodeAssetsGenerateStatusItem) => (
  `remote:${scriptImportId}:${item.assetType}:${item.assetId}`
)
const sameState = (left: AssetImageGenerationViewState | undefined, right: AssetImageGenerationViewState) => (
  left?.phase === right.phase && left.progress === right.progress
  && left.lookId === right.lookId && left.errorMessage === right.errorMessage
)
const reuseStates = (
  previous: Record<string, AssetImageGenerationViewState>,
  next: Record<string, AssetImageGenerationViewState>,
) => {
  let unchanged = Object.keys(previous).length === Object.keys(next).length
  Object.keys(next).forEach((key) => {
    if (sameState(previous[key], next[key])) next[key] = previous[key]
    else unchanged = false
  })
  return unchanged ? previous : next
}

/** The response is a full snapshot of the selected scope, grouped without losing active looks. */
export function buildBatchGenerationState(
  scriptImportId: string | number,
  items: StudioEpisodeAssetsGenerateStatusItem[],
  allGenerated: boolean,
  current: BatchGenerationState = EMPTY_BATCH_GENERATION_STATE,
): BatchGenerationState {
  const assets: BatchGenerationState['assets'] = {}
  const looks: BatchGenerationState['looks'] = {}
  if (!allGenerated) items.forEach((item) => {
    if (![1, 2, 3].includes(Number(item.assetType)) || !Number.isInteger(item.assetId) || Number(item.assetId) <= 0) return
    const progress = normalizeAssetGenerationProgress(item.progress)
    if (!String(item.taskId ?? '').trim() || succeeded(item) || failed(item) || progress >= 100) return
    const key = assetKey(scriptImportId, item)
    const lookId = Number(item.characterLookId) > 0 ? Number(item.characterLookId) : null
    const state: AssetImageGenerationViewState = { phase: 'running', progress, lookId }
    if (lookId !== null) {
      const byLook = looks[key] ??= {}
      // A repeated look must not let a later, faster item hide its unfinished work.
      if (!byLook[lookId] || progress < byLook[lookId].progress) byLook[lookId] = state
    }
    const existing = assets[key]
    assets[key] = existing
      ? { phase: 'running', progress: Math.min(existing.progress, progress), lookId: existing.lookId === lookId ? lookId : undefined }
      : state
  })
  const reusedAssets = reuseStates(current.assets, assets)
  let sameLooks = Object.keys(looks).length === Object.keys(current.looks).length
  Object.keys(looks).forEach((key) => {
    looks[key] = reuseStates(current.looks[key] ?? {}, looks[key])
    if (looks[key] !== current.looks[key]) sameLooks = false
  })
  if (reusedAssets === current.assets && sameLooks) return current
  return { assets: reusedAssets, looks: sameLooks ? current.looks : looks }
}

export function selectAssetGenerationState(
  single: AssetImageGenerationViewState | undefined,
  batch: AssetImageGenerationViewState | undefined,
) {
  return single && single.phase !== 'failed' ? single : batch ?? single
}

/** Only result changes trigger asset/credit refreshes; progress ticks do not. */
export function getBatchResultSignature(items: StudioEpisodeAssetsGenerateStatusItem[]) {
  return JSON.stringify(items.filter((item) => succeeded(item) || failed(item)).map((item) => JSON.stringify([
    item.scopeKey, item.assetType, item.assetId, item.characterLookId,
    item.status, item.coverFileId, item.coverUrl,
  ])).sort())
}

/** Restored single tasks retain their detail-query owner instead of acquiring a second progress source. */
export function filterOwnedBatchTasks(status: StudioEpisodeAssetsGenerateStatusResult, ownedTaskIds: ReadonlySet<string>) {
  if (!ownedTaskIds.size) return status
  const active = (item: StudioEpisodeAssetsGenerateStatusItem) => (
    Boolean(String(item.taskId ?? '').trim()) && !succeeded(item) && !failed(item)
  )
  const items = status.items.filter((item) => !ownedTaskIds.has(String(item.taskId ?? '')))
  if (items.length === status.items.length) return status
  const onlyOwnedTasksRunning = !status.batch
    && status.items.some((item) => active(item) && ownedTaskIds.has(String(item.taskId)))
    && !items.some(active)
  return { ...status, items, shouldPoll: status.shouldPoll && !onlyOwnedTasksRunning }
}
