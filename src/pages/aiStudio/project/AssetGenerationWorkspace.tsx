import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type React from 'react'
import { Button, Input, Popover, Spin, message } from 'antd'
import {
  CloseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileSyncOutlined,
  FlagOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  StarFilled,
  PictureOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { getStoredAuthUser } from '../../../auth'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { getApiErrorMessage } from '../../../services/apiErrors'
import { StudioStylesApi } from '../../../services/studioStyles'
import { StudioAssetGenerationApi } from '../../../services/studioAssetGeneration'
import type {
  StudioAssetImageHistoryItem,
  StudioAssetLookItem,
  StudioAssetReferenceItem,
} from '../../../services/studioAssetGeneration'
import { downloadMediaFile, normalizeMediaFileId, resolveAssetUrl } from '../assets/utils'
import ImageViewer from './ImageViewer'
import StudioSelect from './StudioSelect'
import StudioRatioOption from './StudioRatioOption'
import AssetGenerationProgress, { hasAssetGenerationProgress } from './AssetGenerationProgress'
import { getAssetLookGenerationTask } from './assetLookGenerationTask'
import type { AssetLookGenerationTaskSnapshot } from './assetLookGenerationTask'
import {
  createImageOptionsClientRevision,
  DEFAULT_ASSET_IMAGE_RATIO,
  DEFAULT_ASSET_IMAGE_RATIO_OPTIONS as DEFAULT_RATIO_OPTIONS,
  resolveAssetImageOptions,
  selectInitialAssetLook,
} from './assetImageGenerationSettings'
import './AssetGenerationWorkspace.css'
import { captureLookEditorOptions, getLookGenerationState, resolvePreviewImageFileId } from './assetGenerationWorkspaceState'

export type GenerationAssetKind = 'role' | 'scene' | 'prop'
export type AssetVisualStyleOption = {
  id?: string | number
  name: string
  coverUrl?: string
}

export type AssetImageOptionsInput = {
  prompt: string
  lookId: number | null
  styleName: string
  visualStyleId: number | null
  aspectRatio: string
}

export type AssetImageGenerationInput = AssetImageOptionsInput & {
  name: string
}

export type AssetImageGenerationViewState = {
  phase: 'submitting' | 'running' | 'refreshing' | 'failed' | 'poll-failed' | 'refresh-failed'
  progress: number
  lookId?: number | null
  errorMessage?: string
}

type ResolvedAssetImageHistoryItem = {
  id: string
  fileId?: string
  versionId?: string
  imageUrl: string
  thumbnailUrl: string
  operationType: number | null
  operationTypeName?: string
  isAssetLibraryImport: boolean
  isCurrent: boolean
  isSelected: boolean
  createdAt?: string
  prompt?: string
  aspectRatio?: string
  visualStyleId?: number | null
  modelId?: number | null
  resolution?: number | null
  lookId?: number | null
}

type AssetGenerationWorkspaceProps = {
  kind: GenerationAssetKind
  ratio: string
  styleName: string
  visualStyleNames?: string[]
  visualStyleOptions?: AssetVisualStyleOption[]
  model: string
  resolution: string
  modelOptions: Array<{ value: string; label: string }>
  resolutionOptions: Array<{ value: string; label: string }>
  ratioOptions?: string[]
  modelOptionsLoading?: boolean
  modelOptionsError?: unknown
  assetId?: number | null
  episodeId?: string | number
  preferredLookId?: number | null
  imageHistoryItems?: StudioAssetImageHistoryItem[]
  currentImageFileId?: string | number
  imageHistoryLoading?: boolean
  imageHistoryError?: unknown
  referenceImages?: StudioAssetReferenceItem[]
  referenceImageCount?: number
  referenceImageLimit?: number
  referenceImagesLoading?: boolean
  referenceImagesError?: unknown
  generationState?: AssetImageGenerationViewState
  batchGenerationStatesByLookId?: Record<string, AssetImageGenerationViewState>
  resultsRefreshToken?: string | number
  generationUnavailableReason?: string
  initialAsset?: {
    name: string
    prompt?: string
    imageUrl?: string
    description?: string
    styleName?: string
    visualStyleId?: number | null
    aspectRatio?: string
  }
  onModelChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onModelOptionsRetry?: () => void
  onReferenceImagesUpload?: (files: File[]) => Promise<void>
  onReferenceImageIdsUpload?: (fileIds: string[]) => Promise<void>
  onPrimaryImageChange?: (item: StudioAssetImageHistoryItem) => Promise<void>
  onActiveLookChange?: (lookId: number | null) => void
  onGenerationResultRetry?: () => void
  onGenerationTrackingDiscard?: () => void
  onImageOptionsUpdate?: (input: AssetImageOptionsInput, clientRevision: number) => Promise<void>
  imageOptionsRequireSave?: boolean
  queuedImageOptions?: AssetImageOptionsInput
  onGenerationPreparationStateChange?: (pending: boolean) => void
  onClose: () => void
  onGenerate: (input: AssetImageGenerationInput) => Promise<void>
}

type ResolvedReferenceImage = {
  id: string
  fileId?: string
  name: string
  url: string
}

type LookDraft = {
  coverFileId?: string
  editorOptionsTouched?: boolean
  id: string
  backendId?: number
  name: string
  prompt: string
  imageUrl?: string
  aspectRatio?: string
  visualStyleId?: number | null
  modelId?: number | null
  resolution?: number | null
  status?: number | null
  statusName?: string
  defaultLook?: boolean
  inEpisode?: boolean
}

const MAX_REFERENCE_IMAGES = 14
const MAX_PROMPT_LENGTH = 5000
const ASSET_LIBRARY_IMPORT_OPERATION_TYPE = 9

function normalizeHistoryOperationType(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const normalized = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(normalized) ? normalized : null
}

function normalizeHistoryOperationName(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function isAssetLibraryImportOperation(operationType: number | null, operationName?: string): boolean {
  if (operationType === ASSET_LIBRARY_IMPORT_OPERATION_TYPE) return true
  const normalizedName = operationName?.replace(/[\s_-]+/g, '').toLowerCase()
  return Boolean(
    normalizedName
      && (
        /空间.*导入|导入.*空间/.test(normalizedName)
        || (normalizedName.includes('library') && normalizedName.includes('import'))
        || (normalizedName.includes('space') && normalizedName.includes('import'))
      ),
  )
}

const EMPTY_LOOK_GENERATION_TASK: AssetLookGenerationTaskSnapshot = {
  phase: 'idle',
  progress: 0,
  revision: 0,
}
const getEmptyLookGenerationTask = () => EMPTY_LOOK_GENERATION_TASK
const subscribeToEmptyLookGenerationTask = () => () => {}
type VisualStyleOptionCacheEntry = {
  options: AssetVisualStyleOption[]
  expiresAt: number
}
const VISUAL_STYLE_OPTION_CACHE_TTL_MS = 5 * 60 * 1000
const VISUAL_STYLE_OPTION_MAX_USER_SCOPES = 4
const visualStyleOptionCache = new Map<string, VisualStyleOptionCacheEntry>()
const visualStyleOptionRequests = new Map<string, Promise<AssetVisualStyleOption[]>>()

const getVisualStyleUserScope = () => {
  const user = getStoredAuthUser()
  return String(user?.id ?? user?.username ?? 'anonymous')
}

const isNoStyleName = (name: string) => {
  const normalized = name.trim().toLowerCase()
  return normalized === '无风格' || normalized === 'no style'
}

const getImageOptionsSignature = (input: AssetImageOptionsInput) => JSON.stringify([
  input.prompt,
  input.lookId,
  input.aspectRatio,
  input.visualStyleId,
])

/** 仅在资产编辑器没有上游快照时补查画面风格，并按用户合并并发请求。 */
export const loadAssetVisualStyleOptions = (force = false) => {
  const userScope = getVisualStyleUserScope()
  const cached = visualStyleOptionCache.get(userScope)
  if (!force && cached && cached.expiresAt > Date.now()) {
    visualStyleOptionCache.delete(userScope)
    visualStyleOptionCache.set(userScope, cached)
    return Promise.resolve(cached.options)
  }
  if (cached) visualStyleOptionCache.delete(userScope)

  const pending = visualStyleOptionRequests.get(userScope)
  if (pending) return pending

  const request = StudioStylesApi.getOptions(1)
    .then((options) => {
      const uniqueOptions = new Map<string, AssetVisualStyleOption>()
      options.forEach((option) => {
        const name = option.name.trim()
        const id = Number(option.id)
        const status = option.status === null || option.status === undefined
          ? 1
          : Number(option.status)
        if (!name || isNoStyleName(name) || !Number.isInteger(id) || id <= 0 || status !== 1) return
        uniqueOptions.set(`id:${id}`, {
          id,
          name,
          coverUrl: option.coverUrl?.trim() || undefined,
        })
      })
      const result = [...uniqueOptions.values()]
      visualStyleOptionCache.set(userScope, {
        options: result,
        expiresAt: Date.now() + VISUAL_STYLE_OPTION_CACHE_TTL_MS,
      })
      while (visualStyleOptionCache.size > VISUAL_STYLE_OPTION_MAX_USER_SCOPES) {
        const oldestScope = visualStyleOptionCache.keys().next().value as string | undefined
        if (oldestScope === undefined) break
        visualStyleOptionCache.delete(oldestScope)
      }
      return result
    })
    .finally(() => {
      visualStyleOptionRequests.delete(userScope)
    })
  visualStyleOptionRequests.set(userScope, request)
  return request
}

const COPY: Record<GenerationAssetKind, {
  titleZh: string
  titleEn: string
  nameZh: string
  nameEn: string
  promptZh: string
  promptEn: string
  lookZh: string
  lookEn: string
}> = {
  role: {
    titleZh: '新增角色',
    titleEn: 'New character',
    nameZh: '角色',
    nameEn: 'Character',
    promptZh: '请输入该角色的造型提示词，例如外貌、服饰、年龄、气质和姿态',
    promptEn: 'Describe the character appearance, clothing, age, mood, and pose',
    lookZh: '主角色图',
    lookEn: 'Main look',
  },
  scene: {
    titleZh: '新增场景',
    titleEn: 'New scene',
    nameZh: '场景',
    nameEn: 'Scene',
    promptZh: '请输入场景提示词，例如空间、时间、天气、光线和环境细节',
    promptEn: 'Describe the location, time, weather, lighting, and environment',
    lookZh: '场景主图',
    lookEn: 'Main view',
  },
  prop: {
    titleZh: '新增道具',
    titleEn: 'New prop',
    nameZh: '道具',
    nameEn: 'Prop',
    promptZh: '请输入道具提示词，例如材质、结构、年代、颜色和使用状态',
    promptEn: 'Describe the material, structure, period, color, and condition',
    lookZh: '道具主图',
    lookEn: 'Main view',
  },
}

export default function AssetGenerationWorkspace({
  kind,
  ratio,
  styleName,
  visualStyleNames = [],
  visualStyleOptions = [],
  model,
  resolution,
  modelOptions,
  resolutionOptions,
  ratioOptions = DEFAULT_RATIO_OPTIONS,
  modelOptionsLoading = false,
  modelOptionsError,
  assetId,
  episodeId,
  preferredLookId,
  imageHistoryItems = [],
  currentImageFileId,
  imageHistoryLoading = false,
  imageHistoryError,
  referenceImages = [],
  referenceImageCount,
  referenceImageLimit = MAX_REFERENCE_IMAGES,
  referenceImagesLoading = false,
  referenceImagesError,
  generationState,
  batchGenerationStatesByLookId,
  resultsRefreshToken,
  generationUnavailableReason,
  initialAsset,
  onModelChange,
  onResolutionChange,
  onModelOptionsRetry,
  onReferenceImagesUpload,
  onReferenceImageIdsUpload,
  onPrimaryImageChange,
  onActiveLookChange,
  onGenerationResultRetry,
  onGenerationTrackingDiscard,
  onImageOptionsUpdate,
  imageOptionsRequireSave = false,
  queuedImageOptions,
  onGenerationPreparationStateChange,
  onClose,
  onGenerate,
}: AssetGenerationWorkspaceProps) {
  const l = useBilingualText()
  const numericAssetId = Number(assetId)
  const lookGenerationTask = Number.isInteger(numericAssetId) && numericAssetId > 0
    ? getAssetLookGenerationTask(numericAssetId)
    : undefined
  const lookTaskSnapshot = useSyncExternalStore(
    lookGenerationTask?.subscribe ?? subscribeToEmptyLookGenerationTask,
    lookGenerationTask?.getSnapshot ?? getEmptyLookGenerationTask,
    getEmptyLookGenerationTask,
  )
  const copy = COPY[kind]
  const noStyleLabel = l('无风格', 'No style')
  const projectStyleName = styleName.trim()
  const savedStyleName = initialAsset?.styleName?.trim()
  const savedAspectRatio = initialAsset?.aspectRatio?.trim()
  const savedVisualStyleId = (() => {
    const value = Number(initialAsset?.visualStyleId)
    return Number.isInteger(value) && value > 0 ? value : null
  })()
  const currentImageFileIdString = currentImageFileId === undefined || currentImageFileId === null
    ? undefined
    : String(currentImageFileId).trim() || undefined
  const initialPreviewImageUrl = initialAsset?.imageUrl
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const localLookInputRef = useRef<HTMLInputElement>(null)
  const lookAddRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState(initialAsset?.name ?? '')
  const [prompt, setPrompt] = useState(initialAsset?.prompt ?? '')
  const [previewImage, setPreviewImage] = useState<string | undefined>(initialPreviewImageUrl)
  const [looks, setLooks] = useState<LookDraft[]>(() => [{
    id: 'main',
    name: initialAsset?.name || l(copy.lookZh, copy.lookEn),
    prompt: initialAsset?.prompt ?? '',
    imageUrl: initialPreviewImageUrl,
  }])
  const [activeLookId, setActiveLookId] = useState('main')
  const supportedRatioOptions = useMemo(() => {
    const normalized = [...new Set(ratioOptions.map((value) => value.trim()).filter(Boolean))]
    return normalized.length ? normalized : DEFAULT_RATIO_OPTIONS
  }, [ratioOptions])
  const [selectedRatio, setSelectedRatio] = useState(() => (
    (savedAspectRatio || ratio) && supportedRatioOptions.includes(savedAspectRatio || ratio)
      ? savedAspectRatio || ratio
      : supportedRatioOptions.includes(DEFAULT_ASSET_IMAGE_RATIO)
        ? DEFAULT_ASSET_IMAGE_RATIO
        : supportedRatioOptions[0] ?? DEFAULT_ASSET_IMAGE_RATIO
  ))
  const [selectedStyle, setSelectedStyle] = useState<string | undefined>(savedStyleName || undefined)
  const providedVisualStyleNames = useMemo(() => [...new Set(visualStyleNames
    .map((value) => value.trim())
    .filter((value) => value && !isNoStyleName(value)))], [visualStyleNames])
  const providedVisualStyleOptions = useMemo(() => {
    const uniqueOptions = new Map<string, AssetVisualStyleOption>()
    visualStyleOptions.forEach((option) => {
      const optionName = option.name.trim()
      if (!optionName || isNoStyleName(optionName) || uniqueOptions.has(optionName)) return
      uniqueOptions.set(optionName, {
        id: option.id,
        name: optionName,
        coverUrl: option.coverUrl?.trim() || undefined,
      })
    })
    return [...uniqueOptions.values()]
  }, [visualStyleOptions])
  const [loadedVisualStyleOptions, setLoadedVisualStyleOptions] = useState<AssetVisualStyleOption[]>([])
  const [visualStyleOptionsLoading, setVisualStyleOptionsLoading] = useState(
    providedVisualStyleOptions.length === 0,
  )
  const [visualStyleOptionsError, setVisualStyleOptionsError] = useState<unknown>()
  const [looksLoading, setLooksLoading] = useState(Number.isInteger(numericAssetId) && numericAssetId > 0)
  const [looksError, setLooksError] = useState<unknown>()
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [lookMenuOpen, setLookMenuOpen] = useState(false)
  const [referenceMenuOpen, setReferenceMenuOpen] = useState<'panel' | 'description' | null>(null)
  const [rewriteOpen, setRewriteOpen] = useState(false)
  const [rewriteDraft, setRewriteDraft] = useState(initialAsset?.prompt ?? '')
  const [rewriteInstruction, setRewriteInstruction] = useState('')
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [viewerImageUrl, setViewerImageUrl] = useState<string>()
  const [generationSubmitPending, setGenerationSubmitPending] = useState(false)
  const [generationCreditCost, setGenerationCreditCost] = useState<number>()
  const [generationCreditEstimateLoading, setGenerationCreditEstimateLoading] = useState(false)
  const [referenceUploadPending, setReferenceUploadPending] = useState(false)
  const [localLookUploadPending, setLocalLookUploadPending] = useState(false)
  const [downloadingFileId, setDownloadingFileId] = useState<string>()
  const [lookEpisodeSelectionPending, setLookEpisodeSelectionPending] = useState(false)
  const [lookEpisodeConfirmId, setLookEpisodeConfirmId] = useState<string>()
  const [lookRenamePendingId, setLookRenamePendingId] = useState<string>()
  const [primaryImagePendingId, setPrimaryImagePendingId] = useState<string>()
  const [referenceDragOver, setReferenceDragOver] = useState(false)
  const generationSubmitPendingRef = useRef(false)
  const referenceUploadPendingRef = useRef(false)
  const savedLookNamesRef = useRef(new Map<string, string>())
  const looksLoadRevisionRef = useRef(0)
  const historyDragItemRef = useRef<ResolvedAssetImageHistoryItem | null>(null)
  const activeLook = looks.find((look) => look.id === activeLookId) ?? looks[0]
  const latestLooksRef = useRef(looks)
  const activeLookIdRef = useRef(activeLookId)
  const loadedLooksContextRef = useRef<string>()
  latestLooksRef.current = looks
  activeLookIdRef.current = activeLookId
  const episodeLook = looks.find((look) => look.status === 1)
  const lookEpisodeConfirmTarget = looks.find((look) => look.id === lookEpisodeConfirmId)
  const activeLookBackendId = activeLook?.backendId ?? null
  const lookGenerationState: AssetImageGenerationViewState | undefined = lookTaskSnapshot.phase === 'idle'
    || (lookTaskSnapshot.phase === 'failed' && (activeLookId === 'main' || activeLookBackendId !== null))
    ? undefined
    : {
      phase: lookTaskSnapshot.phase,
      progress: lookTaskSnapshot.progress,
      errorMessage: lookTaskSnapshot.errorMessage,
    }
  const workspaceTitle = initialAsset?.name || l(copy.titleZh, copy.titleEn)
  const maxReferenceImages = Number.isFinite(referenceImageLimit)
    ? Math.max(0, Math.floor(referenceImageLimit))
    : MAX_REFERENCE_IMAGES
  const references = useMemo<ResolvedReferenceImage[]>(() => {
    const seen = new Set<string>()
    return referenceImages.flatMap((reference) => {
      const url = resolveAssetUrl(reference.url ?? reference.fileId)
      const dedupeKey = reference.fileId ? `file:${reference.fileId}` : `url:${url}`
      if (!url || seen.has(dedupeKey)) return []
      seen.add(dedupeKey)
      return [{ id: reference.id, fileId: reference.fileId, name: reference.name, url }]
    })
  }, [referenceImages])
  const referenceCount = Number.isFinite(referenceImageCount)
    ? Math.max(references.length, Math.max(0, Math.floor(referenceImageCount ?? 0)))
    : references.length
  const referenceImagesErrorMessage = referenceImagesError
    ? getApiErrorMessage(
        referenceImagesError,
        l('参考图加载失败', 'Failed to load reference images'),
      )
    : ''
  const hasEmptyLook = looks.some((look) => (
    look.id !== 'main' && !(look.id === activeLookId ? previewImage : look.imageUrl)
  ))
  const availableVisualStyleOptions: AssetVisualStyleOption[] = providedVisualStyleOptions.length
    ? providedVisualStyleOptions
    : loadedVisualStyleOptions.length
      ? loadedVisualStyleOptions
      : providedVisualStyleNames.map((optionName): AssetVisualStyleOption => ({ name: optionName }))
  const selectedStyleOption = selectedStyle
    ? availableVisualStyleOptions.find((option) => option.name === selectedStyle)
    : undefined
  const selectedStyleIsNone = Boolean(selectedStyle && isNoStyleName(selectedStyle))
  const selectedVisualStyleId = selectedStyleIsNone
    ? null
    : (() => {
        const value = Number(
          selectedStyleOption?.id
          ?? (selectedStyle === savedStyleName ? savedVisualStyleId : undefined),
        )
        return Number.isInteger(value) && value > 0 ? value : null
      })()
  const selectedStyleResolved = Boolean(
    selectedStyle && (selectedStyleIsNone || selectedVisualStyleId !== null),
  )
  const displayGenerationState = lookGenerationState ?? generationState
  const generationTargetLook = lookGenerationState
    ? looks.find((look) => look.id === lookTaskSnapshot.clientLookId)
    : generationState?.lookId === undefined
      ? activeLook
      : looks.find((look) => generationState.lookId === null
        ? look.id === 'main'
        : look.backendId === generationState.lookId)
  const getGenerationStateForLook = (look: LookDraft | undefined) => {
    if (!look) return undefined
    const singleState = look.id === generationTargetLook?.id ? displayGenerationState : undefined
    return lookGenerationState
      ? singleState
      : getLookGenerationState(look.backendId, batchGenerationStatesByLookId, singleState)
  }
  const previewGenerationState = getGenerationStateForLook(activeLook)
  const showPendingLookProgress = hasAssetGenerationProgress(lookGenerationState) && !generationTargetLook
  const retryGenerationResult = lookGenerationState
    ? () => lookGenerationTask?.resume()
    : onGenerationResultRetry
  const generationBusy = displayGenerationState?.phase === 'submitting'
    || displayGenerationState?.phase === 'running'
    || displayGenerationState?.phase === 'refreshing'
  const displayGenerationProgress = Math.max(0, Math.min(100, Math.round(displayGenerationState?.progress ?? 0)))
  const generationButtonLabel = generationBusy
    ? displayGenerationState?.phase === 'refreshing' && displayGenerationProgress >= 100
      ? l('正在加载结果…', 'Loading result…')
      : l(`生成中 ${displayGenerationProgress}%`, `Generating ${displayGenerationProgress}%`)
    : generationSubmitPending
      ? l('正在保存设置…', 'Saving settings…')
      : l('生成', 'Generate')
  const generationRecoveryRequired = displayGenerationState?.phase === 'poll-failed'
    || displayGenerationState?.phase === 'refresh-failed'
  const generationLocked = generationBusy
    || generationRecoveryRequired
    || generationSubmitPending
    || referenceUploadPending
    || localLookUploadPending
    || lookEpisodeSelectionPending
    || Boolean(lookRenamePendingId)
    || Boolean(primaryImagePendingId)
  const generationCreditCostText = generationCreditEstimateLoading && generationCreditCost === undefined
    ? '…'
    : generationCreditCost === undefined
      ? '--'
      : Number.isInteger(generationCreditCost)
        ? String(generationCreditCost)
        : generationCreditCost.toFixed(2).replace(/\.?0+$/, '')
  const referenceDropAllowed = (Boolean(onReferenceImagesUpload) || Boolean(onReferenceImageIdsUpload))
    && !generationLocked
    && !referenceImagesLoading
    && referenceCount < maxReferenceImages
  const resolvedImageHistoryItems = useMemo<ResolvedAssetImageHistoryItem[]>(() => {
    const seen = new Set<string>()
    const items = imageHistoryItems.flatMap((item) => {
      const fileId = item.fileId?.trim() || undefined
      const versionId = item.versionId?.trim() || undefined
      const imageUrl = resolveAssetUrl(item.imageUrl ?? item.fileUrl ?? item.fileId ?? item.thumbnailUrl)
      const thumbnailUrl = resolveAssetUrl(item.thumbnailUrl ?? item.imageUrl ?? item.fileUrl ?? item.fileId)
        ?? imageUrl
      const dedupeKey = versionId
        ? `version:${versionId}`
        : fileId
          ? `file:${fileId}`
          : `url:${imageUrl}`
      if (!imageUrl || !thumbnailUrl || seen.has(dedupeKey)) return []
      seen.add(dedupeKey)
      const operationType = normalizeHistoryOperationType(item.operationType)
      const operationTypeName = normalizeHistoryOperationName(item.operationTypeName)
      return [{
        id: item.id,
        fileId,
        versionId,
        imageUrl,
        thumbnailUrl,
        operationType,
        operationTypeName,
        isAssetLibraryImport: isAssetLibraryImportOperation(operationType, operationTypeName),
        isCurrent: Boolean(item.isCurrent ?? item.primary),
        isSelected: false,
        createdAt: item.createdAt,
        prompt: item.prompt,
        aspectRatio: item.aspectRatio,
        visualStyleId: item.visualStyleId,
        modelId: item.modelId,
        resolution: item.resolution,
        lookId: item.lookId,
      }]
    })
    const currentFileId = currentImageFileIdString
    const currentImageUrl = resolveAssetUrl(previewImage ?? currentFileId)
    if (!currentImageUrl) return items
    // 选中项跟随预览；文件 ID 仅用于原主图地址不一致时的兜底。
    const previewImageIndex = items.findIndex((item) => item.imageUrl === currentImageUrl)
    const currentFileIndex = currentFileId && currentImageUrl === resolveAssetUrl(initialAsset?.imageUrl)
      ? items.findIndex((item) => item.fileId === currentFileId)
      : -1
    const currentIndex = previewImageIndex >= 0 ? previewImageIndex : currentFileIndex
    if (currentIndex >= 0) {
      return items.map((item, index) => ({
        ...item,
        isSelected: index === currentIndex,
      }))
    }
    return [{
      id: 'current-preview',
      fileId: resolvePreviewImageFileId(currentImageUrl, {
        imageUrl: resolveAssetUrl(activeLook?.imageUrl),
        fileId: activeLook?.coverFileId,
      }, {
        imageUrl: resolveAssetUrl(initialAsset?.imageUrl),
        fileId: currentFileId,
      }),
      imageUrl: currentImageUrl,
      thumbnailUrl: currentImageUrl,
      operationType: null,
      isAssetLibraryImport: false,
      isCurrent: true,
      isSelected: true,
    }, ...items.map((item) => ({ ...item, isSelected: false }))]
  }, [activeLook?.coverFileId, activeLook?.imageUrl, currentImageFileIdString, imageHistoryItems, initialAsset?.imageUrl, previewImage])
  const selectedHistoryItem = resolvedImageHistoryItems.find((item) => item.isSelected)
  const currentPreviewHistoryItem = resolvedImageHistoryItems.find((item) => item.isCurrent)
  const currentAssetReferenceItem = selectedHistoryItem ?? currentPreviewHistoryItem
  const selectedPastHistoryItem = selectedHistoryItem && !selectedHistoryItem.isCurrent
    ? selectedHistoryItem
    : resolvedImageHistoryItems.find((item) => !item.isCurrent)
  const selectedHistoryCanSetPrimary = Boolean(
    selectedHistoryItem?.versionId
      && !selectedHistoryItem.isCurrent
      && onPrimaryImageChange
      && !primaryImagePendingId,
  )
  const imageHistoryErrorMessage = imageHistoryError
    ? getApiErrorMessage(
        imageHistoryError,
        l('历史图片加载失败', 'Failed to load image history'),
      )
    : ''
  const looksErrorMessage = looksError
    ? getApiErrorMessage(
        looksError,
        l('造型列表加载失败', 'Failed to load looks'),
      )
    : ''
  const resolveVisualStyleName = (value: number | null | undefined) => {
    if (value === null || value === undefined) return undefined
    return availableVisualStyleOptions.find((option) => Number(option.id) === value)?.name
  }
  const initialImageOptions = useRef<AssetImageOptionsInput>({
    prompt: initialAsset?.prompt ?? '',
    lookId: activeLookBackendId,
    styleName: savedStyleName ?? '',
    visualStyleId: savedVisualStyleId,
    aspectRatio: selectedRatio,
  })
  const latestImageOptionsRef = useRef<AssetImageOptionsInput>(initialImageOptions.current)
  const latestImageOptionsRevisionRef = useRef(0)
  const savedImageOptionsSignatureRef = useRef(
    imageOptionsRequireSave ? '' : getImageOptionsSignature(initialImageOptions.current),
  )
  const incomingImageOptionsSignatureRef = useRef(JSON.stringify([
    getImageOptionsSignature(initialImageOptions.current),
    initialImageOptions.current.styleName,
  ]))
  const imageOptionsTouchedRef = useRef(false)
  const activeImageOptionsSaveRef = useRef<Promise<void> | null>(null)
  const imageOptionsMountedRef = useRef(true)
  const imageOptionsUpdateRef = useRef(onImageOptionsUpdate)
  const imageOptionsRequireSaveRef = useRef(imageOptionsRequireSave)
  imageOptionsUpdateRef.current = onImageOptionsUpdate
  imageOptionsRequireSaveRef.current = imageOptionsRequireSave

  const handleSetPrimaryImage = async (item: ResolvedAssetImageHistoryItem) => {
    if (!item.versionId || item.isCurrent || !onPrimaryImageChange || primaryImagePendingId) return
    setPrimaryImagePendingId(item.id)
    try {
      await onPrimaryImageChange({
        id: item.id,
        fileId: item.fileId,
        imageUrl: item.imageUrl,
        thumbnailUrl: item.thumbnailUrl,
        versionId: item.versionId,
        isCurrent: item.isCurrent,
        createdAt: item.createdAt,
        lookId: item.lookId ?? activeLookBackendId,
      })
      setLooks((current) => current.map((look) => (
        look.backendId === (item.lookId ?? activeLookBackendId)
          ? { ...look, imageUrl: item.imageUrl, coverFileId: item.fileId }
          : look
      )))
      message.success(l('已设为主图', 'Primary image updated'))
    } catch (error) {
      message.error(getApiErrorMessage(
        error,
        l('设置主图失败，请重试', 'Failed to set primary image; try again'),
      ))
    } finally {
      if (imageOptionsMountedRef.current) setPrimaryImagePendingId(undefined)
    }
  }

  const flushImageOptions = useCallback(async (drainLatest = true, force = false): Promise<void> => {
    const requestedRevision = latestImageOptionsRevisionRef.current

    const activeSave = activeImageOptionsSaveRef.current
    if (activeSave) {
      try {
        await activeSave
      } catch {
        // 下面会用最新快照重试一次，生成操作不会沿用失败的旧请求。
      }
    }

    if (!drainLatest && latestImageOptionsRevisionRef.current !== requestedRevision) return

    const update = imageOptionsUpdateRef.current
    const input = latestImageOptionsRef.current
    const signature = getImageOptionsSignature(input)
    if (!update || (!force && signature === savedImageOptionsSignatureRef.current)) return
    if (force || latestImageOptionsRevisionRef.current === 0) {
      latestImageOptionsRevisionRef.current = createImageOptionsClientRevision()
    }

    const saveRequest = update(input, latestImageOptionsRevisionRef.current)
    activeImageOptionsSaveRef.current = saveRequest
    try {
      await saveRequest
      savedImageOptionsSignatureRef.current = signature
    } finally {
      if (activeImageOptionsSaveRef.current === saveRequest) {
        activeImageOptionsSaveRef.current = null
      }
    }

    if (
      drainLatest
      && getImageOptionsSignature(latestImageOptionsRef.current)
      !== savedImageOptionsSignatureRef.current
    ) {
      await flushImageOptions(true, false)
    }
  }, [])

  const createCurrentImageOptions = (
    overrides: Partial<AssetImageOptionsInput> = {},
  ): AssetImageOptionsInput => ({
    prompt,
    lookId: activeLookBackendId,
    styleName: selectedStyle ?? '',
    visualStyleId: selectedVisualStyleId,
    aspectRatio: selectedRatio,
    ...overrides,
  })

  const handlePromptChange = (value: string) => {
    imageOptionsTouchedRef.current = true
    setPrompt(value)
  }

  const handleRatioChange = (value: string) => {
    imageOptionsTouchedRef.current = true
    setSelectedRatio(value)
  }

  const handleStyleChange = (value: string) => {
    imageOptionsTouchedRef.current = true
    setSelectedStyle(value)
  }

  const closeWorkspace = useCallback(() => {
    onClose()
  }, [onClose])

  const createLookDraftFromRemote = useCallback((item: StudioAssetLookItem): LookDraft => {
    const backendId = Number(item.id)
    const defaultLook = Boolean(item.defaultLook)
    const lookId = defaultLook
      ? 'main'
      : Number.isInteger(backendId) && backendId > 0
        ? `look-${backendId}`
        : `look-${item.id}`
    const inEpisode = item.status === 1
    return {
      id: lookId,
      backendId: Number.isInteger(backendId) && backendId > 0 ? backendId : undefined,
      name: defaultLook ? (initialAsset?.name || item.name) : item.name,
      prompt: item.prompt ?? '',
      imageUrl: resolveAssetUrl(item.coverUrl ?? item.coverFileId),
      coverFileId: item.coverFileId === undefined || item.coverFileId === null ? undefined : String(item.coverFileId),
      aspectRatio: item.aspectRatio,
      visualStyleId: item.visualStyleId,
      modelId: item.modelId,
      resolution: item.resolution,
      status: item.status,
      statusName: item.statusName,
      defaultLook,
      inEpisode,
    }
  }, [initialAsset?.name])

  const rememberSavedLookNames = (nextLooks: LookDraft[]) => {
    savedLookNamesRef.current = new Map(
      nextLooks
        .filter((look) => look.backendId !== undefined)
        .map((look) => [look.id, look.name]),
    )
  }

  const applyLookDraftToEditor = (look: LookDraft) => {
    const nextOptions = resolveAssetImageOptions({
      asset: initialAsset ?? {},
      look: { ...look, id: String(look.backendId ?? look.id), episodeIds: [] },
      ratio,
      ratioOptions: supportedRatioOptions,
      styleOptions: availableVisualStyleOptions,
      queuedInput: look.editorOptionsTouched ? undefined : queuedImageOptions,
      noStyleName: noStyleLabel,
    })
    setPrompt(nextOptions.prompt)
    setRewriteDraft(nextOptions.prompt)
    setPreviewImage(look.imageUrl)
    setSelectedRatio(nextOptions.aspectRatio)
    setSelectedStyle(nextOptions.styleName || undefined)
    latestImageOptionsRef.current = nextOptions
  }
  const applyLookDraftToEditorRef = useRef(applyLookDraftToEditor)
  applyLookDraftToEditorRef.current = applyLookDraftToEditor

  const applyGeneratedLooksRef = useRef<(items: StudioAssetLookItem[], selected: StudioAssetLookItem) => void>()
  applyGeneratedLooksRef.current = (items, selected) => {
    const nextLooks = items.map(createLookDraftFromRemote)
    const nextLook = createLookDraftFromRemote(selected)
    rememberSavedLookNames(nextLooks)
    setLooks(nextLooks)
    setActiveLookId(nextLook.id)
    applyLookDraftToEditor(nextLook)
    onActiveLookChange?.(nextLook.backendId ?? null)
  }

  const canGenerate = Boolean(
    name.trim()
    && prompt.trim()
    && selectedStyleResolved
    && supportedRatioOptions.includes(selectedRatio)
    && model
    && resolution
    && !generationBusy
    && !generationRecoveryRequired
    && !generationSubmitPending
    && !referenceUploadPending
    && !localLookUploadPending
    && !looksLoading
    && !looksError
    && !generationUnavailableReason,
  )

  useEffect(() => {
    imageOptionsMountedRef.current = true
    return () => {
      imageOptionsMountedRef.current = false
      referenceUploadPendingRef.current = false
    }
  }, [])

  useEffect(() => {
    onGenerationPreparationStateChange?.(
      generationSubmitPending
      || referenceUploadPending
      || lookTaskSnapshot.phase === 'submitting'
      || lookTaskSnapshot.phase === 'running'
      || lookTaskSnapshot.phase === 'refreshing',
    )
  }, [generationSubmitPending, lookTaskSnapshot.phase, onGenerationPreparationStateChange, referenceUploadPending])

  useEffect(() => () => {
    onGenerationPreparationStateChange?.(false)
  }, [onGenerationPreparationStateChange])

  useEffect(() => {
    const modelId = Number(model)
    const resolutionValue = Number(resolution)
    if (
      !Number.isInteger(modelId)
      || modelId <= 0
      || !Number.isInteger(resolutionValue)
      || resolutionValue <= 0
    ) {
      setGenerationCreditCost(undefined)
      setGenerationCreditEstimateLoading(false)
      return undefined
    }

    let active = true
    setGenerationCreditEstimateLoading(true)
    const request = StudioAssetGenerationApi.requestGenerateEstimate({
      modelId,
      quality: null,
      resolution: resolutionValue,
    })

    request.promise
      .then((estimate) => {
        if (!active) return
        setGenerationCreditCost(estimate.creditCost)
      })
      .catch(() => {
        if (!active) return
        setGenerationCreditCost(undefined)
      })
      .finally(() => {
        if (active) setGenerationCreditEstimateLoading(false)
      })

    return () => {
      active = false
      request.cancel()
    }
  }, [model, resolution])

  useEffect(() => {
    const numericAssetId = Number(assetId)
    if (!Number.isInteger(numericAssetId) || numericAssetId <= 0) return undefined
    // The dedicated result loader owns this phase and must not be invalidated by a parallel refresh.
    if (lookGenerationTask?.getSnapshot().phase === 'refreshing') return undefined

    let active = true
    const requestRevision = ++looksLoadRevisionRef.current
    setLooksLoading(true)
    setLooksError(undefined)
    const request = StudioAssetGenerationApi.requestLooks(numericAssetId, episodeId)
    void request.promise
      .then((items) => {
        if (!active || requestRevision !== looksLoadRevisionRef.current) return
        const context = `${numericAssetId}:${episodeId ?? 'overview'}`
        const refreshExisting = loadedLooksContextRef.current === context
        const previousLooks = latestLooksRef.current
        const previousLook = previousLooks.find((look) => look.id === activeLookIdRef.current)
        const nextLooks = [
          ...items.map(createLookDraftFromRemote),
          ...(refreshExisting ? previousLooks.filter((look) => look.id !== 'main' && look.backendId === undefined) : []),
        ]
        if (!nextLooks.length) return
        loadedLooksContextRef.current = context
        rememberSavedLookNames(nextLooks)
        const preferredLook = Number.isInteger(Number(preferredLookId)) && Number(preferredLookId) > 0
          ? nextLooks.find((look) => look.backendId === Number(preferredLookId))
          : undefined
        const nextActiveLook = (refreshExisting
          ? nextLooks.find((look) => look.id === activeLookIdRef.current)
          : preferredLook) ?? selectInitialAssetLook(nextLooks)!
        setLooks(nextLooks)
        setActiveLookId(nextActiveLook.id)
        if (refreshExisting && nextActiveLook.id === previousLook?.id) {
          setPreviewImage((current) => !current || current === previousLook.imageUrl ? nextActiveLook.imageUrl : current)
        } else {
          applyLookDraftToEditorRef.current(nextActiveLook)
        }
        onActiveLookChange?.(nextActiveLook.backendId ?? null)
      })
      .catch((error) => {
        if (!active || requestRevision !== looksLoadRevisionRef.current) return
        setLooksError(error)
        message.error(getApiErrorMessage(
          error,
          l('造型列表加载失败', 'Failed to load looks'),
        ))
      })
      .finally(() => {
        if (active && requestRevision === looksLoadRevisionRef.current) setLooksLoading(false)
      })

    return () => {
      active = false
      request.cancel()
    }
  }, [assetId, createLookDraftFromRemote, episodeId, l, lookGenerationTask, onActiveLookChange, preferredLookId, resultsRefreshToken])

  const styleOptions = useMemo(() => {
    if (visualStyleOptionsLoading && providedVisualStyleOptions.length === 0) return []
    const uniqueOptions = new Map<string, AssetVisualStyleOption>()
    uniqueOptions.set(noStyleLabel, { name: noStyleLabel })
    availableVisualStyleOptions.forEach((option) => uniqueOptions.set(option.name, option))
    if (projectStyleName && !uniqueOptions.has(projectStyleName)) {
      uniqueOptions.set(projectStyleName, { name: projectStyleName })
    }
    if (savedStyleName && !uniqueOptions.has(savedStyleName)) {
      uniqueOptions.set(savedStyleName, {
        id: savedVisualStyleId ?? undefined,
        name: savedStyleName,
      })
    }
    return [...uniqueOptions.values()].map((option) => ({
      value: option.name,
      trigger: option.name,
      label: (
        <span className="asset-generation-workspace__style-option">
          <span className="asset-generation-workspace__style-option-thumb">
            {option.coverUrl ? (
              <img src={option.coverUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />
            ) : option.name === noStyleLabel ? <StopOutlined /> : <PictureOutlined />}
          </span>
          <span className="asset-generation-workspace__style-option-name" title={option.name}>
            {option.name}
          </span>
        </span>
      ),
    }))
  }, [
    availableVisualStyleOptions,
    noStyleLabel,
    projectStyleName,
    providedVisualStyleOptions.length,
    savedStyleName,
    savedVisualStyleId,
    visualStyleOptionsLoading,
  ])

  useEffect(() => {
    if (providedVisualStyleOptions.length) {
      setVisualStyleOptionsError(undefined)
      setVisualStyleOptionsLoading(false)
      return undefined
    }

    let active = true
    setVisualStyleOptionsError(undefined)
    setVisualStyleOptionsLoading(true)
    void loadAssetVisualStyleOptions()
      .then((options) => {
        if (active) setLoadedVisualStyleOptions(options)
      })
      .catch((error) => {
        if (!active) return
        setVisualStyleOptionsError(error)
        message.error(getApiErrorMessage(
          error,
          l('画面风格加载失败', 'Failed to load visual styles'),
        ))
      })
      .finally(() => {
        if (active) setVisualStyleOptionsLoading(false)
      })

    return () => { active = false }
  }, [l, providedVisualStyleOptions])

  useEffect(() => {
    if (selectedStyle || savedVisualStyleId === null) return
    const savedOption = availableVisualStyleOptions.find((option) => (
      Number(option.id) === savedVisualStyleId
    ))
    if (savedOption) setSelectedStyle(savedOption.name)
  }, [availableVisualStyleOptions, savedVisualStyleId, selectedStyle])

  useEffect(() => {
    if (supportedRatioOptions.includes(selectedRatio)) return
    setSelectedRatio(
      supportedRatioOptions.includes(DEFAULT_ASSET_IMAGE_RATIO)
        ? DEFAULT_ASSET_IMAGE_RATIO
        : supportedRatioOptions[0] ?? DEFAULT_ASSET_IMAGE_RATIO,
    )
  }, [selectedRatio, supportedRatioOptions])

  useEffect(() => {
    // Character covers belong to individual looks and are refreshed through requestLooks.
    if (kind === 'role') return
    const nextImageUrl = initialPreviewImageUrl
    if (!nextImageUrl) return
    setPreviewImage((current) => current === nextImageUrl ? current : nextImageUrl)
    setLooks((current) => current.map((look) => (
      look.id === 'main' && look.imageUrl !== nextImageUrl
        ? { ...look, imageUrl: nextImageUrl }
        : look
    )))
  }, [initialPreviewImageUrl, kind])

  useEffect(() => {
    if (activeLookId !== 'main') return
    const nextOptions = resolveAssetImageOptions({
      asset: initialAsset ?? {},
      look: activeLook?.backendId === undefined ? undefined : {
        ...activeLook,
        id: String(activeLook.backendId),
        episodeIds: [],
      },
      ratio,
      ratioOptions: supportedRatioOptions,
      styleOptions: availableVisualStyleOptions,
      queuedInput: queuedImageOptions,
      noStyleName: noStyleLabel,
    })
    const incomingSignature = JSON.stringify([
      getImageOptionsSignature(nextOptions),
      nextOptions.styleName,
    ])
    if (incomingImageOptionsSignatureRef.current === incomingSignature) return
    incomingImageOptionsSignatureRef.current = incomingSignature
    if (imageOptionsTouchedRef.current) return

    setPrompt(nextOptions.prompt)
    setRewriteDraft(nextOptions.prompt)
    setSelectedRatio(nextOptions.aspectRatio)
    setSelectedStyle(nextOptions.styleName || undefined)
    latestImageOptionsRef.current = nextOptions
    if (!imageOptionsRequireSaveRef.current) {
      savedImageOptionsSignatureRef.current = getImageOptionsSignature(nextOptions)
    }
  }, [
    activeLook,
    activeLookId,
    availableVisualStyleOptions,
    initialAsset,
    noStyleLabel,
    queuedImageOptions,
    ratio,
    supportedRatioOptions,
  ])

  useEffect(() => {
    if (activeLookId === 'main' || activeLookBackendId === null || imageOptionsTouchedRef.current) return
    // 造型可能先于风格列表返回，只补齐当前设置的风格名称，保留已选历史图的其他参数。
    const options = latestImageOptionsRef.current
    const resolvedName = options.visualStyleId === null
      ? noStyleLabel
      : availableVisualStyleOptions.find((style) => Number(style.id) === options.visualStyleId)?.name
    if (!resolvedName || resolvedName === selectedStyle) return
    setSelectedStyle(resolvedName)
    latestImageOptionsRef.current = { ...options, styleName: resolvedName }
  }, [activeLookBackendId, activeLookId, availableVisualStyleOptions, noStyleLabel, selectedStyle])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (imageViewerOpen) {
        setImageViewerOpen(false)
        return
      }
      if (rewriteOpen) {
        setRewriteOpen(false)
        return
      }
      if (lookMenuOpen) {
        setLookMenuOpen(false)
        return
      }
      if (lookEpisodeConfirmId) {
        setLookEpisodeConfirmId(undefined)
        return
      }
      if (referenceMenuOpen) {
        setReferenceMenuOpen(null)
        return
      }
      if (promptExpanded) {
        setPromptExpanded(false)
        return
      }
      closeWorkspace()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [
    closeWorkspace,
    imageViewerOpen,
    lookEpisodeConfirmId,
    lookMenuOpen,
    promptExpanded,
    referenceMenuOpen,
    rewriteOpen,
  ])

  useEffect(() => {
    if (!lookMenuOpen) return
    const closeLookMenu = (event: PointerEvent) => {
      if (!lookAddRef.current?.contains(event.target as Node)) setLookMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeLookMenu)
    return () => document.removeEventListener('pointerdown', closeLookMenu)
  }, [lookMenuOpen])

  useEffect(() => {
    if (!referenceMenuOpen) return
    const closeReferenceMenu = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Element
        && (
          target.closest('.asset-generation-workspace__reference-add-wrap')
          || target.closest('.asset-generation-workspace__reference-add-popover')
        )
      ) return
      setReferenceMenuOpen(null)
    }
    document.addEventListener('pointerdown', closeReferenceMenu, true)
    return () => document.removeEventListener('pointerdown', closeReferenceMenu, true)
  }, [referenceMenuOpen])

  useEffect(() => {
    if (!referenceDropAllowed) {
      setReferenceDragOver(false)
      return undefined
    }

    const hasFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? [])
      .includes('Files')
    const clearReferenceDrag = () => setReferenceDragOver(false)
    const handleDocumentDragEnter = (event: DragEvent) => {
      if (hasFileDrag(event)) {
        setReferenceMenuOpen(null)
        setReferenceDragOver(true)
      }
    }
    const handleDocumentDragLeave = (event: DragEvent) => {
      if (!event.relatedTarget) setReferenceDragOver(false)
    }

    document.addEventListener('dragenter', handleDocumentDragEnter)
    document.addEventListener('dragleave', handleDocumentDragLeave)
    document.addEventListener('drop', clearReferenceDrag)
    document.addEventListener('dragend', clearReferenceDrag)

    return () => {
      document.removeEventListener('dragenter', handleDocumentDragEnter)
      document.removeEventListener('dragleave', handleDocumentDragLeave)
      document.removeEventListener('drop', clearReferenceDrag)
      document.removeEventListener('dragend', clearReferenceDrag)
    }
  }, [referenceDropAllowed])

  const openPromptRewrite = () => {
    setRewriteDraft(prompt)
    setRewriteInstruction('')
    setRewriteOpen(true)
  }

  const openImageViewer = (imageUrl = previewImage) => {
    if (!imageUrl) return
    setViewerImageUrl(imageUrl)
    setImageViewerOpen(true)
  }

  const downloadPreviewImage = async () => {
    const fileId = normalizeMediaFileId(selectedHistoryItem?.fileId)
    if (!fileId || downloadingFileId) return
    setDownloadingFileId(fileId)
    try {
      await downloadMediaFile(fileId)
    } catch (error) {
      message.error(error instanceof Error && error.message.trim()
        ? error.message
        : l('下载失败，请重试', 'Download failed; try again'))
    } finally {
      if (imageOptionsMountedRef.current) setDownloadingFileId(undefined)
    }
  }

  const selectHistoryImage = (item: ResolvedAssetImageHistoryItem) => {
    setPreviewImage(item.imageUrl)
    setViewerImageUrl(undefined)
    setImageViewerOpen(false)

    const nextLook = item.lookId
      ? looks.find((look) => look.backendId === item.lookId)
      : undefined
    if (nextLook && nextLook.id !== activeLookId) {
      setActiveLookId(nextLook.id)
      onActiveLookChange?.(nextLook.backendId ?? null)
    }

    const nextPrompt = item.prompt
    const nextRatio = item.aspectRatio && supportedRatioOptions.includes(item.aspectRatio)
      ? item.aspectRatio
      : undefined
    const nextStyleName = resolveVisualStyleName(item.visualStyleId)
    if (nextPrompt !== undefined) {
      setPrompt(nextPrompt)
      setRewriteDraft(nextPrompt)
    }
    if (nextRatio) setSelectedRatio(nextRatio)
    if (nextStyleName) setSelectedStyle(nextStyleName)
    if (item.modelId !== null && item.modelId !== undefined) {
      const nextModel = String(item.modelId)
      if (modelOptions.some((option) => option.value === nextModel)) onModelChange(nextModel)
    }
    if (item.resolution !== null && item.resolution !== undefined) {
      const nextResolution = String(item.resolution)
      if (resolutionOptions.some((option) => option.value === nextResolution)) {
        onResolutionChange(nextResolution)
      }
    }

    const nextOptions = createCurrentImageOptions({
      prompt: nextPrompt ?? prompt,
      lookId: item.lookId ?? nextLook?.backendId ?? activeLookBackendId,
      styleName: nextStyleName ?? selectedStyle ?? '',
      visualStyleId: item.visualStyleId ?? selectedVisualStyleId,
      aspectRatio: nextRatio ?? selectedRatio,
    })
    latestImageOptionsRef.current = nextOptions
    savedImageOptionsSignatureRef.current = getImageOptionsSignature(nextOptions)
    imageOptionsTouchedRef.current = false
  }

  const notifyImageToolApiMissing = (toolName: string) => {
    message.info(l(
      `${toolName}接口还没配置，给我接口后我再接真实请求`,
      `${toolName} API is not configured yet`,
    ))
  }

  useEffect(() => {
    if (!lookGenerationTask || lookTaskSnapshot.phase !== 'refreshing' || !lookTaskSnapshot.taskId) {
      return undefined
    }

    const taskId = lookTaskSnapshot.taskId
    const requestRevision = ++looksLoadRevisionRef.current
    let active = true
    setLooksLoading(true)
    setLooksError(undefined)
    const request = StudioAssetGenerationApi.requestLooks(numericAssetId, episodeId)
    void request.promise.then((items) => {
      if (!active || requestRevision !== looksLoadRevisionRef.current) return
      const generatedLook = items.find((item) => {
        if (!resolveAssetUrl(item.coverUrl ?? item.coverFileId)) return false
        if (lookTaskSnapshot.expectedFileId) {
          return String(item.coverFileId) === lookTaskSnapshot.expectedFileId
        }
        return !item.defaultLook
          && item.name.trim() === lookTaskSnapshot.lookName
          && !lookTaskSnapshot.previousLookIds?.includes(String(item.id))
      })
      if (!generatedLook) {
        throw new Error(l(
          '造型任务已完成，但新造型暂未回显，请重新加载结果',
          'The look task finished, but the new look is not visible yet. Reload the result.',
        ))
      }
      applyGeneratedLooksRef.current?.(items, generatedLook)
      setLooksLoading(false)
      lookGenerationTask.complete(taskId)
      message.success(l('造型生成完成', 'Look generation complete'))
    }).catch((error) => {
      if (!active || requestRevision !== looksLoadRevisionRef.current) return
      setLooksLoading(false)
      lookGenerationTask.setRefreshFailed(taskId, getApiErrorMessage(
        error,
        l('造型已生成，但结果加载失败，请重新加载结果', 'The look was generated, but its result could not be loaded. Reload the result.'),
      ))
    })

    return () => {
      active = false
      request.cancel()
    }
  }, [episodeId, l, lookGenerationTask, lookTaskSnapshot, numericAssetId])

  const submitLookGeneration = async (input: AssetImageGenerationInput) => {
    const numericAssetId = Number(assetId)
    const modelId = Number(model)
    const resolutionValue = Number(resolution)
    if (!Number.isInteger(numericAssetId) || numericAssetId <= 0 || !lookGenerationTask) {
      throw new Error(l('当前资产还没有后端资产 ID，无法生成造型', 'This asset does not have a backend asset ID yet'))
    }
    if (
      !Number.isInteger(modelId)
      || modelId <= 0
      || !Number.isInteger(resolutionValue)
      || resolutionValue <= 0
    ) {
      throw new Error(l('请选择可用的模型和分辨率', 'Select an available model and resolution'))
    }
    const lookName = activeLook?.name?.trim() || input.name
    const referenceFileIds = references
      .map((reference) => Number(reference.fileId))
      .filter((value) => Number.isInteger(value) && value > 0)

    await lookGenerationTask.submit({
      assetId: numericAssetId,
      name: lookName,
      prompt: input.prompt,
      referenceFileIds,
      aspectRatio: input.aspectRatio,
      visualStyleId: input.visualStyleId,
      quality: null,
      resolution: resolutionValue,
      modelId,
    }, looks.flatMap((look) => look.backendId === undefined ? [] : [String(look.backendId)]), activeLookId)
    if (imageOptionsMountedRef.current) {
      message.success(l('造型生成任务已提交', 'Look generation task submitted'))
    }
  }

  const submitGeneration = async () => {
    if (!canGenerate || generationSubmitPendingRef.current) return
    const generationInput: AssetImageGenerationInput = {
      name: name.trim(),
      prompt: prompt.trim(),
      lookId: activeLookBackendId,
      styleName: selectedStyle ?? '',
      visualStyleId: selectedVisualStyleId,
      aspectRatio: selectedRatio,
    }
    generationSubmitPendingRef.current = true
    setGenerationSubmitPending(true)
    try {
      try {
        latestImageOptionsRef.current = {
          prompt: generationInput.prompt,
          lookId: generationInput.lookId,
          styleName: generationInput.styleName,
          visualStyleId: generationInput.visualStyleId,
          aspectRatio: generationInput.aspectRatio,
        }
        await flushImageOptions(true, true)
      } catch (error) {
        message.error(getApiErrorMessage(
          error,
          l('图片设置保存失败，暂未开始生成', 'Image settings could not be saved, so generation was not started'),
        ))
        return
      }
      if (!imageOptionsMountedRef.current) return
      try {
        if (activeLookId !== 'main' && activeLookBackendId === null) {
          await submitLookGeneration(generationInput)
        } else {
          await onGenerate(generationInput)
        }
      } catch (error) {
        if (activeLookId !== 'main' && activeLookBackendId === null) {
          const errorMessage = getApiErrorMessage(
            error,
            l('造型生成任务提交失败', 'Failed to submit the look generation task'),
          )
          if (imageOptionsMountedRef.current) message.error(errorMessage)
        }
        // 普通图片生成的错误由父级记录并展示。
      }
    } finally {
      generationSubmitPendingRef.current = false
      if (imageOptionsMountedRef.current) setGenerationSubmitPending(false)
    }
  }

  const uploadReferenceFiles = async (files: File[]) => {
    if (
      !files.length
      || referenceUploadPendingRef.current
      || referenceImagesLoading
    ) return

    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length !== files.length) message.warning(l('仅支持上传图片文件', 'Only image files are supported'))
    const available = Math.max(0, maxReferenceImages - referenceCount)
    const selectedFiles = imageFiles.slice(0, available)
    if (imageFiles.length > available) {
      message.warning(l(
        `最多上传 ${maxReferenceImages} 张参考图`,
        `You can upload up to ${maxReferenceImages} reference images`,
      ))
    }
    if (!selectedFiles.length) return
    if (!onReferenceImagesUpload) {
      message.warning(l(
        '请先保存资产，再上传参考图',
        'Save the asset before uploading reference images',
      ))
      return
    }

    referenceUploadPendingRef.current = true
    setReferenceUploadPending(true)
    try {
      await onReferenceImagesUpload(selectedFiles)
      if (imageOptionsMountedRef.current) {
        message.success(l(
          selectedFiles.length > 1
            ? `已上传 ${selectedFiles.length} 张参考图`
            : '参考图上传成功',
          selectedFiles.length > 1
            ? `${selectedFiles.length} reference images uploaded`
            : 'Reference image uploaded',
        ))
      }
    } catch (error) {
      if (imageOptionsMountedRef.current) {
        message.error(getApiErrorMessage(
          error,
          l('参考图上传失败，请重试', 'Failed to upload reference images; try again'),
        ))
      }
    } finally {
      referenceUploadPendingRef.current = false
      if (imageOptionsMountedRef.current) setReferenceUploadPending(false)
    }
  }

  const uploadReferenceImageIds = async (fileIds: string[]) => {
    if (
      !fileIds.length
      || referenceUploadPendingRef.current
      || referenceImagesLoading
    ) return

    const uniqueFileIds = [...new Set(fileIds.map((fileId) => fileId.trim()).filter(Boolean))]
    const available = Math.max(0, maxReferenceImages - referenceCount)
    const selectedFileIds = uniqueFileIds.slice(0, available)
    if (uniqueFileIds.length > available) {
      message.warning(l(
        `最多上传 ${maxReferenceImages} 张参考图`,
        `You can upload up to ${maxReferenceImages} reference images`,
      ))
    }
    if (!selectedFileIds.length) return
    if (!onReferenceImageIdsUpload) {
      message.warning(l(
        '请先保存资产，再添加参考图',
        'Save the asset before adding reference images',
      ))
      return
    }

    referenceUploadPendingRef.current = true
    setReferenceUploadPending(true)
    try {
      await onReferenceImageIdsUpload(selectedFileIds)
      if (imageOptionsMountedRef.current) {
        message.success(l(
          selectedFileIds.length > 1
            ? `已添加 ${selectedFileIds.length} 张参考图`
            : '参考图添加成功',
          selectedFileIds.length > 1
            ? `${selectedFileIds.length} reference images added`
            : 'Reference image added',
        ))
      }
    } catch (error) {
      if (imageOptionsMountedRef.current) {
        message.error(getApiErrorMessage(
          error,
          l('参考图添加失败，请重试', 'Failed to add reference images; try again'),
        ))
      }
    } finally {
      referenceUploadPendingRef.current = false
      if (imageOptionsMountedRef.current) setReferenceUploadPending(false)
    }
  }

  const handleReferenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    await uploadReferenceFiles(files)
  }

  const addReferenceFromHistory = async (
    item: ResolvedAssetImageHistoryItem | undefined,
    emptyMessage: string,
  ) => {
    setReferenceMenuOpen(null)
    if (!item) {
      message.warning(emptyMessage)
      return
    }
    if (!item.fileId) {
      message.warning(l(
        '当前历史图缺少文件 ID，请刷新后重试',
        'This history image has no file ID; refresh and try again',
      ))
      return
    }
    await uploadReferenceImageIds([item.fileId])
  }

  const renderReferenceAddButton = (
    placement: 'panel' | 'description',
    className: string,
    dragAware = false,
  ) => {
    const menuOpen = referenceMenuOpen === placement
    const wrapClassName = [
      'asset-generation-workspace__reference-add-wrap',
      menuOpen ? 'is-open' : '',
      dragAware && referenceDragOver ? 'is-dropzone' : '',
    ].filter(Boolean).join(' ')
    const menu = (
      <div className="asset-generation-workspace__reference-add-menu" role="menu">
        <button
          type="button"
          role="menuitem"
          disabled={!currentAssetReferenceItem}
          onClick={() => addReferenceFromHistory(
            currentAssetReferenceItem,
            l('当前没有可添加的资产图', 'No asset image to add'),
          )}
        >
          {l('资产添加', 'Add asset')}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!selectedPastHistoryItem}
          onClick={() => addReferenceFromHistory(
            selectedPastHistoryItem,
            l('暂无可添加的历史图', 'No history image to add'),
          )}
        >
          {l('从历史记录添加', 'Add from history')}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setReferenceMenuOpen(null)
            referenceInputRef.current?.click()
          }}
        >
          {l('本地添加', 'Add local')}
        </button>
      </div>
    )
    return (
      <div className={wrapClassName}>
        <Popover
          open={menuOpen}
          trigger={[]}
          placement="bottomLeft"
          arrow={false}
          content={menu}
          rootClassName="asset-generation-workspace__reference-add-popover"
          onOpenChange={(open) => setReferenceMenuOpen(open ? placement : null)}
        >
          <button
            type="button"
            className={className}
            aria-label={referenceUploadPending
              ? l('正在上传参考图', 'Uploading reference images')
              : l('添加参考图', 'Add reference image')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={referenceImagesErrorMessage
              || (!onReferenceImagesUpload && !onReferenceImageIdsUpload
                ? l('请先保存资产', 'Save the asset first')
                : undefined)}
            disabled={generationLocked || (!onReferenceImagesUpload && !onReferenceImageIdsUpload)}
            onClick={(event) => {
              if (generationLocked || (!onReferenceImagesUpload && !onReferenceImageIdsUpload)) return
              event.stopPropagation()
              setReferenceMenuOpen((open) => (open === placement ? null : placement))
            }}
          >
            {referenceUploadPending ? <Spin size="small" /> : <PlusOutlined />}
            {dragAware && referenceDragOver && (
              <span>
                {referenceUploadPending
                  ? l('正在上传参考图', 'Uploading reference images')
                  : l('拖拽至此处作为参考图', 'Drop here to use as reference')}
              </span>
            )}
          </button>
        </Popover>
      </div>
    )
  }

  const handleHistoryDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    item: ResolvedAssetImageHistoryItem,
  ) => {
    historyDragItemRef.current = item
    if (referenceDropAllowed) setReferenceDragOver(true)
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-jellyfish-history-image', item.id)
  }

  const resolveDraggedHistoryItem = (event: React.DragEvent<HTMLElement>) => {
    const itemId = event.dataTransfer.getData('application/x-jellyfish-history-image')
    return historyDragItemRef.current
      ?? resolvedImageHistoryItems.find((item) => item.id === itemId)
      ?? null
  }

  const handleReferenceDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!referenceDropAllowed) return
    const hasFiles = Array.from(event.dataTransfer.types).includes('Files')
    const hasHistoryImage = Boolean(
      historyDragItemRef.current
      || event.dataTransfer.types.includes('application/x-jellyfish-history-image'),
    )
    if (!hasFiles && !hasHistoryImage) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setReferenceDragOver(true)
  }

  const handleReferenceDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    setReferenceDragOver(false)
    if (!referenceDropAllowed) return
    event.preventDefault()
    const droppedFiles = Array.from(event.dataTransfer.files ?? [])
    if (droppedFiles.length) {
      await uploadReferenceFiles(droppedFiles)
      return
    }
    const historyItem = resolveDraggedHistoryItem(event)
    if (!historyItem) return
    if (!historyItem.fileId) {
      if (imageOptionsMountedRef.current) {
        message.warning(l(
          '当前历史图缺少文件 ID，请刷新后重试',
          'This history image has no file ID; refresh and try again',
        ))
      }
      historyDragItemRef.current = null
      return
    }
    try {
      await uploadReferenceImageIds([historyItem.fileId])
    } finally {
      historyDragItemRef.current = null
    }
  }

  const selectLook = (lookId: string) => {
    if (lookId === activeLookId) return
    const nextLook = looks.find((look) => look.id === lookId)
    if (!nextLook) return

    setLooks((current) => captureLookEditorOptions(current, activeLookId, {
      prompt, aspectRatio: selectedRatio, visualStyleId: selectedVisualStyleId,
    }))
    setActiveLookId(nextLook.id)
    imageOptionsTouchedRef.current = Boolean(nextLook.editorOptionsTouched)
    applyLookDraftToEditor(nextLook)
    onActiveLookChange?.(nextLook.backendId ?? null)
    setImageViewerOpen(false)
  }

  const renameActiveLook = async () => {
    const selectedLook = looks.find((look) => look.id === activeLookId)
    if (!selectedLook || selectedLook.id === 'main' || lookRenamePendingId) return
    const lookId = Number(selectedLook.backendId)
    const savedName = savedLookNamesRef.current.get(selectedLook.id) ?? selectedLook.name
    const nextName = selectedLook.name.trim()
    if (!nextName) {
      setLooks((current) => current.map((look) => (
        look.id === activeLookId ? { ...look, name: savedName } : look
      )))
      message.warning(l('造型名称不能为空', 'Look name cannot be empty'))
      return
    }
    if (!Number.isInteger(lookId) || lookId <= 0) return
    if (nextName === savedName) return

    setLookRenamePendingId(selectedLook.id)
    try {
      const request = StudioAssetGenerationApi.requestLookRename({
        lookId,
        name: nextName,
      })
      await request.promise
      savedLookNamesRef.current.set(selectedLook.id, nextName)
      setLooks((current) => current.map((look) => (
        look.id === activeLookId ? { ...look, name: nextName } : look
      )))
      message.success(l('造型名称已更新', 'Look name updated'))
    } catch (error) {
      setLooks((current) => current.map((look) => (
        look.id === activeLookId ? { ...look, name: savedName } : look
      )))
      message.error(getApiErrorMessage(
        error,
        l('造型重命名失败，请重试', 'Failed to rename the look; try again'),
      ))
    } finally {
      if (imageOptionsMountedRef.current) setLookRenamePendingId(undefined)
    }
  }

  const applyLookInEpisode = async (selectedLook: LookDraft) => {
    if (!selectedLook || selectedLook.status === 1 || lookEpisodeSelectionPending) return
    const numericAssetId = Number(assetId)
    const lookId = Number(selectedLook.backendId)
    const numericEpisodeId = Number(episodeId)
    if (!Number.isInteger(numericAssetId) || numericAssetId <= 0) {
      message.error(l('当前资产还没有后端资产 ID，无法出演本集', 'This asset does not have a backend asset ID yet'))
      return
    }
    if (!Number.isInteger(lookId) || lookId <= 0) {
      message.error(l('当前造型还没有后端造型 ID，无法出演本集', 'This look does not have a backend look ID yet'))
      return
    }
    if (!Number.isInteger(numericEpisodeId) || numericEpisodeId <= 0) {
      message.error(l('当前集 ID 不存在，无法出演本集', 'This episode ID is unavailable'))
      return
    }
    setLookEpisodeSelectionPending(true)
    try {
      const request = StudioAssetGenerationApi.requestLookEpisodeSelection({
        lookId,
        episodeId: numericEpisodeId,
        selected: true,
      })
      await request.promise
      if (!imageOptionsMountedRef.current) return
      const refreshRequest = StudioAssetGenerationApi.requestLooks(numericAssetId, episodeId)
      const nextLooks = (await refreshRequest.promise).map(createLookDraftFromRemote)
      if (!imageOptionsMountedRef.current) return
      if (nextLooks.length) {
        rememberSavedLookNames(nextLooks)
        setLooks(nextLooks)
        const refreshedActiveLook = nextLooks.find((look) => look.backendId === lookId)
          ?? nextLooks.find((look) => look.id === activeLookId)
          ?? nextLooks[0]
        setActiveLookId(refreshedActiveLook.id)
        applyLookDraftToEditor(refreshedActiveLook)
        onActiveLookChange?.(refreshedActiveLook.backendId ?? null)
      }
      setLookEpisodeConfirmId(undefined)
      message.success(l('已设为本集出演', 'Look selected for this episode'))
    } catch (error) {
      if (!imageOptionsMountedRef.current) return
      message.error(getApiErrorMessage(
        error,
        l('设置本集出演失败，请重试', 'Failed to select this look for the episode; try again'),
      ))
    } finally {
      if (imageOptionsMountedRef.current) setLookEpisodeSelectionPending(false)
    }
  }

  const openLookEpisodeConfirm = () => {
    const selectedLook = looks.find((look) => look.id === activeLookId)
    if (!selectedLook || selectedLook.status === 1 || lookEpisodeSelectionPending) return
    setLookEpisodeConfirmId(selectedLook.id)
  }

  const addLook = (imageUrl?: string) => {
    if (hasEmptyLook) return
    const lookNumber = looks.filter((look) => look.id !== 'main').length + 1
    const newLook: LookDraft = {
      id: `look-${Date.now()}-${lookNumber}`,
      name: l(`造型${lookNumber}`, `Look ${lookNumber}`),
      prompt: '',
      imageUrl,
    }

    setLooks((current) => [
      ...captureLookEditorOptions(current, activeLookId, {
        prompt, aspectRatio: selectedRatio, visualStyleId: selectedVisualStyleId,
      }),
      newLook,
    ])
    setActiveLookId(newLook.id)
    onActiveLookChange?.(newLook.backendId ?? null)
    setPrompt('')
    setRewriteDraft('')
    setPreviewImage(imageUrl)
    setImageViewerOpen(false)
  }

  const handleLocalLookImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || localLookUploadPending) return
    if (!file.type.startsWith('image/')) {
      message.error(l('请选择图片文件', 'Choose an image file'))
      return
    }
    const numericAssetId = Number(assetId)
    if (!Number.isInteger(numericAssetId) || numericAssetId <= 0) {
      message.error(l(
        '当前资产还没有后端资产 ID，无法导入造型',
        'This asset does not have a backend asset ID, so the look cannot be imported',
      ))
      return
    }
    const lookNumber = looks.filter((look) => look.id !== 'main').length + 1
    const lookName = l(`造型${lookNumber}`, `Look ${lookNumber}`)
    setLocalLookUploadPending(true)
    try {
      const request = StudioAssetGenerationApi.requestLookUpload({
        assetId: numericAssetId,
        name: lookName,
        file,
      })
      const uploadedLook = await request.promise
      if (!imageOptionsMountedRef.current) return
      if (uploadedLook) {
        const nextLook = createLookDraftFromRemote(uploadedLook)
        savedLookNamesRef.current.set(nextLook.id, nextLook.name)
        setLooks((current) => {
          const nextCurrent = captureLookEditorOptions(current, activeLookId, {
            prompt, aspectRatio: selectedRatio, visualStyleId: selectedVisualStyleId,
          })
          const existingIndex = nextCurrent.findIndex((look) => look.id === nextLook.id)
          if (existingIndex >= 0) {
            return nextCurrent.map((look, index) => (index === existingIndex ? nextLook : look))
          }
          return [...nextCurrent, nextLook]
        })
        setActiveLookId(nextLook.id)
        applyLookDraftToEditor(nextLook)
        onActiveLookChange?.(nextLook.backendId ?? null)
      } else {
        const refreshRequest = StudioAssetGenerationApi.requestLooks(numericAssetId, episodeId)
        const nextLooks = (await refreshRequest.promise).map(createLookDraftFromRemote)
        if (!imageOptionsMountedRef.current) return
        if (nextLooks.length) {
          rememberSavedLookNames(nextLooks)
          const nextLook = nextLooks[nextLooks.length - 1]
          setLooks(nextLooks)
          setActiveLookId(nextLook.id)
          applyLookDraftToEditor(nextLook)
          onActiveLookChange?.(nextLook.backendId ?? null)
        }
      }
      message.success(l('造型导入成功', 'Look imported'))
    } catch (error) {
      if (!imageOptionsMountedRef.current) return
      message.error(getApiErrorMessage(
        error,
        l('造型导入失败，请重试', 'Failed to import the look; try again'),
      ))
    } finally {
      if (imageOptionsMountedRef.current) setLocalLookUploadPending(false)
    }
  }

  return (
    <section className="asset-generation-workspace" role="dialog" aria-modal="true" aria-label={workspaceTitle}>
      <header className="asset-generation-workspace__header">
        <Button type="text" icon={<CloseOutlined />} aria-label={l('关闭', 'Close')} onClick={closeWorkspace} />
        <strong>{workspaceTitle}</strong>
      </header>

      <div className="asset-generation-workspace__body">
        <main className="asset-generation-workspace__stage">
          {previewImage && (
            <p className="asset-generation-workspace__ai-notice">
              {l('内容由AI生成，仅供参考', 'AI-generated content for reference only')}
            </p>
          )}
          <div className={`asset-generation-workspace__preview${previewImage ? ' has-image' : ''}`}>
            {previewImage ? (
              <>
                <button
                  type="button"
                  className="asset-generation-workspace__viewer-trigger"
                  aria-label={l('查看人物大图', 'View full-size character image')}
                  onClick={() => openImageViewer()}
                >
                  <img src={previewImage} alt={name || l(copy.nameZh, copy.nameEn)} decoding="async" />
                </button>
                <div className="asset-generation-workspace__preview-top-actions" aria-label={l('主图操作', 'Main image actions')}>
                  <button
                    type="button"
                    className="is-highlighted"
                    title={l('版权审查', 'Copyright review')}
                    onClick={(event) => {
                      event.stopPropagation()
                      notifyImageToolApiMissing(l('版权审查', 'Copyright review'))
                    }}
                  >
                    <SafetyCertificateOutlined />
                    <span>{l('版权审查', 'Copyright')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!selectedHistoryCanSetPrimary}
                    title={selectedHistoryCanSetPrimary
                      ? l('设为主图', 'Set as primary image')
                      : l('已设为主图', 'Already primary image')}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (selectedHistoryCanSetPrimary && selectedHistoryItem) {
                        void handleSetPrimaryImage(selectedHistoryItem)
                      }
                    }}
                  >
                    {selectedHistoryItem && primaryImagePendingId === selectedHistoryItem.id
                      ? <Spin size="small" />
                      : <FlagOutlined />}
                    <span>{selectedHistoryCanSetPrimary
                      ? l('设为主图', 'Set primary')
                      : l('已设为主图', 'Primary set')}</span>
                  </button>
                </div>
                <div className="asset-generation-workspace__preview-hover-actions" aria-label={l('图片操作', 'Image actions')}>
                  <button
                    type="button"
                    aria-label={l('查看大图', 'View full image')}
                    title={l('查看大图', 'View full image')}
                    onClick={(event) => {
                      event.stopPropagation()
                      openImageViewer()
                    }}
                  >
                    <EyeOutlined />
                  </button>
                  <button
                    type="button"
                    disabled={!normalizeMediaFileId(selectedHistoryItem?.fileId) || Boolean(downloadingFileId)}
                    aria-label={l('下载原图', 'Download original image')}
                    title={normalizeMediaFileId(selectedHistoryItem?.fileId)
                      ? l('下载原图', 'Download original image')
                      : l('文件尚未生成，无法下载', 'The file is not ready for download')}
                    onClick={(event) => {
                      event.stopPropagation()
                      void downloadPreviewImage()
                    }}
                  >
                    {downloadingFileId === normalizeMediaFileId(selectedHistoryItem?.fileId)
                      ? <Spin size="small" />
                      : <DownloadOutlined />}
                  </button>
                  <button
                    type="button"
                    disabled
                    aria-label={l('删除图片', 'Delete image')}
                    title={l('暂无删除接口', 'No delete API yet')}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DeleteOutlined />
                  </button>
                </div>
                {selectedHistoryItem?.isCurrent && (
                  <span className="asset-generation-workspace__main-badge">
                    {l('当前选中主图', 'Current main image')}
                  </span>
                )}
              </>
            ) : (
              <>
                <PictureOutlined />
                <span>{l('待生成', 'Ready to generate')}</span>
              </>
            )}
            {hasAssetGenerationProgress(previewGenerationState) && (
              <div className="asset-generation-workspace__generation-state">
                {lookGenerationState && lookTaskSnapshot.lookName && <strong>{lookTaskSnapshot.lookName}</strong>}
                <AssetGenerationProgress state={previewGenerationState} />
              </div>
            )}
          </div>
          <p className="asset-generation-workspace__description">
            {initialAsset?.description || l('暂无图像描述', 'No image description yet')}
          </p>
          <section className="asset-generation-workspace__history" aria-label={l('历史记录', 'History')}>
            <h2>{l('历史记录', 'History')} <small>History</small></h2>
            <div
              className="asset-generation-workspace__history-list"
              aria-busy={imageHistoryLoading}
              title={imageHistoryErrorMessage}
            >
              {resolvedImageHistoryItems.map((item, index) => {
                return (
                  <div
                    key={`${item.id}-${index}`}
                    className={`asset-generation-workspace__history-item${item.isSelected ? ' is-selected' : ''}`}
                    draggable
                    onDragStart={(event) => handleHistoryDragStart(event, item)}
                    onDragEnd={() => {
                      historyDragItemRef.current = null
                      setReferenceDragOver(false)
                    }}
                  >
                    <button
                      type="button"
                      className="has-image"
                      aria-label={item.isSelected
                        ? l('当前正在查看这张历史图片', 'Currently viewing this history image')
                        : l(`切换到第${index + 1}张历史图片`, `Switch to history image ${index + 1}`)}
                      title={[item.operationTypeName, item.createdAt].filter(Boolean).join(' · ') || undefined}
                      onClick={() => selectHistoryImage(item)}
                    >
                      <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                    </button>
                    {item.isAssetLibraryImport && (
                      <span
                        className="asset-generation-workspace__history-origin-badge"
                        title={item.operationTypeName ?? l('空间导入', 'Asset library import')}
                      >
                        {item.operationTypeName ?? l('空间导入', 'Library')}
                      </span>
                    )}
                  </div>
                )
              })}
              {imageHistoryLoading && (
                <span
                  className="asset-generation-workspace__history-loading"
                  role="status"
                  aria-label={l('正在加载历史图片', 'Loading image history')}
                >
                  <Spin size="small" />
                </span>
              )}
              {!imageHistoryLoading
                && resolvedImageHistoryItems.length === 0 && (
                  <button
                    type="button"
                    className="asset-generation-workspace__history-empty"
                    disabled
                    aria-label={l('暂无历史图片', 'No history image')}
                  >
                    <PictureOutlined />
                  </button>
                )}
            </div>
          </section>
        </main>

        <aside className="asset-generation-workspace__panel">
          <div className="asset-generation-workspace__form-scroll">
            <label className={`asset-generation-workspace__field${activeLookId !== 'main' ? ' has-look-name' : ''}`}>
              <span>{l(copy.nameZh, copy.nameEn)} <small>{copy.nameEn}</small></span>
              <div className="asset-generation-workspace__name-inputs">
                <Input
                  className={activeLookId !== 'main' ? 'asset-generation-workspace__character-name is-locked' : 'asset-generation-workspace__character-name'}
                  value={name}
                  maxLength={30}
                  disabled={activeLookId !== 'main' || generationLocked}
                  placeholder={l(`请输入${copy.nameZh}`, `Enter ${copy.nameEn.toLowerCase()} name`)}
                  onChange={(event) => setName(event.target.value)}
                />
                {activeLookId !== 'main' && (
                  <Input
                    value={activeLook?.name ?? ''}
                    maxLength={30}
                    disabled={generationLocked}
                    suffix={lookRenamePendingId === activeLookId ? <Spin size="small" /> : null}
                    aria-label={l('造型名称', 'Look name')}
                    placeholder={l('请输入造型名称', 'Enter look name')}
                    onChange={(event) => {
                      const value = event.target.value
                      setLooks((current) => current.map((look) => (
                        look.id === activeLookId ? { ...look, name: value } : look
                      )))
                    }}
                    onBlur={() => { void renameActiveLook() }}
                    onPressEnter={(event) => event.currentTarget.blur()}
                  />
                )}
              </div>
            </label>

            <div className="asset-generation-workspace__reference-heading">
              <strong>{l('参考图', 'Reference images')}</strong>
              <span>{referenceCount}/{maxReferenceImages}</span>
            </div>
            <div
              className={[
                'asset-generation-workspace__references',
                references.length === 0 ? 'is-empty' : '',
                referenceDragOver ? 'is-drag-over' : '',
              ].filter(Boolean).join(' ')}
              aria-busy={referenceImagesLoading || referenceUploadPending}
              onDragOver={handleReferenceDragOver}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget as Node | null
                if (nextTarget && event.currentTarget.contains(nextTarget)) return
                setReferenceDragOver(false)
              }}
              onDrop={handleReferenceDrop}
            >
              {references.map((reference) => (
                <div key={reference.id} className="asset-generation-workspace__reference">
                  <img
                    src={reference.url}
                    alt={reference.name}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ))}
              {referenceImagesLoading && (
                <span
                  className="asset-generation-workspace__reference-add asset-generation-workspace__reference-loading"
                  role="status"
                  aria-label={l('正在加载参考图', 'Loading reference images')}
                >
                  <Spin size="small" />
                </span>
              )}
              {!referenceImagesLoading
                && referenceCount < maxReferenceImages && (
                  renderReferenceAddButton(
                    'panel',
                    `asset-generation-workspace__reference-add${referenceDragOver ? ' asset-generation-workspace__reference-dropzone' : ''}`,
                    true,
                  )
                )}
            </div>

            <div className="asset-generation-workspace__prompt-section">
              <div className="asset-generation-workspace__prompt-heading">
                <strong>{l('提示词', 'Prompt')}</strong>
                <div className="asset-generation-workspace__prompt-heading-actions">
                  <button
                    type="button"
                    className="asset-generation-workspace__rewrite-trigger"
                    aria-label={l('提示词智能改写', 'Smart prompt rewrite')}
                    onClick={openPromptRewrite}
                  >
                    <span className="asset-generation-workspace__rewrite-trigger-label">
                      {l('提示词智能改写', 'Smart rewrite')}
                    </span>
                    <FileSyncOutlined />
                  </button>
                  <button
                    type="button"
                    aria-label={promptExpanded ? l('收起提示词编辑器', 'Collapse prompt editor') : l('展开提示词编辑器', 'Expand prompt editor')}
                    onClick={() => setPromptExpanded((expanded) => !expanded)}
                  >
                    {promptExpanded ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  </button>
                </div>
              </div>
              <div className="asset-generation-workspace__prompt-editor">
                <Input.TextArea
                  value={prompt}
                  maxLength={MAX_PROMPT_LENGTH}
                  disabled={generationLocked}
                  autoSize={false}
                  variant="borderless"
                  placeholder={l(copy.promptZh, copy.promptEn)}
                  onChange={(event) => handlePromptChange(event.target.value)}
                />
                <div className="asset-generation-workspace__prompt-options">
                  <StudioSelect
                    className="asset-generation-workspace__ratio-select"
                    value={selectedRatio}
                    disabled={generationLocked}
                    aria-label={l('图片比例', 'Image ratio')}
                    options={supportedRatioOptions.map((value) => ({ value, label: <StudioRatioOption value={value} /> }))}
                    onChange={handleRatioChange}
                    popupClassName="asset-generation-workspace__ratio-popup"
                    getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
                  />
                  <StudioSelect
                    value={selectedStyle}
                    disabled={generationLocked}
                    aria-label={l('画面风格', 'Visual style')}
                    placeholder={l('请选择画面风格', 'Select visual style')}
                    loading={visualStyleOptionsLoading}
                    status={visualStyleOptionsError ? 'error' : undefined}
                    optionLabelProp="trigger"
                    popupClassName="asset-generation-workspace__style-popup"
                    popupMatchSelectWidth={280}
                    options={styleOptions}
                    onChange={handleStyleChange}
                    getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
                  />
                  <small>{prompt.length}/{MAX_PROMPT_LENGTH}</small>
                </div>
              </div>
            </div>
          </div>

          <div
            className="asset-generation-workspace__look-rail"
            aria-busy={looksLoading}
            title={looksErrorMessage}
          >
            <strong>{l('全部造型', 'Looks')}</strong>
            <div ref={lookAddRef} className={`asset-generation-workspace__look-add-wrap${lookMenuOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="asset-generation-workspace__look-add"
                aria-label={hasEmptyLook
                  ? l('已有待生成造型', 'An empty look already exists')
                  : l('添加造型', 'Add look')}
                aria-haspopup="menu"
                aria-expanded={lookMenuOpen}
                disabled={hasEmptyLook || generationLocked}
                onClick={() => setLookMenuOpen((open) => !open)}
              >
                <PlusOutlined />
                <span>{l('添加造型', 'Add')}</span>
              </button>
              {lookMenuOpen && (
                <div className="asset-generation-workspace__look-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLookMenuOpen(false)
                      addLook()
                    }}
                  >
                    {l('模型生成', 'Generate')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLookMenuOpen(false)
                      localLookInputRef.current?.click()
                    }}
                  >
                    {l('本地导入', 'Import')}
                  </button>
                </div>
              )}
            </div>
            {looksLoading && (
              <span
                className="asset-generation-workspace__look-loading"
                role="status"
                aria-label={l('正在加载造型', 'Loading looks')}
              >
                <Spin size="small" />
              </span>
            )}
            {looks.map((look) => {
              const imageUrl = look.id === activeLookId ? previewImage : look.imageUrl
              const lookName = look.id === 'main' ? (name || look.name) : look.name
              const lookInEpisode = look.status === 1
              const showEpisodeAction = look.id === activeLookId
                && look.status === 0
                && !lookInEpisode
              return (
                <Fragment key={look.id}>
                  <button
                    type="button"
                    className={`asset-generation-workspace__look-main${imageUrl ? ' has-image' : ''}${look.id === activeLookId ? ' is-selected' : ''}`}
                    aria-pressed={look.id === activeLookId}
                    disabled={generationLocked}
                    onClick={() => selectLook(look.id)}
                  >
                    <span className="asset-generation-workspace__look-preview">
                      {imageUrl ? <img src={imageUrl} alt="" loading="lazy" decoding="async" /> : <PictureOutlined />}
                      {hasAssetGenerationProgress(getGenerationStateForLook(look)) && (
                        <span className="asset-generation-workspace__look-progress">
                          <AssetGenerationProgress state={getGenerationStateForLook(look)} compact />
                        </span>
                      )}
                    </span>
                    {lookInEpisode && (
                      <span className="asset-generation-workspace__look-status">
                        {l('本集出演中', 'In episode')}
                      </span>
                    )}
                    <span className="asset-generation-workspace__look-meta">
                      <span className="asset-generation-workspace__look-name" title={lookName}>
                        {lookName}
                      </span>
                    </span>
                  </button>
                  {showEpisodeAction && (
                    <button
                      type="button"
                      className="asset-generation-workspace__look-episode-action"
                      disabled={generationLocked}
                      title={l('出演本集', 'Use in episode')}
                      onClick={openLookEpisodeConfirm}
                    >
                      {lookEpisodeSelectionPending ? <Spin size="small" /> : l('出演本集', 'Use in episode')}
                    </button>
                  )}
                </Fragment>
              )
            })}
            {showPendingLookProgress && (
              <button type="button" className="asset-generation-workspace__look-main" disabled>
                <span className="asset-generation-workspace__look-preview">
                  <span className="asset-generation-workspace__look-progress">
                    <AssetGenerationProgress state={lookGenerationState} compact />
                  </span>
                </span>
                <span className="asset-generation-workspace__look-meta">
                  <span className="asset-generation-workspace__look-name" title={lookTaskSnapshot.lookName}>
                    {lookTaskSnapshot.lookName || l('新造型', 'New look')}
                  </span>
                </span>
              </button>
            )}
          </div>

          <footer className="asset-generation-workspace__footer">
            {(generationUnavailableReason || displayGenerationState?.errorMessage) && (
              <div className={`asset-generation-workspace__generation-message${displayGenerationState?.errorMessage ? ' is-error' : ''}`}>
                <span>{displayGenerationState?.errorMessage ?? generationUnavailableReason}</span>
                {(displayGenerationState?.phase === 'poll-failed' || displayGenerationState?.phase === 'refresh-failed')
                  && retryGenerationResult && (
                  <span className="asset-generation-workspace__generation-message-actions">
                    <Button size="small" onClick={retryGenerationResult}>
                      {displayGenerationState?.phase === 'poll-failed'
                        ? l('继续查询任务', 'Resume task query')
                        : l('重新加载结果', 'Reload result')}
                    </Button>
                    {!lookGenerationState && onGenerationTrackingDiscard && (
                      <Button size="small" danger onClick={onGenerationTrackingDiscard}>
                        {l('放弃跟踪', 'Stop tracking')}
                      </Button>
                    )}
                  </span>
                )}
              </div>
            )}
            <StudioSelect
              value={model || undefined}
              aria-label={l('图片生成模型', 'Image generation model')}
              placeholder={l('请选择模型', 'Select a model')}
              loading={modelOptionsLoading}
              status={modelOptionsError ? 'error' : undefined}
              disabled={generationLocked}
              options={modelOptions}
              onChange={onModelChange}
              onDropdownVisibleChange={(open) => {
                if (open && modelOptionsError) onModelOptionsRetry?.()
              }}
              getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
            />
            <StudioSelect
              value={resolution || undefined}
              aria-label={l('图片分辨率', 'Image resolution')}
              placeholder={l('分辨率', 'Resolution')}
              disabled={generationLocked || !model || resolutionOptions.length === 0}
              options={resolutionOptions}
              onChange={onResolutionChange}
              getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
            />
            <Button
              type="primary"
              disabled={!canGenerate}
              onClick={() => void submitGeneration()}
            >
              {generationButtonLabel} <span><StarFilled /> {generationCreditCostText}</span>
            </Button>
          </footer>
          </aside>
      </div>

      {promptExpanded && (
        <div className="asset-generation-workspace__description-layer">
          <section
            className="asset-generation-workspace__description-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={l('描述', 'Description')}
          >
            <header className="asset-generation-workspace__description-header">
              <strong>{l('描述', 'Description')}</strong>
              <div>
                <button
                  type="button"
                  aria-label={l('退出全屏', 'Exit fullscreen')}
                  onClick={() => setPromptExpanded(false)}
                >
                  <FullscreenExitOutlined />
                </button>
                <button
                  type="button"
                  aria-label={l('关闭', 'Close')}
                  onClick={() => setPromptExpanded(false)}
                >
                  <CloseOutlined />
                </button>
              </div>
            </header>

            <div className="asset-generation-workspace__description-body">
              <div className="asset-generation-workspace__description-reference-heading">
                <strong>{l('参考图', 'Reference images')}</strong>
                <span>{referenceCount}/{maxReferenceImages}</span>
              </div>
              <div className="asset-generation-workspace__description-references">
                {previewImage && (
                  <button type="button" className="is-selected" onClick={() => openImageViewer()}>
                    <img src={previewImage} alt={name || l(copy.nameZh, copy.nameEn)} decoding="async" />
                    <span>{name || l(copy.lookZh, copy.lookEn)}</span>
                  </button>
                )}
                {references.map((reference) => (
                  <div key={reference.id}>
                    <img
                      src={reference.url}
                      alt={reference.name}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ))}
                {referenceImagesLoading && (
                  <span
                    className="asset-generation-workspace__description-reference-add asset-generation-workspace__description-reference-loading"
                    role="status"
                    aria-label={l('正在加载参考图', 'Loading reference images')}
                  >
                    <Spin size="small" />
                  </span>
                )}
                {!referenceImagesLoading
                  && referenceCount < maxReferenceImages && (
                    renderReferenceAddButton(
                      'description',
                      'asset-generation-workspace__description-reference-add',
                    )
                )}
              </div>

              <div className="asset-generation-workspace__description-prompt-heading">
                <strong>{l('提示词', 'Prompt')}</strong>
              </div>
              <div className="asset-generation-workspace__description-editor">
                <Input.TextArea
                  value={prompt}
                  maxLength={MAX_PROMPT_LENGTH}
                  disabled={generationLocked}
                  autoSize={false}
                  variant="borderless"
                  placeholder={l(copy.promptZh, copy.promptEn)}
                  onChange={(event) => handlePromptChange(event.target.value)}
                />
                <div className="asset-generation-workspace__description-options">
                  <StudioSelect
                    className="asset-generation-workspace__ratio-select"
                    value={selectedRatio}
                    disabled={generationLocked}
                    aria-label={l('图片比例', 'Image ratio')}
                    options={supportedRatioOptions.map((value) => ({ value, label: <StudioRatioOption value={value} /> }))}
                    onChange={handleRatioChange}
                    popupClassName="asset-generation-workspace__ratio-popup"
                    getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
                  />
                  <StudioSelect
                    className="asset-generation-workspace__description-style-select"
                    value={selectedStyle}
                    disabled={generationLocked}
                    aria-label={l('画面风格', 'Visual style')}
                    placeholder={l('请选择画面风格', 'Select visual style')}
                    loading={visualStyleOptionsLoading}
                    status={visualStyleOptionsError ? 'error' : undefined}
                    optionLabelProp="trigger"
                    popupClassName="asset-generation-workspace__style-popup"
                    popupMatchSelectWidth={280}
                    options={styleOptions}
                    onChange={handleStyleChange}
                    getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
                  />
                  <small>{prompt.length}/{MAX_PROMPT_LENGTH}</small>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {rewriteOpen && (
        <div className="asset-generation-workspace__rewrite-layer">
          <button
            type="button"
            className="asset-generation-workspace__rewrite-backdrop"
            aria-label={l('关闭提示词智能改写', 'Close smart prompt rewrite')}
            onClick={() => setRewriteOpen(false)}
          />
          <aside className="asset-generation-workspace__rewrite-panel" role="dialog" aria-modal="true" aria-label={l('提示词智能改写', 'Smart prompt rewrite')}>
            <header>
              <strong>{l('提示词智能改写', 'Smart prompt rewrite')}</strong>
              <button type="button" aria-label={l('关闭', 'Close')} onClick={() => setRewriteOpen(false)}>
                <CloseOutlined />
              </button>
            </header>
            <div className="asset-generation-workspace__rewrite-content">
              <div className="asset-generation-workspace__rewrite-section-heading">
                <strong>{l('改写结果', 'Rewrite result')}</strong>
                <span>{rewriteDraft.length}/{MAX_PROMPT_LENGTH}</span>
              </div>
              <div className="asset-generation-workspace__rewrite-editor">
                <Input.TextArea
                  value={rewriteDraft}
                  maxLength={MAX_PROMPT_LENGTH}
                  autoSize={false}
                  variant="borderless"
                  aria-label={l('改写后的提示词', 'Rewritten prompt')}
                  onChange={(event) => setRewriteDraft(event.target.value)}
                />
              </div>
              <div className="asset-generation-workspace__rewrite-actions">
                <Button disabled>{l('当前使用中', 'In use')}</Button>
                <Button><FileSyncOutlined />{l('重新生成', 'Regenerate')}</Button>
              </div>
            </div>
            <div className="asset-generation-workspace__rewrite-composer">
              <div className="asset-generation-workspace__rewrite-section-heading">
                <strong>{l('修改要求', 'Revision request')}</strong>
                <span>{rewriteInstruction.length}/300</span>
              </div>
              <div className="asset-generation-workspace__rewrite-request-editor">
                <Input.TextArea
                  value={rewriteInstruction}
                  maxLength={300}
                  autoSize={false}
                  variant="borderless"
                  placeholder={l('输入本次改写要求', 'Enter revision instructions')}
                  onChange={(event) => setRewriteInstruction(event.target.value)}
                />
                <Button type="primary">
                  {rewriteInstruction.trim() ? l('按要求改写', 'Rewrite') : l('随机生成', 'Generate')}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {lookEpisodeConfirmTarget && (
        <div className="asset-generation-workspace__episode-confirm" role="presentation">
          <div
            className="asset-generation-workspace__episode-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-generation-workspace-episode-confirm-title"
          >
            <div className="asset-generation-workspace__episode-confirm-images" aria-hidden="true">
              {episodeLook?.imageUrl && (
                <img
                  src={episodeLook.imageUrl}
                  alt=""
                  className="asset-generation-workspace__episode-confirm-thumb"
                  decoding="async"
                />
              )}
              {episodeLook?.imageUrl && lookEpisodeConfirmTarget.imageUrl && (
                <span className="asset-generation-workspace__episode-confirm-swap">
                  <SwapOutlined />
                </span>
              )}
              {lookEpisodeConfirmTarget.imageUrl && (
                <img
                  src={lookEpisodeConfirmTarget.imageUrl}
                  alt=""
                  className="asset-generation-workspace__episode-confirm-thumb"
                  decoding="async"
                />
              )}
            </div>
            <strong id="asset-generation-workspace-episode-confirm-title">
              {l('确定更换出镜造型？', 'Switch the episode look?')}
            </strong>
            <p>
              {l(
                `${name || copy.nameZh}在当前集已由「${episodeLook?.name ?? '当前造型'}」出演，确定要换成「${lookEpisodeConfirmTarget.name}」？`,
                `${name || copy.nameEn} is currently using “${episodeLook?.name ?? 'the current look'}” in this episode. Switch to “${lookEpisodeConfirmTarget.name}”?`,
              )}
            </p>
            <div className="asset-generation-workspace__episode-confirm-actions">
              <Button
                disabled={lookEpisodeSelectionPending}
                onClick={() => setLookEpisodeConfirmId(undefined)}
              >
                {l('取消', 'Cancel')}
              </Button>
              <Button
                type="primary"
                loading={lookEpisodeSelectionPending}
                onClick={() => { void applyLookInEpisode(lookEpisodeConfirmTarget) }}
              >
                {l('更换出镜造型', 'Switch look')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ImageViewer
        open={imageViewerOpen}
        imageUrl={viewerImageUrl ?? previewImage}
        alt={name || l(copy.nameZh, copy.nameEn)}
        onClose={() => {
          setImageViewerOpen(false)
          setViewerImageUrl(undefined)
        }}
      />

      <input
        ref={referenceInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        disabled={referenceImagesLoading || referenceUploadPending || !onReferenceImagesUpload}
        onChange={handleReferenceUpload}
      />
      <input
        ref={localLookInputRef}
        type="file"
        accept="image/*"
        hidden
        disabled={localLookUploadPending}
        onChange={handleLocalLookImport}
      />
    </section>
  )
}
