import { useEffect, useMemo, useRef, useState } from 'react'
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
  ThunderboltFilled,
  UploadOutlined,
} from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { StudioEntitiesApi } from '../../../services/studioEntities'
import { StudioScriptsApi } from '../../../services/studioScripts'
import type {
  StudioScriptAssetListRequest,
  StudioScriptAssetListResult,
  StudioScriptAssetType,
  StudioScriptImportId,
} from '../../../services/studioScripts'
import AssetGenerationWorkspace from './AssetGenerationWorkspace'
import ImageViewer from './ImageViewer'
import VoiceLibraryModal from './VoiceLibraryModal'
import StudioSelect from './StudioSelect'
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
type AssetOverrideField = 'name' | 'prompt' | 'imageUrl'

type AssetDraft = {
  id: string
  kind: AssetKind
  name: string
  episodeIds: string[]
  imageUrl?: string
  prompt?: string
  source?: 'fallback' | 'manual' | 'remote'
  assetCode?: string
  aliases?: string[]
  description?: string
  status?: number
  coverFileId?: StudioScriptImportId
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

type AssetsStepDraft = {
  sourceSignature: string
  kind: AssetKind
  assets: AssetDraft[]
  model: string
  resolution: string
  completedEpisodeIds: string[]
  hiddenRemoteAssetIds?: string[]
}

type ProjectAssetsStepProps = {
  scriptImportId: StudioScriptImportId | null
  episodes: AssetEpisodeSource[]
  ratio?: string
  styleName?: string
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
    const relatedEpisodeIds = new Set((item.appearedEpisodes ?? [])
      .map((episodeIndex) => episodeIdByIndex.get(episodeIndex))
      .filter((episodeId): episodeId is string => Boolean(episodeId)))
    if (queryEpisodeId) relatedEpisodeIds.add(queryEpisodeId)
    return {
      id: `remote:${scriptImportId}:${assetType}:${item.id}`,
      kind: ASSET_KIND_BY_TYPE[assetType],
      name: item.name,
      episodeIds: [...relatedEpisodeIds],
      imageUrl: item.coverUrl?.trim() || undefined,
      prompt: item.createPrompt?.trim() || undefined,
      source: 'remote',
      assetCode: item.assetCode?.trim() || undefined,
      aliases: item.aliases ?? undefined,
      description: item.description?.trim() || undefined,
      status: item.status ?? undefined,
      coverFileId: item.coverFileId ?? undefined,
    }
  })
}

const GENERATION_UNIT_COST = 6
const isAssetKind = (value: unknown): value is AssetKind => (
  value === 'role' || value === 'scene' || value === 'prop'
)

const sameStringList = (left?: string[] | null, right?: string[] | null) => {
  const normalizedLeft = left ?? []
  const normalizedRight = right ?? []
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index])
}

/** 轮询结果未变化时复用旧引用，避免三条轮询反复重绘完整资产列表。 */
const sameRemoteAssetList = (left: AssetDraft[] | undefined, right: AssetDraft[]) => {
  if (!left || left.length !== right.length) return false
  return left.every((asset, index) => {
    const nextAsset = right[index]
    return asset.id === nextAsset.id
      && asset.kind === nextAsset.kind
      && asset.name === nextAsset.name
      && asset.imageUrl === nextAsset.imageUrl
      && asset.prompt === nextAsset.prompt
      && asset.assetCode === nextAsset.assetCode
      && asset.description === nextAsset.description
      && asset.status === nextAsset.status
      && asset.coverFileId === nextAsset.coverFileId
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
  const [personalImportOpen, setPersonalImportOpen] = useState(false)
  const [personalImportTargetId, setPersonalImportTargetId] = useState<string>()
  const [personalImportTargetSnapshot, setPersonalImportTargetSnapshot] = useState<AssetDraft>()
  const [personalAssets, setPersonalAssets] = useState<PersonalAsset[]>([])
  const [personalAssetId, setPersonalAssetId] = useState('')
  const [personalAssetsLoading, setPersonalAssetsLoading] = useState(false)
  const [personalAssetFilters, setPersonalAssetFilters] = useState(EMPTY_PERSONAL_FILTERS)
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false)
  const [model, setModel] = useState(canRestoreDraft ? restoredDraft.model : 'gpt-image-2')
  const [resolution, setResolution] = useState(canRestoreDraft ? restoredDraft.resolution : '4k')
  const [completedEpisodeIds, setCompletedEpisodeIds] = useState<Set<string>>(() => new Set(
    canRestoreDraft && Array.isArray(restoredDraft.completedEpisodeIds)
      ? restoredDraft.completedEpisodeIds
      : [],
  ))
  const sourceSignatureRef = useRef(sourceSignature)
  const assetPollingGenerationRef = useRef(0)
  const draftPersistenceEnabledRef = useRef(false)
  const completedEpisodeIdList = useMemo(() => [...completedEpisodeIds], [completedEpisodeIds])
  const hiddenRemoteAssetIdList = useMemo(() => [...hiddenRemoteAssetIds], [hiddenRemoteAssetIds])
  const assetDraft = useMemo<AssetsStepDraft>(() => ({
    sourceSignature,
    kind,
    assets,
    model,
    resolution,
    completedEpisodeIds: completedEpisodeIdList,
    hiddenRemoteAssetIds: hiddenRemoteAssetIdList,
  }), [
    assets,
    completedEpisodeIdList,
    hiddenRemoteAssetIdList,
    kind,
    model,
    resolution,
    sourceSignature,
  ])
  const latestAssetDraftRef = useRef(assetDraft)
  latestAssetDraftRef.current = assetDraft

  const flushAssetDraft = useProjectCreationDraft(
    draftKey,
    assetDraft,
    350,
    draftPersistenceEnabledRef,
  )

  useEffect(() => {
    let active = true
    draftPersistenceEnabledRef.current = false
    const hydrationBaseline = latestAssetDraftRef.current
    const compactDraft = readProjectCreationDraft<AssetsStepDraft>(draftKey)
    void readFullProjectCreationDraft<AssetsStepDraft>(draftKey)
      .then((fullDraft) => {
        if (!active) return
        const compactCanRestore = compactDraft?.sourceSignature === sourceSignature
          && Array.isArray(compactDraft.assets)
        const fullCanRestore = fullDraft?.sourceSignature === sourceSignature
          && Array.isArray(fullDraft.assets)
        if (!compactCanRestore && !fullCanRestore) {
          return
        }

        if (compactCanRestore && fullCanRestore) {
          const fullAssetsById = new Map(fullDraft.assets.map((asset) => [asset.id, asset]))
          setAssets((current) => {
            let changed = false
            const hydrated = current.map((asset) => {
              if (asset.imageUrl) return asset
              const fullAsset = fullAssetsById.get(asset.id)
              if (!fullAsset?.imageUrl) return asset
              changed = true
              return { ...asset, imageUrl: fullAsset.imageUrl }
            })
            return changed ? hydrated : current
          })
          return
        }
        if (compactCanRestore) return
        if (latestAssetDraftRef.current !== hydrationBaseline) return

        const nextDraft = fullDraft as AssetsStepDraft
        setAssets(nextDraft.assets)
        if (isAssetKind(nextDraft.kind)) setKind(nextDraft.kind)
        if (typeof nextDraft.model === 'string' && nextDraft.model) setModel(nextDraft.model)
        if (typeof nextDraft.resolution === 'string' && nextDraft.resolution) setResolution(nextDraft.resolution)
        setCompletedEpisodeIds(new Set(
          Array.isArray(nextDraft.completedEpisodeIds) ? nextDraft.completedEpisodeIds : [],
        ))
        setHiddenRemoteAssetIds(new Set(
          Array.isArray(nextDraft.hiddenRemoteAssetIds) ? nextDraft.hiddenRemoteAssetIds : [],
        ))
      })
      .finally(() => {
        if (!active) return
        const changedWhileHydrating = latestAssetDraftRef.current !== hydrationBaseline
        draftPersistenceEnabledRef.current = true
        if (changedWhileHydrating) flushAssetDraft()
      })
    return () => { active = false }
  }, [draftKey, flushAssetDraft, sourceSignature])

  useEffect(() => {
    if (sourceSignatureRef.current === sourceSignature) return
    sourceSignatureRef.current = sourceSignature
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
          if (sameRemoteAssetList(currentScopeAssets[assetKind], nextAssets)) return current
          return {
            [pollingScopeId]: {
              ...currentScopeAssets,
              [assetKind]: nextAssets,
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
        patchLane(assetType, {
          loaded: true,
          loading: false,
          polling: result.polling,
          extractionStatus: result.extractionStatus,
          statusName: result.extractionStatusName?.trim() || '',
          errorMessage: terminalStatusError,
        })
        if (result.polling) {
          scheduleLane(assetType, 0, ASSET_POLL_INTERVAL_MS)
        }
      } catch (error) {
        if (!isActive()) return
        const nextFailureCount = failureCount + 1
        const status = getErrorStatus(error)
        const shouldStop = status === 401
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
  }, [assetPollingRetryToken, episodes, l, scope, scriptImportId, sourceSignature])

  useEffect(() => {
    if (scope === 'overview' || assetPollingState.scopeId !== scope) return
    const lanes = ASSET_TYPES.map((assetType) => assetPollingState.lanes[assetType])
    const completed = lanes.every((lane) => (
      lane.loaded
      && !lane.loading
      && !lane.polling
      && lane.extractionStatus === 3
      && !lane.errorMessage
    ))
    if (!completed) return
    setCompletedEpisodeIds((current) => {
      if (current.has(scope)) return current
      const next = new Set(current)
      next.add(scope)
      return next
    })
  }, [assetPollingState, scope])

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
        if (overrideFields.has('imageUrl')) mergedAsset.imageUrl = asset.imageUrl
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
  const visiblePersonalAssets = useMemo(() => personalAssets.filter((item) => (
    (personalAssetFilters.gender === 'all' || item.gender === personalAssetFilters.gender)
    && (personalAssetFilters.style === 'all' || item.style === personalAssetFilters.style)
    && (personalAssetFilters.age === 'all' || item.age === personalAssetFilters.age)
    && (personalAssetFilters.region === 'all' || item.region === personalAssetFilters.region)
  )), [personalAssetFilters, personalAssets])

  const currentEpisode = episodes.find((episode) => episode.id === scope)
  const generationAsset = scopedAssets.find((asset) => asset.id === generationAssetId)
    ?? (generationAssetSnapshot?.id === generationAssetId ? generationAssetSnapshot : undefined)
  const totalAssets = scopedAssets.length
  const generationCost = scopedAssets.length * GENERATION_UNIT_COST
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
      if (existingIndex < 0) return [...current, nextOverride]
      return current.map((item, index) => index === existingIndex ? nextOverride : item)
    })
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
    setImageTargetSnapshot(scopedAssets.find((asset) => asset.id === assetId))
    setImageTargetId(assetId)
    imageInputRef.current?.click()
  }

  const appendAsset = (asset: Pick<AssetDraft, 'name' | 'imageUrl' | 'prompt'>) => {
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
        source: 'manual',
      },
    ])
  }

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
    setPersonalImportTargetId(targetAssetId)
    setPersonalImportTargetSnapshot(targetAssetId
      ? scopedAssets.find((asset) => asset.id === targetAssetId)
      : undefined)
    setPersonalImportOpen(true)
    setPersonalAssetId('')
    setPersonalAssetFilters(EMPTY_PERSONAL_FILTERS)
    setPersonalAssets([])
    setPersonalAssetsLoading(true)
    try {
      const entityType = kind === 'role' ? 'character' : kind
      const response = await StudioEntitiesApi.list(entityType, { page: 1, pageSize: 100 })
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
      message.error(l('个人空间资产加载失败', 'Failed to load personal assets'))
    } finally {
      setPersonalAssetsLoading(false)
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
    setGenerationWorkspaceOpen(true)
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

  const downloadAssetImage = (asset: AssetDraft) => {
    if (!asset.imageUrl) {
      message.warning(l('当前资产还没有可下载的图片', 'This asset has no image to download'))
      return
    }
    const link = document.createElement('a')
    link.href = asset.imageUrl
    link.download = `${asset.name || KIND_LABELS[asset.kind].en}.png`
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const deleteAsset = (asset: AssetDraft) => {
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
    if (key === 'download') {
      downloadAssetImage(asset)
      return
    }
    if (key === 'delete') deleteAsset(asset)
  }

  const requestGeneration = (count: number, completedScope?: AssetScope) => {
    if (count === 0) {
      message.info(l('当前没有可生成的资产', 'There are no assets to generate'))
      return
    }
    if (completedScope === 'overview') {
      setCompletedEpisodeIds(new Set(episodes.map((episode) => episode.id)))
    } else if (completedScope) {
      setCompletedEpisodeIds((current) => {
        const next = new Set(current)
        next.add(completedScope)
        return next
      })
    }
    message.info(l('资产已确认，图片生成任务将在下一阶段统一提交', 'Assets confirmed. Image tasks will be submitted in the next stage.'))
  }

  const scopeTitle = scope === 'overview'
    ? l(`全剧总览：已智能提取出全剧资产共${totalAssets}个`, `Overview: ${totalAssets} assets extracted`)
    : l(`${currentEpisode?.title ?? '当前剧集'}已智能提取资产共${scopedAssets.length}个`, `${currentEpisode?.title ?? 'Current episode'}: ${scopedAssets.length} assets extracted`)
  const pollingLanes = assetPollingState.scopeId === scope
    ? ASSET_TYPES.map((assetType) => assetPollingState.lanes[assetType])
    : []
  const assetPollingActive = pollingLanes.some((lane) => lane.loading || lane.polling)
  const assetPollingErrorMessage = pollingLanes.find((lane) => (
    lane.errorMessage && !lane.loading && !lane.polling
  ))?.errorMessage ?? ''
  const assetPollingStatusNames = [...new Set(
    pollingLanes.map((lane) => lane.statusName).filter(Boolean),
  )].join(' / ')
  const selectedAssetPollingLane = assetPollingState.scopeId === scope
    ? assetPollingState.lanes[ASSET_TYPE_BY_KIND[kind]]
    : null
  const visibleAssetsLoading = scriptImportId !== null && (
    assetPollingState.scopeId !== scope
    || Boolean(selectedAssetPollingLane?.loading || selectedAssetPollingLane?.polling)
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
            {assetPollingErrorMessage && (
              <Button onClick={() => setAssetPollingRetryToken((current) => current + 1)}>
                {l('重试资产查询', 'Retry asset query')}
              </Button>
            )}
            <StudioSelect
              className="project-assets-step__model-select"
              value={model}
              aria-label={l('图片生成模型', 'Image generation model')}
              options={[{ value: 'gpt-image-2', label: 'GPT Image 2' }, { value: 'gpt-image-1', label: 'GPT Image 1' }]}
              onChange={setModel}
            />
            <StudioSelect
              className="project-assets-step__resolution-select"
              value={resolution}
              aria-label={l('图片分辨率', 'Image resolution')}
              options={[{ value: '2k', label: '2K' }, { value: '4k', label: '4K' }]}
              onChange={setResolution}
            />
            <Button
              type="primary"
              disabled={scopedAssets.length === 0}
              onClick={() => requestGeneration(scopedAssets.length, scope)}
            >
              <span>{scope === 'overview' ? l('一键生成全剧资产', 'Generate all assets') : l('一键生成本集资产', 'Generate episode assets')}</span>
              <span className="project-assets-step__generation-cost"><ThunderboltFilled />{generationCost}</span>
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
                onClick={() => setKind(item)}
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
            {visibleAssets.map((asset) => (
              <article
                key={asset.id}
                className={`project-assets-step__card${asset.imageUrl ? ' has-image' : ''}`}
                role="button"
                tabIndex={0}
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
                <div
                  className="project-assets-step__card-preview"
                  style={asset.imageUrl ? { backgroundImage: `url(${asset.imageUrl})` } : undefined}
                >
                  {!asset.imageUrl && (
                    <span className="project-assets-step__empty-mark" aria-hidden="true">✦</span>
                  )}
                  {asset.imageUrl && (
                    <span className="project-assets-step__looks-badge">{l('1个造型', '1 look')}</span>
                  )}
                  {!asset.imageUrl && (
                    <div className="project-assets-step__card-actions">
                      <Button icon={<UploadOutlined />} onClick={() => openImageImport(asset.id)}>
                        {l(`导入${KIND_LABELS[kind].zh}`, `Import ${KIND_LABELS[kind].en.toLowerCase()}`)}
                      </Button>
                      <Button type="primary" onClick={() => requestGeneration(1)}>
                        {l('生成', 'Generate')} <ThunderboltFilled /> {GENERATION_UNIT_COST}
                      </Button>
                    </div>
                  )}
                </div>
                <footer>
                  <strong title={asset.name}>{asset.name}</strong>
                  {kind === 'role' && (
                    <Button
                      type="text"
                      className="project-assets-step__voice-button"
                      icon={<AudioOutlined />}
                      onClick={() => setVoiceLibraryOpen(true)}
                    >
                      {l('配置音色', 'Voice')}
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
                        { key: 'download', label: l('下载', 'Download'), disabled: !asset.imageUrl },
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
                      aria-label={l('更多操作', 'More actions')}
                      icon={<MoreOutlined />}
                    />
                  </Dropdown>
                </footer>
              </article>
            ))}

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
                    <img src={localImportImage} alt={localImportFileName} />
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
                  {localImportImage ? <img src={localImportImage} alt="" /> : <PictureOutlined />}
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
                    {localImportImage ? <img src={localImportImage} alt="" /> : <PictureOutlined />}
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
          model={model}
          resolution={resolution}
          initialAsset={generationAsset ? {
            name: generationAsset.name,
            prompt: buildAssetPrompt(generationAsset, episodes),
            imageUrl: generationAsset.imageUrl,
            description: generationAsset.description || l(
              `${generationAsset.name}的${KIND_LABELS[generationAsset.kind].zh}设定，可结合右侧提示词继续调整并重新生成。`,
              `${generationAsset.name} ${KIND_LABELS[generationAsset.kind].en.toLowerCase()} design. Refine the prompt and regenerate as needed.`,
            ),
          } : undefined}
          onModelChange={setModel}
          onResolutionChange={setResolution}
          onClose={() => {
            setGenerationWorkspaceOpen(false)
            setGenerationAssetId(undefined)
            setGenerationAssetSnapshot(undefined)
          }}
          onGenerate={(assetName, assetPrompt) => {
            if (generationAssetId) {
              if (generationAsset) {
                saveAssetOverride(
                  { ...generationAsset, name: assetName, prompt: assetPrompt },
                  ['name', 'prompt'],
                )
              }
            } else {
              appendAsset({ name: assetName, prompt: assetPrompt })
            }
            requestGeneration(1)
            setGenerationWorkspaceOpen(false)
            setGenerationAssetId(undefined)
            setGenerationAssetSnapshot(undefined)
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
                  {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <PictureOutlined />}
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

      <VoiceLibraryModal open={voiceLibraryOpen} onCancel={() => setVoiceLibraryOpen(false)} />
    </main>
  )
}
