import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, message, Modal, Spin, theme, Tooltip } from 'antd'
import {
  ArrowRightOutlined,
  CloseOutlined,
  FileAddOutlined,
  StarFilled,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { getStoredAuthUser } from '../../../auth'
import { getApiErrorMessage } from '../../../services/apiErrors'
import { StudioScriptsApi } from '../../../services/studioScripts'
import {
  StudioAssetGenerationApi,
  type StudioAssetImageTaskRequest,
  type StudioEpisodeStoryboardEditorResult,
  type StudioEpisodeAssetsConfirmResult,
  type StudioEpisodeAssetsGenerateStatusResult,
} from '../../../services/studioAssetGeneration'
import type {
  StudioScriptAssetEpisode,
  StudioScriptAssetEpisodeListRequest,
  StudioScriptAssetExtractEstimate,
  StudioScriptImportId,
  StudioScriptImportListItem,
  StudioScriptParseChapter,
  StudioScriptParseResult,
} from '../../../services/studioScripts'
import { StudioStylesApi } from '../../../services/studioStyles'
import type { StudioStyleOption } from '../../../services/studioStyles'
import { useAppStore } from '../../../store/useAppStore'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { useStudioStyleOptions } from './useStudioStyleOptions'
import CustomStyleModal from './CustomStyleModal'
import type { CustomStyleDraft } from './CustomStyleModal'
import ProjectAssetsStep from './ProjectAssetsStep'
import ProjectClipEditingStep, { type ClipDraft } from './ProjectClipEditingStep'
import { resolveAssetUrl } from '../assets/utils'
import {
  PROJECT_CREATION_DRAFT_KEYS,
  clearProjectCreationDrafts,
  holdProjectCreationDraftWrites,
  readFullProjectCreationDraft,
  readProjectCreationDraft,
  useProjectCreationDraft,
} from './projectCreationDraft'
import {
  invalidateScriptImportChapters,
  loadScriptImportChapters,
  loadScriptImportDetail,
  primeScriptImportChapters,
  primeScriptImportDetail,
  readCachedScriptImportChapters,
  readCachedScriptImportDetail,
} from './scriptImportResumeCache'
import './ProjectCreatePage.css'

const MAX_NAME_LENGTH = 100
const MAX_SCRIPT_LENGTH = 200_000
const MAX_EPISODE_LENGTH = 50_000
const RECOMMENDED_SCRIPT_LENGTH = 50
const FALLBACK_RATIOS = ['9:16', '4:3', '16:9', '3:4', '1:1', '21:9']
const SCRIPT_IMPORT_ACCEPT = '.txt,.md,.doc,.docx'
const VISUAL_STYLE_NAMES_SESSION_KEY_PREFIX = 'jellyfish:studio:visual-style-names'
const STORYBOARD_RESTORE_POINT_STORAGE_KEY_PREFIX = 'jellyfish:project-creation:v2:storyboard-restore-point'
const STORYBOARD_RESTORE_POINT_TTL_MS = 24 * 60 * 60 * 1000
const STORYBOARD_POLL_INTERVAL_MS = 3000
type StyleCategoryKey = 'visual' | 'tone'
type StylePreview = 'empty' | 'online'
type EpisodeDraft = {
  id: string
  title: string
  rawText: string
}
type ProjectCreateDraft = {
  currentStep: number
  name: string
  script: string
  scriptLength?: number
  episodes: EpisodeDraft[]
  episodeCount?: number
  activeEpisodeIndex: number
  ratio: string
  styleCategory: StyleCategoryKey
  importedFileName: string
  importedFileType?: string
  aiModelId?: StudioScriptImportId | null
  scriptImportId: StudioScriptImportId | null
  storyboardEpisodeId?: string | null
  storyboardRunId?: string | number | null
  selectedStyleKeys: Partial<Record<StyleCategoryKey, string>>
  selectedStyleNames?: Partial<Record<StyleCategoryKey, string>>
  targetMarket: string
}
type ProjectCreateRouteState = {
  scriptImport?: StudioScriptImportListItem
  scriptImportDetail?: StudioScriptParseResult
  chapters?: StudioScriptParseChapter[]
}
type StoryboardRestorePointSnapshot = {
  scriptImportId: StudioScriptImportId
  episodeId: string
  runId: StudioScriptImportId
  updatedAt: number
}
type PendingChapterCreation = {
  scriptImportId: string
  editRevision: number
  previousEpisodeIds: string[]
  createdChapterIds: string[]
}
type DisplayedStyle = {
  key: string
  value: string
  label: string
  preview: StylePreview
  coverUrl?: string
  description?: string
  id?: StudioScriptImportId
  defaultOption?: boolean
}

const normalizeStyleNameList = (source: unknown): string[] => {
  if (!Array.isArray(source)) return []
  return [...new Set(source
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean))]
}

const getVisualStyleNamesSessionKey = () => {
  const user = getStoredAuthUser()
  const userScope = user?.id ?? user?.username ?? 'anonymous'
  return `${VISUAL_STYLE_NAMES_SESSION_KEY_PREFIX}:${encodeURIComponent(String(userScope))}`
}

const readVisualStyleNamesSnapshot = () => {
  if (typeof window === 'undefined') return []
  try {
    const serialized = window.sessionStorage.getItem(getVisualStyleNamesSessionKey())
    return serialized ? normalizeStyleNameList(JSON.parse(serialized)) : []
  } catch {
    return []
  }
}

const writeVisualStyleNamesSnapshot = (styleNames: string[]) => {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(getVisualStyleNamesSessionKey(), JSON.stringify(styleNames))
  } catch {
    // 会话缓存不可用时仍保留当前内存选项，不影响用户本次选择。
  }
}

/** 将一条后端风格记录及其在线封面映射为项目磁贴模型。 */
const toDisplayedStyle = (item: StudioStyleOption): DisplayedStyle => ({
  key: `${item.styleType}:${item.id}`,
  value: item.name.trim(),
  label: item.name.trim(),
  preview: 'online',
  coverUrl: item.coverUrl?.trim() || undefined,
  description: item.description?.trim() || undefined,
  id: item.id,
  defaultOption: item.defaultOption,
})

const isNoStyleOption = (item: StudioStyleOption) => {
  const normalizedName = item.name.trim().toLowerCase()
  return normalizedName === '无风格' || normalizedName === 'no style'
}

/** 在列表前添加“无风格”磁贴，用后端 ID 做回显匹配，提交时仍按空风格处理。 */
const toDisplayedStyles = (
  items: StudioStyleOption[],
  category: StyleCategoryKey,
  noStyleLabel: string,
): DisplayedStyle[] => {
  const noStyleOption = items.find(isNoStyleOption)
  return [
    {
      key: `${category}:none`,
      value: '',
      label: noStyleLabel,
      preview: 'empty',
      id: noStyleOption?.id,
      defaultOption: noStyleOption?.defaultOption,
    },
    ...items.filter((item) => !isNoStyleOption(item)).map(toDisplayedStyle),
  ]
}

/** 优先使用后端默认风格；未配置默认项时选择第一个真实风格。 */
const getDefaultDisplayedStyle = (styles: DisplayedStyle[]) =>
  styles.find((item) => item.defaultOption)
  ?? styles.find((item) => item.preview !== 'empty')
  ?? styles[0]

const STYLE_CATEGORY_TYPE_PREFIX: Record<StyleCategoryKey, string> = {
  visual: '1',
  tone: '2',
}

/** 将裁剪后的预览图转换为封面 API 所需的 JPG 或 PNG 文件。 */
async function createCoverUploadFile(dataUrl: string): Promise<File> {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const mimeType = blob.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const extension = mimeType === 'image/png' ? 'png' : 'jpg'
  return new File([blob], `custom-style-cover.${extension}`, { type: mimeType })
}

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

const toEpisodeDrafts = (
  chapters: StudioScriptParseChapter[],
  getFallbackTitle: (episodeNumber: number) => string,
): EpisodeDraft[] => chapters.map((chapter, index) => ({
  id: String(chapter.id ?? createId(`script_import_chapter_${index + 1}`)),
  title: chapter.title?.trim()
    || chapter.chapterTitle?.trim()
    || chapter.chapter_title?.trim()
    || getFallbackTitle(index + 1),
  rawText: chapter.rawText
    ?? chapter.raw_text
    ?? chapter.content
    ?? chapter.text
    ?? '',
}))

const toManualScriptFileName = (title: string) => {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
  return `${safeTitle || 'script'}.txt`
}

/** 从文件名提取后端保存基础信息所需的文件类型。 */
const getScriptFileType = (fileName: string) => {
  const extension = fileName.trim().match(/\.([^.]+)$/)?.[1]
  return extension?.toLowerCase() || 'txt'
}

/** 兼容剧本接口不同阶段返回的模型 ID 结构。 */
const getScriptAiModelId = (
  source?: StudioScriptParseResult | null,
): StudioScriptImportId | null => {
  const directModelId = source?.aiModelId
    ?? source?.ai_model_id
    ?? source?.modelId
    ?? source?.model_id
  if (typeof directModelId === 'number' && Number.isFinite(directModelId)) return directModelId
  if (typeof directModelId === 'string' && directModelId.trim()) return directModelId

  const aiModel = source?.aiModel
  if (typeof aiModel === 'number' && Number.isFinite(aiModel)) return aiModel
  if (typeof aiModel === 'string' && aiModel.trim()) return aiModel
  if (!aiModel || typeof aiModel !== 'object') return null

  const nestedModelId = aiModel.id ?? aiModel.modelId ?? aiModel.model_id
  if (typeof nestedModelId === 'number' && Number.isFinite(nestedModelId)) return nestedModelId
  if (typeof nestedModelId === 'string' && nestedModelId.trim()) return nestedModelId
  return null
}

/** 将后端从 1 开始的页面步骤转换为前端从 0 开始的步骤。 */
const toCreationStepIndex = (currentStep?: number | null) => {
  const normalizedStep = Number(currentStep)
  if (!Number.isFinite(normalizedStep) || normalizedStep < 1) return 0
  return Math.min(3, Math.max(0, Math.trunc(normalizedStep) - 1))
}

const hasOwnNullableField = (source: object | null | undefined, field: PropertyKey) => (
  Boolean(source && Object.prototype.hasOwnProperty.call(source, field))
)

type ScriptStyleSnapshot = {
  visualStyleId?: StudioScriptImportId | null
  toneStyleId?: StudioScriptImportId | null
  visualStyleName?: string | null
  toneStyleName?: string | null
  visualStyleCode?: string | null
  toneStyleCode?: string | null
}

/** 保存风格的展示名称；详情暂未返回名称时以 code 兜底，避免第三步重新查询风格列表。 */
const getScriptStyleNameSnapshot = (
  source?: ScriptStyleSnapshot | null,
): Partial<Record<StyleCategoryKey, string>> => {
  if (!source) return {}

  const visualName = source.visualStyleName?.trim() || source.visualStyleCode?.trim()
  const toneName = source.toneStyleName?.trim() || source.toneStyleCode?.trim()
  return {
    ...(hasOwnNullableField(source, 'visualStyleId') && source.visualStyleId === null
      ? { visual: '' }
      : visualName ? { visual: visualName } : {}),
    ...(hasOwnNullableField(source, 'toneStyleId') && source.toneStyleId === null
      ? { tone: '' }
      : toneName ? { tone: toneName } : {}),
  }
}

const normalizeDraftStyleNames = (
  source?: Partial<Record<StyleCategoryKey, string>> | null,
): Partial<Record<StyleCategoryKey, string>> => ({
  ...(typeof source?.visual === 'string' ? { visual: source.visual } : {}),
  ...(typeof source?.tone === 'string' ? { tone: source.tone } : {}),
})

/** 风格选项尚未加载完成时，从选中键中恢复后端风格 ID。 */
const getStyleIdFromSelectionKey = (key?: string): StudioScriptImportId | null => {
  if (!key) return null
  const separatorIndex = key.indexOf(':')
  if (separatorIndex < 0) return null
  const value = key.slice(separatorIndex + 1)
  if (!value || value === 'none') return null
  return /^-?\d+$/.test(value) ? Number(value) : value
}

/** 从当前磁贴及其选中键中稳定取得后端风格 ID，“无风格”不提交任何风格 ID。 */
const getSelectedStyleId = (
  selectedStyle: DisplayedStyle | undefined,
  selectionKey?: string,
): StudioScriptImportId | null => {
  if (selectedStyle?.preview === 'empty' || selectionKey?.endsWith(':none')) return null
  return selectedStyle?.id ?? getStyleIdFromSelectionKey(selectionKey)
}

const buildStyleSelectionKey = (
  category: StyleCategoryKey,
  styleId?: StudioScriptImportId | null,
) => (
  styleId === null || styleId === undefined
    ? `${category}:none`
    : `${STYLE_CATEGORY_TYPE_PREFIX[category]}:${styleId}`
)

const findDisplayedStyleById = (
  styles: DisplayedStyle[],
  styleId: StudioScriptImportId,
) => styles.find((item) => item.id !== undefined && String(item.id) === String(styleId))

/** 后端只返回风格 ID 时，优先反查为真实磁贴 key，避免把“无风格”的后端 ID 当成普通风格。 */
const getStyleSelectionKeyById = (
  category: StyleCategoryKey,
  styleId: StudioScriptImportId | null | undefined,
  styles: DisplayedStyle[],
) => {
  if (styleId === null || styleId === undefined) return `${category}:none`
  return findDisplayedStyleById(styles, styleId)?.key ?? buildStyleSelectionKey(category, styleId)
}

const resolveStyleSelectionKey = (
  category: StyleCategoryKey,
  currentKey: string | undefined,
  styles: DisplayedStyle[],
) => {
  if (styles.some((item) => item.key === currentKey)) return currentKey
  const restoredStyleId = getStyleIdFromSelectionKey(currentKey)
  if (restoredStyleId !== null) return getStyleSelectionKeyById(category, restoredStyleId, styles)
  return getDefaultDisplayedStyle(styles)?.key
}

const getStoryboardRunStatus = (result: StudioEpisodeStoryboardEditorResult) => {
  const status = Number(result.storyboard?.status)
  return Number.isFinite(status) ? status : null
}

const getStoryboardRunProgress = (result: StudioEpisodeStoryboardEditorResult) => {
  const progress = Number(result.storyboard?.progress)
  return Number.isFinite(progress) ? progress : null
}

const isStoryboardRunSucceeded = (result: StudioEpisodeStoryboardEditorResult) => {
  const status = getStoryboardRunStatus(result)
  if (status !== null) return status === 3
  return result.canEnterEditor && !result.shouldPoll
}

const isStoryboardRunFailed = (result: StudioEpisodeStoryboardEditorResult) => (
  getStoryboardRunStatus(result) === 4 || Boolean(result.storyboard?.error?.trim())
)

const shouldPollStoryboardRun = (result: StudioEpisodeStoryboardEditorResult) => {
  const status = getStoryboardRunStatus(result)
  if (status !== null) return status === 1 || status === 2
  const progress = getStoryboardRunProgress(result)
  if (progress !== null) return progress < 100
  return result.shouldPoll
}

const toNullableWorkflowId = (value: unknown): string | number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return null
}

const toNullableEpisodeWorkflowId = (value: unknown): string | null => {
  const normalized = toNullableWorkflowId(value)
  return normalized === null ? null : String(normalized)
}

const asWorkflowRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const extractStoryboardRestorePoint = (source: unknown) => {
  const record = asWorkflowRecord(source)
  const editor = asWorkflowRecord(record?.editor)
  const storyboard = asWorkflowRecord(record?.storyboard)
    ?? asWorkflowRecord(record?.run)
    ?? asWorkflowRecord(editor?.storyboard)
    ?? asWorkflowRecord(editor?.run)

  return {
    episodeId: toNullableEpisodeWorkflowId(
      record?.storyboardEpisodeId
        ?? record?.storyboard_episode_id
        ?? editor?.episodeId
        ?? editor?.episode_id
        ?? storyboard?.episodeId
        ?? storyboard?.episode_id,
    ),
    runId: toNullableWorkflowId(
      record?.storyboardRunId
        ?? record?.storyboard_run_id
        ?? record?.runId
        ?? record?.run_id
        ?? editor?.storyboardRunId
        ?? editor?.storyboard_run_id
        ?? storyboard?.runId
        ?? storyboard?.run_id
        ?? storyboard?.id,
    ),
  }
}

const getStoryboardRestorePointStorageKey = () => {
  const user = getStoredAuthUser()
  const userScope = user?.id ?? user?.username ?? 'anonymous'
  return `${STORYBOARD_RESTORE_POINT_STORAGE_KEY_PREFIX}:${encodeURIComponent(String(userScope))}`
}

const readStoryboardRestorePointSnapshot = (
  scriptImportId: StudioScriptImportId,
): StoryboardRestorePointSnapshot | null => {
  if (typeof window === 'undefined') return null
  try {
    const serialized = window.localStorage.getItem(getStoryboardRestorePointStorageKey())
    if (!serialized) return null
    const parsed = JSON.parse(serialized) as Partial<StoryboardRestorePointSnapshot>
    const storedScriptImportId = toNullableWorkflowId(parsed.scriptImportId)
    const storedEpisodeId = toNullableEpisodeWorkflowId(parsed.episodeId)
    const storedRunId = toNullableWorkflowId(parsed.runId)
    const updatedAt = Number(parsed.updatedAt)
    if (
      storedScriptImportId === null
      || storedEpisodeId === null
      || storedRunId === null
      || !Number.isFinite(updatedAt)
      || Date.now() - updatedAt > STORYBOARD_RESTORE_POINT_TTL_MS
    ) {
      window.localStorage.removeItem(getStoryboardRestorePointStorageKey())
      return null
    }
    if (String(storedScriptImportId) !== String(scriptImportId)) return null
    return {
      scriptImportId: storedScriptImportId,
      episodeId: storedEpisodeId,
      runId: storedRunId,
      updatedAt,
    }
  } catch {
    return null
  }
}

const writeStoryboardRestorePointSnapshot = (
  scriptImportId: StudioScriptImportId,
  episodeId: string,
  runId: StudioScriptImportId,
) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getStoryboardRestorePointStorageKey(), JSON.stringify({
      scriptImportId,
      episodeId,
      runId,
      updatedAt: Date.now(),
    } satisfies StoryboardRestorePointSnapshot))
  } catch {
    // 恢复点只是刷新兜底，写入失败不影响主流程。
  }
}

const clearStoryboardRestorePointSnapshot = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(getStoryboardRestorePointStorageKey())
  } catch {
    // localStorage 不可用时无需中断流程。
  }
}

const mergeStoryboardSegment = (
  current: StudioEpisodeStoryboardEditorResult['segments'][number],
  next: StudioEpisodeStoryboardEditorResult['segments'][number],
) => ({
  ...current,
  ...next,
  title: next.title.trim() ? next.title : current.title,
  editorDescription: next.editorDescription.trim() ? next.editorDescription : current.editorDescription,
  status: next.status ?? current.status,
  statusName: next.statusName ?? current.statusName,
  progress: next.progress ?? current.progress,
  taskId: next.taskId ?? current.taskId,
  shouldPoll: next.shouldPoll ?? current.shouldPoll,
  canEdit: next.canEdit ?? current.canEdit,
  error: next.error ?? current.error,
  durationSeconds: next.durationSeconds ?? current.durationSeconds,
  manuallyEdited: next.manuallyEdited ?? current.manuallyEdited,
  manuallyAdded: next.manuallyAdded ?? current.manuallyAdded,
  revisionNo: next.revisionNo ?? current.revisionNo,
  primaryImageId: next.primaryImageId ?? current.primaryImageId,
  coverFileId: next.coverFileId ?? current.coverFileId,
  coverUrl: next.coverUrl ?? current.coverUrl,
  shots: next.shots.length > 0 ? next.shots : current.shots,
})

const mergeStoryboardSegments = (
  previous: StudioEpisodeStoryboardEditorResult['segments'],
  next: StudioEpisodeStoryboardEditorResult['segments'],
) => {
  if (next.length === 0) return previous
  const byId = new Map(previous.map((segment) => [String(segment.id), segment]))
  next.forEach((segment) => {
    const key = String(segment.id)
    const current = byId.get(key)
    byId.set(key, current ? mergeStoryboardSegment(current, segment) : segment)
  })
  return Array.from(byId.values()).sort((left, right) => left.segmentIndex - right.segmentIndex)
}

const mergeStoryboardEditorResult = (
  previous: StudioEpisodeStoryboardEditorResult,
  next: StudioEpisodeStoryboardEditorResult,
): StudioEpisodeStoryboardEditorResult => ({
  scriptImportId: next.scriptImportId ?? previous.scriptImportId,
  episodeId: next.episodeId ?? previous.episodeId,
  episodeIndex: next.episodeIndex ?? previous.episodeIndex,
  episodeTitle: next.episodeTitle ?? previous.episodeTitle,
  canEnterEditor: next.canEnterEditor || previous.canEnterEditor,
  shouldPoll: next.shouldPoll,
  sourceChanged: next.sourceChanged || previous.sourceChanged,
  assetReadiness: next.assetReadiness ?? previous.assetReadiness,
  storyboard: next.storyboard ?? previous.storyboard,
  segments: mergeStoryboardSegments(previous.segments, next.segments),
})

const storyboardSegmentsToClipDrafts = (result: StudioEpisodeStoryboardEditorResult | null): ClipDraft[] => {
  if (!result) return []
  return result.segments.map((segment) => {
    const description = segment.editorDescription.trim()
      || segment.shots
        .map((shot, index) => {
          const shotDescription = shot.editorDescription?.trim() || shot.title?.trim()
          return shotDescription ? `分镜${shot.shotIndex ?? index + 1}：${shotDescription}` : ''
        })
        .filter(Boolean)
        .join('\n')
    const coverSource = segment.coverUrl ?? (segment.coverFileId === null || segment.coverFileId === undefined
      ? undefined
      : String(segment.coverFileId))
    return {
      id: String(segment.id),
      title: segment.title.trim() || `片段-${segment.segmentIndex}`,
      description,
      prompt: description,
      imageUrl: resolveAssetUrl(coverSource) ?? '',
      revisionNo: segment.revisionNo ?? null,
      manuallyAdded: segment.manuallyAdded ?? false,
    }
  })
}

const ProjectCreatePage: React.FC = () => {
  const l = useBilingualText()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const apiQuota = useAppStore((state) => state.user.apiQuota)
  const isAdmin = useAppStore((state) => state.user.isAdmin)
  const hasUnlimitedApiQuota = isAdmin && apiQuota === 0
  const apiQuotaText = hasUnlimitedApiQuota ? '∞' : apiQuota.toLocaleString()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const episodeImportInputRef = useRef<HTMLInputElement>(null)
  const persistDraftOnUnmountRef = useRef(true)
  const projectDraftPersistEnabledRef = useRef(false)
  const basicInfoSubmissionRef = useRef(false)
  const chapterSubmissionRef = useRef(false)
  const assetSubmissionRef = useRef(false)
  const chapterRestoreRequestRef = useRef(0)
  const chapterMutationRevisionRef = useRef(0)
  const assetExtractionStartedRef = useRef(false)
  const workflowNavigationRevisionRef = useRef(0)
  const storyboardEditorRequestRef = useRef<StudioAssetImageTaskRequest<StudioEpisodeStoryboardEditorResult> | null>(null)
  const storyboardDetailRequestsRef = useRef(new Map<string, StudioAssetImageTaskRequest<StudioEpisodeStoryboardEditorResult>>())
  const storyboardDetailTimerRef = useRef<number | null>(null)
  const assetConfirmRequestRef = useRef<StudioAssetImageTaskRequest<StudioEpisodeAssetsConfirmResult> | null>(null)
  const [resumePayload] = useState<ProjectCreateRouteState | null>(() => {
    const candidate = location.state as ProjectCreateRouteState | null
    return candidate?.scriptImport?.id !== null && candidate?.scriptImport?.id !== undefined
      ? candidate
      : null
  })
  const resumeImport = resumePayload?.scriptImport ?? null
  const requestedImportId = useMemo(() =>
    new URLSearchParams(location.search).get('scriptImportId'), [location.search])
  const resumeImportId = resumeImport?.id ?? requestedImportId
  const isResumingScriptImport = resumeImportId !== null && resumeImportId !== undefined
  const resumeDetail = resumePayload?.scriptImportDetail
    ?? (isResumingScriptImport ? readCachedScriptImportDetail(resumeImportId) : undefined)
  const resumeSnapshot = resumeDetail ?? resumeImport
  const appliedDetailImportIdRef = useRef<string | null>(
    resumeDetail && isResumingScriptImport ? String(resumeImportId) : null,
  )
  const confirmedBasicInfoRef = useRef<{
    importId: StudioScriptImportId
    editRevision: number
  } | null>(null)
  const resumeChapters = Array.isArray(resumePayload?.chapters)
    ? resumePayload.chapters
    : isResumingScriptImport
      ? readCachedScriptImportChapters(resumeImportId) ?? []
      : []
  const [restoredDraft] = useState(() =>
    readProjectCreationDraft<ProjectCreateDraft>(PROJECT_CREATION_DRAFT_KEYS.project))
  const shouldRestoreProjectDraft = !isResumingScriptImport && !resumeSnapshot
  const resumeStoryboardRestorePoint = extractStoryboardRestorePoint(resumeSnapshot)
  const restoredDraftScriptImportId = toNullableWorkflowId(restoredDraft?.scriptImportId)
  const canUseRestoredWorkflowDraft = Boolean(
    restoredDraftScriptImportId !== null
    && resumeImportId !== null
    && resumeImportId !== undefined
    && String(restoredDraftScriptImportId) === String(resumeImportId),
  )
  const persistedStoryboardRestorePoint = resumeImportId !== null && resumeImportId !== undefined
    ? readStoryboardRestorePointSnapshot(resumeImportId)
    : null
  const draftStoryboardRestorePoint = shouldRestoreProjectDraft || canUseRestoredWorkflowDraft
    ? extractStoryboardRestorePoint(restoredDraft)
    : { episodeId: null, runId: null }
  const initialStoryboardRestorePoint = {
    episodeId: draftStoryboardRestorePoint.episodeId
      ?? persistedStoryboardRestorePoint?.episodeId
      ?? resumeStoryboardRestorePoint.episodeId,
    runId: draftStoryboardRestorePoint.runId
      ?? persistedStoryboardRestorePoint?.runId
      ?? resumeStoryboardRestorePoint.runId,
  }
  const restoredDraftExpectedScriptLength = Math.max(0, Number(restoredDraft?.scriptLength) || 0)
  const restoredDraftExpectedEpisodeCount = Math.max(
    0,
    Number(restoredDraft?.episodeCount) || (
      Number(restoredDraft?.currentStep) > 0 && (restoredDraft?.episodes?.length ?? 0) === 0 ? 1 : 0
    ),
  )
  const restoredDraftNeedsFullHydration = shouldRestoreProjectDraft && Boolean(
    restoredDraftExpectedScriptLength > (restoredDraft?.script?.length ?? 0)
    || restoredDraftExpectedEpisodeCount > (restoredDraft?.episodes?.length ?? 0),
  )
  const [restoringLocalDraft, setRestoringLocalDraft] = useState(shouldRestoreProjectDraft)
  const [localDraftRestoreFailed, setLocalDraftRestoreFailed] = useState(false)
  const [localDraftWriteError, setLocalDraftWriteError] = useState<unknown>()
  const [localDraftRestoreRetryToken, setLocalDraftRestoreRetryToken] = useState(0)
  const restoredEpisodes = resumeSnapshot
    ? toEpisodeDrafts(
      resumeChapters,
      (episodeNumber) => l(`第${episodeNumber}集`, `Episode ${episodeNumber}`),
    )
    : shouldRestoreProjectDraft && Array.isArray(restoredDraft?.episodes) ? restoredDraft.episodes : []
  const restoredStep = Math.min(3, Math.max(0, Number(restoredDraft?.currentStep) || 0))
  const [currentStep, setCurrentStep] = useState(() => resumeSnapshot
    ? Math.max(
      toCreationStepIndex(resumeSnapshot.currentStep),
      toCreationStepIndex(resumeImport?.currentStep),
    )
    : shouldRestoreProjectDraft && restoredEpisodes.length ? restoredStep : 0)
  const [stepsExpanded, setStepsExpanded] = useState(false)
  const [assetImageSubmissionPending, setAssetImageSubmissionPending] = useState(false)
  const [assetCompletionCheckPending, setAssetCompletionCheckPending] = useState(false)
  const [assetConfirmPending, setAssetConfirmPending] = useState(false)
  const [assetStepScope, setAssetStepScope] = useState<string | null>(null)
  const [storyboardEpisodeId, setStoryboardEpisodeId] = useState<string | null>(
    initialStoryboardRestorePoint.episodeId,
  )
  const [storyboardRunId, setStoryboardRunId] = useState<string | number | null>(
    initialStoryboardRestorePoint.runId,
  )
  const [storyboardEditor, setStoryboardEditor] = useState<StudioEpisodeStoryboardEditorResult | null>(null)
  const [storyboardEditorLoading, setStoryboardEditorLoading] = useState(false)
  const [storyboardEditorError, setStoryboardEditorError] = useState<unknown>()
  const [storyboardEditorRetryToken, setStoryboardEditorRetryToken] = useState(0)
  const assetCompletionRequestRef = useRef<StudioAssetImageTaskRequest<StudioEpisodeAssetsGenerateStatusResult> | null>(null)
  const cancelStoryboardDetailPolling = useCallback(() => {
    if (storyboardDetailTimerRef.current !== null) {
      window.clearTimeout(storyboardDetailTimerRef.current)
      storyboardDetailTimerRef.current = null
    }
    storyboardDetailRequestsRef.current.forEach((request) => request.cancel())
    storyboardDetailRequestsRef.current.clear()
  }, [])
  const clearStoryboardRestorePoint = useCallback(() => {
    clearStoryboardRestorePointSnapshot()
    storyboardEditorRequestRef.current?.cancel()
    storyboardEditorRequestRef.current = null
    cancelStoryboardDetailPolling()
    setStoryboardEpisodeId(null)
    setStoryboardRunId(null)
    setStoryboardEditor(null)
    setStoryboardEditorError(undefined)
  }, [cancelStoryboardDetailPolling])
  const navigateToWorkflowStep = useCallback((step: number) => {
    workflowNavigationRevisionRef.current += 1
    setStepsExpanded(false)
    setCurrentStep(step)
  }, [])
  useEffect(() => {
    if (currentStep !== 3 && stepsExpanded) setStepsExpanded(false)
  }, [currentStep, stepsExpanded])
  const [scriptImportId, setScriptImportId] = useState<StudioScriptImportId | null>(
    resumeSnapshot?.id ?? resumeImportId ?? (shouldRestoreProjectDraft ? restoredDraft?.scriptImportId : null) ?? null,
  )
  const [aiModelId, setAiModelId] = useState<StudioScriptImportId | null>(
    getScriptAiModelId(resumeDetail)
      ?? (shouldRestoreProjectDraft ? restoredDraft?.aiModelId : null)
      ?? null,
  )
  const [name, setName] = useState(
    resumeSnapshot ? resumeSnapshot.title ?? '' : shouldRestoreProjectDraft ? restoredDraft?.name ?? '' : '',
  )
  const [script, setScript] = useState(
    resumeSnapshot ? resumeSnapshot.rawText ?? '' : shouldRestoreProjectDraft ? restoredDraft?.script ?? '' : '',
  )
  const [episodes, setEpisodes] = useState<EpisodeDraft[]>(restoredEpisodes)
  const [activeEpisodeIndex, setActiveEpisodeIndex] = useState(() =>
    Math.min(
      Math.max(0, shouldRestoreProjectDraft ? restoredDraft?.activeEpisodeIndex ?? 0 : 0),
      Math.max(0, restoredEpisodes.length - 1),
    ))
  const [ratio, setRatio] = useState(
    resumeSnapshot ? resumeSnapshot.videoRatio ?? '9:16' : shouldRestoreProjectDraft ? restoredDraft?.ratio ?? '9:16' : '9:16',
  )
  const [targetMarket, setTargetMarket] = useState(
    resumeSnapshot ? resumeSnapshot.targetMarket ?? 'overseas' : shouldRestoreProjectDraft ? restoredDraft?.targetMarket ?? 'overseas' : 'overseas',
  )
  const [styleCategory, setStyleCategory] = useState<StyleCategoryKey>(
    shouldRestoreProjectDraft && restoredDraft?.styleCategory === 'tone' ? 'tone' : 'visual',
  )
  const [selectedStyleKeys, setSelectedStyleKeys] = useState<Partial<Record<StyleCategoryKey, string>>>(
    () => resumeSnapshot
      ? {
        ...(hasOwnNullableField(resumeSnapshot, 'visualStyleId')
          ? { visual: buildStyleSelectionKey('visual', resumeSnapshot.visualStyleId) }
          : {}),
        ...(hasOwnNullableField(resumeSnapshot, 'toneStyleId')
          ? { tone: buildStyleSelectionKey('tone', resumeSnapshot.toneStyleId) }
          : {}),
      }
      : shouldRestoreProjectDraft ? restoredDraft?.selectedStyleKeys ?? {} : {},
  )
  const selectedStyleKeysRef = useRef(selectedStyleKeys)
  selectedStyleKeysRef.current = selectedStyleKeys
  const [selectedStyleNames, setSelectedStyleNames] = useState<Partial<Record<StyleCategoryKey, string>>>(
    () => resumeSnapshot
      ? {
        ...getScriptStyleNameSnapshot(resumeImport),
        ...getScriptStyleNameSnapshot(resumeDetail),
      }
      : shouldRestoreProjectDraft
        ? normalizeDraftStyleNames(restoredDraft?.selectedStyleNames)
        : {},
  )
  const initialImportedFileName = resumeSnapshot
    ? resumeDetail?.fileName?.trim() || resumeImport?.sourceFileName?.trim() || ''
    : shouldRestoreProjectDraft ? restoredDraft?.importedFileName?.trim() || '' : ''
  const initialImportedFileType = resumeSnapshot
    ? resumeDetail?.fileType?.trim() || getScriptFileType(initialImportedFileName)
    : shouldRestoreProjectDraft
      ? restoredDraft?.importedFileType?.trim() || getScriptFileType(initialImportedFileName)
      : 'txt'
  const [importedFileName, setImportedFileName] = useState(initialImportedFileName)
  const [importedFileType, setImportedFileType] = useState(initialImportedFileType)
  const restoredDraftHasBasicInfo = shouldRestoreProjectDraft && Boolean(
    restoredDraft?.name?.trim()
    || restoredDraft?.script?.trim()
    || restoredDraftExpectedScriptLength > 0
    || restoredDraftExpectedEpisodeCount > 0
    || restoredDraft?.importedFileName?.trim()
    || (restoredDraft?.scriptImportId !== null && restoredDraft?.scriptImportId !== undefined),
  )
  const [basicInfoTouched, setBasicInfoTouched] = useState(restoredDraftHasBasicInfo)
  const basicInfoTouchedRef = useRef(restoredDraftHasBasicInfo)
  const basicInfoEditRevisionRef = useRef(restoredDraftHasBasicInfo ? 1 : 0)
  const markBasicInfoTouched = useCallback(() => {
    basicInfoEditRevisionRef.current += 1
    if (basicInfoTouchedRef.current) return
    basicInfoTouchedRef.current = true
    setBasicInfoTouched(true)
  }, [])
  const resetBasicInfoTouched = useCallback(() => {
    basicInfoTouchedRef.current = false
    setBasicInfoTouched(false)
  }, [])
  const [restoringBasicInfo, setRestoringBasicInfo] = useState(
    isResumingScriptImport && !resumeDetail,
  )
  const [basicInfoRestoreFailed, setBasicInfoRestoreFailed] = useState(false)
  const [basicInfoRestoreRetryToken, setBasicInfoRestoreRetryToken] = useState(0)
  const [restoringImport, setRestoringImport] = useState(
    Boolean(
      resumeSnapshot
      && (currentStep === 1 || currentStep === 3)
      && restoredEpisodes.length === 0,
    ),
  )
  const [chapterRestoreRetryToken, setChapterRestoreRetryToken] = useState(0)
  const [assetExtractEstimate, setAssetExtractEstimate] = useState<StudioScriptAssetExtractEstimate | null>(null)
  const [assetExtractEstimateLoading, setAssetExtractEstimateLoading] = useState(false)
  const [assetExtractEstimateError, setAssetExtractEstimateError] = useState<unknown>()
  const [assetExtractEstimateRetryToken, setAssetExtractEstimateRetryToken] = useState(0)
  const assetEstimateRequestRevisionRef = useRef(0)
  const [assetEpisodes, setAssetEpisodes] = useState<StudioScriptAssetEpisode[] | null>(null)
  const [assetEpisodesLoading, setAssetEpisodesLoading] = useState(false)
  const [assetEpisodesError, setAssetEpisodesError] = useState<unknown>()
  const [assetEpisodesRetryToken, setAssetEpisodesRetryToken] = useState(0)
  const [parsingScript, setParsingScript] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [creatingEpisode, setCreatingEpisode] = useState(false)
  const [chapterRefreshPending, setChapterRefreshPending] = useState(false)
  const [parsingEpisodeFile, setParsingEpisodeFile] = useState(false)
  const [episodeImportOpen, setEpisodeImportOpen] = useState(false)
  const [episodeImportText, setEpisodeImportText] = useState('')
  const [episodeImportFileName, setEpisodeImportFileName] = useState('')
  const episodeImportEditRevisionRef = useRef(0)
  const pendingChapterCreationRef = useRef<PendingChapterCreation | null>(null)
  const clearPendingChapterCreation = useCallback((expected?: PendingChapterCreation) => {
    if (expected && pendingChapterCreationRef.current !== expected) return false
    pendingChapterCreationRef.current = null
    setChapterRefreshPending(false)
    return true
  }, [])
  const [customStyleModalOpen, setCustomStyleModalOpen] = useState(false)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const basicInfoInteractionLocked = restoringBasicInfo
    || restoringLocalDraft
    || localDraftRestoreFailed
    || basicInfoRestoreFailed
    || parsingScript
    || submitting
  const styleOptionsEnabled = !restoringBasicInfo
    && !restoringLocalDraft
    && !localDraftRestoreFailed
    && (currentStep === 0 || currentStep === 3)
  const {
    options: studioStyleOptions,
    loading: studioStyleOptionsLoading,
    error: studioStyleOptionsError,
    refresh: refreshStudioStyleOptions,
  } = useStudioStyleOptions(styleOptionsEnabled)
  const [cachedVisualStyleNames, setCachedVisualStyleNames] = useState(readVisualStyleNamesSnapshot)

  const projectDraft = useMemo<ProjectCreateDraft>(() => ({
    currentStep,
    name,
    script,
    episodes,
    activeEpisodeIndex,
    ratio,
    styleCategory,
    importedFileName,
    importedFileType,
    aiModelId,
    scriptImportId,
    storyboardEpisodeId,
    storyboardRunId,
    selectedStyleKeys,
    selectedStyleNames,
    targetMarket,
  }), [
    activeEpisodeIndex,
    aiModelId,
    currentStep,
    episodes,
    importedFileName,
    importedFileType,
    name,
    ratio,
    script,
    scriptImportId,
    storyboardEpisodeId,
    storyboardRunId,
    selectedStyleKeys,
    selectedStyleNames,
    styleCategory,
    targetMarket,
  ])
  const compactProjectDraft = useMemo<ProjectCreateDraft>(() => ({
    // localStorage 只保留同步恢复所需的元数据；完整剧本和分集正文仅写入 IndexedDB。
    currentStep: projectDraft.currentStep,
    name: projectDraft.name,
    script: '',
    scriptLength: projectDraft.script.length,
    episodes: [],
    episodeCount: projectDraft.episodes.length,
    activeEpisodeIndex: 0,
    ratio: projectDraft.ratio,
    styleCategory: projectDraft.styleCategory,
    importedFileName: projectDraft.importedFileName,
    importedFileType: projectDraft.importedFileType,
    aiModelId: projectDraft.aiModelId,
    scriptImportId: projectDraft.scriptImportId,
    storyboardEpisodeId: projectDraft.storyboardEpisodeId,
    storyboardRunId: projectDraft.storyboardRunId,
    selectedStyleKeys: projectDraft.selectedStyleKeys,
    selectedStyleNames: projectDraft.selectedStyleNames,
    targetMarket: projectDraft.targetMarket,
  }), [projectDraft])
  const latestProjectDraftRef = useRef(projectDraft)
  latestProjectDraftRef.current = projectDraft
  const handleFullDraftWriteSettled = useCallback((error?: unknown) => {
    setLocalDraftWriteError(error)
  }, [])
  const flushProjectDraft = useProjectCreationDraft(
    PROJECT_CREATION_DRAFT_KEYS.project,
    projectDraft,
    350,
    projectDraftPersistEnabledRef,
    compactProjectDraft,
    handleFullDraftWriteSettled,
  )

  useEffect(() => {
    if (
      currentStep !== 3
      || scriptImportId === null
      || storyboardEpisodeId === null
      || storyboardRunId === null
      || storyboardRunId === undefined
      || String(storyboardRunId).trim() === ''
    ) return

    writeStoryboardRestorePointSnapshot(scriptImportId, storyboardEpisodeId, storyboardRunId)
    flushProjectDraft()
  }, [
    currentStep,
    flushProjectDraft,
    scriptImportId,
    storyboardEpisodeId,
    storyboardRunId,
  ])

  useEffect(() => {
    if (!shouldRestoreProjectDraft) {
      projectDraftPersistEnabledRef.current = false
      setLocalDraftRestoreFailed(false)
      setRestoringLocalDraft(false)
      return undefined
    }

    let active = true
    let restoreBlocked = false
    const hydrationBaseline = latestProjectDraftRef.current
    projectDraftPersistEnabledRef.current = false
    setLocalDraftRestoreFailed(false)
    setRestoringLocalDraft(true)

    void readFullProjectCreationDraft<ProjectCreateDraft>(PROJECT_CREATION_DRAFT_KEYS.project)
      .then((fullDraft) => {
        if (!active) return
        if (!fullDraft) {
          if (restoredDraftNeedsFullHydration) {
            restoreBlocked = true
            setLocalDraftRestoreFailed(true)
          }
          return
        }
        if (latestProjectDraftRef.current !== hydrationBaseline) {
          restoreBlocked = true
          setLocalDraftRestoreFailed(true)
          return
        }

        const nextEpisodes = Array.isArray(fullDraft.episodes)
          ? fullDraft.episodes.flatMap((episode, index) => {
            if (!episode || typeof episode !== 'object') return []
            const id = typeof episode.id === 'string' && episode.id
              ? episode.id
              : createId(`restored_episode_${index + 1}`)
            return [{
              id,
              title: typeof episode.title === 'string'
                ? episode.title.slice(0, MAX_NAME_LENGTH)
                : `第${index + 1}集`,
              rawText: typeof episode.rawText === 'string'
                ? episode.rawText.slice(0, MAX_EPISODE_LENGTH)
                : '',
            }]
          })
          : []
        const nextScriptImportId = (
          typeof fullDraft.scriptImportId === 'number' && Number.isFinite(fullDraft.scriptImportId)
        ) || (
          typeof fullDraft.scriptImportId === 'string' && fullDraft.scriptImportId.trim()
        )
          ? fullDraft.scriptImportId
          : null
        const nextAiModelId = (
          typeof fullDraft.aiModelId === 'number' && Number.isFinite(fullDraft.aiModelId)
        ) || (
          typeof fullDraft.aiModelId === 'string' && fullDraft.aiModelId.trim()
        )
          ? fullDraft.aiModelId
          : null
        const nextName = typeof fullDraft.name === 'string'
          ? fullDraft.name.slice(0, MAX_NAME_LENGTH)
          : ''
        const nextScript = typeof fullDraft.script === 'string'
          ? fullDraft.script.slice(0, MAX_SCRIPT_LENGTH)
          : ''
        const nextImportedFileName = typeof fullDraft.importedFileName === 'string'
          ? fullDraft.importedFileName
          : ''
        const restoredFileType = typeof fullDraft.importedFileType === 'string'
          ? fullDraft.importedFileType.trim()
          : ''
        const nextImportedFileType = restoredFileType || getScriptFileType(nextImportedFileName)
        const nextActiveEpisodeIndex = Math.min(
          Math.max(0, Math.trunc(Number(fullDraft.activeEpisodeIndex) || 0)),
          Math.max(0, nextEpisodes.length - 1),
        )
        const nextStep = nextEpisodes.length > 0
          ? Math.min(3, Math.max(0, Math.trunc(Number(fullDraft.currentStep) || 0)))
          : 0
        const nextSelectedStyleKeys = fullDraft.selectedStyleKeys
          && typeof fullDraft.selectedStyleKeys === 'object'
          ? {
            ...(typeof fullDraft.selectedStyleKeys.visual === 'string'
              ? { visual: fullDraft.selectedStyleKeys.visual }
              : {}),
            ...(typeof fullDraft.selectedStyleKeys.tone === 'string'
              ? { tone: fullDraft.selectedStyleKeys.tone }
              : {}),
          }
          : {}
        const nextSelectedStyleNames = normalizeDraftStyleNames(fullDraft.selectedStyleNames)
        const nextStoryboardRestorePoint = extractStoryboardRestorePoint(fullDraft)
        const hasBasicInfo = Boolean(
          nextName.trim()
          || nextScript.trim()
          || nextImportedFileName.trim()
          || nextScriptImportId !== null
        )

        setCurrentStep(nextStep)
        setScriptImportId(nextScriptImportId)
        setAiModelId(nextAiModelId)
        setName(nextName)
        setScript(nextScript)
        setEpisodes(nextEpisodes)
        setActiveEpisodeIndex(nextActiveEpisodeIndex)
        setRatio(typeof fullDraft.ratio === 'string' && FALLBACK_RATIOS.includes(fullDraft.ratio)
          ? fullDraft.ratio
          : '9:16')
        setTargetMarket(typeof fullDraft.targetMarket === 'string'
          ? fullDraft.targetMarket
          : 'overseas')
        setStyleCategory(fullDraft.styleCategory === 'tone' ? 'tone' : 'visual')
        setImportedFileName(nextImportedFileName)
        setImportedFileType(nextImportedFileType)
        setSelectedStyleKeys(nextSelectedStyleKeys)
        setSelectedStyleNames(nextSelectedStyleNames)
        setStoryboardEpisodeId(nextStoryboardRestorePoint.episodeId)
        setStoryboardRunId(nextStoryboardRestorePoint.runId)
        basicInfoEditRevisionRef.current = hasBasicInfo ? 1 : 0
        confirmedBasicInfoRef.current = null
        basicInfoTouchedRef.current = hasBasicInfo
        setBasicInfoTouched(hasBasicInfo)
      })
      .finally(() => {
        if (!active) return
        setRestoringLocalDraft(false)
        if (restoreBlocked) return
        const changedWhileHydrating = latestProjectDraftRef.current !== hydrationBaseline
        projectDraftPersistEnabledRef.current = persistDraftOnUnmountRef.current
        if (changedWhileHydrating) flushProjectDraft()
      })

    return () => { active = false }
  }, [
    flushProjectDraft,
    localDraftRestoreRetryToken,
    restoredDraftExpectedEpisodeCount,
    restoredDraftExpectedScriptLength,
    restoredDraftNeedsFullHydration,
    shouldRestoreProjectDraft,
  ])

  const ratioOptions = FALLBACK_RATIOS

  const styleCategories = useMemo(() => [
    {
      key: 'visual' as const,
      label: l('画面风格', 'Visual style'),
      description: l(
        '风格后缀将注入到资产提取环节中，影响角色、场景和道具的视觉生成。',
        'The style suffix is applied during asset extraction and affects the visual generation of characters, scenes, and props.',
      ),
    },
    {
      key: 'tone' as const,
      label: l('影调风格', 'Tone style'),
      description: l(
        '影调后缀将注入到片段编辑中的视频生成环节，影响视频成片的滤镜效果。',
        'The tone suffix is applied during video generation in clip editing and affects the final video filter.',
      ),
    },
  ], [l])
  const displayedStylesByCategory = useMemo<Record<StyleCategoryKey, DisplayedStyle[]>>(() => ({
    visual: toDisplayedStyles(studioStyleOptions.visual, 'visual', l('无风格', 'No style')),
    tone: toDisplayedStyles(studioStyleOptions.tone, 'tone', l('无风格', 'No style')),
  }), [l, studioStyleOptions])
  const displayedStylesByCategoryRef = useRef(displayedStylesByCategory)
  displayedStylesByCategoryRef.current = displayedStylesByCategory
  const displayedStyles = displayedStylesByCategory[styleCategory]
  const selectedVisualStyle = displayedStylesByCategory.visual.find(
    (item) => item.key === selectedStyleKeys.visual,
  )
  const selectedToneStyle = displayedStylesByCategory.tone.find(
    (item) => item.key === selectedStyleKeys.tone,
  )
  const selectedVisualStyleId = getSelectedStyleId(selectedVisualStyle, selectedStyleKeys.visual)
  const selectedToneStyleId = getSelectedStyleId(selectedToneStyle, selectedStyleKeys.tone)
  const visualStyleName = selectedVisualStyle !== undefined
    ? selectedVisualStyle.value
    : selectedStyleNames.visual ?? ''
  const toneStyleName = selectedToneStyle !== undefined
    ? selectedToneStyle.value
    : selectedStyleNames.tone ?? ''
  const loadedVisualStyleNames = useMemo(() => [
    ...new Set(displayedStylesByCategory.visual
      .map((item) => item.value.trim())
      .filter(Boolean)),
  ], [displayedStylesByCategory.visual])
  const assetVisualStyleOptions = useMemo(() => displayedStylesByCategory.visual
    .filter((item) => Boolean(item.value.trim()))
    .map((item) => ({
      id: item.id,
      name: item.value.trim(),
      coverUrl: item.coverUrl,
    })), [displayedStylesByCategory.visual])
  const assetToneStyleOptions = useMemo(() => displayedStylesByCategory.tone
    .filter((item) => Boolean(item.value.trim()))
    .map((item) => ({
      id: item.id,
      name: item.value.trim(),
      coverUrl: item.coverUrl,
    })), [displayedStylesByCategory.tone])
  const visualStyleNames = loadedVisualStyleNames.length
    ? loadedVisualStyleNames
    : cachedVisualStyleNames

  useEffect(() => {
    if (!loadedVisualStyleNames.length) return
    setCachedVisualStyleNames((current) => {
      if (
        current.length === loadedVisualStyleNames.length
        && current.every((value, index) => value === loadedVisualStyleNames[index])
      ) return current
      return loadedVisualStyleNames
    })
    writeVisualStyleNamesSnapshot(loadedVisualStyleNames)
  }, [loadedVisualStyleNames])

  useEffect(() => {
    if (!selectedVisualStyle && !selectedToneStyle) return
    setSelectedStyleNames((current) => {
      const next = {
        ...current,
        ...(selectedVisualStyle ? { visual: selectedVisualStyle.value } : {}),
        ...(selectedToneStyle ? { tone: selectedToneStyle.value } : {}),
      }
      if (next.visual === current.visual && next.tone === current.tone) return current
      return next
    })
  }, [selectedToneStyle, selectedVisualStyle])

  useEffect(() => {
    if (restoringLocalDraft) return
    if (!ratioOptions.includes(ratio)) {
      setRatio(ratioOptions[0] ?? '16:9')
    }
  }, [ratio, ratioOptions, restoringLocalDraft])

  useEffect(() => {
    if (!styleOptionsEnabled || studioStyleOptionsLoading || studioStyleOptionsError) return
    setSelectedStyleKeys((current) => {
      const visual = resolveStyleSelectionKey('visual', current.visual, displayedStylesByCategory.visual)
      const tone = resolveStyleSelectionKey('tone', current.tone, displayedStylesByCategory.tone)
      if (visual === current.visual && tone === current.tone) return current
      return { ...current, visual, tone }
    })
  }, [
    displayedStylesByCategory,
    studioStyleOptionsError,
    studioStyleOptionsLoading,
    styleOptionsEnabled,
  ])

  useEffect(() => {
    if (!styleOptionsEnabled || !studioStyleOptionsError) return
    message.error(getApiErrorMessage(
      studioStyleOptionsError,
      l('风格选项加载失败', 'Failed to load style options'),
    ))
  }, [l, studioStyleOptionsError, styleOptionsEnabled])

  useEffect(() => {
    if (resumeImportId === null || resumeImportId === undefined) return
    const cacheKey = String(resumeImportId)
    if (appliedDetailImportIdRef.current === cacheKey) {
      setBasicInfoRestoreFailed(false)
      setRestoringBasicInfo(false)
      return
    }

    let active = true
    const navigationRevision = workflowNavigationRevisionRef.current
    setBasicInfoRestoreFailed(false)
    setRestoringBasicInfo(true)
    void loadScriptImportDetail(resumeImportId)
      .then((detail) => {
        if (!active) return
        const restoredImportId = detail.id ?? resumeImportId
        const restoredScript = (detail.rawText ?? '').slice(0, MAX_SCRIPT_LENGTH)
        const restoredFileName = detail.fileName?.trim() || resumeImport?.sourceFileName?.trim() || ''
        const restoredFileType = detail.fileType?.trim() || getScriptFileType(restoredFileName)
        const restoredCreationStep = Math.max(
          toCreationStepIndex(resumeImport?.currentStep),
          toCreationStepIndex(detail.currentStep),
        )
        appliedDetailImportIdRef.current = cacheKey
        setBasicInfoRestoreFailed(false)
        setScriptImportId((current) => (
          current !== null && String(current) === String(restoredImportId)
            ? current
            : restoredImportId
        ))
        setAiModelId((current) => getScriptAiModelId(detail) ?? current)
        basicInfoEditRevisionRef.current = 0
        confirmedBasicInfoRef.current = null
        if (workflowNavigationRevisionRef.current === navigationRevision) {
          setCurrentStep(restoredCreationStep)
        }
        setName(detail.title ?? '')
        setScript(restoredScript)
        setRatio(detail.videoRatio ?? '9:16')
        setTargetMarket(detail.targetMarket ?? 'overseas')
        setImportedFileName(restoredFileName)
        setImportedFileType(restoredFileType)
        setSelectedStyleNames((current) => ({
          ...current,
          ...getScriptStyleNameSnapshot(detail),
        }))
        setSelectedStyleKeys((current) => ({
          ...current,
          ...(hasOwnNullableField(detail, 'visualStyleId')
            ? {
              visual: getStyleSelectionKeyById(
                'visual',
                detail.visualStyleId,
                displayedStylesByCategoryRef.current.visual,
              ),
            }
            : {}),
          ...(hasOwnNullableField(detail, 'toneStyleId')
            ? {
              tone: getStyleSelectionKeyById(
                'tone',
                detail.toneStyleId,
                displayedStylesByCategoryRef.current.tone,
              ),
            }
            : {}),
        }))
        const restoredStoryboardPoint = extractStoryboardRestorePoint(detail)
        if (restoredStoryboardPoint.episodeId !== null) {
          setStoryboardEpisodeId(restoredStoryboardPoint.episodeId)
        }
        if (restoredStoryboardPoint.runId !== null) {
          setStoryboardRunId(restoredStoryboardPoint.runId)
        }
        resetBasicInfoTouched()
        if (restoredCreationStep !== 1 && restoredCreationStep !== 3) {
          setRestoringImport(false)
        }
      })
      .catch((error) => {
        if (!active) return
        setBasicInfoRestoreFailed(true)
        setRestoringImport(false)
        message.error(getApiErrorMessage(error, l('剧本基本信息恢复失败', 'Failed to restore script information')))
      })
      .finally(() => {
        if (active) setRestoringBasicInfo(false)
      })

    return () => { active = false }
  }, [
    basicInfoRestoreRetryToken,
    l,
    resetBasicInfoTouched,
    resumeImport?.currentStep,
    resumeImport?.sourceFileName,
    resumeImportId,
  ])

  useEffect(() => {
    if (
      restoringLocalDraft
      || restoringBasicInfo
      || basicInfoRestoreFailed
      || scriptImportId === null
      || (currentStep !== 1 && currentStep !== 3)
      || episodes.length > 0
    ) return

    let active = true
    const requestId = ++chapterRestoreRequestRef.current
    setRestoringImport(true)
    void loadScriptImportChapters(scriptImportId)
      .then((chapters) => {
        if (!active || requestId !== chapterRestoreRequestRef.current) return
        const nextEpisodes = toEpisodeDrafts(
          chapters,
          (episodeNumber) => l(`第${episodeNumber}集`, `Episode ${episodeNumber}`),
        )
        setEpisodes(nextEpisodes)
        setActiveEpisodeIndex(0)
        if (!nextEpisodes.length) {
          message.warning(l('未查询到已解析的分集数据', 'No parsed episodes were found'))
        }
      })
      .catch((error) => {
        if (!active || requestId !== chapterRestoreRequestRef.current) return
        message.error(getApiErrorMessage(error, l('分集数据恢复失败', 'Failed to restore episodes')))
      })
      .finally(() => {
        if (active && requestId === chapterRestoreRequestRef.current) setRestoringImport(false)
      })

    return () => { active = false }
  }, [
    basicInfoRestoreFailed,
    chapterRestoreRetryToken,
    currentStep,
    episodes.length,
    l,
    restoringBasicInfo,
    restoringLocalDraft,
    scriptImportId,
  ])

  useEffect(() => {
    chapterMutationRevisionRef.current += 1
    assetExtractionStartedRef.current = false
    clearPendingChapterCreation()
    setAssetEpisodes(null)
    setAssetEpisodesError(undefined)
  }, [clearPendingChapterCreation, scriptImportId])

  useEffect(() => {
    if (
      currentStep !== 1
      || restoringLocalDraft
      || restoringBasicInfo
      || basicInfoRestoreFailed
      || restoringImport
      || episodes.length === 0
    ) return

    setAssetExtractEstimate(null)
    setAssetExtractEstimateError(undefined)
    if (scriptImportId === null) {
      setAssetExtractEstimateLoading(false)
      setAssetExtractEstimateError(new Error(l(
        '缺少剧本导入 ID，无法估算资产提取积分',
        'The script import ID is missing, so extraction credits cannot be estimated.',
      )))
      return
    }

    let active = true
    const requestRevision = ++assetEstimateRequestRevisionRef.current
    setAssetExtractEstimateLoading(true)
    void StudioScriptsApi.getAssetExtractEstimate({ scriptImportId })
      .then((estimate) => {
        if (!active || assetEstimateRequestRevisionRef.current !== requestRevision) return
        setAssetExtractEstimate(estimate)
      })
      .catch((error) => {
        if (!active || assetEstimateRequestRevisionRef.current !== requestRevision) return
        setAssetExtractEstimateError(error)
      })
      .finally(() => {
        if (active && assetEstimateRequestRevisionRef.current === requestRevision) {
          setAssetExtractEstimateLoading(false)
        }
      })

    return () => { active = false }
  }, [
    assetExtractEstimateRetryToken,
    basicInfoRestoreFailed,
    currentStep,
    episodes.length,
    l,
    restoringBasicInfo,
    restoringImport,
    restoringLocalDraft,
    scriptImportId,
  ])

  useEffect(() => {
    if (currentStep !== 2 || restoringLocalDraft || assetEpisodes !== null) return

    if (scriptImportId === null) {
      setAssetEpisodesLoading(false)
      setAssetEpisodesError(new Error(l(
        '缺少剧本导入 ID，无法查询资产分集',
        'The script import ID is missing, so asset episodes cannot be loaded.',
      )))
      return
    }

    let active = true
    let request: StudioScriptAssetEpisodeListRequest | null = null
    let requestStartTimer: number | null = null
    setAssetEpisodesLoading(true)
    setAssetEpisodesError(undefined)
    requestStartTimer = window.setTimeout(() => {
      requestStartTimer = null
      request = StudioScriptsApi.requestAssetEpisodes(scriptImportId)
      void request.promise
        .then((nextAssetEpisodes) => {
          if (active) setAssetEpisodes(nextAssetEpisodes)
        })
        .catch((error) => {
          if (active) setAssetEpisodesError(error)
        })
        .finally(() => {
          if (active) setAssetEpisodesLoading(false)
        })
    }, 0)

    return () => {
      active = false
      if (requestStartTimer !== null) window.clearTimeout(requestStartTimer)
      request?.cancel()
    }
  }, [
    assetEpisodes,
    assetEpisodesRetryToken,
    currentStep,
    l,
    restoringLocalDraft,
    scriptImportId,
  ])

  const scriptLength = script.length
  const activeEpisode = episodes[activeEpisodeIndex]
  const assetStepEpisodes = useMemo(() => (assetEpisodes ?? []).map((assetEpisode, index) => {
    const sourceEpisode = episodes[assetEpisode.index - 1]
      ?? episodes.find((episode) => String(episode.id) === String(assetEpisode.id))
      ?? episodes[index]
    return {
      id: String(assetEpisode.id),
      index: assetEpisode.index,
      title: assetEpisode.title?.trim()
        || sourceEpisode?.title
        || l(`第${assetEpisode.index}集`, `Episode ${assetEpisode.index}`),
      rawText: sourceEpisode?.rawText ?? '',
    }
  }), [assetEpisodes, episodes, l])
  const selectedAssetEpisodeId = assetStepScope && assetStepScope !== 'overview'
    ? assetStepScope
    : assetStepEpisodes[0]?.id ?? null
  const storyboardTargetEpisodeId = storyboardEpisodeId
    ?? selectedAssetEpisodeId
    ?? activeEpisode?.id
    ?? null
  const clipEditingEpisodes = useMemo<EpisodeDraft[]>(() => {
    if (!storyboardTargetEpisodeId) return []
    const sourceEpisode = assetStepEpisodes.find((episode) => String(episode.id) === String(storyboardTargetEpisodeId))
      ?? episodes.find((episode) => String(episode.id) === String(storyboardTargetEpisodeId))
      ?? activeEpisode
    const storyboardEpisodeTitle = storyboardEditor?.episodeTitle?.trim()
    const storyboardEpisodeIndex = storyboardEditor?.episodeIndex
    return [{
      id: String(storyboardTargetEpisodeId),
      title: storyboardEpisodeTitle
        || sourceEpisode?.title
        || (storyboardEpisodeIndex
          ? l(`第${storyboardEpisodeIndex}集`, `Episode ${storyboardEpisodeIndex}`)
          : l('第1集', 'Episode 1')),
      rawText: sourceEpisode?.rawText ?? activeEpisode?.rawText ?? '',
    }]
  }, [
    activeEpisode,
    assetStepEpisodes,
    episodes,
    l,
    storyboardEditor?.episodeIndex,
    storyboardEditor?.episodeTitle,
    storyboardTargetEpisodeId,
  ])
  const storyboardClips = useMemo(() => storyboardSegmentsToClipDrafts(storyboardEditor), [storyboardEditor])

  useEffect(() => {
    setAssetCompletionCheckPending(false)
    setAssetConfirmPending(false)
    return () => {
      assetCompletionRequestRef.current?.cancel()
      assetCompletionRequestRef.current = null
      assetConfirmRequestRef.current?.cancel()
      assetConfirmRequestRef.current = null
    }
  }, [currentStep, scriptImportId])

  useEffect(() => {
    if (currentStep !== 2) return
    setAssetStepScope((current) => {
      if (current === 'overview') return current
      if (current && assetStepEpisodes.some((episode) => episode.id === current)) return current
      return assetStepEpisodes[0]?.id ?? null
    })
  }, [assetStepEpisodes, currentStep])

  useEffect(() => {
    storyboardEditorRequestRef.current?.cancel()
    storyboardEditorRequestRef.current = null
    cancelStoryboardDetailPolling()

    if (currentStep !== 3 || scriptImportId === null || storyboardTargetEpisodeId === null) {
      setStoryboardEditorLoading(false)
      setStoryboardEditorError(undefined)
      if (currentStep !== 3) setStoryboardEditor(null)
      return undefined
    }

    let active = true
    setStoryboardEditor(null)
    setStoryboardEditorError(undefined)
    setStoryboardEditorLoading(true)

    const loadStoryboardEditor = () => {
      if (!active) return
      const request = StudioAssetGenerationApi.requestEpisodeStoryboardEditor({
        scriptImportId,
        episodeId: storyboardTargetEpisodeId,
      })
      storyboardEditorRequestRef.current = request
      void request.promise
        .then((result) => {
          if (!active || storyboardEditorRequestRef.current !== request) return
          setStoryboardEditor(result)
          setStoryboardEditorLoading(false)
        })
        .catch((error) => {
          if (!active || storyboardEditorRequestRef.current !== request) return
          setStoryboardEditorError(error)
          setStoryboardEditorLoading(false)
        })
        .finally(() => {
          if (storyboardEditorRequestRef.current === request) storyboardEditorRequestRef.current = null
        })
    }

    if (storyboardRunId === null || storyboardRunId === undefined || String(storyboardRunId).trim() === '') {
      const request = StudioAssetGenerationApi.requestEpisodeStoryboardEditor({
        scriptImportId,
        episodeId: storyboardTargetEpisodeId,
      })
      storyboardEditorRequestRef.current = request
      void request.promise
        .then((result) => {
          if (!active || storyboardEditorRequestRef.current !== request) return
          const restoredRunId = toNullableWorkflowId(result.storyboard?.runId)
          const restoredEpisodeId = toNullableEpisodeWorkflowId(result.episodeId ?? storyboardTargetEpisodeId)
          if (restoredRunId !== null) {
            setStoryboardEpisodeId(restoredEpisodeId)
            setStoryboardRunId(restoredRunId)
            setStoryboardEditor(result)
            return
          }
          if (result.segments.length > 0) {
            setStoryboardEpisodeId(restoredEpisodeId)
            setStoryboardEditor(result)
            setStoryboardEditorLoading(false)
            return
          }
          setStoryboardEditorError(new Error(l('缺少分镜任务ID，请返回上一步重新确认资产', 'Missing storyboard run id; return to the previous step and confirm assets again.')))
          setStoryboardEditorLoading(false)
        })
        .catch((error) => {
          if (!active || storyboardEditorRequestRef.current !== request) return
          setStoryboardEditorError(error)
          setStoryboardEditorLoading(false)
        })
        .finally(() => {
          if (storyboardEditorRequestRef.current === request) storyboardEditorRequestRef.current = null
        })

      return () => {
        active = false
        if (storyboardEditorRequestRef.current === request) storyboardEditorRequestRef.current = null
        request.cancel()
      }
    }

    const pollStoryboardRunDetail = () => {
      if (!active) return
      if (storyboardDetailTimerRef.current !== null) {
        window.clearTimeout(storyboardDetailTimerRef.current)
        storyboardDetailTimerRef.current = null
      }
      const requestKey = `run:${String(storyboardRunId)}`
      const request = StudioAssetGenerationApi.requestEpisodeStoryboardDetail(storyboardRunId)
      storyboardDetailRequestsRef.current.set(requestKey, request)
      void request.promise
        .then((detail) => {
          if (!active || storyboardDetailRequestsRef.current.get(requestKey) !== request) return
          setStoryboardEditor((current) => current ? mergeStoryboardEditorResult(current, detail) : detail)
          if (isStoryboardRunFailed(detail)) {
            setStoryboardEditorError(new Error(detail.storyboard?.error?.trim() || detail.storyboard?.statusName || l('分镜生成失败，请重试', 'Storyboard generation failed; retry')))
            setStoryboardEditorLoading(false)
            return
          }
          if (isStoryboardRunSucceeded(detail)) {
            loadStoryboardEditor()
            return
          }
          if (shouldPollStoryboardRun(detail)) {
            storyboardDetailTimerRef.current = window.setTimeout(() => {
              pollStoryboardRunDetail()
            }, STORYBOARD_POLL_INTERVAL_MS)
            return
          }
          loadStoryboardEditor()
        })
        .catch((error) => {
          if (!active || storyboardDetailRequestsRef.current.get(requestKey) !== request) return
          setStoryboardEditorError(error)
          setStoryboardEditorLoading(false)
        })
        .finally(() => {
          if (storyboardDetailRequestsRef.current.get(requestKey) === request) {
            storyboardDetailRequestsRef.current.delete(requestKey)
          }
        })
    }

    pollStoryboardRunDetail()

    return () => {
      active = false
      storyboardEditorRequestRef.current?.cancel()
      storyboardEditorRequestRef.current = null
      cancelStoryboardDetailPolling()
    }
  }, [
    cancelStoryboardDetailPolling,
    currentStep,
    l,
    scriptImportId,
    storyboardEditorRetryToken,
    storyboardRunId,
    storyboardTargetEpisodeId,
  ])

  const getRatioShape = (value: string) => {
    const [rawWidth, rawHeight] = value.split(':').map(Number)
    const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 16
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 9
    const maxSize = 20
    return width >= height
      ? { width: maxSize, height: Math.max(7, Math.round(maxSize * height / width)) }
      : { width: Math.max(7, Math.round(maxSize * width / height)), height: maxSize }
  }

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || basicInfoInteractionLocked) return

    setParsingScript(true)
    try {
      const parsed = await StudioScriptsApi.parse(file)
      const parsedText = (parsed.rawText ?? '').trim()
      if (!parsedText) {
        message.warning(l('解析完成，但未返回剧本文本', 'Parsed successfully, but no script text was returned'))
        return
      }

      markBasicInfoTouched()
      confirmedBasicInfoRef.current = null
      const parsedFileName = parsed.fileName?.trim() || file.name
      const parsedFileType = parsed.fileType?.trim() || getScriptFileType(parsedFileName)
      setImportedFileName(parsedFileName)
      setImportedFileType(parsedFileType)
      setScript(parsedText.slice(0, MAX_SCRIPT_LENGTH))
      setScriptImportId(parsed.id ?? null)
      setAiModelId(getScriptAiModelId(parsed))
      clearStoryboardRestorePoint()
      setSelectedStyleNames((current) => ({
        ...current,
        ...getScriptStyleNameSnapshot(parsed),
      }))
      if (parsed.id !== null && parsed.id !== undefined) {
        primeScriptImportDetail(parsed.id, {
          ...parsed,
          id: parsed.id,
          fileName: parsedFileName,
          fileType: parsedFileType,
          rawText: parsedText.slice(0, MAX_SCRIPT_LENGTH),
        })
        invalidateScriptImportChapters(parsed.id)
      }
      setSelectedStyleKeys((current) => {
        const visual = hasOwnNullableField(parsed, 'visualStyleId')
          ? getStyleSelectionKeyById(
            'visual',
            parsed.visualStyleId,
            displayedStylesByCategoryRef.current.visual,
          )
          : current.visual
        const tone = hasOwnNullableField(parsed, 'toneStyleId')
          ? getStyleSelectionKeyById(
            'tone',
            parsed.toneStyleId,
            displayedStylesByCategoryRef.current.tone,
          )
          : current.tone
        if (visual === current.visual && tone === current.tone) return current
        return {
          ...current,
          visual,
          tone,
        }
      })
      const parsedTitle = parsed.title?.trim()
      if (parsedTitle && !name.trim()) {
        setName(parsedTitle.slice(0, MAX_NAME_LENGTH))
      }

      const parsedRatio = parsed.videoRatio?.trim()
      if (parsedRatio && ratioOptions.includes(parsedRatio)) {
        setRatio(parsedRatio)
      }

      message.success(l('剧本解析完成', 'Script parsed'))
    } catch (error) {
      message.error(getApiErrorMessage(error, l('剧本解析失败', 'Script parsing failed')))
    } finally {
      setParsingScript(false)
    }
  }

  const basicInfoFileName = importedFileName.trim() || toManualScriptFileName(name)
  const basicInfoFileType = importedFileType.trim() || getScriptFileType(basicInfoFileName)
  const hasBasicInfoContent = Boolean(
    name.trim()
    || script.length
    || importedFileName.trim()
    || scriptImportId !== null
  )
  const hasUnsavedBasicInfo = (hasBasicInfoContent && basicInfoTouched)
    || (restoredDraftNeedsFullHydration && (restoringLocalDraft || localDraftRestoreFailed))

  const validateBasicInfo = () => {
    if (restoringLocalDraft) {
      message.info(l('正在恢复本地草稿，请稍候', 'The local draft is still being restored'))
      return false
    }
    if (localDraftRestoreFailed) {
      message.warning(l('完整本地草稿恢复失败，请先重试', 'The complete local draft failed to restore. Retry first.'))
      return false
    }
    if (restoringBasicInfo) {
      message.info(l('正在恢复剧本基本信息，请稍候', 'Script information is still being restored'))
      return false
    }
    if (basicInfoRestoreFailed) {
      message.warning(l('剧本基本信息恢复失败，请先重试', 'Script information failed to restore. Retry first.'))
      return false
    }
    if (parsingScript) {
      message.info(l('正在解析剧本，请稍候', 'The script is still being parsed'))
      return false
    }
    if (!name.trim()) {
      message.warning(l('请输入作品名称', 'Enter a project name'))
      return false
    }
    if (!script.trim()) {
      message.warning(l('请输入剧本原文', 'Enter the script'))
      return false
    }
    if (studioStyleOptionsLoading) {
      message.info(l('正在加载风格选项，请稍候', 'Style options are still loading'))
      return false
    }
    if (studioStyleOptionsError) {
      message.warning(l('风格选项加载失败，请先重试', 'Style options failed to load. Retry first.'))
      return false
    }
    if (!selectedVisualStyle || !selectedToneStyle) {
      message.warning(l('请选择画面风格和影调风格', 'Select both a visual style and a tone style'))
      return false
    }
    return true
  }

  const buildBasicInfoConfirmRequest = () => {
    return {
      id: scriptImportId,
      fileName: basicInfoFileName,
      fileType: basicInfoFileType,
      title: name.trim(),
      videoRatio: ratio,
      rawText: script,
      targetMarket,
      visualStyleId: selectedVisualStyleId,
      toneStyleId: selectedToneStyleId,
    }
  }

  const buildBasicInfoSaveRequest = () => {
    return {
      id: scriptImportId,
      sourceFileName: basicInfoFileName,
      fileType: basicInfoFileType,
      title: name.trim(),
      rawText: script,
      videoRatio: ratio,
      targetMarket,
      visualStyleId: selectedVisualStyleId,
      toneStyleId: selectedToneStyleId,
    }
  }

  const handleEnterEpisodes = async () => {
    if (basicInfoSubmissionRef.current || !validateBasicInfo()) return

    basicInfoSubmissionRef.current = true
    setSubmitting(true)
    clearStoryboardRestorePoint()
    let requestStage: 'confirm' | 'chapters' = 'confirm'
    try {
      const submissionEditRevision = basicInfoEditRevisionRef.current
      const requestBody = buildBasicInfoConfirmRequest()
      const reusableConfirmation = confirmedBasicInfoRef.current?.editRevision === submissionEditRevision
        ? confirmedBasicInfoRef.current
        : null
      let confirmedImportId = reusableConfirmation?.importId

      if (confirmedImportId === undefined) {
        const confirmed = await StudioScriptsApi.confirmBasicInfo(requestBody)
        confirmedImportId = confirmed.id ?? requestBody.id ?? undefined
        if (confirmedImportId === undefined) {
          throw new Error(l(
            '基础信息确认成功，但接口未返回剧本导入 ID，无法查询分集',
            'Basic information was confirmed, but no script import ID was returned.',
          ))
        }

        const confirmedAiModelId = getScriptAiModelId(confirmed) ?? aiModelId
        const confirmedDetail: StudioScriptParseResult = {
          ...confirmed,
          id: confirmedImportId,
          aiModelId: confirmedAiModelId,
          currentStep: Math.max(2, Number(confirmed.currentStep) || 0),
          fileName: confirmed.fileName?.trim() || requestBody.fileName,
          fileType: confirmed.fileType?.trim() || requestBody.fileType,
          title: confirmed.title ?? requestBody.title,
          rawText: (confirmed.rawText ?? requestBody.rawText).slice(0, MAX_SCRIPT_LENGTH),
          videoRatio: confirmed.videoRatio ?? requestBody.videoRatio,
          targetMarket: confirmed.targetMarket ?? requestBody.targetMarket,
          visualStyleId: hasOwnNullableField(confirmed, 'visualStyleId')
            ? confirmed.visualStyleId
            : requestBody.visualStyleId,
          toneStyleId: hasOwnNullableField(confirmed, 'toneStyleId')
            ? confirmed.toneStyleId
            : requestBody.toneStyleId,
          visualStyleName: confirmed.visualStyleName?.trim()
            || confirmed.visualStyleCode?.trim()
            || visualStyleName,
          toneStyleName: confirmed.toneStyleName?.trim()
            || confirmed.toneStyleCode?.trim()
            || toneStyleName,
        }

        setScriptImportId(confirmedImportId)
        setAiModelId(confirmedAiModelId)
        confirmedBasicInfoRef.current = {
          importId: confirmedImportId,
          editRevision: submissionEditRevision,
        }
        if (basicInfoEditRevisionRef.current === submissionEditRevision) {
          resetBasicInfoTouched()
        }
        primeScriptImportDetail(confirmedImportId, confirmedDetail)
        invalidateScriptImportChapters(confirmedImportId)
      }

      if (basicInfoEditRevisionRef.current !== submissionEditRevision) {
        message.info(l(
          '基础信息在提交期间发生了变化，请再次点击“下一步”确认最新内容',
          'Basic information changed while submitting. Click “Next” again to confirm the latest content.',
        ))
        return
      }

      requestStage = 'chapters'
      const chapters = await StudioScriptsApi.getChapters(confirmedImportId)
      if (basicInfoEditRevisionRef.current !== submissionEditRevision) {
        message.info(l(
          '基础信息在提交期间发生了变化，请再次点击“下一步”确认最新内容',
          'Basic information changed while submitting. Click “Next” again to confirm the latest content.',
        ))
        return
      }
      if (!chapters.length) {
        invalidateScriptImportChapters(confirmedImportId)
        message.warning(l(
          '基础信息已确认，分集数据尚未生成，请稍后点击“下一步”重试',
          'Basic information was confirmed, but episodes are not ready yet. Click “Next” to retry shortly.',
        ))
        return
      }
      primeScriptImportChapters(confirmedImportId, chapters)
      const cachedConfirmedDetail = readCachedScriptImportDetail(confirmedImportId)
      if (cachedConfirmedDetail) {
        primeScriptImportDetail(confirmedImportId, {
          ...cachedConfirmedDetail,
          id: confirmedImportId,
          currentStep: Math.max(2, Number(cachedConfirmedDetail.currentStep) || 0),
          chapters,
        })
      }

      const nextEpisodes = toEpisodeDrafts(
        chapters,
        (episodeNumber) => l(`第${episodeNumber}集`, `Episode ${episodeNumber}`),
      )
      setEpisodes(nextEpisodes)
      setActiveEpisodeIndex(0)
      setRestoringImport(false)
      setCurrentStep(1)
    } catch (error) {
      message.error(getApiErrorMessage(
        error,
        requestStage === 'chapters'
          ? l('基础信息已确认，但分集数据加载失败，请点击“下一步”重试', 'Basic information was confirmed, but episodes failed to load. Click “Next” to retry.')
          : l('剧本基本信息确认失败', 'Failed to confirm script information'),
      ))
    } finally {
      basicInfoSubmissionRef.current = false
      setSubmitting(false)
    }
  }

  const clearLocalProjectDrafts = async () => {
    const releaseDraftWriteHold = holdProjectCreationDraftWrites()
    persistDraftOnUnmountRef.current = false
    projectDraftPersistEnabledRef.current = false
    const cleared = await clearProjectCreationDrafts()
    if (!cleared) {
      releaseDraftWriteHold()
      persistDraftOnUnmountRef.current = true
      projectDraftPersistEnabledRef.current = !restoringLocalDraft && !localDraftRestoreFailed
      message.error(l(
        '未能确认本地草稿已完全清除，已停止退出，请重试',
        'The local draft could not be confirmed as fully cleared. Exit was stopped; retry.',
      ))
      return null
    }
    clearStoryboardRestorePointSnapshot()
    return releaseDraftWriteHold
  }

  const leaveProjectCreation = async () => {
    const releaseDraftWriteHold = await clearLocalProjectDrafts()
    if (!releaseDraftWriteHold) return
    setExitConfirmOpen(false)
    navigate('/projects')
    const fallbackReleaseTimer = window.setTimeout(releaseDraftWriteHold, 1000)
    window.requestAnimationFrame(() => {
      window.clearTimeout(fallbackReleaseTimer)
      window.setTimeout(releaseDraftWriteHold, 0)
    })
  }

  const confirmDiscardFailedLocalDraft = () => {
    Modal.confirm({
      centered: true,
      title: l('放弃此本地草稿？', 'Discard this local draft?'),
      content: l(
        '完整正文无法恢复。放弃后会清除本机中的这份草稿并重新开始，此操作不可撤销。',
        'The complete content could not be restored. Discarding clears this local draft and starts over. This cannot be undone.',
      ),
      okText: l('放弃并重新开始', 'Discard and restart'),
      cancelText: l('取消', 'Cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const releaseDraftWriteHold = await clearLocalProjectDrafts()
        if (!releaseDraftWriteHold) {
          throw new Error('Failed to clear the local project draft')
        }
        // 页面销毁前保持冻结，防止 pagehide/unmount 再次写回刚删除的草稿。
        window.location.reload()
      },
    })
  }

  const handleSaveAndExit = async () => {
    if (basicInfoSubmissionRef.current || !validateBasicInfo()) return

    basicInfoSubmissionRef.current = true
    setSubmitting(true)
    clearStoryboardRestorePoint()
    try {
      const requestBody = buildBasicInfoSaveRequest()
      const saved = await StudioScriptsApi.saveBasicInfo(requestBody)
      const persistedId = saved?.id ?? scriptImportId
      if (persistedId === null || persistedId === undefined) {
        throw new Error(l(
          '基础信息已保存，但接口未返回剧本导入 ID',
          'Basic information was saved, but no script import ID was returned.',
        ))
      }
      setScriptImportId(persistedId)
      primeScriptImportDetail(persistedId, {
        ...saved,
        id: persistedId,
        aiModelId: getScriptAiModelId(saved) ?? aiModelId,
        currentStep: Math.max(1, Number(saved?.currentStep) || 0),
        fileName: saved?.fileName?.trim() || requestBody.sourceFileName,
        fileType: saved?.fileType ?? requestBody.fileType,
        title: saved?.title ?? requestBody.title,
        rawText: (saved?.rawText ?? requestBody.rawText).slice(0, MAX_SCRIPT_LENGTH),
        videoRatio: saved?.videoRatio ?? requestBody.videoRatio,
        targetMarket: saved?.targetMarket ?? requestBody.targetMarket,
        visualStyleId: hasOwnNullableField(saved, 'visualStyleId')
          ? saved?.visualStyleId
          : requestBody.visualStyleId,
        toneStyleId: hasOwnNullableField(saved, 'toneStyleId')
          ? saved?.toneStyleId
          : requestBody.toneStyleId,
        visualStyleName: saved?.visualStyleName?.trim()
          || saved?.visualStyleCode?.trim()
          || visualStyleName,
        toneStyleName: saved?.toneStyleName?.trim()
          || saved?.toneStyleCode?.trim()
          || toneStyleName,
      })
      invalidateScriptImportChapters(persistedId)
      resetBasicInfoTouched()
      message.success(l('基础信息已保存', 'Basic information saved'))
      await leaveProjectCreation()
    } catch (error) {
      message.error(getApiErrorMessage(error, l('保存基础信息失败', 'Failed to save basic information')))
    } finally {
      basicInfoSubmissionRef.current = false
      setSubmitting(false)
    }
  }

  const resetEpisodeImport = () => {
    episodeImportEditRevisionRef.current += 1
    setEpisodeImportOpen(false)
    setEpisodeImportText('')
    setEpisodeImportFileName('')
  }

  const closeEpisodeImport = () => {
    if (
      parsingEpisodeFile
      || creatingEpisode
      || chapterRefreshPending
      || chapterSubmissionRef.current
      || pendingChapterCreationRef.current
    ) return
    resetEpisodeImport()
  }

  const handleEpisodeFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (
      !file
      || submitting
      || assetSubmissionRef.current
      || chapterRefreshPending
      || pendingChapterCreationRef.current
    ) return

    setEpisodeImportFileName(file.name)
    setParsingEpisodeFile(true)
    try {
      const parsed = await StudioScriptsApi.parseChapterFile(file)
      const parsedText = parsed.rawText ?? ''
      setEpisodeImportFileName(parsed.fileName?.trim() || file.name)
      episodeImportEditRevisionRef.current += 1
      setEpisodeImportText(parsedText.slice(0, MAX_SCRIPT_LENGTH))
      if (!parsedText.trim()) {
        message.warning(l('解析完成，但未返回剧本内容', 'Parsing completed, but no script content was returned'))
        return
      }
      message.success(l('剧本解析完成', 'Script parsed'))
    } catch (error) {
      message.error(getApiErrorMessage(error, l('剧本解析失败', 'Failed to parse script')))
    } finally {
      setParsingEpisodeFile(false)
    }
  }

  const handleImportEpisodes = async () => {
    if (chapterSubmissionRef.current) return
    if (submitting || assetSubmissionRef.current) {
      message.info(l('资产提取正在提交，请稍候', 'Asset extraction is being submitted. Please wait.'))
      return
    }
    if (restoringLocalDraft || restoringImport) {
      message.info(l('正在恢复分集数据，请稍候', 'Episodes are still being restored'))
      return
    }
    if (scriptImportId === null) {
      message.warning(l('缺少剧本导入 ID，请重新解析剧本', 'Missing script import ID. Parse the script again.'))
      return
    }
    const importKey = String(scriptImportId)
    const currentPendingCreation = pendingChapterCreationRef.current?.scriptImportId === importKey
      ? pendingChapterCreationRef.current
      : null
    if (!episodeImportText.trim() && !currentPendingCreation) {
      message.warning(l('请输入剧集内容', 'Enter episode content'))
      return
    }

    chapterSubmissionRef.current = true
    setCreatingEpisode(true)
    chapterRestoreRequestRef.current += 1
    const submissionEditRevision = episodeImportEditRevisionRef.current
    let requestStage: 'create' | 'list' = 'create'

    const refreshCreatedChapters = async (pending: PendingChapterCreation) => {
      const chapters = await StudioScriptsApi.getChapters(scriptImportId)
      const returnedChapterIds = new Set(chapters
        .map((chapter) => chapter.id)
        .filter((id): id is StudioScriptImportId => id !== null && id !== undefined)
        .map(String))
      const previousEpisodeIds = new Set(pending.previousEpisodeIds)
      const creationVisible = pending.createdChapterIds.length > 0
        ? pending.createdChapterIds.every((id) => returnedChapterIds.has(id))
        : chapters.length > previousEpisodeIds.size
          || [...returnedChapterIds].some((id) => !previousEpisodeIds.has(id))

      if (!creationVisible) {
        throw new Error(l(
          '剧集已提交，但列表尚未更新，请稍后重试刷新',
          'The episode was submitted, but the list is not updated yet. Retry shortly.',
        ))
      }

      primeScriptImportChapters(scriptImportId, chapters)
      const cachedImportDetail = readCachedScriptImportDetail(scriptImportId)
      if (cachedImportDetail) {
        primeScriptImportDetail(scriptImportId, {
          ...cachedImportDetail,
          chapters,
        })
      }
      const nextEpisodes = toEpisodeDrafts(
        chapters,
        (episodeNumber) => l(`第${episodeNumber}集`, `Episode ${episodeNumber}`),
      )
      const createdChapterIds = new Set(pending.createdChapterIds)
      const createdEpisodeIndex = nextEpisodes.findIndex((episode) =>
        createdChapterIds.has(episode.id))
      const appendedEpisodeIndex = nextEpisodes.findIndex((episode) =>
        !previousEpisodeIds.has(episode.id))
      setEpisodes(nextEpisodes)
      setActiveEpisodeIndex(createdEpisodeIndex >= 0
        ? createdEpisodeIndex
        : appendedEpisodeIndex >= 0
          ? appendedEpisodeIndex
          : Math.max(0, nextEpisodes.length - 1))
      return nextEpisodes
    }

    try {
      let baseEpisodes = episodes
      const pendingCreation = pendingChapterCreationRef.current?.scriptImportId === importKey
        ? pendingChapterCreationRef.current
        : null
      if (pendingCreation) {
        requestStage = 'list'
        baseEpisodes = await refreshCreatedChapters(pendingCreation)
        clearPendingChapterCreation(pendingCreation)
        if (pendingCreation.editRevision === submissionEditRevision) {
          resetEpisodeImport()
          message.success(l('剧集已新增', 'Episode added'))
          return
        }
      }

      requestStage = 'create'
      const previousEpisodeIds = new Set(baseEpisodes.map((episode) => episode.id))
      const createdChapters = await StudioScriptsApi.createChapter({
        scriptImportId,
        rawText: episodeImportText,
      })
      const createdChapterIds = createdChapters
        .map((chapter) => chapter.id)
        .filter((id): id is StudioScriptImportId => id !== null && id !== undefined)
        .map(String)
        .filter((id) => !previousEpisodeIds.has(id))
      const nextPendingCreation: PendingChapterCreation = {
        scriptImportId: importKey,
        editRevision: submissionEditRevision,
        previousEpisodeIds: [...previousEpisodeIds],
        createdChapterIds,
      }
      pendingChapterCreationRef.current = nextPendingCreation
      setChapterRefreshPending(true)

      // create 已经改变了分集，即使后续列表回显失败，也必须重新估算并允许重新提取资产。
      chapterMutationRevisionRef.current += 1
      assetExtractionStartedRef.current = false
      assetEstimateRequestRevisionRef.current += 1
      clearStoryboardRestorePoint()
      StudioScriptsApi.invalidateAssetExtractEstimate(scriptImportId)
      setAssetExtractEstimate(null)
      setAssetExtractEstimateLoading(false)
      setAssetExtractEstimateError(undefined)
      setAssetExtractEstimateRetryToken((current) => current + 1)
      setAssetEpisodes(null)
      setAssetEpisodesError(undefined)
      invalidateScriptImportChapters(scriptImportId)
      requestStage = 'list'
      await refreshCreatedChapters(nextPendingCreation)
      clearPendingChapterCreation(nextPendingCreation)
      resetEpisodeImport()
      message.success(l('剧集已新增', 'Episode added'))
    } catch (error) {
      message.error(getApiErrorMessage(
        error,
        requestStage === 'list'
          ? l('剧集已新增，但列表刷新失败，请重试', 'The episode was added, but the list refresh failed. Retry.')
          : l('新增剧集失败', 'Failed to add episode'),
      ))
    } finally {
      chapterSubmissionRef.current = false
      setCreatingEpisode(false)
    }
  }

  const handleExtractAssets = async () => {
    if (assetSubmissionRef.current) return
    if (chapterSubmissionRef.current || creatingEpisode) {
      message.info(l('新增剧集正在提交，请稍候', 'New episodes are being submitted. Please wait.'))
      return
    }
    if (chapterRefreshPending || pendingChapterCreationRef.current) {
      message.info(l('请先重试刷新新增剧集', 'Retry refreshing the newly added episodes first.'))
      return
    }
    if (restoringLocalDraft || restoringBasicInfo || basicInfoRestoreFailed) {
      message.info(l('请先恢复完整的剧本基本信息', 'Restore the complete script information first.'))
      return
    }
    if (!episodes.length || episodes.some((episode) => !episode.rawText.trim())) {
      message.warning(l('请填写每一集的剧本内容', 'Enter script content for every episode'))
      return
    }
    const extractScriptImportId = scriptImportId
    if (extractScriptImportId === null) {
      message.warning(l(
        '缺少剧本导入 ID，无法提取资产',
        'The script import ID is missing, so assets cannot be extracted.',
      ))
      return
    }

    const extractionChapterRevision = chapterMutationRevisionRef.current
    assetSubmissionRef.current = true
    setSubmitting(true)
    clearStoryboardRestorePoint()
    try {
      setAssetEpisodes(null)
      setAssetEpisodesError(undefined)

      if (!assetExtractionStartedRef.current) {
        await StudioScriptsApi.extractAssets({
          scriptImportId: extractScriptImportId,
        })
        if (chapterMutationRevisionRef.current !== extractionChapterRevision) {
          assetExtractionStartedRef.current = false
          message.info(l(
            '分集已发生变化，请重新点击下一步提取最新资产',
            'Episodes changed. Click Next again to extract the latest assets.',
          ))
          return
        }
        assetExtractionStartedRef.current = true
      }

      const cachedImportDetail = readCachedScriptImportDetail(extractScriptImportId)
      primeScriptImportDetail(extractScriptImportId, {
        ...cachedImportDetail,
        id: extractScriptImportId,
        aiModelId: aiModelId ?? getScriptAiModelId(cachedImportDetail),
        currentStep: Math.max(3, Number(cachedImportDetail?.currentStep) || 0),
        fileName: importedFileName.trim() || toManualScriptFileName(name),
        fileType: importedFileType.trim() || getScriptFileType(importedFileName),
        title: name,
        rawText: script,
        videoRatio: ratio,
        targetMarket,
        visualStyleId: selectedVisualStyleId,
        toneStyleId: selectedToneStyleId,
        visualStyleName,
        toneStyleName,
        chapters: cachedImportDetail?.chapters
          ?? readCachedScriptImportChapters(extractScriptImportId),
      })

      setCurrentStep(2)
      message.success(l(
        '资产提取已提交，正在加载资产分集',
        'Asset extraction submitted. Loading asset episodes.',
      ))
    } catch (error) {
      setAssetExtractEstimate(null)
      setAssetExtractEstimateRetryToken((current) => current + 1)
      message.error(getApiErrorMessage(
        error,
        l('资产提取失败，请稍后重试', 'Asset extraction failed. Please try again.'),
      ))
    } finally {
      assetSubmissionRef.current = false
      setSubmitting(false)
    }
  }

  const steps = [
    l('基本信息', 'Basics'),
    l('剧本分集', 'Episodes'),
    l('资产确认', 'Assets'),
    l('片段编辑', 'Editing'),
  ]

  const handleCustomStyleApply = async (draft: CustomStyleDraft) => {
    try {
      let coverUrl = ''
      if (draft.previewDataUrl) {
        const coverFile = await createCoverUploadFile(draft.previewDataUrl)
        const uploadedCover = await StudioStylesApi.uploadCustomCover(coverFile)
        coverUrl = uploadedCover.url.trim()
      }
      const customStyleCategory = styleCategory
      const customStyleType = customStyleCategory === 'visual' ? 1 : 2
      const created = await StudioStylesApi.createCustom({
        styleType: customStyleType,
        name: draft.name.trim(),
        promptTemplate: draft.prompt.trim(),
        description: draft.description.trim(),
        coverUrl,
        publicOption: true,
        sortOrder: 1,
      })
      const value = created.name?.trim() || draft.name.trim()
      markBasicInfoTouched()
      if (created.id !== null && created.id !== undefined) {
        const createdStyleKey = `${customStyleType}:${created.id}`
        selectedStyleKeysRef.current = {
          ...selectedStyleKeysRef.current,
          [customStyleCategory]: createdStyleKey,
        }
        setSelectedStyleKeys((current) => ({
          ...current,
          [customStyleCategory]: createdStyleKey,
        }))
        setSelectedStyleNames((current) => ({
          ...current,
          [customStyleCategory]: value,
        }))
      }
      setCustomStyleModalOpen(false)
      message.success(l('\u81ea\u5b9a\u4e49\u98ce\u683c\u5df2\u521b\u5efa\u5e76\u5e94\u7528', 'Custom style created and applied'))
      void refreshStudioStyleOptions().then((nextOptions) => {
        const createdOption = nextOptions[customStyleCategory].find((item) =>
          (created.id !== null && created.id !== undefined && String(item.id) === String(created.id))
          || item.name.trim() === value)
        if (!createdOption) return
        const createdStyleKey = `${createdOption.styleType}:${createdOption.id}`
        if (selectedStyleKeysRef.current[customStyleCategory] === createdStyleKey) return
        markBasicInfoTouched()
        selectedStyleKeysRef.current = {
          ...selectedStyleKeysRef.current,
          [customStyleCategory]: createdStyleKey,
        }
        setSelectedStyleKeys((current) => ({
          ...current,
          [customStyleCategory]: createdStyleKey,
        }))
        setSelectedStyleNames((current) => ({
          ...current,
          [customStyleCategory]: createdOption.name.trim(),
        }))
      }).catch(() => undefined)
    } catch (error) {
      message.error(getApiErrorMessage(
        error,
        l('\u81ea\u5b9a\u4e49\u98ce\u683c\u521b\u5efa\u5931\u8d25', 'Failed to create custom style'),
      ))
    }
  }

  // 输入阶段只做 O(1) 的长度判断；全空白校验留到用户点击提交时执行。
  const hasRequiredBasicInfo = Boolean(name.trim() && script.length && ratio)
  const styleSelectionReady = !studioStyleOptionsLoading
    && !studioStyleOptionsError
    && Boolean(selectedVisualStyle && selectedToneStyle)
  const assetEstimatePending = currentStep === 1
    && !assetExtractEstimateError
    && (assetExtractEstimateLoading || !assetExtractEstimate)
  const requiredCreditsText = assetExtractEstimate
    ? Number(assetExtractEstimate.requiredCredits).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })
    : ''
  const assetEstimateErrorMessage = assetExtractEstimateError
    ? getApiErrorMessage(
      assetExtractEstimateError,
      l('资产提取积分估算失败，点击重试', 'Credit estimation failed. Click to retry.'),
    )
    : ''
  const assetStepReady = !assetEpisodesLoading
    && !assetEpisodesError
    && assetStepEpisodes.length > 0
  const canProceed = currentStep === 2
    ? !restoringLocalDraft
      && !localDraftRestoreFailed
      && assetStepReady
      && !assetImageSubmissionPending
      && !assetCompletionCheckPending
      && !assetConfirmPending
    : !restoringLocalDraft
      && !localDraftRestoreFailed
      && !restoringBasicInfo
      && !basicInfoRestoreFailed
      && (currentStep === 0
        ? styleSelectionReady && hasRequiredBasicInfo
        : currentStep === 1
          ? !restoringImport
            && !chapterRefreshPending
            && episodes.length > 0
            && episodes.every((episode) => episode.title.trim() && episode.rawText.trim())
          : currentStep === 3
            ? styleSelectionReady
              && !storyboardEditorLoading
              && !storyboardEditorError
              && storyboardClips.length > 0
            : true)

  const handleNext = async () => {
    if (currentStep === 0) {
      void handleEnterEpisodes()
      return
    }
    if (currentStep === 1) {
      if (!assetExtractEstimate) {
        setAssetExtractEstimateError(undefined)
        setAssetExtractEstimateRetryToken((current) => current + 1)
        return
      }
      void handleExtractAssets()
      return
    }
    if (currentStep === 2) {
      if (scriptImportId === null || assetCompletionRequestRef.current || assetConfirmRequestRef.current) return
      const targetEpisodeId = selectedAssetEpisodeId
      if (!targetEpisodeId) {
        message.warning(l('请先选择要进入片段编辑的剧集', 'Choose an episode before entering clip editing.'))
        return
      }
      setStoryboardEpisodeId(String(targetEpisodeId))
      setStoryboardRunId(null)
      setStoryboardEditor(null)
      setStoryboardEditorError(undefined)

      // Confirm once on demand: users need not visit overview after completing episodes.
      const request = StudioAssetGenerationApi.requestEpisodeAssetsGenerateStatus({
        scriptImportId,
        episodeId: targetEpisodeId,
      })
      assetCompletionRequestRef.current = request
      setAssetCompletionCheckPending(true)
      let confirmRequest: StudioAssetImageTaskRequest<StudioEpisodeAssetsConfirmResult> | null = null
      try {
        const status = await request.promise
        if (assetCompletionRequestRef.current !== request) return
        if (!status.allGenerated) {
          message.warning(l(
            '资产还没有生成完，请先完成全部资产生成后再进入下一步',
            'Assets are not fully generated yet. Please finish generating all assets before continuing.',
          ))
          return
        }
        confirmRequest = StudioAssetGenerationApi.requestEpisodeAssetsConfirm({
          scriptImportId,
          episodeId: targetEpisodeId,
        })
        assetConfirmRequestRef.current = confirmRequest
        setAssetConfirmPending(true)
        const confirmed = await confirmRequest.promise
        if (assetConfirmRequestRef.current !== confirmRequest) return
        assetConfirmRequestRef.current = null
        const confirmedRunId = confirmed.runId ?? confirmed.editor?.storyboard?.runId
        if (confirmedRunId === null || confirmedRunId === undefined || String(confirmedRunId).trim() === '') {
          throw new Error(l('资产确认成功，但未返回分镜任务ID', 'Assets were confirmed but no storyboard run id was returned.'))
        }
        setStoryboardEpisodeId(String(targetEpisodeId))
        setStoryboardRunId(confirmedRunId)
        setStoryboardEditor(null)
        setStoryboardEditorError(undefined)
        setStoryboardEditorRetryToken((current) => current + 1)
        navigateToWorkflowStep(3)
      } catch (error) {
        if (assetCompletionRequestRef.current !== request) return
        message.error(getApiErrorMessage(
          error,
          confirmRequest
            ? l('资产确认失败，请重试', 'Asset confirmation failed; retry')
            : l('资产完成状态查询失败，请重试', 'Unable to verify asset completion; retry'),
        ))
      } finally {
        if (assetCompletionRequestRef.current === request) {
          assetCompletionRequestRef.current = null
          setAssetCompletionCheckPending(false)
        }
        if (confirmRequest && assetConfirmRequestRef.current === confirmRequest) {
          assetConfirmRequestRef.current = null
        }
        setAssetConfirmPending(false)
      }
      return
    }
    if (currentStep === 3) message.info(l('剪辑表导出功能待接入', 'Export is not connected yet'))
  }

  const handleReturnToAssets = () => {
    setAssetEpisodes(null)
    setAssetEpisodesError(undefined)
    setAssetEpisodesRetryToken((current) => current + 1)
    clearStoryboardRestorePoint()
    navigateToWorkflowStep(2)
  }

  const handleAssetScopeChange = useCallback((scope: string) => {
    setAssetStepScope(scope)
    clearStoryboardRestorePoint()
  }, [clearStoryboardRestorePoint])

  const workflowDataUnavailable = currentStep === 2
    ? (
      assetEpisodesLoading
      || Boolean(assetEpisodesError)
      || assetEpisodes === null
      || assetStepEpisodes.length === 0
    )
    : restoringLocalDraft
      || localDraftRestoreFailed
      || restoringBasicInfo
      || basicInfoRestoreFailed
      || (currentStep === 3 && !styleSelectionReady)
      || (currentStep === 3 && (
        storyboardEditorLoading
        || Boolean(storyboardEditorError)
        || storyboardEditor === null
        || storyboardClips.length === 0
      ))
      || ((currentStep === 1 || currentStep === 3) && (
        restoringImport
        || episodes.length === 0
      ))
  const renderWorkflowRestoreState = () => {
    if (restoringLocalDraft) {
      return (
        <div className="project-create-page__restore-state" role="status">
          <Spin />
          <span>{l('正在恢复本地草稿...', 'Restoring local draft...')}</span>
        </div>
      )
    }
    if (localDraftRestoreFailed) {
      return (
        <div className="project-create-page__restore-state is-empty" role="alert">
          <span>{l('完整本地草稿恢复失败，已暂停自动保存以保护原草稿', 'The complete local draft failed to restore. Autosave is paused to protect it.')}</span>
          <Button onClick={() => setLocalDraftRestoreRetryToken((current) => current + 1)}>
            {l('重试恢复草稿', 'Retry draft restoration')}
          </Button>
          <Button danger onClick={confirmDiscardFailedLocalDraft}>
            {l('放弃此草稿', 'Discard draft')}
          </Button>
        </div>
      )
    }
    if (currentStep === 2 && assetEpisodesError) {
      return (
        <div className="project-create-page__restore-state is-empty" role="alert">
          <span>{getApiErrorMessage(
            assetEpisodesError,
            l('资产分集加载失败', 'Failed to load asset episodes'),
          )}</span>
          <Button onClick={() => {
            setAssetEpisodesError(undefined)
            setAssetEpisodes(null)
            setAssetEpisodesRetryToken((current) => current + 1)
          }}>
            {l('重试加载资产分集', 'Retry asset episodes')}
          </Button>
        </div>
      )
    }
    if (currentStep === 2 && (assetEpisodesLoading || assetEpisodes === null)) {
      return (
        <div className="project-create-page__restore-state" role="status">
          <Spin />
          <span>{l('正在加载资产分集...', 'Loading asset episodes...')}</span>
        </div>
      )
    }
    if (currentStep === 2 && assetStepEpisodes.length === 0) {
      return (
        <div className="project-create-page__restore-state is-empty">
          <span>{l('暂无资产分集数据', 'No asset episode data')}</span>
          <Button onClick={() => {
            setAssetEpisodes(null)
            setAssetEpisodesRetryToken((current) => current + 1)
          }}>
            {l('重试加载资产分集', 'Retry asset episodes')}
          </Button>
        </div>
      )
    }
    if (restoringBasicInfo) {
      return (
        <div className="project-create-page__restore-state" role="status">
          <Spin />
          <span>{l('正在恢复剧本基本信息...', 'Restoring script information...')}</span>
        </div>
      )
    }
    if (basicInfoRestoreFailed) {
      return (
        <div className="project-create-page__restore-state is-empty" role="alert">
          <span>{l('剧本基本信息恢复失败', 'Failed to restore script information')}</span>
          <Button onClick={() => setBasicInfoRestoreRetryToken((current) => current + 1)}>
            {l('重试恢复基本信息', 'Retry script information')}
          </Button>
        </div>
      )
    }
    if (restoringImport) {
      return (
        <div className="project-create-page__restore-state" role="status">
          <Spin />
          <span>{l('正在恢复分集数据...', 'Restoring episodes...')}</span>
        </div>
      )
    }
    if (currentStep === 3 && studioStyleOptionsLoading) {
      return (
        <div className="project-create-page__restore-state" role="status">
          <Spin />
          <span>{l('正在加载风格选项...', 'Loading style options...')}</span>
        </div>
      )
    }
    if (currentStep === 3 && studioStyleOptionsError) {
      return (
        <div className="project-create-page__restore-state is-empty" role="alert">
          <span>{l('风格选项加载失败', 'Failed to load style options')}</span>
          <Button onClick={() => void refreshStudioStyleOptions().catch(() => undefined)}>
            {l('重试加载风格', 'Retry styles')}
          </Button>
        </div>
      )
    }
    if (currentStep === 3 && (!selectedVisualStyle || !selectedToneStyle)) {
      return (
        <div className="project-create-page__restore-state is-empty" role="alert">
          <span>{l('原风格已不可用，请重新选择', 'A saved style is no longer available.')}</span>
          <Button onClick={() => {
            clearStoryboardRestorePoint()
            navigateToWorkflowStep(0)
          }}>
            {l('返回基本信息', 'Return to Basics')}
          </Button>
        </div>
      )
    }
    if (currentStep === 3 && storyboardEditorError) {
      return (
        <div className="project-create-page__restore-state is-empty" role="alert">
          <span>{getApiErrorMessage(
            storyboardEditorError,
            l('片段编辑数据加载失败，请重试', 'Failed to load clip editing data; retry'),
          )}</span>
          <Button onClick={() => {
            setStoryboardEditorError(undefined)
            setStoryboardEditorRetryToken((current) => current + 1)
          }}>
            {l('重试加载片段', 'Retry clips')}
          </Button>
        </div>
      )
    }
    if (currentStep === 3 && (storyboardEditorLoading || storyboardEditor === null)) {
      const storyboardProgress = storyboardEditor ? getStoryboardRunProgress(storyboardEditor) : null
      const storyboardStatus = storyboardEditor?.storyboard?.statusName?.trim()
      return (
        <div className="project-create-page__restore-state" role="status">
          <Spin />
          <span>
            {storyboardEditor
              ? `${storyboardStatus || l('正在生成分镜', 'Generating storyboards')}${
                  storyboardProgress === null ? '' : ` ${Math.max(0, Math.min(100, Math.round(storyboardProgress)))}%`
                }`
              : l('正在加载片段编辑数据...', 'Loading clip editing data...')}
          </span>
        </div>
      )
    }
    if (currentStep === 3 && storyboardClips.length === 0) {
      return (
        <div className="project-create-page__restore-state is-empty">
          <span>{l('暂无片段编辑数据', 'No clip editing data')}</span>
          <Button onClick={() => setStoryboardEditorRetryToken((current) => current + 1)}>
            {l('重试加载片段', 'Retry clips')}
          </Button>
        </div>
      )
    }
    return (
      <div className="project-create-page__restore-state is-empty">
        <span>{l('暂无分集数据', 'No episode data')}</span>
        <Button onClick={() => setChapterRestoreRetryToken((current) => current + 1)}>
          {l('重试加载分集', 'Retry episodes')}
        </Button>
      </div>
    )
  }

  return (
    <div
      className="project-create-page"
      style={{
        '--project-create-primary': token.colorPrimary,
        '--project-create-primary-bg': token.colorPrimaryBg,
        '--project-create-primary-hover': token.colorPrimaryHover,
      } as React.CSSProperties}
    >
      <header className="project-create-page__header">
        <div className="project-create-page__header-left">
          <Button
            type="text"
            className="project-create-page__close"
            icon={<CloseOutlined />}
            aria-label={l('返回项目列表', 'Back to projects')}
            disabled={restoringLocalDraft
              || parsingScript
              || submitting
              || creatingEpisode
              || parsingEpisodeFile
              || assetImageSubmissionPending
              || assetCompletionCheckPending
              || assetConfirmPending}
            onClick={() => {
              if (localDraftRestoreFailed) {
                confirmDiscardFailedLocalDraft()
                return
              }
              if (currentStep === 0 && hasUnsavedBasicInfo) {
                setExitConfirmOpen(true)
                return
              }
              void leaveProjectCreation()
            }}
          />
          <ol
            className={`project-create-page__steps${currentStep === 3 ? ' is-final-step' : ''}${currentStep === 3 && stepsExpanded ? ' is-expanded' : ''}`}
            aria-label={l('创建步骤', 'Creation steps')}
          >
            {steps.map((step, index) => (
              <li
                key={step}
                className={`${index === currentStep ? 'is-active' : ''}${index < currentStep ? ' is-complete' : ''}`}
              >
                <button
                  type="button"
                  className="project-create-page__step-button"
                  disabled={restoringLocalDraft
                    || assetImageSubmissionPending
                    || assetCompletionCheckPending
                    || assetConfirmPending
                    || !((currentStep === 2 && index === 1) || (currentStep === 3 && (index === 2 || index === currentStep)))}
                  aria-expanded={currentStep === 3 && index === currentStep ? stepsExpanded : undefined}
                  title={currentStep === 2 && index === 1
                    ? l('返回剧本分集', 'Back to episodes')
                    : currentStep === 3 && index === 2
                      ? l('返回资产确认', 'Back to assets')
                      : currentStep === 3 && index === currentStep
                        ? stepsExpanded
                          ? l('收起步骤', 'Collapse steps')
                          : l('展开步骤', 'Show steps')
                        : undefined}
                  onClick={() => {
                    if (currentStep === 3 && index === currentStep) {
                      setStepsExpanded((current) => !current)
                      return
                    }
                    if (currentStep === 3) {
                      handleReturnToAssets()
                      return
                    }
                    navigateToWorkflowStep(1)
                  }}
                >
                  <span>{index + 1}</span>
                  <strong>{step}</strong>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="project-create-page__header-actions">
          <div
            className="project-create-page__balance"
            aria-label={hasUnlimitedApiQuota
              ? l('余额无限', 'Unlimited balance')
              : l(`余额 ${apiQuotaText}`, `Balance ${apiQuotaText}`)}
          >
            <span className="project-create-page__balance-label">{l('余额', 'Balance')}</span>
            <span className="project-create-page__balance-value">
              <StarFilled />
              <strong>{apiQuotaText}</strong>
            </span>
          </div>
          {currentStep === 3 && (
            <Button onClick={handleReturnToAssets}>{l('上一步', 'Previous')}</Button>
          )}
          <Button
            type="primary"
            icon={<ArrowRightOutlined />}
            iconPosition="end"
            disabled={!canProceed || submitting || parsingScript || creatingEpisode || assetEstimatePending}
            loading={submitting || assetEstimatePending || (currentStep === 2 && (assetEpisodesLoading || assetCompletionCheckPending || assetConfirmPending))}
            title={currentStep === 1
              ? assetEstimateErrorMessage
                || (assetExtractEstimate
                  ? l(
                    `点击后预计消耗 ${requiredCreditsText} 积分`,
                    `Estimated cost on click: ${requiredCreditsText} credits`,
                  )
                  : undefined)
              : undefined}
            onClick={handleNext}
          >
            {currentStep === 3
              ? l('导出剪辑表', 'Export edit list')
              : currentStep === 1 && assetExtractEstimateError
                ? l('重试积分估算', 'Retry estimate')
                : currentStep === 1 && assetExtractEstimate
                  ? (
                    <span className="project-create-page__next-with-cost">
                      <span>{l('下一步', 'Next')}</span>
                      <span className="project-create-page__next-cost">
                        {l('预计', 'Est.')} <StarFilled /> {requiredCreditsText}
                      </span>
                    </span>
                  )
                  : l('下一步', 'Next')}
          </Button>
        </div>
      </header>

      {Boolean(localDraftWriteError) && !restoringLocalDraft && !localDraftRestoreFailed && (
        <div className="project-create-page__draft-warning" role="alert">
          <span>{l(
            '完整草稿未能写入本地数据库，请重试保存；当前页面内容不受影响。',
            'The complete draft could not be saved to the local database. Retry saving; the current page content is unaffected.',
          )}</span>
          <Button size="small" onClick={flushProjectDraft}>
            {l('重试保存草稿', 'Retry draft save')}
          </Button>
        </div>
      )}

      {currentStep === 0 ? <main
        className="project-create-page__main"
        aria-busy={restoringLocalDraft || restoringBasicInfo || parsingScript || submitting}
      >
        <section className="project-create-page__form" aria-label={l('基本信息', 'Basic information')}>
          {restoringLocalDraft ? (
            <div className="project-create-page__basic-restore" role="status">
              <Spin size="small" />
              <span>{l('正在恢复本地草稿...', 'Restoring local draft...')}</span>
            </div>
          ) : localDraftRestoreFailed ? (
            <div className="project-create-page__basic-restore is-error" role="alert">
              <span>{l('完整本地草稿恢复失败，已暂停自动保存', 'The complete local draft failed to restore. Autosave is paused.')}</span>
              <Button
                size="small"
                onClick={() => setLocalDraftRestoreRetryToken((current) => current + 1)}
              >
                {l('重试', 'Retry')}
              </Button>
              <Button danger size="small" onClick={confirmDiscardFailedLocalDraft}>
                {l('放弃草稿', 'Discard')}
              </Button>
            </div>
          ) : restoringBasicInfo ? (
            <div className="project-create-page__basic-restore" role="status">
              <Spin size="small" />
              <span>{l('正在恢复剧本基本信息...', 'Restoring script information...')}</span>
            </div>
          ) : basicInfoRestoreFailed ? (
            <div className="project-create-page__basic-restore is-error" role="alert">
              <span>{l('剧本基本信息恢复失败', 'Failed to restore script information')}</span>
              <Button
                size="small"
                onClick={() => setBasicInfoRestoreRetryToken((current) => current + 1)}
              >
                {l('重试', 'Retry')}
              </Button>
            </div>
          ) : null}
          <label className="project-create-page__field-label" htmlFor="project-create-name">
            {l('作品名称', 'Project name')}
          </label>
          <Input
            id="project-create-name"
            className="project-create-page__name-input"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            disabled={basicInfoInteractionLocked}
            placeholder={l('请输入名称，最多100字', 'Enter a name, up to 100 characters')}
            onChange={(event) => {
              markBasicInfoTouched()
              setName(event.target.value)
            }}
          />

          <label className="project-create-page__field-label project-create-page__script-label" htmlFor="project-create-script">
            {l('剧本原文', 'Script')}
          </label>
          <div className="project-create-page__script-editor">
            <div className="project-create-page__script-toolbar">
              <Button
                icon={<FileAddOutlined />}
                loading={parsingScript}
                disabled={basicInfoInteractionLocked}
                onClick={() => fileInputRef.current?.click()}
              >
                {l('导入剧本', 'Import script')}
              </Button>
              <span>{l('支持 txt、md、doc、docx 文件，每次导入建议不超过10集', 'Supports txt, md, doc and docx; up to 10 episodes per import')}</span>
              {importedFileName && <em title={importedFileName}>{importedFileName}</em>}
              <input
                ref={fileInputRef}
                type="file"
                accept={SCRIPT_IMPORT_ACCEPT}
                hidden
                disabled={basicInfoInteractionLocked}
                onChange={handleFileImport}
              />
            </div>
            <textarea
              id="project-create-script"
              value={script}
              maxLength={MAX_SCRIPT_LENGTH}
              disabled={basicInfoInteractionLocked}
              placeholder={l('请输入剧本内容，需用“第X集”进行集数标注', 'Enter the script and mark episodes with “Episode X” headings')}
              onChange={(event) => {
                markBasicInfoTouched()
                setScript(event.target.value)
              }}
            />
            <div className="project-create-page__script-counter">
              {scriptLength.toLocaleString()} / {MAX_SCRIPT_LENGTH.toLocaleString()}
              <span>{l(`（建议至少${RECOMMENDED_SCRIPT_LENGTH}字）`, ` (${RECOMMENDED_SCRIPT_LENGTH}+ characters recommended)`)}</span>
            </div>
          </div>
        </section>

        <aside className="project-create-page__settings" aria-label={l('画面设置', 'Visual settings')}>
          <section className="project-create-page__setting-section">
            <h2>{l('视频比例', 'Aspect ratio')}</h2>
            <div className="project-create-page__ratios">
              {ratioOptions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={ratio === item ? 'is-selected' : ''}
                  disabled={basicInfoInteractionLocked}
                  onClick={() => {
                    if (item !== ratio) markBasicInfoTouched()
                    setRatio(item)
                  }}
                >
                  <span className="project-create-page__ratio-shape" style={getRatioShape(item)} />
                  <span>{item}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="project-create-page__setting-section project-create-page__style-section">
            <h2>{l('风格选择', 'Visual style')}</h2>
            <div className="project-create-page__style-tabs" role="tablist">
              {styleCategories.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={styleCategory === item.key}
                  className={styleCategory === item.key ? 'is-selected' : ''}
                  disabled={basicInfoInteractionLocked || studioStyleOptionsLoading}
                  onClick={() => {
                    setStyleCategory(item.key)
                  }}
                >
                  <span className="project-create-page__style-tab-label">
                    {item.label}
                    <Tooltip title={item.description} placement="top" overlayStyle={{ maxWidth: 320 }}>
                      <span className="project-create-page__style-tab-help" aria-label={item.description}>?</span>
                    </Tooltip>
                  </span>
                </button>
              ))}
            </div>
            {Boolean(studioStyleOptionsError) && (
              <div className="project-create-page__style-error" role="alert">
                <span>{l('风格选项加载失败', 'Failed to load style options')}</span>
                <Button
                  size="small"
                  loading={studioStyleOptionsLoading}
                  disabled={basicInfoInteractionLocked}
                  onClick={() => void refreshStudioStyleOptions().catch(() => undefined)}
                >
                  {l('重试', 'Retry')}
                </Button>
              </div>
            )}
            <div className="project-create-page__styles is-tile-category" aria-busy={studioStyleOptionsLoading}>
              {displayedStyles.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={selectedStyleKeys[styleCategory] === item.key}
                  className={`project-create-page__style-tile${selectedStyleKeys[styleCategory] === item.key ? ' is-selected' : ''}`}
                  title={item.description || item.label}
                  disabled={basicInfoInteractionLocked || studioStyleOptionsLoading}
                  onClick={() => {
                    if (selectedStyleKeys[styleCategory] !== item.key) markBasicInfoTouched()
                    setSelectedStyleKeys((current) => ({ ...current, [styleCategory]: item.key }))
                    setSelectedStyleNames((current) => ({ ...current, [styleCategory]: item.value }))
                  }}
                >
                  <span
                    className={`project-create-page__style-tile-preview${item.preview === 'empty' ? ' is-empty' : ' project-create-page__style-preview'}`}
                  >
                    {item.coverUrl ? (
                      <img
                        src={item.coverUrl}
                        alt=""
                        aria-hidden="true"
                        className="project-create-page__style-cover"
                      />
                    ) : item.preview === 'empty' ? <StopOutlined /> : null}
                  </span>
                  <span title={item.label}>{item.label}</span>
                </button>
              ))}
              <button
                type="button"
                aria-haspopup="dialog"
                className="project-create-page__style-tile"
                disabled={basicInfoInteractionLocked || studioStyleOptionsLoading}
                onClick={() => setCustomStyleModalOpen(true)}
              >
                <span
                  className={`project-create-page__style-tile-preview is-custom${styleCategory === 'tone' ? ' is-tone-custom' : ''}`}
                >
                  <PlusOutlined />
                </span>
                <span>{l('\u81ea\u5b9a\u4e49', 'Custom')}</span>
              </button>
            </div>
          </section>
        </aside>
      </main> : currentStep > 1 && workflowDataUnavailable ? (
        <main className="project-create-page__episodes">
          <section className="project-create-page__episode-workspace" aria-label={l('工作流恢复', 'Workflow restoration')}>
            {renderWorkflowRestoreState()}
          </section>
        </main>
      ) : currentStep === 1 ? (
        <main className="project-create-page__episodes">
          <aside className="project-create-page__episode-nav" aria-label={l('分集列表', 'Episode list')}>
            <h2>{l('分集', 'Episodes')}</h2>
            <button
              type="button"
              className="project-create-page__episode-add"
              aria-label={l('重新导入剧本', 'Import another script')}
              title={l('重新导入剧本', 'Import another script')}
              disabled={restoringBasicInfo
                || restoringLocalDraft
                || basicInfoRestoreFailed
                || restoringImport
                || submitting
                || creatingEpisode
                || parsingEpisodeFile}
              onClick={() => setEpisodeImportOpen(true)}
            >
              <PlusOutlined />
            </button>
            <div className="project-create-page__episode-list">
              {episodes.map((episode, index) => (
                <button
                  key={episode.id}
                  type="button"
                  className={index === activeEpisodeIndex ? 'is-selected' : ''}
                  aria-label={episode.title}
                  aria-pressed={index === activeEpisodeIndex}
                  onClick={() => setActiveEpisodeIndex(index)}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </aside>

          <section className="project-create-page__episode-workspace" aria-label={l('分集编辑', 'Episode editor')}>
            {activeEpisode && !workflowDataUnavailable ? (
              <div className="project-create-page__episode-editor">
                <Input
                  className="project-create-page__episode-title"
                  value={activeEpisode.title}
                  maxLength={MAX_NAME_LENGTH}
                  readOnly
                  aria-label={l('分集标题', 'Episode title')}
                />
                <textarea
                  value={activeEpisode.rawText}
                  maxLength={MAX_EPISODE_LENGTH}
                  readOnly
                  aria-label={l('分集剧本', 'Episode script')}
                  placeholder={l('请输入本集剧本内容', 'Enter this episode script')}
                />
                <footer>
                  {activeEpisode.rawText.length.toLocaleString()} / {MAX_EPISODE_LENGTH.toLocaleString()}
                </footer>
              </div>
            ) : renderWorkflowRestoreState()}
          </section>
        </main>
      ) : currentStep === 2 ? (
        <ProjectAssetsStep
          key={`asset-import:${scriptImportId ?? 'local'}`}
          scriptImportId={scriptImportId}
          episodes={assetStepEpisodes}
          ratio={ratio}
          styleName={visualStyleName}
          visualStyleNames={visualStyleNames}
          visualStyleOptions={assetVisualStyleOptions}
          onImageSubmissionStateChange={setAssetImageSubmissionPending}
          onScopeChange={handleAssetScopeChange}
        />
      ) : (
        <ProjectClipEditingStep
          episodes={clipEditingEpisodes}
          initialClips={storyboardClips}
          ratio={ratio}
          styleName={visualStyleName}
          toneStyleName={toneStyleName}
          visualStyleOptions={assetVisualStyleOptions}
          toneStyleOptions={assetToneStyleOptions}
          onStoryboardEditorRefresh={() => {
            setStoryboardEditorError(undefined)
            setStoryboardEditorRetryToken((current) => current + 1)
          }}
        />
      )}

      <CustomStyleModal
        open={customStyleModalOpen}
        category={styleCategory}
        onCancel={() => setCustomStyleModalOpen(false)}
        onApply={handleCustomStyleApply}
      />

      <Modal
        open={exitConfirmOpen}
        centered
        width={400}
        footer={null}
        maskClosable={false}
        className="project-create-page__exit-modal"
        onCancel={() => setExitConfirmOpen(false)}
      >
        <div className="project-create-page__exit-dialog">
          <h2>{l('确认退出？', 'Exit creation?')}</h2>
          <p>{l('基础信息的内容尚未保存，是否直接退出？', 'Your basic information has not been saved. Exit anyway?')}</p>
          <div className="project-create-page__exit-actions">
            <Button disabled={submitting} onClick={() => void leaveProjectCreation()}>
              {l('直接退出', 'Exit without saving')}
            </Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={basicInfoInteractionLocked || !styleSelectionReady}
              onClick={() => void handleSaveAndExit()}
            >
              {l('保存并退出', 'Save and exit')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={episodeImportOpen}
        centered
        width={820}
        footer={null}
        closable={false}
        destroyOnClose
        maskClosable={false}
        className="project-create-page__episode-import-modal"
        onCancel={closeEpisodeImport}
      >
        <header className="project-create-page__episode-import-header">
          <h2>{l('新增剧集', 'Add episodes')}</h2>
          <button
            type="button"
            aria-label={l('关闭', 'Close')}
            disabled={submitting || creatingEpisode || parsingEpisodeFile || chapterRefreshPending}
            onClick={closeEpisodeImport}
          >
            <CloseOutlined />
          </button>
        </header>
        <div className="project-create-page__episode-import-editor">
          <div className="project-create-page__episode-import-toolbar">
            <Button
              icon={<PlusOutlined />}
              loading={parsingEpisodeFile}
              disabled={submitting || creatingEpisode || parsingEpisodeFile || chapterRefreshPending}
              onClick={() => episodeImportInputRef.current?.click()}
            >
              {l('上传剧本', 'Upload script')}
            </Button>
            <span>{l('仅支持 txt、md、doc、docx 文件，单次导入建议不超过10集', 'Supports txt, md, doc and docx; up to 10 episodes per import')}</span>
            {episodeImportFileName && <em title={episodeImportFileName}>{episodeImportFileName}</em>}
            <input
              ref={episodeImportInputRef}
              type="file"
              accept={SCRIPT_IMPORT_ACCEPT}
              hidden
              disabled={submitting || creatingEpisode || parsingEpisodeFile || chapterRefreshPending}
              onChange={handleEpisodeFileImport}
            />
          </div>
          <textarea
            value={episodeImportText}
            disabled={submitting || creatingEpisode || parsingEpisodeFile || chapterRefreshPending}
            maxLength={MAX_SCRIPT_LENGTH}
            placeholder={l('请输入剧集内容...', 'Enter episode content...')}
            onChange={(event) => {
              episodeImportEditRevisionRef.current += 1
              setEpisodeImportText(event.target.value)
            }}
          />
        </div>
        <footer className="project-create-page__episode-import-footer">
          <span>{l(`已输入 ${episodeImportText.length.toLocaleString()} 字`, `${episodeImportText.length.toLocaleString()} characters entered`)}</span>
          <Button
            type="primary"
            loading={creatingEpisode}
            disabled={(!episodeImportText.length && !chapterRefreshPending)
              || restoringImport
              || submitting
              || creatingEpisode
              || parsingEpisodeFile
              || scriptImportId === null}
            onClick={() => void handleImportEpisodes()}
          >
            {chapterRefreshPending ? l('重试刷新', 'Retry refresh') : l('提交', 'Submit')}
          </Button>
        </footer>
      </Modal>
    </div>
  )
}

export default ProjectCreatePage
