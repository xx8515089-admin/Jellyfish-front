import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, message, Modal, Spin, theme, Tooltip } from 'antd'
import {
  ArrowRightOutlined,
  CloseOutlined,
  FileAddOutlined,
  PlusOutlined,
  StopOutlined,
  ThunderboltFilled,
} from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../../../services/apiErrors'
import { StudioChaptersService, StudioProjectsService } from '../../../services/generated'
import { StudioScriptsApi } from '../../../services/studioScripts'
import type {
  StudioScriptImportId,
  StudioScriptImportListItem,
  StudioScriptParseChapter,
  StudioScriptParseResult,
} from '../../../services/studioScripts'
import { StudioStylesApi } from '../../../services/studioStyles'
import type { StudioStyleOption } from '../../../services/studioStyles'
import type { ProjectStyle, ProjectVisualStyle } from '../../../services/generated'
import { useAppStore } from '../../../store/useAppStore'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { useProjectStyleOptions } from './useProjectStyleOptions'
import { useStudioStyleOptions } from './useStudioStyleOptions'
import CustomStyleModal from './CustomStyleModal'
import type { CustomStyleDraft } from './CustomStyleModal'
import ProjectAssetsStep from './ProjectAssetsStep'
import ProjectClipEditingStep from './ProjectClipEditingStep'
import {
  PROJECT_CREATION_DRAFT_KEYS,
  clearProjectCreationDrafts,
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
type StyleCategoryKey = 'visual' | 'tone'
type StylePreview = 'empty' | 'online'
type EpisodeDraft = {
  id: string
  title: string
  rawText: string
}
type ProjectCreateDraft = {
  currentStep: number
  createdProjectId: string
  createdChapterIds: Record<string, string>
  name: string
  script: string
  episodes: EpisodeDraft[]
  activeEpisodeIndex: number
  ratio: string
  visualStyle: ProjectVisualStyle
  styleCategory: StyleCategoryKey
  style: string
  importedFileName: string
  scriptImportId: StudioScriptImportId | null
  selectedStyleKeys: Partial<Record<StyleCategoryKey, string>>
  targetMarket: string
}
type ProjectCreateRouteState = {
  scriptImport?: StudioScriptImportListItem
  scriptImportDetail?: StudioScriptParseResult
  chapters?: StudioScriptParseChapter[]
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

/** 将后端从 1 开始的页面步骤转换为前端从 0 开始的步骤。 */
const toCreationStepIndex = (currentStep?: number | null) => {
  const normalizedStep = Number(currentStep)
  if (!Number.isFinite(normalizedStep) || normalizedStep < 1) return 0
  return Math.min(3, Math.max(0, Math.trunc(normalizedStep) - 1))
}

type BasicInfoSnapshotSource = {
  id?: StudioScriptImportId | null
  title?: string | null
  rawText?: string | null
  videoRatio?: string | null
  targetMarket?: string | null
  visualStyleId?: StudioScriptImportId | null
  toneStyleId?: StudioScriptImportId | null
}

const hasOwnNullableField = (source: object | null | undefined, field: PropertyKey) => (
  Boolean(source && Object.prototype.hasOwnProperty.call(source, field))
)

/** 生成可稳定比较的基础信息快照，用来识别本次进入页面后是否发生修改。 */
const createBasicInfoSnapshot = (source: BasicInfoSnapshotSource) => JSON.stringify({
  id: source.id === null || source.id === undefined ? null : String(source.id),
  title: source.title?.trim() ?? '',
  rawText: (source.rawText ?? '').replace(/\r\n?/g, '\n'),
  videoRatio: source.videoRatio?.trim() || '9:16',
  targetMarket: source.targetMarket?.trim() || 'overseas',
  visualStyleId: source.visualStyleId === null || source.visualStyleId === undefined
    ? null
    : String(source.visualStyleId),
  toneStyleId: source.toneStyleId === null || source.toneStyleId === undefined
    ? null
    : String(source.toneStyleId),
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

const ProjectCreatePage: React.FC = () => {
  const l = useBilingualText()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const balance = useAppStore((state) => state.user.apiRemaining)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const episodeImportInputRef = useRef<HTMLInputElement>(null)
  const persistDraftOnUnmountRef = useRef(true)
  const projectDraftPersistEnabledRef = useRef(true)
  const basicInfoSubmissionRef = useRef(false)
  const chapterRestoreRequestRef = useRef(0)
  const {
    options,
    videoRatioOptions,
    defaultVideoRatio,
    defaultVisualStyle,
    getDefaultStyle,
  } = useProjectStyleOptions()
  const {
    options: studioStyleOptions,
    loading: studioStyleOptionsLoading,
    error: studioStyleOptionsError,
    refresh: refreshStudioStyleOptions,
  } = useStudioStyleOptions()

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
    snapshot: string
  } | null>(null)
  const resumeChapters = Array.isArray(resumePayload?.chapters)
    ? resumePayload.chapters
    : isResumingScriptImport
      ? readCachedScriptImportChapters(resumeImportId) ?? []
      : []
  const [restoredDraft] = useState(() =>
    readProjectCreationDraft<ProjectCreateDraft>(PROJECT_CREATION_DRAFT_KEYS.project))
  const shouldRestoreProjectDraft = !isResumingScriptImport && !resumeSnapshot
  projectDraftPersistEnabledRef.current = shouldRestoreProjectDraft && persistDraftOnUnmountRef.current
  const restoredEpisodes = resumeSnapshot
    ? toEpisodeDrafts(
      resumeChapters,
      (episodeNumber) => l(`第${episodeNumber}集`, `Episode ${episodeNumber}`),
    )
    : shouldRestoreProjectDraft && Array.isArray(restoredDraft?.episodes) ? restoredDraft.episodes : []
  const restoredStep = Math.min(3, Math.max(0, Number(restoredDraft?.currentStep) || 0))
  const [currentStep, setCurrentStep] = useState(() => resumeSnapshot
    ? toCreationStepIndex(resumeSnapshot.currentStep)
    : shouldRestoreProjectDraft && restoredEpisodes.length ? restoredStep : 0)
  const [scriptImportId, setScriptImportId] = useState<StudioScriptImportId | null>(
    resumeSnapshot?.id ?? resumeImportId ?? (shouldRestoreProjectDraft ? restoredDraft?.scriptImportId : null) ?? null,
  )
  const [createdProjectId, setCreatedProjectId] = useState(
    shouldRestoreProjectDraft ? restoredDraft?.createdProjectId ?? '' : '',
  )
  const [createdChapterIds, setCreatedChapterIds] = useState<Record<string, string>>(
    shouldRestoreProjectDraft ? restoredDraft?.createdChapterIds ?? {} : {},
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
  const [visualStyle, setVisualStyle] = useState(
    shouldRestoreProjectDraft ? restoredDraft?.visualStyle ?? defaultVisualStyle : defaultVisualStyle,
  )
  const [styleCategory, setStyleCategory] = useState<StyleCategoryKey>(
    shouldRestoreProjectDraft && restoredDraft?.styleCategory === 'tone' ? 'tone' : 'visual',
  )
  const [style, setStyle] = useState(
    shouldRestoreProjectDraft ? restoredDraft?.style ?? getDefaultStyle(defaultVisualStyle) : getDefaultStyle(defaultVisualStyle),
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
  const [importedFileName, setImportedFileName] = useState(
    resumeSnapshot
      ? resumeDetail?.fileName ?? resumeImport?.sourceFileName ?? ''
      : shouldRestoreProjectDraft ? restoredDraft?.importedFileName ?? '' : '',
  )
  const restoredDraftHasBasicInfo = shouldRestoreProjectDraft && Boolean(
    restoredDraft?.name?.trim()
    || restoredDraft?.script?.trim()
    || restoredDraft?.importedFileName?.trim()
    || (restoredDraft?.scriptImportId !== null && restoredDraft?.scriptImportId !== undefined),
  )
  const [basicInfoTouched, setBasicInfoTouched] = useState(restoredDraftHasBasicInfo)
  const basicInfoTouchedRef = useRef(restoredDraftHasBasicInfo)
  const markBasicInfoTouched = useCallback(() => {
    if (basicInfoTouchedRef.current) return
    basicInfoTouchedRef.current = true
    setBasicInfoTouched(true)
  }, [])
  const resetBasicInfoTouched = useCallback(() => {
    basicInfoTouchedRef.current = false
    setBasicInfoTouched(false)
  }, [])
  const [basicInfoBaseline, setBasicInfoBaseline] = useState<string | null>(() => {
    if (resumeSnapshot) {
      return createBasicInfoSnapshot({
        ...resumeSnapshot,
        id: resumeSnapshot.id ?? resumeImportId,
        rawText: (resumeSnapshot.rawText ?? '').slice(0, MAX_SCRIPT_LENGTH),
      })
    }
    return createBasicInfoSnapshot({
      id: null,
      title: '',
      rawText: '',
      videoRatio: '9:16',
      targetMarket: 'overseas',
      visualStyleId: null,
      toneStyleId: null,
    })
  })
  const [restoringBasicInfo, setRestoringBasicInfo] = useState(
    isResumingScriptImport && !resumeDetail,
  )
  const [basicInfoRestoreFailed, setBasicInfoRestoreFailed] = useState(false)
  const [basicInfoRestoreRetryToken, setBasicInfoRestoreRetryToken] = useState(0)
  const [restoringImport, setRestoringImport] = useState(
    Boolean(
      resumeSnapshot
      && toCreationStepIndex(resumeSnapshot.currentStep) >= 1
      && restoredEpisodes.length === 0,
    ),
  )
  const [chapterRestoreRetryToken, setChapterRestoreRetryToken] = useState(0)
  const [parsingScript, setParsingScript] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [creatingEpisode, setCreatingEpisode] = useState(false)
  const [parsingEpisodeFile, setParsingEpisodeFile] = useState(false)
  const [episodeImportOpen, setEpisodeImportOpen] = useState(false)
  const [episodeImportText, setEpisodeImportText] = useState('')
  const [episodeImportFileName, setEpisodeImportFileName] = useState('')
  const [customStyleModalOpen, setCustomStyleModalOpen] = useState(false)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const basicInfoInteractionLocked = restoringBasicInfo
    || basicInfoRestoreFailed
    || parsingScript
    || submitting

  useProjectCreationDraft(PROJECT_CREATION_DRAFT_KEYS.project, {
    currentStep,
    createdProjectId,
    createdChapterIds,
    name,
    script,
    episodes,
    activeEpisodeIndex,
    ratio,
    visualStyle,
    styleCategory,
    style,
    importedFileName,
    scriptImportId,
    selectedStyleKeys,
    targetMarket,
  }, 350, projectDraftPersistEnabledRef)

  const ratioOptions = useMemo(() => {
    const values = videoRatioOptions.map((item) => item.value).filter(Boolean)
    return Array.from(new Set([...FALLBACK_RATIOS, ...values]))
  }, [videoRatioOptions])

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
  const visualStyleName = selectedVisualStyle?.value ?? ''
  const toneStyleName = selectedToneStyle?.value ?? ''
  useEffect(() => {
    if (!ratioOptions.includes(ratio)) {
      setRatio(ratioOptions.includes(defaultVideoRatio) ? defaultVideoRatio : ratioOptions[0] ?? '16:9')
    }
  }, [defaultVideoRatio, ratio, ratioOptions])

  useEffect(() => {
    const nextVisual = options.visualStyles.some((item) => item.value === visualStyle)
      ? visualStyle
      : defaultVisualStyle
    if (nextVisual !== visualStyle) setVisualStyle(nextVisual)
  }, [defaultVisualStyle, options.visualStyles, visualStyle])

  useEffect(() => {
    if (studioStyleOptionsLoading || studioStyleOptionsError) return
    setSelectedStyleKeys((current) => {
      const visual = resolveStyleSelectionKey('visual', current.visual, displayedStylesByCategory.visual)
      const tone = resolveStyleSelectionKey('tone', current.tone, displayedStylesByCategory.tone)
      if (visual === current.visual && tone === current.tone) return current
      return { ...current, visual, tone }
    })
  }, [displayedStylesByCategory, studioStyleOptionsError, studioStyleOptionsLoading])

  useEffect(() => {
    if (!studioStyleOptionsError) return
    message.error(getApiErrorMessage(
      studioStyleOptionsError,
      l('风格选项加载失败', 'Failed to load style options'),
    ))
  }, [l, studioStyleOptionsError])

  useEffect(() => {
    if (resumeImportId === null || resumeImportId === undefined) return
    const cacheKey = String(resumeImportId)
    if (appliedDetailImportIdRef.current === cacheKey) {
      setBasicInfoRestoreFailed(false)
      setRestoringBasicInfo(false)
      return
    }

    let active = true
    setBasicInfoRestoreFailed(false)
    setRestoringBasicInfo(true)
    void loadScriptImportDetail(resumeImportId)
      .then((detail) => {
        if (!active) return
        const restoredImportId = detail.id ?? resumeImportId
        const restoredScript = (detail.rawText ?? '').slice(0, MAX_SCRIPT_LENGTH)
        const restoredCreationStep = detail.currentStep === null || detail.currentStep === undefined
          ? toCreationStepIndex(resumeImport?.currentStep)
          : toCreationStepIndex(detail.currentStep)
        appliedDetailImportIdRef.current = cacheKey
        setBasicInfoRestoreFailed(false)
        setScriptImportId(restoredImportId)
        setBasicInfoBaseline(createBasicInfoSnapshot({
          ...detail,
          id: restoredImportId,
          rawText: restoredScript,
        }))
        setCurrentStep(restoredCreationStep)
        setName(detail.title ?? '')
        setScript(restoredScript)
        setRatio(detail.videoRatio ?? '9:16')
        setTargetMarket(detail.targetMarket ?? 'overseas')
        setImportedFileName(detail.fileName?.trim() || resumeImport?.sourceFileName || '')
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
        resetBasicInfoTouched()
        if (restoredCreationStep < 1) {
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
      restoringBasicInfo
      || basicInfoRestoreFailed
      || scriptImportId === null
      || currentStep < 1
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
    scriptImportId,
  ])

  const scriptLength = script.length
  const activeEpisode = episodes[activeEpisodeIndex]

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
      setImportedFileName(parsed.fileName?.trim() || file.name)
      setScript(parsedText.slice(0, MAX_SCRIPT_LENGTH))
      setScriptImportId(parsed.id ?? null)
      if (parsed.id !== null && parsed.id !== undefined) {
        primeScriptImportDetail(parsed.id, {
          ...parsed,
          id: parsed.id,
          fileName: parsed.fileName?.trim() || file.name,
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

      const parsedStyleCode = parsed.visualStyleCode?.trim()
      if (parsedStyleCode) {
        const matchedVisual = options.visualStyles.find((item) =>
          item.value === parsedStyleCode || item.label === parsedStyleCode,
        )
        if (matchedVisual) {
          setStyleCategory('visual')
          setVisualStyle(matchedVisual.value as ProjectVisualStyle)
          setStyle(getDefaultStyle(matchedVisual.value) as ProjectStyle)
        } else {
          const matchedStyleEntry = Object.entries(options.stylesByVisual).find(([, styles]) =>
            styles.some((item) => item.value === parsedStyleCode || item.label === parsedStyleCode),
          )
          const matchedStyle = matchedStyleEntry?.[1].find((item) =>
            item.value === parsedStyleCode || item.label === parsedStyleCode,
          )
          if (matchedStyleEntry && matchedStyle) {
            setStyleCategory('visual')
            setVisualStyle(matchedStyleEntry[0] as ProjectVisualStyle)
            setStyle(matchedStyle.value as ProjectStyle)
          }
        }
      }

      message.success(l('剧本解析完成', 'Script parsed'))
    } catch (error) {
      message.error(getApiErrorMessage(error, l('剧本解析失败', 'Script parsing failed')))
    } finally {
      setParsingScript(false)
    }
  }

  const currentBasicInfoSnapshot = useMemo(() => createBasicInfoSnapshot({
    id: scriptImportId,
    title: name,
    rawText: script,
    videoRatio: ratio,
    targetMarket,
    visualStyleId: selectedVisualStyleId,
    toneStyleId: selectedToneStyleId,
  }), [
    name,
    ratio,
    script,
    scriptImportId,
    selectedToneStyleId,
    selectedVisualStyleId,
    targetMarket,
  ])
  const hasBasicInfoContent = Boolean(
    name.trim()
    || script.trim()
    || importedFileName.trim()
    || scriptImportId !== null
  )
  const hasUnsavedBasicInfo = hasBasicInfoContent
    && basicInfoTouched
    && basicInfoBaseline !== null
    && currentBasicInfoSnapshot !== basicInfoBaseline

  const validateBasicInfo = () => {
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
      title: name.trim(),
      videoRatio: ratio,
      rawText: script,
      targetMarket,
      visualStyleId: selectedVisualStyleId,
      toneStyleId: selectedToneStyleId,
    }
  }

  const buildBasicInfoSaveRequest = () => {
    const sourceFileName = importedFileName.trim() || toManualScriptFileName(name)
    return {
      id: scriptImportId,
      sourceFileName,
      fileType: getScriptFileType(sourceFileName),
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
    let requestStage: 'confirm' | 'chapters' = 'confirm'
    try {
      const requestBody = buildBasicInfoConfirmRequest()
      const reusableConfirmation = confirmedBasicInfoRef.current?.snapshot === currentBasicInfoSnapshot
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

        const confirmedSnapshot = createBasicInfoSnapshot({
          ...requestBody,
          id: confirmedImportId,
        })
        const confirmedDetail: StudioScriptParseResult = {
          ...confirmed,
          id: confirmedImportId,
          currentStep: Math.max(2, Number(confirmed.currentStep) || 0),
          fileName: confirmed.fileName?.trim()
            || importedFileName.trim()
            || toManualScriptFileName(requestBody.title),
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
        }

        setScriptImportId(confirmedImportId)
        setBasicInfoBaseline(confirmedSnapshot)
        confirmedBasicInfoRef.current = {
          importId: confirmedImportId,
          snapshot: confirmedSnapshot,
        }
        resetBasicInfoTouched()
        primeScriptImportDetail(confirmedImportId, confirmedDetail)
        invalidateScriptImportChapters(confirmedImportId)
      }

      requestStage = 'chapters'
      const chapters = await StudioScriptsApi.getChapters(confirmedImportId)
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

  const leaveProjectCreation = () => {
    persistDraftOnUnmountRef.current = false
    projectDraftPersistEnabledRef.current = false
    clearProjectCreationDrafts()
    setExitConfirmOpen(false)
    navigate('/projects')
  }

  const handleSaveAndExit = async () => {
    if (basicInfoSubmissionRef.current || !validateBasicInfo()) return

    basicInfoSubmissionRef.current = true
    setSubmitting(true)
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
      setBasicInfoBaseline(createBasicInfoSnapshot({
        id: persistedId,
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
      }))
      primeScriptImportDetail(persistedId, {
        ...saved,
        id: persistedId,
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
      })
      invalidateScriptImportChapters(persistedId)
      resetBasicInfoTouched()
      message.success(l('基础信息已保存', 'Basic information saved'))
      leaveProjectCreation()
    } catch (error) {
      message.error(getApiErrorMessage(error, l('保存基础信息失败', 'Failed to save basic information')))
    } finally {
      basicInfoSubmissionRef.current = false
      setSubmitting(false)
    }
  }

  const closeEpisodeImport = () => {
    if (parsingEpisodeFile) return
    setEpisodeImportOpen(false)
    setEpisodeImportText('')
    setEpisodeImportFileName('')
  }

  const handleEpisodeFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setEpisodeImportFileName(file.name)
    setParsingEpisodeFile(true)
    try {
      const parsed = await StudioScriptsApi.parseChapterFile(file)
      const parsedText = parsed.rawText ?? ''
      setEpisodeImportFileName(parsed.fileName?.trim() || file.name)
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
    if (restoringImport) {
      message.info(l('正在恢复分集数据，请稍候', 'Episodes are still being restored'))
      return
    }
    if (!episodeImportText.trim()) {
      message.warning(l('请输入剧集内容', 'Enter episode content'))
      return
    }
    if (scriptImportId === null) {
      message.warning(l('缺少剧本导入 ID，请重新解析剧本', 'Missing script import ID. Parse the script again.'))
      return
    }

    setCreatingEpisode(true)
    chapterRestoreRequestRef.current += 1
    try {
      const previousEpisodeIds = new Set(episodes.map((episode) => episode.id))
      const createdChapters = await StudioScriptsApi.createChapter({
        scriptImportId,
        rawText: episodeImportText,
      })
      invalidateScriptImportChapters(scriptImportId)
      const chapters = await StudioScriptsApi.getChapters(scriptImportId)
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
      const createdImportChapterIds = new Set(createdChapters
        .map((chapter) => chapter.id)
        .filter((id): id is StudioScriptImportId => id !== null && id !== undefined)
        .map(String))
      const createdEpisodeIndex = nextEpisodes.findIndex((episode) =>
        createdImportChapterIds.has(episode.id))
      const appendedEpisodeIndex = nextEpisodes.findIndex((episode) => !previousEpisodeIds.has(episode.id))
      setEpisodes(nextEpisodes)
      setActiveEpisodeIndex(createdEpisodeIndex >= 0
        ? createdEpisodeIndex
        : appendedEpisodeIndex >= 0
          ? appendedEpisodeIndex
          : Math.max(0, nextEpisodes.length - 1))
      closeEpisodeImport()
      message.success(l('剧集已新增', 'Episode added'))
    } catch (error) {
      message.error(getApiErrorMessage(error, l('新增剧集失败', 'Failed to add episode')))
    } finally {
      setCreatingEpisode(false)
    }
  }

  const handleCreateProject = async () => {
    if (restoringBasicInfo || basicInfoRestoreFailed) {
      message.info(l('请先恢复完整的剧本基本信息', 'Restore the complete script information first.'))
      return
    }
    if (studioStyleOptionsLoading) {
      message.info(l('正在加载风格选项，请稍候', 'Style options are still loading'))
      return
    }
    if (studioStyleOptionsError) {
      message.warning(l('风格选项加载失败，请先重试', 'Style options failed to load. Retry first.'))
      return
    }
    if (!selectedVisualStyle || !selectedToneStyle) {
      message.warning(l('原风格已不可用，请返回基本信息重新选择', 'A saved style is unavailable. Return to Basics and select again.'))
      return
    }
    if (!episodes.length || episodes.some((episode) => !episode.rawText.trim())) {
      message.warning(l('请填写每一集的剧本内容', 'Enter script content for every episode'))
      return
    }
    setSubmitting(true)
    try {
      const projectStyle = options.stylesByVisual[visualStyle]?.some((item) => item.value === style)
        ? style
        : getDefaultStyle(visualStyle)
      const projectSettings = {
        name: name.trim(),
        description: '',
        style: projectStyle as ProjectStyle,
        visual_style: visualStyle as ProjectVisualStyle,
        unify_style: true,
        progress: 0,
        default_video_ratio: ratio,
      }
      let projectId = createdProjectId
      if (projectId) {
        await StudioProjectsService.updateProjectApiV1StudioProjectsProjectIdPatch({
          projectId,
          requestBody: projectSettings,
        })
      } else {
        const requestedProjectId = createId('project')
        const projectResponse = await StudioProjectsService.createProjectApiV1StudioProjectsPost({
          requestBody: {
            id: requestedProjectId,
            ...projectSettings,
            seed: Math.floor(Math.random() * 100_000),
          },
        })
        projectId = projectResponse.data?.id ?? requestedProjectId
      }

      const chapterEntries = await Promise.all(
        episodes.map(async (episode, index) => {
          const existingChapterId = createdChapterIds[episode.id]
          if (existingChapterId) {
            await StudioChaptersService.updateChapterApiV1StudioChaptersChapterIdPatch({
              chapterId: existingChapterId,
              requestBody: {
                project_id: projectId,
                index: index + 1,
                title: episode.title,
                summary: '',
                raw_text: episode.rawText,
                storyboard_count: 0,
                status: 'draft',
              },
            })
            return [episode.id, existingChapterId] as const
          }

          const chapterId = createId('chapter')
          await StudioChaptersService.createChapterApiV1StudioChaptersPost({
            requestBody: {
              id: chapterId,
              project_id: projectId,
              index: index + 1,
              title: episode.title,
              summary: '',
              raw_text: episode.rawText,
              storyboard_count: 0,
              status: 'draft',
            },
          })
          return [episode.id, chapterId] as const
        }),
      )

      setCreatedProjectId(projectId)
      setCreatedChapterIds(Object.fromEntries(chapterEntries))
      setCurrentStep(2)
      message.success(createdProjectId
        ? l('分集修改已保存', 'Episode changes saved')
        : l('项目与剧本已保存', 'Project and script saved'))
    } catch {
      message.error(l('创建失败，请稍后重试', 'Creation failed. Please try again.'))
    } finally {
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
        setSelectedStyleKeys((current) => ({
          ...current,
          [customStyleCategory]: `${customStyleType}:${created.id}`,
        }))
      }
      setCustomStyleModalOpen(false)
      message.success(l('\u81ea\u5b9a\u4e49\u98ce\u683c\u5df2\u521b\u5efa\u5e76\u5e94\u7528', 'Custom style created and applied'))
      void refreshStudioStyleOptions().then((nextOptions) => {
        const createdOption = nextOptions[customStyleCategory].find((item) =>
          (created.id !== null && created.id !== undefined && String(item.id) === String(created.id))
          || item.name.trim() === value)
        if (!createdOption) return
        setSelectedStyleKeys((current) => ({
          ...current,
          [customStyleCategory]: `${createdOption.styleType}:${createdOption.id}`,
        }))
      }).catch(() => undefined)
    } catch (error) {
      message.error(getApiErrorMessage(
        error,
        l('\u81ea\u5b9a\u4e49\u98ce\u683c\u521b\u5efa\u5931\u8d25', 'Failed to create custom style'),
      ))
    }
  }

  const hasRequiredBasicInfo = Boolean(name.trim() && script.trim() && ratio)
  const styleSelectionReady = !studioStyleOptionsLoading
    && !studioStyleOptionsError
    && Boolean(selectedVisualStyle && selectedToneStyle)
  const canProceed = !restoringBasicInfo
    && !basicInfoRestoreFailed
    && styleSelectionReady
    && (currentStep === 0
      ? hasRequiredBasicInfo
      : currentStep === 1
        ? !restoringImport
          && episodes.length > 0
          && episodes.every((episode) => episode.title.trim() && episode.rawText.trim())
        : Boolean(createdProjectId))

  const handleNext = () => {
    if (currentStep === 0) {
      void handleEnterEpisodes()
      return
    }
    if (currentStep === 1) {
      void handleCreateProject()
      return
    }
    if (currentStep === 2 && createdProjectId) {
      setCurrentStep(3)
      return
    }
    if (currentStep === 3) message.info(l('剪辑表导出功能待接入', 'Export is not connected yet'))
  }

  const workflowDataUnavailable = restoringBasicInfo
    || basicInfoRestoreFailed
    || restoringImport
    || episodes.length === 0
    || !styleSelectionReady
  const renderWorkflowRestoreState = () => {
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
    if (studioStyleOptionsLoading) {
      return (
        <div className="project-create-page__restore-state" role="status">
          <Spin />
          <span>{l('正在加载风格选项...', 'Loading style options...')}</span>
        </div>
      )
    }
    if (studioStyleOptionsError) {
      return (
        <div className="project-create-page__restore-state is-empty" role="alert">
          <span>{l('风格选项加载失败', 'Failed to load style options')}</span>
          <Button onClick={() => void refreshStudioStyleOptions().catch(() => undefined)}>
            {l('重试加载风格', 'Retry styles')}
          </Button>
        </div>
      )
    }
    if (!selectedVisualStyle || !selectedToneStyle) {
      return (
        <div className="project-create-page__restore-state is-empty" role="alert">
          <span>{l('原风格已不可用，请重新选择', 'A saved style is no longer available.')}</span>
          <Button onClick={() => setCurrentStep(0)}>
            {l('返回基本信息', 'Return to Basics')}
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
            disabled={currentStep === 0 && (parsingScript || submitting)}
            onClick={() => {
              if (currentStep === 0 && hasUnsavedBasicInfo) {
                setExitConfirmOpen(true)
                return
              }
              leaveProjectCreation()
            }}
          />
          <ol className={`project-create-page__steps${currentStep === 3 ? ' is-final-step' : ''}`} aria-label={l('创建步骤', 'Creation steps')}>
            {steps.map((step, index) => (
              <li
                key={step}
                className={`${index === currentStep ? 'is-active' : ''}${index < currentStep ? ' is-complete' : ''}`}
              >
                <button
                  type="button"
                  className="project-create-page__step-button"
                  disabled={!((currentStep === 2 && index === 1) || (currentStep === 3 && index === 2))}
                  title={currentStep === 2 && index === 1
                    ? l('返回剧本分集', 'Back to episodes')
                    : currentStep === 3 && index === 2
                      ? l('返回资产确认', 'Back to assets')
                      : undefined}
                  onClick={() => setCurrentStep(currentStep === 3 ? 2 : 1)}
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
            aria-label={l(`余额 ${balance.toLocaleString()}`, `Balance ${balance.toLocaleString()}`)}
          >
            <span className="project-create-page__balance-label">{l('余额', 'Balance')}</span>
            <span className="project-create-page__balance-value">
              <ThunderboltFilled />
              <strong>{balance.toLocaleString()}</strong>
            </span>
          </div>
          {currentStep === 3 && (
            <Button onClick={() => setCurrentStep(2)}>{l('上一步', 'Previous')}</Button>
          )}
          <Button
            type="primary"
            icon={<ArrowRightOutlined />}
            iconPosition="end"
            disabled={!canProceed || submitting || parsingScript}
            loading={submitting}
            onClick={handleNext}
          >
            {currentStep === 3 ? l('导出剪辑表', 'Export edit list') : l('下一步', 'Next')}
          </Button>
        </div>
      </header>

      {currentStep === 0 ? <main
        className="project-create-page__main"
        aria-busy={restoringBasicInfo || parsingScript || submitting}
      >
        <section className="project-create-page__form" aria-label={l('基本信息', 'Basic information')}>
          {restoringBasicInfo ? (
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
                || basicInfoRestoreFailed
                || restoringImport
                || !styleSelectionReady
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
        <ProjectAssetsStep episodes={episodes} ratio={ratio} styleName={visualStyleName} />
      ) : (
        <ProjectClipEditingStep
          episodes={episodes}
          ratio={ratio}
          styleName={visualStyleName}
          toneStyleName={toneStyleName}
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
            <Button disabled={submitting} onClick={leaveProjectCreation}>
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
          <button type="button" aria-label={l('关闭', 'Close')} disabled={parsingEpisodeFile} onClick={closeEpisodeImport}>
            <CloseOutlined />
          </button>
        </header>
        <div className="project-create-page__episode-import-editor">
          <div className="project-create-page__episode-import-toolbar">
            <Button
              icon={<PlusOutlined />}
              loading={parsingEpisodeFile}
              disabled={creatingEpisode || parsingEpisodeFile}
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
              disabled={creatingEpisode || parsingEpisodeFile}
              onChange={handleEpisodeFileImport}
            />
          </div>
          <textarea
            value={episodeImportText}
            disabled={creatingEpisode || parsingEpisodeFile}
            maxLength={MAX_SCRIPT_LENGTH}
            placeholder={l('请输入剧集内容...', 'Enter episode content...')}
            onChange={(event) => setEpisodeImportText(event.target.value)}
          />
        </div>
        <footer className="project-create-page__episode-import-footer">
          <span>{l(`已输入 ${episodeImportText.length.toLocaleString()} 字`, `${episodeImportText.length.toLocaleString()} characters entered`)}</span>
          <Button
            type="primary"
            loading={creatingEpisode}
            disabled={!episodeImportText.trim() || restoringImport || creatingEpisode || parsingEpisodeFile || scriptImportId === null}
            onClick={() => void handleImportEpisodes()}
          >
            {l('提交', 'Submit')}
          </Button>
        </footer>
      </Modal>
    </div>
  )
}

export default ProjectCreatePage
