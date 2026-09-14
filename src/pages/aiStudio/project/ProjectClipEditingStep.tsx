import CreditIcon from '../../../components/CreditIcon'
import DirectorSegmentApplication from '../../directorDesk/DirectorSegmentApplication'
import DirectorGenerationOrigins from '../../directorDesk/DirectorGenerationOrigins'
import {
  Fragment,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Button, Image, Input, Modal, Popover, Progress, Slider, Tooltip, message } from 'antd'
import {
  AudioOutlined,
  BgColorsOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  MergeCellsOutlined,
  PictureOutlined,
  PlayCircleFilled,
  PlusOutlined,
  PlusCircleOutlined,
  QuestionCircleFilled,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  StopOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { getApiErrorMessage } from '../../../services/apiErrors'
import {
  StudioAssetGenerationApi,
  type StudioAssetImageTaskRequest,
  type StudioEpisodeStoryboardSegmentDetailResult,
  type StudioEpisodeStoryboardSegmentSourceType,
  type StudioStoryboardMediaHistoryItem,
  type StudioStoryboardImageSkillResult,
  type StudioStoryboardVideoDetailResult,
  type StudioStoryboardVideoPromptDetailResult,
  type StudioStoryboardVideoPromptRegenerateResult,
  type StudioStoryboardVideoGenerateEstimateResult,
  type StudioStoryboardVideoReferenceAddItem,
  type StudioStoryboardVideoReferenceAddResult,
  type StudioStoryboardVideoReferenceDeleteResult,
  type StudioStoryboardVideoReferenceOption,
  type StudioStoryboardVideoReferenceOptionSource,
} from '../../../services/studioAssetGeneration'
import { StudioModelsApi, type StudioGenerationModel } from '../../../services/studioModels'
import ImageViewer from './ImageViewer'
import { Alert } from 'antd'
import { WorkflowService } from '../../../services/generated/services/WorkflowService'
import { useWorkflowMedia, workflowData, workflowHistoryItem } from './useWorkflowMedia'
import WorkflowThumbnail from './WorkflowThumbnail'
import ImageToVideoModal from './ImageToVideoModal'
import StudioSelect from './StudioSelect'
import VoiceLibraryModal from './VoiceLibraryModal'
import { schedulePollWhenVisible, type PollTimerCancel } from './assetBatchGenerationPolling'
import { downloadMediaFile, normalizeMediaFileId, resolveAssetUrl } from '../assets/utils'
import {
  PROJECT_CREATION_DRAFT_KEYS,
  buildEpisodeSourceSignature,
  readProjectCreationDraft,
  useProjectCreationDraft,
} from './projectCreationDraft'
import './ProjectClipEditingStep.css'

type EpisodeDraft = {
  id: string
  title: string
  rawText: string
}

type ProjectClipEditingStepProps = {
  episodes: EpisodeDraft[]
  ratio: string
  styleName: string
  toneStyleName?: string
  initialClips?: ClipDraft[]
  visualStyleOptions?: Array<{
    id?: string | number | null
    name: string
    coverUrl?: string
  }>
  toneStyleOptions?: Array<{
    id?: string | number | null
    name: string
    coverUrl?: string
  }>
  onStoryboardEditorRefresh?: () => void
}

type GenerationMode = 'video' | 'image' | 'voice'
type ClipEditorMode = 'edit' | 'insert-above' | 'insert-below'
type PromptMentionKind = 'character' | 'scene' | 'prop'

type PromptMentionAsset = {
  id: string
  name: string
  imageUrl?: string
  videoUrl?: string
  kind: PromptMentionKind
  token?: string
  referenceIndex?: number | null
  referenceSelectionRevisionNo?: number | null
  aliases?: string[]
}

type VoiceReferenceItem = {
  id: string
  character: string
  voice: string
  imageUrl?: string
  configured: boolean
  referenceIndex?: number | null
  referenceSelectionRevisionNo?: number | null
}

type ReferenceOptionAsset = PromptMentionAsset & {
  selected: boolean
  selectable: boolean
  disabledReason?: string | null
  source: StudioStoryboardVideoReferenceOptionSource
  assetName?: string | null
  lookName?: string | null
  characterName?: string | null
  voiceName?: string | null
  referenceIndex?: number | null
}

type ReferenceOptionsState = {
  loading: boolean
  segmentId?: string
  items?: StudioStoryboardVideoReferenceOption[]
  error?: unknown
}

type SegmentDetailState = {
  loading: boolean
  data?: StudioEpisodeStoryboardSegmentDetailResult
  error?: unknown
}

type SegmentMediaHistoryState = {
  loading: boolean
  items?: StudioStoryboardMediaHistoryItem[]
  error?: unknown
}

type PromptRegenerationState = {
  loading: boolean
  promptId?: string | number
  progress?: number | null
  stageName?: string
  error?: unknown
}

type VideoGenerationState = {
  loading: boolean
  id?: string | number
  progress?: number | null
  statusName?: string
  error?: unknown
}

type StoryboardImageSkillAction = 'apply' | 'undo'

type StoryboardImageSkillState = {
  loading: boolean
  action?: StoryboardImageSkillAction
  enabled?: boolean
  error?: unknown
}

const STORYBOARD_MASTER_SKILL_CODE = 'storyboard-master'
const STORYBOARD_IMAGE_SKILL_MESSAGE_KEY_PREFIX = 'project-clip-editor-storyboard-image-skill'
const VIDEO_DURATION_MIN = 4
const VIDEO_DURATION_MAX = 30
const DEFAULT_VIDEO_DURATION = 10
const DEFAULT_IMAGE_RESOLUTION = '2k'
const FALLBACK_IMAGE_RESOLUTIONS = ['2k', '4k']
const DEFAULT_VIDEO_RESOLUTION = '720p'
const FALLBACK_VIDEO_RESOLUTIONS = ['480p', '720p']
const PROMPT_REGENERATION_POLL_INTERVAL_MS = 3000
const VIDEO_ESTIMATE_DEBOUNCE_MS = 300

export type ClipDraft = {
  id: string
  title: string
  description: string
  prompt: string
  imageUrl: string
  sourceType?: StudioEpisodeStoryboardSegmentSourceType | null
  revisionNo?: number | null
  manuallyAdded?: boolean
}

const isManuallyDeletableSourceType = (
  sourceType?: StudioEpisodeStoryboardSegmentSourceType | null,
) => sourceType === 2

const getManuallyDeletableState = (
  sourceType?: StudioEpisodeStoryboardSegmentSourceType | null,
  fallback?: boolean,
) => {
  if (sourceType !== null && sourceType !== undefined) return isManuallyDeletableSourceType(sourceType)
  return fallback
}

const resolveManuallyDeletable = (
  sourceType: StudioEpisodeStoryboardSegmentSourceType | null | undefined,
  fallback: boolean,
) => getManuallyDeletableState(sourceType, fallback) ?? fallback

const isClipManuallyDeletable = (
  clip: Pick<ClipDraft, 'id' | 'sourceType' | 'manuallyAdded'>,
) => resolveManuallyDeletable(
  clip.sourceType,
  Boolean(clip.manuallyAdded || clip.id.startsWith('clip-')),
)

type VoiceLineDraft = {
  id: string
  character: string
  voice: string
  text: string
  audioUrl?: string
  volume: number
  speed: number
  expressionPanel: 'pause' | 'interjection' | null
  customPauseExpanded: boolean
  customPauseSeconds: string
  emotion: string
  emotionExpanded: boolean
}

type ClipEditingDraft = {
  sourceSignature: string
  clips: ClipDraft[]
  activeClipId: string
  mode: GenerationMode
  promptByClip: Record<string, string>
  model: string
  resolution: string
  videoModel: string
  videoResolution: string
  videoDuration: number
  selectedRatio: string
  selectedTone: string
  selectedStyle: string
  storyboardSkillEnabled: boolean
  historyIndexByClip: Record<string, number>
  voiceVolume: number
  voiceSpeed: number
  voiceLines: VoiceLineDraft[]
}

const isGenerationMode = (value: unknown): value is GenerationMode => (
  value === 'video' || value === 'image' || value === 'voice'
)

const getPromptDraftKey = (clipId: string, mode: GenerationMode) => (
  mode === 'image' ? `image:${clipId}` : clipId
)

const toStoryboardSegmentRequestId = (clipId: string): string | number => (
  /^\d+$/.test(clipId) ? Number(clipId) : clipId
)

const INITIAL_VOICE_LINES: VoiceLineDraft[] = [
  { id: 'voice-line-1', character: '楚青', voice: '温润男声', text: '拼个桌，不介意吧？', volume: 1, speed: 1, expressionPanel: 'interjection', customPauseExpanded: false, customPauseSeconds: '', emotion: '害怕', emotionExpanded: true },
  { id: 'voice-line-2', character: '姜萤', voice: '元气甜妹', text: '', volume: 1, speed: 1, expressionPanel: null, customPauseExpanded: false, customPauseSeconds: '', emotion: '自动', emotionExpanded: false },
  { id: 'voice-line-3', character: '旁白', voice: '解说小美', text: '1', volume: 1, speed: 1, expressionPanel: null, customPauseExpanded: false, customPauseSeconds: '', emotion: '自动', emotionExpanded: false },
]

const VOICE_BINDINGS = [
  { character: '旁白', voice: '解说小美', adjustable: false },
  { character: '姜萤', voice: '元气甜妹', adjustable: false },
  { character: '食客群体', voice: '油腻大叔', adjustable: false },
  { character: '楚青', voice: '温润男声', adjustable: true },
]

const normalizeVoiceReferenceCharacter = (value: string) => {
  const name = value.trim()
  return name === '姜萱' ? '姜萤' : name
}

const VOICE_PAUSE_OPTIONS = [
  { label: '0.25s', token: '<#0.25#>' },
  { label: '0.5s', token: '<#0.5#>' },
  { label: '1s', token: '<#1#>' },
  { label: '1.5s', token: '<#1.5#>' },
]

const VOICE_INTERJECTION_OPTIONS = [
  ['笑声', 'Laughter'], ['轻笑', 'Chuckling'], ['咳嗽', 'Cough'], ['清嗓子', 'Clear throat'], ['呻吟', 'Groan'],
  ['换气', 'Breath'], ['喘气', 'Panting'], ['吸气', 'Inhale'], ['呼气', 'Exhale'], ['倒吸气', 'Gasp'],
  ['吸鼻子', 'Sniff'], ['叹气', 'Sigh'], ['喷鼻息', 'Snort'], ['打嗝', 'Hiccup'], ['咀嚼', 'Chewing'],
  ['哼唱', 'Humming'], ['嘶吼声', 'Roar'], ['嗯', 'Hmm'], ['喷嚏', 'Sneeze'],
] as const

const VOICE_EMOTIONS = [
  ['自动', 'Auto'], ['高兴', 'Happy'], ['悲伤', 'Sad'], ['愤怒', 'Angry'],
  ['害怕', 'Fearful'], ['厌恶', 'Disgusted'], ['惊讶', 'Surprised'], ['中性', 'Neutral'],
] as const

const PREVIEW_IMAGES = [
  '/assets/project-create/tone-suspense.jpg',
  '/assets/project-create/international-live-action.jpg',
  '/assets/project-create/tone-documentary.jpg',
  '/assets/project-create/tone-cyberpunk.jpg',
]

const NO_STYLE_VALUE = '__no_style__'
const NO_TONE_VALUE = '__no_tone__'
const formatVoiceRate = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}x`
const formatCreditCost = (value: number | undefined) => {
  if (value === undefined) return '--'
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

const normalizeImageResolutionValue = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const normalized = text.toLocaleLowerCase()
  if (/^\d+$/.test(normalized)) return `${normalized}k`
  return /^\d+k$/.test(normalized) ? normalized : text
}

const formatImageResolutionLabel = (value: string) => normalizeImageResolutionValue(value).toLocaleUpperCase()

const normalizeVideoResolutionValue = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const normalized = text.toLocaleLowerCase()
  return /^\d+p$/.test(normalized) ? normalized : text
}

const formatVideoResolutionLabel = (value: string) => normalizeVideoResolutionValue(value).toLocaleUpperCase()

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const normalizePositiveInteger = (value: unknown, fallback: number) => {
  const numberValue = Math.floor(Number(value))
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback
}

const normalizePositiveIntegerOrNull = (value: unknown) => {
  const numberValue = Math.floor(Number(value))
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null
}

const getVideoDurationRange = (
  capabilities?: StudioGenerationModel['videoCapabilities'],
) => {
  const min = normalizePositiveInteger(capabilities?.minDurationSeconds, VIDEO_DURATION_MIN)
  const max = Math.max(
    min,
    normalizePositiveInteger(capabilities?.maxDurationSeconds, VIDEO_DURATION_MAX),
  )
  return { min, max }
}

const normalizeVideoModelLookupKey = (value: unknown) => String(value ?? '')
  .trim()
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, '')

const findGenerationModelBySelection = (
  models: StudioGenerationModel[],
  selection: string,
) => {
  const selectedById = models.find((item) => String(item.id) === selection)
  if (selectedById) return selectedById
  const currentKey = normalizeVideoModelLookupKey(selection)
  if (!currentKey) return undefined
  return models.find((item) => (
    normalizeVideoModelLookupKey(item.modelCode).includes(currentKey)
    || normalizeVideoModelLookupKey(item.name).includes(currentKey)
  ))
}

const isStoryboardVideoPromptFinished = (detail: StudioStoryboardVideoPromptDetailResult) => {
  const prompt = detail.prompt?.trim()
  if (prompt) return true
  const statusText = `${detail.stage ?? ''} ${detail.stageName ?? ''}`.toLocaleLowerCase()
  return Number(detail.status) === 3
    || Number(detail.progress) >= 100
    || /成功|完成|success|succeed|complete|completed|generated/.test(statusText)
}

const isStoryboardVideoPromptFailed = (detail: StudioStoryboardVideoPromptDetailResult) => {
  const statusText = `${detail.stage ?? ''} ${detail.stageName ?? ''}`.toLocaleLowerCase()
  return Boolean(detail.error?.trim())
    || Number(detail.status) > 3
    || /失败|取消|failed|cancel|error/.test(statusText)
}

const getRatioValue = (value: string) => {
  const [rawWidth, rawHeight] = value.split(':').map(Number)
  return Number.isFinite(rawWidth) && rawWidth > 0 && Number.isFinite(rawHeight) && rawHeight > 0
    ? rawWidth / rawHeight
    : 16 / 9
}

const getStoryboardMediaOutputUrl = (item?: StudioStoryboardMediaHistoryItem | null) => {
  if (!item) return ''
  return resolveAssetUrl(item.outputUrl ?? (item.outputFileId === null || item.outputFileId === undefined
    ? undefined
    : String(item.outputFileId))) ?? ''
}

const getStoryboardMediaThumbnailUrl = (item?: StudioStoryboardMediaHistoryItem | null) => {
  if (!item) return ''
  const thumbnailUrl = resolveAssetUrl(item.thumbnailUrl ?? undefined)
  if (thumbnailUrl) return thumbnailUrl
  return item.mediaType === 'image' ? getStoryboardMediaOutputUrl(item) : ''
}

const getStoryboardMediaRatio = (item: StudioStoryboardMediaHistoryItem | undefined, fallbackRatio: string) => (
  getRatioValue(item?.aspectRatio || fallbackRatio)
)

const getGenerationStyleId = (
  options: Array<{ id?: string | number | null, name: string }>,
  value: string,
  emptyValue: string,
) => {
  if (!value || value === emptyValue) return null
  const option = options.find((item) => String(item.id) === value)
  return option?.id ?? null
}

const ClipCoverPlaceholder = ({
  variant = 'thumb',
  label,
  hint,
}: {
  variant?: 'thumb' | 'preview' | 'history'
  label?: ReactNode
  hint?: ReactNode
}) => (
  <span className={`project-clip-editor__cover-placeholder is-${variant}`} aria-hidden={label ? undefined : true}>
    <span className="project-clip-editor__cover-placeholder-icon" />
    {label && (
      <>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </>
    )}
  </span>
)

const getStoryboardReferenceKind = (referenceType?: number | null): PromptMentionKind => {
  if (referenceType === 1) return 'character'
  if (referenceType === 2) return 'scene'
  return 'prop'
}

const getStoryboardReferenceImageUrl = (fileUrl?: string | null, fileId?: string | number | null) => (
  resolveAssetUrl(fileUrl ?? (fileId === null || fileId === undefined ? undefined : String(fileId)))
)

const parsePromptReferenceIndex = (token?: string | null) => {
  const match = token?.trim().match(/^@?图片(\d+)$/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isInteger(value) && value > 0 ? value : null
}

const storyboardSegmentDetailToMentionAssets = (
  detail?: StudioEpisodeStoryboardSegmentDetailResult,
  mode: GenerationMode = 'video',
): PromptMentionAsset[] => {
  const references = detail?.referenceSelection?.references.length
    ? detail.referenceSelection.references
    : mode === 'image'
      ? detail?.imagePrompt?.references ?? detail?.directorPrompt?.references ?? []
      : detail?.directorPrompt?.references ?? detail?.imagePrompt?.references ?? []
  const promptReferenceAssets = references.flatMap((reference, index): PromptMentionAsset[] => {
    // Image-prompt type 7 means composition; only the video selection contract uses it for video files.
    const usesImagePrompt = !detail?.referenceSelection?.references.length
      && Boolean(mode === 'image' ? detail?.imagePrompt : !detail?.directorPrompt && detail?.imagePrompt)
    const isVideo = reference.referenceType === 7 && !usesImagePrompt
    const token = reference.referenceToken.trim()
    const name = reference.displayName.trim()
    if (!token || !name) return []
    const referenceIdentity = reference.referenceKey ?? token
    return [{
      id: `storyboard-reference:${detail?.id}:${referenceIdentity}`,
      name,
      token,
      referenceIndex: reference.referenceIndex ?? parsePromptReferenceIndex(token) ?? index + 1,
      referenceSelectionRevisionNo: detail?.referenceSelection?.revisionNo ?? null,
      imageUrl: isVideo ? undefined : getStoryboardReferenceImageUrl(reference.fileUrl, reference.fileId),
      videoUrl: isVideo ? getStoryboardReferenceImageUrl(reference.fileUrl, reference.fileId) : undefined,
      kind: getStoryboardReferenceKind(reference.referenceType),
      aliases: [name, ...(reference.matchNames ?? [])],
    }]
  })
  if (promptReferenceAssets.length > 0) return promptReferenceAssets

  return (detail?.assetReferences ?? []).flatMap((reference, index): PromptMentionAsset[] => {
    const name = reference.assetName.trim()
    if (!name) return []
    return [{
      id: `storyboard-asset-reference:${detail?.id}:${reference.scopeCode ?? reference.assetId ?? index}`,
      name,
      token: `@图片${index + 1}`,
      referenceIndex: index + 1,
      referenceSelectionRevisionNo: detail?.referenceSelection?.revisionNo ?? null,
      imageUrl: getStoryboardReferenceImageUrl(reference.coverUrl, reference.coverFileId),
      kind: getStoryboardReferenceKind(reference.assetType),
      aliases: [name, reference.scopeCode ?? ''].filter(Boolean),
    }]
  })
}

const PROMPT_MENTION_SELECTOR = '[data-prompt-mention-id]'
const PROMPT_EDITOR_BLOCK_TAGS = new Set(['DIV', 'P', 'LI'])

const stripPromptMentionPrefix = (value: string) => value.trim().replace(/^@+/, '')

const getPromptMentionPrimaryText = (asset: PromptMentionAsset) => (
  stripPromptMentionPrefix(asset.token ?? asset.name)
)

const getPromptMentionTexts = (asset: PromptMentionAsset) => {
  const texts = [
    getPromptMentionPrimaryText(asset),
    asset.name,
    ...(asset.aliases ?? []),
  ]
    .map(stripPromptMentionPrefix)
    .filter(Boolean)
  return [...new Set(texts)]
}

const getReferenceOptionAssetId = (
  option: StudioStoryboardVideoReferenceOption,
  index: number,
) => [
  'storyboard-reference-option',
  option.source,
  option.assetId ?? option.characterName ?? option.assetName ?? option.displayName,
  option.characterLookId ?? option.voiceId ?? option.dubbingGenerationId ?? option.fileId ?? option.referenceIndex ?? index,
]
  .map((value) => String(value ?? '').trim())
  .filter(Boolean)
  .join(':')

const getReferenceOptionName = (option: StudioStoryboardVideoReferenceOption) => (
  option.characterName
    ?? option.assetName
    ?? option.displayName
    ?? option.voiceName
    ?? ''
).trim()

const getReferenceOptionLookName = (option: StudioStoryboardVideoReferenceOption) => (
  option.lookName
    ?? option.characterLookName
    ?? (option.defaultLook ? '主图' : null)
    ?? ''
).trim()

const getReferenceOptionImageUrl = (option: StudioStoryboardVideoReferenceOption) => (
  resolveAssetUrl(
    option.source === 'dubbing' && option.characterCoverUrl
      ? option.characterCoverUrl
      : option.fileUrl ?? (option.fileId === null || option.fileId === undefined ? undefined : String(option.fileId)),
  )
)

const getReferenceOptionKind = (
  source: StudioStoryboardVideoReferenceOptionSource,
): PromptMentionKind => {
  if (source === 'scene') return 'scene'
  if (source === 'prop') return 'prop'
  return 'character'
}

const referenceOptionToAsset = (
  option: StudioStoryboardVideoReferenceOption,
  index: number,
): ReferenceOptionAsset => {
  const name = getReferenceOptionName(option) || option.displayName
  const lookName = getReferenceOptionLookName(option)
  const aliases = [
    option.displayName,
    option.assetName ?? undefined,
    option.characterName ?? undefined,
    option.voiceName ?? undefined,
    lookName,
  ].filter((value): value is string => Boolean(value?.trim()))
  return {
    id: getReferenceOptionAssetId(option, index),
    name,
    imageUrl: getReferenceOptionImageUrl(option),
    kind: getReferenceOptionKind(option.source),
    token: option.referenceIndex ? `@图片${option.referenceIndex}` : undefined,
    aliases,
    selected: option.selected,
    selectable: option.selectable,
    disabledReason: option.disabledReason,
    source: option.source,
    assetName: option.assetName,
    lookName,
    characterName: option.characterName,
    voiceName: option.voiceName,
    referenceIndex: option.referenceIndex,
    referenceSelectionRevisionNo: option.referenceSelectionRevisionNo,
  }
}

const referenceOptionToVoiceItem = (
  option: StudioStoryboardVideoReferenceOption,
  index: number,
): VoiceReferenceItem => {
  const character = normalizeVoiceReferenceCharacter(
    option.characterName
      ?? option.assetName
      ?? option.displayName
      ?? '',
  )
  const voice = (
    option.voiceName
      ?? option.disabledReason
      ?? (option.selectable ? option.displayName : '尚未配置音色')
      ?? ''
  ).trim()
  return {
    id: getReferenceOptionAssetId(option, index),
    character,
    voice,
    imageUrl: getReferenceOptionImageUrl(option),
    configured: option.selectable,
    referenceIndex: option.referenceIndex,
    referenceSelectionRevisionNo: option.referenceSelectionRevisionNo,
  }
}

const readPromptEditorNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.replace(/\u200b/g, '') ?? ''
  if (!(node instanceof HTMLElement)) return ''
  if (node.tagName === 'BR') return '\n'
  if (node.matches(PROMPT_MENTION_SELECTOR)) {
    return `@${node.dataset.promptMentionValue ?? node.dataset.promptMentionName ?? ''}`
  }

  let value = ''
  Array.from(node.childNodes).forEach((child, index, siblings) => {
    const isBlock = child instanceof HTMLElement && PROMPT_EDITOR_BLOCK_TAGS.has(child.tagName)
    if (isBlock && value && !value.endsWith('\n')) value += '\n'
    value += readPromptEditorNode(child)
    if (isBlock && index < siblings.length - 1 && !value.endsWith('\n')) value += '\n'
  })
  return value
}

const readPromptEditorValue = (editor: HTMLDivElement) => (
  readPromptEditorNode(editor).replace(/\r\n?/g, '\n')
)

const createPromptMentionElement = (asset: PromptMentionAsset, mentionText?: string) => {
  const mention = document.createElement('span')
  mention.className = 'project-clip-editor__prompt-mention'
  mention.contentEditable = 'false'
  mention.dataset.promptMentionId = asset.id
  mention.dataset.promptMentionName = asset.name
  mention.dataset.promptMentionValue = stripPromptMentionPrefix(mentionText ?? asset.token ?? asset.name)

  if (asset.imageUrl) {
    const image = document.createElement('img')
    image.src = asset.imageUrl
    image.alt = ''
    image.draggable = false
    mention.append(image)
  }

  const label = document.createElement('strong')
  label.textContent = asset.name
  mention.append(label)
  return mention
}

const escapePromptMentionPattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const renderPromptEditorValue = (
  editor: HTMLDivElement,
  value: string,
  assets: PromptMentionAsset[],
) => {
  editor.replaceChildren()
  const mentionAssets = new Map<string, PromptMentionAsset>()
  assets.forEach((asset) => {
    getPromptMentionTexts(asset).forEach((text) => {
      if (!mentionAssets.has(text)) mentionAssets.set(text, asset)
    })
  })
  const mentionTexts = [...mentionAssets.keys()].sort((a, b) => b.length - a.length)
  const mentionPattern = mentionTexts.length > 0
    ? new RegExp(`@(${mentionTexts.map(escapePromptMentionPattern).join('|')})`, 'g')
    : null

  if (!mentionPattern) {
    if (value) editor.append(document.createTextNode(value))
    editor.dataset.value = value
    return
  }

  let cursor = 0
  let match = mentionPattern.exec(value)
  while (match) {
    const offset = match.index
    const mentionText = match[1]
    if (offset > cursor) editor.append(document.createTextNode(value.slice(cursor, offset)))
    const asset = mentionAssets.get(mentionText)
    editor.append(asset ? createPromptMentionElement(asset, mentionText) : document.createTextNode(match[0]))
    cursor = offset + match[0].length
    match = mentionPattern.exec(value)
  }
  if (cursor < value.length) editor.append(document.createTextNode(value.slice(cursor)))
  editor.dataset.value = value
}

const getPromptMentionFromNode = (node: Node | null) => {
  const element = node instanceof HTMLElement ? node : node?.parentElement
  return element?.closest<HTMLElement>(PROMPT_MENTION_SELECTOR) ?? null
}

const placePromptCaretAtMentionBoundary = (
  editor: HTMLDivElement,
  mention: HTMLElement,
  side: 'before' | 'after',
) => {
  const parent = mention.parentNode
  const selection = window.getSelection()
  if (!parent || !selection) return
  const mentionIndex = Array.prototype.indexOf.call(parent.childNodes, mention) as number
  const range = document.createRange()
  range.setStart(parent, mentionIndex + (side === 'after' ? 1 : 0))
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  editor.focus({ preventScroll: true })
}

const getAdjacentPromptMention = (
  editor: HTMLDivElement,
  direction: 'backward' | 'forward',
) => {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null

  const anchor = selection.anchorNode
  const offset = selection.anchorOffset
  let candidate: Node | null = null
  if (anchor.nodeType === Node.TEXT_NODE) {
    const textLength = anchor.textContent?.length ?? 0
    const atEdge = direction === 'backward' ? offset === 0 : offset === textLength
    if (!atEdge) return null
    candidate = direction === 'backward' ? anchor.previousSibling : anchor.nextSibling
  } else {
    candidate = direction === 'backward'
      ? anchor.childNodes[offset - 1] ?? null
      : anchor.childNodes[offset] ?? null
  }
  return candidate instanceof HTMLElement && candidate.matches(PROMPT_MENTION_SELECTOR) ? candidate : null
}

const getActivePromptMentionQuery = (editor: HTMLDivElement) => {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null

  let textNode: Text | null = null
  let offset = selection.anchorOffset
  if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
    textNode = selection.anchorNode as Text
  } else {
    if (offset === 0) return null
    const candidate = selection.anchorNode.childNodes[Math.max(0, offset - 1)]
    if (candidate?.nodeType === Node.TEXT_NODE) {
      textNode = candidate as Text
      offset = textNode.data.length
    }
  }
  if (!textNode) return null

  const match = textNode.data.slice(0, offset).match(/@([^\s@]*)$/)
  if (!match) return null
  const range = document.createRange()
  range.setStart(textNode, offset - match[0].length)
  range.setEnd(textNode, offset)
  return { query: match[1], range }
}

type PromptMentionEditorProps = {
  value: string
  assets: PromptMentionAsset[]
  maxLength: number
  placeholder: string
  characterGroupLabel: string
  sceneGroupLabel: string
  propGroupLabel: string
  menuTitle: string
  emptyLabel: string
  onChange: (value: string) => void
}
const PROMPT_PARENT_SYNC_DELAY_MS = 200

const PromptMentionEditor = memo(function PromptMentionEditor({
  value,
  assets,
  maxLength,
  placeholder,
  characterGroupLabel,
  sceneGroupLabel,
  propGroupLabel,
  menuTitle,
  emptyLabel,
  onChange,
}: PromptMentionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef<HTMLSpanElement>(null)
  const mentionRangeRef = useRef<Range | null>(null)
  const localValueRef = useRef(value)
  const latestValuePropRef = useRef(value)
  const previousValuePropRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const publishTimerRef = useRef<number | null>(null)
  latestValuePropRef.current = value
  onChangeRef.current = onChange
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [menuPosition, setMenuPosition] = useState({ left: 12, top: 44 })
  const mentionAssetSignature = useMemo(() => assets.map((asset) => [
    asset.id,
    asset.token ?? '',
    asset.name,
    ...(asset.aliases ?? []),
  ].join('\u001f')).join('\u001e'), [assets])

  const matchingAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return normalizedQuery
      ? assets.filter((asset) => getPromptMentionTexts(asset)
        .some((text) => text.toLocaleLowerCase().includes(normalizedQuery)))
      : assets
  }, [assets, query])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const valuePropChanged = previousValuePropRef.current !== value
    previousValuePropRef.current = value
    if (valuePropChanged && value !== localValueRef.current) {
      if (publishTimerRef.current !== null) window.clearTimeout(publishTimerRef.current)
      publishTimerRef.current = null
      localValueRef.current = value
    }
    if (
      editor.dataset.value !== localValueRef.current
      || editor.dataset.promptMentionSignature !== mentionAssetSignature
    ) {
      renderPromptEditorValue(editor, localValueRef.current, assets)
      editor.dataset.promptMentionSignature = mentionAssetSignature
    }
    if (counterRef.current) {
      counterRef.current.textContent = `${localValueRef.current.length}/${maxLength}`
    }
  }, [assets, maxLength, mentionAssetSignature, value])

  useEffect(() => () => {
    if (publishTimerRef.current !== null) window.clearTimeout(publishTimerRef.current)
  }, [])

  const closeMenu = () => {
    setMenuOpen(false)
    mentionRangeRef.current = null
  }

  const publishValue = () => {
    if (publishTimerRef.current !== null) window.clearTimeout(publishTimerRef.current)
    publishTimerRef.current = null
    const nextValue = localValueRef.current
    if (nextValue !== latestValuePropRef.current) onChangeRef.current(nextValue)
  }

  const syncValue = (publishImmediately = false) => {
    const editor = editorRef.current
    if (!editor) return
    const nextValue = readPromptEditorValue(editor)
    if (nextValue.length > maxLength) {
      renderPromptEditorValue(editor, localValueRef.current, assets)
      return
    }
    localValueRef.current = nextValue
    editor.dataset.value = nextValue
    if (counterRef.current) counterRef.current.textContent = `${nextValue.length}/${maxLength}`
    if (nextValue === latestValuePropRef.current) {
      if (publishTimerRef.current !== null) window.clearTimeout(publishTimerRef.current)
      publishTimerRef.current = null
      return
    }
    if (publishImmediately) {
      publishValue()
      return
    }
    if (publishTimerRef.current !== null) window.clearTimeout(publishTimerRef.current)
    publishTimerRef.current = window.setTimeout(publishValue, PROMPT_PARENT_SYNC_DELAY_MS)
  }

  const updateMentionMenu = () => {
    const editor = editorRef.current
    if (!editor) return
    const mentionQuery = getActivePromptMentionQuery(editor)
    if (!mentionQuery) {
      closeMenu()
      return
    }

    const editorBounds = editor.getBoundingClientRect()
    const caretBounds = mentionQuery.range.getBoundingClientRect()
    const menuWidth = 248
    const left = Math.min(
      Math.max(10, caretBounds.left - editorBounds.left),
      Math.max(10, editor.clientWidth - menuWidth - 10),
    )
    const requestedTop = caretBounds.bottom > 0 ? caretBounds.bottom - editorBounds.top + 8 : 44
    const top = Math.min(Math.max(44, requestedTop), Math.max(44, editor.clientHeight - 300))
    mentionRangeRef.current = mentionQuery.range.cloneRange()
    setQuery(mentionQuery.query)
    setHighlightedIndex(0)
    setMenuPosition({ left, top })
    setMenuOpen(true)
  }

  const insertMention = (asset: PromptMentionAsset) => {
    const editor = editorRef.current
    const range = mentionRangeRef.current
    if (!editor || !range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return

    const mention = createPromptMentionElement(asset)
    range.deleteContents()
    range.insertNode(mention)

    const selection = window.getSelection()
    if (selection) {
      const caretRange = document.createRange()
      caretRange.setStartAfter(mention)
      caretRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(caretRange)
    }
    editor.focus({ preventScroll: true })
    closeMenu()
    syncValue(true)
  }

  const removeMention = (mention: HTMLElement) => {
    const editor = editorRef.current
    const parent = mention.parentNode
    if (!editor || !parent) return
    const mentionIndex = Array.prototype.indexOf.call(parent.childNodes, mention) as number
    mention.remove()
    const range = document.createRange()
    range.setStart(parent, Math.min(mentionIndex, parent.childNodes.length))
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    editor.focus({ preventScroll: true })
    syncValue(true)
    closeMenu()
  }

  const renderAssetGroup = (kind: PromptMentionKind, label: string) => {
    const groupAssets = matchingAssets.filter((asset) => asset.kind === kind)
    if (groupAssets.length === 0) return null
    return (
      <section className="project-clip-editor__mention-group" key={kind}>
        <strong>{label}</strong>
        {groupAssets.map((asset) => {
          const assetIndex = matchingAssets.findIndex((item) => item.id === asset.id)
          const highlighted = assetIndex === highlightedIndex
          return (
            <button
              key={asset.id}
              type="button"
              role="option"
              aria-selected={highlighted}
              className={highlighted ? 'is-highlighted' : ''}
              onMouseEnter={() => setHighlightedIndex(assetIndex)}
              onMouseDown={(event) => {
                event.preventDefault()
                insertMention(asset)
              }}
            >
              {asset.imageUrl ? <img src={asset.imageUrl} alt="" loading="lazy" decoding="async" /> : asset.videoUrl ? <VideoCameraOutlined /> : <PictureOutlined />}
              <span>{asset.name}</span>
              {highlighted && <CheckOutlined />}
            </button>
          )
        })}
      </section>
    )
  }

  return (
    <div className="project-clip-editor__prompt-editor">
      <div
        ref={editorRef}
        className="project-clip-editor__prompt-rich-input"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        tabIndex={0}
        spellCheck={false}
        data-placeholder={placeholder}
        onMouseDown={(event) => {
          const mention = getPromptMentionFromNode(event.target as Node)
          const editor = editorRef.current
          if (!mention || !editor?.contains(mention)) return
          event.preventDefault()
          const bounds = mention.getBoundingClientRect()
          placePromptCaretAtMentionBoundary(
            editor,
            mention,
            event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after',
          )
          closeMenu()
        }}
        onKeyDown={(event) => {
          const editor = editorRef.current
          if (!editor || event.nativeEvent.isComposing) return

          if (menuOpen) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (matchingAssets.length > 0) {
                const direction = event.key === 'ArrowDown' ? 1 : -1
                setHighlightedIndex((current) => (current + direction + matchingAssets.length) % matchingAssets.length)
              }
              return
            }
            if ((event.key === 'Enter' || event.key === 'Tab') && matchingAssets[highlightedIndex]) {
              event.preventDefault()
              insertMention(matchingAssets[highlightedIndex])
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              closeMenu()
              return
            }
          }

          if (!event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            const direction = event.key === 'ArrowLeft' ? 'backward' : 'forward'
            const adjacentMention = getAdjacentPromptMention(editor, direction)
            if (adjacentMention) {
              event.preventDefault()
              placePromptCaretAtMentionBoundary(
                editor,
                adjacentMention,
                direction === 'backward' ? 'before' : 'after',
              )
              return
            }
          }

          if (event.key !== 'Backspace' && event.key !== 'Delete') return
          const adjacentMention = getAdjacentPromptMention(
            editor,
            event.key === 'Backspace' ? 'backward' : 'forward',
          )
          if (!adjacentMention) return
          event.preventDefault()
          removeMention(adjacentMention)
        }}
        onInput={() => {
          syncValue()
          updateMentionMenu()
        }}
        onMouseUp={updateMentionMenu}
        onBlur={() => {
          closeMenu()
          publishValue()
        }}
        onPaste={(event) => {
          event.preventDefault()
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
        }}
      />
      {menuOpen && (
        <div
          className="project-clip-editor__mention-menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          role="listbox"
          aria-label={menuTitle}
        >
          <header>{menuTitle}</header>
          {matchingAssets.length > 0 ? (
            <>
              {renderAssetGroup('character', characterGroupLabel)}
              {renderAssetGroup('scene', sceneGroupLabel)}
              {renderAssetGroup('prop', propGroupLabel)}
            </>
          ) : (
            <div className="project-clip-editor__mention-empty">{emptyLabel}</div>
          )}
        </div>
      )}
      <span ref={counterRef} className="project-clip-editor__prompt-count">{value.length}/{maxLength}</span>
    </div>
  )
})

const VOICE_INLINE_TOKEN_PATTERN = /(<#[^#\n]+#>|<[^<>\n]+>)/g
const VOICE_PAUSE_TOKEN_EXACT_PATTERN = /^<#[^#\n]+#>$/
const VOICE_INTERJECTION_TOKEN_EXACT_PATTERN = /^<[^#<>\n][^<>\n]*>$/
const VOICE_EDITOR_TOKEN_SELECTOR = '[data-voice-inline-token="true"]'

type VoiceTextEditorProps = {
  value: string
  maxLength: number
  placeholder: string
  onChange: (value: string) => void
}

type VoiceTextEditorHandle = {
  insertToken: (token: string) => void
}

const VOICE_EDITOR_BLOCK_TAGS = new Set(['DIV', 'P', 'LI'])

const readVoiceEditorNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof HTMLElement)) return ''
  if (node.tagName === 'BR') return '\n'
  if (node.matches(VOICE_EDITOR_TOKEN_SELECTOR)) return node.textContent ?? ''

  let value = ''
  Array.from(node.childNodes).forEach((child, index, siblings) => {
    const isBlock = child instanceof HTMLElement && VOICE_EDITOR_BLOCK_TAGS.has(child.tagName)
    if (isBlock && value && !value.endsWith('\n')) value += '\n'
    value += readVoiceEditorNode(child)
    if (isBlock && index < siblings.length - 1 && !value.endsWith('\n')) value += '\n'
  })
  return value
}

const readVoiceTextEditorValue = (editor: HTMLDivElement) => (
  readVoiceEditorNode(editor).replace(/\r\n?/g, '\n')
)

const isVoiceEditorToken = (node: Node | null): node is HTMLElement => (
  node instanceof HTMLElement && node.matches(VOICE_EDITOR_TOKEN_SELECTOR)
)

const getVoiceEditorTokenFromNode = (node: Node | null) => {
  const element = node instanceof HTMLElement ? node : node?.parentElement
  return element?.closest<HTMLElement>(VOICE_EDITOR_TOKEN_SELECTOR) ?? null
}

const placeVoiceEditorCaretAtTokenBoundary = (
  editor: HTMLDivElement,
  token: HTMLElement,
  side: 'before' | 'after',
) => {
  const parent = token.parentNode
  if (!parent) return
  const selection = window.getSelection()
  if (!selection) return
  const tokenIndex = Array.prototype.indexOf.call(parent.childNodes, token) as number
  const range = document.createRange()
  range.setStart(parent, tokenIndex + (side === 'after' ? 1 : 0))
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  editor.focus({ preventScroll: true })
}

const getSelectedVoiceEditorToken = (editor: HTMLDivElement) => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (range.startContainer !== range.endContainer || !editor.contains(range.startContainer)) return null
  if (range.endOffset - range.startOffset !== 1) return null
  const selectedNode = range.startContainer.childNodes[range.startOffset] ?? null
  return isVoiceEditorToken(selectedNode) ? selectedNode : null
}

const getAdjacentVoiceEditorToken = (
  editor: HTMLDivElement,
  direction: 'backward' | 'forward',
) => {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null

  const anchor = selection.anchorNode
  const offset = selection.anchorOffset
  let candidate: Node | null = null

  if (anchor.nodeType === Node.TEXT_NODE) {
    const textLength = anchor.textContent?.length ?? 0
    const isAtEdge = direction === 'backward' ? offset === 0 : offset === textLength
    if (!isAtEdge) return null
    candidate = direction === 'backward' ? anchor.previousSibling : anchor.nextSibling
  } else {
    candidate = direction === 'backward'
      ? anchor.childNodes[offset - 1] ?? null
      : anchor.childNodes[offset] ?? null
  }

  return isVoiceEditorToken(candidate) ? candidate : null
}

const getVoiceEditorTokenAtSelection = (editor: HTMLDivElement) => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const token = getVoiceEditorTokenFromNode(selection.anchorNode)
  return token && editor.contains(token) ? token : null
}

const removeVoiceEditorToken = (editor: HTMLDivElement, token: HTMLElement) => {
  const parent = token.parentNode
  if (!parent) return
  const tokenIndex = Array.prototype.indexOf.call(parent.childNodes, token) as number
  token.remove()

  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.setStart(parent, Math.min(tokenIndex, parent.childNodes.length))
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  editor.focus({ preventScroll: true })
}

const createVoiceEditorToken = (value: string) => {
  const isPauseToken = VOICE_PAUSE_TOKEN_EXACT_PATTERN.test(value)
  const isInterjectionToken = VOICE_INTERJECTION_TOKEN_EXACT_PATTERN.test(value)
  if (!isPauseToken && !isInterjectionToken) return null

  const token = document.createElement('span')
  token.className = `project-clip-editor__voice-inline-token ${isPauseToken ? 'is-pause' : 'is-interjection'}`
  token.contentEditable = 'false'
  token.dataset.voiceInlineToken = 'true'
  token.textContent = value
  return token
}

const renderVoiceTextEditorValue = (editor: HTMLDivElement, value: string) => {
  editor.replaceChildren()
  value.split(VOICE_INLINE_TOKEN_PATTERN).forEach((part) => {
    if (!part) return
    const token = createVoiceEditorToken(part)
    if (token) {
      editor.append(token)
      return
    }
    editor.append(document.createTextNode(part))
  })
  editor.dataset.value = value
}

const VoiceTextEditor = forwardRef<VoiceTextEditorHandle, VoiceTextEditorProps>(function VoiceTextEditor(
  { value, maxLength, placeholder, onChange },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef<HTMLElement>(null)
  const savedRangeRef = useRef<Range | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const hasEditableToken = Array.from(
      editor.querySelectorAll<HTMLElement>(VOICE_EDITOR_TOKEN_SELECTOR),
    ).some((token) => token.contentEditable !== 'false')
    if (editor.dataset.value !== value || hasEditableToken) {
      renderVoiceTextEditorValue(editor, value)
    }
    if (counterRef.current) counterRef.current.textContent = `${value.length}/${maxLength}`
  }, [maxLength, value])

  const syncValue = (publish = false) => {
    const editor = editorRef.current
    if (!editor) return
    const nextValue = readVoiceTextEditorValue(editor).slice(0, maxLength)
    editor.dataset.value = nextValue
    if (counterRef.current) counterRef.current.textContent = `${nextValue.length}/${maxLength}`
    if (!nextValue) editor.replaceChildren()
    if (publish && nextValue !== value) onChange(nextValue)
  }

  const rememberSelection = () => {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return
    savedRangeRef.current = range.cloneRange()
  }

  const insertToken = (tokenValue: string) => {
    const editor = editorRef.current
    const token = createVoiceEditorToken(tokenValue)
    if (!editor || !token) return

    const selection = window.getSelection()
    const liveRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    const range = liveRange
      && editor.contains(liveRange.startContainer)
      && editor.contains(liveRange.endContainer)
      ? liveRange.cloneRange()
      : savedRangeRef.current?.cloneRange()

    const insertionRange = range
      && editor.contains(range.startContainer)
      && editor.contains(range.endContainer)
      ? range
      : document.createRange()

    if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      insertionRange.selectNodeContents(editor)
      insertionRange.collapse(false)
    }

    const currentLength = readVoiceTextEditorValue(editor).length
    if (currentLength - insertionRange.toString().length + tokenValue.length > maxLength) return

    insertionRange.deleteContents()
    insertionRange.insertNode(token)
    placeVoiceEditorCaretAtTokenBoundary(editor, token, 'after')
    rememberSelection()
    syncValue()
  }

  useImperativeHandle(ref, () => ({ insertToken }))

  return (
    <>
      <div
        ref={editorRef}
        className="project-clip-editor__voice-rich-input"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        tabIndex={0}
        spellCheck={false}
        data-placeholder={placeholder}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement
          const token = target.closest<HTMLElement>(VOICE_EDITOR_TOKEN_SELECTOR)
          if (!token || !editorRef.current?.contains(token)) return
          event.preventDefault()
          const bounds = token.getBoundingClientRect()
          placeVoiceEditorCaretAtTokenBoundary(
            editorRef.current,
            token,
            event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after',
          )
          rememberSelection()
        }}
        onKeyDown={(event) => {
          const editor = editorRef.current
          if (!editor || event.nativeEvent.isComposing) return

          if (!event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            const tokenAtSelection = getVoiceEditorTokenAtSelection(editor)
            if (tokenAtSelection) {
              event.preventDefault()
              placeVoiceEditorCaretAtTokenBoundary(
                editor,
                tokenAtSelection,
                event.key === 'ArrowLeft' ? 'before' : 'after',
              )
              rememberSelection()
              return
            }

            const direction = event.key === 'ArrowLeft' ? 'backward' : 'forward'
            const adjacentToken = getAdjacentVoiceEditorToken(editor, direction)
            if (adjacentToken) {
              event.preventDefault()
              placeVoiceEditorCaretAtTokenBoundary(
                editor,
                adjacentToken,
                direction === 'backward' ? 'before' : 'after',
              )
              rememberSelection()
              return
            }
          }

          if (event.key !== 'Backspace' && event.key !== 'Delete') return
          const selectedToken = getSelectedVoiceEditorToken(editor)
          const adjacentToken = selectedToken ?? getVoiceEditorTokenAtSelection(editor) ?? getAdjacentVoiceEditorToken(
            editor,
            event.key === 'Backspace' ? 'backward' : 'forward',
          )
          if (!adjacentToken) return
          event.preventDefault()
          removeVoiceEditorToken(editor, adjacentToken)
          rememberSelection()
          syncValue()
        }}
        onInput={() => {
          syncValue()
          rememberSelection()
        }}
        onFocus={rememberSelection}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onBlur={() => {
          rememberSelection()
          syncValue(true)
        }}
        onPaste={(event) => {
          event.preventDefault()
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
        }}
      />
      <small ref={counterRef}>{value.length}/{maxLength}</small>
    </>
  )
})

const splitIntoClips = (episodes: EpisodeDraft[]): ClipDraft[] => {
  const source = episodes[0]?.rawText.trim() ?? ''
  const paragraphs = source
    .split(/\n+|(?<=[。！？!?])\s*/)
    .map((item) => item.trim())
    .filter(Boolean)

  const fallback = [
    '夜色中的街道被店铺灯光照亮，人物从画面远处走近。',
    '镜头切到人物近景，环境光在侧脸形成清晰轮廓。',
    '人物停下脚步环顾四周，背景人群缓慢经过。',
    '镜头向前推进，聚焦人物手中的关键物品。',
    '人物转身离开，画面保留街道与远处灯光。',
    '环境镜头交代空间关系，为下一段动作建立方向。',
  ]
  const descriptions = paragraphs.length > 0 ? paragraphs : fallback
  const sentencesPerClip = paragraphs.length > 0 ? 3 : 1
  const clipCount = Math.min(12, Math.max(6, Math.ceil(descriptions.length / sentencesPerClip)))

  return Array.from({ length: clipCount }, (_, index) => {
    const start = index * sentencesPerClip
    const groupedDescription = descriptions.slice(start, start + sentencesPerClip).join('\n')
    const description = groupedDescription || descriptions[index % descriptions.length]
    return {
      id: `clip-${index + 1}`,
      title: `片段-${index + 1}`,
      description,
      prompt: `${description} 保持人物造型和场景连续，电影感构图，光线自然，画面细节清晰。`,
      imageUrl: PREVIEW_IMAGES[index % PREVIEW_IMAGES.length],
    }
  })
}

export default function ProjectClipEditingStep({
  episodes,
  ratio,
  styleName,
  toneStyleName = '',
  initialClips: remoteInitialClips,
  visualStyleOptions = [],
  toneStyleOptions = [],
  onStoryboardEditorRefresh,
}: ProjectClipEditingStepProps) {
  const l = useBilingualText()
  const fallbackPromptMentionAssets = useMemo<PromptMentionAsset[]>(() => [
    { id: 'character-jiang-xuan', name: l('姜萱', 'Jiang Xuan'), imageUrl: PREVIEW_IMAGES[1], kind: 'character' },
    { id: 'character-diners', name: l('食客群体', 'Diners'), imageUrl: PREVIEW_IMAGES[0], kind: 'character' },
    { id: 'character-chu-qing', name: l('楚青', 'Chu Qing'), imageUrl: PREVIEW_IMAGES[1], kind: 'character' },
    { id: 'scene-street-stall', name: l('街边店铺', 'Street stall'), imageUrl: PREVIEW_IMAGES[2], kind: 'scene' },
    { id: 'scene-night', name: l('夜景氛围', 'Night ambience'), imageUrl: PREVIEW_IMAGES[3], kind: 'scene' },
  ], [l])
  const initialClips = useMemo(
    () => (remoteInitialClips && remoteInitialClips.length > 0
      ? remoteInitialClips
      : splitIntoClips(episodes)),
    [episodes, remoteInitialClips],
  )
  const hasRemoteInitialClips = Boolean(remoteInitialClips && remoteInitialClips.length > 0)
  const sourceSignature = useMemo(() => {
    if (!hasRemoteInitialClips) return buildEpisodeSourceSignature(episodes)
    return `storyboard:${initialClips.map((clip) => [
      clip.id,
      clip.title,
      clip.description,
      clip.sourceType ?? '',
      clip.manuallyAdded === undefined ? '' : Number(clip.manuallyAdded),
    ].join(':')).join('|')}`
  }, [episodes, hasRemoteInitialClips, initialClips])
  const [restoredDraft] = useState(() =>
    readProjectCreationDraft<ClipEditingDraft>(PROJECT_CREATION_DRAFT_KEYS.clips))
  const canRestoreDraft = restoredDraft?.sourceSignature === sourceSignature
  const restoredClips = canRestoreDraft
    && Array.isArray(restoredDraft.clips)
    && restoredDraft.clips.length > 0
    ? restoredDraft.clips.map((clip) => {
      const initialClip = initialClips.find((item) => item.id === clip.id)
      const sourceType = initialClip?.sourceType ?? clip.sourceType ?? null
      return {
        ...clip,
        sourceType,
        revisionNo: clip.revisionNo ?? initialClip?.revisionNo ?? null,
        manuallyAdded: resolveManuallyDeletable(
          sourceType,
          initialClip?.manuallyAdded ?? clip.manuallyAdded ?? Boolean(clip.id.startsWith('clip-')),
        ),
      }
    })
    : initialClips
  const restoredActiveClipId = canRestoreDraft
    && restoredClips.some((clip) => clip.id === restoredDraft.activeClipId)
    ? restoredDraft.activeClipId
    : restoredClips[0]?.id ?? ''
  const [clips, setClips] = useState(restoredClips)
  const [activeClipId, setActiveClipId] = useState(restoredActiveClipId)
  const [mode, setMode] = useState<GenerationMode>(
    canRestoreDraft && isGenerationMode(restoredDraft.mode) ? restoredDraft.mode : hasRemoteInitialClips ? 'video' : 'image',
  )
  const [promptByClip, setPromptByClip] = useState<Record<string, string>>(
    canRestoreDraft ? restoredDraft.promptByClip : {},
  )
  const [model, setModel] = useState(canRestoreDraft ? restoredDraft.model : '')
  const [resolution, setResolution] = useState(canRestoreDraft ? restoredDraft.resolution : DEFAULT_IMAGE_RESOLUTION)
  const [videoModel, setVideoModel] = useState(canRestoreDraft ? restoredDraft.videoModel : '')
  const [videoResolution, setVideoResolution] = useState(
    canRestoreDraft
      ? normalizeVideoResolutionValue(restoredDraft.videoResolution) || DEFAULT_VIDEO_RESOLUTION
      : DEFAULT_VIDEO_RESOLUTION,
  )
  const [videoDuration, setVideoDuration] = useState(DEFAULT_VIDEO_DURATION)
  const [videoSpecOpen, setVideoSpecOpen] = useState(false)
  const [videoVoiceTipVisible, setVideoVoiceTipVisible] = useState(true)
  const [referenceAddMenuOpen, setReferenceAddMenuOpen] = useState(false)
  const [characterReferenceModalOpen, setCharacterReferenceModalOpen] = useState(false)
  const [characterReferenceQuery, setCharacterReferenceQuery] = useState('')
  const [selectedCharacterReferenceIds, setSelectedCharacterReferenceIds] = useState<string[]>([])
  const [sceneReferenceModalOpen, setSceneReferenceModalOpen] = useState(false)
  const [sceneReferenceQuery, setSceneReferenceQuery] = useState('')
  const [selectedSceneReferenceIds, setSelectedSceneReferenceIds] = useState<string[]>([])
  const [propReferenceModalOpen, setPropReferenceModalOpen] = useState(false)
  const [propReferenceQuery, setPropReferenceQuery] = useState('')
  const [selectedPropReferenceIds, setSelectedPropReferenceIds] = useState<string[]>([])
  const [voiceReferenceModalOpen, setVoiceReferenceModalOpen] = useState(false)
  const [selectedVoiceReferenceIds, setSelectedVoiceReferenceIds] = useState<string[]>([])
  const [referenceOptionsBySource, setReferenceOptionsBySource] = useState<
    Partial<Record<StudioStoryboardVideoReferenceOptionSource, ReferenceOptionsState>>
  >({})
  const [deletingReferenceKeys, setDeletingReferenceKeys] = useState<string[]>([])
  const [selectedRatio, setSelectedRatio] = useState(
    canRestoreDraft ? restoredDraft.selectedRatio : ratio || '9:16',
  )
  const [selectedTone, setSelectedTone] = useState(
    canRestoreDraft && toneStyleOptions.some((item) => String(item.id) === restoredDraft.selectedTone) ? restoredDraft.selectedTone : NO_TONE_VALUE,
  )
  const [selectedStyle, setSelectedStyle] = useState(
    canRestoreDraft && visualStyleOptions.some((item) => String(item.id) === restoredDraft.selectedStyle) ? restoredDraft.selectedStyle : NO_STYLE_VALUE,
  )
  const createStyleSelectOptions = (
    sourceOptions: Array<{ id?: string | number | null, name: string, coverUrl?: string }>,
    emptyValue: string,
    emptyLabel: string,
  ): Array<{ value: string, trigger: string, label: ReactNode }> => {
    const options = new Map<string, { value: string, trigger: string, coverUrl?: string, isNone?: boolean }>()

    options.set(emptyValue, {
      value: emptyValue,
      trigger: emptyLabel,
      isNone: true,
    })
    sourceOptions.forEach((option) => {
      const name = option.name.trim()
      if (!name || option.id == null) return
      const existing = options.get(String(option.id))
      options.set(String(option.id), {
        value: String(option.id),
        trigger: existing?.trigger ?? name,
        coverUrl: option.coverUrl ?? existing?.coverUrl,
        isNone: existing?.isNone,
      })
    })

    return [...options.values()].map((option) => ({
      value: option.value,
      trigger: option.trigger,
      label: (
        <span className="asset-generation-workspace__style-option">
          <span className="asset-generation-workspace__style-option-thumb">
            {option.coverUrl ? (
              <img src={option.coverUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />
            ) : option.isNone ? <StopOutlined /> : <PictureOutlined />}
          </span>
          <span className="asset-generation-workspace__style-option-name" title={option.trigger}>
            {option.trigger}
          </span>
        </span>
      ),
    }))
  }
  const styleOptions = useMemo<Array<{ value: string, trigger: string, label: ReactNode }>>(() => {
    return createStyleSelectOptions(
      visualStyleOptions,
      NO_STYLE_VALUE,
      l('无风格', 'No style'),
    )
  }, [l, selectedStyle, styleName, visualStyleOptions])
  const toneOptions = useMemo<Array<{ value: string, trigger: string, label: ReactNode }>>(() => {
    return createStyleSelectOptions(
      toneStyleOptions,
      NO_TONE_VALUE,
      l('无风格', 'No style'),
    )
  }, [l, selectedTone, toneStyleName, toneStyleOptions])
  const [storyboardSkillEnabled, setStoryboardSkillEnabled] = useState(
    canRestoreDraft ? restoredDraft.storyboardSkillEnabled : false,
  )
  const [editingClipId, setEditingClipId] = useState<string | null>(null)
  const [insertingAt, setInsertingAt] = useState<number | null>(null)
  const [clipEditorMode, setClipEditorMode] = useState<ClipEditorMode>('edit')
  const [expandedDescriptionClipId, setExpandedDescriptionClipId] = useState<string | null>(null)
  const [editingDescription, setEditingDescription] = useState('')
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [referenceVideoPreview, setReferenceVideoPreview] = useState<{ url: string; name: string } | null>(null)
  const [mediaDownloadingFileId, setMediaDownloadingFileId] = useState<string | null>(null)
  const [historyIndexByClip, setHistoryIndexByClip] = useState<Record<string, number>>(
    canRestoreDraft ? restoredDraft.historyIndexByClip : {},
  )
  const [previewImageRatio, setPreviewImageRatio] = useState(() => getRatioValue(ratio || '9:16'))
  const [imageToVideoSource, setImageToVideoSource] = useState<{ clipId: string; item: StudioStoryboardMediaHistoryItem } | null>(null)
  const [voiceInfoVisible, setVoiceInfoVisible] = useState(true)
  const [voiceConfigExpanded, setVoiceConfigExpanded] = useState(true)
  const [voiceBasicsExpanded, setVoiceBasicsExpanded] = useState(true)
  const [voiceVolume, setVoiceVolume] = useState(canRestoreDraft ? restoredDraft.voiceVolume : 1)
  const [voiceSpeed, setVoiceSpeed] = useState(canRestoreDraft ? restoredDraft.voiceSpeed : 1)
  const [imageModels, setImageModels] = useState<StudioGenerationModel[]>([])
  const [imageModelsLoading, setImageModelsLoading] = useState(true)
  const [imageModelsError, setImageModelsError] = useState<unknown>()
  const [imageModelsRetryToken, setImageModelsRetryToken] = useState(0)
  const [videoModels, setVideoModels] = useState<StudioGenerationModel[]>([])
  const [videoModelsLoading, setVideoModelsLoading] = useState(true)
  const [videoModelsError, setVideoModelsError] = useState<unknown>()
  const [videoModelsRetryToken, setVideoModelsRetryToken] = useState(0)
  const [videoGenerateEstimate, setVideoGenerateEstimate] = useState<StudioStoryboardVideoGenerateEstimateResult>()
  const [videoGenerateEstimateLoading, setVideoGenerateEstimateLoading] = useState(false)
  const [videoGenerateEstimateError, setVideoGenerateEstimateError] = useState<unknown>()
  const [imageGenerateCreditCost, setImageGenerateCreditCost] = useState<number>()
  const [imageGenerateEstimateLoading, setImageGenerateEstimateLoading] = useState(false)
  const [imageGenerateEstimateError, setImageGenerateEstimateError] = useState<unknown>()
  const [promptRegenerationByClipId, setPromptRegenerationByClipId] = useState<Record<string, PromptRegenerationState>>({})
  const [videoGenerationByClipId, setVideoGenerationByClipId] = useState<Record<string, VideoGenerationState>>({})
  const [storyboardImageSkillByClipId, setStoryboardImageSkillByClipId] = useState<Record<string, StoryboardImageSkillState>>({})
  const initialVoiceLines = (
    canRestoreDraft && Array.isArray(restoredDraft.voiceLines)
      ? restoredDraft.voiceLines
      : INITIAL_VOICE_LINES
  )
  const [voiceLines, setVoiceLines] = useState<VoiceLineDraft[]>(initialVoiceLines)
  const voiceEditorRefs = useRef(new Map<string, VoiceTextEditorHandle>())
  const [expandedVoiceLineId, setExpandedVoiceLineId] = useState<string | null>(
    initialVoiceLines[0]?.id ?? null,
  )
  const [playingVoiceLineId, setPlayingVoiceLineId] = useState<string | null>(null)
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false)
  const sourceSignatureRef = useRef(sourceSignature)
  const ratioPropRef = useRef(ratio)
  const styleNamePropRef = useRef(styleName)
  const toneStyleNamePropRef = useRef(toneStyleName)
  const segmentDetailRequestRef = useRef<StudioAssetImageTaskRequest<StudioEpisodeStoryboardSegmentDetailResult> | null>(null)
  const segmentUpdateRequestRef = useRef<StudioAssetImageTaskRequest<StudioEpisodeStoryboardSegmentDetailResult | null> | null>(null)
  const segmentInsertRequestRef = useRef<StudioAssetImageTaskRequest<StudioEpisodeStoryboardSegmentDetailResult | null> | null>(null)
  const segmentMergeRequestRef = useRef<StudioAssetImageTaskRequest<StudioEpisodeStoryboardSegmentDetailResult | null> | null>(null)
  const segmentDeleteRequestRefs = useRef(new Map<string, StudioAssetImageTaskRequest<null>>())
  const mediaHistoryRequestRef = useRef<StudioAssetImageTaskRequest<StudioStoryboardMediaHistoryItem[]> | null>(null)
  const videoGenerateEstimateRequestRef = useRef<StudioAssetImageTaskRequest<StudioStoryboardVideoGenerateEstimateResult> | null>(null)
  const videoGenerateRequestRef = useRef<StudioAssetImageTaskRequest<StudioStoryboardVideoDetailResult> | null>(null)
  const videoDetailRequestRef = useRef<StudioAssetImageTaskRequest<StudioStoryboardVideoDetailResult> | null>(null)
  const videoGenerationTimerRef = useRef<PollTimerCancel | null>(null)
  const videoGenerationRunRef = useRef(0)
  const promptRegenerateRequestRef = useRef<StudioAssetImageTaskRequest<StudioStoryboardVideoPromptRegenerateResult> | null>(null)
  const promptRegenerateDetailRequestRef = useRef<StudioAssetImageTaskRequest<StudioStoryboardVideoPromptDetailResult> | null>(null)
  const promptRegenerateTimerRef = useRef<PollTimerCancel | null>(null)
  const promptRegenerateRunRef = useRef(0)
  const storyboardImageSkillRequestRef = useRef<StudioAssetImageTaskRequest<StudioStoryboardImageSkillResult> | null>(null)
  const storyboardImageSkillPendingClipIdRef = useRef<string | null>(null)
  const referenceOptionsRequestRef = useRef<StudioAssetImageTaskRequest<StudioStoryboardVideoReferenceOption[]> | null>(null)
  const referenceAddRequestRef = useRef<StudioAssetImageTaskRequest<StudioStoryboardVideoReferenceAddResult | null> | null>(null)
  const referenceDeleteRequestRefs = useRef(new Map<string, StudioAssetImageTaskRequest<StudioStoryboardVideoReferenceDeleteResult | null>>())
  const referenceOptionsRunRef = useRef(0)
  const segmentDetailLoadedKeysRef = useRef(new Set<string>())
  const manuallyEditedPromptClipIdsRef = useRef(new Set<string>())
  const manuallyAddedClipIdsRef = useRef(new Set<string>(
    restoredClips
      .filter(isClipManuallyDeletable)
      .map((clip) => clip.id),
  ))
  const pendingActiveClipIdAfterRemoteRefreshRef = useRef<string | null>(null)
  const [segmentDetailsByClipId, setSegmentDetailsByClipId] = useState<Record<string, SegmentDetailState>>({})
  const [segmentDetailRefreshToken, setSegmentDetailRefreshToken] = useState(0)
  const [mediaHistoryByClipId, setMediaHistoryByClipId] = useState<Record<string, SegmentMediaHistoryState>>({})
  const [mediaHistoryRefreshToken, setMediaHistoryRefreshToken] = useState(0)
  const [clipEditorSaving, setClipEditorSaving] = useState(false)
  const [mergingClipIds, setMergingClipIds] = useState<string[]>([])
  const [deletingClipIds, setDeletingClipIds] = useState<string[]>([])
  const [deleteConfirmClipId, setDeleteConfirmClipId] = useState<string | null>(null)
  const [referenceAddingSource, setReferenceAddingSource] = useState<StudioStoryboardVideoReferenceOptionSource | null>(null)
  const segmentDetailsByClipIdRef = useRef(segmentDetailsByClipId)
  segmentDetailsByClipIdRef.current = segmentDetailsByClipId
  const mediaHistoryByClipIdRef = useRef(mediaHistoryByClipId)
  mediaHistoryByClipIdRef.current = mediaHistoryByClipId
  const persistableVoiceLines = useMemo(() => voiceLines.map((line) => ({
    ...line,
    expressionPanel: null,
    customPauseExpanded: false,
    emotionExpanded: false,
  })), [voiceLines])

  useProjectCreationDraft(PROJECT_CREATION_DRAFT_KEYS.clips, {
    sourceSignature,
    clips,
    activeClipId,
    mode,
    promptByClip,
    model,
    resolution,
    videoModel,
    videoResolution,
    videoDuration,
    selectedRatio,
    selectedTone,
    selectedStyle,
    storyboardSkillEnabled,
    historyIndexByClip,
    voiceVolume,
    voiceSpeed,
    voiceLines: persistableVoiceLines,
  })
  const activeClip = clips.find((clip) => clip.id === activeClipId) ?? clips[0]
  const [draggedHistory, setDraggedHistory] = useState<StudioStoryboardMediaHistoryItem | null>(null)
  const draggedHistoryRef = useRef<StudioStoryboardMediaHistoryItem | null>(null)
  const [referenceDropHover, setReferenceDropHover] = useState(false)
  const [referenceDropBusy, setReferenceDropBusy] = useState(false)
  const referenceDropRequest = useRef<{ cancel: () => void }>()
  // Native dragend also fires for Escape and unsuccessful drops, restoring the normal reference row.
  useEffect(() => {
    const reset = () => { draggedHistoryRef.current = null; setDraggedHistory(null); setReferenceDropHover(false) }
    reset(); setReferenceDropBusy(false)
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') reset() }
    window.addEventListener('dragend', reset); window.addEventListener('drop', reset); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('dragend', reset); window.removeEventListener('drop', reset); window.removeEventListener('keydown', key); referenceDropRequest.current?.cancel(); referenceDropRequest.current = undefined }
  }, [activeClip?.id, mode])
  const workflow = useWorkflowMedia(hasRemoteInitialClips && activeClip && !activeClip.id.startsWith('clip-') ? activeClip.id : undefined)
  const [imageQuality, setImageQuality] = useState<number | null>(null)
  const [mediaSubmitting, setMediaSubmitting] = useState(false)
  const activeSegmentDetailState = activeClip ? segmentDetailsByClipId[activeClip.id] : undefined
  const activeSegmentDetail = activeSegmentDetailState?.data
  // Freeze the selected image references for both estimation and submission; an empty selection stays empty.
  const imageReferenceFileIds = useMemo(() => [...new Set((activeSegmentDetail?.referenceSelection?.references
    ?? activeSegmentDetail?.imagePrompt?.references ?? activeSegmentDetail?.directorPrompt?.references ?? [])
    .filter((item) => item.referenceType !== 6 && item.referenceType !== 7)
    .map((item) => Number(item.fileId)).filter((id) => Number.isSafeInteger(id) && id > 0))], [activeSegmentDetail])
  const activeMediaHistoryState = activeClip ? mediaHistoryByClipId[activeClip.id] : undefined
  const generatingTask = (activeClip ? workflow.tasks[activeClip.id] ?? [] : [])
    .filter((item) => item.mediaType === mode && (item.status === 1 || item.status === 2 || (item.status === 3 && (!item.outputFileId || !item.outputUrl))))
    .sort((a, b) => b.id - a.id)[0]
  const generationProgress = typeof generatingTask?.progress === 'number' && Number.isFinite(generatingTask.progress)
    ? Math.max(0, Math.min(100, Math.round(generatingTask.progress))) : undefined
  const appliedCompletion = useRef<object>()
  // Manual history selection takes precedence over the tasks already running at click time.
  const [historyPreviewTasks, setHistoryPreviewTasks] = useState<Record<string, string[]>>({})
  const historyPreviewTasksRef = useRef(historyPreviewTasks)
  historyPreviewTasksRef.current = historyPreviewTasks
  const showGenerationPlaceholder = Boolean(generatingTask && !historyPreviewTasks[activeClip!.id]?.includes(`${generatingTask.mediaType}:${generatingTask.id}`))
  const activePromptRegenerationState = activeClip ? promptRegenerationByClipId[activeClip.id] : undefined
  const activeVideoGenerationState = activeClip ? videoGenerationByClipId[activeClip.id] : undefined
  const activeStoryboardImageSkillState = activeClip ? storyboardImageSkillByClipId[activeClip.id] : undefined
  const canUseRemoteStoryboardImageSkill = Boolean(
    activeClip && hasRemoteInitialClips && !activeClip.id.startsWith('clip-'),
  )
  const storyboardMasterSkillEnabled = canUseRemoteStoryboardImageSkill
    ? activeStoryboardImageSkillState?.enabled ?? Boolean(
        activeSegmentDetail?.imagePrompt?.canUndoSkill
        || activeSegmentDetail?.imagePrompt?.skillCode === STORYBOARD_MASTER_SKILL_CODE
        || activeSegmentDetail?.directorPrompt?.canUndoSkill
        || activeSegmentDetail?.directorPrompt?.skillCode === STORYBOARD_MASTER_SKILL_CODE,
      )
    : storyboardSkillEnabled
  const storyboardImageSkillBusy = Boolean(activeStoryboardImageSkillState?.loading)
  const storyboardImageSkillActionText = storyboardImageSkillBusy
    ? activeStoryboardImageSkillState?.action === 'undo'
      ? l('撤回中', 'Undoing')
      : l('使用中', 'Applying')
    : storyboardMasterSkillEnabled
      ? l('点击撤回', 'Undo')
      : l('点击使用', 'Use')
  const promptMentionAssets = useMemo(() => {
    const storyboardAssets = storyboardSegmentDetailToMentionAssets(activeSegmentDetail, mode)
    return hasRemoteInitialClips ? storyboardAssets : storyboardAssets.length > 0 ? storyboardAssets : fallbackPromptMentionAssets
  }, [activeSegmentDetail, fallbackPromptMentionAssets, hasRemoteInitialClips, mode])
  const activeReferenceOptionsSegmentKey = activeClip && hasRemoteInitialClips && !activeClip.id.startsWith('clip-')
    ? String(toStoryboardSegmentRequestId(activeClip.id))
    : ''
  const characterReferenceOptionsState = referenceOptionsBySource.character?.segmentId === activeReferenceOptionsSegmentKey
    ? referenceOptionsBySource.character
    : undefined
  const sceneReferenceOptionsState = referenceOptionsBySource.scene?.segmentId === activeReferenceOptionsSegmentKey
    ? referenceOptionsBySource.scene
    : undefined
  const propReferenceOptionsState = referenceOptionsBySource.prop?.segmentId === activeReferenceOptionsSegmentKey
    ? referenceOptionsBySource.prop
    : undefined
  const dubbingReferenceOptionsState = referenceOptionsBySource.dubbing?.segmentId === activeReferenceOptionsSegmentKey
    ? referenceOptionsBySource.dubbing
    : undefined
  const characterReferenceAssets = useMemo(() => (
    (characterReferenceOptionsState?.items ?? []).map(referenceOptionToAsset)
  ), [characterReferenceOptionsState?.items])
  const sceneReferenceAssets = useMemo(() => (
    (sceneReferenceOptionsState?.items ?? []).map(referenceOptionToAsset)
  ), [sceneReferenceOptionsState?.items])
  const propReferenceAssets = useMemo(() => (
    (propReferenceOptionsState?.items ?? []).map(referenceOptionToAsset)
  ), [propReferenceOptionsState?.items])
  const activePromptSource = mode === 'image'
    ? activeSegmentDetail?.imagePrompt
    : activeSegmentDetail?.directorPrompt
  const activePromptDraftKey = activeClip ? getPromptDraftKey(activeClip.id, mode) : ''
  const activePromptFromDetail = activePromptSource?.prompt.trim()
  const prompt = activeClip
    ? promptByClip[activePromptDraftKey]
      ?? (mode === 'video' ? promptByClip[activeClip.id] : undefined)
      ?? activePromptFromDetail
      ?? activeClip.prompt
    : ''
  const activeHistoryItems = useMemo(() => (activeMediaHistoryState?.items ?? [])
    .filter((item) => item.status === 3 && item.outputReady !== false && item.outputFileId != null && getStoryboardMediaOutputUrl(item)), [activeMediaHistoryState?.items])
  const storedHistoryIndex = activeClip ? historyIndexByClip[activeClip.id] ?? 0 : 0
  const activeHistoryIndex = Math.min(Math.max(storedHistoryIndex, 0), Math.max(0, activeHistoryItems.length - 1))
  const activeHistoryItem = activeHistoryItems[activeHistoryIndex]
  const activeMediaUrl = getStoryboardMediaOutputUrl(activeHistoryItem)
  const activeMediaThumbnailUrl = getStoryboardMediaThumbnailUrl(activeHistoryItem)
  const hasActiveVideo = activeHistoryItem?.mediaType === 'video' && Boolean(activeMediaUrl)
  const hasActiveImage = activeHistoryItem?.mediaType !== 'video' && Boolean(activeMediaUrl)
  const activeImageUrl = hasActiveImage ? activeMediaUrl : ''
  const activeVideoUrl = hasActiveVideo ? activeMediaUrl : ''
  // Warm only adjacent full-size images so switching does not start every download from scratch.
  useEffect(() => {
    const images = [activeHistoryItems[activeHistoryIndex - 1], activeHistoryItems[activeHistoryIndex + 1]]
      .filter((item) => item?.mediaType === 'image')
      .map((item) => {
        const image = new window.Image()
        image.decoding = 'async'
        image.src = getStoryboardMediaOutputUrl(item)
        void image.decode().catch(() => undefined)
        return image
      })
    return () => { images.forEach((image) => { image.src = '' }) }
  }, [activeHistoryItems, activeHistoryIndex])
  const activeMediaFileId = normalizeMediaFileId(activeHistoryItem?.outputFileId)
  const activePreviewRatio = hasActiveImage && !activeHistoryItem?.aspectRatio
    ? previewImageRatio
    : getStoryboardMediaRatio(activeHistoryItem, selectedRatio)
  const selectedVisualStyleIdForGeneration = useMemo(() => (
    getGenerationStyleId(visualStyleOptions, selectedStyle, NO_STYLE_VALUE)
  ), [selectedStyle, visualStyleOptions])
  const selectedToneStyleIdForGeneration = useMemo(() => (
    getGenerationStyleId(toneStyleOptions, selectedTone, NO_TONE_VALUE)
  ), [selectedTone, toneStyleOptions])
  const imageModelOptions = useMemo(() => imageModels.map((item) => ({
    value: String(item.id),
    label: item.name,
  })), [imageModels])
  const selectedImageModelById = useMemo(() => imageModels.find(
    (item) => String(item.id) === model,
  ), [imageModels, model])
  const selectedImageModel = selectedImageModelById ?? findGenerationModelBySelection(imageModels, model)
  const imageResolutionOptions = useMemo(() => {
    const capabilityResolutions = selectedImageModel?.imageCapabilities?.resolutions ?? []
    const values = capabilityResolutions
      .map(normalizeImageResolutionValue)
      .filter(Boolean)
    return [...new Set(values.length > 0 ? values : FALLBACK_IMAGE_RESOLUTIONS)]
  }, [selectedImageModel])
  const videoModelOptions = useMemo(() => videoModels.map((item) => ({
    value: String(item.id),
    label: item.name,
  })), [videoModels])
  const selectedVideoModelById = useMemo(() => videoModels.find(
    (item) => String(item.id) === videoModel,
  ), [videoModel, videoModels])
  const selectedVideoModel = selectedVideoModelById ?? findGenerationModelBySelection(videoModels, videoModel)
  const characterReferenceLimit = Math.max(
    1,
    Math.floor(Number(selectedVideoModel?.videoCapabilities?.maxReferenceImages) || 30),
  )
  const selectedCharacterReferenceAssets = useMemo(() => {
    const assetById = new Map(characterReferenceAssets.map((asset) => [asset.id, asset]))
    return selectedCharacterReferenceIds
      .map((id) => assetById.get(id))
      .filter((asset): asset is ReferenceOptionAsset => Boolean(asset))
  }, [characterReferenceAssets, selectedCharacterReferenceIds])
  const filteredCharacterReferenceAssets = useMemo(() => {
    const query = characterReferenceQuery.trim().toLocaleLowerCase()
    if (!query) return characterReferenceAssets
    return characterReferenceAssets.filter((asset) => getPromptMentionTexts(asset)
      .some((text) => text.toLocaleLowerCase().includes(query)))
  }, [characterReferenceAssets, characterReferenceQuery])
  const characterReferenceGroups = useMemo(() => {
    const groups = new Map<string, ReferenceOptionAsset[]>()
    filteredCharacterReferenceAssets.forEach((asset) => {
      const groupName = (asset.characterName ?? asset.assetName ?? asset.name).trim() || l('未命名角色', 'Unnamed character')
      groups.set(groupName, [...(groups.get(groupName) ?? []), asset])
    })
    return [...groups.entries()].map(([name, assets]) => ({ name, assets }))
  }, [filteredCharacterReferenceAssets, l])
  const sceneReferenceLimit = 1
  const selectedSceneReferenceAssets = useMemo(() => {
    const assetById = new Map(sceneReferenceAssets.map((asset) => [asset.id, asset]))
    return selectedSceneReferenceIds
      .map((id) => assetById.get(id))
      .filter((asset): asset is ReferenceOptionAsset => Boolean(asset))
  }, [sceneReferenceAssets, selectedSceneReferenceIds])
  const filteredSceneReferenceAssets = useMemo(() => {
    const query = sceneReferenceQuery.trim().toLocaleLowerCase()
    if (!query) return sceneReferenceAssets
    return sceneReferenceAssets.filter((asset) => getPromptMentionTexts(asset)
      .some((text) => text.toLocaleLowerCase().includes(query)))
  }, [sceneReferenceAssets, sceneReferenceQuery])
  const sceneReferenceGroups = useMemo(() => {
    const groups = new Map<string, ReferenceOptionAsset[]>()
    filteredSceneReferenceAssets.forEach((asset) => {
      const groupName = asset.name.trim() || l('未命名场景', 'Unnamed scene')
      groups.set(groupName, [...(groups.get(groupName) ?? []), asset])
    })
    return [...groups.entries()].map(([name, assets]) => ({ name, assets }))
  }, [filteredSceneReferenceAssets, l])
  const propReferenceLimit = characterReferenceLimit
  const selectedPropReferenceAssets = useMemo(() => {
    const assetById = new Map(propReferenceAssets.map((asset) => [asset.id, asset]))
    return selectedPropReferenceIds
      .map((id) => assetById.get(id))
      .filter((asset): asset is ReferenceOptionAsset => Boolean(asset))
  }, [propReferenceAssets, selectedPropReferenceIds])
  const filteredPropReferenceAssets = useMemo(() => {
    const query = propReferenceQuery.trim().toLocaleLowerCase()
    if (!query) return propReferenceAssets
    return propReferenceAssets.filter((asset) => getPromptMentionTexts(asset)
      .some((text) => text.toLocaleLowerCase().includes(query)))
  }, [propReferenceAssets, propReferenceQuery])
  const propReferenceGroups = useMemo(() => {
    const groups = new Map<string, ReferenceOptionAsset[]>()
    filteredPropReferenceAssets.forEach((asset) => {
      const groupName = asset.name.trim() || l('未命名道具', 'Unnamed prop')
      groups.set(groupName, [...(groups.get(groupName) ?? []), asset])
    })
    return [...groups.entries()].map(([name, assets]) => ({ name, assets }))
  }, [filteredPropReferenceAssets, l])
  const voiceReferenceLimit = 10
  const voiceReferenceItems = useMemo<VoiceReferenceItem[]>(() => {
    return (dubbingReferenceOptionsState?.items ?? []).map(referenceOptionToVoiceItem)
  }, [dubbingReferenceOptionsState?.items])
  const selectedVoiceReferenceItems = useMemo(() => {
    const itemById = new Map(voiceReferenceItems.map((item) => [item.id, item]))
    return selectedVoiceReferenceIds
      .map((id) => itemById.get(id))
      .filter((item): item is VoiceReferenceItem => Boolean(item))
  }, [selectedVoiceReferenceIds, voiceReferenceItems])
  const videoResolutionOptions = useMemo(() => {
    const capabilityResolutions = selectedVideoModel?.videoCapabilities?.resolutions ?? []
    const values = capabilityResolutions
      .map(normalizeVideoResolutionValue)
      .filter(Boolean)
    return [...new Set(values.length > 0 ? values : FALLBACK_VIDEO_RESOLUTIONS)]
  }, [selectedVideoModel])
  const videoDurationRange = getVideoDurationRange(selectedVideoModel?.videoCapabilities)
  const videoDurationMin = videoDurationRange.min
  const videoDurationMax = videoDurationRange.max
  const suggestedVideoDuration = normalizePositiveIntegerOrNull(
    activeSegmentDetail?.directorPrompt?.suggestedDurationSeconds
      ?? activeSegmentDetail?.suggestedDurationSeconds,
  )
  const rawVideoDuration = Number(videoDuration)
  const boundedVideoDuration = clampNumber(
    Math.round(Number.isFinite(rawVideoDuration) ? rawVideoDuration : DEFAULT_VIDEO_DURATION),
    videoDurationMin,
    videoDurationMax,
  )
  const videoDurationProgress = videoDurationMax > videoDurationMin
    ? clampNumber(((boundedVideoDuration - videoDurationMin) / (videoDurationMax - videoDurationMin)) * 100, 0, 100)
    : 100
  const videoGenerateCreditCostText = videoGenerateEstimateLoading && !videoGenerateEstimate
    ? '…'
    : formatCreditCost(videoGenerateEstimate?.creditCost)
  const activeVideoGenerationProgressText = activeVideoGenerationState?.progress === undefined
    || activeVideoGenerationState?.progress === null
    ? ''
    : ` ${Math.max(0, Math.min(100, Math.round(activeVideoGenerationState.progress)))}%`
  const activeVideoGenerationStatusText = activeVideoGenerationState?.statusName
    || l('正在生成视频', 'Generating video')
  const isActiveVideoGenerating = Boolean(activeVideoGenerationState?.loading)
  const getReferenceOptionLimit = (source: StudioStoryboardVideoReferenceOptionSource) => {
    if (source === 'scene') return sceneReferenceLimit
    if (source === 'prop') return propReferenceLimit
    if (source === 'dubbing') return voiceReferenceLimit
    return characterReferenceLimit
  }

  const getReferenceOptionsStateBySource = (source: StudioStoryboardVideoReferenceOptionSource) => {
    if (source === 'scene') return sceneReferenceOptionsState
    if (source === 'prop') return propReferenceOptionsState
    if (source === 'dubbing') return dubbingReferenceOptionsState
    return characterReferenceOptionsState
  }

  const getSelectedReferenceIdsBySource = (source: StudioStoryboardVideoReferenceOptionSource) => {
    if (source === 'scene') return selectedSceneReferenceIds
    if (source === 'prop') return selectedPropReferenceIds
    if (source === 'dubbing') return selectedVoiceReferenceIds
    return selectedCharacterReferenceIds
  }

  const closeReferenceModalBySource = (source: StudioStoryboardVideoReferenceOptionSource) => {
    if (source === 'scene') setSceneReferenceModalOpen(false)
    else if (source === 'prop') setPropReferenceModalOpen(false)
    else if (source === 'dubbing') setVoiceReferenceModalOpen(false)
    else setCharacterReferenceModalOpen(false)
  }

  const getReferenceOptionSelectionId = (
    source: StudioStoryboardVideoReferenceOptionSource,
    option: StudioStoryboardVideoReferenceOption,
    index: number,
  ) => (
    source === 'dubbing'
      ? referenceOptionToVoiceItem(option, index).id
      : referenceOptionToAsset(option, index).id
  )

  const getFallbackReferenceType = (source: StudioStoryboardVideoReferenceOptionSource) => {
    if (source === 'character') return 1
    if (source === 'scene') return 2
    if (source === 'prop') return 3
    return undefined
  }

  const getReferenceSelectionRevisionNo = (
    source: StudioStoryboardVideoReferenceOptionSource,
    options: StudioStoryboardVideoReferenceOption[],
  ) => {
    const revisionNo = Math.floor(Number(
      options.find((option) => option.referenceSelectionRevisionNo !== null && option.referenceSelectionRevisionNo !== undefined)
        ?.referenceSelectionRevisionNo
        ?? getReferenceOptionsStateBySource(source)?.items?.find((option) => (
          option.referenceSelectionRevisionNo !== null && option.referenceSelectionRevisionNo !== undefined
        ))?.referenceSelectionRevisionNo
        ?? activeSegmentDetail?.referenceSelection?.revisionNo,
    ))
    return Number.isInteger(revisionNo) && revisionNo >= 0 ? revisionNo : null
  }

  const referenceOptionToAddItem = (
    option: StudioStoryboardVideoReferenceOption,
  ): StudioStoryboardVideoReferenceAddItem | null => {
    const displayName = getReferenceOptionName(option) || option.displayName.trim()
    if (!displayName) return null
    return {
      referenceType: option.referenceType ?? getFallbackReferenceType(option.source),
      fileId: option.fileId ?? undefined,
      assetId: option.assetId ?? undefined,
      characterLookId: option.characterLookId ?? undefined,
      sourceSegmentId: option.sourceSegmentId ?? undefined,
      durationSeconds: option.durationSeconds ?? undefined,
      audioSource: option.audioSource ?? undefined,
      voiceId: option.voiceId ?? undefined,
      voiceName: option.voiceName ?? undefined,
      characterName: option.characterName ?? undefined,
      dubbingGenerationId: option.dubbingGenerationId ?? undefined,
      displayName,
    }
  }

  const syncSelectedReferenceOptions = (
    source: StudioStoryboardVideoReferenceOptionSource,
    options: StudioStoryboardVideoReferenceOption[],
  ) => {
    const limit = getReferenceOptionLimit(source)
    const selectedIds = options
      .map((option, index) => ({
        id: source === 'dubbing'
          ? referenceOptionToVoiceItem(option, index).id
          : referenceOptionToAsset(option, index).id,
        selected: option.selected,
      }))
      .filter((item) => item.selected)
      .map((item) => item.id)
      .slice(0, limit)

    if (source === 'character') setSelectedCharacterReferenceIds(selectedIds)
    else if (source === 'scene') setSelectedSceneReferenceIds(selectedIds)
    else if (source === 'prop') setSelectedPropReferenceIds(selectedIds)
    else setSelectedVoiceReferenceIds(selectedIds)
  }
  const loadReferenceOptionsForSource = (source: StudioStoryboardVideoReferenceOptionSource) => {
    if (!activeClip || !hasRemoteInitialClips || activeClip.id.startsWith('clip-')) return false

    const segmentId = toStoryboardSegmentRequestId(activeClip.id)
    const segmentKey = String(segmentId)
    referenceOptionsRunRef.current += 1
    const run = referenceOptionsRunRef.current
    referenceOptionsRequestRef.current?.cancel()
    const request = StudioAssetGenerationApi.requestStoryboardVideoReferenceOptions({ segmentId, source })
    referenceOptionsRequestRef.current = request

    setReferenceOptionsBySource((current) => ({
      ...current,
      [source]: {
        segmentId: segmentKey,
        loading: true,
        items: undefined,
        error: undefined,
      },
    }))

    void request.promise
      .then((options) => {
        if (referenceOptionsRunRef.current !== run || referenceOptionsRequestRef.current !== request) return
        setReferenceOptionsBySource((current) => ({
          ...current,
          [source]: {
            segmentId: segmentKey,
            loading: false,
            items: options,
          },
        }))
        syncSelectedReferenceOptions(source, options)
      })
      .catch((error) => {
        if (referenceOptionsRunRef.current !== run || referenceOptionsRequestRef.current !== request) return
        setReferenceOptionsBySource((current) => ({
          ...current,
          [source]: {
            segmentId: segmentKey,
            loading: false,
            items: [],
            error,
          },
        }))
        message.error(getApiErrorMessage(error, l('参考选项加载失败，请重试', 'Failed to load reference options; retry')))
      })
      .finally(() => {
        if (referenceOptionsRequestRef.current === request) referenceOptionsRequestRef.current = null
      })

    return true
  }
  const openCharacterReferenceModal = () => {
    setReferenceAddMenuOpen(false)
    setCharacterReferenceQuery('')
    if (!loadReferenceOptionsForSource('character')) setSelectedCharacterReferenceIds([])
    setCharacterReferenceModalOpen(true)
  }
  const toggleCharacterReferenceAsset = (asset: PromptMentionAsset) => {
    if (selectedCharacterReferenceIds.includes(asset.id)) {
      deleteReferenceOptionAsset(asset as ReferenceOptionAsset)
      return
    }
    if ('selectable' in asset && !asset.selectable && !selectedCharacterReferenceIds.includes(asset.id)) return
    setSelectedCharacterReferenceIds((current) => {
      if (current.length >= characterReferenceLimit) {
        message.warning(l(`最多只能选择 ${characterReferenceLimit} 个参考素材`, `Up to ${characterReferenceLimit} references`))
        return current
      }
      return [...current, asset.id]
    })
  }
  const confirmCharacterReferenceSelection = () => {
    addSelectedReferencesForSource('character')
  }
  const openSceneReferenceModal = () => {
    setReferenceAddMenuOpen(false)
    setSceneReferenceQuery('')
    if (!loadReferenceOptionsForSource('scene')) setSelectedSceneReferenceIds([])
    setSceneReferenceModalOpen(true)
  }
  const toggleSceneReferenceAsset = (asset: PromptMentionAsset) => {
    if (selectedSceneReferenceIds.includes(asset.id)) {
      deleteReferenceOptionAsset(asset as ReferenceOptionAsset)
      return
    }
    if ('selectable' in asset && !asset.selectable && !selectedSceneReferenceIds.includes(asset.id)) return
    setSelectedSceneReferenceIds([asset.id])
  }
  const confirmSceneReferenceSelection = () => {
    addSelectedReferencesForSource('scene')
  }
  const openPropReferenceModal = () => {
    setReferenceAddMenuOpen(false)
    setPropReferenceQuery('')
    if (!loadReferenceOptionsForSource('prop')) setSelectedPropReferenceIds([])
    setPropReferenceModalOpen(true)
  }
  const togglePropReferenceAsset = (asset: PromptMentionAsset) => {
    if (selectedPropReferenceIds.includes(asset.id)) {
      deleteReferenceOptionAsset(asset as ReferenceOptionAsset)
      return
    }
    if ('selectable' in asset && !asset.selectable && !selectedPropReferenceIds.includes(asset.id)) return
    setSelectedPropReferenceIds((current) => {
      if (current.length >= propReferenceLimit) {
        message.warning(l(`最多只能选择 ${propReferenceLimit} 个参考素材`, `Up to ${propReferenceLimit} references`))
        return current
      }
      return [...current, asset.id]
    })
  }
  const confirmPropReferenceSelection = () => {
    addSelectedReferencesForSource('prop')
  }
  const openVoiceReferenceModal = () => {
    setReferenceAddMenuOpen(false)
    if (!loadReferenceOptionsForSource('dubbing')) setSelectedVoiceReferenceIds([])
    setVoiceReferenceModalOpen(true)
  }
  const toggleVoiceReferenceItem = (item: VoiceReferenceItem) => {
    if (!item.configured) return
    if (selectedVoiceReferenceIds.includes(item.id)) {
      deleteVoiceReferenceItem(item)
      return
    }
    setSelectedVoiceReferenceIds((current) => {
      if (current.length >= voiceReferenceLimit) {
        message.warning(l(`最多只能选择 ${voiceReferenceLimit} 个出镜音色`, `Up to ${voiceReferenceLimit} voices`))
        return current
      }
      return [...current, item.id]
    })
  }
  const confirmVoiceReferenceSelection = () => {
    addSelectedReferencesForSource('dubbing')
  }
  const referenceAddMenu = (
    <div className="project-clip-editor__reference-add-menu" role="menu">
      {[
        {
          key: 'characters',
          label: l('从角色添加', 'Add from characters'),
          onClick: openCharacterReferenceModal,
        },
        {
          key: 'scenes',
          label: l('从场景添加', 'Add from scenes'),
          onClick: openSceneReferenceModal,
        },
        {
          key: 'props',
          label: l('从道具添加', 'Add from props'),
          onClick: openPropReferenceModal,
        },
        {
          key: 'voice',
          label: l('从配音添加', 'Add from voice'),
          onClick: openVoiceReferenceModal,
        },
      ].map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          onClick={item.onClick}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
  const videoGenerationButtonText = isActiveVideoGenerating
    ? `${activeVideoGenerationStatusText}${activeVideoGenerationProgressText}`
    : `${l('生视频', 'Generate video')} · ${videoGenerateCreditCostText}`
  const generationButtonDisabled = !prompt.trim()
    || (mode === 'image' && (
      !selectedImageModel
      || !normalizeImageResolutionValue(resolution)
      || Boolean(imageModelsError)
      || (imageModelsLoading && imageModelOptions.length === 0)
    ))
    || (mode === 'video' && (
      !activeClip
      || !hasRemoteInitialClips
      || activeClip.id.startsWith('clip-')
      || !selectedVideoModel
      || !normalizeVideoResolutionValue(videoResolution)
      || isActiveVideoGenerating
    ))
  const voiceRoleOptions = VOICE_BINDINGS.map(({ character, voice, adjustable }) => ({
    value: `${character}|${voice}`,
    label: (
      <span className="project-clip-editor__voice-option-label">
        <span><strong>{character}</strong><i />{l('音色', 'Voice')}：{voice}</span>
        {adjustable && <em>{l('可调情绪', 'Adjustable')}</em>}
      </span>
    ),
  }))

  useEffect(() => {
    if (sourceSignatureRef.current === sourceSignature) return
    sourceSignatureRef.current = sourceSignature
    const pendingActiveClipId = pendingActiveClipIdAfterRemoteRefreshRef.current
    const preservedManualClipIds = pendingActiveClipId ? manuallyAddedClipIdsRef.current : new Set<string>()
    const nextInitialClips = initialClips.map((clip) => {
      const sourceType = clip.sourceType ?? (preservedManualClipIds.has(clip.id) ? 2 : null)
      return {
        ...clip,
        sourceType,
        manuallyAdded: resolveManuallyDeletable(
          sourceType,
          Boolean(clip.manuallyAdded || clip.id.startsWith('clip-') || preservedManualClipIds.has(clip.id)),
        ),
      }
    })
    manuallyAddedClipIdsRef.current = new Set(
      nextInitialClips
        .filter(isClipManuallyDeletable)
        .map((clip) => clip.id),
    )
    setClips(nextInitialClips)
    setActiveClipId((currentActiveClipId) => {
      pendingActiveClipIdAfterRemoteRefreshRef.current = null
      const preferredActiveClipId = pendingActiveClipId ?? currentActiveClipId
      return nextInitialClips.some((clip) => clip.id === preferredActiveClipId)
        ? preferredActiveClipId
        : nextInitialClips[0]?.id ?? ''
    })
    setPromptByClip({})
    setEditingClipId(null)
    setInsertingAt(null)
    setClipEditorMode('edit')
    setExpandedDescriptionClipId(null)
    setHistoryIndexByClip({})
    setSegmentDetailsByClipId({})
    setSegmentDetailRefreshToken(0)
    setMediaHistoryByClipId({})
    setMediaHistoryRefreshToken(0)
    setPromptRegenerationByClipId({})
    setVideoGenerationByClipId({})
    setStoryboardImageSkillByClipId({})
    setReferenceAddMenuOpen(false)
    setCharacterReferenceModalOpen(false)
    setCharacterReferenceQuery('')
    setSelectedCharacterReferenceIds([])
    setSceneReferenceModalOpen(false)
    setSceneReferenceQuery('')
    setSelectedSceneReferenceIds([])
    setPropReferenceModalOpen(false)
    setPropReferenceQuery('')
    setSelectedPropReferenceIds([])
    setVoiceReferenceModalOpen(false)
    setSelectedVoiceReferenceIds([])
    setReferenceOptionsBySource({})
    setDeletingReferenceKeys([])
    setMergingClipIds([])
    setDeletingClipIds([])
    setReferenceAddingSource(null)
    setClipEditorSaving(false)
    setVideoDuration(DEFAULT_VIDEO_DURATION)
    setVideoGenerateEstimate(undefined)
    setVideoGenerateEstimateError(undefined)
    segmentDetailLoadedKeysRef.current.clear()
    manuallyEditedPromptClipIdsRef.current.clear()
    segmentDetailRequestRef.current?.cancel()
    segmentDetailRequestRef.current = null
    segmentUpdateRequestRef.current?.cancel()
    segmentUpdateRequestRef.current = null
    segmentInsertRequestRef.current?.cancel()
    segmentInsertRequestRef.current = null
    segmentMergeRequestRef.current?.cancel()
    segmentMergeRequestRef.current = null
    segmentDeleteRequestRefs.current.forEach((request) => request.cancel())
    segmentDeleteRequestRefs.current.clear()
    mediaHistoryRequestRef.current?.cancel()
    mediaHistoryRequestRef.current = null
    videoGenerateEstimateRequestRef.current?.cancel()
    videoGenerateEstimateRequestRef.current = null
    videoGenerateRequestRef.current?.cancel()
    videoGenerateRequestRef.current = null
    videoDetailRequestRef.current?.cancel()
    videoDetailRequestRef.current = null
    if (videoGenerationTimerRef.current !== null) {
      videoGenerationTimerRef.current()
      videoGenerationTimerRef.current = null
    }
    videoGenerationRunRef.current += 1
    promptRegenerateRequestRef.current?.cancel()
    promptRegenerateRequestRef.current = null
    promptRegenerateDetailRequestRef.current?.cancel()
    promptRegenerateDetailRequestRef.current = null
    if (promptRegenerateTimerRef.current !== null) {
      promptRegenerateTimerRef.current()
      promptRegenerateTimerRef.current = null
    }
    promptRegenerateRunRef.current += 1
    storyboardImageSkillRequestRef.current?.cancel()
    storyboardImageSkillRequestRef.current = null
    storyboardImageSkillPendingClipIdRef.current = null
    referenceOptionsRequestRef.current?.cancel()
    referenceOptionsRequestRef.current = null
    referenceOptionsRunRef.current += 1
    referenceAddRequestRef.current?.cancel()
    referenceAddRequestRef.current = null
    referenceDeleteRequestRefs.current.forEach((request) => request.cancel())
    referenceDeleteRequestRefs.current.clear()
    if (hasRemoteInitialClips) setMode('video')
  }, [hasRemoteInitialClips, initialClips, sourceSignature])

  useEffect(() => () => {
    segmentDetailRequestRef.current?.cancel()
    segmentDetailRequestRef.current = null
    segmentUpdateRequestRef.current?.cancel()
    segmentUpdateRequestRef.current = null
    segmentInsertRequestRef.current?.cancel()
    segmentInsertRequestRef.current = null
    segmentMergeRequestRef.current?.cancel()
    segmentMergeRequestRef.current = null
    segmentDeleteRequestRefs.current.forEach((request) => request.cancel())
    segmentDeleteRequestRefs.current.clear()
    mediaHistoryRequestRef.current?.cancel()
    mediaHistoryRequestRef.current = null
    videoGenerateEstimateRequestRef.current?.cancel()
    videoGenerateEstimateRequestRef.current = null
    videoGenerateRequestRef.current?.cancel()
    videoGenerateRequestRef.current = null
    videoDetailRequestRef.current?.cancel()
    videoDetailRequestRef.current = null
    if (videoGenerationTimerRef.current !== null) {
      videoGenerationTimerRef.current()
      videoGenerationTimerRef.current = null
    }
    videoGenerationRunRef.current += 1
    promptRegenerateRequestRef.current?.cancel()
    promptRegenerateRequestRef.current = null
    promptRegenerateDetailRequestRef.current?.cancel()
    promptRegenerateDetailRequestRef.current = null
    if (promptRegenerateTimerRef.current !== null) {
      promptRegenerateTimerRef.current()
      promptRegenerateTimerRef.current = null
    }
    promptRegenerateRunRef.current += 1
    storyboardImageSkillRequestRef.current?.cancel()
    storyboardImageSkillRequestRef.current = null
    storyboardImageSkillPendingClipIdRef.current = null
    referenceOptionsRequestRef.current?.cancel()
    referenceOptionsRequestRef.current = null
    referenceOptionsRunRef.current += 1
    referenceAddRequestRef.current?.cancel()
    referenceAddRequestRef.current = null
    referenceDeleteRequestRefs.current.forEach((request) => request.cancel())
    referenceDeleteRequestRefs.current.clear()
  }, [])

  useEffect(() => {
    let active = true
    setImageModelsLoading(true)
    setImageModelsError(undefined)
    void StudioModelsApi.getImageModels(imageModelsRetryToken > 0)
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
        message.error(getApiErrorMessage(error, l('图片生成模型加载失败', 'Failed to load image generation models')))
      })
      .finally(() => {
        if (active) setImageModelsLoading(false)
      })
    return () => { active = false }
  }, [imageModelsRetryToken, l])

  useEffect(() => {
    if (imageModelsLoading || imageModelsError || !imageModels.length || selectedImageModelById) return
    const defaultModel = selectedImageModel ?? imageModels.find((item) => item.defaultModel) ?? imageModels[0]
    setModel(String(defaultModel.id))
  }, [
    imageModels,
    imageModelsError,
    imageModelsLoading,
    selectedImageModel,
    selectedImageModelById,
  ])

  useEffect(() => {
    if (!selectedImageModel || imageResolutionOptions.length === 0) return
    const normalizedResolution = normalizeImageResolutionValue(resolution)
    if (imageResolutionOptions.includes(normalizedResolution)) {
      if (normalizedResolution !== resolution) setResolution(normalizedResolution)
      return
    }
    const nextResolution = imageResolutionOptions.includes(DEFAULT_IMAGE_RESOLUTION)
      ? DEFAULT_IMAGE_RESOLUTION
      : imageResolutionOptions[0]
    setResolution(nextResolution)
  }, [imageResolutionOptions, resolution, selectedImageModel])

  useEffect(() => {
    let active = true
    setVideoModelsLoading(true)
    setVideoModelsError(undefined)
    void StudioModelsApi.getVideoModels()
      .then((models) => {
        if (!active) return
        if (!models.length) {
          throw new Error(l('暂无可用的视频生成模型', 'No video generation models are available'))
        }
        setVideoModels(models)
      })
      .catch((error) => {
        if (!active) return
        setVideoModelsError(error)
        message.error(getApiErrorMessage(error, l('视频生成模型加载失败', 'Failed to load video generation models')))
      })
      .finally(() => {
        if (active) setVideoModelsLoading(false)
      })
    return () => { active = false }
  }, [l, videoModelsRetryToken])

  useEffect(() => {
    if (videoModelsLoading || videoModelsError || !videoModels.length || selectedVideoModelById) return
    const defaultModel = selectedVideoModel ?? videoModels.find((item) => item.defaultModel) ?? videoModels[0]
    setVideoModel(String(defaultModel.id))
  }, [
    selectedVideoModel,
    selectedVideoModelById,
    videoModels,
    videoModelsError,
    videoModelsLoading,
  ])

  useEffect(() => {
    if (!selectedVideoModel || videoResolutionOptions.length === 0) return
    const normalizedResolution = normalizeVideoResolutionValue(videoResolution)
    if (videoResolutionOptions.includes(normalizedResolution)) {
      if (normalizedResolution !== videoResolution) setVideoResolution(normalizedResolution)
      return
    }
    const nextResolution = videoResolutionOptions.includes(DEFAULT_VIDEO_RESOLUTION)
      ? DEFAULT_VIDEO_RESOLUTION
      : videoResolutionOptions[0]
    setVideoResolution(nextResolution)
  }, [selectedVideoModel, videoResolution, videoResolutionOptions])

  useEffect(() => {
    if (boundedVideoDuration !== videoDuration) setVideoDuration(boundedVideoDuration)
  }, [boundedVideoDuration, videoDuration])

  useEffect(() => {
    if (!hasRemoteInitialClips || !activeClipId || suggestedVideoDuration === null) return
    setVideoDuration(suggestedVideoDuration)
  }, [activeClipId, hasRemoteInitialClips, suggestedVideoDuration])

  useEffect(() => {
    setSelectedCharacterReferenceIds((current) => {
      if (current.length === 0) return current
      const availableIds = new Set(characterReferenceAssets.map((asset) => asset.id))
      const nextIds = current.filter((id) => availableIds.has(id)).slice(0, characterReferenceLimit)
      if (nextIds.length === current.length && nextIds.every((id, index) => id === current[index])) {
        return current
      }
      return nextIds
    })
  }, [characterReferenceAssets, characterReferenceLimit])

  useEffect(() => {
    setSelectedSceneReferenceIds((current) => {
      if (current.length === 0) return current
      const availableIds = new Set(sceneReferenceAssets.map((asset) => asset.id))
      const nextIds = current.filter((id) => availableIds.has(id)).slice(0, sceneReferenceLimit)
      if (nextIds.length === current.length && nextIds.every((id, index) => id === current[index])) {
        return current
      }
      return nextIds
    })
  }, [sceneReferenceAssets, sceneReferenceLimit])

  useEffect(() => {
    setSelectedPropReferenceIds((current) => {
      if (current.length === 0) return current
      const availableIds = new Set(propReferenceAssets.map((asset) => asset.id))
      const nextIds = current.filter((id) => availableIds.has(id)).slice(0, propReferenceLimit)
      if (nextIds.length === current.length && nextIds.every((id, index) => id === current[index])) {
        return current
      }
      return nextIds
    })
  }, [propReferenceAssets, propReferenceLimit])

  useEffect(() => {
    setSelectedVoiceReferenceIds((current) => {
      if (current.length === 0) return current
      const availableIds = new Set(voiceReferenceItems
        .filter((item) => item.configured)
        .map((item) => item.id))
      const nextIds = current.filter((id) => availableIds.has(id)).slice(0, voiceReferenceLimit)
      if (nextIds.length === current.length && nextIds.every((id, index) => id === current[index])) {
        return current
      }
      return nextIds
    })
  }, [voiceReferenceItems, voiceReferenceLimit])

  useEffect(() => {
    const qualities = selectedImageModel?.imageCapabilities?.qualities ?? []
    setImageQuality((current) => current != null && qualities.includes(current) ? current : qualities[0] ?? null)
  }, [selectedImageModel])
  // Quote the exact storyboard image parameters, using the same selection as submission.
  useEffect(() => {
    const modelId = Number(selectedImageModel?.id)
    const resolutionValue = Number(normalizeImageResolutionValue(resolution).replace(/k$/i, ''))
    setImageGenerateCreditCost(undefined)
    setImageGenerateEstimateError(undefined)
    if (!activeClip || activeClip.id.startsWith('clip-') || mode !== 'image' || !Number.isInteger(modelId) || modelId <= 0
      || !Number.isInteger(resolutionValue) || resolutionValue <= 0) {
      setImageGenerateEstimateLoading(false)
      return undefined
    }

    let active = true
    let request: StudioAssetImageTaskRequest<{ creditCost: number }> | undefined
    setImageGenerateEstimateLoading(true)
    const timer = window.setTimeout(() => {
      const quoteRequest = WorkflowService.estimateImage({ requestBody: {
        segmentId: Number(activeClip!.id), modelId, quality: imageQuality, resolution: resolutionValue, aspectRatio: selectedRatio,
        referenceFileIds: imageReferenceFileIds,
        visualStyleId: selectedVisualStyleIdForGeneration == null ? null : Number(selectedVisualStyleIdForGeneration),
        toneStyleId: selectedToneStyleIdForGeneration == null ? null : Number(selectedToneStyleIdForGeneration),
      } })
      request = { cancel: () => quoteRequest.cancel(), promise: quoteRequest.then(workflowData).then((value) => {
        if (value.sufficient === false) throw new Error('积分不足')
        return value
      }) }
      void request.promise
        .then((estimate) => {
          if (active) setImageGenerateCreditCost(estimate.creditCost)
        })
        .catch((error) => {
          if (active) setImageGenerateEstimateError(error)
        })
        .finally(() => {
          if (active) setImageGenerateEstimateLoading(false)
        })
    }, VIDEO_ESTIMATE_DEBOUNCE_MS)

    return () => {
      active = false
      window.clearTimeout(timer)
      request?.cancel()
    }
  }, [mode, selectedImageModel?.id, resolution, imageQuality, activeClip?.id, selectedRatio, selectedVisualStyleIdForGeneration, selectedToneStyleIdForGeneration, segmentDetailRefreshToken, imageReferenceFileIds])

  useEffect(() => {
    videoGenerateEstimateRequestRef.current?.cancel()
    videoGenerateEstimateRequestRef.current = null

    const modelId = Number(selectedVideoModel?.id)
    const resolutionValue = normalizeVideoResolutionValue(videoResolution)
    const durationSeconds = boundedVideoDuration
    if (
      !activeClip || activeClip.id.startsWith('clip-') || mode !== 'video'
      || !Number.isInteger(modelId)
      || modelId <= 0
      || !resolutionValue
      || !Number.isInteger(durationSeconds)
      || durationSeconds <= 0
    ) {
      setVideoGenerateEstimate(undefined)
      setVideoGenerateEstimateLoading(false)
      setVideoGenerateEstimateError(undefined)
      return undefined
    }

    let active = true
    let request: StudioAssetImageTaskRequest<StudioStoryboardVideoGenerateEstimateResult> | null = null
    setVideoGenerateEstimate(undefined)
    setVideoGenerateEstimateLoading(true)
    setVideoGenerateEstimateError(undefined)
    const timer = window.setTimeout(() => {
      if (!active) return
      const quoteRequest = WorkflowService.estimateVideo({ requestBody: {
        segmentId: Number(activeClip!.id), modelId, resolution: resolutionValue, durationSeconds,
        generateAudio: Boolean(selectedVideoModel?.videoCapabilities?.nativeAudioSupported), inheritPreviousVideo: true, referenceVideoDurationSeconds: 0,
      } })
      request = { cancel: () => quoteRequest.cancel(), promise: quoteRequest.then(workflowData).then((value) => {
        if (value.sufficient === false) throw new Error('积分不足')
        return { ...value, durationSeconds }
      }) }
      videoGenerateEstimateRequestRef.current = request
      void request.promise
        .then((estimate) => {
          if (!active || videoGenerateEstimateRequestRef.current !== request) return
          setVideoGenerateEstimate(estimate)
        })
        .catch((error) => {
          if (!active || videoGenerateEstimateRequestRef.current !== request) return
          setVideoGenerateEstimate(undefined)
          setVideoGenerateEstimateError(error)
        })
        .finally(() => {
          if (!active || videoGenerateEstimateRequestRef.current !== request) return
          setVideoGenerateEstimateLoading(false)
          videoGenerateEstimateRequestRef.current = null
        })
    }, VIDEO_ESTIMATE_DEBOUNCE_MS)

    return () => {
      active = false
      window.clearTimeout(timer)
      request?.cancel()
      if (request && videoGenerateEstimateRequestRef.current === request) {
        videoGenerateEstimateRequestRef.current = null
      }
    }
  }, [boundedVideoDuration, mode, selectedVideoModel, videoResolution, activeClip?.id, segmentDetailRefreshToken])

  useEffect(() => {
    segmentDetailRequestRef.current?.cancel()
    segmentDetailRequestRef.current = null

    if (!hasRemoteInitialClips || !activeClip?.id || activeClip.id.startsWith('clip-')) return undefined

    const clipId = activeClip.id
    const clipSourceType = activeClip.sourceType ?? null
    const loadedKey = `${clipId}:${segmentDetailRefreshToken}`
    if (segmentDetailLoadedKeysRef.current.has(loadedKey) && segmentDetailsByClipIdRef.current[clipId]?.data) {
      return undefined
    }

    let active = true
    const request = StudioAssetGenerationApi.requestEpisodeStoryboardSegmentDetail(clipId)
    segmentDetailRequestRef.current = request
    setSegmentDetailsByClipId((current) => ({
      ...current,
      [clipId]: {
        ...current[clipId],
        loading: true,
        error: undefined,
      },
    }))

    void request.promise
      .then((detail) => {
        if (!active || segmentDetailRequestRef.current !== request) return
        segmentDetailLoadedKeysRef.current.add(loadedKey)
        setSegmentDetailsByClipId((current) => ({
          ...current,
          [clipId]: {
            loading: false,
            data: detail,
          },
        }))
        const directorPrompt = detail.directorPrompt?.prompt.trim()
        if (directorPrompt) {
          setPromptByClip((current) => manuallyEditedPromptClipIdsRef.current.has(clipId) || current[clipId] === directorPrompt
            ? current
            : { ...current, [clipId]: directorPrompt })
        }
        const coverSource = detail.coverUrl ?? (detail.coverFileId === null || detail.coverFileId === undefined
          ? undefined
          : String(detail.coverFileId))
        const nextImageUrl = resolveAssetUrl(coverSource)
        const manualState = getManuallyDeletableState(detail.sourceType ?? clipSourceType, detail.manuallyAdded)
        if (manualState === true) {
          manuallyAddedClipIdsRef.current.add(clipId)
        } else if (manualState === false) {
          manuallyAddedClipIdsRef.current.delete(clipId)
        }
        setClips((current) => current.map((clip) => {
          if (clip.id !== clipId) return clip
          const sourceType = detail.sourceType ?? clip.sourceType ?? null
          return {
            ...clip,
            title: detail.title.trim() || clip.title,
            description: detail.editorDescription.trim() || clip.description,
            prompt: directorPrompt || clip.prompt,
            imageUrl: nextImageUrl ?? clip.imageUrl,
            revisionNo: detail.revisionNo ?? clip.revisionNo ?? null,
            sourceType,
            manuallyAdded: resolveManuallyDeletable(
              sourceType,
              detail.manuallyAdded ?? clip.manuallyAdded ?? false,
            ),
          }
        }))
      })
      .catch((error) => {
        if (!active || segmentDetailRequestRef.current !== request) return
        setSegmentDetailsByClipId((current) => ({
          ...current,
          [clipId]: {
            ...current[clipId],
            loading: false,
            error,
          },
        }))
        message.error(getApiErrorMessage(error, l('片段详情加载失败，请重试', 'Failed to load segment detail; retry')))
      })
      .finally(() => {
        if (segmentDetailRequestRef.current === request) segmentDetailRequestRef.current = null
      })

    return () => {
      active = false
      request.cancel()
      if (segmentDetailRequestRef.current === request) segmentDetailRequestRef.current = null
    }
  }, [activeClip?.id, activeClip?.sourceType, hasRemoteInitialClips, l, segmentDetailRefreshToken])

  useEffect(() => {
    if (!activeClip || !workflow.page) return
    const clipId = activeClip.id
    const items = workflow.page.items.map((item) => workflowHistoryItem(item))
    const previousItems = (mediaHistoryByClipIdRef.current[clipId]?.items ?? []).filter((item) => item.status === 3 && item.outputReady !== false && item.outputFileId != null && getStoryboardMediaOutputUrl(item))
    const visibleItems = items.filter((item) => item.status === 3 && item.outputReady !== false && item.outputFileId != null && getStoryboardMediaOutputUrl(item))
    const completed = workflow.completedMedia?.segmentId === clipId && appliedCompletion.current !== workflow.completedMedia
      && !historyPreviewTasksRef.current[clipId]?.includes(workflow.completedMedia.itemKey) ? workflow.completedMedia : undefined
    setHistoryIndexByClip((current) => {
      const selected = completed?.itemKey ?? previousItems[current[clipId] ?? 0]?.itemKey
      const nextIndex = selected ? visibleItems.findIndex((item) => item.itemKey === selected) : 0
      return { ...current, [clipId]: Math.max(0, nextIndex) }
    })
    setMediaHistoryByClipId((current) => ({ ...current, [clipId]: { loading: false, items } }))
    if (workflow.completedMedia?.segmentId === clipId) appliedCompletion.current = workflow.completedMedia
  }, [activeClip?.id, workflow.page, workflow.completedMedia])
  useEffect(() => {
    if (activeClip && mediaHistoryRefreshToken > 0) workflow.watch(activeClip.id, true)
  }, [mediaHistoryRefreshToken])
  useEffect(() => {
    setVideoGenerationByClipId(Object.fromEntries(Object.entries(workflow.tasks).map(([id, tasks]) => {
      const task = tasks.find((item) => item.mediaType === 'video' && (item.status === 1 || item.status === 2))
      return [id, { loading: Boolean(task), progress: task?.progress, id: task?.id, statusName: task?.statusName }]
    })))
  }, [workflow.tasks])

  useEffect(() => {
    if (!hasRemoteInitialClips || !activeClip) return
    const directorPrompt = activeSegmentDetail?.directorPrompt?.prompt.trim()
    if (!directorPrompt || manuallyEditedPromptClipIdsRef.current.has(activeClip.id)) return
    setPromptByClip((current) => current[activeClip.id] === directorPrompt
      ? current
      : { ...current, [activeClip.id]: directorPrompt })
  }, [activeClip, activeSegmentDetail?.directorPrompt?.prompt, hasRemoteInitialClips])

  useEffect(() => {
    if (ratioPropRef.current === ratio) return
    ratioPropRef.current = ratio
    setSelectedRatio(ratio || '9:16')
  }, [ratio])

  useEffect(() => {
    if (styleNamePropRef.current === styleName) return
    styleNamePropRef.current = styleName
    if (canRestoreDraft) return
    setSelectedStyle(NO_STYLE_VALUE)
  }, [canRestoreDraft, styleName])

  useEffect(() => {
    if (toneStyleNamePropRef.current === toneStyleName) return
    toneStyleNamePropRef.current = toneStyleName
    if (canRestoreDraft) return
    setSelectedTone(NO_TONE_VALUE)
  }, [canRestoreDraft, toneStyleName])

  useEffect(() => () => {
    const audio = voicePreviewAudioRef.current
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    voicePreviewAudioRef.current = null
  }, [])

  const updatePrompt = useCallback((value: string) => {
    if (!activePromptDraftKey) return
    manuallyEditedPromptClipIdsRef.current.add(activePromptDraftKey)
    setPromptByClip((current) => ({ ...current, [activePromptDraftKey]: value }))
  }, [activePromptDraftKey])

  const mergeStoryboardImageSkillResult = (
    clipId: string,
    result: StudioStoryboardImageSkillResult,
    action: StoryboardImageSkillAction,
  ) => {
    const promptValue = result.prompt.trim()
    const promptDraftKey = getPromptDraftKey(clipId, 'image')
    const skillEnabled = action === 'apply'
    const clipIndex = clips.findIndex((item) => item.id === clipId)
    const fallbackSegmentIndex = clipIndex >= 0 ? clipIndex + 1 : 1
    const clip = clipIndex >= 0 ? clips[clipIndex] : undefined
    manuallyEditedPromptClipIdsRef.current.delete(promptDraftKey)
    setPromptByClip((current) => current[promptDraftKey] === promptValue
      ? current
      : { ...current, [promptDraftKey]: promptValue })
    setClips((current) => current.map((item) => item.id === clipId
      ? { ...item, prompt: promptValue || item.prompt }
      : item))
    setSegmentDetailsByClipId((current) => {
      const currentState = current[clipId]
      const currentDetail = currentState?.data
      const previousPrompt = currentDetail?.imagePrompt ?? currentDetail?.directorPrompt
      const nextImagePrompt = {
        ...previousPrompt,
        ...result,
        prompt: promptValue,
        promptCharacters: result.promptCharacters ?? previousPrompt?.promptCharacters,
        maxPromptCharacters: result.maxPromptCharacters ?? previousPrompt?.maxPromptCharacters,
        references: result.references,
        mentions: result.mentions,
        warnings: result.warnings,
        canUndoSkill: skillEnabled,
      }
      const nextDetail: StudioEpisodeStoryboardSegmentDetailResult = currentDetail
        ? {
          ...currentDetail,
          imagePrompt: nextImagePrompt,
          referenceSelection: {
            ...(currentDetail.referenceSelection ?? { references: [] }),
            references: result.references,
          },
        }
        : {
          id: clipId,
          segmentIndex: fallbackSegmentIndex,
          title: clip?.title ?? `片段-${fallbackSegmentIndex}`,
          editorDescription: clip?.description ?? '',
          sourceType: clip?.sourceType ?? null,
          revisionNo: clip?.revisionNo ?? null,
          shots: [],
          assetReferences: [],
          referenceSelection: { references: result.references },
          directorPrompt: null,
          imagePrompt: nextImagePrompt,
          runId: null,
          episodeId: null,
        }
      return {
        ...current,
        [clipId]: {
          ...currentState,
          loading: false,
          error: undefined,
          data: nextDetail,
        },
      }
    })
  }

  const toggleStoryboardImageSkill = () => {
    if (!activeClip) {
      message.warning(l('请先选择一个片段', 'Select a clip first'))
      return
    }

    if (!canUseRemoteStoryboardImageSkill) {
      setStoryboardSkillEnabled((current) => !current)
      return
    }

    if (
      storyboardImageSkillBusy
      || storyboardImageSkillRequestRef.current
      || storyboardImageSkillPendingClipIdRef.current
    ) return

    const clipId = activeClip.id
    const segmentId = toStoryboardSegmentRequestId(clipId)
    const action: StoryboardImageSkillAction = storyboardMasterSkillEnabled ? 'undo' : 'apply'
    const nextSkillEnabled = action === 'apply'
    const messageKey = `${STORYBOARD_IMAGE_SKILL_MESSAGE_KEY_PREFIX}:${clipId}`
    const request = action === 'undo'
      ? StudioAssetGenerationApi.requestStoryboardImageSkillUndo({ segmentId })
      : StudioAssetGenerationApi.requestStoryboardImageSkillApply({ segmentId })

    storyboardImageSkillRequestRef.current = request
    storyboardImageSkillPendingClipIdRef.current = clipId
    setStoryboardImageSkillByClipId((current) => ({
      ...current,
      [clipId]: {
        ...current[clipId],
        loading: true,
        action,
        error: undefined,
      },
    }))

    void request.promise
      .then((result) => {
        if (storyboardImageSkillRequestRef.current !== request) return
        mergeStoryboardImageSkillResult(clipId, result, action)
        setStoryboardImageSkillByClipId((current) => ({
          ...current,
          [clipId]: {
            ...current[clipId],
            action,
            enabled: nextSkillEnabled,
            error: undefined,
            loading: false,
          },
        }))
        setSegmentDetailRefreshToken((current) => current + 1)
        const refreshSource = getOpenReferenceOptionSource()
        if (refreshSource) loadReferenceOptionsForSource(refreshSource)
        message.open({
          key: messageKey,
          type: 'success',
          content: action === 'undo'
            ? l('已撤回分镜大师', 'Storyboard master undone')
            : l('已使用分镜大师', 'Storyboard master applied'),
        })
      })
      .catch((error) => {
        if (storyboardImageSkillRequestRef.current !== request) return
        setStoryboardImageSkillByClipId((current) => ({
          ...current,
          [clipId]: {
            ...current[clipId],
            loading: false,
            action,
            error,
          },
        }))
        const content = getApiErrorMessage(
          error,
          action === 'undo'
            ? l('撤回分镜大师失败，请重试', 'Failed to undo storyboard master; retry')
            : l('使用分镜大师失败，请重试', 'Failed to apply storyboard master; retry'),
        )
        message.open({
          key: messageKey,
          type: 'error',
          content,
        })
      })
      .finally(() => {
        if (storyboardImageSkillRequestRef.current !== request) return
        storyboardImageSkillRequestRef.current = null
        storyboardImageSkillPendingClipIdRef.current = null
        setStoryboardImageSkillByClipId((current) => ({
          ...current,
          [clipId]: {
            ...current[clipId],
            action,
            loading: false,
          },
        }))
      })
  }

  const getReferenceDeleteKey = (segmentId: string | number, referenceIndex: number) => (
    `${String(segmentId)}:${referenceIndex}`
  )

  const isReferenceDeleting = (referenceIndex?: number | null) => {
    if (!activeClip || referenceIndex === null || referenceIndex === undefined) return false
    return deletingReferenceKeys.includes(getReferenceDeleteKey(toStoryboardSegmentRequestId(activeClip.id), referenceIndex))
  }

  const removeSelectedReferenceByIndex = (referenceIndex: number) => {
    setSelectedCharacterReferenceIds((current) => current.filter((id) => (
      characterReferenceAssets.find((asset) => asset.id === id)?.referenceIndex !== referenceIndex
    )))
    setSelectedSceneReferenceIds((current) => current.filter((id) => (
      sceneReferenceAssets.find((asset) => asset.id === id)?.referenceIndex !== referenceIndex
    )))
    setSelectedPropReferenceIds((current) => current.filter((id) => (
      propReferenceAssets.find((asset) => asset.id === id)?.referenceIndex !== referenceIndex
    )))
    setSelectedVoiceReferenceIds((current) => current.filter((id) => (
      voiceReferenceItems.find((item) => item.id === id)?.referenceIndex !== referenceIndex
    )))
  }

  const getOpenReferenceOptionSource = (): StudioStoryboardVideoReferenceOptionSource | null => {
    if (characterReferenceModalOpen) return 'character'
    if (sceneReferenceModalOpen) return 'scene'
    if (propReferenceModalOpen) return 'prop'
    if (voiceReferenceModalOpen) return 'dubbing'
    return null
  }

  const addSelectedReferencesForSource = (source: StudioStoryboardVideoReferenceOptionSource) => {
    if (referenceAddRequestRef.current || referenceAddingSource) return
    if (!activeClip || !hasRemoteInitialClips || activeClip.id.startsWith('clip-')) {
      closeReferenceModalBySource(source)
      message.warning(l('当前片段暂无可添加的接口引用', 'No server reference can be added for this clip'))
      return
    }

    const state = getReferenceOptionsStateBySource(source)
    const options = state?.items ?? []
    const selectedIds = new Set(getSelectedReferenceIdsBySource(source))
    const selectedOptionEntries = options
      .map((option, index) => ({
        option,
        optionId: getReferenceOptionSelectionId(source, option, index),
      }))
      .filter(({ option, optionId }) => selectedIds.has(optionId) && !option.selected)

    if (selectedOptionEntries.length === 0) {
      closeReferenceModalBySource(source)
      message.success(l('参考素材已更新', 'References updated'))
      return
    }

    const references = selectedOptionEntries
      .map(({ option }) => referenceOptionToAddItem(option))
      .filter((item): item is StudioStoryboardVideoReferenceAddItem => Boolean(item))

    if (references.length === 0) {
      message.warning(l('缺少参考素材参数，无法添加', 'Missing reference parameters; cannot add'))
      return
    }

    const expectedRevisionNo = getReferenceSelectionRevisionNo(source, options)
    if (expectedRevisionNo === null) {
      setSegmentDetailRefreshToken((current) => current + 1)
      loadReferenceOptionsForSource(source)
      message.warning(l('参考素材版本号还没加载完成，请稍后再试', 'Reference revision is still loading; try again shortly'))
      return
    }

    const segmentId = toStoryboardSegmentRequestId(activeClip.id)
    const segmentKey = String(segmentId)
    const addedOptionIds = new Set(selectedOptionEntries.map(({ optionId }) => optionId))
    const request = StudioAssetGenerationApi.requestStoryboardVideoReferenceAdd({
      segmentId,
      expectedRevisionNo,
      references,
    })
    referenceAddRequestRef.current = request
    setReferenceAddingSource(source)

    void request.promise
      .then((result) => {
        if (referenceAddRequestRef.current !== request) return
        if (result?.revisionNo !== null && result?.revisionNo !== undefined) {
          const nextRevisionNo = result.revisionNo
          setSegmentDetailsByClipId((current) => {
            const currentState = current[activeClip.id]
            if (!currentState?.data) return current
            return {
              ...current,
              [activeClip.id]: {
                ...currentState,
                data: {
                  ...currentState.data,
                  referenceSelection: {
                    ...(currentState.data.referenceSelection ?? { references: [] }),
                    revisionNo: nextRevisionNo,
                  },
                },
              },
            }
          })
          setReferenceOptionsBySource((current) => {
            let changed = false
            const next = { ...current }
            ;(['character', 'scene', 'prop', 'dubbing'] as const).forEach((optionSource) => {
              const optionState = current[optionSource]
              if (!optionState?.items || optionState.segmentId !== segmentKey) return
              changed = true
              next[optionSource] = {
                ...optionState,
                items: optionState.items.map((item, index) => ({
                  ...item,
                  selected: item.selected || addedOptionIds.has(getReferenceOptionSelectionId(optionSource, item, index)),
                  referenceSelectionRevisionNo: nextRevisionNo,
                })),
              }
            })
            return changed ? next : current
          })
        }
        setSegmentDetailRefreshToken((current) => current + 1)
        loadReferenceOptionsForSource(source)
        closeReferenceModalBySource(source)
        message.success(l('已添加参考素材', 'Reference added'))
      })
      .catch((error) => {
        if (referenceAddRequestRef.current !== request) return
        setSegmentDetailRefreshToken((current) => current + 1)
        loadReferenceOptionsForSource(source)
        message.error(getApiErrorMessage(error, l('参考素材添加失败，请重试', 'Failed to add reference; retry')))
      })
      .finally(() => {
        if (referenceAddRequestRef.current !== request) return
        referenceAddRequestRef.current = null
        setReferenceAddingSource(null)
      })
  }

  /** Attach the existing generated file using authoritative history candidate metadata, without re-uploading bytes. */
  const dropHistoryReference = async (item: StudioStoryboardMediaHistoryItem) => {
    if (referenceDropRequest.current || referenceAddRequestRef.current || !activeClip || !hasRemoteInitialClips) return
    if (mode === 'image' && item.mediaType === 'video') { message.warning(l('多参生图仅支持图片参考', 'Image generation accepts image references only')); return }
    const clipId = activeClip.id
    const segmentId = toStoryboardSegmentRequestId(clipId)
    setReferenceDropBusy(true)
    const optionsRequest = StudioAssetGenerationApi.requestStoryboardVideoReferenceOptions({ segmentId, source: 'history' })
    referenceDropRequest.current = optionsRequest
    let currentRequest: { cancel: () => void } = optionsRequest
    try {
      const options = await optionsRequest.promise
      if (referenceDropRequest.current !== currentRequest) return
      const option = options.find((candidate) => String(candidate.fileId) === String(item.outputFileId))
      if (!option) throw new Error(l('该历史产物暂不可用作参考', 'This history item is not available as a reference'))
      if (option.selected) { message.info(l('该素材已在参考列表中', 'Already added as a reference')); return }
      if (!option.selectable) throw new Error(option.disabledReason || l('该素材不可选择', 'Reference unavailable'))
      if (option.referenceType == null) throw new Error(l('缺少历史素材参考类型，请刷新后重试', 'Missing reference type; refresh and retry'))
      const reference = referenceOptionToAddItem(option)
      const revision = getReferenceSelectionRevisionNo('history', options)
      if (!reference || revision === null) throw new Error(l('参考信息尚未就绪，请刷新后重试', 'Refresh the references and try again'))
      const request = StudioAssetGenerationApi.requestStoryboardVideoReferenceAdd({ segmentId, expectedRevisionNo: revision, references: [reference] })
      currentRequest = request; referenceDropRequest.current = request
      await request.promise
      if (referenceDropRequest.current !== request) return
      setSegmentDetailRefreshToken((value) => value + 1)
      message.success(l('已添加参考素材', 'Reference added'))
    } catch (reason) {
      if (referenceDropRequest.current !== currentRequest) return
      setSegmentDetailRefreshToken((value) => value + 1)
      message.error(getApiErrorMessage(reason))
    } finally {
      if (referenceDropRequest.current === currentRequest) { referenceDropRequest.current = undefined; setReferenceDropBusy(false) }
    }
  }

  const deleteStoryboardReference = (
    referenceIndex?: number | null,
    source?: StudioStoryboardVideoReferenceOptionSource,
    referenceSelectionRevisionNo?: number | null,
  ) => {
    if (!activeClip || !hasRemoteInitialClips || activeClip.id.startsWith('clip-')) {
      message.warning(l('当前片段暂无可删除的接口引用', 'No server reference can be removed for this clip'))
      return
    }
    if (referenceIndex === null || referenceIndex === undefined || referenceIndex <= 0) {
      message.warning(l('缺少引用序号，无法删除', 'Missing reference index; cannot remove'))
      return
    }
    const expectedRevisionNo = Math.floor(Number(
      referenceSelectionRevisionNo ?? activeSegmentDetail?.referenceSelection?.revisionNo,
    ))
    if (!Number.isInteger(expectedRevisionNo) || expectedRevisionNo < 0) {
      setSegmentDetailRefreshToken((current) => current + 1)
      message.warning(l('参考素材版本号还没加载完成，请稍后再试', 'Reference revision is still loading; try again shortly'))
      return
    }

    const segmentId = toStoryboardSegmentRequestId(activeClip.id)
    const segmentKey = String(segmentId)
    const deleteKey = getReferenceDeleteKey(segmentId, referenceIndex)
    if (referenceDeleteRequestRefs.current.has(deleteKey)) return

    const request = StudioAssetGenerationApi.requestStoryboardVideoReferenceDelete({
      segmentId,
      expectedRevisionNo,
      referenceIndex,
    })
    referenceDeleteRequestRefs.current.set(deleteKey, request)
    setDeletingReferenceKeys((current) => (current.includes(deleteKey) ? current : [...current, deleteKey]))

    void request.promise
      .then((result) => {
        if (referenceDeleteRequestRefs.current.get(deleteKey) !== request) return
        removeSelectedReferenceByIndex(referenceIndex)
        if (result?.revisionNo) {
          const nextRevisionNo = result.revisionNo
          setSegmentDetailsByClipId((current) => {
            const currentState = current[activeClip.id]
            if (!currentState?.data) return current
            return {
              ...current,
              [activeClip.id]: {
                ...currentState,
                data: {
                  ...currentState.data,
                  referenceSelection: {
                    ...(currentState.data.referenceSelection ?? { references: [] }),
                    revisionNo: nextRevisionNo,
                  },
                },
              },
            }
          })
          setReferenceOptionsBySource((current) => {
            let changed = false
            const next = { ...current }
            ;(['character', 'scene', 'prop', 'dubbing'] as const).forEach((optionSource) => {
              const state = current[optionSource]
              if (!state?.items || state.segmentId !== segmentKey) return
              changed = true
              next[optionSource] = {
                ...state,
                items: state.items.map((item) => ({
                  ...item,
                  selected: item.referenceIndex === referenceIndex ? false : item.selected,
                  referenceSelectionRevisionNo: nextRevisionNo,
                })),
              }
            })
            return changed ? next : current
          })
        }
        setSegmentDetailRefreshToken((current) => current + 1)
        const refreshSource = source ?? getOpenReferenceOptionSource()
        if (refreshSource) loadReferenceOptionsForSource(refreshSource)
        message.success(l('已删除参考素材', 'Reference removed'))
      })
      .catch((error) => {
        if (referenceDeleteRequestRefs.current.get(deleteKey) !== request) return
        setSegmentDetailRefreshToken((current) => current + 1)
        message.error(getApiErrorMessage(error, l('参考素材删除失败，请重试', 'Failed to remove reference; retry')))
      })
      .finally(() => {
        if (referenceDeleteRequestRefs.current.get(deleteKey) !== request) return
        referenceDeleteRequestRefs.current.delete(deleteKey)
        setDeletingReferenceKeys((current) => current.filter((key) => key !== deleteKey))
      })
  }

  const deleteReferenceOptionAsset = (asset: ReferenceOptionAsset) => {
    if (asset.referenceIndex) {
      deleteStoryboardReference(asset.referenceIndex, asset.source, asset.referenceSelectionRevisionNo)
      return
    }
    if (asset.source === 'scene') setSelectedSceneReferenceIds((current) => current.filter((id) => id !== asset.id))
    else if (asset.source === 'prop') setSelectedPropReferenceIds((current) => current.filter((id) => id !== asset.id))
    else setSelectedCharacterReferenceIds((current) => current.filter((id) => id !== asset.id))
  }

  const deleteVoiceReferenceItem = (item: VoiceReferenceItem) => {
    if (item.referenceIndex) {
      deleteStoryboardReference(item.referenceIndex, 'dubbing', item.referenceSelectionRevisionNo)
      return
    }
    setSelectedVoiceReferenceIds((current) => current.filter((id) => id !== item.id))
  }

  const clearPromptRegenerationTimer = () => {
    if (promptRegenerateTimerRef.current === null) return
    promptRegenerateTimerRef.current()
    promptRegenerateTimerRef.current = null
  }

  const pollStoryboardVideoPromptDetail = (
    clipId: string,
    promptId: string | number,
    run: number,
  ) => {
    if (promptRegenerateRunRef.current !== run) return

    promptRegenerateDetailRequestRef.current?.cancel()
    const request = StudioAssetGenerationApi.requestStoryboardVideoPromptDetail(promptId)
    promptRegenerateDetailRequestRef.current = request

    void request.promise
      .then((detail) => {
        if (promptRegenerateRunRef.current !== run || promptRegenerateDetailRequestRef.current !== request) return
        const progress = detail.progress === null || detail.progress === undefined
          ? undefined
          : Math.max(0, Math.min(100, Math.round(detail.progress)))

        if (isStoryboardVideoPromptFailed(detail)) {
          setPromptRegenerationByClipId((current) => ({
            ...current,
            [clipId]: {
              loading: false,
              promptId,
              progress,
              stageName: detail.stageName,
              error: detail.error || detail.stageName || true,
            },
          }))
          message.error(detail.error?.trim() || detail.stageName || l('提示词生成失败，请重试', 'Prompt generation failed; retry'))
          return
        }

        if (isStoryboardVideoPromptFinished(detail)) {
          const generatedPrompt = detail.prompt?.trim()
          manuallyEditedPromptClipIdsRef.current.delete(clipId)
          if (generatedPrompt) {
            setPromptByClip((current) => current[clipId] === generatedPrompt
              ? current
              : { ...current, [clipId]: generatedPrompt })
          }
          setPromptRegenerationByClipId((current) => ({
            ...current,
            [clipId]: {
              loading: false,
              promptId,
              progress: 100,
              stageName: detail.stageName || l('生成完成', 'Generated'),
            },
          }))
          setSegmentDetailRefreshToken((current) => current + 1)
          message.success(l('提示词已重新生成', 'Prompt regenerated'))
          return
        }

        setPromptRegenerationByClipId((current) => ({
          ...current,
          [clipId]: {
            loading: true,
            promptId,
            progress,
            stageName: detail.stageName || l('正在生成提示词', 'Generating prompt'),
          },
        }))
        clearPromptRegenerationTimer()
        promptRegenerateTimerRef.current = schedulePollWhenVisible(() => {
          promptRegenerateTimerRef.current = null
          pollStoryboardVideoPromptDetail(clipId, promptId, run)
        }, PROMPT_REGENERATION_POLL_INTERVAL_MS)
      })
      .catch((error) => {
        if (promptRegenerateRunRef.current !== run || promptRegenerateDetailRequestRef.current !== request) return
        setPromptRegenerationByClipId((current) => ({
          ...current,
          [clipId]: {
            loading: false,
            promptId,
            error,
          },
        }))
        message.error(getApiErrorMessage(error, l('提示词进度查询失败，请重试', 'Failed to query prompt progress; retry')))
      })
      .finally(() => {
        if (promptRegenerateDetailRequestRef.current === request) {
          promptRegenerateDetailRequestRef.current = null
        }
      })
  }

  const regenerateStoryboardVideoPrompt = () => {
    if (!activeClip || !hasRemoteInitialClips || activeClip.id.startsWith('clip-')) {
      message.warning(l('当前片段不能重新生成提示词', 'The current clip cannot regenerate prompt'))
      return
    }
    if (activePromptRegenerationState?.loading) return

    const clipId = activeClip.id
    const run = promptRegenerateRunRef.current + 1
    promptRegenerateRunRef.current = run
    clearPromptRegenerationTimer()
    promptRegenerateRequestRef.current?.cancel()
    promptRegenerateDetailRequestRef.current?.cancel()
    promptRegenerateDetailRequestRef.current = null

    setPromptRegenerationByClipId((current) => ({
      ...current,
      [clipId]: {
        loading: true,
        progress: 0,
        stageName: l('正在提交', 'Submitting'),
      },
    }))

    const request = StudioAssetGenerationApi.requestStoryboardVideoPromptRegenerate({
      segmentId: toStoryboardSegmentRequestId(clipId),
    })
    promptRegenerateRequestRef.current = request

    void request.promise
      .then((result) => {
        if (promptRegenerateRunRef.current !== run || promptRegenerateRequestRef.current !== request) return
        setPromptRegenerationByClipId((current) => ({
          ...current,
          [clipId]: {
            loading: true,
            promptId: result.id,
            progress: result.progress ?? 0,
            stageName: l('正在生成提示词', 'Generating prompt'),
          },
        }))
        pollStoryboardVideoPromptDetail(clipId, result.id, run)
      })
      .catch((error) => {
        if (promptRegenerateRunRef.current !== run || promptRegenerateRequestRef.current !== request) return
        setPromptRegenerationByClipId((current) => ({
          ...current,
          [clipId]: {
            loading: false,
            error,
          },
        }))
        message.error(getApiErrorMessage(error, l('提示词重新生成失败，请重试', 'Failed to regenerate prompt; retry')))
      })
      .finally(() => {
        if (promptRegenerateRequestRef.current === request) {
          promptRegenerateRequestRef.current = null
      }
    })
  }

  // Normal generation persists one idempotency key before submission and restores by segment.
  const generateStoryboardVideo = async () => {
    if (!activeClip || !selectedVideoModel || mediaSubmitting) return
    setMediaSubmitting(true)
    try {
      await workflow.submit('video', {
        segmentId: Number(activeClip.id), modelId: selectedVideoModel.id, prompt: prompt.trim(),
        aspectRatio: selectedRatio, resolution: videoResolution, durationSeconds: boundedVideoDuration,
        visualStyleId: selectedVisualStyleIdForGeneration == null ? null : Number(selectedVisualStyleIdForGeneration),
        toneStyleId: selectedToneStyleIdForGeneration == null ? null : Number(selectedToneStyleIdForGeneration),
        generateAudio: Boolean(selectedVideoModel.videoCapabilities?.nativeAudioSupported), inheritPreviousVideo: true, referenceVideoDurationSeconds: 0,
      })
      message.success(l('视频任务已提交', 'Video task submitted'))
    } catch (error) { message.error(getApiErrorMessage(error)) }
    finally { setMediaSubmitting(false) }
  }
  const generateStoryboardImage = async () => {
    if (!activeClip || !selectedImageModel || mediaSubmitting) return
    setMediaSubmitting(true)
    try {
      await workflow.submit('image', {
        segmentId: Number(activeClip.id), modelId: selectedImageModel.id, prompt: prompt.trim(),
        referenceFileIds: imageReferenceFileIds,
        ...(storyboardMasterSkillEnabled ? { skillCode: STORYBOARD_MASTER_SKILL_CODE } : {}),
        aspectRatio: selectedRatio, resolution: Number(normalizeImageResolutionValue(resolution).replace(/k$/i, '')), quality: imageQuality,
        visualStyleId: selectedVisualStyleIdForGeneration == null ? null : Number(selectedVisualStyleIdForGeneration),
        toneStyleId: selectedToneStyleIdForGeneration == null ? null : Number(selectedToneStyleIdForGeneration),
      })
      message.success(l('图片任务已提交', 'Image task submitted'))
    } catch (error) { message.error(getApiErrorMessage(error)) }
    finally { setMediaSubmitting(false) }
  }

  const selectClip = (
    clipId: string,
    options: { keepDescriptionExpanded?: boolean } = {},
  ) => {
    const detailState = segmentDetailsByClipIdRef.current[clipId]
    const mediaHistoryState = mediaHistoryByClipIdRef.current[clipId]
    const directorPrompt = detailState?.data?.directorPrompt?.prompt.trim()
    if (!options.keepDescriptionExpanded) setExpandedDescriptionClipId(null)
    if (directorPrompt && !manuallyEditedPromptClipIdsRef.current.has(clipId)) {
      setPromptByClip((current) => current[clipId] === directorPrompt
        ? current
        : { ...current, [clipId]: directorPrompt })
    }
    if (clipId === activeClipId && hasRemoteInitialClips && !detailState?.data && !detailState?.loading) {
      setSegmentDetailRefreshToken((current) => current + 1)
    }
    if (clipId === activeClipId && hasRemoteInitialClips && !mediaHistoryState?.items && !mediaHistoryState?.loading) {
      setMediaHistoryRefreshToken((current) => current + 1)
    }
    setActiveClipId(clipId)
  }

  const toggleClipDescription = (clipId: string) => {
    selectClip(clipId, { keepDescriptionExpanded: true })
    setExpandedDescriptionClipId((current) => (current === clipId ? null : clipId))
  }

  const downloadActiveMedia = async () => {
    if (!activeMediaFileId) {
      message.warning(l('当前没有可下载的媒体文件', 'There is no media file to download'))
      return
    }
    if (mediaDownloadingFileId) return
    setMediaDownloadingFileId(activeMediaFileId)
    try {
      await downloadMediaFile(activeMediaFileId)
    } catch (error) {
      message.error(error instanceof Error && error.message.trim()
        ? error.message
        : l('下载失败，请重试', 'Download failed; try again'))
    } finally {
      setMediaDownloadingFileId(null)
    }
  }

  const openClipInsert = (position: number, direction: 'insert-above' | 'insert-below') => {
    setEditingClipId(null)
    setInsertingAt(position)
    setClipEditorMode(direction)
    setEditingDescription('')
  }

  const segmentDetailToClipDraft = (
    segment: StudioEpisodeStoryboardSegmentDetailResult,
    fallbackDescription: string,
  ): ClipDraft => {
    const description = segment.editorDescription.trim() || fallbackDescription
    const directorPrompt = segment.directorPrompt?.prompt.trim()
    const coverSource = segment.coverUrl ?? (
      segment.coverFileId === null || segment.coverFileId === undefined
        ? undefined
        : String(segment.coverFileId)
    )
    return {
      id: String(segment.id),
      title: segment.title.trim() || `片段-${segment.segmentIndex}`,
      description,
      prompt: directorPrompt || description,
      imageUrl: resolveAssetUrl(coverSource) ?? '',
      revisionNo: segment.revisionNo ?? null,
      sourceType: segment.sourceType ?? null,
      manuallyAdded: resolveManuallyDeletable(
        segment.sourceType,
        segment.manuallyAdded ?? true,
      ),
    }
  }

  const isManualClip = (clip: ClipDraft) => {
    const detailSourceType = segmentDetailsByClipIdRef.current[clip.id]?.data?.sourceType
    return resolveManuallyDeletable(
      detailSourceType ?? clip.sourceType,
      Boolean(clip.manuallyAdded || clip.id.startsWith('clip-') || manuallyAddedClipIdsRef.current.has(clip.id)),
    )
  }

  const clearRemovedClipState = (clipId: string) => {
    manuallyAddedClipIdsRef.current.delete(clipId)
    manuallyEditedPromptClipIdsRef.current.delete(clipId)
    segmentDetailLoadedKeysRef.current.delete(clipId)
    setPromptByClip((current) => {
      if (!(clipId in current)) return current
      const next = { ...current }
      delete next[clipId]
      return next
    })
    setSegmentDetailsByClipId((current) => {
      if (!(clipId in current)) return current
      const next = { ...current }
      delete next[clipId]
      return next
    })
    setMediaHistoryByClipId((current) => {
      if (!(clipId in current)) return current
      const next = { ...current }
      delete next[clipId]
      return next
    })
    setHistoryIndexByClip((current) => {
      if (!(clipId in current)) return current
      const next = { ...current }
      delete next[clipId]
      return next
    })
    setPromptRegenerationByClipId((current) => {
      if (!(clipId in current)) return current
      const next = { ...current }
      delete next[clipId]
      return next
    })
    setVideoGenerationByClipId((current) => {
      if (!(clipId in current)) return current
      const next = { ...current }
      delete next[clipId]
      return next
    })
    setStoryboardImageSkillByClipId((current) => {
      if (!(clipId in current)) return current
      const next = { ...current }
      delete next[clipId]
      return next
    })
    setExpandedDescriptionClipId((current) => (current === clipId ? null : current))
    if (editingClipId === clipId) closeClipEditor()
  }

  const removeClipFromList = (clipId: string, nextActiveClipId: string) => {
    setClips((current) => {
      if (!current.some((item) => item.id === clipId) || current.length <= 1) return current
      const next = current.filter((item) => item.id !== clipId)
      return hasRemoteInitialClips
        ? next
        : next.map((item, itemIndex) => ({ ...item, title: `片段-${itemIndex + 1}` }))
    })
    setActiveClipId((current) => (current === clipId ? nextActiveClipId : current))
    clearRemovedClipState(clipId)
  }

  const removeManualClip = (clip: ClipDraft) => {
    if (!isManualClip(clip)) return
    if (deletingClipIds.includes(clip.id) || segmentDeleteRequestRefs.current.has(clip.id)) return

    const currentIndex = clips.findIndex((item) => item.id === clip.id)
    if (currentIndex < 0) return
    if (clips.length <= 1) {
      message.warning(l('至少需要保留一个片段', 'Keep at least one clip'))
      return
    }

    const nextClips = clips.filter((item) => item.id !== clip.id)
    const nextActiveClipId = activeClipId === clip.id
      ? nextClips[Math.min(currentIndex, nextClips.length - 1)]?.id ?? ''
      : activeClipId

    if (!hasRemoteInitialClips || clip.id.startsWith('clip-')) {
      removeClipFromList(clip.id, nextActiveClipId)
      message.success(l('已删除片段', 'Clip deleted'))
      return
    }

    const request = StudioAssetGenerationApi.requestEpisodeStoryboardSegmentDelete({
      id: toStoryboardSegmentRequestId(clip.id),
    })
    segmentDeleteRequestRefs.current.set(clip.id, request)
    setDeletingClipIds((current) => (current.includes(clip.id) ? current : [...current, clip.id]))

    void request.promise
      .then(() => {
        if (segmentDeleteRequestRefs.current.get(clip.id) !== request) return
        removeClipFromList(clip.id, nextActiveClipId)
        pendingActiveClipIdAfterRemoteRefreshRef.current = nextActiveClipId
        setSegmentDetailRefreshToken((current) => current + 1)
        setMediaHistoryRefreshToken((current) => current + 1)
        onStoryboardEditorRefresh?.()
        message.success(l('已删除片段', 'Clip deleted'))
      })
      .catch((error) => {
        if (segmentDeleteRequestRefs.current.get(clip.id) !== request) return
        message.error(getApiErrorMessage(error, l('片段删除失败，请重试', 'Failed to delete clip; retry')))
      })
      .finally(() => {
        if (segmentDeleteRequestRefs.current.get(clip.id) !== request) return
        segmentDeleteRequestRefs.current.delete(clip.id)
        setDeletingClipIds((current) => current.filter((id) => id !== clip.id))
      })
  }

  const openDeleteClipConfirm = (clip: ClipDraft) => {
    if (!isManualClip(clip)) return
    if (deletingClipIds.includes(clip.id) || segmentDeleteRequestRefs.current.has(clip.id)) return
    setDeleteConfirmClipId(clip.id)
  }

  const getClipRevisionNo = (clip: ClipDraft) => {
    const detailRevisionNo = segmentDetailsByClipIdRef.current[clip.id]?.data?.revisionNo
    const revisionNo = Math.floor(Number(detailRevisionNo ?? clip.revisionNo))
    return Number.isInteger(revisionNo) && revisionNo > 0 ? revisionNo : null
  }

  const mergeClipUpLocally = (
    clipId: string,
    mergedSegment?: StudioEpisodeStoryboardSegmentDetailResult | null,
  ) => {
    setClips((current) => {
      const index = current.findIndex((clip) => clip.id === clipId)
      if (index <= 0) return current
      const previous = current[index - 1]
      const currentClip = current[index]
      const directorPrompt = mergedSegment?.directorPrompt?.prompt.trim()
      const coverSource = mergedSegment?.coverUrl ?? (
        mergedSegment?.coverFileId === null || mergedSegment?.coverFileId === undefined
          ? undefined
          : String(mergedSegment.coverFileId)
      )
      const nextImageUrl = resolveAssetUrl(coverSource)
      const nextTitle = mergedSegment?.title.trim()
      const mergedSourceType = mergedSegment?.sourceType ?? 3
      const mergedManuallyAdded = resolveManuallyDeletable(
        mergedSourceType,
        mergedSegment?.manuallyAdded ?? true,
      )
      const merged = {
        ...previous,
        title: nextTitle || previous.title,
        description: mergedSegment?.editorDescription.trim()
          || `${previous.description}\n${currentClip.description}`.trim(),
        prompt: directorPrompt || `${previous.prompt}\n${currentClip.prompt}`.trim(),
        imageUrl: nextImageUrl ?? previous.imageUrl,
        revisionNo: mergedSegment?.revisionNo ?? previous.revisionNo ?? null,
        sourceType: mergedSourceType,
        manuallyAdded: mergedManuallyAdded,
      }
      if (mergedManuallyAdded) {
        manuallyAddedClipIdsRef.current.add(previous.id)
      } else {
        manuallyAddedClipIdsRef.current.delete(previous.id)
      }
      manuallyAddedClipIdsRef.current.delete(currentClip.id)
      const result = [...current]
      result.splice(index - 1, 2, merged)
      setActiveClipId(merged.id)
      return result.map((clip, clipIndex) => ({
        ...clip,
        title: hasRemoteInitialClips ? clip.title : `片段-${clipIndex + 1}`,
      }))
    })
  }

  const mergeClipUp = (clipId: string) => {
    if (segmentMergeRequestRef.current) return
    const index = clips.findIndex((clip) => clip.id === clipId)
    if (index <= 0) return
    const previous = clips[index - 1]
    const currentClip = clips[index]

    if (!hasRemoteInitialClips || currentClip.id.startsWith('clip-') || previous.id.startsWith('clip-')) {
      mergeClipUpLocally(clipId)
      return
    }

    const previousRevisionNo = getClipRevisionNo(previous)
    const currentRevisionNo = getClipRevisionNo(currentClip)
    if (previousRevisionNo === null || currentRevisionNo === null) {
      setActiveClipId(currentClip.id)
      setSegmentDetailRefreshToken((current) => current + 1)
      onStoryboardEditorRefresh?.()
      message.warning(l('片段版本号还没加载完成，已刷新片段列表，请稍后再试', 'Segment revision is still loading; refreshing list'))
      return
    }

    const request = StudioAssetGenerationApi.requestEpisodeStoryboardSegmentMergeUp({
      id: toStoryboardSegmentRequestId(currentClip.id),
      previousSegmentId: toStoryboardSegmentRequestId(previous.id),
      previousRevisionNo,
      currentRevisionNo,
      description: '',
    })
    segmentMergeRequestRef.current = request
    setMergingClipIds((current) => (current.includes(clipId) ? current : [...current, clipId]))

    void request.promise
      .then((mergedSegment) => {
        if (segmentMergeRequestRef.current !== request) return
        mergeClipUpLocally(clipId, mergedSegment)
        setSegmentDetailsByClipId((current) => {
          const next = { ...current }
          delete next[currentClip.id]
          if (mergedSegment) {
            next[previous.id] = {
              loading: false,
              data: mergedSegment,
            }
          }
          return next
        })
        setPromptByClip((current) => {
          const next = { ...current }
          delete next[currentClip.id]
          const directorPrompt = mergedSegment?.directorPrompt?.prompt.trim()
          if (directorPrompt) next[previous.id] = directorPrompt
          return next
        })
        setHistoryIndexByClip((current) => {
          if (!(currentClip.id in current)) return current
          const next = { ...current }
          delete next[currentClip.id]
          return next
        })
        setSegmentDetailRefreshToken((current) => current + 1)
        setMediaHistoryRefreshToken((current) => current + 1)
        pendingActiveClipIdAfterRemoteRefreshRef.current = previous.id
        onStoryboardEditorRefresh?.()
        message.success(l('片段已向上合并', 'Segment merged upward'))
      })
      .catch((error) => {
        if (segmentMergeRequestRef.current !== request) return
        setSegmentDetailRefreshToken((current) => current + 1)
        onStoryboardEditorRefresh?.()
        message.error(getApiErrorMessage(error, l('片段向上合并失败，请重试', 'Failed to merge segment upward; retry')))
      })
      .finally(() => {
        if (segmentMergeRequestRef.current !== request) return
        segmentMergeRequestRef.current = null
        setMergingClipIds((current) => current.filter((id) => id !== clipId))
      })
  }

  const openClipEditor = (clip: ClipDraft) => {
    setActiveClipId(clip.id)
    setEditingClipId(clip.id)
    setInsertingAt(null)
    setClipEditorMode('edit')
    setEditingDescription(clip.description)
  }

  const closeClipEditor = () => {
    setEditingClipId(null)
    setInsertingAt(null)
    setEditingDescription('')
  }

  const saveClipEditor = async () => {
    if (clipEditorSaving) return
    const description = editingDescription.trim()
    if (!description) {
      message.warning(l('请输入片段描述', 'Enter a clip description'))
      return
    }
    if (insertingAt !== null) {
      const normalizedInsertPosition = Math.max(0, Math.min(insertingAt, clips.length))
      const targetClip = clipEditorMode === 'insert-above'
        ? clips[normalizedInsertPosition]
        : clips[Math.max(0, Math.min(normalizedInsertPosition - 1, clips.length - 1))]

      if (hasRemoteInitialClips && targetClip && !targetClip.id.startsWith('clip-')) {
        segmentInsertRequestRef.current?.cancel()
        const requestBody = {
          id: toStoryboardSegmentRequestId(targetClip.id),
          description,
        }
        const request = clipEditorMode === 'insert-above'
          ? StudioAssetGenerationApi.requestEpisodeStoryboardSegmentInsertUp(requestBody)
          : StudioAssetGenerationApi.requestEpisodeStoryboardSegmentInsertDown(requestBody)
        segmentInsertRequestRef.current = request
        setClipEditorSaving(true)

        try {
          const insertedSegment = await request.promise
          if (segmentInsertRequestRef.current !== request) return

          let nextActiveClipId = targetClip.id
          if (insertedSegment) {
            const insertedClip = segmentDetailToClipDraft(insertedSegment, description)
            nextActiveClipId = insertedClip.id
            if (isManualClip(insertedClip)) {
              manuallyAddedClipIdsRef.current.add(insertedClip.id)
            } else {
              manuallyAddedClipIdsRef.current.delete(insertedClip.id)
            }
            setClips((current) => {
              const targetIndex = current.findIndex((clip) => clip.id === targetClip.id)
              const insertPosition = targetIndex < 0
                ? normalizedInsertPosition
                : clipEditorMode === 'insert-above'
                  ? targetIndex
                  : targetIndex + 1
              const withoutExisting = current.filter((clip) => clip.id !== insertedClip.id)
              const safePosition = Math.max(0, Math.min(insertPosition, withoutExisting.length))
              const result = [...withoutExisting]
              result.splice(safePosition, 0, insertedClip)
              return result
            })
            setSegmentDetailsByClipId((current) => ({
              ...current,
              [insertedClip.id]: {
                loading: false,
                data: insertedSegment,
              },
            }))
          }

          pendingActiveClipIdAfterRemoteRefreshRef.current = nextActiveClipId
          setActiveClipId(nextActiveClipId)
          setSegmentDetailRefreshToken((current) => current + 1)
          onStoryboardEditorRefresh?.()
          message.success(l('片段已添加', 'Clip added'))
          closeClipEditor()
        } catch (error) {
          if (segmentInsertRequestRef.current !== request) return
          onStoryboardEditorRefresh?.()
          message.error(getApiErrorMessage(error, l('片段添加失败，请重试', 'Failed to add clip; retry')))
        } finally {
          if (segmentInsertRequestRef.current === request) {
            segmentInsertRequestRef.current = null
            setClipEditorSaving(false)
          }
        }
        return
      }

      const insertedId = `clip-${Date.now()}`
      setClips((current) => {
        const position = Math.max(0, Math.min(insertingAt, current.length))
        const inserted: ClipDraft = {
          id: insertedId,
          title: '',
          description,
          prompt: `${description} 保持人物造型和场景连续，电影感构图，光线自然，画面细节清晰。`,
          imageUrl: PREVIEW_IMAGES[position % PREVIEW_IMAGES.length],
          sourceType: 2,
          manuallyAdded: true,
        }
        manuallyAddedClipIdsRef.current.add(insertedId)
        const result = [...current]
        result.splice(position, 0, inserted)
        return result.map((clip, index) => ({ ...clip, title: `片段-${index + 1}` }))
      })
      setActiveClipId(insertedId)
      closeClipEditor()
      return
    }

    if (!editingClipId) return

    if (!hasRemoteInitialClips || editingClipId.startsWith('clip-')) {
      setClips((current) => current.map((clip) => (
        clip.id === editingClipId ? { ...clip, description } : clip
      )))
      closeClipEditor()
      return
    }

    segmentUpdateRequestRef.current?.cancel()
    const request = StudioAssetGenerationApi.requestEpisodeStoryboardSegmentUpdate({
      id: toStoryboardSegmentRequestId(editingClipId),
      description,
    })
    segmentUpdateRequestRef.current = request
    setClipEditorSaving(true)

    try {
      const updatedSegment = await request.promise
      if (segmentUpdateRequestRef.current !== request) return

      const nextDescription = updatedSegment?.editorDescription.trim() || description
      const directorPrompt = updatedSegment?.directorPrompt?.prompt.trim()
      const coverSource = updatedSegment?.coverUrl ?? (
        updatedSegment?.coverFileId === null || updatedSegment?.coverFileId === undefined
          ? undefined
          : String(updatedSegment.coverFileId)
      )
      const nextImageUrl = resolveAssetUrl(coverSource)
      if (updatedSegment) {
        const currentClipSourceType = clips.find((clip) => clip.id === editingClipId)?.sourceType ?? null
        const manualState = getManuallyDeletableState(
          updatedSegment.sourceType ?? currentClipSourceType,
          updatedSegment.manuallyAdded,
        )
        if (manualState === true) {
          manuallyAddedClipIdsRef.current.add(editingClipId)
        } else if (manualState === false) {
          manuallyAddedClipIdsRef.current.delete(editingClipId)
        }
      }

      setClips((current) => current.map((clip) => {
        if (clip.id !== editingClipId) return clip
        const sourceType = updatedSegment?.sourceType ?? clip.sourceType ?? null
        return {
          ...clip,
          title: updatedSegment?.title.trim() || clip.title,
          description: nextDescription,
          prompt: directorPrompt || clip.prompt,
          imageUrl: nextImageUrl ?? clip.imageUrl,
          revisionNo: updatedSegment?.revisionNo ?? clip.revisionNo ?? null,
          sourceType,
          manuallyAdded: resolveManuallyDeletable(
            sourceType,
            updatedSegment?.manuallyAdded ?? clip.manuallyAdded ?? false,
          ),
        }
      }))

      setSegmentDetailsByClipId((current) => {
        if (updatedSegment) {
          return {
            ...current,
            [editingClipId]: {
              loading: false,
              data: updatedSegment,
            },
          }
        }
        const next = { ...current }
        delete next[editingClipId]
        return next
      })

      if (directorPrompt) {
        manuallyEditedPromptClipIdsRef.current.delete(editingClipId)
        setPromptByClip((current) => current[editingClipId] === directorPrompt
          ? current
          : { ...current, [editingClipId]: directorPrompt })
      } else if (activeClipId === editingClipId) {
        setSegmentDetailRefreshToken((current) => current + 1)
      }

      message.success(l('片段内容已更新', 'Clip updated'))
      closeClipEditor()
    } catch (error) {
      if (segmentUpdateRequestRef.current !== request) return
      message.error(getApiErrorMessage(error, l('片段内容保存失败，请重试', 'Failed to save clip; retry')))
    } finally {
      if (segmentUpdateRequestRef.current === request) {
        segmentUpdateRequestRef.current = null
        setClipEditorSaving(false)
      }
    }
  }

  const editingClip = clips.find((clip) => clip.id === editingClipId)
  const editorOpen = editingClipId !== null || insertingAt !== null
  const editorClipTitle = editingClip?.title ?? (insertingAt !== null ? `片段-${insertingAt + 1}` : '')
  const editorTitle = clipEditorMode === 'insert-above'
    ? l('向上插入片段', 'Insert clip above')
    : clipEditorMode === 'insert-below'
      ? l('向下插入片段', 'Insert clip below')
      : l('编辑', 'Edit')
  const deleteConfirmClip = deleteConfirmClipId
    ? clips.find((clip) => clip.id === deleteConfirmClipId)
    : undefined
  const deleteConfirmLoading = deleteConfirmClipId
    ? deletingClipIds.includes(deleteConfirmClipId)
    : false
  const closeDeleteClipConfirm = () => {
    if (!deleteConfirmLoading) setDeleteConfirmClipId(null)
  }
  const confirmDeleteClip = () => {
    if (!deleteConfirmClip) {
      setDeleteConfirmClipId(null)
      return
    }
    setDeleteConfirmClipId(null)
    removeManualClip(deleteConfirmClip)
  }

  const updateVoiceLine = (id: string, patch: Partial<VoiceLineDraft>) => {
    setVoiceLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  const stopVoicePreview = () => {
    const audio = voicePreviewAudioRef.current
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.currentTime = 0
      voicePreviewAudioRef.current = null
    }
    setPlayingVoiceLineId(null)
  }

  const previewVoiceLine = (line: VoiceLineDraft) => {
    if (playingVoiceLineId === line.id) {
      stopVoicePreview()
      return
    }

    if (!line.audioUrl) {
      message.warning(l('当前台词还没有可预览的配音文件', 'This line does not have preview audio yet'))
      return
    }

    stopVoicePreview()
    const audio = new Audio(line.audioUrl)
    voicePreviewAudioRef.current = audio
    setPlayingVoiceLineId(line.id)

    const resetPreview = () => {
      if (voicePreviewAudioRef.current !== audio) return
      voicePreviewAudioRef.current = null
      setPlayingVoiceLineId(null)
    }

    audio.onended = resetPreview
    audio.onerror = () => {
      resetPreview()
      message.error(l('配音文件加载失败', 'Failed to load the voice audio'))
    }
    void audio.play().catch(() => {
      resetPreview()
      message.error(l('配音文件播放失败', 'Failed to play the voice audio'))
    })
  }

  const downloadVoiceLine = (line: VoiceLineDraft, index: number) => {
    if (!line.audioUrl) {
      message.warning(l('当前台词还没有可下载的配音文件', 'This line does not have downloadable audio yet'))
      return
    }

    const path = line.audioUrl.split(/[?#]/, 1)[0]
    const sourceExtension = path.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase()
    const extension = sourceExtension && ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'webm'].includes(sourceExtension)
      ? sourceExtension
      : 'mp3'
    const safeCharacter = (line.character || l('配音', 'voice'))
      .replace(/[\\/:*?"<>|]/g, '-')
      .trim()
    const link = document.createElement('a')
    link.href = line.audioUrl
    link.download = `${safeCharacter || 'voice'}-${index + 1}.${extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const appendVoiceToken = (line: VoiceLineDraft, token: string) => {
    const editor = voiceEditorRefs.current.get(line.id)
    if (editor) {
      editor.insertToken(token)
      return
    }
    updateVoiceLine(line.id, { text: `${line.text}${token}` })
  }

  const confirmCustomPause = (line: VoiceLineDraft) => {
    const seconds = Number(line.customPauseSeconds)
    if (!Number.isFinite(seconds) || seconds <= 0) return

    const normalizedSeconds = Number(seconds.toFixed(2))
    appendVoiceToken(line, `<#${normalizedSeconds}#>`)
    updateVoiceLine(line.id, {
      customPauseExpanded: false,
      customPauseSeconds: '',
    })
  }

  const addVoiceLine = () => {
    setVoiceLines((current) => [
      ...current,
      {
        id: `voice-line-${Date.now()}`,
        character: '姜萱',
        voice: '元气甜妹',
        text: '',
        volume: 1,
        speed: 1,
        expressionPanel: null,
        customPauseExpanded: false,
        customPauseSeconds: '',
        emotion: '自动',
        emotionExpanded: false,
      },
    ])
  }

  const removeVoiceLine = (id: string) => {
    if (playingVoiceLineId === id) stopVoicePreview()
    setVoiceLines((current) => current.filter((line) => line.id !== id))
    setExpandedVoiceLineId((current) => (current === id ? null : current))
  }

  if (!activeClip) return null

  return (
    <>
    <main className="project-clip-editor">
      <aside className="project-clip-editor__rail" aria-label={l('片段列表', 'Clip list')}>
        <header>
          <div>
            <MenuUnfoldOutlined />
            <strong>{episodes[0]?.title || l('第1集', 'Episode 1')}</strong>
            <span>{l('本集已消耗', 'Episode cost')}</span>
            <QuestionCircleFilled className="project-clip-editor__help-icon" />
            <span className="project-clip-editor__episode-cost"><CreditIcon />{clips.length * 6}</span>
          </div>
        </header>
        <div className="project-clip-editor__clip-list">
          {clips.map((clip, index) => {
            const clipCanDelete = isManualClip(clip)
            const clipDeleting = deletingClipIds.includes(clip.id)
            return (
              <Fragment key={clip.id}>
                <div className="project-clip-editor__clip-insert-actions">
                  <button
                    type="button"
                    aria-label={l('在上方插入片段', 'Insert clip above')}
                    title={l('在上方插入片段', 'Insert clip above')}
                    onClick={(event) => {
                      event.stopPropagation()
                      openClipInsert(index, 'insert-above')
                    }}
                  >
                    <PlusOutlined />
                  </button>
                  {index > 0 && (
                    <button
                      type="button"
                      className={`is-merge${mergingClipIds.includes(clip.id) ? ' is-loading' : ''}`}
                      disabled={mergingClipIds.length > 0}
                      aria-busy={mergingClipIds.includes(clip.id)}
                      aria-label={l('向上合并片段', 'Merge upward')}
                      title={l('向上合并片段', 'Merge upward')}
                      onClick={(event) => {
                        event.stopPropagation()
                        mergeClipUp(clip.id)
                      }}
                    >
                      <MergeCellsOutlined />
                    </button>
                  )}
                </div>
                <div
                  className={`project-clip-editor__clip${clip.id === activeClip.id ? ' is-selected' : ''}${expandedDescriptionClipId === clip.id ? ' is-description-expanded' : ''}`}
                  data-source-type={clip.sourceType ?? undefined}
                  data-can-delete={clipCanDelete ? 'true' : 'false'}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleClipDescription(clip.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    toggleClipDescription(clip.id)
                  }}
                >
                  <div className="project-clip-editor__clip-main">
                    {clip.imageUrl ? (
                      <img src={clip.imageUrl} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <ClipCoverPlaceholder />
                    )}
                    <span className="project-clip-editor__clip-text">
                      <span className="project-clip-editor__clip-heading">
                        <strong>{clip.title}</strong>
                        <span className="project-clip-editor__clip-side-actions">
                          <button
                            type="button"
                            aria-label={l('编辑片段', 'Edit clip')}
                            title={l('编辑片段', 'Edit clip')}
                            onClick={(event) => {
                              event.stopPropagation()
                              openClipEditor(clip)
                            }}
                          >
                            <EditOutlined />
                          </button>
                          {clipCanDelete && (
                            <button
                              type="button"
                              className={`project-clip-editor__clip-delete${clipDeleting ? ' is-loading' : ''}`}
                              disabled={clipDeleting}
                              aria-busy={clipDeleting}
                              aria-label={l('删除片段', 'Delete clip')}
                              title={l('删除片段', 'Delete clip')}
                              onClick={(event) => {
                                event.stopPropagation()
                                openDeleteClipConfirm(clip)
                              }}
                            >
                              <DeleteOutlined />
                            </button>
                          )}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="project-clip-editor__clip-description"
                        aria-expanded={expandedDescriptionClipId === clip.id}
                        title={expandedDescriptionClipId === clip.id
                          ? l('点击收起描述', 'Collapse description')
                          : l('点击展开描述', 'Expand description')}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleClipDescription(clip.id)
                        }}
                      >
                        {clip.description}
                      </button>
                    </span>
                  </div>
                </div>
              </Fragment>
            )
          })}
          <div className="project-clip-editor__clip-insert-actions is-last">
            <button
              type="button"
              aria-label={l('在下方插入片段', 'Insert clip below')}
              title={l('在下方插入片段', 'Insert clip below')}
              onClick={(event) => {
                event.stopPropagation()
                openClipInsert(clips.length, 'insert-below')
              }}
            >
              <PlusOutlined />
            </button>
          </div>
        </div>
        <footer className="project-clip-editor__batch-footer">
          <button type="button" onClick={() => message.info(l('批量生成功能待接入', 'Batch generation is not connected yet'))}>
            <CreditIcon />
            <span>{l('批量生成', 'Batch generate')}</span>
          </button>
        </footer>
      </aside>

      <section className="project-clip-editor__preview-column">
        <div className="project-clip-editor__preview-header">
          <div className="project-clip-editor__preview-note">
            <InfoCircleOutlined />
            <span>{l('内容由AI生成，仅供参考', 'AI-generated content for reference only')}</span>
          </div>
          <div className="project-clip-editor__preview-context">
            <strong>{activeClip.title}</strong>
            <span>{selectedRatio}</span>
          </div>
        </div>
        <div className="project-clip-editor__preview-stage">
          <div
            className={`project-clip-editor__preview-content ${
              activePreviewRatio < 0.85 ? 'is-portrait' : activePreviewRatio > 1.2 ? 'is-landscape' : 'is-square'
            }`}
            style={{ '--preview-aspect-ratio': activePreviewRatio } as CSSProperties}
          >
            <div className="project-clip-editor__preview-frame" style={{ aspectRatio: activePreviewRatio }}>
              {showGenerationPlaceholder && generatingTask ? (
                <div className="project-clip-editor__generating" role="status" aria-live="polite" aria-busy="true">
                  <div className="project-clip-editor__generating-icon">{mode === 'image' ? <PictureOutlined /> : <VideoCameraOutlined />}</div>
                  <strong>{mode === 'image' ? l('图片生成中', 'Generating image') : l('视频生成中', 'Generating video')}</strong>
                  <span>{generatingTask.statusName || (generatingTask.status === 1 ? l('排队中', 'Queued') : l('处理中', 'Processing'))}</span>
                  <Progress percent={generationProgress ?? 0} showInfo={generationProgress !== undefined} status="active" strokeColor="var(--jf-text, #eee)" />
                  <small>{generationProgress === undefined ? l('等待进度更新', 'Waiting for progress') : generationProgress === 100 ? l('正在准备生成结果', 'Preparing generated media') : l('完成后将自动显示生成结果', 'The result will appear when ready')}</small>
                </div>
              ) : hasActiveVideo ? (
                <div className="project-clip-editor__preview-video">
                  <video
                    key={activeVideoUrl}
                    src={activeVideoUrl}
                    poster={activeMediaThumbnailUrl || undefined}
                    controls
                    playsInline
                    preload="auto"
                  />

                </div>
              ) : hasActiveImage ? (
                <>
                  <button
                    type="button"
                    className="project-clip-editor__preview-image"
                    style={activeMediaThumbnailUrl && activeMediaThumbnailUrl !== activeImageUrl
                      ? { backgroundImage: `url(${JSON.stringify(activeMediaThumbnailUrl)})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
                      : undefined}
                    aria-label={l('预览当前图片', 'Preview current image')}
                    onClick={() => setImageViewerOpen(true)}
                  >
                    <img
                      key={activeImageUrl}
                      src={activeImageUrl}
                      alt={activeClip.title}
                      draggable={false}
                      decoding="async"
                      onLoad={(event) => {
                        const { naturalWidth, naturalHeight } = event.currentTarget
                        if (naturalWidth > 0 && naturalHeight > 0) {
                          setPreviewImageRatio(naturalWidth / naturalHeight)
                        }
                      }}
                    />
                  </button>

                </>
              ) : (
                <div className="project-clip-editor__preview-placeholder">
                  <ClipCoverPlaceholder
                    variant="preview"
                    label={isActiveVideoGenerating
                      ? l('视频生成中', 'Generating video')
                      : activeMediaHistoryState?.loading
                        ? l('历史加载中', 'Loading history')
                        : mode === 'image' ? l('图片待生成', 'Image pending') : l('视频待生成', 'Video pending')}
                    hint={isActiveVideoGenerating
                      ? `${activeVideoGenerationStatusText}${activeVideoGenerationProgressText}`
                      : l('请点击右侧按钮生成', 'Click the button on the right to generate')}
                  />
                </div>
              )}
              {!showGenerationPlaceholder && (hasActiveVideo || hasActiveImage) && (
                  <div className="project-clip-editor__preview-toolbar is-media-actions">
                    <Popover
                      key={activeHistoryItem?.itemKey ?? activeMediaUrl}
                      trigger="click"
                      onOpenChange={(open) => {
                        if (!open || !activeHistoryItem || !activeClip) return
                        const clipId = activeClip.id
                        const type = activeHistoryItem.mediaType
                        const request = type === 'image' ? WorkflowService.imageDetail({ id: Number(activeHistoryItem.id) }) : WorkflowService.videoDetail({ id: Number(activeHistoryItem.id) })
                        void request.then(workflowData).then((detail) => setMediaHistoryByClipId((current) => ({ ...current, [clipId]: { ...current[clipId], loading: false, items: current[clipId]?.items?.map((item) => item.id === String(detail.id) && item.mediaType === type ? workflowHistoryItem(detail, type) : item) } }))).catch((error) => message.error(getApiErrorMessage(error)))
                      }}
                      placement="bottomRight"
                      title={hasActiveVideo ? l('视频详情', 'Video details') : l('图片详情', 'Image details')}
                      content={
                        <div className="project-clip-editor__video-details">
                          <div>{l('模型', 'Model')}：{activeHistoryItem?.modelName || '--'}</div>
                          <div>{l('画幅', 'Aspect ratio')}：{activeHistoryItem?.aspectRatio || '--'}</div>
                          <div>{l('分辨率', 'Resolution')}：{activeHistoryItem?.resolution || '--'}</div>
                          {hasActiveVideo && (<div>{l('时长', 'Duration')}：{activeHistoryItem?.durationSeconds != null ? `${activeHistoryItem.durationSeconds}s` : '--'}</div>)}
                          <div>{l('画面风格', 'Visual style')}：{activeHistoryItem?.visualStyleName || '--'}</div>
                          <div>{l('影调风格', 'Tone style')}：{activeHistoryItem?.toneStyleName || '--'}</div>
                          <div>{l('生成时间', 'Created at')}：{activeHistoryItem?.createdAt || '--'}</div>
                          <strong>{l('提示词', 'Prompt')}</strong>
                          <div className="project-clip-editor__video-details-prompt">{activeHistoryItem?.prompt || l('暂无提示词', 'No prompt available')}</div>
                        </div>
                      }
                    >
                      <button type="button" aria-label={hasActiveVideo ? l('视频详情', 'Video details') : l('图片详情', 'Image details')}>
                        <InfoCircleOutlined /><span>{l('详情', 'Details')}</span>
                      </button>
                    </Popover>
                    <button
                      type="button"
                      aria-label={hasActiveVideo ? l('下载视频', 'Download video') : l('下载图片', 'Download image')}
                      disabled={!activeMediaFileId || Boolean(mediaDownloadingFileId)}
                      onClick={() => { void downloadActiveMedia() }}
                    >
                      {mediaDownloadingFileId === activeMediaFileId ? <ClockCircleOutlined /> : <DownloadOutlined />}
                      <span>{l('下载', 'Download')}</span>
                    </button>
                    {hasActiveImage && <button type="button" aria-label={l('图生视频', 'Image to video')}
                      disabled={!activeMediaFileId || activeHistoryItem?.status !== 3}
                      onClick={() => { if (activeHistoryItem) setImageToVideoSource({ clipId: activeClip.id, item: activeHistoryItem }) }}>
                      <VideoCameraOutlined /><span>{l('图生视频', 'Image to video')}</span>
                    </button>}
                  </div>
              )}
            </div>
            <div className="project-clip-editor__history">
              {generatingTask && !showGenerationPlaceholder && <Button size="small" onClick={() => {
                const next = { ...historyPreviewTasksRef.current, [activeClip.id]: [] }
                historyPreviewTasksRef.current = next
                setHistoryPreviewTasks(next)
              }}>{l('查看生成进度', 'View generation progress')}{generationProgress === undefined ? '' : ` · ${generationProgress}%`}</Button>}
              {workflow.error && <Alert type="error" message={workflow.error} action={<Button onClick={() => activeClip && workflow.watch(activeClip.id, true)}>{l('重试', 'Retry')}</Button>} />}
              {workflow.pending && <Alert type="warning" message={l('上次提交状态待核查，已保留请求标识', 'Previous submission awaits verification')} action={<><Button onClick={() => void workflow.recover()}>{l('查询提交', 'Check submission')}</Button><Button onClick={() => void workflow.retrySubmission()}>{l('重试原请求', 'Retry original request')}</Button></>} />}
              {(workflow.page?.items ?? []).filter((item) => item.status !== 3).map((item) => <div key={item.itemKey ?? item.mediaType + ':' + item.id}>
                {item.mediaType === 'image' ? l('图片', 'Image') : l('视频', 'Video')} #{item.id} · {item.statusName || item.status} {item.errorMessage || ''}
                {item.status === 6 && l(' · 请到任务中心核查恢复', ' · Review recovery in the task center')}
              </div>)}
              {workflow.page?.hasMore && <Button loading={workflow.loading} onClick={() => activeClip && void workflow.refresh(activeClip.id, workflow.page?.nextCursor ?? undefined)}>{l('加载更多历史', 'Load more history')}</Button>}
              <div className="project-clip-editor__history-title">
                <HistoryOutlined />
                <span>{l('历史记录', 'History')}</span>
                <small>{activeMediaHistoryState?.loading ? '...' : activeHistoryItems.length}</small>
              </div>
              <div className="project-clip-editor__history-list">
                {activeMediaHistoryState?.loading && activeHistoryItems.length === 0 ? (
                  <span className="project-clip-editor__history-empty">{l('加载中', 'Loading')}</span>
                ) : activeHistoryItems.length > 0 ? (
                  activeHistoryItems.map((item, index) => {
                    const thumbnailUrl = getStoryboardMediaThumbnailUrl(item)
                    const versionLabel = item.versionNo ? `#${item.versionNo}` : `${index + 1}`
                    return (
                      <button
                        key={`${activeClip.id}-${item.itemKey ?? item.id}-${index}`}
                        type="button"
                        className={`${activeHistoryIndex === index ? 'is-selected' : ''}${thumbnailUrl ? ' has-image' : ' is-empty'} is-${item.mediaType}`}
                        aria-label={item.mediaType === 'image'
                          ? l(`切换至历史图片 ${versionLabel}`, `Switch to history image ${versionLabel}`)
                          : l(`切换至历史视频 ${versionLabel}`, `Switch to history video ${versionLabel}`)}
                        aria-pressed={activeHistoryIndex === index}
                        draggable={Boolean(item.outputFileId) && !referenceDropBusy && mode !== 'voice'}
                        onDragStart={(event) => {
                          draggedHistoryRef.current = item; setDraggedHistory(item); setReferenceAddMenuOpen(false)
                          event.dataTransfer.effectAllowed = 'copy'
                          event.dataTransfer.setData('application/x-jellyfish-history', item.itemKey ?? `${item.mediaType}:${item.id}`)
                        }}
                        onClick={() => {
                          const tasks = (workflow.tasks[activeClip.id] ?? []).map((task) => `${task.mediaType}:${task.id}`)
                          const next = { ...historyPreviewTasksRef.current, [activeClip.id]: tasks }
                          historyPreviewTasksRef.current = next
                          setHistoryPreviewTasks(next)
                          setHistoryIndexByClip((current) => ({ ...current, [activeClip.id]: index }))
                        }}
                      >
                        <WorkflowThumbnail mediaType={item.mediaType} id={item.id} ready={item.status === 3} />
                      </button>
                    )
                  })
                ) : (
                  <span className="project-clip-editor__history-empty">{l('暂无历史记录', 'No generation history')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="project-clip-editor__controls" aria-label={l('生成设置', 'Generation settings')}>
        <div className="project-clip-editor__mode-tabs" role="tablist">
          {([
            ['video', <VideoCameraOutlined key="video-icon" />, l('多参生视频', 'Video')],
            ['image', <PictureOutlined key="image-icon" />, l('多参生图', 'Image')],
            ['voice', <AudioOutlined key="voice-icon" />, l('配音', 'Voice')],
          ] as const).map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              className={mode === key ? 'is-selected' : ''}
              onClick={() => setMode(key)}
            >
              {icon}<span>{label}</span>
            </button>
          ))}
        </div>

        {mode === 'voice' ? (
          <div className="project-clip-editor__voice-panel">
            {voiceInfoVisible && (
              <section className="project-clip-editor__voice-notice" role="status">
                <InfoCircleOutlined />
                <div>
                  <strong>{l('配音导出说明', 'Voiceover export')}</strong>
                  <span>{l('生成的配音为 AI 合成音频，导出后将作为独立音频文件，用于导入剪映等工具进行剪辑。此功能与视频生成相互独立。', 'Generated voiceover is exported as a separate AI audio file for editing and remains independent from video generation.')}</span>
                </div>
                <button type="button" aria-label={l('关闭说明', 'Dismiss notice')} onClick={() => setVoiceInfoVisible(false)}>
                  <CloseOutlined />
                </button>
              </section>
            )}

            <section className="project-clip-editor__voice-accordion">
              <button
                type="button"
                className="project-clip-editor__voice-accordion-trigger"
                aria-expanded={voiceConfigExpanded}
                onClick={() => setVoiceConfigExpanded((current) => !current)}
              >
                <span>
                  <strong>{l('音色配置', 'Voice assignment')}</strong>
                  <small>{l('绑定专属音色，全剧同步变更', 'Bind character voices and sync them across the project')}</small>
                </span>
                <DownOutlined />
              </button>
              {voiceConfigExpanded && (
                <div className="project-clip-editor__voice-binding-list">
                  {VOICE_BINDINGS.map(({ character, voice }) => (
                    <button key={character} type="button" onClick={() => setVoiceLibraryOpen(true)}>
                      <span>{character}：</span>
                      <strong>{voice}</strong>
                      <DownOutlined />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="project-clip-editor__voice-accordion">
              <button
                type="button"
                className="project-clip-editor__voice-accordion-trigger"
                aria-expanded={voiceBasicsExpanded}
                onClick={() => setVoiceBasicsExpanded((current) => !current)}
              >
                <span><strong>{l('基础设置', 'Basic settings')}</strong></span>
                <DownOutlined />
              </button>
              {voiceBasicsExpanded && (
                <div className="project-clip-editor__voice-basics">
                  <label>
                    <span>{l('音量', 'Volume')}</span>
                    <div className="project-clip-editor__voice-slider-control">
                      <Slider min={0} max={2} step={0.1} value={voiceVolume} tooltip={{ open: false }} onChange={setVoiceVolume} />
                      <output>{formatVoiceRate(voiceVolume)}</output>
                    </div>
                  </label>
                  <label>
                    <span>{l('音速', 'Speed')}</span>
                    <div className="project-clip-editor__voice-slider-control">
                      <Slider min={0.5} max={2} step={0.1} value={voiceSpeed} tooltip={{ open: false }} onChange={setVoiceSpeed} />
                      <output>{formatVoiceRate(voiceSpeed)}</output>
                    </div>
                  </label>
                </div>
              )}
            </section>

            <section className="project-clip-editor__voice-lines">
              <div className="project-clip-editor__voice-lines-title">
                <strong>{l('台词配音', 'Dialogue voiceover')}</strong>
                <span>{voiceLines.length} {l('条', 'lines')}</span>
              </div>
              <div className="project-clip-editor__voice-line-list">
                {voiceLines.map((line, index) => {
                  const adjustableVoice = VOICE_BINDINGS.some(({ character, voice, adjustable }) => (
                    adjustable && character === line.character && voice === line.voice
                  ))
                  return (
                    <article key={line.id} className={`project-clip-editor__voice-line-card${adjustableVoice ? ' has-adjustable-voice' : ''}`}>
                    <header>
                      <strong>{l('分镜台词', 'Storyboard line')}{index + 1}</strong>
                      <span>
                        <button
                          type="button"
                          className={expandedVoiceLineId === line.id ? 'is-active' : ''}
                          aria-label={expandedVoiceLineId === line.id ? l('收起台词设置', 'Collapse line settings') : l('展开台词设置', 'Expand line settings')}
                          aria-expanded={expandedVoiceLineId === line.id}
                          onClick={() => setExpandedVoiceLineId((current) => (current === line.id ? null : line.id))}
                        >
                          <SettingOutlined />
                        </button>
                        <button type="button" aria-label={l('删除台词', 'Delete line')} disabled={voiceLines.length === 1} onClick={() => removeVoiceLine(line.id)}><DeleteOutlined /></button>
                      </span>
                    </header>
                    <label>
                      <span>{l('角色', 'Character')}</span>
                      <StudioSelect
                        value={`${line.character}|${line.voice}`}
                        options={voiceRoleOptions}
                        aria-label={l('选择角色与音色', 'Select character and voice')}
                        onChange={(value) => {
                          const [character, voice] = String(value).split('|')
                          updateVoiceLine(line.id, { character, voice })
                        }}
                      />
                    </label>
                    <div className="project-clip-editor__voice-copy-field">
                      <span className="project-clip-editor__voice-copy-label">
                        <span>{l('台词', 'Dialogue')}</span>
                        <span>
                          <button
                            type="button"
                            className={playingVoiceLineId === line.id ? 'is-playing' : ''}
                            aria-label={playingVoiceLineId === line.id ? l('停止试听', 'Stop preview') : l('试听台词', 'Preview line')}
                            title={playingVoiceLineId === line.id ? l('停止试听', 'Stop preview') : l('预览此条配音', 'Preview this voice line')}
                            onClick={() => previewVoiceLine(line)}
                          >
                            <PlayCircleFilled />
                          </button>
                          <button
                            type="button"
                            aria-label={l('下载此条配音', 'Download this voice line')}
                            title={l('下载此条配音', 'Download this voice line')}
                            onClick={() => downloadVoiceLine(line, index)}
                          >
                            <DownloadOutlined />
                          </button>
                        </span>
                      </span>
                      <span className="project-clip-editor__voice-copy-editor">
                        <VoiceTextEditor
                          ref={(editor) => {
                            if (editor) voiceEditorRefs.current.set(line.id, editor)
                            else voiceEditorRefs.current.delete(line.id)
                          }}
                          value={line.text}
                          maxLength={1000}
                          placeholder={l('输入文字描述你想创作的内容', 'Enter dialogue to synthesize')}
                          onChange={(text) => updateVoiceLine(line.id, { text })}
                        />
                      </span>
                    </div>
                    {adjustableVoice && (
                      <div className="project-clip-editor__voice-expression">
                        <div className="project-clip-editor__voice-expression-toolbar">
                          <button
                            type="button"
                            className={line.expressionPanel === 'pause' ? 'is-active' : ''}
                            aria-expanded={line.expressionPanel === 'pause'}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => updateVoiceLine(line.id, {
                              expressionPanel: line.expressionPanel === 'pause' ? null : 'pause',
                              customPauseExpanded: line.expressionPanel === 'pause' ? false : line.customPauseExpanded,
                              customPauseSeconds: line.expressionPanel === 'pause' ? '' : line.customPauseSeconds,
                            })}
                          >
                            <ClockCircleOutlined />
                            <span>{l('添加停顿', 'Add pause')}</span>
                          </button>
                          <button
                            type="button"
                            className={line.expressionPanel === 'interjection' ? 'is-active' : ''}
                            aria-expanded={line.expressionPanel === 'interjection'}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => updateVoiceLine(line.id, {
                              expressionPanel: line.expressionPanel === 'interjection' ? null : 'interjection',
                              customPauseExpanded: false,
                              customPauseSeconds: '',
                            })}
                          >
                            <MessageOutlined />
                            <span>{l('添加语气词', 'Add expression')}</span>
                          </button>
                        </div>
                        {line.expressionPanel === 'pause' && (
                          <div className="project-clip-editor__voice-token-grid is-pauses">
                            {VOICE_PAUSE_OPTIONS.map(({ label, token }) => (
                              <button
                                key={label}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => appendVoiceToken(line, token)}
                              >
                                {label}
                              </button>
                            ))}
                            <button
                              type="button"
                              className={line.customPauseExpanded ? 'is-active' : ''}
                              aria-expanded={line.customPauseExpanded}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => updateVoiceLine(line.id, {
                                customPauseExpanded: !line.customPauseExpanded,
                                customPauseSeconds: line.customPauseExpanded ? '' : line.customPauseSeconds,
                              })}
                            >
                              {l('自定义', 'Custom')}
                            </button>
                            {line.customPauseExpanded && (
                              <div className="project-clip-editor__voice-custom-pause">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoFocus
                                  value={line.customPauseSeconds}
                                  aria-label={l('自定义停顿时长', 'Custom pause duration')}
                                  placeholder={l('请输入停顿时长（秒）', 'Enter pause duration in seconds')}
                                  onChange={(event) => {
                                    const value = event.target.value.trim()
                                    if (/^\d*(?:\.\d{0,2})?$/.test(value)) {
                                      updateVoiceLine(line.id, { customPauseSeconds: value })
                                    }
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      confirmCustomPause(line)
                                    }
                                    if (event.key === 'Escape') {
                                      updateVoiceLine(line.id, {
                                        customPauseExpanded: false,
                                        customPauseSeconds: '',
                                      })
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className="project-clip-editor__voice-custom-pause-confirm"
                                  disabled={!Number.isFinite(Number(line.customPauseSeconds)) || Number(line.customPauseSeconds) <= 0}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => confirmCustomPause(line)}
                                >
                                  {l('确认', 'Confirm')}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {line.expressionPanel === 'interjection' && (
                          <div className="project-clip-editor__voice-token-grid is-interjections">
                            {VOICE_INTERJECTION_OPTIONS.map(([zhLabel, enLabel]) => (
                              <button
                                key={zhLabel}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => appendVoiceToken(line, `<${zhLabel}>`)}
                              >
                                {l(zhLabel, enLabel)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {adjustableVoice && (
                      <div className={`project-clip-editor__voice-emotion${line.emotionExpanded ? ' is-expanded' : ''}`}>
                        <button
                          type="button"
                          className="project-clip-editor__voice-emotion-trigger"
                          aria-expanded={line.emotionExpanded}
                          onClick={() => updateVoiceLine(line.id, { emotionExpanded: !line.emotionExpanded })}
                        >
                          <span><InfoCircleOutlined />{l(line.emotion, VOICE_EMOTIONS.find(([zhLabel]) => zhLabel === line.emotion)?.[1] ?? line.emotion)}</span>
                          <DownOutlined />
                        </button>
                        {line.emotionExpanded && (
                          <div className="project-clip-editor__voice-emotion-options">
                            {VOICE_EMOTIONS.map(([zhLabel, enLabel]) => (
                              <button
                                key={zhLabel}
                                type="button"
                                className={line.emotion === zhLabel ? 'is-selected' : ''}
                                aria-pressed={line.emotion === zhLabel}
                                onClick={() => updateVoiceLine(line.id, { emotion: zhLabel })}
                              >
                                {l(zhLabel, enLabel)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {expandedVoiceLineId === line.id && (
                      <div className="project-clip-editor__voice-line-settings">
                        <label>
                          <span>{l('音量', 'Volume')}</span>
                          <div className="project-clip-editor__voice-slider-control">
                            <Slider
                              min={0}
                              max={2}
                              step={0.1}
                              value={line.volume}
                              tooltip={{ open: false }}
                              onChange={(value) => updateVoiceLine(line.id, { volume: value })}
                            />
                            <output>{formatVoiceRate(line.volume)}</output>
                          </div>
                        </label>
                        <label>
                          <span>{l('音速', 'Speed')}</span>
                          <div className="project-clip-editor__voice-slider-control">
                            <Slider
                              min={0.5}
                              max={2}
                              step={0.1}
                              value={line.speed}
                              tooltip={{ open: false }}
                              onChange={(value) => updateVoiceLine(line.id, { speed: value })}
                            />
                            <output>{formatVoiceRate(line.speed)}</output>
                          </div>
                        </label>
                      </div>
                    )}
                    </article>
                  )
                })}
              </div>
              <button type="button" className="project-clip-editor__add-voice-line" onClick={addVoiceLine}>
                <PlusCircleOutlined />
                {l('添加出镜角色', 'Add on-screen character')}
              </button>
            </section>
          </div>
        ) : (
          <>
        <section className="project-clip-editor__reference-section">
          <div className="project-clip-editor__section-title">
            <strong>{l('参考素材', 'References')}</strong>
            <span>{l('用于保持角色与场景一致', 'Keep visual continuity')}</span>
          </div>
          {(draggedHistory || referenceDropBusy) && <div
            className={`project-clip-editor__reference-drop${referenceDropHover ? ' is-over' : ''}`}
            role="status"
            onDragOver={(event) => { if (!draggedHistoryRef.current) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setReferenceDropHover(true) }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setReferenceDropHover(false) }}
            onDrop={(event) => {
              const item = draggedHistoryRef.current
              if (!item) return
              event.preventDefault(); event.stopPropagation()
              draggedHistoryRef.current = null; setDraggedHistory(null); setReferenceDropHover(false)
              void dropHistoryReference(item)
            }}
          >{referenceDropBusy ? l('正在添加参考素材…', 'Adding reference…') : mode === 'image' && draggedHistory?.mediaType === 'video' ? l('多参生图仅支持图片参考', 'Images only for image generation') : l('拖拽至此处作为参考', 'Drop here to add as a reference')}</div>}
          <div className="project-clip-editor__references" style={draggedHistory || referenceDropBusy ? { display: 'none' } : undefined}>
            <Popover
              open={referenceAddMenuOpen}
              trigger="click"
              placement="bottomLeft"
              arrow={false}
              content={referenceAddMenu}
              rootClassName="project-clip-editor__reference-add-popover"
              onOpenChange={setReferenceAddMenuOpen}
            >
              <button
                type="button"
                className={`project-clip-editor__reference-add${referenceAddMenuOpen ? ' is-open' : ''}`}
                aria-label={l('添加参考', 'Add reference')}
                aria-haspopup="menu"
                aria-expanded={referenceAddMenuOpen}
              >
                <PlusOutlined />
              </button>
            </Popover>
            <div className="project-clip-editor__reference-scroll">
              {promptMentionAssets.map((asset, index) => {
                const deleting = isReferenceDeleting(asset.referenceIndex)
                return (
                <div key={asset.id} className={`project-clip-editor__reference${index === 0 ? ' is-selected' : ''}${deleting ? ' is-deleting' : ''}`}>
                  {asset.videoUrl ? <button type="button" className="project-clip-editor__reference-video" aria-label={l(`播放${asset.name}`, `Play ${asset.name}`)} onClick={() => setReferenceVideoPreview({ url: asset.videoUrl!, name: asset.name })}>
                    <video src={asset.videoUrl} muted playsInline preload="metadata" onLoadedMetadata={(event) => {
                      const video = event.currentTarget
                      if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2)
                    }} />
                  </button> : asset.imageUrl ? <Image src={asset.imageUrl} alt={asset.name} loading="lazy" decoding="async" preview={{ mask: false }} /> : <PictureOutlined />}
                  <span>{asset.name}</span>
                  <button
                    type="button"
                    className="project-clip-editor__reference-remove"
                    aria-label={l(`删除${asset.name}`, `Remove ${asset.name}`)}
                    title={l('删除参考素材', 'Remove reference')}
                    disabled={deleting}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      deleteStoryboardReference(
                        asset.referenceIndex,
                        undefined,
                        asset.referenceSelectionRevisionNo,
                      )
                    }}
                  >
                    <CloseOutlined />
                  </button>
                </div>
                )
              })}
              {activeSegmentDetailState?.loading && (
                <span className="project-clip-editor__reference-loading">{l('加载中', 'Loading')}</span>
              )}
            </div>
          </div>
        </section>

        {mode === 'video' && videoVoiceTipVisible && (
          <div className="project-clip-editor__video-voice-tip" role="status">
            <InfoCircleOutlined />
            <span>{l('点击从配音添加，快速引用角色已绑定的音色', 'Add from voice to quickly reuse a character voice')}</span>
            <button
              type="button"
              aria-label={l('关闭提示', 'Dismiss tip')}
              onClick={() => setVideoVoiceTipVisible(false)}
            >
              <CloseOutlined />
            </button>
          </div>
        )}

        <section className="project-clip-editor__prompt-section">
          <div className="project-clip-editor__section-title">
            <strong>{l('提示词', 'Prompt')}</strong>
            <Tooltip
              title={l(
                '描述画面内容，可添加@调用参考',
                'Describe the visual content and use @ to add references',
              )}
              placement="top"
            >
              <QuestionCircleFilled
                className="project-clip-editor__prompt-help"
                aria-label={l(
                  '描述画面内容，可添加@调用参考',
                  'Describe the visual content and use @ to add references',
                )}
                tabIndex={0}
              />
            </Tooltip>
            {mode === 'video' && (
              <button
                type="button"
                className="project-clip-editor__prompt-regenerate"
                disabled={
                  !activeClip
                  || !hasRemoteInitialClips
                  || activeClip.id.startsWith('clip-')
                  || Boolean(activePromptRegenerationState?.loading)
                }
                onClick={regenerateStoryboardVideoPrompt}
              >
                <ReloadOutlined spin={Boolean(activePromptRegenerationState?.loading)} />
                <span>
                  {activePromptRegenerationState?.loading
                    ? `${activePromptRegenerationState.stageName || l('生成中', 'Generating')}${
                        activePromptRegenerationState.progress === undefined
                        || activePromptRegenerationState.progress === null
                          ? ''
                          : ` ${activePromptRegenerationState.progress}%`
                      }`
                    : l('重新生成提示词', 'Regenerate prompt')}
                </span>
              </button>
            )}
          </div>
          <PromptMentionEditor
            value={prompt}
            assets={promptMentionAssets}
            maxLength={activePromptSource?.maxPromptCharacters ?? 10_000}
            placeholder={l('描述画面主体、环境、动作、镜头与光线，输入 @ 引用素材', 'Describe the subject, setting, action, camera and lighting. Type @ to mention an asset')}
            menuTitle={l('可能 @ 的内容', 'Mentionable assets')}
            characterGroupLabel={l('角色', 'Characters')}
            sceneGroupLabel={l('场景', 'Scenes')}
            propGroupLabel={l('道具', 'Props')}
            emptyLabel={l('没有匹配的素材', 'No matching assets')}
            onChange={updatePrompt}
          />
        </section>

        <div className={`project-clip-editor__prompt-tools${mode === 'video' ? ' is-video' : ''}`}>
          <StudioSelect
            aria-label={l('影调风格', 'Tone style')}
            className="project-clip-editor__tone-select"
            popupClassName="project-clip-editor__style-popup asset-generation-workspace__style-popup"
            optionLabelProp="trigger"
            value={selectedTone}
            options={toneOptions}
            onChange={(value) => setSelectedTone(String(value))}
          />
          <StudioSelect
            aria-label={l('画面风格', 'Visual style')}
            className="project-clip-editor__style-select"
            popupClassName="project-clip-editor__style-popup asset-generation-workspace__style-popup"
            optionLabelProp="trigger"
            value={selectedStyle}
            options={styleOptions}
            onChange={(value) => setSelectedStyle(String(value))}
          />
          {mode === 'image' && <Popover
            placement="topRight"
            trigger="click"
            arrow={false}
            overlayClassName="project-clip-editor__skill-popover"
            content={(
              <div className="project-clip-editor__skill-list">
                <button
                  type="button"
                  className={storyboardMasterSkillEnabled ? 'is-selected' : ''}
                  aria-pressed={storyboardMasterSkillEnabled}
                  disabled={storyboardImageSkillBusy}
                  onClick={toggleStoryboardImageSkill}
                >
                  <span className="project-clip-editor__skill-title">
                    <strong>{l('分镜大师', 'Storyboard master')}</strong>
                    <small>
                      {storyboardImageSkillBusy ? <ClockCircleOutlined /> : storyboardMasterSkillEnabled && <CheckOutlined />}
                      {storyboardImageSkillActionText}
                    </small>
                  </span>
                  <span>{l('专业分镜呈现画面设计，适合搭配gpt image 2效果最佳', 'Designed for professional storyboard composition; works best with gpt image 2')}</span>
                </button>
              </div>
            )}
          >
            <Button
              className={`project-clip-editor__skill-trigger${storyboardMasterSkillEnabled ? ' is-active' : ''}`}
              icon={<BgColorsOutlined />}
              loading={storyboardImageSkillBusy}
            >
              {storyboardMasterSkillEnabled ? l('分镜大师', 'Storyboard master') : l('使用技能', 'Skills')}
            </Button>
          </Popover>}
        </div>

        <footer className="project-clip-editor__generation-footer">
          <div className={`project-clip-editor__generation-selects${mode === 'video' ? ' is-video' : ''}`}>
            <StudioSelect
              aria-label={mode === 'video' ? l('视频模型', 'Video model') : l('图片模型', 'Image model')}
              value={mode === 'video'
                ? videoModel || undefined
                : selectedImageModel ? String(selectedImageModel.id) : undefined}
              loading={mode === 'video' ? videoModelsLoading : imageModelsLoading}
              status={mode === 'video'
                ? (videoModelsError || videoGenerateEstimateError ? 'error' : undefined)
                : imageModelsError || imageGenerateEstimateError ? 'error' : undefined}
              options={mode === 'video' ? videoModelOptions : imageModelOptions}
              placeholder={mode === 'video'
                ? videoModelsLoading
                  ? l('加载视频模型中', 'Loading video models')
                  : l('选择视频模型', 'Select video model')
                : imageModelsLoading
                  ? l('加载图片模型中', 'Loading image models')
                  : l('选择图片模型', 'Select image model')}
              disabled={mode === 'video'
                ? videoModelsLoading && videoModelOptions.length === 0
                : imageModelsLoading && imageModelOptions.length === 0}
              onDropdownVisibleChange={(open) => {
                if (mode === 'video' && open && videoModelsError) {
                  setVideoModelsRetryToken((current) => current + 1)
                }
                if (mode === 'image' && open && imageModelsError) {
                  setImageModelsRetryToken((current) => current + 1)
                }
              }}
              onChange={(value) => {
                if (mode === 'video') setVideoModel(String(value))
                else setModel(String(value))
              }}
            />
            {mode === 'video' ? (
              <Popover
                placement="topRight"
                trigger="click"
                arrow={false}
                open={videoSpecOpen}
                onOpenChange={setVideoSpecOpen}
                overlayClassName="project-clip-editor__video-spec-popover"
                content={(
                  <div className="project-clip-editor__video-spec-panel">
                    <section>
                      <span className="project-clip-editor__video-spec-label">{l('分辨率', 'Resolution')}</span>
                      <div className="project-clip-editor__video-resolution-options" role="group" aria-label={l('分辨率', 'Resolution')}>
                        {videoResolutionOptions.map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={videoResolution === value ? 'is-selected' : ''}
                            aria-pressed={videoResolution === value}
                            onClick={() => setVideoResolution(value)}
                          >
                            {formatVideoResolutionLabel(value)}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section>
                      <span className="project-clip-editor__video-spec-label">{l('时长', 'Duration')}</span>
                      <div className="project-clip-editor__video-duration-control">
                        <div
                          className="project-clip-editor__video-duration-slider"
                          style={{
                            '--video-duration-progress': `${videoDurationProgress}%`,
                          } as CSSProperties}
                        >
                          <Slider
                            min={videoDurationMin}
                            max={videoDurationMax}
                            step={1}
                            value={boundedVideoDuration}
                            tooltip={{ open: false }}
                            aria-label={l('视频时长', 'Video duration')}
                            onChange={setVideoDuration}
                          />
                        </div>
                        <output>{boundedVideoDuration}s</output>
                      </div>
                    </section>
                  </div>
                )}
              >
                <button
                  type="button"
                  className={`project-clip-editor__video-spec-trigger${videoSpecOpen ? ' is-open' : ''}`}
                  aria-label={l('视频规格', 'Video output')}
                  aria-expanded={videoSpecOpen}
                >
                  <span>{formatVideoResolutionLabel(videoResolution)} · {boundedVideoDuration}s</span>
                  <DownOutlined />
                </button>
              </Popover>
            ) : (
              <StudioSelect
                aria-label={l('图片清晰度', 'Image resolution')}
                value={resolution}
                options={imageResolutionOptions.map((value) => ({
                  value,
                  label: formatImageResolutionLabel(value),
                }))}
                disabled={!selectedImageModel || imageResolutionOptions.length === 0}
                onChange={(value) => setResolution(String(value))}
              />
            )}
            {mode === 'image' && Boolean(selectedImageModel?.imageCapabilities?.qualities.length) && <StudioSelect
              aria-label={l('图片质量', 'Image quality')} value={imageQuality ?? undefined}
              options={(selectedImageModel?.imageCapabilities?.qualities ?? []).map((value) => ({ value, label: String(value) }))}
              onChange={setImageQuality} />}
          </div>
          <Button
            type="primary"
            size="large"
            icon={<CreditIcon />}
            loading={mediaSubmitting || (mode === 'video' && isActiveVideoGenerating)}
            disabled={generationButtonDisabled || mediaSubmitting || Boolean(workflow.pending) || (mode === 'image' ? imageGenerateCreditCost === undefined || imageGenerateEstimateLoading || Boolean(imageGenerateEstimateError) : !videoGenerateEstimate || videoGenerateEstimateLoading || Boolean(videoGenerateEstimateError))}
            onClick={() => {
              if (mode === 'video') {
                generateStoryboardVideo()
                return
              }
              void generateStoryboardImage()
            }}
          >
            {mode === 'video'
              ? videoGenerationButtonText
              : `${l('生成图片', 'Generate image')} · ${imageGenerateEstimateLoading ? '…' : formatCreditCost(imageGenerateCreditCost)}`}
          </Button>
          <Button disabled={!hasRemoteInitialClips || !activeClip || activeClip.id.startsWith('clip-')} onClick={() => {
            if (!activeClip) return
            const segmentId = String(toStoryboardSegmentRequestId(activeClip.id))
            const params = new URLSearchParams({ segmentId, returnTo: `${window.location.pathname}${window.location.search}` })
            window.open(`/director-desk/workspace/segment-${encodeURIComponent(segmentId)}?${params}`, '_blank', 'noopener')
          }}>{l('3D 导演台', '3D Director Desk')}</Button>
          {activeClip && !activeClip.id.startsWith('clip-') && <DirectorSegmentApplication key={activeClip.id} segmentId={String(toStoryboardSegmentRequestId(activeClip.id))} />}
          {activeHistoryItem?.generationRecordId && activeClip && <DirectorGenerationOrigins generationId={activeHistoryItem.generationRecordId} generationType={activeHistoryItem.mediaType === 'video' ? 'video' : 'image'} segmentId={String(toStoryboardSegmentRequestId(activeClip.id))} />}
          <Button onClick={() => { setSegmentDetailRefreshToken((value) => value + 1); setMediaHistoryRefreshToken((value) => value + 1) }}>
            {l('刷新参考与产物', 'Refresh references and media')}
          </Button>
        </footer>
          </>
        )}
      </aside>
    </main>
    {imageToVideoSource && <ImageToVideoModal
      key={imageToVideoSource.item.id}
      imageGenerationId={imageToVideoSource.item.id}
      imageUrl={getStoryboardMediaOutputUrl(imageToVideoSource.item)}
      visualStyles={visualStyleOptions}
      toneStyles={toneStyleOptions}
      onClose={() => setImageToVideoSource(null)}
      onCompleted={() => {
        setSegmentDetailRefreshToken((value) => value + 1)
        setMediaHistoryRefreshToken((value) => value + 1)
      }}
    />}
    <Modal
      title={editorTitle}
      open={editorOpen}
      centered
      width={560}
      maskClosable={false}
      destroyOnClose
      className="project-clip-editor-modal"
      closable={!clipEditorSaving}
      onCancel={() => {
        if (!clipEditorSaving) closeClipEditor()
      }}
      footer={null}
    >
      <div className="project-clip-editor-modal__field">
        <label htmlFor="project-clip-number">{l('片段号', 'Clip number')}</label>
        <Input id="project-clip-number" value={editorClipTitle} disabled />
      </div>
      <div className="project-clip-editor-modal__field">
        <label htmlFor="project-clip-description">{l('片段描述', 'Clip description')}</label>
        <Input.TextArea
          id="project-clip-description"
          value={editingDescription}
          maxLength={5000}
          autoSize={false}
          disabled={clipEditorSaving}
          onChange={(event) => setEditingDescription(event.target.value)}
        />
        <span className="project-clip-editor-modal__count">{editingDescription.length}/5000</span>
      </div>
      <div className="project-clip-editor-modal__actions">
        <Button disabled={clipEditorSaving} onClick={closeClipEditor}>{l('取消', 'Cancel')}</Button>
        <Button type="primary" loading={clipEditorSaving} onClick={saveClipEditor}>{l('确定', 'Confirm')}</Button>
      </div>
    </Modal>
    <Modal
      title={l('确认删除片段', 'Delete clip?')}
      open={deleteConfirmClipId !== null}
      centered
      width={420}
      maskClosable={false}
      destroyOnClose
      className="project-clip-editor-modal project-clip-editor-delete-modal"
      closable={!deleteConfirmLoading}
      onCancel={closeDeleteClipConfirm}
      footer={null}
    >
      <div className="project-clip-editor-delete-modal__content">
        <p>{l('删除后无法恢复，请确认是否继续。', 'This cannot be undone. Continue?')}</p>
        {deleteConfirmClip && <strong>{deleteConfirmClip.title}</strong>}
      </div>
      <div className="project-clip-editor-modal__actions">
        <Button disabled={deleteConfirmLoading} onClick={closeDeleteClipConfirm}>{l('取消', 'Cancel')}</Button>
        <Button danger type="primary" loading={deleteConfirmLoading} onClick={confirmDeleteClip}>{l('删除', 'Delete')}</Button>
      </div>
    </Modal>
    <Modal
      open={characterReferenceModalOpen}
      centered
      width={860}
      footer={null}
      closable={false}
      destroyOnClose={false}
      rootClassName="project-clip-character-modal-root"
      className="project-clip-character-modal"
      onCancel={() => setCharacterReferenceModalOpen(false)}
    >
      <div className="project-clip-character-modal__shell">
        <header className="project-clip-character-modal__header">
          <strong>{l(
            `出镜角色 (${selectedCharacterReferenceAssets.length}/${characterReferenceAssets.length})`,
            `On-screen characters (${selectedCharacterReferenceAssets.length}/${characterReferenceAssets.length})`,
          )}</strong>
          <div className="project-clip-character-modal__actions">
            <label
              htmlFor="project-clip-character-reference-search"
              className={`project-clip-character-modal__search${characterReferenceQuery.trim() ? ' has-value' : ''}`}
            >
              <SearchOutlined />
              <input
                id="project-clip-character-reference-search"
                value={characterReferenceQuery}
                aria-label={l('搜索角色', 'Search characters')}
                placeholder={l('搜索', 'Search')}
                onChange={(event) => setCharacterReferenceQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="project-clip-character-modal__add-role"
              onClick={() => message.info(l('添加角色入口待接入', 'Add character entry is not connected yet'))}
            >
              + {l('添加角色', 'Add character')}
            </button>
            <button
              type="button"
              className="project-clip-character-modal__close"
              aria-label={l('关闭', 'Close')}
              onClick={() => setCharacterReferenceModalOpen(false)}
            >
              <CloseOutlined />
            </button>
          </div>
        </header>

        <div className="project-clip-character-modal__body">
          {characterReferenceOptionsState?.loading ? (
            <div className="project-clip-character-modal__empty">
              <span className="project-clip-character-modal__empty-icon" aria-hidden="true" />
              <span>{l('加载中', 'Loading')}</span>
            </div>
          ) : characterReferenceGroups.length > 0 ? characterReferenceGroups.map((group) => (
            <section key={group.name} className="project-clip-character-modal__group">
              <h3>{group.name}</h3>
              <div className="project-clip-character-modal__grid">
                {group.assets.map((asset, assetIndex) => {
                  const selected = selectedCharacterReferenceIds.includes(asset.id)
                  const assetLabel = asset.lookName || (assetIndex === 0 ? l('主图', 'Main') : l(`造型${assetIndex + 1}`, `Look ${assetIndex + 1}`))
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`project-clip-character-modal__card${selected ? ' is-selected' : ''}${asset.selectable ? '' : ' is-disabled'}`}
                      disabled={!asset.selectable}
                      aria-pressed={selected}
                      title={asset.disabledReason || asset.name}
                      onClick={() => toggleCharacterReferenceAsset(asset)}
                    >
                      <span className="project-clip-character-modal__card-image">
                        {asset.imageUrl ? (
                          <img src={asset.imageUrl} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <PictureOutlined />
                        )}
                      </span>
                      <span className="project-clip-character-modal__card-label">{assetLabel}</span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="project-clip-character-modal__look-add"
                  onClick={() => message.info(l('新增造型入口待接入', 'New look entry is not connected yet'))}
                >
                  <span className="project-clip-character-modal__look-sparkle" aria-hidden="true" />
                  <span>{l('新增造型', 'New look')}</span>
                </button>
              </div>
            </section>
          )) : (
            <div className="project-clip-character-modal__empty">
              <span className="project-clip-character-modal__empty-icon" aria-hidden="true" />
              <span>{l('暂无角色资产', 'No character assets')}</span>
            </div>
          )}
        </div>

        <footer className={`project-clip-character-modal__footer${characterReferenceAssets.length === 0 ? ' is-options-empty' : ''}`}>
          {characterReferenceAssets.length > 0 && (
            <>
              <span className="project-clip-character-modal__selected-label">{l('已选', 'Selected')}</span>
              <div className={`project-clip-character-modal__selected-strip${selectedCharacterReferenceAssets.length === 0 ? ' is-empty' : ''}`}>
                {selectedCharacterReferenceAssets.length > 0 ? selectedCharacterReferenceAssets.map((asset) => {
                  const deleting = isReferenceDeleting(asset.referenceIndex)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`project-clip-character-modal__selected-item${deleting ? ' is-deleting' : ''}`}
                      title={asset.name}
                      disabled={deleting}
                      onClick={() => deleteReferenceOptionAsset(asset)}
                    >
                      {asset.imageUrl ? (
                        <img src={asset.imageUrl} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <PictureOutlined />
                      )}
                      <span className="project-clip-character-modal__selected-delete" aria-hidden="true">
                        <DeleteOutlined />
                      </span>
                    </button>
                  )
                }) : (
                  <span className="project-clip-character-modal__selected-empty">{l('未选择角色', 'No characters selected')}</span>
                )}
              </div>
            </>
          )}
          <Button
            type="primary"
            className="project-clip-character-modal__confirm"
            loading={referenceAddingSource === 'character'}
            disabled={Boolean(referenceAddingSource && referenceAddingSource !== 'character')}
            onClick={confirmCharacterReferenceSelection}
          >
            {l('确定', 'Confirm')}
          </Button>
        </footer>
      </div>
    </Modal>
    <Modal
      open={sceneReferenceModalOpen}
      centered
      width={860}
      footer={null}
      closable={false}
      destroyOnClose={false}
      rootClassName="project-clip-character-modal-root"
      className="project-clip-character-modal project-clip-character-modal--scene"
      onCancel={() => setSceneReferenceModalOpen(false)}
    >
      <div className="project-clip-character-modal__shell">
        <header className="project-clip-character-modal__header">
          <strong>{l(
            `出镜场景 (${selectedSceneReferenceAssets.length}/${sceneReferenceAssets.length})`,
            `On-screen scenes (${selectedSceneReferenceAssets.length}/${sceneReferenceAssets.length})`,
          )}</strong>
          <div className="project-clip-character-modal__actions">
            <label
              htmlFor="project-clip-scene-reference-search"
              className={`project-clip-character-modal__search${sceneReferenceQuery.trim() ? ' has-value' : ''}`}
            >
              <SearchOutlined />
              <input
                id="project-clip-scene-reference-search"
                value={sceneReferenceQuery}
                aria-label={l('搜索场景', 'Search scenes')}
                placeholder={l('搜索', 'Search')}
                onChange={(event) => setSceneReferenceQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="project-clip-character-modal__add-role"
              onClick={() => message.info(l('添加场景入口待接入', 'Add scene entry is not connected yet'))}
            >
              + {l('添加场景', 'Add scene')}
            </button>
            <button
              type="button"
              className="project-clip-character-modal__close"
              aria-label={l('关闭', 'Close')}
              onClick={() => setSceneReferenceModalOpen(false)}
            >
              <CloseOutlined />
            </button>
          </div>
        </header>

        <div className="project-clip-character-modal__body">
          {sceneReferenceOptionsState?.loading ? (
            <div className="project-clip-character-modal__empty">
              <span className="project-clip-character-modal__empty-icon" aria-hidden="true" />
              <span>{l('加载中', 'Loading')}</span>
            </div>
          ) : sceneReferenceGroups.length > 0 ? sceneReferenceGroups.map((group) => (
            <section key={group.name} className="project-clip-character-modal__group">
              <h3>{group.name}</h3>
              <div className="project-clip-character-modal__grid">
                {group.assets.map((asset, assetIndex) => {
                  const selected = selectedSceneReferenceIds.includes(asset.id)
                  const assetLabel = asset.lookName || (assetIndex === 0 ? l('主图', 'Main') : l(`场景${assetIndex + 1}`, `Scene ${assetIndex + 1}`))
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`project-clip-character-modal__card${selected ? ' is-selected' : ''}${asset.selectable ? '' : ' is-disabled'}`}
                      disabled={!asset.selectable}
                      aria-pressed={selected}
                      title={asset.disabledReason || asset.name}
                      onClick={() => toggleSceneReferenceAsset(asset)}
                    >
                      <span className="project-clip-character-modal__card-image">
                        {asset.imageUrl ? (
                          <img src={asset.imageUrl} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <PictureOutlined />
                        )}
                      </span>
                      <span className="project-clip-character-modal__card-label">{assetLabel}</span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="project-clip-character-modal__look-add"
                  onClick={() => message.info(l('新增场景入口待接入', 'New scene entry is not connected yet'))}
                >
                  <span className="project-clip-character-modal__look-sparkle" aria-hidden="true" />
                  <span>{l('新增场景', 'New scene')}</span>
                </button>
              </div>
            </section>
          )) : (
            <div className="project-clip-character-modal__empty">
              <span className="project-clip-character-modal__empty-icon" aria-hidden="true" />
              <span>{l('暂无场景资产', 'No scene assets')}</span>
            </div>
          )}
        </div>

        <footer className={`project-clip-character-modal__footer${sceneReferenceAssets.length === 0 ? ' is-options-empty' : ''}`}>
          {sceneReferenceAssets.length > 0 && (
            <>
              <span className="project-clip-character-modal__selected-label">{l('已选', 'Selected')}</span>
              <div className={`project-clip-character-modal__selected-strip${selectedSceneReferenceAssets.length === 0 ? ' is-empty' : ''}`}>
                {selectedSceneReferenceAssets.length > 0 ? selectedSceneReferenceAssets.map((asset) => {
                  const deleting = isReferenceDeleting(asset.referenceIndex)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`project-clip-character-modal__selected-item${deleting ? ' is-deleting' : ''}`}
                      title={asset.name}
                      disabled={deleting}
                      onClick={() => deleteReferenceOptionAsset(asset)}
                    >
                      {asset.imageUrl ? (
                        <img src={asset.imageUrl} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <PictureOutlined />
                      )}
                      <span className="project-clip-character-modal__selected-delete" aria-hidden="true">
                        <DeleteOutlined />
                      </span>
                    </button>
                  )
                }) : (
                  <span className="project-clip-character-modal__selected-empty">{l('未选择场景', 'No scenes selected')}</span>
                )}
              </div>
            </>
          )}
          <Button
            type="primary"
            className="project-clip-character-modal__confirm"
            loading={referenceAddingSource === 'scene'}
            disabled={Boolean(referenceAddingSource && referenceAddingSource !== 'scene')}
            onClick={confirmSceneReferenceSelection}
          >
            {l('确定', 'Confirm')}
          </Button>
        </footer>
      </div>
    </Modal>
    <Modal
      open={propReferenceModalOpen}
      centered
      width={860}
      footer={null}
      closable={false}
      destroyOnClose={false}
      rootClassName="project-clip-character-modal-root"
      className="project-clip-character-modal project-clip-character-modal--scene"
      onCancel={() => setPropReferenceModalOpen(false)}
    >
      <div className="project-clip-character-modal__shell">
        <header className="project-clip-character-modal__header">
          <strong>{l(
            `出镜道具 (${selectedPropReferenceAssets.length}/${propReferenceAssets.length})`,
            `On-screen props (${selectedPropReferenceAssets.length}/${propReferenceAssets.length})`,
          )}</strong>
          <div className="project-clip-character-modal__actions">
            <label
              htmlFor="project-clip-prop-reference-search"
              className={`project-clip-character-modal__search${propReferenceQuery.trim() ? ' has-value' : ''}`}
            >
              <SearchOutlined />
              <input
                id="project-clip-prop-reference-search"
                value={propReferenceQuery}
                aria-label={l('搜索道具', 'Search props')}
                placeholder={l('搜索', 'Search')}
                onChange={(event) => setPropReferenceQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="project-clip-character-modal__add-role"
              onClick={() => message.info(l('添加道具入口待接入', 'Add prop entry is not connected yet'))}
            >
              + {l('添加道具', 'Add prop')}
            </button>
            <button
              type="button"
              className="project-clip-character-modal__close"
              aria-label={l('关闭', 'Close')}
              onClick={() => setPropReferenceModalOpen(false)}
            >
              <CloseOutlined />
            </button>
          </div>
        </header>

        <div className="project-clip-character-modal__body">
          {propReferenceOptionsState?.loading ? (
            <div className="project-clip-character-modal__empty">
              <span className="project-clip-character-modal__empty-icon" aria-hidden="true" />
              <span>{l('加载中', 'Loading')}</span>
            </div>
          ) : propReferenceGroups.length > 0 ? propReferenceGroups.map((group) => (
            <section key={group.name} className="project-clip-character-modal__group">
              <h3>{group.name}</h3>
              <div className="project-clip-character-modal__grid">
                {group.assets.map((asset, assetIndex) => {
                  const selected = selectedPropReferenceIds.includes(asset.id)
                  const assetLabel = asset.lookName || (assetIndex === 0 ? l('主图', 'Main') : l(`道具${assetIndex + 1}`, `Prop ${assetIndex + 1}`))
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`project-clip-character-modal__card${selected ? ' is-selected' : ''}${asset.selectable ? '' : ' is-disabled'}`}
                      disabled={!asset.selectable}
                      aria-pressed={selected}
                      title={asset.disabledReason || asset.name}
                      onClick={() => togglePropReferenceAsset(asset)}
                    >
                      <span className="project-clip-character-modal__card-image">
                        {asset.imageUrl ? (
                          <img src={asset.imageUrl} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <PictureOutlined />
                        )}
                      </span>
                      <span className="project-clip-character-modal__card-label">{assetLabel}</span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="project-clip-character-modal__look-add"
                  onClick={() => message.info(l('新增道具入口待接入', 'New prop entry is not connected yet'))}
                >
                  <span className="project-clip-character-modal__look-sparkle" aria-hidden="true" />
                  <span>{l('新增道具', 'New prop')}</span>
                </button>
              </div>
            </section>
          )) : (
            <div className="project-clip-character-modal__empty">
              <span className="project-clip-character-modal__empty-icon" aria-hidden="true" />
              <span>{l('暂无道具资产', 'No prop assets')}</span>
            </div>
          )}
        </div>

        <footer className={`project-clip-character-modal__footer${propReferenceAssets.length === 0 ? ' is-options-empty' : ''}`}>
          {propReferenceAssets.length > 0 && (
            <>
              <span className="project-clip-character-modal__selected-label">{l('已选', 'Selected')}</span>
              <div className={`project-clip-character-modal__selected-strip${selectedPropReferenceAssets.length === 0 ? ' is-empty' : ''}`}>
                {selectedPropReferenceAssets.length > 0 ? selectedPropReferenceAssets.map((asset) => {
                  const deleting = isReferenceDeleting(asset.referenceIndex)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`project-clip-character-modal__selected-item${deleting ? ' is-deleting' : ''}`}
                      title={asset.name}
                      disabled={deleting}
                      onClick={() => deleteReferenceOptionAsset(asset)}
                    >
                      {asset.imageUrl ? (
                        <img src={asset.imageUrl} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <PictureOutlined />
                      )}
                      <span className="project-clip-character-modal__selected-delete" aria-hidden="true">
                        <DeleteOutlined />
                      </span>
                    </button>
                  )
                }) : (
                  <span className="project-clip-character-modal__selected-empty">{l('未选择道具', 'No props selected')}</span>
                )}
              </div>
            </>
          )}
          <Button
            type="primary"
            className="project-clip-character-modal__confirm"
            loading={referenceAddingSource === 'prop'}
            disabled={Boolean(referenceAddingSource && referenceAddingSource !== 'prop')}
            onClick={confirmPropReferenceSelection}
          >
            {l('确定', 'Confirm')}
          </Button>
        </footer>
      </div>
    </Modal>
    <Modal
      open={voiceReferenceModalOpen}
      centered
      width={560}
      footer={null}
      closable={false}
      destroyOnClose={false}
      rootClassName="project-clip-character-modal-root"
      className="project-clip-voice-reference-modal"
      onCancel={() => setVoiceReferenceModalOpen(false)}
    >
      <div className="project-clip-voice-reference-modal__shell">
        <header className="project-clip-voice-reference-modal__header">
          <strong>{l(
            `出镜音色 ${selectedVoiceReferenceItems.length}/${voiceReferenceItems.length}`,
            `On-screen voices ${selectedVoiceReferenceItems.length}/${voiceReferenceItems.length}`,
          )}</strong>
          <button
            type="button"
            className="project-clip-voice-reference-modal__close"
            aria-label={l('关闭', 'Close')}
            onClick={() => setVoiceReferenceModalOpen(false)}
          >
            <CloseOutlined />
          </button>
        </header>
        <div className="project-clip-voice-reference-modal__notice" role="status">
          <InfoCircleOutlined />
          <span>{l('请选择需要添加的角色音色，未配置的可前往「资产确认」或「配音」选择', 'Select the character voices to add. Unconfigured voices can be set in Assets or Voice.')}</span>
        </div>
        <div className="project-clip-voice-reference-modal__list">
          {dubbingReferenceOptionsState?.loading ? (
            <div className="project-clip-voice-reference-modal__empty">
              <span className="project-clip-character-modal__empty-icon" aria-hidden="true" />
              <span>{l('加载中', 'Loading')}</span>
            </div>
          ) : voiceReferenceItems.length > 0 ? voiceReferenceItems.map((item) => {
            const selected = selectedVoiceReferenceIds.includes(item.id)
            const deleting = isReferenceDeleting(item.referenceIndex)
            return (
              <button
                key={item.id}
                type="button"
                className={`project-clip-voice-reference-modal__item${selected ? ' is-selected' : ''}${item.configured ? '' : ' is-disabled'}${deleting ? ' is-deleting' : ''}`}
                disabled={!item.configured || deleting}
                aria-pressed={selected}
                onClick={() => toggleVoiceReferenceItem(item)}
              >
                <span className="project-clip-voice-reference-modal__thumb">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <AudioOutlined />
                  )}
                </span>
                <span className="project-clip-voice-reference-modal__meta">
                  <strong>{item.character}</strong>
                  <small>{item.voice}</small>
                </span>
                <span className="project-clip-voice-reference-modal__checkbox" aria-hidden="true">
                  {selected && <CheckOutlined />}
                </span>
              </button>
            )
          }) : (
            <div className="project-clip-voice-reference-modal__empty">
              <span className="project-clip-character-modal__empty-icon" aria-hidden="true" />
              <span>{l('暂无音色资产', 'No voice assets')}</span>
            </div>
          )}
        </div>
        <footer className="project-clip-voice-reference-modal__footer">
          <Button onClick={() => setVoiceReferenceModalOpen(false)}>{l('取消', 'Cancel')}</Button>
          <Button
            type="primary"
            loading={referenceAddingSource === 'dubbing'}
            disabled={Boolean(referenceAddingSource && referenceAddingSource !== 'dubbing')}
            onClick={confirmVoiceReferenceSelection}
          >
            {l('确定', 'Confirm')}
          </Button>
        </footer>
      </div>
    </Modal>
    <Modal open={Boolean(referenceVideoPreview)} title={referenceVideoPreview?.name} footer={null} centered width={800} destroyOnClose onCancel={() => setReferenceVideoPreview(null)}>
      {referenceVideoPreview && <video key={referenceVideoPreview.url} src={referenceVideoPreview.url} controls autoPlay playsInline style={{ width: '100%', maxHeight: '75vh', display: 'block', background: '#111', borderRadius: 8 }} />}
    </Modal>
    <ImageViewer
      open={imageViewerOpen && hasActiveImage}
      imageUrl={activeImageUrl}
      alt={activeClip.title}
      onClose={() => setImageViewerOpen(false)}
    />
    <VoiceLibraryModal open={voiceLibraryOpen} onCancel={() => setVoiceLibraryOpen(false)} />
    </>
  )
}
