import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type React from 'react'
import { Button, Dropdown, Empty, Input, Modal, Spin, message } from 'antd'
import {
  AudioOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EyeOutlined,
  MoreOutlined,
  PictureOutlined,
  PlusOutlined,
  SwapOutlined,
  StarFilled,
  UploadOutlined,
} from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { getApiErrorMessage } from '../../../services/apiErrors'
import {
  StudioAssetGenerationApi,
  parseStudioAssetImageTaskResult,
} from '../../../services/studioAssetGeneration'
import type {
  StudioAssetImageHistoryItem,
  StudioAssetImageTaskDetail,
  StudioAssetImageTaskRequest,
  StudioAssetReferenceItem,
} from '../../../services/studioAssetGeneration'
import { StudioEntitiesApi } from '../../../services/studioEntities'
import { StudioModelsApi } from '../../../services/studioModels'
import type { StudioGenerationModel } from '../../../services/studioModels'
import { StudioScriptsApi } from '../../../services/studioScripts'
import { StudioVoicesApi } from '../../../services/systemVoices'
import type {
  StudioScriptAssetListRequest,
  StudioScriptAssetListResult,
  StudioScriptAssetType,
  StudioScriptAssetVoice,
  StudioScriptImportId,
} from '../../../services/studioScripts'
import type { SystemVoiceRead } from '../../../services/systemVoices'
import AssetGenerationWorkspace, { loadAssetVisualStyleOptions } from './AssetGenerationWorkspace'
import { AssetCardGenerationProgress } from './AssetGenerationProgress'
import type {
  AssetImageGenerationInput,
  AssetImageGenerationViewState,
  AssetImageOptionsInput,
  AssetVisualStyleOption,
} from './AssetGenerationWorkspace'
import ImageViewer from './ImageViewer'
import VoiceLibraryModal from './VoiceLibraryModal'
import StudioSelect from './StudioSelect'
import { getAssetLookGenerationTask, getActiveAssetLookGenerationTasks, subscribeAssetLookGenerationTasks } from './assetLookGenerationTask'
import {
  buildBatchGenerationState,
  EMPTY_BATCH_GENERATION_STATE,
  getBatchResultSignature,
  filterOwnedBatchTasks,
  selectAssetGenerationState,
} from './assetBatchGenerationState'
import { normalizeAssetGenerationProgress } from './assetGenerationProgressState'
import { startBatchGenerationPolling } from './assetBatchGenerationPolling'
import { mergeHydratedAssets, mergeHydratedIds } from './assetDraftHydration'
import {
  createImageOptionsClientRevision,
  DEFAULT_ASSET_IMAGE_RATIO_OPTIONS,
  resolveAssetImageOptions,
  selectImageResolution,
  selectInitialAssetLook,
} from './assetImageGenerationSettings'
import {
  PROJECT_CREATION_DRAFT_KEYS,
  buildEpisodeSourceSignature,
  getProjectCreationDraftKey,
  readFullProjectCreationDraft,
  readProjectCreationDraft,
  useProjectCreationDraft,
} from './projectCreationDraft'
import './ProjectAssetsStep.css'

export type AssetEpisodeSource = {
  id: string
  index?: number
  title: string
  rawText: string
}

type AssetKind = 'role' | 'scene' | 'prop'
type AssetScope = 'overview' | string
type AssetOverrideField = 'name' | 'prompt' | 'imageUrl' | 'styleName' | 'visualStyleId' | 'aspectRatio'

type AssetDraft = {
  id: string
  /** assets/list 返回的真实资产 ID，用于需要落库的资产操作。 */
  backendAssetId?: StudioScriptImportId
  kind: AssetKind
  name: string
  episodeIds: string[]
  imageUrl?: string
  prompt?: string
  styleName?: string
  visualStyleId?: number | null
  aspectRatio?: string
  source?: 'fallback' | 'manual' | 'remote'
  assetCode?: string
  aliases?: string[]
  description?: string
  status?: number
  coverFileId?: StudioScriptImportId
  lookCount?: number
  updatedAt?: string
  voice?: StudioScriptAssetVoice
  overrideFields?: AssetOverrideField[]
}

type RemoteAssetsByScope = Record<string, Partial<Record<AssetKind, AssetDraft[]>>>

type AssetPollingLane = {
  loaded: boolean
  loading: boolean
  polling: boolean
  extractionStatus: number | null
  statusName: string
  errorMessage: string
}

type AssetPollingState = {
  scopeId: AssetScope | null
  lanes: Record<StudioScriptAssetType, AssetPollingLane>
}

type ActiveAssetImageRun = {
  token: number
  assetKey: string
  backendAssetId: number
  lookId: number | null
  progress: number
  assetName: string
  scriptImportId: StudioScriptImportId
  scopeId: AssetScope
  chapterId?: StudioScriptImportId
  assetType: StudioScriptAssetType
  sourceSignature: string
  episodes: AssetEpisodeSource[]
  taskId?: string
  taskSucceeded?: boolean
  expectedFileId?: StudioScriptImportId
  previousCoverFileId?: StudioScriptImportId
  previousImageUrl?: string
  previousUpdatedAt?: string
  resultMissCount: number
  timer: number | null
  request?: StudioAssetImageTaskRequest<unknown>
}

type PersistedAssetImageTask = {
  assetKey: string
  backendAssetId: number
  lookId?: number | null
  progress?: number
  assetName: string
  scriptImportId: StudioScriptImportId
  scopeId: AssetScope
  chapterId?: StudioScriptImportId
  assetType: StudioScriptAssetType
  sourceSignature: string
  taskId: string
  taskSucceeded?: boolean
  expectedFileId?: StudioScriptImportId
  previousCoverFileId?: StudioScriptImportId
  previousImageUrl?: string
  previousUpdatedAt?: string
}

type ConfirmedAssetImage = {
  coverFileId?: StudioScriptImportId
  imageUrl?: string
  updatedAt?: string
  laneRevision: number
}

type AssetImageOptionsUpdateWaiter = {
  revision: number
  resolve: () => void
  reject: (error: unknown) => void
}

type AssetImageOptionsUpdateQueue = {
  queueKey: string
  scriptImportId: StudioScriptImportId
  latestRevision: number
  appliedRevision: number
  latestSignature: string
  latestAsset: AssetDraft
  latestInput: AssetImageOptionsInput
  processing: boolean
  waiters: AssetImageOptionsUpdateWaiter[]
}

type AssetImageHistoryBucket = {
  items: StudioAssetImageHistoryItem[]
  loading: boolean
  error?: unknown
}

type AssetReferenceBucket = {
  items: StudioAssetReferenceItem[]
  total: number
  maxCount: number
  loading: boolean
  error?: unknown
}

type AssetGenerationStatusBucket = {
  allGenerated: boolean
  shouldPoll: boolean
  loading: boolean
  error?: unknown
  resultSignature?: string
}

type AssetsStepDraft = {
  sourceSignature: string
  kind: AssetKind
  assets: AssetDraft[]
  model: string
  resolution: string
  resolutionChosenByUser?: boolean
  completedEpisodeIds: string[]
  hiddenRemoteAssetIds?: string[]
  unsavedImageOptionKeys?: string[]
  pendingImageTasks?: PersistedAssetImageTask[]
}

type ProjectAssetsStepProps = {
  scriptImportId: StudioScriptImportId | null
  episodes: AssetEpisodeSource[]
  ratio?: string
  styleName?: string
  visualStyleNames?: string[]
  visualStyleOptions?: AssetVisualStyleOption[]
  onImageSubmissionStateChange?: (submitting: boolean) => void
  onGenerationCompletionStateChange?: (completed: boolean) => void
  onScopeChange?: (scope: AssetScope) => void
}

type PersonalAsset = {
  id: string
  name: string
  imageUrl?: string
  style?: string
  gender?: string
  age?: string
  region?: string
}

type PersonalAssetFilter = 'gender' | 'style' | 'age' | 'region'

const EMPTY_PERSONAL_FILTERS: Record<PersonalAssetFilter, string> = {
  gender: 'all',
  style: 'all',
  age: 'all',
  region: 'all',
}

const KIND_LABELS: Record<AssetKind, { zh: string; en: string }> = {
  role: { zh: '角色', en: 'Characters' },
  scene: { zh: '场景', en: 'Scenes' },
  prop: { zh: '道具', en: 'Props' },
}

const LOOK_COUNT_LABELS: Record<AssetKind, { zh: string; en: string }> = {
  role: { zh: '造型', en: 'looks' },
  scene: { zh: '场景', en: 'scenes' },
  prop: { zh: '道具', en: 'props' },
}

const ASSET_TYPES = [1, 2, 3] as const satisfies readonly StudioScriptAssetType[]
const ASSET_KIND_BY_TYPE: Record<StudioScriptAssetType, AssetKind> = {
  1: 'role',
  2: 'scene',
  3: 'prop',
}
const ASSET_TYPE_BY_KIND: Record<AssetKind, StudioScriptAssetType> = {
  role: 1,
  scene: 2,
  prop: 3,
}
const ASSET_POLL_INTERVAL_MS = 3000
const ASSET_POLL_MAX_FAILURES = 3
const ASSET_IMAGE_TASK_POLL_INTERVAL_MS = 3000
const ASSET_IMAGE_TASK_MAX_REQUEST_FAILURES = 3
const ASSET_IMAGE_RESULT_MAX_MISSES = 20
const ASSET_IMAGE_OPTIONS_SAVE_TIMEOUT_MS = 15_000

const getAssetImageOptionsQueueKey = (
  scriptImportId: StudioScriptImportId,
  assetKey: string,
) => `${String(scriptImportId)}:${assetKey}`

const getAssetImageHistoryKey = (
  scriptImportId: StudioScriptImportId,
  assetId: number,
  lookId?: number | null,
) => `${String(scriptImportId)}:${assetId}:${lookId === undefined || lookId === null ? 'default' : lookId}`

const getAssetReferenceKey = (assetId: number) => String(assetId)

const getRemoteAssetDraftId = (
  scriptImportId: StudioScriptImportId,
  assetType: StudioScriptAssetType,
  assetId: StudioScriptImportId,
) => `remote:${scriptImportId}:${assetType}:${assetId}`

const getAssetImageOptionsRequestSignature = (input: AssetImageOptionsInput) => JSON.stringify([
  input.prompt,
  input.aspectRatio,
  input.visualStyleId,
])

const formatCreditCost = (value: number | undefined) => {
  if (value === undefined) return '--'
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

const createAssetPollingState = (
  scopeId: AssetScope | null = null,
  active = false,
): AssetPollingState => ({
  scopeId,
  lanes: {
    1: {
      loaded: false,
      loading: active,
      polling: active,
      extractionStatus: null,
      statusName: '',
      errorMessage: '',
    },
    2: {
      loaded: false,
      loading: active,
      polling: active,
      extractionStatus: null,
      statusName: '',
      errorMessage: '',
    },
    3: {
      loaded: false,
      loading: active,
      polling: active,
      extractionStatus: null,
      statusName: '',
      errorMessage: '',
    },
  },
})

const getPollingErrorMessage = (error: unknown) => (
  error instanceof Error && error.message.trim() ? error.message : 'Asset loading failed'
)

const getErrorStatus = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('status' in error)) return null
  const status = Number((error as { status?: unknown }).status)
  return Number.isFinite(status) ? status : null
}

const getBackendAssetId = (value: StudioScriptImportId | undefined): number | null => {
  const assetId = Number(value)
  return Number.isInteger(assetId) && assetId > 0 ? assetId : null
}

const isCancelledRequestError = (error: unknown) => Boolean(
  error && typeof error === 'object' && (
    ('isCancelled' in error && (error as { isCancelled?: unknown }).isCancelled === true)
    || ('name' in error && (error as { name?: unknown }).name === 'CancelError')
  ),
)

const clampTaskProgress = (value: unknown, previous = 0) => normalizeAssetGenerationProgress(value, previous)

const isAssetImageTaskSucceeded = (detail: StudioAssetImageTaskDetail) => (
  Number(detail.status) === 3 || detail.statusName?.trim() === '执行成功'
)

const isAssetImageTaskFailed = (detail: StudioAssetImageTaskDetail) => (
  (
    Number(detail.status) > 3
    || /失败|取消|failed|cancel/i.test(detail.statusName?.trim() || '')
    || Boolean(detail.cancelledAt || detail.finishedAt || detail.error?.trim())
  )
  && !isAssetImageTaskSucceeded(detail)
)

const isAssetImageTaskActive = (state?: AssetImageGenerationViewState) => (
  state?.phase === 'submitting'
  || state?.phase === 'running'
  || state?.phase === 'refreshing'
)

const isAssetImageTaskLocked = (state?: AssetImageGenerationViewState) => (
  isAssetImageTaskActive(state)
  || state?.phase === 'poll-failed'
  || state?.phase === 'refresh-failed'
)

const normalizePersistedAssetImageTasks = (value: unknown): PersistedAssetImageTask[] => {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is PersistedAssetImageTask => {
    if (!item || typeof item !== 'object') return false
    const task = item as Partial<PersistedAssetImageTask>
    return typeof task.assetKey === 'string'
      && task.assetKey.length > 0
      && Number.isInteger(Number(task.backendAssetId))
      && Number(task.backendAssetId) > 0
      && typeof task.assetName === 'string'
      && (typeof task.scriptImportId === 'string' || typeof task.scriptImportId === 'number')
      && typeof task.scopeId === 'string'
      && (task.assetType === 1 || task.assetType === 2 || task.assetType === 3)
      && typeof task.sourceSignature === 'string'
      && typeof task.taskId === 'string'
      && task.taskId.trim().length > 0
  }).map((task) => ({
    ...task,
    progress: task.taskSucceeded ? 100 : clampTaskProgress(task.progress),
  }))
}

const getPendingAssetImageTaskSidecarKey = (draftKey: string) => `${draftKey}:pending-image-tasks`

const readPendingAssetImageTaskSidecar = (draftKey: string) => {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.sessionStorage.getItem(getPendingAssetImageTaskSidecarKey(draftKey))
    return raw === null ? undefined : normalizePersistedAssetImageTasks(JSON.parse(raw))
  } catch {
    return undefined
  }
}

const writePendingAssetImageTaskSidecar = (
  draftKey: string,
  tasks: PersistedAssetImageTask[],
) => {
  if (typeof window === 'undefined') return
  try {
    const key = getPendingAssetImageTaskSidecarKey(draftKey)
    // 空数组也是权威快照，防止主草稿尚未完成异步写入时把已结束任务重新恢复出来。
    window.sessionStorage.setItem(key, JSON.stringify(tasks))
  } catch {
    // 主草稿仍会写入 localStorage/IndexedDB；sidecar 只负责缩短异步持久化窗口。
  }
}

const mergePendingAssetImageTasks = (
  ...taskGroups: PersistedAssetImageTask[][]
) => {
  const merged = new Map<string, PersistedAssetImageTask>()
  taskGroups.forEach((tasks) => tasks.forEach((task) => merged.set(task.assetKey, task)))
  return [...merged.values()]
}

const confirmedAssetImageMatches = (
  asset: AssetDraft,
  confirmed: ConfirmedAssetImage,
) => {
  let hasIdentity = false
  if (confirmed.coverFileId !== undefined) {
    hasIdentity = true
    if (
      asset.coverFileId === undefined
      || String(asset.coverFileId) !== String(confirmed.coverFileId)
    ) return false
  }
  if (confirmed.updatedAt) {
    hasIdentity = true
    if (asset.updatedAt !== confirmed.updatedAt) return false
  }
  if (confirmed.imageUrl) {
    hasIdentity = true
    if (asset.imageUrl !== confirmed.imageUrl) return false
  }
  return hasIdentity
}

const mapRemoteAssets = (
  result: StudioScriptAssetListResult,
  assetType: StudioScriptAssetType,
  scriptImportId: StudioScriptImportId,
  queryEpisodeId: string | undefined,
  episodes: AssetEpisodeSource[],
): AssetDraft[] => {
  const episodeIdByIndex = new Map(episodes.map((episode, position) => [
    episode.index ?? position + 1,
    episode.id,
  ]))
  return result.list.map((item) => {
    const lookCount = Number(item.lookCount)
    const relatedEpisodeIds = new Set((item.appearedEpisodes ?? [])
      .map((episodeIndex) => episodeIdByIndex.get(episodeIndex))
      .filter((episodeId): episodeId is string => Boolean(episodeId)))
    if (queryEpisodeId) relatedEpisodeIds.add(queryEpisodeId)
    return {
      id: getRemoteAssetDraftId(scriptImportId, assetType, item.id),
      backendAssetId: item.id,
      kind: ASSET_KIND_BY_TYPE[assetType],
      name: item.name,
      episodeIds: [...relatedEpisodeIds],
      imageUrl: item.coverUrl?.trim() || undefined,
      prompt: item.createPrompt?.trim() || undefined,
      aspectRatio: item.aspectRatio?.trim() || undefined,
      visualStyleId: item.visualStyleId === undefined
        ? undefined
        : item.visualStyleId === null
          ? null
          : getBackendAssetId(item.visualStyleId) ?? undefined,
      styleName: item.visualStyleName?.trim() || undefined,
      source: 'remote',
      assetCode: item.assetCode?.trim() || undefined,
      aliases: item.aliases ?? undefined,
      description: item.description?.trim() || undefined,
      status: item.status ?? undefined,
      coverFileId: item.coverFileId ?? undefined,
      lookCount: Number.isFinite(lookCount) ? Math.max(0, Math.floor(lookCount)) : undefined,
      updatedAt: item.updatedAt?.trim() || undefined,
      voice: item.voice ?? undefined,
    }
  })
}

const isAssetKind = (value: unknown): value is AssetKind => (
  value === 'role' || value === 'scene' || value === 'prop'
)

const sameStringList = (left?: string[] | null, right?: string[] | null) => {
  const normalizedLeft = left ?? []
  const normalizedRight = right ?? []
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index])
}

const sameAssetVoice = (
  left?: StudioScriptAssetVoice | null,
  right?: StudioScriptAssetVoice | null,
) => {
  if (!left || !right) return left === right || (!left && !right)
  if (
    left.id !== right.id
    || left.name !== right.name
    || left.previewUrl !== right.previewUrl
    || left.emotionAdjustable !== right.emotionAdjustable
    || left.languages.length !== right.languages.length
  ) return false
  return left.languages.every((language, index) => {
    const nextLanguage = right.languages[index]
    return language.code === nextLanguage.code
      && language.name === nextLanguage.name
      && language.primaryLanguage === nextLanguage.primaryLanguage
  })
}

/** 轮询结果未变化时复用旧引用，避免三条轮询反复重绘完整资产列表。 */
const sameRemoteAssetList = (left: AssetDraft[] | undefined, right: AssetDraft[]) => {
  if (!left || left.length !== right.length) return false
  return left.every((asset, index) => {
    const nextAsset = right[index]
    return asset.id === nextAsset.id
      && asset.backendAssetId === nextAsset.backendAssetId
      && asset.kind === nextAsset.kind
      && asset.name === nextAsset.name
      && asset.imageUrl === nextAsset.imageUrl
      && asset.prompt === nextAsset.prompt
      && asset.aspectRatio === nextAsset.aspectRatio
      && asset.visualStyleId === nextAsset.visualStyleId
      && asset.styleName === nextAsset.styleName
      && asset.assetCode === nextAsset.assetCode
      && asset.description === nextAsset.description
      && asset.status === nextAsset.status
      && asset.coverFileId === nextAsset.coverFileId
      && asset.lookCount === nextAsset.lookCount
      && asset.updatedAt === nextAsset.updatedAt
      && sameAssetVoice(asset.voice, nextAsset.voice)
      && sameStringList(asset.aliases, nextAsset.aliases)
      && sameStringList(asset.episodeIds, nextAsset.episodeIds)
  })
}

const ROLE_NAME_PATTERN = /^\s*([\u3400-\u9fffA-Za-z][\u3400-\u9fffA-Za-z0-9·]{0,11})(?:\s*[（(][^）)]*[）)])?\s*[：:]/gm
const SCENE_LABEL_PATTERN = /(?:场景|地点)\s*[：:]\s*([^\n，。；;]{2,30})/g
const SCENE_HEADING_PATTERN = /^\s*(?:\d+\s*[-.]\s*\d+\s*)?(?:日|夜|晨|暮)?\s*(?:内|外|内外)\s+([^\n]{2,30})$/gm
const PROP_LABEL_PATTERN = /(?:道具|物品)\s*[：:]\s*([^\n。；;]{1,80})/g
const NON_ROLE_NAMES = new Set(['人物', '角色', '场景', '地点', '道具', '时间', '画面', '镜头', '旁白', '字幕', '音效'])

function splitNames(value: string) {
  return value
    .split(/[、,，/|]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 20)
}

function collectMatches(text: string, pattern: RegExp) {
  pattern.lastIndex = 0
  return [...text.matchAll(pattern)].flatMap((match) => splitNames(match[1] ?? ''))
}

function extractAssets(episodes: AssetEpisodeSource[]): AssetDraft[] {
  const assets = new Map<string, AssetDraft>()
  const add = (kind: AssetKind, rawName: string, episodeId: string) => {
    const name = rawName.replace(/[（(].*$/, '').trim()
    if (!name || (kind === 'role' && NON_ROLE_NAMES.has(name))) return
    const key = `${kind}:${name}`
    const existing = assets.get(key)
    if (existing) {
      if (!existing.episodeIds.includes(episodeId)) existing.episodeIds.push(episodeId)
      return
    }
    assets.set(key, {
      id: `${kind}-${assets.size + 1}`,
      kind,
      name,
      episodeIds: [episodeId],
      source: 'fallback',
    })
  }

  episodes.forEach((episode) => {
    collectMatches(episode.rawText, ROLE_NAME_PATTERN).forEach((name) => add('role', name, episode.id))
    collectMatches(episode.rawText, SCENE_LABEL_PATTERN).forEach((name) => add('scene', name, episode.id))
    collectMatches(episode.rawText, SCENE_HEADING_PATTERN).forEach((name) => add('scene', name, episode.id))
    collectMatches(episode.rawText, PROP_LABEL_PATTERN).forEach((name) => add('prop', name, episode.id))
  })

  return [...assets.values()]
}

function buildAssetPrompt(asset: AssetDraft, episodes: AssetEpisodeSource[]) {
  if (asset.prompt) return asset.prompt
  const relatedLines = episodes
    .filter((episode) => asset.episodeIds.length === 0 || asset.episodeIds.includes(episode.id))
    .flatMap((episode) => episode.rawText.split(/\r?\n/))
    .map((line) => line.trim())
    .filter((line) => line.includes(asset.name))
    .slice(0, 12)

  const subjectPrompt = asset.kind === 'role'
    ? `${asset.name}的角色设定，多视角造型，正面、侧面与背面视图，人物比例准确，服装和外貌细节统一，纯色背景。`
    : asset.kind === 'scene'
      ? `${asset.name}的场景设定，完整空间构图，清晰展示环境、光线、材质与关键陈设。`
      : `${asset.name}的道具设定，展示完整外形、材质、结构和细节，纯色背景。`

  return relatedLines.length > 0
    ? `${subjectPrompt}\n\n剧本相关信息：\n${relatedLines.join('\n')}`
    : subjectPrompt
}

export default function ProjectAssetsStep({
  scriptImportId,
  episodes,
  ratio = '9:16',
  styleName = '',
  visualStyleNames = [],
  visualStyleOptions = [],
  onImageSubmissionStateChange,
  onGenerationCompletionStateChange,
  onScopeChange,
}: ProjectAssetsStepProps) {
  const l = useBilingualText()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const localAssetInputRef = useRef<HTMLInputElement>(null)
  const episodeSourceSignature = useMemo(
    () => scriptImportId === null ? buildEpisodeSourceSignature(episodes) : '',
    [episodes, scriptImportId],
  )
  const remoteEpisodeSignature = useMemo(() => episodes
    .map((episode, position) => `${episode.index ?? position + 1}:${episode.id}`)
    .join('|'), [episodes])
  const sourceSignature = useMemo(
    () => scriptImportId === null
      ? `local:${episodeSourceSignature}`
      : `remote:${scriptImportId}:${remoteEpisodeSignature}`,
    [episodeSourceSignature, remoteEpisodeSignature, scriptImportId],
  )
  const draftKey = useMemo(
    () => getProjectCreationDraftKey(PROJECT_CREATION_DRAFT_KEYS.assets, scriptImportId),
    [scriptImportId],
  )
  const hydrationToken = useMemo(() => ({ draftKey, sourceSignature }), [draftKey, sourceSignature])
  const draftSelectionEditsRef = useRef({ kind: 0, model: 0, resolution: 0 })
  const [restoredDraft] = useState(() =>
    readProjectCreationDraft<AssetsStepDraft>(draftKey))
  const canRestoreDraft = restoredDraft?.sourceSignature === sourceSignature
  const [scope, setScope] = useState<AssetScope>(episodes[0]?.id ?? 'overview')
  const [kind, setKind] = useState<AssetKind>(
    canRestoreDraft && isAssetKind(restoredDraft.kind) ? restoredDraft.kind : 'role',
  )
  const [assets, setAssets] = useState<AssetDraft[]>(() => (
    canRestoreDraft && Array.isArray(restoredDraft.assets)
      ? restoredDraft.assets
      : scriptImportId === null ? extractAssets(episodes) : []
  ))
  const [remoteAssetsByScope, setRemoteAssetsByScope] = useState<RemoteAssetsByScope>({})
  const [hiddenRemoteAssetIds, setHiddenRemoteAssetIds] = useState<Set<string>>(() => new Set(
    canRestoreDraft && Array.isArray(restoredDraft.hiddenRemoteAssetIds)
      ? restoredDraft.hiddenRemoteAssetIds
      : [],
  ))
  const [assetPollingState, setAssetPollingState] = useState(() => createAssetPollingState())
  const [assetPollingRetryToken, setAssetPollingRetryToken] = useState(0)
  const [imageTargetId, setImageTargetId] = useState<string>()
  const [imageTargetSnapshot, setImageTargetSnapshot] = useState<AssetDraft>()
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [localImportWorkspaceOpen, setLocalImportWorkspaceOpen] = useState(false)
  const [localImportName, setLocalImportName] = useState('')
  const [localImportImage, setLocalImportImage] = useState<string>()
  const [localImportFileName, setLocalImportFileName] = useState('')
  const [localImportDragging, setLocalImportDragging] = useState(false)
  const [localImportPreviewOpen, setLocalImportPreviewOpen] = useState(false)
  const [generationWorkspaceOpen, setGenerationWorkspaceOpen] = useState(false)
  const [generationAssetId, setGenerationAssetId] = useState<string>()
  const [generationAssetSnapshot, setGenerationAssetSnapshot] = useState<AssetDraft>()
  const [generationActiveLookId, setGenerationActiveLookId] = useState<number | null>()
  const [assetImageTasks, setAssetImageTasks] = useState<Record<string, AssetImageGenerationViewState>>({})
  const [imageGenerationPreparationPending, setImageGenerationPreparationPending] = useState(false)
  const [unsavedAssetImageOptionKeys, setUnsavedAssetImageOptionKeys] = useState<Set<string>>(
    () => new Set(
      canRestoreDraft && Array.isArray(restoredDraft.unsavedImageOptionKeys)
        ? restoredDraft.unsavedImageOptionKeys
        : [],
    ),
  )
  const [assetImageHistoryByAssetId, setAssetImageHistoryByAssetId] = useState<
    Record<string, AssetImageHistoryBucket>
  >({})
  const [assetImageHistoryRefreshTokens, setAssetImageHistoryRefreshTokens] = useState<
    Record<string, number>
  >({})
  const [assetReferencesByAssetId, setAssetReferencesByAssetId] = useState<
    Record<string, AssetReferenceBucket>
  >({})
  const [assetReferenceRefreshTokens, setAssetReferenceRefreshTokens] = useState<
    Record<string, number>
  >({})
  const [assetGenerationStatusByScope, setAssetGenerationStatusByScope] = useState<
    Record<string, AssetGenerationStatusBucket>
  >({})
  const [batchGenerationState, setBatchGenerationState] = useState(EMPTY_BATCH_GENERATION_STATE)
  const batchAssetImageTasks = batchGenerationState.assets
  const batchStatusRevisionRef = useRef(0)
  const batchCreationBlockedRef = useRef(true)
  const [episodeAssetsGeneratePending, setEpisodeAssetsGeneratePending] = useState(false)
  const assetGenerationStatusByScopeRef = useRef<Record<string, AssetGenerationStatusBucket>>({})
  const [assetGenerationStatusRefreshToken, setAssetGenerationStatusRefreshToken] = useState(0)
  const [assetGenerationEstimateRefreshToken, setAssetGenerationEstimateRefreshToken] = useState(0)
  const activeAssetImageRunsRef = useRef(new Map<string, ActiveAssetImageRun>())
  const assetCardGenerationRequestsRef = useRef(new Map<
    string,
    ReturnType<typeof StudioAssetGenerationApi.requestLooks> | null
  >())
  const activeEpisodeAssetsGenerateRequestRef = useRef<StudioAssetImageTaskRequest<void> | null>(null)
  const confirmedAssetImagesRef = useRef(new Map<string, ConfirmedAssetImage>())
  const assetImageOptionsQueuesRef = useRef(new Map<string, AssetImageOptionsUpdateQueue>())
  const assetImageHistoryRequestRevisionRef = useRef(0)
  const activeAssetImageHistoryKeyRef = useRef<string | null>(null)
  const assetReferenceRequestRevisionRef = useRef(0)
  const assetReferenceUploadRevisionRef = useRef(0)
  const activeAssetReferenceKeyRef = useRef<string | null>(null)
  const activeAssetReferenceUploadRequestRef = useRef<StudioAssetImageTaskRequest<void> | null>(null)
  const assetReferenceUploadInProgressRef = useRef(false)
  const assetListRequestRevisionRef = useRef(0)
  const assetImageRunTokenRef = useRef(0)
  const resolvedAssetImageTaskIdsRef = useRef(new Set<string>())
  const [pendingAssetImageTasks, setPendingAssetImageTasks] = useState<PersistedAssetImageTask[]>(() => (
    (
      readPendingAssetImageTaskSidecar(draftKey)
      ?? normalizePersistedAssetImageTasks(restoredDraft?.pendingImageTasks)
    ).filter((task) => (
      scriptImportId !== null && String(task.scriptImportId) === String(scriptImportId)
    ))
  ))
  const [hydratedDraftToken, setHydratedDraftToken] = useState<typeof hydrationToken>()
  const latestPendingImageTasksRef = useRef(pendingAssetImageTasks)
  latestPendingImageTasksRef.current = pendingAssetImageTasks
  const pendingTasksHydrated = hydratedDraftToken === hydrationToken
  const pendingAssetImageTaskKeys = useMemo(
    () => new Set(pendingAssetImageTasks.map((task) => task.assetKey)),
    [pendingAssetImageTasks],
  )
  const assetImageOperationLocked = (assetKey: string) => (
    !pendingTasksHydrated
    || pendingAssetImageTaskKeys.has(assetKey)
    || currentScopeBatchGenerationActive
    || currentScopeGenerationStatusUncertain
    || (assetKey.startsWith('remote:') && activeLookTaskAssetIds.includes(Number(assetKey.split(':')[3])))
    || isAssetImageTaskLocked(assetImageTasks[assetKey])
    || isAssetImageTaskLocked(batchAssetImageTasks[assetKey])
  )
  const imageSubmissionPending = imageGenerationPreparationPending
    || episodeAssetsGeneratePending
    || Object.values(assetImageTasks).some((task) => task.phase === 'submitting')
  const [personalImportOpen, setPersonalImportOpen] = useState(false)
  const [personalImportTargetId, setPersonalImportTargetId] = useState<string>()
  const [personalImportTargetSnapshot, setPersonalImportTargetSnapshot] = useState<AssetDraft>()
  const [personalAssets, setPersonalAssets] = useState<PersonalAsset[]>([])
  const [personalAssetId, setPersonalAssetId] = useState('')
  const [personalAssetsLoading, setPersonalAssetsLoading] = useState(false)
  const personalAssetsRequestRevisionRef = useRef(0)
  const [personalAssetFilters, setPersonalAssetFilters] = useState(EMPTY_PERSONAL_FILTERS)
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false)
  const [voiceTargetAsset, setVoiceTargetAsset] = useState<AssetDraft>()
  const [model, setModel] = useState(canRestoreDraft ? restoredDraft.model : '')
  const handleModelChange = (value: string) => {
    draftSelectionEditsRef.current.model += 1
    setModel(value)
  }
  const handleKindChange = (value: AssetKind) => {
    draftSelectionEditsRef.current.kind += 1
    setKind(value)
  }
  // 旧草稿的分辨率可能来自旧版自动选择；只有明确的手动选择才覆盖接口默认值。
  const [resolution, setResolution] = useState(
    canRestoreDraft && restoredDraft.resolutionChosenByUser ? restoredDraft.resolution : '',
  )
  const [resolutionChosenByUser, setResolutionChosenByUser] = useState(
    Boolean(canRestoreDraft && restoredDraft.resolutionChosenByUser),
  )
  const handleResolutionChange = (value: string) => {
    draftSelectionEditsRef.current.resolution += 1
    setResolutionChosenByUser(true)
    setResolution(value)
  }
  const [imageModels, setImageModels] = useState<StudioGenerationModel[]>([])
  const [imageModelsLoading, setImageModelsLoading] = useState(true)
  const [imageModelsError, setImageModelsError] = useState<unknown>()
  const [imageModelsRetryToken, setImageModelsRetryToken] = useState(0)
  const [episodeAssetsEstimate, setEpisodeAssetsEstimate] = useState<{
    unitCreditCost: number
    totalCreditCost: number
  }>()
  const [episodeAssetsEstimateLoading, setEpisodeAssetsEstimateLoading] = useState(false)
  const imageModelOptions = useMemo(() => imageModels.map((item) => ({
    value: String(item.id),
    label: item.name,
  })), [imageModels])
  const selectedImageModelById = useMemo(() => imageModels.find(
    (item) => String(item.id) === model,
  ), [imageModels, model])
  const selectedImageModel = selectedImageModelById ?? imageModels.find(
    (item) => item.modelCode === model,
  )
  const imageResolutionValues = useMemo(() => [...new Set(
    (selectedImageModel?.imageCapabilities?.resolutions ?? [])
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0),
  )], [selectedImageModel])
  const imageResolutionOptions = useMemo(() => imageResolutionValues.map((value) => ({
    value: String(value),
    label: `${value}K`,
  })), [imageResolutionValues])
  const imageAspectRatioOptions = useMemo(() => [...new Set(
    (selectedImageModel?.imageCapabilities?.aspectRatios ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  )], [selectedImageModel])
  const selectedImageModelReferenceLimit = useMemo(() => {
    const limit = Number(selectedImageModel?.imageCapabilities?.maxReferenceImages)
    return Number.isFinite(limit) && limit >= 0
      ? Math.floor(limit)
      : undefined
  }, [selectedImageModel])
  const generationUnitCostText = episodeAssetsEstimateLoading && !episodeAssetsEstimate
    ? '…'
    : formatCreditCost(episodeAssetsEstimate?.unitCreditCost)
  const generationTotalCostText = episodeAssetsEstimateLoading && !episodeAssetsEstimate
    ? '…'
    : formatCreditCost(episodeAssetsEstimate?.totalCreditCost)
  const [completedEpisodeIds, setCompletedEpisodeIds] = useState<Set<string>>(() => new Set(
    canRestoreDraft && Array.isArray(restoredDraft.completedEpisodeIds)
      ? restoredDraft.completedEpisodeIds
      : [],
  ))
  const sourceSignatureRef = useRef(sourceSignature)
  const sourceResetPending = sourceSignatureRef.current !== sourceSignature
  const scriptImportIdRef = useRef(scriptImportId)
  const latestSourceSignatureRef = useRef(sourceSignature)
  const latestScriptImportIdRef = useRef(scriptImportId)
  latestSourceSignatureRef.current = sourceSignature
  latestScriptImportIdRef.current = scriptImportId
  const assetPollingGenerationRef = useRef(0)
  const draftPersistenceEnabledRef = useRef(false)
  // A new key/source must not inherit write permission from the previous render.
  if (!pendingTasksHydrated) draftPersistenceEnabledRef.current = false
  const completedEpisodeIdList = useMemo(() => [...completedEpisodeIds], [completedEpisodeIds])

  useEffect(() => {
    assetGenerationStatusByScopeRef.current = assetGenerationStatusByScope
  }, [assetGenerationStatusByScope])
  const hiddenRemoteAssetIdList = useMemo(() => [...hiddenRemoteAssetIds], [hiddenRemoteAssetIds])
  const unsavedAssetImageOptionKeyList = useMemo(
    () => [...unsavedAssetImageOptionKeys],
    [unsavedAssetImageOptionKeys],
  )
  const assetDraft = useMemo<AssetsStepDraft>(() => ({
    sourceSignature,
    kind,
    assets,
    model,
    resolution,
    resolutionChosenByUser,
    completedEpisodeIds: completedEpisodeIdList,
    hiddenRemoteAssetIds: hiddenRemoteAssetIdList,
    unsavedImageOptionKeys: unsavedAssetImageOptionKeyList,
    pendingImageTasks: pendingAssetImageTasks,
  }), [
    assets,
    completedEpisodeIdList,
    hiddenRemoteAssetIdList,
    kind,
    model,
    pendingAssetImageTasks,
    resolution,
    resolutionChosenByUser,
    sourceSignature,
    unsavedAssetImageOptionKeyList,
  ])
  const latestAssetDraftRef = useRef(assetDraft)
  latestAssetDraftRef.current = assetDraft
  const componentMountedRef = useRef(true)

  useEffect(() => {
    onScopeChange?.(scope)
  }, [onScopeChange, scope])

  useEffect(() => {
    componentMountedRef.current = true
    const cardRequests = assetCardGenerationRequestsRef.current
    const imageRuns = activeAssetImageRunsRef.current
    return () => {
      componentMountedRef.current = false
      cardRequests.forEach((request) => request?.cancel())
      cardRequests.clear()
      imageRuns.forEach((run, assetKey) => {
        // 创建请求尚未返回任务 ID 时不能主动取消；让它完成后立即保存任务 ID，
        // 否则后端已经接单而前端丢失 ID 时，用户重试会重复创建并再次扣费。
        if (!run.taskId) return
        if (run.timer !== null) window.clearTimeout(run.timer)
        run.request?.cancel()
        imageRuns.delete(assetKey)
      })
      assetReferenceUploadRevisionRef.current += 1
      assetReferenceUploadInProgressRef.current = false
      activeAssetReferenceUploadRequestRef.current?.cancel()
      activeAssetReferenceUploadRequestRef.current = null
      activeEpisodeAssetsGenerateRequestRef.current?.cancel()
      activeEpisodeAssetsGenerateRequestRef.current = null
    }
  }, [])

  useEffect(() => {
    onImageSubmissionStateChange?.(imageSubmissionPending)
  }, [imageSubmissionPending, onImageSubmissionStateChange])

  useEffect(() => () => {
    onImageSubmissionStateChange?.(false)
  }, [onImageSubmissionStateChange])

  useEffect(() => {
    if (!imageSubmissionPending) return undefined
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [imageSubmissionPending])

  const flushAssetDraft = useProjectCreationDraft(
    draftKey,
    assetDraft,
    350,
    draftPersistenceEnabledRef,
  )

  useEffect(() => {
    let active = true
    setImageModelsLoading(true)
    setImageModelsError(undefined)
    void StudioModelsApi.getImageModels()
      .then((models) => {
        if (!active) return
        if (!models.length) {
          throw new Error(l('暂无可用的图片生成模型', 'No image generation models are available'))
        }
        setImageModels(models)
      })
      .catch((error) => {
        if (!active) return
        setImageModelsError(error)
        message.error(getApiErrorMessage(
          error,
          l('图片生成模型加载失败', 'Failed to load image generation models'),
        ))
      })
      .finally(() => {
        if (active) setImageModelsLoading(false)
      })
    return () => { active = false }
  }, [imageModelsRetryToken, l])

  useEffect(() => {
    if (!pendingTasksHydrated || imageModelsLoading || imageModelsError || !imageModels.length || selectedImageModelById) return
    if (selectedImageModel) {
      setModel(String(selectedImageModel.id))
      return
    }
    const defaultModel = imageModels.find((item) => item.defaultModel) ?? imageModels[0]
    setModel(String(defaultModel.id))
  }, [
    imageModels,
    imageModelsError,
    imageModelsLoading,
    pendingTasksHydrated,
    selectedImageModel,
    selectedImageModelById,
  ])

  useEffect(() => {
    if (!pendingTasksHydrated || !selectedImageModel) return
    const nextResolution = selectImageResolution(
      imageResolutionValues,
      resolutionChosenByUser ? resolution : undefined,
    )
    if (resolution !== nextResolution) setResolution(nextResolution)
  }, [imageResolutionValues, pendingTasksHydrated, resolution, resolutionChosenByUser, selectedImageModel])

  const currentScopeResultSignature = assetGenerationStatusByScope[scope]?.resultSignature
  useEffect(() => {
    const modelId = Number(model)
    const resolutionValue = Number(resolution)
    if (
      scriptImportId === null
      || !Number.isInteger(modelId)
      || modelId <= 0
      || !Number.isInteger(resolutionValue)
      || resolutionValue <= 0
    ) {
      setEpisodeAssetsEstimate(undefined)
      setEpisodeAssetsEstimateLoading(false)
      return undefined
    }

    let active = true
    setEpisodeAssetsEstimateLoading(true)
    const request = StudioAssetGenerationApi.requestEpisodeAssetsGenerateEstimate({
      modelId,
      quality: null,
      resolution: resolutionValue,
      scriptImportId,
      ...(scope === 'overview' ? {} : { episodeId: scope }),
    })

    request.promise
      .then((estimate) => {
        if (!active) return
        setEpisodeAssetsEstimate({
          unitCreditCost: estimate.unitCreditCost,
          totalCreditCost: estimate.totalCreditCost,
        })
      })
      .catch(() => {
        if (!active) return
        setEpisodeAssetsEstimate(undefined)
      })
      .finally(() => {
        if (active) setEpisodeAssetsEstimateLoading(false)
      })

    return () => {
      active = false
      request.cancel()
    }
  }, [assetGenerationEstimateRefreshToken, model, resolution, scope, scriptImportId, currentScopeResultSignature])

  useEffect(() => {
    setBatchGenerationState(EMPTY_BATCH_GENERATION_STATE)
  }, [scope, scriptImportId])

  useEffect(() => {
    if (scriptImportId === null || episodes.length === 0) {
      setAssetGenerationStatusByScope({})
      setCompletedEpisodeIds(new Set())
      onGenerationCompletionStateChange?.(false)
      return undefined
    }

    const selectedEpisode = scope === 'overview'
      ? undefined
      : episodes.find((episode) => episode.id === scope)
    const statusTarget: { key: string; episodeId?: string } | null = scope === 'overview'
      ? { key: 'overview' }
      : selectedEpisode
        ? { key: selectedEpisode.id, episodeId: selectedEpisode.id }
        : null

    if (!statusTarget || episodeAssetsGeneratePending) return undefined
    const revision = ++batchStatusRevisionRef.current
    let lastResultSignature = assetGenerationStatusByScopeRef.current[statusTarget.key]?.resultSignature
    setAssetGenerationStatusByScope((current) => {
      const currentStatus = current[statusTarget.key]
      return {
        ...current,
        [statusTarget.key]: {
          ...currentStatus,
          allGenerated: currentStatus?.allGenerated ?? false,
          shouldPoll: currentStatus?.shouldPoll ?? false,
          loading: true,
        },
      }
    })
    return startBatchGenerationPolling({
      requestStatus: () => {
        const request = StudioAssetGenerationApi.requestEpisodeAssetsGenerateStatus({
          scriptImportId,
          ...(statusTarget.episodeId ? { episodeId: statusTarget.episodeId } : {}),
        })
        return {
          cancel: () => request.cancel(),
          promise: request.promise.then((status) => {
            const ownedTaskIds = new Set(latestPendingImageTasksRef.current.map((task) => task.taskId))
            activeAssetImageRunsRef.current.forEach((run) => { if (run.taskId) ownedTaskIds.add(run.taskId) })
            getActiveAssetLookGenerationTasks().forEach((assetId) => {
              const taskId = getAssetLookGenerationTask(assetId).getSnapshot().taskId
              if (taskId) ownedTaskIds.add(taskId)
            })
            return filterOwnedBatchTasks(status, ownedTaskIds)
          }),
        }
      },
      isCurrent: () => batchStatusRevisionRef.current === revision
        && String(latestScriptImportIdRef.current) === String(scriptImportId),
      onStatus: (status) => {
        const shouldPollAgain = !status.allGenerated && status.shouldPoll
        const resultSignature = getBatchResultSignature(status.items)
        if (lastResultSignature !== undefined && lastResultSignature !== resultSignature) {
          // assets/list describes extraction. Refresh it once when image results change,
          // including partial success/failure, rather than relying on extraction polling.
          setAssetPollingRetryToken((current) => current + 1)
        }
        lastResultSignature = resultSignature
        setBatchGenerationState((current) => buildBatchGenerationState(
          scriptImportId,
          status.items,
          status.allGenerated,
          current,
        ))
        setAssetGenerationStatusByScope((current) => {
          const previous = current[statusTarget.key]
          if (previous?.allGenerated === status.allGenerated
            && previous.shouldPoll === shouldPollAgain && !previous.loading && !previous.error
            && previous.resultSignature === resultSignature) return current
          return { ...current, [statusTarget.key]: {
            allGenerated: status.allGenerated,
            shouldPoll: shouldPollAgain,
            loading: false,
            resultSignature,
          } }
        })
        if (statusTarget.key === 'overview') {
          onGenerationCompletionStateChange?.(status.allGenerated)
          if (status.allGenerated) setCompletedEpisodeIds((current) => {
            if (current.size === episodes.length && episodes.every((episode) => current.has(episode.id))) return current
            return new Set(episodes.map((episode) => episode.id))
          })
        } else {
          setCompletedEpisodeIds((current) => {
            if (current.has(statusTarget.key) === status.allGenerated) return current
            const next = new Set(current)
            if (status.allGenerated) next.add(statusTarget.key)
            else next.delete(statusTarget.key)
            return next
          })
        }
      },
      onError: (error) => {
        setAssetGenerationStatusByScope((current) => ({
          ...current,
          [statusTarget.key]: {
            ...current[statusTarget.key],
            allGenerated: false,
            shouldPoll: current[statusTarget.key]?.shouldPoll ?? false,
            loading: false,
            error,
          },
        }))
        if (statusTarget.key === 'overview') onGenerationCompletionStateChange?.(false)
      },
    })
  }, [
    assetGenerationStatusRefreshToken,
    episodeAssetsGeneratePending,
    episodes,
    onGenerationCompletionStateChange,
    scope,
    scriptImportId,
  ])

  useEffect(() => {
    // Capture the baseline only after a source change has cleared the previous source's state.
    if (sourceResetPending) return
    let active = true
    draftPersistenceEnabledRef.current = false
    const hydrationBaseline = latestAssetDraftRef.current
    const selectionBaseline = { ...draftSelectionEditsRef.current }
    const compactDraft = readProjectCreationDraft<AssetsStepDraft>(draftKey)
    void readFullProjectCreationDraft<AssetsStepDraft>(draftKey)
      .then((fullDraft) => {
        if (!active) return
        const restoredPendingTasks = (
          readPendingAssetImageTaskSidecar(draftKey)
          ?? normalizePersistedAssetImageTasks(
            fullDraft === undefined ? compactDraft?.pendingImageTasks : fullDraft.pendingImageTasks,
          )
        ).filter((task) => (
          scriptImportId !== null
          && String(task.scriptImportId) === String(scriptImportId)
          && !resolvedAssetImageTaskIdsRef.current.has(task.taskId)
        ))
        writePendingAssetImageTaskSidecar(draftKey, restoredPendingTasks)
        setPendingAssetImageTasks((current) => {
          const restored = new Map(restoredPendingTasks.map((task) => [task.assetKey, task]))
          current.forEach((task) => {
            const activeRun = activeAssetImageRunsRef.current.get(task.assetKey)
            if (activeRun?.taskId === task.taskId) restored.set(task.assetKey, task)
          })
          return [...restored.values()]
        })
        const compactCanRestore = compactDraft?.sourceSignature === sourceSignature
          && Array.isArray(compactDraft.assets)
        const fullCanRestore = fullDraft?.sourceSignature === sourceSignature
          && Array.isArray(fullDraft.assets)
        // Compact data is not necessarily in state after a source reset. Restore both
        // storage paths consistently, preferring IndexedDB's full image data.
        const nextDraft = fullCanRestore ? fullDraft : compactCanRestore ? compactDraft : undefined
        if (!nextDraft) return
        setAssets((current) => mergeHydratedAssets(nextDraft.assets, hydrationBaseline.assets, current))
        if (draftSelectionEditsRef.current.kind === selectionBaseline.kind && isAssetKind(nextDraft.kind)) {
          setKind(nextDraft.kind)
        }
        const modelUnchanged = draftSelectionEditsRef.current.model === selectionBaseline.model
        if (modelUnchanged && typeof nextDraft.model === 'string' && nextDraft.model) setModel(nextDraft.model)
        if (modelUnchanged
          && draftSelectionEditsRef.current.resolution === selectionBaseline.resolution
          && nextDraft.resolutionChosenByUser && typeof nextDraft.resolution === 'string' && nextDraft.resolution) {
          setResolutionChosenByUser(true)
          setResolution(nextDraft.resolution)
        }
        setHiddenRemoteAssetIds((current) => mergeHydratedIds(
          Array.isArray(nextDraft.hiddenRemoteAssetIds) ? nextDraft.hiddenRemoteAssetIds : [],
          hydrationBaseline.hiddenRemoteAssetIds,
          current,
        ))
        setUnsavedAssetImageOptionKeys((current) => mergeHydratedIds(
          Array.isArray(nextDraft.unsavedImageOptionKeys) ? nextDraft.unsavedImageOptionKeys : [],
          hydrationBaseline.unsavedImageOptionKeys,
          current,
        ))
      })
      .finally(() => {
        if (!active) return
        // The following render must commit restored state before any draft can be written.
        setHydratedDraftToken(hydrationToken)
      })
    return () => { active = false }
  }, [draftKey, hydrationToken, scriptImportId, sourceSignature, sourceResetPending])

  useEffect(() => {
    if (!pendingTasksHydrated) return
    draftPersistenceEnabledRef.current = true
    flushAssetDraft()
  }, [flushAssetDraft, pendingTasksHydrated])

  const currentScopeGenerationCompleted = assetGenerationStatusByScope[scope]?.allGenerated ?? false

  useEffect(() => {
    if (sourceSignatureRef.current === sourceSignature) return
    const previousScriptImportId = scriptImportIdRef.current
    sourceSignatureRef.current = sourceSignature
    scriptImportIdRef.current = scriptImportId
    const sameRemoteScript = previousScriptImportId !== null
      && scriptImportId !== null
      && String(previousScriptImportId) === String(scriptImportId)
    if (sameRemoteScript) {
      activeAssetImageRunsRef.current.forEach((run) => {
        run.sourceSignature = sourceSignature
        run.episodes = episodes
      })
      setPendingAssetImageTasks((current) => current.map((task) => (
        String(task.scriptImportId) === String(scriptImportId)
          ? { ...task, sourceSignature }
          : task
      )))
    } else {
      activeAssetImageRunsRef.current.forEach((run, assetKey) => {
        // 尚在创建任务的请求继续完成并写回原剧本的 sidecar，避免切换数据源时丢失任务 ID。
        if (!run.taskId) return
        if (run.timer !== null) window.clearTimeout(run.timer)
        run.request?.cancel()
        activeAssetImageRunsRef.current.delete(assetKey)
      })
      assetImageOptionsQueuesRef.current.forEach((queue, queueKey) => {
        if (!queue.processing) assetImageOptionsQueuesRef.current.delete(queueKey)
      })
      confirmedAssetImagesRef.current.clear()
      resolvedAssetImageTaskIdsRef.current.clear()
      setAssetImageTasks({})
      setBatchGenerationState(EMPTY_BATCH_GENERATION_STATE)
      setAssetImageHistoryByAssetId({})
      setAssetImageHistoryRefreshTokens({})
      setAssetReferencesByAssetId({})
      setAssetReferenceRefreshTokens({})
      setAssetGenerationStatusByScope({})
      setPendingAssetImageTasks([])
      setUnsavedAssetImageOptionKeys(new Set())
    }
    setScope(episodes[0]?.id ?? 'overview')
    setKind('role')
    setAssets(scriptImportId === null ? extractAssets(episodes) : [])
    setRemoteAssetsByScope({})
    setHiddenRemoteAssetIds(new Set())
    setCompletedEpisodeIds(new Set())
    setGenerationWorkspaceOpen(false)
    setGenerationAssetId(undefined)
    setGenerationAssetSnapshot(undefined)
    setPersonalImportOpen(false)
    personalAssetsRequestRevisionRef.current += 1
    setPersonalImportTargetId(undefined)
    setPersonalImportTargetSnapshot(undefined)
    setImageTargetId(undefined)
    setImageTargetSnapshot(undefined)
    setLocalImportWorkspaceOpen(false)
    setLocalImportPreviewOpen(false)
    setLocalImportName('')
    setLocalImportImage(undefined)
    setLocalImportFileName('')
    setLocalImportDragging(false)
    setVoiceLibraryOpen(false)
    setVoiceTargetAsset(undefined)
  }, [episodes, scriptImportId, sourceSignature])

  useEffect(() => {
    const selectedEpisode = scope === 'overview'
      ? undefined
      : episodes.find((episode) => episode.id === scope)
    const pollingScopeId: AssetScope | null = scope === 'overview'
      ? 'overview'
      : selectedEpisode?.id ?? null
    const generation = ++assetPollingGenerationRef.current

    if (scriptImportId === null || pollingScopeId === null) {
      setAssetPollingState(createAssetPollingState(pollingScopeId))
      return () => {
        if (assetPollingGenerationRef.current === generation) {
          assetPollingGenerationRef.current += 1
        }
      }
    }

    let disposed = false
    let startTimer: number | null = null
    const timers = new Map<StudioScriptAssetType, number>()
    const requests = new Map<StudioScriptAssetType, StudioScriptAssetListRequest>()
    const loadedAssetTypes = new Set<StudioScriptAssetType>()
    const isActive = () => !disposed && assetPollingGenerationRef.current === generation
    const generationCompleted = () => (
      assetGenerationStatusByScopeRef.current[pollingScopeId]?.allGenerated ?? false
    )
    const patchLane = (assetType: StudioScriptAssetType, patch: Partial<AssetPollingLane>) => {
      if (!isActive()) return
      setAssetPollingState((current) => {
        if (current.scopeId !== pollingScopeId) return current
        const currentLane = current.lanes[assetType]
        if (Object.entries(patch).every(([key, value]) => (
          currentLane[key as keyof AssetPollingLane] === value
        ))) return current
        return {
          scopeId: current.scopeId,
          lanes: {
            ...current.lanes,
            [assetType]: { ...currentLane, ...patch },
          },
        }
      })
    }
    const scheduleLane = (
      assetType: StudioScriptAssetType,
      failureCount: number,
      delayMs: number,
    ): void => {
      if (!isActive()) return
      if (generationCompleted()) {
        patchLane(assetType, { loading: false, polling: false })
        return
      }
      const timer = window.setTimeout(() => {
        timers.delete(assetType)
        void runLane(assetType, failureCount)
      }, delayMs)
      timers.set(assetType, timer)
    }
    const runLane = async (
      assetType: StudioScriptAssetType,
      failureCount = 0,
    ): Promise<void> => {
      if (!isActive()) return

      patchLane(assetType, { loading: !loadedAssetTypes.has(assetType), polling: true })
      const requestRevision = ++assetListRequestRevisionRef.current
      const request = StudioScriptsApi.requestAssetList({
        scriptImportId,
        chapterId: selectedEpisode?.id,
        assetType,
      })
      requests.set(assetType, request)

      try {
        const result = await request.promise
        if (!isActive() || requests.get(assetType) !== request) return

        const assetKind = ASSET_KIND_BY_TYPE[assetType]
        const nextAssets = mapRemoteAssets(
          result,
          assetType,
          scriptImportId,
          selectedEpisode?.id,
          episodes,
        )
        loadedAssetTypes.add(assetType)
        setRemoteAssetsByScope((current) => {
          const currentScopeAssets = current[pollingScopeId] ?? {}
          const currentAssetsById = new Map(
            (currentScopeAssets[assetKind] ?? []).map((asset) => [asset.id, asset]),
          )
          const guardedNextAssets = nextAssets.map((asset) => {
            const confirmed = confirmedAssetImagesRef.current.get(asset.id)
            const cached = currentAssetsById.get(asset.id)
            if (confirmed && requestRevision > confirmed.laneRevision) {
              confirmedAssetImagesRef.current.delete(asset.id)
              return asset
            }
            if (
              !confirmed
              || !cached
              || !confirmedAssetImageMatches(cached, confirmed)
              || confirmedAssetImageMatches(asset, confirmed)
            ) return asset
            return {
              ...asset,
              imageUrl: cached.imageUrl,
              coverFileId: cached.coverFileId,
              updatedAt: cached.updatedAt,
            }
          })
          if (sameRemoteAssetList(currentScopeAssets[assetKind], guardedNextAssets)) return current
          return {
            [pollingScopeId]: {
              ...currentScopeAssets,
              [assetKind]: guardedNextAssets,
            },
          }
        })
        const resultErrorMessage = result.errorMessage?.trim() || ''
        const terminalStatusError = !result.polling && result.extractionStatus !== 3
          ? resultErrorMessage || l(
            `资产生成未成功（${result.extractionStatusName || result.extractionStatus}），请重试`,
            `Asset generation did not complete (${result.extractionStatusName || result.extractionStatus}). Retry.`,
          )
          : resultErrorMessage
        const shouldContinuePolling = result.polling && !generationCompleted()
        patchLane(assetType, {
          loaded: true,
          loading: false,
          polling: shouldContinuePolling,
          extractionStatus: result.extractionStatus,
          statusName: result.extractionStatusName?.trim() || '',
          errorMessage: terminalStatusError,
        })
        if (shouldContinuePolling) {
          scheduleLane(assetType, 0, ASSET_POLL_INTERVAL_MS)
        }
      } catch (error) {
        if (!isActive()) return
        const nextFailureCount = failureCount + 1
        const status = getErrorStatus(error)
        const shouldStop = generationCompleted()
          || status === 401
          || status === 403
          || nextFailureCount >= ASSET_POLL_MAX_FAILURES
        patchLane(assetType, {
          loading: false,
          polling: !shouldStop,
          errorMessage: getPollingErrorMessage(error),
        })
        if (!shouldStop) {
          const retryDelay = Math.min(
            ASSET_POLL_INTERVAL_MS * 2 ** (nextFailureCount - 1),
            12_000,
          )
          scheduleLane(assetType, nextFailureCount, retryDelay)
        }
      } finally {
        if (requests.get(assetType) === request) requests.delete(assetType)
      }
    }

    setAssetPollingState(createAssetPollingState(pollingScopeId, true))
    setRemoteAssetsByScope((current) => ({
      [pollingScopeId]: current[pollingScopeId] ?? {},
    }))
    startTimer = window.setTimeout(() => {
      startTimer = null
      ASSET_TYPES.forEach((assetType) => void runLane(assetType))
    }, 0)

    return () => {
      disposed = true
      if (assetPollingGenerationRef.current === generation) {
        assetPollingGenerationRef.current += 1
      }
      if (startTimer !== null) window.clearTimeout(startTimer)
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
      requests.forEach((request) => request.cancel())
      requests.clear()
    }
  }, [assetPollingRetryToken, currentScopeGenerationCompleted, episodes, l, scope, scriptImportId, sourceSignature])

  useEffect(() => {
    if (!localImportWorkspaceOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (localImportPreviewOpen) {
        setLocalImportPreviewOpen(false)
        return
      }
      setLocalImportWorkspaceOpen(false)
      setLocalImportName('')
      setLocalImportImage(undefined)
      setLocalImportFileName('')
      setLocalImportDragging(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [localImportPreviewOpen, localImportWorkspaceOpen])

  const remoteScopedAssets = useMemo(() => {
    const remoteAssets = Object.values(remoteAssetsByScope[scope] ?? {})
      .flatMap((items) => items ?? [])
    const deduplicated = new Map<string, AssetDraft>()
    remoteAssets.forEach((asset) => {
      const existing = deduplicated.get(asset.id)
      deduplicated.set(asset.id, existing
        ? {
          ...existing,
          ...asset,
          episodeIds: [...new Set([...existing.episodeIds, ...asset.episodeIds])],
        }
        : asset)
    })
    return [...deduplicated.values()]
  }, [remoteAssetsByScope, scope])
  const scopedAssets = useMemo(() => {
    const merged = new Map(remoteScopedAssets.map((asset) => [asset.id, asset]))
    const remoteAssetIds = new Set(merged.keys())
    assets
      .filter((item) => (
        item.source === 'remote'
          ? remoteAssetIds.has(item.id)
          : scope === 'overview'
            || item.episodeIds.length === 0
            || item.episodeIds.includes(scope)
      ))
      .forEach((asset) => {
        const remoteAsset = merged.get(asset.id)
        if (!remoteAsset) {
          merged.set(asset.id, asset)
          return
        }

        const overrideFields = new Set<AssetOverrideField>(
          asset.overrideFields ?? ['name', 'prompt', 'imageUrl'],
        )
        const mergedAsset: AssetDraft = {
          ...remoteAsset,
          source: 'remote',
          overrideFields: [...overrideFields],
          episodeIds: [...new Set([...remoteAsset.episodeIds, ...asset.episodeIds])],
        }
        if (overrideFields.has('name')) mergedAsset.name = asset.name
        if (overrideFields.has('prompt')) mergedAsset.prompt = asset.prompt
        if (overrideFields.has('imageUrl')) {
          mergedAsset.imageUrl = asset.imageUrl
          if (asset.imageUrl !== remoteAsset.imageUrl) mergedAsset.coverFileId = undefined
        }
        if (overrideFields.has('styleName')) mergedAsset.styleName = asset.styleName
        if (overrideFields.has('visualStyleId')) mergedAsset.visualStyleId = asset.visualStyleId
        if (overrideFields.has('aspectRatio')) mergedAsset.aspectRatio = asset.aspectRatio
        merged.set(asset.id, mergedAsset)
      })
    return [...merged.values()].filter((asset) => !hiddenRemoteAssetIds.has(asset.id))
  }, [assets, hiddenRemoteAssetIds, remoteScopedAssets, scope])
  const counts = useMemo(() => ({
    role: scopedAssets.filter((item) => item.kind === 'role').length,
    scene: scopedAssets.filter((item) => item.kind === 'scene').length,
    prop: scopedAssets.filter((item) => item.kind === 'prop').length,
  }), [scopedAssets])
  const visibleAssets = useMemo(
    () => scopedAssets.filter((item) => item.kind === kind),
    [kind, scopedAssets],
  )
  const currentAssetGenerationStatus = assetGenerationStatusByScope[scope]
  const currentScopeGenerationStatusUncertain = scriptImportId !== null && (
    !currentAssetGenerationStatus || currentAssetGenerationStatus.loading || Boolean(currentAssetGenerationStatus.error)
  )
  // Restore ownership for every asset in this scope, including hidden scene/prop tabs.
  const scopedLookTaskAssetIds = useMemo(() => new Set(scopedAssets.flatMap((asset) => {
    const assetId = getBackendAssetId(asset.backendAssetId)
    if (assetId === null) return []
    getAssetLookGenerationTask(assetId)
    return [assetId]
  })), [scopedAssets])
  const activeLookTaskAssetIds = useSyncExternalStore(
    subscribeAssetLookGenerationTasks,
    getActiveAssetLookGenerationTasks,
    getActiveAssetLookGenerationTasks,
  )
  const singleAssetGenerationActive = useMemo(
    () => !pendingTasksHydrated || pendingAssetImageTasks.length > 0
      || imageGenerationPreparationPending
      || Object.values(assetImageTasks).some(isAssetImageTaskLocked)
      || activeLookTaskAssetIds.some((id) => scopedLookTaskAssetIds.has(id)),
    [assetImageTasks, pendingTasksHydrated, pendingAssetImageTasks, imageGenerationPreparationPending, scopedLookTaskAssetIds, activeLookTaskAssetIds],
  )
  const currentScopeBatchGenerationActive = episodeAssetsGeneratePending
    || Boolean(currentAssetGenerationStatus?.shouldPoll)
    || scopedAssets.some((asset) => isAssetImageTaskActive(batchAssetImageTasks[asset.id]))
  batchCreationBlockedRef.current = currentScopeBatchGenerationActive || currentScopeGenerationStatusUncertain
  const visiblePersonalAssets = useMemo(() => personalAssets.filter((item) => (
    (personalAssetFilters.gender === 'all' || item.gender === personalAssetFilters.gender)
    && (personalAssetFilters.style === 'all' || item.style === personalAssetFilters.style)
    && (personalAssetFilters.age === 'all' || item.age === personalAssetFilters.age)
    && (personalAssetFilters.region === 'all' || item.region === personalAssetFilters.region)
  )), [personalAssetFilters, personalAssets])

  const currentEpisode = episodes.find((episode) => episode.id === scope)
  const generationAsset = scopedAssets.find((asset) => asset.id === generationAssetId)
    ?? (generationAssetSnapshot?.id === generationAssetId ? generationAssetSnapshot : undefined)
  const generationImageOptionsQueueKey = generationAsset && scriptImportId !== null
    ? getAssetImageOptionsQueueKey(scriptImportId, generationAsset.id)
    : undefined
  const generationImageOptionsQueue = generationImageOptionsQueueKey
    ? assetImageOptionsQueuesRef.current.get(generationImageOptionsQueueKey)
    : undefined
  const generationLatestImageOptions = generationImageOptionsQueue?.latestInput
  const generationBackendAssetId = getBackendAssetId(generationAsset?.backendAssetId)
  const generationAssetKind = generationAsset?.kind
  const generationHistoryLookReady = generationAssetKind === 'role'
    ? generationActiveLookId !== undefined
    : true
  const generationHistoryLookId = generationAssetKind === 'role'
    ? generationActiveLookId
    : undefined
  const generationAssetImageHistoryKey = generationBackendAssetId === null
    || scriptImportId === null
    || !generationHistoryLookReady
    ? undefined
    : getAssetImageHistoryKey(scriptImportId, generationBackendAssetId, generationHistoryLookId)
  const generationAssetImageHistory = generationAssetImageHistoryKey
    ? assetImageHistoryByAssetId[generationAssetImageHistoryKey]
    : undefined
  const generationAssetImageHistoryRefreshToken = generationAssetImageHistoryKey
    ? assetImageHistoryRefreshTokens[generationAssetImageHistoryKey] ?? 0
    : 0
  const generationAssetReferenceKey = generationBackendAssetId === null
    ? undefined
    : getAssetReferenceKey(generationBackendAssetId)
  const generationAssetReferences = generationAssetReferenceKey
    ? assetReferencesByAssetId[generationAssetReferenceKey]
    : undefined
  const generationAssetReferenceRefreshToken = generationAssetReferenceKey
    ? assetReferenceRefreshTokens[generationAssetReferenceKey] ?? 0
    : 0
  activeAssetImageHistoryKeyRef.current = generationWorkspaceOpen
    ? generationAssetImageHistoryKey ?? null
    : null
  activeAssetReferenceKeyRef.current = generationWorkspaceOpen
    ? generationAssetReferenceKey ?? null
    : null

  useEffect(() => {
    if (
      !generationWorkspaceOpen
      || generationBackendAssetId === null
      || !generationAssetImageHistoryKey
    ) return undefined

    const assetId = generationBackendAssetId
    const lookId = generationHistoryLookId
    const assetKey = generationAssetImageHistoryKey
    const requestSourceSignature = sourceSignature
    const requestRevision = ++assetImageHistoryRequestRevisionRef.current
    let active = true
    setAssetImageHistoryByAssetId((current) => ({
      ...current,
      [assetKey]: {
        items: current[assetKey]?.items ?? [],
        loading: true,
      },
    }))
    const request = StudioAssetGenerationApi.requestImageHistory(assetId, lookId)
    void request.promise.then(
      (items) => {
        if (
          !active
          || assetImageHistoryRequestRevisionRef.current !== requestRevision
          || activeAssetImageHistoryKeyRef.current !== assetKey
          || latestSourceSignatureRef.current !== requestSourceSignature
        ) return
        setAssetImageHistoryByAssetId((current) => ({
          ...current,
          [assetKey]: { items, loading: false },
        }))
      },
      (error) => {
        if (
          !active
          || isCancelledRequestError(error)
          || assetImageHistoryRequestRevisionRef.current !== requestRevision
          || activeAssetImageHistoryKeyRef.current !== assetKey
          || latestSourceSignatureRef.current !== requestSourceSignature
        ) return
        setAssetImageHistoryByAssetId((current) => ({
          ...current,
          [assetKey]: {
            items: current[assetKey]?.items ?? [],
            loading: false,
            error,
          },
        }))
      },
    )

    return () => {
      active = false
      request.cancel()
    }
  }, [
    generationAssetImageHistoryRefreshToken,
    generationAssetImageHistoryKey,
    generationActiveLookId,
    generationAssetKind,
    generationBackendAssetId,
    generationHistoryLookId,
    generationWorkspaceOpen,
    sourceSignature,
  ])

  useEffect(() => {
    if (
      !generationWorkspaceOpen
      || generationBackendAssetId === null
      || !generationAssetReferenceKey
    ) return undefined

    const assetId = generationBackendAssetId
    const assetKey = generationAssetReferenceKey
    const requestSourceSignature = sourceSignature
    const requestRevision = ++assetReferenceRequestRevisionRef.current
    let active = true
    setAssetReferencesByAssetId((current) => ({
      ...current,
      [assetKey]: {
        items: current[assetKey]?.items ?? [],
        total: current[assetKey]?.total ?? current[assetKey]?.items.length ?? 0,
        maxCount: current[assetKey]?.maxCount ?? 14,
        loading: true,
      },
    }))
    const request = StudioAssetGenerationApi.requestReferenceList(assetId)
    void request.promise.then(
      (result) => {
        if (
          !active
          || assetReferenceRequestRevisionRef.current !== requestRevision
          || activeAssetReferenceKeyRef.current !== assetKey
          || latestSourceSignatureRef.current !== requestSourceSignature
        ) return
        setAssetReferencesByAssetId((current) => ({
          ...current,
          [assetKey]: {
            items: result.list,
            total: result.total,
            maxCount: result.maxCount,
            loading: false,
          },
        }))
      },
      (error) => {
        if (
          !active
          || isCancelledRequestError(error)
          || assetReferenceRequestRevisionRef.current !== requestRevision
          || activeAssetReferenceKeyRef.current !== assetKey
          || latestSourceSignatureRef.current !== requestSourceSignature
        ) return
        setAssetReferencesByAssetId((current) => ({
          ...current,
          [assetKey]: {
            items: current[assetKey]?.items ?? [],
            total: current[assetKey]?.total ?? current[assetKey]?.items.length ?? 0,
            maxCount: current[assetKey]?.maxCount ?? 14,
            loading: false,
            error,
          },
        }))
      },
    )

    return () => {
      active = false
      request.cancel()
    }
  }, [
    generationAssetReferenceKey,
    generationAssetReferenceRefreshToken,
    generationBackendAssetId,
    generationWorkspaceOpen,
    sourceSignature,
  ])

  useEffect(() => {
    if (!generationWorkspaceOpen || !generationAssetReferenceKey) return undefined
    return () => {
      assetReferenceUploadRevisionRef.current += 1
      assetReferenceUploadInProgressRef.current = false
      activeAssetReferenceUploadRequestRef.current?.cancel()
      activeAssetReferenceUploadRequestRef.current = null
    }
  }, [generationAssetReferenceKey, generationWorkspaceOpen, sourceSignature])

  const uploadGenerationAssetReferences = async (files: File[]) => {
    if (!files.length) return
    if (generationBackendAssetId === null || !generationAssetReferenceKey) {
      throw new Error(l(
        '缺少可上传参考图的角色资产 ID',
        'Missing character asset ID for reference image upload',
      ))
    }
    if (assetReferenceUploadInProgressRef.current) {
      throw new Error(l('参考图正在上传，请稍候', 'Reference images are already uploading'))
    }

    const assetId = generationBackendAssetId
    const assetKey = generationAssetReferenceKey
    const requestSourceSignature = sourceSignature
    const requestRevision = ++assetReferenceUploadRevisionRef.current
    let firstError: unknown
    let uploadedCount = 0
    assetReferenceUploadInProgressRef.current = true

    try {
      for (const file of files) {
        if (
          assetReferenceUploadRevisionRef.current !== requestRevision
          || activeAssetReferenceKeyRef.current !== assetKey
          || latestSourceSignatureRef.current !== requestSourceSignature
        ) return
        const request = StudioAssetGenerationApi.requestReferenceUpload(assetId, file)
        activeAssetReferenceUploadRequestRef.current = request
        try {
          await request.promise
          uploadedCount += 1
        } catch (error) {
          if (isCancelledRequestError(error)) return
          firstError ??= error
        } finally {
          if (activeAssetReferenceUploadRequestRef.current === request) {
            activeAssetReferenceUploadRequestRef.current = null
          }
        }
      }
    } finally {
      if (assetReferenceUploadRevisionRef.current === requestRevision) {
        assetReferenceUploadInProgressRef.current = false
      }
    }

    if (
      activeAssetReferenceKeyRef.current === assetKey
      && latestSourceSignatureRef.current === requestSourceSignature
      && uploadedCount > 0
    ) {
      setAssetReferenceRefreshTokens((current) => ({
        ...current,
        [assetKey]: (current[assetKey] ?? 0) + 1,
      }))
    }
    if (firstError) throw firstError
    if (uploadedCount === 0) {
      throw new Error(l('参考图未上传成功', 'Reference image was not uploaded'))
    }
  }

  const attachGenerationAssetReferences = async (fileIds: string[]) => {
    const normalizedFileIds = [...new Set(fileIds.map((fileId) => fileId.trim()).filter(Boolean))]
    if (!normalizedFileIds.length) return
    if (generationBackendAssetId === null || !generationAssetReferenceKey) {
      throw new Error(l(
        '缺少可添加参考图的角色资产 ID',
        'Missing character asset ID for reference image attach',
      ))
    }
    if (assetReferenceUploadInProgressRef.current) {
      throw new Error(l('参考图正在上传，请稍候', 'Reference images are already uploading'))
    }

    const assetId = generationBackendAssetId
    const assetKey = generationAssetReferenceKey
    const requestSourceSignature = sourceSignature
    const requestRevision = ++assetReferenceUploadRevisionRef.current
    let firstError: unknown
    let attachedCount = 0
    assetReferenceUploadInProgressRef.current = true

    try {
      for (const fileId of normalizedFileIds) {
        if (
          assetReferenceUploadRevisionRef.current !== requestRevision
          || activeAssetReferenceKeyRef.current !== assetKey
          || latestSourceSignatureRef.current !== requestSourceSignature
        ) return
        const request = StudioAssetGenerationApi.requestReferenceAttach(assetId, fileId)
        activeAssetReferenceUploadRequestRef.current = request
        try {
          await request.promise
          attachedCount += 1
        } catch (error) {
          if (isCancelledRequestError(error)) return
          firstError ??= error
        } finally {
          if (activeAssetReferenceUploadRequestRef.current === request) {
            activeAssetReferenceUploadRequestRef.current = null
          }
        }
      }
    } finally {
      if (assetReferenceUploadRevisionRef.current === requestRevision) {
        assetReferenceUploadInProgressRef.current = false
      }
    }

    if (
      activeAssetReferenceKeyRef.current === assetKey
      && latestSourceSignatureRef.current === requestSourceSignature
      && attachedCount > 0
    ) {
      setAssetReferenceRefreshTokens((current) => ({
        ...current,
        [assetKey]: (current[assetKey] ?? 0) + 1,
      }))
    }
    if (firstError) throw firstError
    if (attachedCount === 0) {
      throw new Error(l('参考图未添加成功', 'Reference image was not added'))
    }
  }

  const setGenerationAssetPrimaryImage = async (
    asset: AssetDraft,
    item: StudioAssetImageHistoryItem,
  ) => {
    const assetId = getBackendAssetId(asset.backendAssetId)
    const versionId = Number(item.versionId)
    const lookId = Number(item.lookId ?? generationActiveLookId)
    if (
      assetId === null
      || !Number.isInteger(versionId)
      || versionId <= 0
      || !Number.isInteger(lookId)
      || lookId <= 0
    ) {
      throw new Error(l('缺少可设置主图的资产、造型或版本 ID', 'Missing asset, look, or version ID for primary image'))
    }

    const requestSourceSignature = sourceSignature
    const request = StudioAssetGenerationApi.requestSetPrimaryImage({ assetId, versionId, lookId })
    await request.promise
    if (!componentMountedRef.current || latestSourceSignatureRef.current !== requestSourceSignature) return
    // A look's primary image is not necessarily this episode's selected cover.
    // Let assets/list resolve the episode cover instead of overwriting every scope.
    setAssetPollingRetryToken((current) => current + 1)

    if (generationAssetImageHistoryKey) {
      const assetKey = generationAssetImageHistoryKey
      setAssetImageHistoryByAssetId((current) => {
        const bucket = current[assetKey]
        if (!bucket) return current
        const updatedItems = bucket.items.map((historyItem) => ({
          ...historyItem,
          isCurrent: historyItem.versionId !== undefined
            && String(historyItem.versionId) === String(item.versionId),
        }))
        return {
          ...current,
          [assetKey]: {
            ...bucket,
            items: updatedItems,
            error: undefined,
          },
        }
      })
      setAssetImageHistoryRefreshTokens((current) => ({
        ...current,
        [assetKey]: (current[assetKey] ?? 0) + 1,
      }))
    }
  }

  const totalAssets = scopedAssets.length
  const saveAssetOverride = (asset: AssetDraft, changedFields: AssetOverrideField[]) => {
    setAssets((current) => {
      const existingIndex = current.findIndex((item) => item.id === asset.id)
      if (asset.source !== 'remote') {
        if (existingIndex < 0) return [...current, asset]
        return current.map((item, index) => index === existingIndex ? asset : item)
      }

      const existing = existingIndex >= 0 ? current[existingIndex] : undefined
      const overrideFields = [...new Set([
        ...(existing?.overrideFields ?? []),
        ...changedFields,
      ])]
      const nextOverride: AssetDraft = {
        id: asset.id,
        backendAssetId: asset.backendAssetId,
        kind: asset.kind,
        name: existing?.name ?? asset.name,
        episodeIds: [...new Set([...(existing?.episodeIds ?? []), ...asset.episodeIds])],
        source: 'remote',
        overrideFields,
      }
      if (overrideFields.includes('name')) {
        nextOverride.name = changedFields.includes('name') ? asset.name : existing?.name ?? asset.name
      }
      if (overrideFields.includes('prompt')) {
        nextOverride.prompt = changedFields.includes('prompt') ? asset.prompt : existing?.prompt
      }
      if (overrideFields.includes('imageUrl')) {
        nextOverride.imageUrl = changedFields.includes('imageUrl') ? asset.imageUrl : existing?.imageUrl
      }
      if (overrideFields.includes('styleName')) {
        nextOverride.styleName = changedFields.includes('styleName') ? asset.styleName : existing?.styleName
      }
      if (overrideFields.includes('visualStyleId')) {
        nextOverride.visualStyleId = changedFields.includes('visualStyleId')
          ? asset.visualStyleId
          : existing?.visualStyleId
      }
      if (overrideFields.includes('aspectRatio')) {
        nextOverride.aspectRatio = changedFields.includes('aspectRatio')
          ? asset.aspectRatio
          : existing?.aspectRatio
      }
      if (existingIndex < 0) return [...current, nextOverride]
      return current.map((item, index) => index === existingIndex ? nextOverride : item)
    })
  }

  const drainAssetImageOptionsQueue = async (
    queue: AssetImageOptionsUpdateQueue,
  ): Promise<void> => {
    if (queue.processing) return
    queue.processing = true
    try {
      while (queue.appliedRevision < queue.latestRevision) {
        const revision = queue.latestRevision
        const asset = queue.latestAsset
        const input = queue.latestInput
        const backendAssetId = getBackendAssetId(asset.backendAssetId)
        if (backendAssetId === null) {
          const error = new Error(l(
            '当前资产还没有后端资产 ID，无法保存图片设置',
            'This asset does not have a backend asset ID, so its image settings cannot be saved',
          ))
          const failedWaiters = queue.waiters.filter((waiter) => waiter.revision <= revision)
          queue.waiters = queue.waiters.filter((waiter) => waiter.revision > revision)
          failedWaiters.forEach((waiter) => waiter.reject(error))
          break
        }

        try {
          const updateRequest = StudioAssetGenerationApi.requestUpdateImageOptions({
            id: backendAssetId,
            prompt: input.prompt,
            lookId: input.lookId,
            aspectRatio: input.aspectRatio,
            visualStyleId: input.visualStyleId,
          })
          await new Promise<void>((resolve, reject) => {
            let settled = false
            const timeout = window.setTimeout(() => {
              if (settled) return
              settled = true
              updateRequest.cancel()
              reject(new Error(l(
                '图片设置保存超时，请重试',
                'Saving image settings timed out; try again',
              )))
            }, ASSET_IMAGE_OPTIONS_SAVE_TIMEOUT_MS)
            updateRequest.promise.then(
              () => {
                if (settled) return
                settled = true
                window.clearTimeout(timeout)
                resolve()
              },
              (error) => {
                if (settled) return
                settled = true
                window.clearTimeout(timeout)
                reject(error)
              },
            )
          })
          queue.appliedRevision = Math.max(queue.appliedRevision, revision)
          if (queue.latestRevision === revision && componentMountedRef.current) {
            setUnsavedAssetImageOptionKeys((current) => {
              if (!current.has(queue.queueKey)) return current
              const next = new Set(current)
              next.delete(queue.queueKey)
              return next
            })
          }
          const savedWaiters = queue.waiters.filter((waiter) => waiter.revision <= revision)
          queue.waiters = queue.waiters.filter((waiter) => waiter.revision > revision)
          savedWaiters.forEach((waiter) => waiter.resolve())
        } catch (error) {
          const failedWaiters = queue.waiters.filter((waiter) => waiter.revision <= revision)
          queue.waiters = queue.waiters.filter((waiter) => waiter.revision > revision)
          failedWaiters.forEach((waiter) => waiter.reject(error))
          if (queue.latestRevision <= revision) break
        }
      }
    } finally {
      queue.processing = false
      if (queue.appliedRevision < queue.latestRevision && queue.waiters.length > 0) {
        void drainAssetImageOptionsQueue(queue)
      } else if (
        queue.waiters.length === 0
        && (
          latestScriptImportIdRef.current === null
          || String(latestScriptImportIdRef.current) !== String(queue.scriptImportId)
        )
        && assetImageOptionsQueuesRef.current.get(queue.queueKey) === queue
      ) {
        assetImageOptionsQueuesRef.current.delete(queue.queueKey)
      }
    }
  }

  const queueAssetImageOptionsUpdate = (
    asset: AssetDraft,
    input: AssetImageOptionsInput,
    clientRevision: number,
  ): Promise<void> => {
    if (scriptImportId === null) {
      return Promise.reject(new Error(l(
        '当前资产尚未保存，无法更新图片设置',
        'This asset has not been saved, so its image settings cannot be updated',
      )))
    }
    const backendAssetId = getBackendAssetId(asset.backendAssetId)
    if (backendAssetId === null) {
      return Promise.reject(new Error(l(
        '当前资产还没有后端资产 ID，无法保存图片设置',
        'This asset does not have a backend asset ID, so its image settings cannot be saved',
      )))
    }
    const queueKey = getAssetImageOptionsQueueKey(scriptImportId, asset.id)
    const requestSignature = getAssetImageOptionsRequestSignature(input)
    const belongsToCurrentScript = latestScriptImportIdRef.current !== null
      && String(latestScriptImportIdRef.current) === String(scriptImportId)
    const existing = assetImageOptionsQueuesRef.current.get(queueKey)
    if (existing && clientRevision <= existing.appliedRevision) return Promise.resolve()
    if (existing && clientRevision < existing.latestRevision) return Promise.resolve()

    if (belongsToCurrentScript) {
      saveAssetOverride({
        ...asset,
        prompt: input.prompt,
        styleName: input.styleName,
        visualStyleId: input.visualStyleId,
        aspectRatio: input.aspectRatio,
      }, ['prompt', 'styleName', 'visualStyleId', 'aspectRatio'])
    }

    if (existing && existing.latestSignature === requestSignature) {
      existing.latestAsset = asset
      existing.latestInput = input
      if (existing.processing) {
        if (belongsToCurrentScript) {
          setUnsavedAssetImageOptionKeys((current) => {
            if (current.has(queueKey)) return current
            const next = new Set(current)
            next.add(queueKey)
            return next
          })
        }
        return new Promise<void>((resolve, reject) => {
          existing.waiters.push({
            revision: existing.latestRevision,
            resolve,
            reject,
          })
        })
      }
      if (existing.appliedRevision >= existing.latestRevision) {
        if (belongsToCurrentScript) {
          setUnsavedAssetImageOptionKeys((current) => {
            if (!current.has(queueKey)) return current
            const next = new Set(current)
            next.delete(queueKey)
            return next
          })
        }
        return Promise.resolve()
      }
      // 相同快照的上一轮请求失败或超时；复用新 revision 发起一次显式重试。
    }

    const queue = existing ?? {
      queueKey,
      scriptImportId,
      latestRevision: clientRevision,
      // 防御极早期 flush 传入 revision=0；新队列必须至少执行一次请求。
      appliedRevision: clientRevision > 0 ? 0 : clientRevision - 1,
      latestSignature: requestSignature,
      latestAsset: asset,
      latestInput: input,
      processing: false,
      waiters: [],
    }
    queue.latestRevision = clientRevision
    queue.scriptImportId = scriptImportId
    queue.latestSignature = requestSignature
    queue.latestAsset = asset
    queue.latestInput = input
    assetImageOptionsQueuesRef.current.set(queueKey, queue)

    if (belongsToCurrentScript) {
      setUnsavedAssetImageOptionKeys((current) => {
        if (current.has(queueKey)) return current
        const next = new Set(current)
        next.add(queueKey)
        return next
      })
    }

    const completion = new Promise<void>((resolve, reject) => {
      queue.waiters.push({ revision: clientRevision, resolve, reject })
    })
    void drainAssetImageOptionsQueue(queue)
    return completion
  }

  const handleImageImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !imageTargetId) return
    if (!file.type.startsWith('image/')) {
      message.error(l('请选择图片文件', 'Choose an image file'))
      return
    }
    const targetAsset = scopedAssets.find((asset) => asset.id === imageTargetId)
      ?? (imageTargetSnapshot?.id === imageTargetId ? imageTargetSnapshot : undefined)
    if (!targetAsset) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      saveAssetOverride({ ...targetAsset, imageUrl: reader.result }, ['imageUrl'])
      setImageTargetId(undefined)
      setImageTargetSnapshot(undefined)
    }
    reader.readAsDataURL(file)
  }

  const openImageImport = (assetId: string) => {
    if (assetImageOperationLocked(assetId)) {
      message.warning(l('图片任务尚未结束，暂时不能替换图片', 'Wait for the image task before replacing the image'))
      return
    }
    setImageTargetSnapshot(scopedAssets.find((asset) => asset.id === assetId))
    setImageTargetId(assetId)
    imageInputRef.current?.click()
  }

  const appendAsset = (asset: Pick<AssetDraft, 'name' | 'imageUrl' | 'prompt' | 'styleName' | 'visualStyleId'>) => {
    const localAssetId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setAssets((current) => [
      ...current,
      {
        id: `${kind}-${localAssetId}`,
        kind,
        name: asset.name,
        episodeIds: scope === 'overview' ? [] : [scope],
        imageUrl: asset.imageUrl,
        prompt: asset.prompt,
        styleName: asset.styleName,
        visualStyleId: asset.visualStyleId,
        source: 'manual',
      },
    ])
  }

  const patchAssetImageTask = (
    assetKey: string,
    patch: Partial<AssetImageGenerationViewState>,
  ) => {
    setAssetImageTasks((current) => {
      const existing = current[assetKey]
      if (!existing) return current
      if (Object.entries(patch).every(([key, value]) => existing[key as keyof AssetImageGenerationViewState] === value)) return current
      return {
        ...current,
        [assetKey]: { ...existing, ...patch },
      }
    })
  }

  const isCurrentAssetImageRun = (run: ActiveAssetImageRun) => (
    activeAssetImageRunsRef.current.get(run.assetKey) === run
    && latestScriptImportIdRef.current !== null
    && String(latestScriptImportIdRef.current) === String(run.scriptImportId)
  )

  const toPersistedAssetImageTask = (run: ActiveAssetImageRun): PersistedAssetImageTask | null => (
    run.taskId
      ? {
          assetKey: run.assetKey,
          backendAssetId: run.backendAssetId,
          lookId: run.lookId,
          progress: run.taskSucceeded ? 100 : clampTaskProgress(run.progress),
          assetName: run.assetName,
          scriptImportId: run.scriptImportId,
          scopeId: run.scopeId,
          chapterId: run.chapterId,
          assetType: run.assetType,
          sourceSignature: run.sourceSignature,
          taskId: run.taskId,
          taskSucceeded: run.taskSucceeded,
          expectedFileId: run.expectedFileId,
          previousCoverFileId: run.previousCoverFileId,
          previousImageUrl: run.previousImageUrl,
          previousUpdatedAt: run.previousUpdatedAt,
        }
      : null
  )

  const persistAssetImageRun = (run: ActiveAssetImageRun) => {
    const task = toPersistedAssetImageTask(run)
    if (!task) return
    writePendingAssetImageTaskSidecar(
      draftKey,
      mergePendingAssetImageTasks(readPendingAssetImageTaskSidecar(draftKey) ?? [], [task]),
    )
    if (
      !componentMountedRef.current
      || latestScriptImportIdRef.current === null
      || String(latestScriptImportIdRef.current) !== String(run.scriptImportId)
    ) return
    setPendingAssetImageTasks((current) => {
      const existingIndex = current.findIndex((item) => item.assetKey === run.assetKey)
      if (existingIndex < 0) return [...current, task]
      return current.map((item, index) => index === existingIndex ? task : item)
    })
  }

  const removePersistedAssetImageRun = (run: ActiveAssetImageRun) => {
    if (run.taskId) resolvedAssetImageTaskIdsRef.current.add(run.taskId)
    writePendingAssetImageTaskSidecar(
      draftKey,
      (readPendingAssetImageTaskSidecar(draftKey) ?? []).filter((item) => (
        item.assetKey !== run.assetKey || item.taskId !== run.taskId
      )),
    )
    if (!componentMountedRef.current) return
    setPendingAssetImageTasks((current) => current.filter((item) => (
      item.assetKey !== run.assetKey || item.taskId !== run.taskId
    )))
  }

  const clearAssetImageRun = (run: ActiveAssetImageRun) => {
    if (activeAssetImageRunsRef.current.get(run.assetKey) !== run) return
    if (run.timer !== null) window.clearTimeout(run.timer)
    run.timer = null
    run.request = undefined
    activeAssetImageRunsRef.current.delete(run.assetKey)
  }

  const removeAssetImageTaskState = (assetKey: string) => {
    setAssetImageTasks((current) => {
      if (!current[assetKey]) return current
      const next = { ...current }
      delete next[assetKey]
      return next
    })
  }

  const refreshAssetGenerationEstimate = () => {
    setAssetGenerationEstimateRefreshToken((current) => current + 1)
  }

  const reconcileAssetGenerationAfterSingleTaskChange = () => {
    setAssetGenerationStatusRefreshToken((current) => current + 1)
    refreshAssetGenerationEstimate()
  }

  const clearGeneratedAssetImageOverride = (assetKey: string) => {
    setAssets((current) => current.map((asset) => {
      if (asset.id !== assetKey || !asset.overrideFields?.includes('imageUrl')) return asset
      const nextAsset = { ...asset }
      delete nextAsset.imageUrl
      nextAsset.overrideFields = asset.overrideFields.filter((field) => field !== 'imageUrl')
      return nextAsset
    }))
  }

  const failAssetImageRun = (run: ActiveAssetImageRun, errorMessage: string) => {
    if (!isCurrentAssetImageRun(run)) return
    removePersistedAssetImageRun(run)
    clearAssetImageRun(run)
    patchAssetImageTask(run.assetKey, {
      phase: 'failed',
      progress: run.progress,
      errorMessage,
    })
    reconcileAssetGenerationAfterSingleTaskChange()
    message.error(errorMessage)
  }

  const scheduleAssetImageTaskPoll = (
    run: ActiveAssetImageRun,
    delayMs: number,
    failureCount = 0,
  ) => {
    if (!isCurrentAssetImageRun(run) || !run.taskId) return
    if (run.timer !== null) window.clearTimeout(run.timer)
    run.timer = window.setTimeout(() => {
      run.timer = null
      void pollAssetImageTask(run, failureCount)
    }, delayMs)
  }

  const generatedAssetResultIsVisible = (
    run: ActiveAssetImageRun,
    asset: AssetDraft | undefined,
  ) => {
    if (!asset) return false
    const currentCoverFileId = asset.coverFileId
    const currentImageUrl = asset.imageUrl?.trim()
    if (!currentImageUrl) return false

    if (run.expectedFileId !== undefined) {
      if (
        currentCoverFileId === undefined
        || String(currentCoverFileId) !== String(run.expectedFileId)
      ) return false
      if (
        run.previousCoverFileId !== undefined
        && String(run.previousCoverFileId) === String(run.expectedFileId)
      ) {
        return asset.updatedAt !== run.previousUpdatedAt
          || currentImageUrl !== run.previousImageUrl
      }
      return true
    }

    if (run.previousCoverFileId !== undefined) {
      if (
        currentCoverFileId !== undefined
        && String(currentCoverFileId) !== String(run.previousCoverFileId)
      ) return true
      return Boolean(currentImageUrl) && currentImageUrl !== run.previousImageUrl
    }
    if (run.previousImageUrl) return Boolean(currentImageUrl) && currentImageUrl !== run.previousImageUrl
    return currentCoverFileId !== undefined || Boolean(currentImageUrl)
  }

  const mergeGeneratedAssetIntoCachedScopes = (
    run: ActiveAssetImageRun,
    assetKind: AssetKind,
    nextAssets: AssetDraft[],
    refreshedTarget: AssetDraft | undefined,
  ) => {
    setRemoteAssetsByScope((current) => {
      let changed = false
      const next: RemoteAssetsByScope = { ...current }

      Object.entries(current).forEach(([scopeId, scopeAssets]) => {
        if (scopeId === run.scopeId) return
        const cachedAssets = scopeAssets[assetKind]
        if (!cachedAssets || !refreshedTarget) return
        let scopeChanged = false
        const updatedAssets = cachedAssets.map((asset) => {
          if (getBackendAssetId(asset.backendAssetId) !== run.backendAssetId) return asset
          scopeChanged = true
          return {
            ...refreshedTarget,
            episodeIds: asset.episodeIds,
          }
        })
        if (!scopeChanged) return
        changed = true
        next[scopeId] = {
          ...scopeAssets,
          [assetKind]: updatedAssets,
        }
      })

      const currentScopeAssets = current[run.scopeId] ?? {}
      if (!sameRemoteAssetList(currentScopeAssets[assetKind], nextAssets)) {
        changed = true
        next[run.scopeId] = {
          ...currentScopeAssets,
          [assetKind]: nextAssets,
        }
      }
      return changed ? next : current
    })
  }

  const refreshGeneratedAsset = async (
    run: ActiveAssetImageRun,
    failureCount = 0,
  ): Promise<void> => {
    if (!isCurrentAssetImageRun(run)) return
    patchAssetImageTask(run.assetKey, {
      phase: 'refreshing',
      progress: 100,
      errorMessage: undefined,
    })
    const request = StudioScriptsApi.requestAssetList({
      scriptImportId: run.scriptImportId,
      chapterId: run.chapterId,
      assetType: run.assetType,
    })
    run.request = request

    try {
      const result = await request.promise
      if (!isCurrentAssetImageRun(run) || run.request !== request) return
      const assetKind = ASSET_KIND_BY_TYPE[run.assetType]
      const queryEpisodeId = run.chapterId === undefined ? undefined : String(run.chapterId)
      const nextAssets = mapRemoteAssets(
        result,
        run.assetType,
        run.scriptImportId,
        queryEpisodeId,
        run.episodes,
      )
      const refreshedTarget = nextAssets.find((asset) => (
        getBackendAssetId(asset.backendAssetId) === run.backendAssetId
      ))
      if (!generatedAssetResultIsVisible(run, refreshedTarget)) {
        run.resultMissCount += 1
        if (run.resultMissCount >= ASSET_IMAGE_RESULT_MAX_MISSES) {
          const errorMessage = l(
            '图片任务已完成，但资产列表暂未回显新文件，可稍后继续加载结果',
            'The image task finished, but the new file is not visible yet; reload the result later',
          )
          patchAssetImageTask(run.assetKey, {
            phase: 'refresh-failed',
            progress: 100,
            errorMessage,
          })
          message.warning(errorMessage)
          return
        }
        const retryDelay = Math.min(
          ASSET_IMAGE_TASK_POLL_INTERVAL_MS * 2 ** Math.min(run.resultMissCount - 1, 2),
          12_000,
        )
        run.timer = window.setTimeout(() => {
          run.timer = null
          void refreshGeneratedAsset(run)
        }, retryDelay)
        return
      }
      mergeGeneratedAssetIntoCachedScopes(run, assetKind, nextAssets, refreshedTarget)
      confirmedAssetImagesRef.current.set(run.assetKey, {
        coverFileId: refreshedTarget?.coverFileId,
        imageUrl: refreshedTarget?.imageUrl,
        updatedAt: refreshedTarget?.updatedAt,
        laneRevision: assetListRequestRevisionRef.current,
      })
      clearGeneratedAssetImageOverride(run.assetKey)
      setAssetImageHistoryRefreshTokens((current) => {
        const assetKey = getAssetImageHistoryKey(run.scriptImportId, run.backendAssetId, run.lookId)
        return {
          ...current,
          [assetKey]: (current[assetKey] ?? 0) + 1,
        }
      })
      setAssetGenerationStatusRefreshToken((current) => current + 1)
      removePersistedAssetImageRun(run)
      clearAssetImageRun(run)
      removeAssetImageTaskState(run.assetKey)
      refreshAssetGenerationEstimate()
      message.success(l(`“${run.assetName}”图片生成完成`, `Image generated for “${run.assetName}”`))
    } catch (error) {
      if (!isCurrentAssetImageRun(run) || isCancelledRequestError(error)) return
      const nextFailureCount = failureCount + 1
      const status = getErrorStatus(error)
      if (status !== 401 && status !== 403 && nextFailureCount < ASSET_IMAGE_TASK_MAX_REQUEST_FAILURES) {
        const retryDelay = Math.min(
          ASSET_IMAGE_TASK_POLL_INTERVAL_MS * 2 ** (nextFailureCount - 1),
          12_000,
        )
        run.timer = window.setTimeout(() => {
          run.timer = null
          void refreshGeneratedAsset(run, nextFailureCount)
        }, retryDelay)
        return
      }
      const errorMessage = getApiErrorMessage(
        error,
        l('图片已生成，但结果加载失败', 'The image was generated, but the result could not be loaded'),
      )
      patchAssetImageTask(run.assetKey, {
        phase: 'refresh-failed',
        progress: 100,
        errorMessage,
      })
      message.warning(errorMessage)
    } finally {
      if (run.request === request) run.request = undefined
    }
  }

  async function pollAssetImageTask(
    run: ActiveAssetImageRun,
    failureCount = 0,
  ): Promise<void> {
    if (!isCurrentAssetImageRun(run) || !run.taskId) return
    const request = StudioAssetGenerationApi.requestTaskDetail(run.taskId)
    run.request = request

    try {
      const detail = await request.promise
      if (!isCurrentAssetImageRun(run) || run.request !== request) return
      const previousProgress = run.progress
      const progress = clampTaskProgress(detail.progress, previousProgress)
      run.progress = progress
      if (isAssetImageTaskSucceeded(detail)) {
        const parsedResult = parseStudioAssetImageTaskResult(detail.result)
        const expectedFileId = parsedResult?.fileId
        if (typeof expectedFileId === 'string' || typeof expectedFileId === 'number') {
          run.expectedFileId = expectedFileId
        }
        run.taskSucceeded = true
        run.progress = 100
        persistAssetImageRun(run)
        run.request = undefined
        await refreshGeneratedAsset(run)
        return
      }
      if (isAssetImageTaskFailed(detail)) {
        failAssetImageRun(
          run,
          detail.error?.trim()
            || detail.cancelReason?.trim()
            || detail.statusName?.trim()
            || l('图片生成任务执行失败', 'Asset image generation failed'),
        )
        return
      }
      patchAssetImageTask(run.assetKey, {
        phase: 'running',
        progress,
        errorMessage: undefined,
      })
      if (progress !== previousProgress) persistAssetImageRun(run)
      scheduleAssetImageTaskPoll(run, ASSET_IMAGE_TASK_POLL_INTERVAL_MS)
    } catch (error) {
      if (!isCurrentAssetImageRun(run) || isCancelledRequestError(error)) return
      const nextFailureCount = failureCount + 1
      const status = getErrorStatus(error)
      if (status === 401 || status === 403 || nextFailureCount >= ASSET_IMAGE_TASK_MAX_REQUEST_FAILURES) {
        const errorMessage = getApiErrorMessage(
          error,
          l('图片生成任务暂时无法查询，请稍后继续查询', 'The image task is temporarily unavailable; resume the query later'),
        )
        patchAssetImageTask(run.assetKey, {
          phase: 'poll-failed',
          errorMessage,
        })
        message.warning(errorMessage)
        return
      }
      scheduleAssetImageTaskPoll(
        run,
        Math.min(ASSET_IMAGE_TASK_POLL_INTERVAL_MS * 2 ** (nextFailureCount - 1), 12_000),
        nextFailureCount,
      )
    } finally {
      if (run.request === request) run.request = undefined
    }
  }

  const startAssetImageGeneration = async (
    asset: AssetDraft,
    input: AssetImageGenerationInput,
  ): Promise<void> => {
    if (batchCreationBlockedRef.current || activeEpisodeAssetsGenerateRequestRef.current) {
      throw new Error(l('请等待批量任务状态确认或生成完成', 'Wait for batch status confirmation or completion'))
    }
    if (!pendingTasksHydrated) {
      const errorMessage = l(
        '正在恢复未完成的图片任务，请稍候',
        'Restoring unfinished image tasks; please wait',
      )
      message.info(errorMessage)
      throw new Error(errorMessage)
    }
    const backendAssetId = getBackendAssetId(asset.backendAssetId)
    const modelId = Number(model)
    const resolutionValue = Number(resolution)
    if (scriptImportId === null || backendAssetId === null) {
      const errorMessage = l(
        '当前资产还没有后端资产 ID，暂时无法生成图片',
        'This asset does not have a backend asset ID yet',
      )
      message.warning(errorMessage)
      throw new Error(errorMessage)
    }
    const lookTask = getAssetLookGenerationTask(backendAssetId).getSnapshot()
    if (lookTask.phase !== 'idle' && lookTask.phase !== 'failed') {
      const errorMessage = l(
        '该资产已有未完成的造型任务，请在详情中继续查询或加载结果',
        'This asset has an unfinished look task. Resume its query or load its result in the editor.',
      )
      message.info(errorMessage)
      throw new Error(errorMessage)
    }
    if (
      !selectedImageModelById
      || !Number.isInteger(modelId)
      || modelId <= 0
      || !Number.isInteger(resolutionValue)
      || resolutionValue <= 0
      || !imageResolutionValues.includes(resolutionValue)
      || (imageAspectRatioOptions.length > 0 && !imageAspectRatioOptions.includes(input.aspectRatio))
    ) {
      const errorMessage = l(
        '请选择当前模型支持的图片比例和分辨率',
        'Select an aspect ratio and resolution supported by the current model',
      )
      message.warning(errorMessage)
      throw new Error(errorMessage)
    }
    if (activeAssetImageRunsRef.current.has(asset.id)) return
    if (pendingAssetImageTaskKeys.has(asset.id)) {
      const errorMessage = l(
        '该资产存在未完成的图片任务，正在恢复任务状态',
        'This asset has an unfinished image task that is being restored',
      )
      message.info(errorMessage)
      throw new Error(errorMessage)
    }
    confirmedAssetImagesRef.current.delete(asset.id)

    saveAssetOverride({
      ...asset,
      name: input.name,
      prompt: input.prompt,
      styleName: input.styleName,
      visualStyleId: input.visualStyleId,
      aspectRatio: input.aspectRatio,
    }, ['name', 'prompt', 'styleName', 'visualStyleId', 'aspectRatio'])

    const run: ActiveAssetImageRun = {
      token: ++assetImageRunTokenRef.current,
      assetKey: asset.id,
      backendAssetId,
      lookId: input.lookId,
      progress: 0,
      assetName: input.name,
      scriptImportId,
      scopeId: scope,
      chapterId: scope === 'overview' ? undefined : currentEpisode?.id,
      assetType: ASSET_TYPE_BY_KIND[asset.kind],
      sourceSignature,
      episodes,
      previousCoverFileId: asset.coverFileId,
      previousImageUrl: asset.imageUrl,
      previousUpdatedAt: asset.updatedAt,
      resultMissCount: 0,
      timer: null,
    }
    activeAssetImageRunsRef.current.set(asset.id, run)
    setAssetImageTasks((current) => ({
      ...current,
      [asset.id]: {
        phase: 'submitting',
        progress: 0,
        lookId: input.lookId,
      },
    }))
    onImageSubmissionStateChange?.(true)

    const request = StudioAssetGenerationApi.requestGenerate({
      id: backendAssetId,
      lookId: input.lookId,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      visualStyleId: input.visualStyleId,
      quality: null,
      resolution: resolutionValue,
      modelId,
    })
    run.request = request

    try {
      const taskId = await request.promise
      if (run.request !== request) return
      run.request = undefined
      run.taskId = taskId
      resolvedAssetImageTaskIdsRef.current.delete(taskId)
      persistAssetImageRun(run)
      if (!componentMountedRef.current || !isCurrentAssetImageRun(run)) {
        if (activeAssetImageRunsRef.current.get(run.assetKey) === run) {
          activeAssetImageRunsRef.current.delete(run.assetKey)
        }
        return
      }
      reconcileAssetGenerationAfterSingleTaskChange()
      patchAssetImageTask(asset.id, {
        phase: 'running',
        progress: 0,
        errorMessage: undefined,
      })
      message.success(l('图片生成任务已提交', 'Image generation task submitted'))
      scheduleAssetImageTaskPoll(run, 800)
    } catch (error) {
      if (isCancelledRequestError(error)) return
      if (!componentMountedRef.current || !isCurrentAssetImageRun(run)) {
        if (activeAssetImageRunsRef.current.get(run.assetKey) === run) {
          activeAssetImageRunsRef.current.delete(run.assetKey)
        }
        return
      }
      const errorMessage = getApiErrorMessage(
        error,
        l('图片生成任务提交失败', 'Failed to submit the image generation task'),
      )
      failAssetImageRun(run, errorMessage)
      throw error
    } finally {
      if (run.request === request) run.request = undefined
    }
  }

  const submitExistingAssetImage = async (asset: AssetDraft, input: AssetImageGenerationInput) => {
    const nextInput = { ...input, name: input.name.trim(), prompt: input.prompt.trim() }
    const styleResolved = /^(无风格|no style)$/i.test(nextInput.styleName.trim())
      || (Number.isInteger(nextInput.visualStyleId) && Number(nextInput.visualStyleId) > 0)
    if (!nextInput.name || !nextInput.prompt || !nextInput.styleName.trim() || !styleResolved) {
      const errorMessage = l(
        '请先在资产详情中完善名称、提示词和风格后再生成',
        'Complete the name, prompt, and style in the asset editor before generating.',
      )
      message.warning(errorMessage)
      throw new Error(errorMessage)
    }
    try {
      await queueAssetImageOptionsUpdate(asset, nextInput, createImageOptionsClientRevision())
    } catch (error) {
      message.error(getApiErrorMessage(error, l(
        '图片设置保存失败，暂未开始生成',
        'Image settings could not be saved, so generation was not started',
      )))
      throw error
    }
    if (!componentMountedRef.current || latestSourceSignatureRef.current !== sourceSignature) return
    await startAssetImageGeneration(asset, nextInput)
  }

  const generateAssetFromCard = async (asset: AssetDraft) => {
    if (assetImageOperationLocked(asset.id) || assetCardGenerationRequestsRef.current.has(asset.id)) return
    const backendAssetId = getBackendAssetId(asset.backendAssetId)
    if (backendAssetId === null || scriptImportId === null) {
      message.warning(l('请先保存资产后再生成图片', 'Save the asset before generating an image'))
      return
    }
    const lookTask = getAssetLookGenerationTask(backendAssetId).getSnapshot()
    if (lookTask.phase !== 'idle' && lookTask.phase !== 'failed') {
      openAssetWorkspace(asset)
      message.info(l('请先恢复该资产未完成的造型任务', 'Resume the unfinished look task for this asset first'))
      return
    }

    assetCardGenerationRequestsRef.current.set(asset.id, null)
    setAssetImageTasks((current) => ({
      ...current,
      [asset.id]: { phase: 'submitting', progress: 0 },
    }))
    let submitting = false
    try {
      const request = StudioAssetGenerationApi.requestLooks(
        backendAssetId,
        scope === 'overview' ? undefined : currentEpisode?.id,
      )
      assetCardGenerationRequestsRef.current.set(asset.id, request)
      const looks = await request.promise
      const styles = visualStyleOptions.length ? visualStyleOptions : await loadAssetVisualStyleOptions()
      if (!componentMountedRef.current || latestSourceSignatureRef.current !== sourceSignature) return
      const queuedInput = assetImageOptionsQueuesRef.current.get(
        getAssetImageOptionsQueueKey(scriptImportId, asset.id),
      )?.latestInput
      const options = resolveAssetImageOptions({
        asset: { ...asset, prompt: buildAssetPrompt(asset, episodes) },
        look: selectInitialAssetLook(looks),
        ratio,
        ratioOptions: imageAspectRatioOptions.length ? imageAspectRatioOptions : DEFAULT_ASSET_IMAGE_RATIO_OPTIONS,
        styleOptions: styles,
        queuedInput,
        noStyleName: l('无风格', 'No style'),
      })
      submitting = true
      await submitExistingAssetImage(asset, { ...options, name: asset.name })
    } catch (error) {
      if (!componentMountedRef.current || latestSourceSignatureRef.current !== sourceSignature || isCancelledRequestError(error)) return
      const errorMessage = getApiErrorMessage(error, l('图片生成准备失败，请重试', 'Unable to prepare image generation. Try again.'))
      if (!activeAssetImageRunsRef.current.has(asset.id)) {
        patchAssetImageTask(asset.id, { phase: 'failed', progress: 0, errorMessage })
      }
      if (!submitting) message.error(errorMessage)
    } finally {
      assetCardGenerationRequestsRef.current.delete(asset.id)
      if (componentMountedRef.current && !activeAssetImageRunsRef.current.has(asset.id)) {
        setAssetImageTasks((current) => {
          if (current[asset.id]?.phase !== 'submitting') return current
          const next = { ...current }
          delete next[asset.id]
          return next
        })
      }
    }
  }

  const retryAssetImageTask = (assetKey: string) => {
    const run = activeAssetImageRunsRef.current.get(assetKey)
    if (!run || !isCurrentAssetImageRun(run) || run.request || run.timer !== null) return
    const phase = assetImageTasks[assetKey]?.phase
    run.resultMissCount = 0
    patchAssetImageTask(assetKey, {
      phase: phase === 'refresh-failed' || run.taskSucceeded ? 'refreshing' : 'running',
      errorMessage: undefined,
    })
    if (phase === 'refresh-failed' || run.taskSucceeded) {
      void refreshGeneratedAsset(run)
      return
    }
    scheduleAssetImageTaskPoll(run, 0)
  }

  const discardAssetImageTaskTracking = (assetKey: string) => {
    const run = activeAssetImageRunsRef.current.get(assetKey)
    if (!run || !isCurrentAssetImageRun(run)) return
    Modal.confirm({
      centered: true,
      title: l('放弃跟踪图片任务？', 'Stop tracking this image task?'),
      content: l(
        '这里只会清除本地任务记录，不会取消后端任务。之后重新生成可能产生重复任务和积分消耗。',
        'This only removes the local task record; it does not cancel the backend task. Generating again may create a duplicate task and charge credits again.',
      ),
      okText: l('确认放弃', 'Stop tracking'),
      cancelText: l('继续保留', 'Keep tracking'),
      okButtonProps: { danger: true },
      onOk: () => {
        if (!isCurrentAssetImageRun(run)) return
        if (run.timer !== null) window.clearTimeout(run.timer)
        run.request?.cancel()
        removePersistedAssetImageRun(run)
        clearAssetImageRun(run)
        removeAssetImageTaskState(assetKey)
        reconcileAssetGenerationAfterSingleTaskChange()
        message.info(l(
          '已停止本地跟踪，后端任务不会被取消',
          'Local tracking stopped; the backend task was not cancelled',
        ))
      },
    })
  }

  const resumeAssetImageRunRef = useRef({ refreshGeneratedAsset, scheduleAssetImageTaskPoll })
  resumeAssetImageRunRef.current = { refreshGeneratedAsset, scheduleAssetImageTaskPoll }
  useEffect(() => {
    if (scriptImportId === null || !pendingTasksHydrated) return
    pendingAssetImageTasks.forEach((task) => {
      if (
        String(task.scriptImportId) !== String(scriptImportId)
        || resolvedAssetImageTaskIdsRef.current.has(task.taskId)
        || activeAssetImageRunsRef.current.has(task.assetKey)
      ) return

      const run: ActiveAssetImageRun = {
        token: ++assetImageRunTokenRef.current,
        assetKey: task.assetKey,
        backendAssetId: task.backendAssetId,
        lookId: task.lookId ?? null,
        progress: task.taskSucceeded ? 100 : clampTaskProgress(task.progress),
        assetName: task.assetName,
        scriptImportId: task.scriptImportId,
        scopeId: task.scopeId,
        chapterId: task.chapterId,
        assetType: task.assetType,
        sourceSignature,
        episodes,
        taskId: task.taskId,
        taskSucceeded: task.taskSucceeded,
        expectedFileId: task.expectedFileId,
        previousCoverFileId: task.previousCoverFileId,
        previousImageUrl: task.previousImageUrl,
        previousUpdatedAt: task.previousUpdatedAt,
        resultMissCount: 0,
        timer: null,
      }
      activeAssetImageRunsRef.current.set(task.assetKey, run)
      setAssetImageTasks((current) => ({
        ...current,
        [task.assetKey]: {
          phase: task.taskSucceeded ? 'refreshing' : 'running',
          progress: run.progress,
          lookId: run.lookId,
        },
      }))
      if (task.taskSucceeded) void resumeAssetImageRunRef.current.refreshGeneratedAsset(run)
      else resumeAssetImageRunRef.current.scheduleAssetImageTaskPoll(run, 0)
    })
  }, [episodes, pendingAssetImageTasks, pendingTasksHydrated, scriptImportId, sourceSignature])

  const prepareLocalAssetImport = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error(l('请选择图片文件', 'Choose an image file'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setLocalImportImage(reader.result)
      setLocalImportFileName(file.name)
      setLocalImportName(file.name.replace(/\.[^.]+$/, ''))
    }
    reader.onerror = () => message.error(l('本地图片读取失败', 'Failed to read the local image'))
    reader.readAsDataURL(file)
  }

  const handleLocalAssetImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    prepareLocalAssetImport(file)
  }

  const openLocalAssetImport = () => {
    setAddMenuOpen(false)
    setLocalImportName('')
    setLocalImportImage(undefined)
    setLocalImportFileName('')
    setLocalImportDragging(false)
    setLocalImportPreviewOpen(false)
    setLocalImportWorkspaceOpen(true)
  }

  const closeLocalAssetImport = () => {
    setLocalImportWorkspaceOpen(false)
    setLocalImportName('')
    setLocalImportImage(undefined)
    setLocalImportFileName('')
    setLocalImportDragging(false)
    setLocalImportPreviewOpen(false)
  }

  const clearLocalAssetImage = () => {
    setLocalImportName('')
    setLocalImportImage(undefined)
    setLocalImportFileName('')
    setLocalImportDragging(false)
    setLocalImportPreviewOpen(false)
  }

  const confirmLocalAssetImport = () => {
    const assetName = localImportName.trim()
    if (!assetName || !localImportImage) return
    appendAsset({ name: assetName, imageUrl: localImportImage })
    closeLocalAssetImport()
    message.success(l(`本地${KIND_LABELS[kind].zh}已导入`, `Local ${KIND_LABELS[kind].en.toLowerCase()} imported`))
  }

  const openPersonalImport = async (targetAssetId?: string) => {
    if (targetAssetId && assetImageOperationLocked(targetAssetId)) {
      message.warning(l('图片任务尚未结束，暂时不能替换图片', 'Wait for the image task before replacing the image'))
      return
    }
    setPersonalImportTargetId(targetAssetId)
    setPersonalImportTargetSnapshot(targetAssetId
      ? scopedAssets.find((asset) => asset.id === targetAssetId)
      : undefined)
    setPersonalImportOpen(true)
    setPersonalAssetId('')
    setPersonalAssetFilters(EMPTY_PERSONAL_FILTERS)
    setPersonalAssets([])
    setPersonalAssetsLoading(true)
    const requestRevision = ++personalAssetsRequestRevisionRef.current
    const requestSourceSignature = sourceSignature
    const isCurrent = () => componentMountedRef.current
      && requestRevision === personalAssetsRequestRevisionRef.current
      && latestSourceSignatureRef.current === requestSourceSignature
    try {
      const entityType = kind === 'role' ? 'character' : kind
      const response = await StudioEntitiesApi.list(entityType, { page: 1, pageSize: 100 })
      if (!isCurrent()) return
      const nextAssets = (response.data?.items ?? []).map((item) => {
        const rawThumbnail = item.thumbnail ?? item.image_url ?? item.preview_url
        return {
          id: String(item.id ?? ''),
          name: String(item.name ?? ''),
          imageUrl: typeof rawThumbnail === 'string' ? rawThumbnail : undefined,
          style: typeof item.visual_style === 'string'
            ? item.visual_style
            : typeof item.style === 'string' ? item.style : undefined,
          gender: typeof item.gender === 'string' ? item.gender : undefined,
          age: typeof item.age === 'string'
            ? item.age
            : typeof item.age_group === 'string' ? item.age_group : undefined,
          region: typeof item.region === 'string'
            ? item.region
            : typeof item.country === 'string' ? item.country : undefined,
        }
      }).filter((item) => item.id && item.name)
      setPersonalAssets(nextAssets)
    } catch {
      if (!isCurrent()) return
      message.error(l('个人空间资产加载失败', 'Failed to load personal assets'))
    } finally {
      if (isCurrent()) setPersonalAssetsLoading(false)
    }
  }

  const confirmPersonalImport = () => {
    const selected = personalAssets.find((item) => item.id === personalAssetId)
    if (!selected) {
      message.warning(l('请选择要导入的资产', 'Choose an asset to import'))
      return
    }
    if (personalImportTargetId) {
      const targetAsset = scopedAssets.find((asset) => asset.id === personalImportTargetId)
        ?? (personalImportTargetSnapshot?.id === personalImportTargetId
          ? personalImportTargetSnapshot
          : undefined)
      if (!targetAsset) return
      if (!selected.imageUrl) {
        message.warning(l('选中的资产没有可用图片', 'The selected asset has no usable image'))
        return
      }
      saveAssetOverride({ ...targetAsset, imageUrl: selected.imageUrl }, ['imageUrl'])
    } else {
      appendAsset({ name: selected.name, imageUrl: selected.imageUrl })
    }
    setPersonalImportOpen(false)
    setPersonalImportTargetId(undefined)
    setPersonalImportTargetSnapshot(undefined)
    setPersonalAssetId('')
    message.success(l('个人空间资产已导入', 'Personal asset imported'))
  }

  const handleAddMenuClick = (key: 'generate' | 'personal' | 'local') => {
    setAddMenuOpen(false)
    if (key === 'generate') {
      setGenerationAssetId(undefined)
      setGenerationAssetSnapshot(undefined)
      setGenerationActiveLookId(undefined)
      setGenerationWorkspaceOpen(true)
      return
    }
    if (key === 'personal') {
      void openPersonalImport()
      return
    }
    openLocalAssetImport()
  }

  const openAssetWorkspace = (asset: AssetDraft) => {
    setGenerationAssetSnapshot(asset)
    setGenerationAssetId(asset.id)
    setGenerationActiveLookId(undefined)
    setGenerationWorkspaceOpen(true)
  }

  const closeVoiceLibrary = () => {
    setVoiceLibraryOpen(false)
    setVoiceTargetAsset(undefined)
  }

  const openVoiceLibrary = (asset: AssetDraft) => {
    if (assetImageOperationLocked(asset.id)) {
      message.warning(l('图片任务尚未结束，请稍后配置音色', 'Wait for the image task before configuring a voice'))
      return
    }
    if (getBackendAssetId(asset.backendAssetId) === null) {
      message.warning(l(
        '当前角色还没有后端资产 ID，暂时无法配置音色',
        'This character does not have a backend asset ID yet',
      ))
      return
    }
    setVoiceTargetAsset(asset)
    setVoiceLibraryOpen(true)
  }

  const applyAssetVoice = async (voice: SystemVoiceRead) => {
    const targetAsset = voiceTargetAsset
    const requestSourceSignature = sourceSignature
    if (!targetAsset) throw new Error(l('未找到目标角色', 'No target character selected'))
    const assetId = getBackendAssetId(targetAsset.backendAssetId)
    if (assetId === null) {
      throw new Error(l('目标角色缺少后端资产 ID', 'The target character has no backend asset ID'))
    }
    await StudioVoicesApi.updateAssetVoice({ assetId, voiceId: voice.id })
    if (latestSourceSignatureRef.current !== requestSourceSignature) return
    const appliedVoice: StudioScriptAssetVoice = {
      id: voice.id,
      name: voice.name,
      languages: voice.languages,
      previewUrl: voice.previewUrl,
      emotionAdjustable: voice.emotionAdjustable,
    }
    setRemoteAssetsByScope((current) => {
      let changed = false
      const next = { ...current }
      Object.entries(current).forEach(([scopeId, scopeAssets]) => {
        const roleAssets = scopeAssets.role
        if (!roleAssets) return
        let roleAssetsChanged = false
        const nextRoleAssets = roleAssets.map((asset) => {
          if (asset.id !== targetAsset.id) return asset
          changed = true
          roleAssetsChanged = true
          return { ...asset, voice: appliedVoice }
        })
        if (roleAssetsChanged) {
          next[scopeId] = { ...scopeAssets, role: nextRoleAssets }
        }
      })
      return changed ? next : current
    })
    message.success(l(
      `已为“${targetAsset.name}”应用音色“${voice.name}”`,
      `Applied “${voice.name}” to “${targetAsset.name}”`,
    ))
  }

  const storeAssetInPersonalSpace = async (asset: AssetDraft) => {
    try {
      const entityType = asset.kind === 'role' ? 'character' : asset.kind
      await StudioEntitiesApi.create(entityType, {
        name: asset.name,
        image_url: asset.imageUrl,
        thumbnail: asset.imageUrl,
      })
      message.success(l('已存入个人空间', 'Saved to personal space'))
    } catch {
      message.error(l('存入个人空间失败', 'Failed to save to personal space'))
    }
  }

  const deleteAsset = (asset: AssetDraft) => {
    if (assetImageOperationLocked(asset.id)) {
      message.warning(l('图片任务尚未结束，暂时不能删除资产', 'Wait for the image task before deleting the asset'))
      return
    }
    Modal.confirm({
      centered: true,
      title: l(`删除${KIND_LABELS[asset.kind].zh}`, `Delete ${KIND_LABELS[asset.kind].en.toLowerCase()}`),
      content: l(`确定删除“${asset.name}”吗？删除后无法恢复。`, `Delete "${asset.name}"? This action cannot be undone.`),
      okText: l('删除', 'Delete'),
      cancelText: l('取消', 'Cancel'),
      okButtonProps: { danger: true },
      onOk: () => {
        setAssets((current) => current.filter((item) => item.id !== asset.id))
        if (asset.source === 'remote') {
          setHiddenRemoteAssetIds((current) => {
            const next = new Set(current)
            next.add(asset.id)
            return next
          })
        }
      },
    })
  }

  const handleAssetMenuClick = (asset: AssetDraft, key: string) => {
    if (assetImageOperationLocked(asset.id)) {
      message.warning(l('图片任务尚未结束，暂时不能修改资产', 'Wait for the image task before modifying the asset'))
      return
    }
    if (key === 'store') {
      void storeAssetInPersonalSpace(asset)
      return
    }
    if (key === 'space-import') {
      void openPersonalImport(asset.id)
      return
    }
    if (key === 'local-import') {
      openImageImport(asset.id)
      return
    }
    if (key === 'delete') deleteAsset(asset)
  }

  const requestGeneration = async (count: number) => {
    if (currentScopeGenerationCompleted || batchCreationBlockedRef.current || activeEpisodeAssetsGenerateRequestRef.current) return
    if (singleAssetGenerationActive) {
      message.info(l('已有资产正在生成，请稍候', 'An asset is already generating. Please wait.'))
      return
    }
    if (count === 0) {
      message.info(l('当前没有可生成的资产', 'There are no assets to generate'))
      return
    }
    const modelId = Number(selectedImageModel?.id)
    const resolutionValue = Number(resolution)
    if (
      scriptImportId === null
      || !Number.isInteger(modelId)
      || modelId <= 0
      || !Number.isInteger(resolutionValue)
      || resolutionValue <= 0
    ) {
      message.warning(l('请选择可用的图片模型和分辨率', 'Choose an available image model and resolution'))
      return
    }
    if (scope !== 'overview' && !currentEpisode) {
      message.warning(l('当前剧集不存在，请重新选择剧集', 'The current episode is unavailable. Select an episode again.'))
      return
    }
    const targetScope = scope
    const targetEpisodeId = scope === 'overview' ? undefined : currentEpisode?.id
    // Invalidate a status GET started before this POST, even before the effect cleanup runs.
    batchStatusRevisionRef.current += 1
    const request = StudioAssetGenerationApi.requestEpisodeAssetsGenerate({
      scriptImportId,
      ...(targetEpisodeId === undefined ? {} : { episodeId: targetEpisodeId }),
      modelId,
      quality: null,
      resolution: resolutionValue,
      regenerate: false,
    })
    activeEpisodeAssetsGenerateRequestRef.current = request
    setEpisodeAssetsGeneratePending(true)
    setAssetGenerationStatusByScope((current) => ({
      ...current,
      [targetScope]: {
        ...current[targetScope],
        allGenerated: false,
        shouldPoll: true,
        loading: true,
      },
    }))
    try {
      await request.promise
      if (activeEpisodeAssetsGenerateRequestRef.current !== request
        || !componentMountedRef.current || String(latestScriptImportIdRef.current) !== String(scriptImportId)) return
      setAssetGenerationStatusRefreshToken((current) => current + 1)
      setAssetPollingRetryToken((current) => current + 1)
      message.success(targetScope === 'overview'
        ? l('已开始生成全剧资产', 'Started generating all assets')
        : l('已开始生成本集资产', 'Started generating episode assets'))
    } catch (error) {
      if (isCancelledRequestError(error) || !componentMountedRef.current
        || String(latestScriptImportIdRef.current) !== String(scriptImportId)) return
      message.error(getApiErrorMessage(error, l('资产生成任务提交失败', 'Asset generation task submission failed')))
      setAssetGenerationStatusByScope((current) => ({
        ...current,
        [targetScope]: {
          ...current[targetScope],
          allGenerated: false,
          shouldPoll: current[targetScope]?.shouldPoll ?? false,
          loading: false,
          error,
        },
      }))
      // A lost POST response does not prove rejection. Reconcile this scope before allowing another POST.
      setAssetGenerationStatusRefreshToken((current) => current + 1)
    } finally {
      if (activeEpisodeAssetsGenerateRequestRef.current === request) {
        activeEpisodeAssetsGenerateRequestRef.current = null
        setEpisodeAssetsGeneratePending(false)
      }
    }
  }

  const scopeTitle = scope === 'overview'
    ? l(`全剧总览：已智能提取出全剧资产共${totalAssets}个`, `Overview: ${totalAssets} assets extracted`)
    : l(`${currentEpisode?.title ?? '当前剧集'}已智能提取资产共${scopedAssets.length}个`, `${currentEpisode?.title ?? 'Current episode'}: ${scopedAssets.length} assets extracted`)
  const pollingLanes = assetPollingState.scopeId === scope
    ? ASSET_TYPES.map((assetType) => assetPollingState.lanes[assetType])
    : []
  const assetPollingActive = pollingLanes.some((lane) => lane.loading || lane.polling)
  const assetPollingErrorMessage = (currentAssetGenerationStatus?.error
    ? getApiErrorMessage(currentAssetGenerationStatus.error, l('生成状态查询失败，请重试', 'Generation status unavailable; retry'))
    : '') || pollingLanes.find((lane) => (
    lane.errorMessage && !lane.loading && !lane.polling
  ))?.errorMessage || ''
  const assetPollingStatusNames = [...new Set(
    pollingLanes.map((lane) => lane.statusName).filter(Boolean),
  )].join(' / ')
  const selectedAssetPollingLane = assetPollingState.scopeId === scope
    ? assetPollingState.lanes[ASSET_TYPE_BY_KIND[kind]]
    : null
  const visibleAssetsLoading = scriptImportId !== null && (
    assetPollingState.scopeId !== scope
    || Boolean(selectedAssetPollingLane?.loading || selectedAssetPollingLane?.polling)
    || Boolean(currentAssetGenerationStatus?.loading && visibleAssets.length === 0)
  )
  const showAssetLoadingPlaceholder = visibleAssetsLoading && visibleAssets.length === 0
  const summaryDescription = assetPollingErrorMessage
    ? l(
      `部分资产查询失败：${assetPollingErrorMessage}${assetPollingActive ? '，其他类型仍在生成' : ''}`,
      `Some asset queries failed: ${assetPollingErrorMessage}${assetPollingActive ? '; other types are still generating' : ''}`,
    )
    : assetPollingActive
      ? l(
        `正在轮询角色、场景和道具资产${assetPollingStatusNames ? `（${assetPollingStatusNames}）` : ''}…`,
        `Polling character, scene, and prop assets${assetPollingStatusNames ? ` (${assetPollingStatusNames})` : ''}…`,
      )
      : l('可通过修改提示词重绘不满意的图片，确保角场景符合剧本设定。', 'Adjust prompts and regenerate images to match the script settings.')

  return (
    <main className="project-assets-step">
      <aside className="project-assets-step__scope-nav" aria-label={l('资产范围', 'Asset scope')}>
        <span>{l('总览', 'All')}</span>
        <button
          type="button"
          className={scope === 'overview' ? 'is-selected' : ''}
          onClick={() => setScope('overview')}
        >
          {l('总', 'All')}
        </button>
        <span>{l('选集', 'Episodes')}</span>
        <div>
          {episodes.map((episode, index) => {
            const completed = completedEpisodeIds.has(episode.id)
            return (
              <button
                key={episode.id}
                type="button"
                className={`${scope === episode.id ? 'is-selected' : ''}${completed ? ' is-completed' : ''}`}
                aria-label={completed ? l(`${episode.title}，资产已生成`, `${episode.title}, assets generated`) : episode.title}
                onClick={() => setScope(episode.id)}
              >
                <span>{index + 1}</span>
                {completed && <CheckOutlined className="project-assets-step__episode-check" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </aside>

      <section className="project-assets-step__workspace">
        <header className="project-assets-step__summary">
          <div className="project-assets-step__summary-copy">
            <strong>{scopeTitle}</strong>
            <span>{summaryDescription}</span>
          </div>
          <div className="project-assets-step__generation-settings">
            {assetPollingErrorMessage && !currentScopeGenerationCompleted && (
              <Button onClick={() => {
                setAssetPollingRetryToken((current) => current + 1)
                setAssetGenerationStatusRefreshToken((current) => current + 1)
              }}>
                {l('重试资产查询', 'Retry asset query')}
              </Button>
            )}
            <StudioSelect
              className="project-assets-step__model-select"
              value={model || undefined}
              aria-label={l('图片生成模型', 'Image generation model')}
              placeholder={l('请选择模型', 'Select a model')}
              loading={imageModelsLoading}
              status={imageModelsError ? 'error' : undefined}
              options={imageModelOptions}
              onChange={handleModelChange}
              onDropdownVisibleChange={(open) => {
                if (open && imageModelsError) setImageModelsRetryToken((current) => current + 1)
              }}
            />
            <StudioSelect
              className="project-assets-step__resolution-select"
              value={resolution || undefined}
              aria-label={l('图片分辨率', 'Image resolution')}
              placeholder={l('分辨率', 'Resolution')}
              disabled={!selectedImageModel || imageResolutionOptions.length === 0}
              options={imageResolutionOptions}
              onChange={handleResolutionChange}
            />
            <Button
              type="primary"
              loading={episodeAssetsGeneratePending}
              disabled={
                currentScopeGenerationCompleted
                || episodeAssetsGeneratePending
                || currentScopeBatchGenerationActive
                || currentScopeGenerationStatusUncertain
                || singleAssetGenerationActive
                || scriptImportId === null
                || scopedAssets.length === 0
                || !selectedImageModel
                || !resolution
              }
              onClick={() => { void requestGeneration(scopedAssets.length) }}
            >
              <span>{scope === 'overview' ? l('一键生成全剧资产', 'Generate all assets') : l('一键生成本集资产', 'Generate episode assets')}</span>
              {!currentScopeGenerationCompleted && (
                <span className="project-assets-step__generation-cost"><StarFilled />{generationTotalCostText}</span>
              )}
            </Button>
          </div>
        </header>

        <div className="project-assets-step__content" aria-busy={visibleAssetsLoading}>
          <nav className="project-assets-step__tabs" aria-label={l('资产类型', 'Asset type')}>
            {(Object.keys(KIND_LABELS) as AssetKind[]).map((item) => (
              <button
                key={item}
                type="button"
                className={kind === item ? 'is-selected' : ''}
                onClick={() => handleKindChange(item)}
              >
                <span>{l(KIND_LABELS[item].zh, KIND_LABELS[item].en)}</span>
                <small>{counts[item]}</small>
              </button>
            ))}
          </nav>

          {visibleAssetsLoading && (
            <div
              className="project-assets-step__asset-loading"
              role="status"
              aria-live="polite"
            >
              <Spin />
              <span className="project-assets-step__asset-loading-copy">
                <strong>
                  {l(
                    `正在生成${KIND_LABELS[kind].zh}资产`,
                    `Generating ${KIND_LABELS[kind].en.toLowerCase()}`,
                  )}
                </strong>
                <small>{l('生成结果会自动刷新，请稍候…', 'Results will refresh automatically…')}</small>
              </span>
            </div>
          )}

          <div className={`project-assets-step__grid${showAssetLoadingPlaceholder ? ' is-loading' : ''}`}>
            {visibleAssets.map((asset) => {
              const cardGenerationState = selectAssetGenerationState(assetImageTasks[asset.id], batchAssetImageTasks[asset.id])
              const cardGenerating = isAssetImageTaskActive(cardGenerationState)
              return (
                <article
                  key={asset.id}
                  className={`project-assets-step__card${asset.imageUrl ? ' has-image' : ''}${cardGenerating ? ' is-generating' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-busy={cardGenerating}
                  aria-label={l(`打开${asset.name}资产详情`, `Open ${asset.name} asset details`)}
                  onClick={(event) => {
                    if (!event.currentTarget.contains(event.target as Node)) return
                    if ((event.target as HTMLElement).closest('button')) return
                    openAssetWorkspace(asset)
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openAssetWorkspace(asset)
                    }
                  }}
                >
                  <div className="project-assets-step__card-preview">
                    {asset.imageUrl && (
                      <img
                        className="project-assets-step__card-image"
                        src={asset.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    {!asset.imageUrl && (
                      <span className="project-assets-step__empty-mark" aria-hidden="true">✦</span>
                    )}
                    <AssetCardGenerationProgress
                      assetId={getBackendAssetId(asset.backendAssetId)}
                      state={cardGenerationState}
                    />
                    {asset.imageUrl && (asset.lookCount ?? 0) > 0 && (
                      <span className="project-assets-step__looks-badge">
                        {l(
                          `${asset.lookCount ?? 0}个${LOOK_COUNT_LABELS[asset.kind].zh}`,
                          `${asset.lookCount ?? 0} ${LOOK_COUNT_LABELS[asset.kind].en}`,
                        )}
                      </span>
                    )}
                    {!asset.imageUrl && !assetImageOperationLocked(asset.id) && (
                      <div className="project-assets-step__card-actions">
                        <Button icon={<UploadOutlined />} onClick={() => openImageImport(asset.id)}>
                          {l(`导入${KIND_LABELS[kind].zh}`, `Import ${KIND_LABELS[kind].en.toLowerCase()}`)}
                        </Button>
                        <Button
                          type="primary"
                          disabled={imageModelsLoading || Boolean(imageModelsError) || !selectedImageModelById || !resolution}
                          onClick={(event) => {
                            event.stopPropagation()
                            void generateAssetFromCard(asset)
                          }}
                        >
                          {l('生成', 'Generate')} <StarFilled /> {generationUnitCostText}
                        </Button>
                      </div>
                    )}
                  </div>
                  <footer>
                    <strong title={asset.name}>{asset.name}</strong>
                    {kind === 'role' && (
                      <Button
                        type="text"
                        className={`project-assets-step__voice-button${asset.voice ? ' is-configured' : ''}`}
                        icon={<AudioOutlined />}
                        disabled={getBackendAssetId(asset.backendAssetId) === null
                          || assetImageOperationLocked(asset.id)}
                        title={getBackendAssetId(asset.backendAssetId) === null
                          ? l('本地角色需要先保存为后端资产才能配置音色', 'Save this local character before configuring a voice')
                          : asset.voice?.name
                            ? l(`当前音色：${asset.voice.name}`, `Current voice: ${asset.voice.name}`)
                            : l('配置角色音色', 'Configure character voice')}
                        onClick={() => openVoiceLibrary(asset)}
                      >
                        {asset.voice?.name ?? l('配置音色', 'Voice')}
                      </Button>
                    )}
                    <Dropdown
                      trigger={['click']}
                      placement="topRight"
                      overlayClassName="project-assets-step__asset-menu"
                      menu={{
                        items: [
                          { key: 'store', label: l('存入空间', 'Save to space') },
                          { key: 'space-import', label: l('空间导入', 'Import from space') },
                          { key: 'local-import', label: l('本地导入', 'Import from device') },
                          { type: 'divider' },
                          { key: 'delete', label: l('删除', 'Delete'), danger: true },
                        ],
                        onClick: ({ key, domEvent }) => {
                          domEvent.stopPropagation()
                          handleAssetMenuClick(asset, key)
                        },
                      }}
                    >
                      <Button
                        type="text"
                        className="project-assets-step__more-button"
                        disabled={assetImageOperationLocked(asset.id)}
                        aria-label={l('更多操作', 'More actions')}
                        icon={<MoreOutlined />}
                      />
                    </Dropdown>
                  </footer>
                </article>
              )
            })}

            <Dropdown
              open={addMenuOpen}
              trigger={['click']}
              placement="bottomLeft"
              overlayClassName="project-assets-step__add-dropdown"
              onOpenChange={setAddMenuOpen}
              menu={{
                items: [
                  { key: 'generate', label: l('模型生成', 'Generate with model') },
                  { key: 'local', label: l('本地导入', 'Import from device') },
                  { key: 'personal', label: l('空间导入', 'Import from personal space') },
                ],
                onClick: ({ key }) => handleAddMenuClick(key as 'generate' | 'personal' | 'local'),
              }}
            >
              <div className={`project-assets-step__add-card${addMenuOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="project-assets-step__add-trigger"
                  aria-haspopup="menu"
                  aria-expanded={addMenuOpen}
                >
                  <span className="project-assets-step__add-trigger-mark" aria-hidden="true">✦</span>
                  <span>{l(`新增${KIND_LABELS[kind].zh}`, `Add ${KIND_LABELS[kind].en.toLowerCase()}`)}</span>
                </button>
              </div>
            </Dropdown>
          </div>
        </div>
      </section>

      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageImport} />
      <input ref={localAssetInputRef} type="file" accept="image/*" hidden onChange={handleLocalAssetImport} />

      {localImportWorkspaceOpen && (
        <section
          className="project-assets-local-import"
          role="dialog"
          aria-modal="true"
          aria-label={l(`本地导入${KIND_LABELS[kind].zh}`, `Import ${KIND_LABELS[kind].en.toLowerCase()} from device`)}
        >
          <header className="project-assets-local-import__header">
            <Button type="text" icon={<CloseOutlined />} aria-label={l('关闭', 'Close')} onClick={closeLocalAssetImport} />
            <strong>{l(`新增${KIND_LABELS[kind].zh}`, `New ${KIND_LABELS[kind].en.toLowerCase()}`)}</strong>
          </header>

          <div className="project-assets-local-import__body">
            <main className="project-assets-local-import__stage">
              <div
                className={`project-assets-local-import__dropzone${localImportImage ? ' has-image' : ''}${localImportDragging ? ' is-dragging' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={l('点击或拖拽上传图片', 'Click or drag to upload an image')}
                onClick={() => {
                  if (!localImportImage) localAssetInputRef.current?.click()
                }}
                onKeyDown={(event) => {
                  if (localImportImage || (event.key !== 'Enter' && event.key !== ' ')) return
                  event.preventDefault()
                  localAssetInputRef.current?.click()
                }}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setLocalImportDragging(true)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                  setLocalImportDragging(true)
                }}
                onDragLeave={() => setLocalImportDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setLocalImportDragging(false)
                  prepareLocalAssetImport(event.dataTransfer.files?.[0])
                }}
              >
                {localImportImage ? (
                  <>
                    <img src={localImportImage} alt={localImportFileName} loading="lazy" decoding="async" />
                    <div
                      className="project-assets-local-import__media-actions"
                      role="toolbar"
                      aria-label={l('图片操作', 'Image actions')}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        title={l('替换图片', 'Replace image')}
                        aria-label={l('替换图片', 'Replace image')}
                        onClick={() => localAssetInputRef.current?.click()}
                      >
                        <SwapOutlined />
                      </button>
                      <button
                        type="button"
                        title={l('预览图片', 'Preview image')}
                        aria-label={l('预览图片', 'Preview image')}
                        onClick={() => setLocalImportPreviewOpen(true)}
                      >
                        <EyeOutlined />
                      </button>
                      <button
                        type="button"
                        title={l('删除图片', 'Delete image')}
                        aria-label={l('删除图片', 'Delete image')}
                        onClick={clearLocalAssetImage}
                      >
                        <DeleteOutlined />
                      </button>
                    </div>
                  </>
                ) : (
                  <span className="project-assets-local-import__placeholder">
                    <PlusOutlined />
                    <strong>{l('点击或拖拽上传', 'Click or drag to upload')}</strong>
                  </span>
                )}
              </div>

              <section className="project-assets-local-import__history" aria-label={l('历史记录', 'History')}>
                <h2>{l('历史记录', 'History')} <small>History</small></h2>
                <button
                  type="button"
                  className={localImportImage ? 'has-image is-selected' : ''}
                  disabled={!localImportImage}
                  aria-label={localImportImage ? l('更换上传图片', 'Replace uploaded image') : l('暂无历史图片', 'No history image')}
                  onClick={() => localAssetInputRef.current?.click()}
                >
                  {localImportImage ? <img src={localImportImage} alt="" loading="lazy" decoding="async" /> : <PictureOutlined />}
                </button>
              </section>
            </main>

            <aside className="project-assets-local-import__panel">
              <div className="project-assets-local-import__form">
                <label>
                  <span>{l(KIND_LABELS[kind].zh, KIND_LABELS[kind].en)} <small>{KIND_LABELS[kind].en}</small></span>
                  <Input
                    value={localImportName}
                    maxLength={30}
                    placeholder={l(`请输入${KIND_LABELS[kind].zh}`, `Enter ${KIND_LABELS[kind].en.toLowerCase()} name`)}
                    onChange={(event) => setLocalImportName(event.target.value)}
                  />
                </label>
              </div>

              <div className="project-assets-local-import__looks">
                <strong>{l('全部造型', 'Looks')}</strong>
                <button type="button" className="is-add" disabled>
                  <PlusOutlined />
                  <span>{l('添加造型', 'Add')}</span>
                </button>
                <button type="button" className={`is-main${localImportImage ? ' has-image' : ''}`} disabled>
                  <span className="project-assets-local-import__look-preview">
                    {localImportImage ? <img src={localImportImage} alt="" loading="lazy" decoding="async" /> : <PictureOutlined />}
                  </span>
                  <span>{l(kind === 'role' ? '主角色图' : kind === 'scene' ? '场景主图' : '道具主图', 'Main image')}</span>
                </button>
              </div>

              <footer>
                <Button
                  type="primary"
                  disabled={!localImportName.trim() || !localImportImage}
                  onClick={confirmLocalAssetImport}
                >
                  {l('确认', 'Confirm')}
                </Button>
              </footer>
            </aside>
          </div>

          <ImageViewer
            open={localImportPreviewOpen}
            imageUrl={localImportImage}
            alt={localImportFileName}
            onClose={() => setLocalImportPreviewOpen(false)}
          />
        </section>
      )}

      {generationWorkspaceOpen && (
        <AssetGenerationWorkspace
          key={generationAssetId ?? `new-${kind}`}
          kind={kind}
          ratio={ratio}
          styleName={styleName}
          visualStyleNames={visualStyleNames}
          visualStyleOptions={visualStyleOptions}
          model={model}
          resolution={resolution}
          modelOptions={imageModelOptions}
          resolutionOptions={imageResolutionOptions}
          ratioOptions={imageAspectRatioOptions}
          modelOptionsLoading={imageModelsLoading}
          modelOptionsError={imageModelsError}
          assetId={generationBackendAssetId}
          episodeId={scope === 'overview' ? undefined : scope}
          imageHistoryItems={generationAssetImageHistory?.items ?? []}
          currentImageFileId={generationAsset?.coverFileId}
          imageHistoryLoading={generationBackendAssetId !== null
            && generationHistoryLookReady
            && (generationAssetImageHistory?.loading ?? true)}
          imageHistoryError={generationAssetImageHistory?.error}
          referenceImages={generationAssetReferences?.items ?? []}
          referenceImageCount={generationAssetReferences?.total}
          referenceImageLimit={selectedImageModelReferenceLimit
            ?? generationAssetReferences?.maxCount
            ?? 14}
          referenceImagesLoading={Boolean(generationAssetReferenceKey)
            && (generationAssetReferences?.loading ?? true)}
          referenceImagesError={generationAssetReferences?.error}
          onReferenceImagesUpload={generationAssetReferenceKey
            ? uploadGenerationAssetReferences
            : undefined}
          onReferenceImageIdsUpload={generationAssetReferenceKey
            ? attachGenerationAssetReferences
            : undefined}
          onPrimaryImageChange={generationAsset
            && getBackendAssetId(generationAsset.backendAssetId) !== null
            ? (item) => setGenerationAssetPrimaryImage(generationAsset, item)
            : undefined}
          onActiveLookChange={setGenerationActiveLookId}
          batchGenerationStatesByLookId={generationAssetId && !isAssetImageTaskLocked(assetImageTasks[generationAssetId])
            ? batchGenerationState.looks[generationAssetId]
            : undefined}
          resultsRefreshToken={`${generationAsset?.coverFileId ?? ''}:${generationAssetImageHistoryRefreshToken ?? 0}:${Object.keys(batchGenerationState.looks[generationAssetId ?? ''] ?? {}).join(',')}`}
          generationState={generationAssetId
            ? selectAssetGenerationState(assetImageTasks[generationAssetId], batchAssetImageTasks[generationAssetId])
            : undefined}
          generationUnavailableReason={currentScopeBatchGenerationActive || currentScopeGenerationStatusUncertain
            ? l('请等待批量任务状态确认或生成完成', 'Wait for batch status confirmation or completion')
            : !pendingTasksHydrated
            ? l(
              '正在恢复未完成的图片任务，请稍候',
              'Restoring unfinished image tasks; please wait',
            )
            : generationAssetId
              && pendingAssetImageTaskKeys.has(generationAssetId)
              && !assetImageTasks[generationAssetId]
              ? l(
                '正在恢复该资产未完成的图片任务，请稍候',
                'Restoring the unfinished image task for this asset',
              )
            : getBackendAssetId(generationAsset?.backendAssetId) === null
              ? l(
                '新增或本地资产需要先保存为后端资产，才能创建图片生成任务',
                'New or local assets must be saved before generating an image',
              )
              : undefined}
          initialAsset={generationAsset ? {
            name: generationAsset.name,
            prompt: generationLatestImageOptions?.prompt ?? buildAssetPrompt(generationAsset, episodes),
            imageUrl: generationAsset.imageUrl,
            styleName: generationLatestImageOptions?.styleName ?? generationAsset.styleName,
            visualStyleId: generationLatestImageOptions
              ? generationLatestImageOptions.visualStyleId
              : generationAsset.visualStyleId,
            aspectRatio: generationLatestImageOptions?.aspectRatio ?? generationAsset.aspectRatio,
            description: generationAsset.description || l(
              `${generationAsset.name}的${KIND_LABELS[generationAsset.kind].zh}设定，可结合右侧提示词继续调整并重新生成。`,
              `${generationAsset.name} ${KIND_LABELS[generationAsset.kind].en.toLowerCase()} design. Refine the prompt and regenerate as needed.`,
            ),
          } : undefined}
          onModelChange={handleModelChange}
          onResolutionChange={handleResolutionChange}
          onModelOptionsRetry={() => setImageModelsRetryToken((current) => current + 1)}
          onGenerationResultRetry={generationAssetId
            ? () => retryAssetImageTask(generationAssetId)
            : undefined}
          onGenerationTrackingDiscard={generationAssetId
            ? () => discardAssetImageTaskTracking(generationAssetId)
            : undefined}
          onImageOptionsUpdate={generationAsset
            && getBackendAssetId(generationAsset.backendAssetId) !== null
            ? (input, clientRevision) => queueAssetImageOptionsUpdate(
                generationAsset,
                input,
                clientRevision,
              )
            : undefined}
          imageOptionsRequireSave={Boolean(
            generationImageOptionsQueueKey
            && unsavedAssetImageOptionKeys.has(generationImageOptionsQueueKey)
          )}
          queuedImageOptions={generationLatestImageOptions}
          onGenerationPreparationStateChange={setImageGenerationPreparationPending}
          onClose={() => {
            setGenerationWorkspaceOpen(false)
            setGenerationAssetId(undefined)
            setGenerationAssetSnapshot(undefined)
            setGenerationActiveLookId(undefined)
          }}
          onGenerate={async (input) => {
            if (!generationAsset) {
              throw new Error(l('未找到可生成的后端资产', 'No persisted asset is available to generate'))
            }
            await submitExistingAssetImage(generationAsset, input)
          }}
        />
      )}

      <Modal
        open={personalImportOpen}
        centered
        width={1080}
        title={l(`导入${KIND_LABELS[kind].zh}`, `Import ${KIND_LABELS[kind].en.toLowerCase()}`)}
        footer={null}
        rootClassName="project-assets-space-import"
        onCancel={() => {
          personalAssetsRequestRevisionRef.current += 1
          setPersonalImportOpen(false)
          setPersonalImportTargetId(undefined)
          setPersonalImportTargetSnapshot(undefined)
        }}
      >
        <div className="project-assets-space-import__filters">
          <div className="project-assets-space-import__toolbar-title">
            <strong>{l('空间资产', 'Space assets')}</strong>
            <span>{l(`共 ${personalAssets.length} 项`, `${personalAssets.length} items`)}</span>
          </div>
          <div className="project-assets-space-import__filter-controls">
            <StudioSelect
              value={personalAssetFilters.gender}
              disabled={personalAssetsLoading}
              aria-label={l(kind === 'role' ? '性别' : '类型', kind === 'role' ? 'Gender' : 'Type')}
              optionLabelProp="trigger"
              popupMatchSelectWidth={152}
              popupClassName="project-assets-space-import__filter-popup"
              options={kind === 'role' ? [
                { value: 'gender-heading', label: l('性别', 'Gender'), trigger: l('性别', 'Gender'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('性别', 'Gender') },
                { value: 'female', label: l('女性', 'Female'), trigger: l('女性', 'Female') },
                { value: 'male', label: l('男性', 'Male'), trigger: l('男性', 'Male') },
              ] : [
                { value: 'type-heading', label: l('类型', 'Type'), trigger: l('类型', 'Type'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('类型', 'Type') },
              ]}
              onChange={(value) => setPersonalAssetFilters((current) => ({ ...current, gender: value }))}
            />
            <StudioSelect
              value={personalAssetFilters.style}
              disabled={personalAssetsLoading}
              aria-label={l('风格', 'Style')}
              optionLabelProp="trigger"
              popupMatchSelectWidth={152}
              popupClassName="project-assets-space-import__filter-popup"
              options={[
                { value: 'style-heading', label: l('风格', 'Style'), trigger: l('风格', 'Style'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('风格', 'Style') },
                { value: 'realistic', label: l('真人', 'Realistic'), trigger: l('真人', 'Realistic') },
                { value: 'anime', label: l('动漫', 'Anime'), trigger: l('动漫', 'Anime') },
              ]}
              onChange={(value) => setPersonalAssetFilters((current) => ({ ...current, style: value }))}
            />
            <StudioSelect
              value={personalAssetFilters.age}
              disabled={personalAssetsLoading}
              aria-label={l(kind === 'role' ? '年龄' : '年代', kind === 'role' ? 'Age' : 'Era')}
              optionLabelProp="trigger"
              popupMatchSelectWidth={152}
              popupClassName="project-assets-space-import__filter-popup"
              options={kind === 'role' ? [
                { value: 'age-heading', label: l('年龄', 'Age'), trigger: l('年龄', 'Age'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('年龄', 'Age') },
                { value: 'young', label: l('青年', 'Young'), trigger: l('青年', 'Young') },
                { value: 'middle', label: l('中年', 'Middle-aged'), trigger: l('中年', 'Middle-aged') },
                { value: 'senior', label: l('老年', 'Senior'), trigger: l('老年', 'Senior') },
              ] : [
                { value: 'era-heading', label: l('年代', 'Era'), trigger: l('年代', 'Era'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('年代', 'Era') },
              ]}
              onChange={(value) => setPersonalAssetFilters((current) => ({ ...current, age: value }))}
            />
            <StudioSelect
              value={personalAssetFilters.region}
              disabled={personalAssetsLoading}
              aria-label={l('国别', 'Region')}
              optionLabelProp="trigger"
              popupMatchSelectWidth={152}
              popupClassName="project-assets-space-import__filter-popup"
              options={[
                { value: 'region-heading', label: l('国别', 'Region'), trigger: l('国别', 'Region'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('国别', 'Region') },
                { value: 'china', label: l('中国', 'China'), trigger: l('中国', 'China') },
                { value: 'overseas', label: l('海外', 'Overseas'), trigger: l('海外', 'Overseas') },
              ]}
              onChange={(value) => setPersonalAssetFilters((current) => ({ ...current, region: value }))}
            />
          </div>
        </div>

        <Spin
          spinning={personalAssetsLoading}
          wrapperClassName={`project-assets-space-import__spin${visiblePersonalAssets.length === 0 ? ' is-empty' : ''}`}
        >
          <div className={`project-assets-space-import__library${visiblePersonalAssets.length === 0 ? ' is-empty' : ''}`}>
            {visiblePersonalAssets.length > 0 ? visiblePersonalAssets.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`project-assets-space-import__card${personalAssetId === item.id ? ' is-selected' : ''}`}
                aria-pressed={personalAssetId === item.id}
                onClick={() => setPersonalAssetId((current) => current === item.id ? '' : item.id)}
              >
                <span className="project-assets-space-import__card-media">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" /> : <PictureOutlined />}
                  {item.style && <small>{item.style}</small>}
                  {personalAssetId === item.id && (
                    <span className="project-assets-space-import__check"><CheckOutlined /></span>
                  )}
                </span>
                <strong title={item.name}>{item.name}</strong>
              </button>
            )) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={personalAssets.length > 0
                  ? l('没有符合筛选条件的资产', 'No assets match these filters')
                  : l('个人空间暂无可导入资产', 'No assets available')}
              />
            )}
          </div>
        </Spin>

        <footer className="project-assets-space-import__footer">
          <strong>{l('已选', 'Selected')} <span>{personalAssetId ? 1 : 0}</span></strong>
          <Button type="primary" disabled={!personalAssetId} onClick={confirmPersonalImport}>
            {l('确定', 'Confirm')}
          </Button>
        </footer>
      </Modal>

      <VoiceLibraryModal
        open={voiceLibraryOpen}
        preload
        currentVoiceId={voiceTargetAsset?.voice?.id}
        onApply={applyAssetVoice}
        onCancel={closeVoiceLibrary}
      />
    </main>
  )
}
