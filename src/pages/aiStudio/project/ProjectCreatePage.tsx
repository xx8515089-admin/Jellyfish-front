import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, message, Modal, theme, Tooltip } from 'antd'
import {
  ArrowRightOutlined,
  CloseOutlined,
  ExclamationCircleFilled,
  FileAddOutlined,
  PlusOutlined,
  StopOutlined,
  ThunderboltFilled,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../../../services/apiErrors'
import { StudioChaptersService, StudioProjectsService } from '../../../services/generated'
import { StudioScriptsApi } from '../../../services/studioScripts'
import type { StudioScriptImportId, StudioScriptParseChapter } from '../../../services/studioScripts'
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
import './ProjectCreatePage.css'

const MAX_NAME_LENGTH = 100
const MAX_SCRIPT_LENGTH = 200_000
const MAX_EPISODE_LENGTH = 50_000
const RECOMMENDED_SCRIPT_LENGTH = 50
const FALLBACK_RATIOS = ['9:16', '4:3', '16:9', '3:4', '1:1', '21:9']
const TEXT_IMPORT_EXTENSIONS = ['.txt', '.md']
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
}
type DisplayedStyle = {
  key: string
  value: string
  label: string
  preview: StylePreview
  coverUrl?: string
  description?: string
  id?: StudioScriptImportId
}

/** Maps one backend style record and its online cover to the project tile model. */
const toDisplayedStyle = (item: StudioStyleOption): DisplayedStyle => ({
  key: `${item.styleType}:${item.id}`,
  value: item.name.trim(),
  label: item.name.trim(),
  preview: 'online',
  coverUrl: item.coverUrl?.trim() || undefined,
  description: item.description?.trim() || undefined,
  id: item.id,
})

const isNoStyleOption = (item: StudioStyleOption) => {
  const normalizedName = item.name.trim().toLowerCase()
  return normalizedName === '无风格' || normalizedName === 'no style'
}

/** Prepends the frontend-owned no-style tile while retaining its backend ID. */
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
    },
    ...items.filter((item) => !isNoStyleOption(item)).map(toDisplayedStyle),
  ]
}

/** Converts the cropped preview into the JPG or PNG file required by the cover API. */
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

const canReadImportedScriptAsText = (fileName: string) => {
  const normalizedName = fileName.toLowerCase()
  return TEXT_IMPORT_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))
}

const toManualScriptFileName = (title: string) => {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
  return `${safeTitle || 'script'}.txt`
}

const ProjectCreatePage: React.FC = () => {
  const l = useBilingualText()
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const balance = useAppStore((state) => state.user.apiRemaining)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const episodeImportInputRef = useRef<HTMLInputElement>(null)
  const persistDraftOnUnmountRef = useRef(true)
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

  const [restoredDraft] = useState(() =>
    readProjectCreationDraft<ProjectCreateDraft>(PROJECT_CREATION_DRAFT_KEYS.project))
  const restoredEpisodes = Array.isArray(restoredDraft?.episodes) ? restoredDraft.episodes : []
  const restoredStep = Math.min(3, Math.max(0, Number(restoredDraft?.currentStep) || 0))
  const [currentStep, setCurrentStep] = useState(restoredEpisodes.length ? restoredStep : 0)
  const [scriptImportId, setScriptImportId] = useState<StudioScriptImportId | null>(
    restoredDraft?.scriptImportId ?? null,
  )
  const [createdProjectId, setCreatedProjectId] = useState(restoredDraft?.createdProjectId ?? '')
  const [createdChapterIds, setCreatedChapterIds] = useState<Record<string, string>>(
    restoredDraft?.createdChapterIds ?? {},
  )
  const [name, setName] = useState(restoredDraft?.name ?? '')
  const [script, setScript] = useState(restoredDraft?.script ?? '')
  const [episodes, setEpisodes] = useState<EpisodeDraft[]>(restoredEpisodes)
  const [activeEpisodeIndex, setActiveEpisodeIndex] = useState(() =>
    Math.min(Math.max(0, restoredDraft?.activeEpisodeIndex ?? 0), Math.max(0, restoredEpisodes.length - 1)))
  const [ratio, setRatio] = useState(restoredDraft?.ratio ?? '9:16')
  const [visualStyle, setVisualStyle] = useState(restoredDraft?.visualStyle ?? defaultVisualStyle)
  const [styleCategory, setStyleCategory] = useState<StyleCategoryKey>(
    restoredDraft?.styleCategory === 'tone' ? 'tone' : 'visual',
  )
  const [style, setStyle] = useState(restoredDraft?.style ?? getDefaultStyle(defaultVisualStyle))
  const [selectedStyleKeys, setSelectedStyleKeys] = useState<Partial<Record<StyleCategoryKey, string>>>(
    restoredDraft?.selectedStyleKeys ?? {},
  )
  const [importedFileName, setImportedFileName] = useState(restoredDraft?.importedFileName ?? '')
  const [parsingScript, setParsingScript] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [creatingEpisode, setCreatingEpisode] = useState(false)
  const [parsingEpisodeFile, setParsingEpisodeFile] = useState(false)
  const [episodeImportOpen, setEpisodeImportOpen] = useState(false)
  const [episodeImportText, setEpisodeImportText] = useState('')
  const [episodeImportFileName, setEpisodeImportFileName] = useState('')
  const [customStyleModalOpen, setCustomStyleModalOpen] = useState(false)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)

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
  }, 350, persistDraftOnUnmountRef)

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
  const displayedStyles = displayedStylesByCategory[styleCategory]
  const selectedVisualStyle = displayedStylesByCategory.visual.find(
    (item) => item.key === selectedStyleKeys.visual,
  )
  const selectedToneStyle = displayedStylesByCategory.tone.find(
    (item) => item.key === selectedStyleKeys.tone,
  )
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
      const visual = displayedStylesByCategory.visual.some((item) => item.key === current.visual)
        ? current.visual
        : displayedStylesByCategory.visual[0]?.key
      const tone = displayedStylesByCategory.tone.some((item) => item.key === current.tone)
        ? current.tone
        : displayedStylesByCategory.tone[0]?.key
      if (visual === current.visual && tone === current.tone) return current
      return { visual, tone }
    })
  }, [displayedStylesByCategory, studioStyleOptionsError, studioStyleOptionsLoading])

  useEffect(() => {
    if (studioStyleOptionsLoading || studioStyleOptionsError) return
    const selectedStyle = displayedStyles.find((item) => item.key === selectedStyleKeys[styleCategory])
      ?? displayedStyles[0]
    if (selectedStyle && selectedStyle.value !== style) setStyle(selectedStyle.value)
  }, [displayedStyles, selectedStyleKeys, studioStyleOptionsError, studioStyleOptionsLoading, style, styleCategory])

  useEffect(() => {
    if (!studioStyleOptionsError) return
    message.error(getApiErrorMessage(
      studioStyleOptionsError,
      l('风格选项加载失败', 'Failed to load style options'),
    ))
  }, [l, studioStyleOptionsError])

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
    if (!file) return

    setImportedFileName(file.name)
    setScriptImportId(null)
    setParsingScript(true)
    try {
      const parsed = await StudioScriptsApi.parse(file)
      const parsedText = (parsed.rawText ?? '').trim()
      if (!parsedText) {
        message.warning(l('解析完成，但未返回剧本文本', 'Parsed successfully, but no script text was returned'))
        return
      }

      setScript(parsedText.slice(0, MAX_SCRIPT_LENGTH))
      setScriptImportId(parsed.id ?? null)
      setSelectedStyleKeys((current) => {
        const parsedVisual = displayedStylesByCategory.visual.find((item) =>
          parsed.visualStyleId !== null && parsed.visualStyleId !== undefined && String(item.id) === String(parsed.visualStyleId))
        const parsedTone = displayedStylesByCategory.tone.find((item) =>
          parsed.toneStyleId !== null && parsed.toneStyleId !== undefined && String(item.id) === String(parsed.toneStyleId))
        if (!parsedVisual && !parsedTone) return current
        return {
          ...current,
          visual: parsedVisual?.key ?? current.visual,
          tone: parsedTone?.key ?? current.tone,
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
      if (canReadImportedScriptAsText(file.name)) {
        try {
          const text = await file.text()
          setScript(text.slice(0, MAX_SCRIPT_LENGTH))
          message.warning(l('解析接口调用失败，已按本地文本导入', 'Parsing API failed; imported the local text instead'))
          return
        } catch {
          // Fall through to the API error below.
        }
      }
      message.error(getApiErrorMessage(error, l('剧本解析失败', 'Script parsing failed')))
    } finally {
      setParsingScript(false)
    }
  }

  const hasUnsavedBasicInfo = Boolean(
    name.trim()
    || script.trim()
    || importedFileName.trim()
    || scriptImportId !== null
  )

  const validateBasicInfo = () => {
    if (!name.trim()) {
      message.warning(l('请输入作品名称', 'Enter a project name'))
      return false
    }
    if (!script.trim()) {
      message.warning(l('请输入剧本原文', 'Enter the script'))
      return false
    }
    if (!selectedVisualStyle || !selectedToneStyle) {
      message.warning(l('请选择画面风格和影调风格', 'Select both a visual style and a tone style'))
      return false
    }
    return true
  }

  const buildBasicInfoConfirmRequest = (
    importId: StudioScriptImportId,
    visualStyleOption: DisplayedStyle,
    toneStyleOption: DisplayedStyle,
  ) => {
    return {
      id: importId,
      title: name.trim(),
      videoRatio: ratio,
      rawText: script,
      targetMarket: 'overseas',
      visualStyleId: visualStyleOption.id ?? null,
      toneStyleId: toneStyleOption.id ?? null,
    }
  }

  const ensureScriptImportId = async () => {
    if (scriptImportId !== null) return scriptImportId

    const fileName = toManualScriptFileName(name)
    const parsed = await StudioScriptsApi.parse(
      new File([script], fileName, { type: 'text/plain' }),
    )
    if (parsed.id === null || parsed.id === undefined) {
      throw new Error(l('剧本解析未返回导入 ID', 'Script parsing did not return an import ID'))
    }
    const parsedText = (parsed.rawText ?? '').trim()
    if (parsedText) setScript(parsedText.slice(0, MAX_SCRIPT_LENGTH))
    setImportedFileName(parsed.fileName?.trim() || fileName)
    setScriptImportId(parsed.id)
    return parsed.id
  }

  const handleEnterEpisodes = async () => {
    const visualStyleOption = selectedVisualStyle
    const toneStyleOption = selectedToneStyle
    if (!validateBasicInfo() || !visualStyleOption || !toneStyleOption) return

    setSubmitting(true)
    try {
      const importId = await ensureScriptImportId()
      const requestBody = buildBasicInfoConfirmRequest(importId, visualStyleOption, toneStyleOption)
      const confirmed = await StudioScriptsApi.confirmBasicInfo(requestBody)
      if (confirmed.id === null || confirmed.id === undefined) {
        throw new Error(l('确认接口未返回剧本导入 ID', 'The confirmation response did not include an import ID'))
      }

      const chapters = await StudioScriptsApi.getChapters(confirmed.id)
      if (!chapters.length) {
        message.warning(l('分集完成，但未查询到分集列表', 'Segmentation completed, but no chapters were returned'))
        return
      }

      const nextEpisodes = toEpisodeDrafts(
        chapters,
        (episodeNumber) => l(`第${episodeNumber}集`, `Episode ${episodeNumber}`),
      )
      setScriptImportId(confirmed.id)
      setEpisodes(nextEpisodes)
      setActiveEpisodeIndex(0)
      setCurrentStep(1)
    } catch (error) {
      message.error(getApiErrorMessage(error, l('剧本基本信息确认失败', 'Failed to confirm script information')))
    } finally {
      setSubmitting(false)
    }
  }

  const leaveProjectCreation = () => {
    persistDraftOnUnmountRef.current = false
    clearProjectCreationDrafts()
    setExitConfirmOpen(false)
    navigate('/projects')
  }

  const handleSaveAndExit = async () => {
    const visualStyleOption = selectedVisualStyle
    const toneStyleOption = selectedToneStyle
    if (!validateBasicInfo() || !visualStyleOption || !toneStyleOption) return

    setSubmitting(true)
    try {
      const importId = await ensureScriptImportId()
      const requestBody = buildBasicInfoConfirmRequest(importId, visualStyleOption, toneStyleOption)
      await StudioScriptsApi.confirmBasicInfo(requestBody)
      message.success(l('基础信息已保存', 'Basic information saved'))
      leaveProjectCreation()
    } catch (error) {
      message.error(getApiErrorMessage(error, l('保存基础信息失败', 'Failed to save basic information')))
    } finally {
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
    if (!episodeImportText.trim()) {
      message.warning(l('请输入剧集内容', 'Enter episode content'))
      return
    }
    if (scriptImportId === null) {
      message.warning(l('缺少剧本导入 ID，请重新解析剧本', 'Missing script import ID. Parse the script again.'))
      return
    }

    setCreatingEpisode(true)
    try {
      const previousEpisodeIds = new Set(episodes.map((episode) => episode.id))
      const createdChapters = await StudioScriptsApi.createChapter({
        scriptImportId,
        rawText: episodeImportText,
      })
      const chapters = await StudioScriptsApi.getChapters(scriptImportId)
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
    if (!episodes.length || episodes.some((episode) => !episode.rawText.trim())) {
      message.warning(l('请填写每一集的剧本内容', 'Enter script content for every episode'))
      return
    }
    setSubmitting(true)
    try {
      const projectSettings = {
        name: name.trim(),
        description: '',
        style: (
          style && !style.startsWith('__tone_')
            ? style
            : getDefaultStyle(visualStyle)
        ) as ProjectStyle,
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
      setStyle(value as ProjectStyle)
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

  const canProceed = currentStep === 0
    ? Boolean(
      name.trim()
      && script.trim()
      && ratio
      && visualStyle
      && selectedVisualStyle
      && selectedToneStyle
    )
    : currentStep === 1
      ? episodes.length > 0 && episodes.every((episode) => episode.title.trim() && episode.rawText.trim())
      : Boolean(createdProjectId)

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

      {currentStep === 0 ? <main className="project-create-page__main">
        <section className="project-create-page__form" aria-label={l('基本信息', 'Basic information')}>
          <label className="project-create-page__field-label" htmlFor="project-create-name">
            {l('作品名称', 'Project name')}
          </label>
          <Input
            id="project-create-name"
            className="project-create-page__name-input"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder={l('请输入名称，最多100字', 'Enter a name, up to 100 characters')}
            onChange={(event) => setName(event.target.value)}
          />

          <label className="project-create-page__field-label project-create-page__script-label" htmlFor="project-create-script">
            {l('剧本原文', 'Script')}
          </label>
          <div className="project-create-page__script-editor">
            <div className="project-create-page__script-toolbar">
              <Button
                icon={<FileAddOutlined />}
                loading={parsingScript}
                disabled={parsingScript}
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
                onChange={handleFileImport}
              />
            </div>
            <textarea
              id="project-create-script"
              value={script}
              maxLength={MAX_SCRIPT_LENGTH}
              placeholder={l('请输入剧本内容，需用“第X集”进行集数标注', 'Enter the script and mark episodes with “Episode X” headings')}
              onChange={(event) => setScript(event.target.value)}
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
                  onClick={() => setRatio(item)}
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
                  onClick={() => {
                    setStyleCategory(item.key)
                    const nextStyle = displayedStylesByCategory[item.key].find(
                      (displayedStyle) => displayedStyle.key === selectedStyleKeys[item.key],
                    ) ?? displayedStylesByCategory[item.key][0]
                    setStyle(nextStyle?.value ?? '')
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
            <div className="project-create-page__styles is-tile-category" aria-busy={studioStyleOptionsLoading}>
              {displayedStyles.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={selectedStyleKeys[styleCategory] === item.key}
                  className={`project-create-page__style-tile${selectedStyleKeys[styleCategory] === item.key ? ' is-selected' : ''}`}
                  title={item.description || item.label}
                  onClick={() => {
                    setSelectedStyleKeys((current) => ({ ...current, [styleCategory]: item.key }))
                    setStyle(item.value)
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
      </main> : currentStep === 1 ? (
        <main className="project-create-page__episodes">
          <aside className="project-create-page__episode-nav" aria-label={l('分集列表', 'Episode list')}>
            <h2>{l('分集', 'Episodes')}</h2>
            <button
              type="button"
              className="project-create-page__episode-add"
              aria-label={l('重新导入剧本', 'Import another script')}
              title={l('重新导入剧本', 'Import another script')}
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
            {activeEpisode && (
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
            )}
          </section>
        </main>
      ) : currentStep === 2 ? (
        <ProjectAssetsStep episodes={episodes} ratio={ratio} styleName={style} />
      ) : (
        <ProjectClipEditingStep episodes={episodes} ratio={ratio} styleName={style} />
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
          <div
            className="project-create-page__exit-icon"
            style={{ color: token.colorPrimary, background: token.colorPrimaryBg }}
            aria-hidden="true"
          >
            <ExclamationCircleFilled />
          </div>
          <h2>{l('确认退出？', 'Exit creation?')}</h2>
          <p>{l('基础信息的内容尚未保存，是否直接退出？', 'Your basic information has not been saved. Exit anyway?')}</p>
          <div className="project-create-page__exit-actions">
            <Button disabled={submitting} onClick={leaveProjectCreation}>
              {l('直接退出', 'Exit without saving')}
            </Button>
            <Button type="primary" loading={submitting} onClick={() => void handleSaveAndExit()}>
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
            disabled={!episodeImportText.trim() || creatingEpisode || parsingEpisodeFile || scriptImportId === null}
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
