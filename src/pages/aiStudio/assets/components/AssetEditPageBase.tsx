import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Image,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { ArrowLeftOutlined, CloseCircleOutlined, EditOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { FilmService, ScriptProcessingService, StudioFilesService } from '../../../../services/generated'
import type { TaskStatus } from '../../../../services/generated'
import { listTaskLinksNormalized } from '../../../../services/filmTaskLinks'
import { buildFileDownloadUrl } from '../utils'
import { DisplayImageCard } from './DisplayImageCard'
import { ProjectVisualStyleAndStyleFields } from '../../project/ProjectVisualStyleAndStyleFields'
import { useProjectStyleOptions } from '../../project/useProjectStyleOptions'
import { defaultTaskActionErrorMessage, executeAsyncTaskCreate, executeTaskCancel, notifyExistingTask } from '../../components/taskActionHelpers'
import { handleTaskResultSafely } from '../../components/taskResultHelpers'
import { useRelationTaskNotification } from '../../components/taskNotificationHelpers'
import { useTaskPageContext } from '../../components/taskPageContext'
import { TASK_COPY } from '../../components/taskCopy'
import { useLocation } from 'react-router-dom'
import { useGenerationDraft } from '../../hooks/useGenerationDraft'
import { useBilingualText } from '../../../../i18n/useBilingualText'
import { AssetGenerationBatchApi, type AssetGenerationSpec } from '../../../../services/assetGenerationBatch'
import {
  CHARACTER_PORTRAIT_ANALYSIS_RELATION_TYPE,
  COSTUME_INFO_ANALYSIS_RELATION_TYPE,
  PROP_INFO_ANALYSIS_RELATION_TYPE,
  SCENE_INFO_ANALYSIS_RELATION_TYPE,
  type RelationTaskState,
  toRelationTaskStateFromStatusRead,
  useCancelableRelationTask,
} from '../../project/ProjectWorkbench/chapterDivisionTasks'

const MAX_VIEW_COUNT = 4
// 与后端 `AssetViewAngle`（backend/app/models/studio.py）一致的枚举值
export type AssetViewAngle =
  | 'FRONT'
  | 'LEFT'
  | 'RIGHT'
  | 'BACK'
  | 'THREE_QUARTER'
  | 'TOP'
  | 'DETAIL'

export type AssetUpdate = {
  name: string
  description: string
  tags: string[]
  view_count: number
  visual_style: '现实' | '动漫'
  style?: string
}

const DEFAULT_ANGLES: AssetViewAngle[] = ['FRONT', 'LEFT', 'RIGHT', 'BACK']

const ANGLE_LABEL_MAP: Record<AssetViewAngle, string> = {
  FRONT: '正面',
  LEFT: '左侧',
  RIGHT: '右侧',
  BACK: '背面',
  THREE_QUARTER: '3/4 侧面',
  TOP: '俯视',
  DETAIL: '细节',
}

const ANGLE_LABEL_EN_MAP: Record<AssetViewAngle, string> = {
  FRONT: 'Front', LEFT: 'Left', RIGHT: 'Right', BACK: 'Back',
  THREE_QUARTER: '3/4 view', TOP: 'Top', DETAIL: 'Detail',
}

export type BaseAsset = {
  id: string
  name: string
  description?: string
  tags?: string[]
  view_count?: number
  visual_style?: '现实' | '动漫'
  style?: string
}

export type BaseAssetImage = {
  id: number
  view_angle?: AssetViewAngle
  file_id?: string | null
  width?: number | null
  height?: number | null
  format?: string | null
}

export type AssetEditPageBaseProps<TAsset extends BaseAsset, TImage extends BaseAssetImage> = {
  assetId?: string
  missingAssetIdText: string
  assetDisplayName: string
  backTo: string
  relationType: string
  getAsset: (assetId: string) => Promise<TAsset | null>
  updateAsset: (assetId: string, payload: AssetUpdate) => Promise<TAsset | null>
  listImages: (assetId: string) => Promise<TImage[]>
  createImageSlot: (assetId: string, angle: AssetViewAngle) => Promise<void>
  updateImage: (assetId: string, imageId: number, payload: { file_id: string | null; width?: number | null; height?: number | null; format?: string | null }) => Promise<void>
  renderPrompt: (assetId: string, imageId: number) => Promise<{ prompt: string; images: string[] }>
  createGenerationTask: (assetId: string, imageId: number, payload: { prompt: string; images: string[] }) => Promise<string | null>
  onNavigate: (to: string, replace?: boolean) => void
}

type HistoryCandidate<TImage extends BaseAssetImage> = {
  id: string
  file_id: string
  view_angle?: AssetViewAngle
  width?: number | null
  height?: number | null
  format?: string | null
  source: 'task-link' | 'image'
  originalImage?: TImage
}

type AssetFactoryType = 'actor' | 'scene' | 'prop' | 'costume'

function normalizeTags(input: string): string[] {
  return input
    .split(/[,，\n]/g)
    .map((t) => t.trim())
    .filter(Boolean)
}

function clampViewCount(value?: number | null): number {
  const next = Number.isFinite(value as number) ? Number(value) : 1
  return Math.max(1, Math.min(MAX_VIEW_COUNT, Math.trunc(next)))
}

function isImageUpload(file: File): boolean {
  if (file.type) return file.type.startsWith('image/')
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name)
}

function inferImageFormat(file: File): string {
  const ext = file.name.split('.').pop()?.trim().toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
  if (ext === 'webp') return 'webp'
  if (ext === 'gif') return 'gif'
  return 'png'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'succeeded' || status === 'recoverable_timeout' || status === 'failed' || status === 'cancelled'
}

function getSmartDetectRelationType(relationType: string): string | null {
  if (relationType === 'actor_image' || relationType === 'character_image') return CHARACTER_PORTRAIT_ANALYSIS_RELATION_TYPE
  if (relationType === 'scene_image') return SCENE_INFO_ANALYSIS_RELATION_TYPE
  if (relationType === 'prop_image') return PROP_INFO_ANALYSIS_RELATION_TYPE
  if (relationType === 'costume_image') return COSTUME_INFO_ANALYSIS_RELATION_TYPE
  return null
}

function getAssetNavigateRelationType(relationType: string): string | null {
  if (relationType === 'actor_image') return 'actor'
  if (relationType === 'character_image') return 'character'
  if (relationType === 'scene_image') return 'scene'
  if (relationType === 'prop_image') return 'prop'
  if (relationType === 'costume_image') return 'costume'
  return null
}

function getAssetFactoryType(relationType: string): AssetFactoryType | null {
  if (relationType === 'actor_image') return 'actor'
  if (relationType === 'scene_image') return 'scene'
  if (relationType === 'prop_image') return 'prop'
  if (relationType === 'costume_image') return 'costume'
  return null
}

function truncatePrompt(text: string, limit = 200): string {
  const trimmed = (text || '').trim()
  if (trimmed.length <= limit) return trimmed
  return `${trimmed.slice(0, limit)}...`
}

export function AssetEditPageBase<TAsset extends BaseAsset, TImage extends BaseAssetImage>({
  assetId,
  missingAssetIdText,
  assetDisplayName,
  backTo,
  relationType,
  getAsset,
  updateAsset,
  listImages,
  createImageSlot,
  updateImage,
  renderPrompt,
  createGenerationTask,
  onNavigate,
}: AssetEditPageBaseProps<TAsset, TImage>) {
  const l = useBilingualText()
  const assetDisplayNameEn = relationType === 'actor_image' ? 'Actor' : relationType === 'character_image' ? 'Character' : relationType === 'scene_image' ? 'Scene' : relationType === 'prop_image' ? 'Prop' : relationType === 'costume_image' ? 'Costume' : 'Asset'
  const missingAssetIdTextEn = `Missing ${relationType === 'actor_image' ? 'actor' : relationType === 'character_image' ? 'character' : relationType === 'scene_image' ? 'scene' : relationType === 'prop_image' ? 'prop' : relationType === 'costume_image' ? 'costume' : 'asset'} ID`
  const { options: projectStyleOptions, defaultVisualStyle, getDefaultStyle } = useProjectStyleOptions()
  const taskCopy = TASK_COPY.smartDetect
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [asset, setAsset] = useState<TAsset | null>(null)
  const [images, setImages] = useState<TImage[]>([])
  const [generationSpecs, setGenerationSpecs] = useState<AssetGenerationSpec[]>([])

  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formTags, setFormTags] = useState('')
  const [formViewCount, setFormViewCount] = useState(1)
  const [formVisualStyle, setFormVisualStyle] = useState<'现实' | '动漫'>(defaultVisualStyle as '现实' | '动漫')
  const [formStyle, setFormStyle] = useState<string>(getDefaultStyle(defaultVisualStyle))
  const [savingBase, setSavingBase] = useState(false)

  const [smartDetectLoading, setSmartDetectLoading] = useState(false)
  const [smartDetectOpen, setSmartDetectOpen] = useState(false)
  const [smartDetectIssues, setSmartDetectIssues] = useState<string[]>([])
  const [smartDetectOptimizedDesc, setSmartDetectOptimizedDesc] = useState('')

  const [generatingByImageId, setGeneratingByImageId] = useState<Record<number, boolean>>({})
  const [generationTask, setGenerationTask] = useState<RelationTaskState | null>(null)
  const [generationSettledTask, setGenerationSettledTask] = useState<RelationTaskState | null>(null)

  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false)
  const [promptPreviewLoading, setPromptPreviewLoading] = useState(false)
  const [promptPreviewImage, setPromptPreviewImage] = useState<TImage | null>(null)
  const promptDraft = useGenerationDraft<
    { prompt: string },
    { imageId: number | null; images: string[] },
    { prompt: string; images: string[] },
    { taskId: string | null }
  >({
    initialBase: { prompt: '' },
    initialContext: { imageId: null, images: [] },
    derive: async ({ base, context }) => {
      if (!assetId || !context.imageId) {
        throw new Error('asset image slot is required')
      }
      const result = await renderPrompt(assetId, context.imageId)
      return {
        prompt: (base.prompt || '').trim() || (result.prompt ?? ''),
        images: Array.isArray(result.images) ? result.images.filter(Boolean) : [],
      }
    },
    submit: async ({ context, derived }) => {
      if (!assetId || !context.imageId) {
        throw new Error('asset image slot is required')
      }
      const taskId = await createGenerationTask(assetId, context.imageId, {
        prompt: (derived.prompt || '').trim(),
        images: derived.images,
      })
      return { taskId }
    },
  })
  const promptPreviewDraft = promptDraft.base.prompt
  const promptPreviewRefFileIds = promptDraft.context.images
  const promptPreviewReferenceLabel =
    relationType === 'actor_image'
      ? l(`本次生成将使用 ${promptPreviewRefFileIds.length} 张 Actor face reference`, `This generation will use ${promptPreviewRefFileIds.length} actor face reference image(s)`)
      : l(`本次生成将使用 ${promptPreviewRefFileIds.length} 张参考图`, `This generation will use ${promptPreviewRefFileIds.length} reference image(s)`)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyCandidates, setHistoryCandidates] = useState<HistoryCandidate<TImage>[]>([])
  const [editingSlotImage, setEditingSlotImage] = useState<TImage | null>(null)
  const [adoptingImageId, setAdoptingImageId] = useState<string | null>(null)
  const [uploadProgressByImageId, setUploadProgressByImageId] = useState<Record<number, number>>({})
  const [clearingImageId, setClearingImageId] = useState<number | null>(null)
  const [promptSpec, setPromptSpec] = useState<AssetGenerationSpec | null>(null)
  const smartDetectRelationType = useMemo(() => getSmartDetectRelationType(relationType), [relationType])
  const smartDetectRelationEntityId = useMemo(
    () => (assetId && smartDetectRelationType ? `${relationType}:${assetId}` : null),
    [assetId, relationType, smartDetectRelationType],
  )
  const assetNavigateRelationType = useMemo(
    () => getAssetNavigateRelationType(relationType),
    [relationType],
  )
  const assetFactoryType = useMemo(() => getAssetFactoryType(relationType), [relationType])
  const applySmartDetectResult = useCallback(async (taskId: string) => {
    await handleTaskResultSafely(taskId, {
      readErrorMessage: l('读取智能检测结果失败', 'Failed to read smart detection results'),
      failedFallbackMessage: l('智能检测失败', 'Smart detection failed'),
      onSucceeded: (resultValue) => {
        const result = resultValue as Record<string, any>
        const issues = Array.isArray(result.issues)
          ? result.issues.filter((it: unknown): it is string => typeof it === 'string' && it.trim().length > 0)
          : []
        const optimizedDesc = String(result.optimized_description ?? '').trim()
        setSmartDetectIssues(issues)
        setSmartDetectOptimizedDesc(optimizedDesc)
        setSmartDetectOpen(true)
        if (issues.length > 0) message.warning(l(`发现 ${issues.length} 项可能缺失信息`, `Found ${issues.length} potentially missing field(s)`))
        else message.success(l('未发现缺失信息', 'No missing information found'))
      },
      onFailed: (errorMessage) => {
        message.error(errorMessage)
      },
      onReadError: () => {
        message.error(l('读取智能检测结果失败', 'Failed to read smart detection results'))
      },
    })
  }, [l])
  const { task: smartDetectTask, settledTask: smartDetectSettledTask, trackTaskData: trackSmartDetectTaskData, applyCancelData: applySmartDetectCancelData } = useCancelableRelationTask({
    enabled: !!assetId && !!smartDetectRelationType && !!smartDetectRelationEntityId,
    relationType: smartDetectRelationType || '',
    relationEntityId: smartDetectRelationEntityId,
    onTaskSettled: applySmartDetectResult,
  })
  useTaskPageContext(
    [
      smartDetectRelationType && smartDetectRelationEntityId
        ? {
            relationType: smartDetectRelationType,
            relationEntityId: smartDetectRelationEntityId,
          }
        : null,
      assetNavigateRelationType && assetId
        ? {
            relationType: assetNavigateRelationType,
            relationEntityId: assetId,
          }
        : null,
    ],
  )
  const smartDetectBusy = smartDetectLoading || !!smartDetectTask

  const ensureImageSlots = useCallback(async (targetViewCount: number) => {
    if (!assetId) return []

    let current = await listImages(assetId)

    const byAngle = new Map<AssetViewAngle, TImage>()
    current.forEach((img) => {
      if (img.view_angle && !byAngle.has(img.view_angle)) {
        byAngle.set(img.view_angle, img)
      }
    })

    const requiredAngles = DEFAULT_ANGLES.slice(0, targetViewCount)
    let created = false

    for (const angle of requiredAngles) {
      if (!byAngle.get(angle)) {
        await createImageSlot(assetId, angle)
        created = true
      }
    }

    if (created) {
      current = await listImages(assetId)
    }

    return current
  }, [assetId, createImageSlot, listImages])

  const loadData = useCallback(async () => {
    if (!assetId) return

    setLoading(true)
    try {
      const nextAsset = await getAsset(assetId)
      if (!nextAsset) {
        message.error(l(`未找到${assetDisplayName}资产`, `${assetDisplayNameEn} asset not found`))
        onNavigate(backTo, true)
        return
      }

      setAsset(nextAsset)
      setFormName(nextAsset.name)
      setFormDesc(nextAsset.description ?? '')
      setFormTags((nextAsset.tags ?? []).join(', '))
      {
        const nextVisual = (nextAsset.visual_style ?? defaultVisualStyle) as '现实' | '动漫'
        setFormVisualStyle(nextVisual)
        setFormStyle((nextAsset.style as string | undefined) ?? getDefaultStyle(nextVisual))
      }

      const targetCount = clampViewCount(nextAsset.view_count)
      setFormViewCount(targetCount)

      const imageRows = await ensureImageSlots(targetCount)
      setImages(imageRows)

      if (assetFactoryType) {
        const specsRes = await AssetGenerationBatchApi.specs({
          keyword: assetId,
          include_legacy: true,
        })
        setGenerationSpecs(
          specsRes.rows.filter((row) => row.asset_type === assetFactoryType && row.asset_id === assetId),
        )
      } else {
        setGenerationSpecs([])
      }
    } catch {
      message.error(l(`加载${assetDisplayName}资产失败`, `Failed to load ${assetDisplayNameEn.toLowerCase()} asset`))
    } finally {
      setLoading(false)
    }
  }, [assetFactoryType, assetId, assetDisplayName, assetDisplayNameEn, backTo, defaultVisualStyle, ensureImageSlots, getAsset, getDefaultStyle, l, onNavigate])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const slotItems = useMemo(() => {
    const count = clampViewCount(formViewCount)
    const byAngle = new Map<AssetViewAngle, TImage>()
    images.forEach((img) => {
      if (img.view_angle) byAngle.set(img.view_angle, img)
    })

    const angles: AssetViewAngle[] = []
    DEFAULT_ANGLES.slice(0, count).forEach((angle) => angles.push(angle))
    images.forEach((img) => {
      if (img.view_angle && !angles.includes(img.view_angle)) angles.push(img.view_angle)
    })

    return angles.map((angle) => {
      const image = byAngle.get(angle) ?? null
      return {
        angle,
        image,
        imageUrl: buildFileDownloadUrl(image?.file_id),
      }
    })
  }, [formViewCount, images])

  const minViewCount = useMemo(() => clampViewCount(asset?.view_count), [asset?.view_count])

  const specsBySlotId = useMemo(() => {
    const out = new Map<string, AssetGenerationSpec[]>()
    generationSpecs.forEach((spec) => {
      if (!spec.image_slot_id) return
      const list = out.get(spec.image_slot_id) ?? []
      list.push(spec)
      out.set(spec.image_slot_id, list)
    })
    return out
  }, [generationSpecs])

  const specSummary = useMemo(() => {
    const assetBibleSpecs = generationSpecs.filter((spec) => !spec.is_legacy)
    return {
      total: assetBibleSpecs.length,
      generated: assetBibleSpecs.filter((spec) => spec.has_image).length,
      empty: assetBibleSpecs.filter((spec) => !spec.has_image).length,
      legacy: generationSpecs.filter((spec) => spec.is_legacy).length,
    }
  }, [generationSpecs])

  const handleSaveBaseInfo = async () => {
    if (!assetId || !asset) return
    if (!formName.trim()) {
      message.warning(l('请输入名称', 'Enter a name'))
      return
    }

    setSavingBase(true)
    try {
      const nextViewCount = Math.max(minViewCount, clampViewCount(formViewCount))
      const payload: AssetUpdate = {
        name: formName.trim(),
        description: formDesc.trim(),
        tags: normalizeTags(formTags),
        view_count: nextViewCount,
        visual_style: formVisualStyle,
        style: formStyle,
      }
      const nextAsset = await updateAsset(assetId, payload)
      if (nextAsset) setAsset(nextAsset)
      message.success(l('基础信息已保存', 'Basic information saved'))
      await loadData()
    } catch {
      message.error(l('保存失败', 'Failed to save'))
    } finally {
      setSavingBase(false)
    }
  }

  const handleSmartDetectMissing = async () => {
    if (!assetId) return
    if (!smartDetectRelationEntityId) return

    const description = (formDesc || '').trim()
    if (!description) {
      if (relationType === 'actor_image') message.warning(l('请先输入演员描述再进行智能检测', 'Enter an actor description before smart detection'))
      else if (relationType === 'scene_image') message.warning(l('请先输入场景描述再进行智能检测', 'Enter a scene description before smart detection'))
      else if (relationType === 'prop_image') message.warning(l('请先输入道具描述再进行智能检测', 'Enter a prop description before smart detection'))
      else if (relationType === 'costume_image') message.warning(l('请先输入服装描述再进行智能检测', 'Enter a costume description before smart detection'))
      return
    }

    if (notifyExistingTask(smartDetectTask, {
      cancellingMessage: taskCopy.cancellingMessage,
      runningMessage: taskCopy.runningMessage,
    })) {
      return
    }

    setSmartDetectLoading(true)
    try {
      const request = () => {
        if (relationType === 'actor_image') {
          const character_context = asset?.name ? `角色名：${formName}\n演员标签：${formTags}` : `演员标签：${formTags}`
          return ScriptProcessingService.analyzeCharacterPortraitAsyncApiV1ScriptProcessingAnalyzeCharacterPortraitAsyncPost({
            requestBody: {
              relation_entity_id: smartDetectRelationEntityId,
              character_description: description,
              character_context: (character_context || '').trim() || null,
            },
          })
        }
        if (relationType === 'scene_image') {
          const scene_context = asset?.name ? `场景名：${formName}\n标签：${formTags}` : `标签：${formTags}`
          return ScriptProcessingService.analyzeSceneInfoAsyncApiV1ScriptProcessingAnalyzeSceneInfoAsyncPost({
            requestBody: {
              relation_entity_id: smartDetectRelationEntityId,
              scene_description: description,
              scene_context: (scene_context || '').trim() || null,
            },
          })
        }
        if (relationType === 'prop_image') {
          const prop_context = asset?.name ? `道具名：${formName}\n标签：${formTags}` : `标签：${formTags}`
          return ScriptProcessingService.analyzePropInfoAsyncApiV1ScriptProcessingAnalyzePropInfoAsyncPost({
            requestBody: {
              relation_entity_id: smartDetectRelationEntityId,
              prop_description: description,
              prop_context: (prop_context || '').trim() || null,
            },
          })
        }
        const costume_context = asset?.name ? `服装名：${formName}\n标签：${formTags}` : `标签：${formTags}`
        return ScriptProcessingService.analyzeCostumeInfoAsyncApiV1ScriptProcessingAnalyzeCostumeInfoAsyncPost({
          requestBody: {
            relation_entity_id: smartDetectRelationEntityId,
            costume_description: description,
            costume_context: (costume_context || '').trim() || null,
          },
        })
      }

      await executeAsyncTaskCreate({
        request,
        trackTaskData: trackSmartDetectTaskData,
        startedMessage: taskCopy.startedMessage,
        reusedMessage: taskCopy.reusedMessage,
        fallbackErrorMessage: l('智能检测失败', 'Smart detection failed'),
        getErrorMessage: (error, fallbackMessage) => {
          const maybeAny = error as { response?: { status?: number }; status?: number }
          const status = maybeAny?.response?.status ?? maybeAny?.status
          if (status === 404) {
            return '接口未找到：请运行 `pnpm run openapi:update` 生成客户端代码后重试'
          }
          return defaultTaskActionErrorMessage(error, fallbackMessage)
        },
      })
    } catch {
      // executeAsyncTaskCreate 已统一处理错误提示
    } finally {
      setSmartDetectLoading(false)
    }
  }

  const handleCancelSmartDetectTask = async () => {
    if (!smartDetectTask?.taskId) return
    try {
      await executeTaskCancel({
        taskId: smartDetectTask.taskId,
        reason: `用户在${assetDisplayName}资产编辑页取消智能检测任务`,
        applyCancelData: applySmartDetectCancelData,
        cancelledImmediatelyMessage: taskCopy.cancelledImmediatelyMessage,
        cancelRequestedMessage: taskCopy.cancelRequestedMessage,
        fallbackErrorMessage: l('取消智能检测任务失败', 'Failed to cancel smart detection task'),
      })
    } catch {
      // executeTaskCancel 已统一处理错误提示
    }
  }

  useRelationTaskNotification({
    task: smartDetectTask,
    settledTask: smartDetectSettledTask,
    title: taskCopy.title,
    sourceLabel: formName?.trim() ? l(`${assetDisplayName}：${formName.trim()}`, `${assetDisplayNameEn}: ${formName.trim()}`) : l(`${assetDisplayName}编辑页`, `${assetDisplayNameEn} editor`),
    runningDescription: taskCopy.runningDescription,
    cancellingDescription: taskCopy.cancellingDescription,
    successDescription: taskCopy.successDescription,
    cancelledDescription: taskCopy.cancelledDescription,
    failedDescription: taskCopy.failedDescription,
    onCancel: smartDetectTask ? () => void handleCancelSmartDetectTask() : null,
    onNavigate: () => onNavigate(location.pathname),
  })
  useRelationTaskNotification({
    task: generationTask,
    settledTask: generationSettledTask,
    title: TASK_COPY.imageGeneration.title,
    sourceLabel: formName?.trim() ? l(`${assetDisplayName}：${formName.trim()}`, `${assetDisplayNameEn}: ${formName.trim()}`) : l(`${assetDisplayName}编辑页`, `${assetDisplayNameEn} editor`),
    runningDescription: TASK_COPY.imageGeneration.runningDescription,
    cancellingDescription: TASK_COPY.imageGeneration.cancellingDescription,
    successDescription: TASK_COPY.imageGeneration.successDescription,
    cancelledDescription: TASK_COPY.imageGeneration.cancelledDescription,
    failedDescription: TASK_COPY.imageGeneration.failedDescription,
    onCancel:
      generationTask?.taskId
        ? () =>
            void executeTaskCancel({
              taskId: generationTask.taskId,
              reason: `用户在${assetDisplayName}资产编辑页取消图片生成任务`,
              applyCancelData: (data) => {
                setGenerationTask((current) =>
                  current
                    ? {
                        ...current,
                        taskId: data?.task_id || current.taskId,
                        status: (data?.status ?? current.status) as TaskStatus,
                        cancelRequested: data?.cancel_requested ?? true,
                      }
                    : current,
                )
                return null
              },
              cancelledImmediatelyMessage: TASK_COPY.imageGeneration.cancelledImmediatelyMessage,
              cancelRequestedMessage: TASK_COPY.imageGeneration.cancelRequestedMessage,
              fallbackErrorMessage: l('取消图片生成任务失败', 'Failed to cancel image generation task'),
            })
        : null,
    onNavigate: () => onNavigate(location.pathname),
  })

  const openPromptPreview = async (image: TImage) => {
    if (!assetId) return

    try {
      setPromptPreviewOpen(true)
      setPromptPreviewLoading(true)
      setPromptPreviewImage(image)
      const nextContext = { imageId: image.id, images: [] }
      promptDraft.hydrate({
        base: { prompt: '' },
        context: nextContext,
      })
      const derived = await promptDraft.deriveNow({
        base: { prompt: '' },
        context: nextContext,
      })
      if (derived) {
        promptDraft.hydrate({
          base: { prompt: derived.prompt },
          context: { imageId: image.id, images: derived.images },
          derived,
        })
      }
    } catch {
      message.error(l('获取提示词失败', 'Failed to get prompt'))
    } finally {
      setPromptPreviewLoading(false)
    }
  }

  const handleLocalImageUpload = async (image: TImage, file: File) => {
    if (!assetId) return
    if (!isImageUpload(file)) {
      message.warning(l('请选择图片文件', 'Select an image file'))
      return
    }
    setUploadProgressByImageId((prev) => ({ ...prev, [image.id]: 10 }))
    try {
      const uploadRes = await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({
        formData: { file } as any,
        name: file.name,
      })
      const fileId = uploadRes.data?.id
      if (!fileId) {
        message.error(l('上传失败：缺少文件 ID', 'Upload failed: missing file ID'))
        return
      }
      setUploadProgressByImageId((prev) => ({ ...prev, [image.id]: 75 }))
      await updateImage(assetId, image.id, {
        file_id: fileId,
        width: null,
        height: null,
        format: inferImageFormat(file),
      })
      setUploadProgressByImageId((prev) => ({ ...prev, [image.id]: 100 }))
      message.success(l('本地图片已上传并绑定', 'Local image uploaded and linked'))
      await loadData()
    } catch {
      message.error(l('上传或绑定本地图片失败', 'Failed to upload or link local image'))
    } finally {
      setTimeout(() => {
        setUploadProgressByImageId((prev) => {
          const next = { ...prev }
          delete next[image.id]
          return next
        })
      }, 500)
    }
  }

  const confirmClearSlotImage = (image: TImage) => {
    if (!assetId) return
    if (!image.file_id) {
      message.info(l('当前槽位没有图片', 'The current slot has no image'))
      return
    }

    Modal.confirm({
      title: l('清空当前图片槽？', 'Clear the current image slot?'),
      content: l('只会解除当前槽位和图片文件的绑定，不会删除资产，也不会删除原始文件。该槽位清空后不会再作为分镜参考图自动传入。', 'This only unlinks the image from the slot. It does not delete the asset or source file.'),
      okText: l('清空图片', 'Clear image'),
      okButtonProps: { danger: true },
      cancelText: l('取消', 'Cancel'),
      async onOk() {
        setClearingImageId(image.id)
        try {
          await updateImage(assetId, image.id, {
            file_id: null,
            width: null,
            height: null,
            format: null,
          })
          message.success(l('已清空当前图片槽', 'Current image slot cleared'))
          await loadData()
        } catch {
          message.error(l('清空图片槽失败', 'Failed to clear image slot'))
        } finally {
          setClearingImageId(null)
        }
      },
    })
  }

  const confirmGenerateWithPrompt = async () => {
    if (!assetId || !promptPreviewImage) return
    const prompt = (promptPreviewDraft || '').trim()
    if (!prompt) {
      message.warning(l('请输入提示词', 'Enter a prompt'))
      return
    }

    setGeneratingByImageId((prev) => ({ ...prev, [promptPreviewImage.id]: true }))
    try {
      const submitted = await promptDraft.submitNow()
      const taskId = submitted?.taskId
      if (!taskId) {
        message.error(l('生成任务创建失败：缺少任务 ID', 'Failed to create generation task: missing task ID'))
        return
      }
      setGenerationTask({
        taskId,
        status: 'pending',
        progress: 0,
        cancelRequested: false,
      })
      setGenerationSettledTask(null)

      let finalStatus: TaskStatus = 'pending'
      let finalTaskState: RelationTaskState | null = null
      for (let i = 0; i < 30; i += 1) {
        await sleep(2000)
        const statusRes = await FilmService.getTaskStatusApiV1FilmTasksTaskIdStatusGet({ taskId })
        const status = statusRes.data?.status
        if (!status) continue
        finalStatus = status
        if (statusRes.data) {
          finalTaskState = toRelationTaskStateFromStatusRead(statusRes.data)
          setGenerationTask(finalTaskState)
        }
        if (isTerminalStatus(status)) break
      }
      if (finalTaskState && isTerminalStatus(finalTaskState.status)) {
        setGenerationTask(null)
        setGenerationSettledTask(finalTaskState)
      }

      if (finalStatus === 'succeeded') {
        setPromptPreviewOpen(false)
        setPromptPreviewImage(null)
        await loadData()
      } else if (finalStatus !== 'failed' && finalStatus !== 'cancelled') {
        message.warning(l('生成任务仍在执行，请稍后刷新', 'The generation task is still running. Refresh later.'))
      }
    } catch {
      message.error(l('发起生成失败', 'Failed to start generation'))
    } finally {
      setGeneratingByImageId((prev) => ({ ...prev, [promptPreviewImage.id]: false }))
    }
  }

  const openHistoryModal = async (targetImage: TImage) => {
    setEditingSlotImage(targetImage)
    setHistoryOpen(true)
    setHistoryLoading(true)

    try {
      const links = await listTaskLinksNormalized({
        resourceType: 'image',
        relationType,
        relationEntityId: String(targetImage.id),
      })
      const imagesByFileId = new Map<string, TImage>()
      images.forEach((img) => {
        if (img.file_id) {
          imagesByFileId.set(img.file_id, img)
        }
      })

      const seenFileIds = new Set<string>()
      const taskLinkCandidates: HistoryCandidate<TImage>[] = links
        .filter((link) => Boolean(link.file_id))
        .map((link) => {
          const fileId = String(link.file_id)
          const matchedImage = imagesByFileId.get(fileId)
          return {
            id: `task-link-${link.id}`,
            file_id: fileId,
            view_angle: matchedImage?.view_angle ?? targetImage.view_angle,
            width: matchedImage?.width ?? null,
            height: matchedImage?.height ?? null,
            format: matchedImage?.format ?? null,
            source: 'task-link' as const,
            originalImage: matchedImage,
          }
        })
        .filter((candidate) => {
          if (seenFileIds.has(candidate.file_id)) return false
          seenFileIds.add(candidate.file_id)
          return true
        })

      const fallbackCandidates: HistoryCandidate<TImage>[] = images
        .filter((img) => img.file_id && img.id !== targetImage.id && !seenFileIds.has(String(img.file_id)))
        .map((img) => ({
          id: `image-${img.id}`,
          file_id: String(img.file_id),
          view_angle: img.view_angle,
          width: img.width ?? null,
          height: img.height ?? null,
          format: img.format ?? null,
          source: 'image' as const,
          originalImage: img,
        }))

      setHistoryCandidates(taskLinkCandidates.length > 0 ? taskLinkCandidates : fallbackCandidates)
    } catch {
      message.error(l('加载历史生成图片失败', 'Failed to load generated image history'))
      setHistoryCandidates([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleAdoptHistoryImage = async (candidate: HistoryCandidate<TImage>) => {
    if (!assetId || !editingSlotImage || !candidate.file_id) return

    setAdoptingImageId(candidate.id)
    try {
      await updateImage(assetId, editingSlotImage.id, {
        file_id: candidate.file_id,
        width: candidate.width ?? null,
        height: candidate.height ?? null,
        format: candidate.format ?? null,
      })
      message.success(l('角度图片已更新', 'View image updated'))
      setHistoryOpen(false)
      setEditingSlotImage(null)
      await loadData()
    } catch {
      message.error(l('更新角度图片失败', 'Failed to update view image'))
    } finally {
      setAdoptingImageId(null)
    }
  }

  if (!assetId) {
    return (
      <Card>
        <Empty description={l(missingAssetIdText, missingAssetIdTextEn)} />
      </Card>
    )
  }

  return (
    <div className="space-y-4 h-full overflow-auto">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => onNavigate(backTo)}>
              {l(`返回${assetDisplayName}资产`, `Back to ${assetDisplayNameEn.toLowerCase()} assets`)}
            </Button>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {l(`${assetDisplayName}资产编辑`, `${assetDisplayNameEn} asset editor`)}
            </Typography.Title>
            {asset?.id ? <Tag>{asset.id}</Tag> : null}
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()} loading={loading}>
            {l('刷新', 'Refresh')}
          </Button>
        </div>
      </Card>

      <Collapse
        defaultActiveKey={['base', 'specs', 'views']}
        items={[
          {
            key: 'base',
            label: l('基础信息展示', 'Basic information'),
            children: loading ? (
              <div className="py-8 text-center">
                <Spin />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-gray-600 text-sm mb-1">{l('名称', 'Name')}</div>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} disabled={smartDetectBusy || savingBase} />
                </div>
                <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-gray-600 text-sm">{l('描述', 'Description')}</div>
                      {relationType === 'actor_image' ||
                      relationType === 'scene_image' ||
                      relationType === 'prop_image' ||
                      relationType === 'costume_image' ? (
                        <>
                          <Button
                            type="primary"
                            size="small"
                            onClick={() => void handleSmartDetectMissing()}
                            loading={smartDetectLoading}
                            disabled={Boolean(loading) || !!smartDetectTask}
                          >
                            {smartDetectTask ? l('检测中', 'Detecting') : l('智能检测', 'Smart detection')}
                          </Button>
                          {smartDetectTask ? (
                            <Button
                              size="small"
                              danger
                              icon={<CloseCircleOutlined />}
                              disabled={smartDetectTask.cancelRequested}
                              onClick={() => void handleCancelSmartDetectTask()}
                            >
                              {smartDetectTask.cancelRequested ? l('正在取消', 'Cancelling') : l('取消检测', 'Cancel detection')}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  <Input.TextArea
                    rows={4}
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    disabled={smartDetectBusy || savingBase}
                  />
                </div>
                <div>
                  <div className="text-gray-600 text-sm mb-1">{l('标签（逗号分隔）', 'Tags (comma-separated)')}</div>
                  <Input value={formTags} onChange={(e) => setFormTags(e.target.value)} disabled={smartDetectBusy || savingBase} />
                </div>
                <div>
                  <div className="text-gray-600 text-sm mb-1">{l('镜头数（仅可增加，最大 4）', 'View count (increase only, max. 4)')}</div>
                  <InputNumber
                    min={minViewCount}
                    max={4}
                    precision={0}
                    value={formViewCount}
                    onChange={(v) => setFormViewCount(v ?? minViewCount)}
                    disabled={smartDetectBusy || savingBase}
                  />
                </div>
                <div>
                  <div className="text-gray-600 text-sm mb-1">{l('视觉风格', 'Visual style')}</div>
                  <ProjectVisualStyleAndStyleFields
                    disabled={smartDetectBusy || savingBase}
                    visual_style={formVisualStyle}
                    style={formStyle}
                    options={projectStyleOptions}
                    onChange={(next) => {
                      setFormVisualStyle(next.visual_style)
                      setFormStyle(next.style)
                    }}
                  />
                </div>
                <Button type="primary" onClick={() => void handleSaveBaseInfo()} loading={savingBase || smartDetectLoading}>
                  {l('保存基础信息', 'Save basic information')}
                </Button>
              </div>
            ),
          },
          {
            key: 'specs',
            label: l('生成规格', 'Generation variants'),
            children: loading ? (
              <div className="py-8 text-center">
                <Spin />
              </div>
            ) : generationSpecs.length === 0 ? (
              <Empty description={l('暂无 Asset Bible 生成规格', 'No Asset Bible generation variants')} />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Tag color="blue">{l('规格', 'Variants')} {specSummary.total}</Tag>
                  <Tag color="green">{l('已有图片', 'With images')} {specSummary.generated}</Tag>
                  <Tag color={specSummary.empty > 0 ? 'orange' : 'default'}>{l('空槽', 'Empty slots')} {specSummary.empty}</Tag>
                  {specSummary.legacy > 0 ? <Tag color="default">Legacy {specSummary.legacy}</Tag> : null}
                </div>
                <Row gutter={[12, 12]}>
                  {generationSpecs.map((spec) => (
                    <Col xs={24} lg={12} key={`${spec.asset_type}:${spec.asset_id}:${spec.asset_variant}`}>
                      <Card size="small" title={<span className="break-all">{spec.asset_variant}</span>}>
                        <div className="space-y-2 text-sm">
                          <div className="flex flex-wrap gap-1">
                            <Tag color={spec.has_image ? 'green' : 'orange'}>{spec.has_image ? l('已生成', 'Generated') : l('未生成', 'Not generated')}</Tag>
                            <Tag>{spec.output_spec || l('无 output_spec', 'No output_spec')}</Tag>
                            <Tag>{spec.aspect_ratio || l('无比例', 'No aspect ratio')}</Tag>
                            {spec.width && spec.height ? <Tag>{spec.width}x{spec.height}</Tag> : null}
                            {spec.priority ? <Tag color={spec.priority === 'high' ? 'red' : 'blue'}>{spec.priority}</Tag> : null}
                            {spec.is_legacy ? <Tag>legacy</Tag> : null}
                          </div>
                          <div className="text-xs text-gray-500">
                            Slot: {spec.image_slot_angle || '-'} / image_id: {spec.image_slot_id || '-'} / file_id: {spec.current_image_file_id || '-'}
                          </div>
                          <div className="text-xs text-gray-700 whitespace-pre-wrap">
                            {truncatePrompt(spec.visual_prompt) || l('无 visual_prompt', 'No visual_prompt')}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {spec.current_image_file_id ? (
                              <Button size="small" href={buildFileDownloadUrl(spec.current_image_file_id)} target="_blank">
                                {l('下载图片', 'Download image')}
                              </Button>
                            ) : null}
                            <Button size="small" onClick={() => setPromptSpec(spec)}>
                              {l('查看 Prompt', 'View prompt')}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </div>
            ),
          },
          {
            key: 'views',
            label: l('多镜头图片', 'Multi-view images'),
            children: (
              <Row gutter={[16, 16]}>
                {slotItems.map((slot) => {
                  const slotSpecs = slot.image ? specsBySlotId.get(String(slot.image.id)) ?? [] : []
                  return (
                    <Col xs={24} sm={12} lg={8} xl={6} key={slot.angle}>
                      <DisplayImageCard
                        title={l(`照片角度：${ANGLE_LABEL_MAP[slot.angle]}`, `View: ${ANGLE_LABEL_EN_MAP[slot.angle]}`)}
                        imageUrl={slot.imageUrl}
                        imageAlt={slot.angle}
                        placeholder={l('暂无图片', 'No image')}
                        hoverable={false}
                        imageHeightClassName="h-44"
                        extra={
                          slot.image ? (
                            <Space size={[4, 4]} wrap>
                              <Tag color="blue">ID {slot.image.id}</Tag>
                              {slotSpecs.map((spec) => (
                                <Tag key={spec.asset_variant} color={spec.has_image ? 'green' : 'orange'}>
                                  {spec.asset_variant}
                                </Tag>
                              ))}
                            </Space>
                          ) : null
                        }
                        footer={
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="primary"
                              size="small"
                              disabled={!slot.image}
                              loading={Boolean(slot.image && generatingByImageId[slot.image.id])}
                              onClick={() => slot.image && void openPromptPreview(slot.image)}
                            >
                              {l('生成', 'Generate')}
                            </Button>
                            <Upload
                              accept="image/*"
                              showUploadList={false}
                              beforeUpload={(file) => {
                                if (slot.image) void handleLocalImageUpload(slot.image, file as File)
                                return Upload.LIST_IGNORE
                              }}
                            >
                              <Button
                                size="small"
                                icon={<UploadOutlined />}
                                disabled={!slot.image || Boolean(slot.image && uploadProgressByImageId[slot.image.id] != null)}
                                loading={Boolean(slot.image && uploadProgressByImageId[slot.image.id] != null)}
                              >
                                {slot.image && uploadProgressByImageId[slot.image.id] != null
                                  ? l(`上传中 ${uploadProgressByImageId[slot.image.id]}%`, `Uploading ${uploadProgressByImageId[slot.image.id]}%`)
                                  : l('上传本地图片', 'Upload local image')}
                              </Button>
                            </Upload>
                            {slot.imageUrl ? (
                              <Button size="small" href={slot.imageUrl} target="_blank">
                                {l('下载', 'Download')}
                              </Button>
                            ) : null}
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              disabled={!slot.image}
                              onClick={() => slot.image && void openHistoryModal(slot.image)}
                            >
                              {l('从历史选择', 'Choose from history')}
                            </Button>
                            <Button
                              size="small"
                              danger
                              icon={<CloseCircleOutlined />}
                              disabled={!slot.image || !slot.image.file_id}
                              loading={Boolean(slot.image && clearingImageId === slot.image.id)}
                              onClick={() => slot.image && confirmClearSlotImage(slot.image)}
                            >
                              {l('清空图片', 'Clear image')}
                            </Button>
                          </div>
                        }
                      />
                    </Col>
                  )
                })}
              </Row>
            ),
          },
        ]}
      />

      <Modal
        title={l('历史生成图片', 'Generated image history')}
        open={historyOpen}
        onCancel={() => {
          setHistoryOpen(false)
          setEditingSlotImage(null)
        }}
        footer={null}
        width={960}
      >
        {historyLoading ? (
          <div className="py-8 text-center">
            <Spin />
          </div>
        ) : historyCandidates.length === 0 ? (
          <Empty description={l('暂无可用历史图片', 'No generated images available')} />
        ) : (
          <Row gutter={[16, 16]}>
            {historyCandidates.map((candidate) => (
              <Col xs={24} sm={12} md={8} key={candidate.id}>
                <DisplayImageCard
                  title={candidate.view_angle ? l(`角度：${ANGLE_LABEL_MAP[candidate.view_angle] ?? candidate.view_angle}`, `View: ${ANGLE_LABEL_EN_MAP[candidate.view_angle] ?? candidate.view_angle}`) : candidate.source === 'task-link' ? l('任务产物', 'Task output') : l(`图片 ${candidate.id}`, `Image ${candidate.id}`)}
                  imageUrl={buildFileDownloadUrl(candidate.file_id)}
                  imageAlt={candidate.id}
                  placeholder={l('无缩略图', 'No thumbnail')}
                  hoverable={false}
                  imageHeightClassName="h-44"
                  footer={
                    <Button
                      className="mt-2"
                      type="primary"
                      size="small"
                      block
                      disabled={!candidate.file_id}
                      loading={adoptingImageId === candidate.id}
                      onClick={() => void handleAdoptHistoryImage(candidate)}
                    >
                      {l('选中并更新当前角度', 'Select and update current view')}
                    </Button>
                  }
                />
              </Col>
            ))}
          </Row>
        )}
      </Modal>

      <Modal
        title={promptSpec ? `Prompt：${promptSpec.asset_variant}` : 'Prompt'}
        open={Boolean(promptSpec)}
        onCancel={() => setPromptSpec(null)}
        footer={
          <Button type="primary" onClick={() => setPromptSpec(null)}>
            {l('关闭', 'Close')}
          </Button>
        }
        width={900}
      >
        {promptSpec ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1">
              <Tag>{promptSpec.output_spec || l('无 output_spec', 'No output_spec')}</Tag>
              <Tag>{promptSpec.aspect_ratio || l('无比例', 'No aspect ratio')}</Tag>
              {promptSpec.width && promptSpec.height ? <Tag>{promptSpec.width}x{promptSpec.height}</Tag> : null}
              {promptSpec.priority ? <Tag>{promptSpec.priority}</Tag> : null}
              {promptSpec.status ? <Tag>{promptSpec.status}</Tag> : null}
            </div>
            <div>
              <div className="text-gray-600 text-sm mb-1">visual_prompt</div>
              <Input.TextArea rows={8} value={promptSpec.visual_prompt || ''} readOnly />
            </div>
            <div>
              <div className="text-gray-600 text-sm mb-1">negative_prompt</div>
              <Input.TextArea rows={4} value={promptSpec.negative_prompt || ''} readOnly />
            </div>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={12}>
                <div className="text-gray-600 text-sm mb-1">style_notes</div>
                <Input.TextArea rows={3} value={promptSpec.style_notes || ''} readOnly />
              </Col>
              <Col xs={24} md={12}>
                <div className="text-gray-600 text-sm mb-1">reference_notes</div>
                <Input.TextArea rows={3} value={promptSpec.reference_notes || ''} readOnly />
              </Col>
            </Row>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={l('提示词内容预览', 'Prompt preview')}
        open={promptPreviewOpen}
        onCancel={() => {
          setPromptPreviewOpen(false)
          setPromptPreviewImage(null)
        }}
        okText={l('生成', 'Generate')}
        cancelText={l('取消', 'Cancel')}
        confirmLoading={Boolean(promptPreviewImage && generatingByImageId[promptPreviewImage.id])}
        onOk={() => void confirmGenerateWithPrompt()}
        destroyOnClose
        width={900}
      >
        {promptPreviewLoading ? (
          <div className="py-8 text-center">
            <Spin />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-2">{l('关联图片（参考图）', 'Linked images (references)')}</div>
              {promptPreviewRefFileIds.length === 0 ? (
                <div className="text-xs text-gray-400">{l('暂无关联图片', 'No linked images')}</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-gray-600">{promptPreviewReferenceLabel}</div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <Image.PreviewGroup>
                      {promptPreviewRefFileIds.map((fid) => (
                        <div key={fid} className="w-[92px] shrink-0">
                          <Image
                            width={72}
                            height={72}
                            style={{ objectFit: 'cover', borderRadius: 8 }}
                            src={buildFileDownloadUrl(fid)}
                          />
                          <Typography.Text className="block mt-1 text-[10px]" type="secondary" ellipsis={{ tooltip: fid }}>
                            {fid}
                          </Typography.Text>
                        </div>
                      ))}
                    </Image.PreviewGroup>
                  </div>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-2">{l('提示词（可编辑）', 'Prompt (editable)')}</div>
              <Input.TextArea
                rows={10}
                value={promptPreviewDraft}
                onChange={(e) => promptDraft.setBase({ prompt: e.target.value })}
                placeholder={l('请输入提示词…', 'Enter a prompt…')}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={l('智能检测：缺失信息', 'Smart detection: missing information')}
        open={smartDetectOpen}
        onCancel={() => setSmartDetectOpen(false)}
        footer={null}
        destroyOnClose
        width={880}
      >
        {smartDetectLoading ? (
          <div className="py-8 text-center">
            <Spin />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {smartDetectIssues.length === 0 ? (
                <div className="text-sm text-gray-600">{l('未发现缺失信息。', 'No missing information found.')}</div>
              ) : (
                <div className="text-sm text-gray-600">{l(`发现 ${smartDetectIssues.length} 项可能缺失信息（建议参考下面优化后的描述）：`, `Found ${smartDetectIssues.length} potentially missing field(s). Review the optimized description below:`)}</div>
              )}
              {smartDetectIssues.length > 0 ? (
                <div className="space-y-2">
                  {smartDetectIssues.map((it, idx) => (
                    <div key={`${idx}_${it}`} className="text-sm text-gray-800">
                      {idx + 1}. {it}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-2">{l('优化后的描述（可直接填入）', 'Optimized description (ready to use)')}</div>
              <Input.TextArea rows={6} value={smartDetectOptimizedDesc} readOnly />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  const next = smartDetectOptimizedDesc.trim()
                  if (!next) {
                    message.warning(l('未返回有效的优化描述', 'No valid optimized description was returned'))
                    return
                  }
                  setFormDesc(next)
                  setSmartDetectOpen(false)
                  message.success(l('已填入描述', 'Description applied'))
                }}
                disabled={!smartDetectOptimizedDesc.trim()}
              >
                {l('填入描述', 'Apply description')}
              </Button>
              <Button onClick={() => setSmartDetectOpen(false)}>{l('关闭', 'Close')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
