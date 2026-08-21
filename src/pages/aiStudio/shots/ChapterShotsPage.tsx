import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Divider,
  Empty,
  Form,
  Input,
  Layout,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  ScissorOutlined,
  UploadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import type { ShotRead, ShotRuntimeSummaryRead, ShotStatus } from '../../../services/generated'
import { ScriptProcessingService, StudioChaptersService, StudioShotsService } from '../../../services/generated'
import { executeAsyncTaskCreate, executeTaskCancel } from '../components/taskActionHelpers'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getChapterShotEditPath, getChapterShotsPath, getChapterStudioPath } from '../project/ProjectWorkbench/routes'
import { useCancelableRelationTask } from '../project/ProjectWorkbench/chapterDivisionTasks'
import { useRelationTaskNotification } from '../components/taskNotificationHelpers'
import { useTaskPageContext } from '../components/taskPageContext'
import { createTaskSettledReloader } from '../components/taskResultHelpers'
import { TASK_COPY } from '../components/taskCopy'
import { ShotTableImportApi, type ShotTableImportSummary } from '../../../services/shotTableImport'
import { bilingualText, useBilingualText } from '../../../i18n/useBilingualText'

const { Header, Content } = Layout
type ShotListFilter = 'all' | 'pending' | 'generating' | 'ready'

function getErrorMessage(e: unknown) {
  if (!e) return bilingualText('请求失败', 'Request failed')
  if (typeof e === 'string') return e
  if (typeof e === 'object') {
    const maybeAny = e as any
    const detail = maybeAny?.body?.detail ?? maybeAny?.detail
    if (typeof detail === 'string' && detail.trim()) return detail
    const msg = maybeAny?.message
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  return bilingualText('请求失败', 'Request failed')
}

function statusTag(status?: ShotStatus) {
  if (!status) return <span className="text-gray-400">—</span>
  const color = status === 'ready' ? 'success' : 'default'
  return <Tag color={color}>{status}</Tag>
}

function getShotCharacterDisplay(shot: ShotRead): string {
  const anyShot = shot as any
  const direct = typeof anyShot.character_display === 'string' ? anyShot.character_display.trim() : ''
  if (direct) return direct
  const names = Array.isArray(anyShot.character_names)
    ? anyShot.character_names.map((x: unknown) => String(x ?? '').trim()).filter(Boolean)
    : []
  if (names.length > 0) return names.join(bilingualText('、', ', '))
  const characters = Array.isArray(anyShot.characters)
    ? anyShot.characters
        .map((x: any) => String(x?.character_label ?? x?.actor_name ?? x?.character_id ?? '').trim())
        .filter(Boolean)
    : []
  return characters.length > 0 ? characters.join(bilingualText('、', ', ')) : ''
}

type ShotPreparationState = {
  text: string
  color: string
  hint: string
}

type ShotRuntimeState = {
  has_active_tasks: boolean
  has_active_video_tasks: boolean
  has_active_prompt_tasks: boolean
  has_active_frame_tasks: boolean
  active_task_count: number
}

function getShotPreparationState(shot: ShotRead, runtime?: ShotRuntimeState): ShotPreparationState {
  if (runtime?.has_active_tasks) {
    return {
      text: bilingualText('生成中', 'Generating'),
      color: 'processing',
      hint: bilingualText(`当前镜头有 ${runtime.active_task_count} 个运行中任务`, `${runtime.active_task_count} active tasks for this shot`),
    }
  }
  if (shot.status === 'ready') {
    return {
      text: bilingualText('已就绪', 'Ready'),
      color: 'green',
      hint: shot.skip_extraction
        ? bilingualText('当前镜头已标记为无需提取，可继续进入视频生成流程', 'This shot requires no extraction and can continue to video generation')
        : bilingualText('信息提取已确认完成，可继续进入视频生成流程', 'Information extraction is confirmed; continue to video generation'),
    }
  }
  return {
    text: bilingualText('待确认', 'Awaiting confirmation'),
    color: 'gold',
    hint: shot.skip_extraction
      ? bilingualText('当前镜头已标记为无需提取，等待系统同步最新流程状态', 'Marked as requiring no extraction; waiting for status synchronization')
      : bilingualText('请先完成信息提取确认，再进入视频生成流程', 'Complete information extraction confirmation before video generation'),
  }
}

export function ChapterShotsPage() {
  const l = useBilingualText()
  const taskCopy = TASK_COPY.chapterDivision
  const navigate = useNavigate()
  const { projectId, chapterId } = useParams<{ projectId: string; chapterId: string }>()
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [shots, setShots] = useState<ShotRead[]>([])
  const [shotRuntimeMap, setShotRuntimeMap] = useState<Record<string, ShotRuntimeState>>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [listFilter, setListFilter] = useState<ShotListFilter>('all')
  const [searchText, setSearchText] = useState('')
  const [chapterTitle, setChapterTitle] = useState<string>('')
  const [chapterIndex, setChapterIndex] = useState<number | null>(null)
  const [chapterRawText, setChapterRawText] = useState<string>('')
  const [chapterCondensedText, setChapterCondensedText] = useState<string>('')
  const [loadingChapter, setLoadingChapter] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createForm] = Form.useForm<{ title: string; script_excerpt?: string }>()
  const [chapterDivisionTaskLoading, setChapterDivisionTaskLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importContent, setImportContent] = useState('')
  const [importPreview, setImportPreview] = useState<ShotTableImportSummary | null>(null)
  const [importLoading, setImportLoading] = useState(false)

  const refresh = async () => {
    if (!chapterId) return
    setLoading(true)
    try {
      const [res, runtimeRes] = await Promise.all([
        StudioShotsService.listShotsApiV1StudioShotsGet({
          chapterId,
          page: 1,
          pageSize: 100,
          order: 'index',
          isDesc: false,
        }),
        StudioShotsService.listShotRuntimeSummaryApiV1StudioShotsRuntimeSummaryGet({
          chapterId,
        }),
      ])
      setShots(res.data?.items ?? [])
      const runtimeItems: ShotRuntimeSummaryRead[] = runtimeRes.data ?? []
      setShotRuntimeMap(
        Object.fromEntries(
          runtimeItems.map((item) => [
            item.shot_id,
            {
              has_active_tasks: item.has_active_tasks,
              has_active_video_tasks: item.has_active_video_tasks,
              has_active_prompt_tasks: item.has_active_prompt_tasks,
              has_active_frame_tasks: item.has_active_frame_tasks,
              active_task_count: item.active_task_count,
            },
          ]),
        ),
      )
      setSelectedRowKeys([])
    } catch {
      message.error(l('加载分镜失败', 'Failed to load storyboards'))
    } finally {
      setLoading(false)
    }
  }

  const reloadShotsAfterTaskSettled = useCallback(createTaskSettledReloader(refresh), [refresh])
  const { task: chapterDivisionTask, settledTask: chapterDivisionSettledTask, trackTaskData, applyCancelData } = useCancelableRelationTask({
    enabled: !!chapterId,
    relationType: 'chapter_division',
    relationEntityId: chapterId,
    onTaskSettled: reloadShotsAfterTaskSettled,
  })
  useTaskPageContext(
    chapterId
      ? [
          {
            relationType: 'chapter_division',
            relationEntityId: chapterId,
          },
        ]
      : [],
  )

  useEffect(() => {
    setSelectedRowKeys([])
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId])

  useEffect(() => {
    if (!chapterId) return
    setLoadingChapter(true)
    StudioChaptersService.getChapterApiV1StudioChaptersChapterIdGet({ chapterId })
      .then((res) => {
        const c = res.data
        setChapterTitle(c?.title ?? '')
        setChapterIndex(typeof c?.index === 'number' ? c.index : null)
        setChapterRawText(c?.raw_text?.trim?.() ? c.raw_text.trim() : '')
        setChapterCondensedText(c?.condensed_text?.trim?.() ? c.condensed_text.trim() : '')
      })
      .catch(() => {
        message.error(l('章节加载失败', 'Failed to load chapter'))
      })
      .finally(() => {
        setLoadingChapter(false)
      })
  }, [chapterId])

  const filteredShots = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    const byWorkflow = shots.filter((s) => {
      const runtime = shotRuntimeMap[s.id]
      if (listFilter === 'generating') return Boolean(runtime?.has_active_tasks)
      if (listFilter === 'ready') return s.status === 'ready' && !runtime?.has_active_tasks
      if (listFilter === 'pending') return s.status !== 'ready' && !runtime?.has_active_tasks
      return true
    })
    if (!q) return byWorkflow
    return byWorkflow.filter((s) => {
      const title = String(s.title ?? '').toLowerCase()
      const ex = String(s.script_excerpt ?? '').toLowerCase()
      const idx = String(s.index)
      return title.includes(q) || ex.includes(q) || idx.includes(q)
    })
  }, [listFilter, searchText, shotRuntimeMap, shots])

  const shotFilterCounts = useMemo(
    () => ({
      all: shots.length,
      pending: shots.filter((s) => s.status !== 'ready' && !shotRuntimeMap[s.id]?.has_active_tasks).length,
      generating: shots.filter((s) => Boolean(shotRuntimeMap[s.id]?.has_active_tasks)).length,
      ready: shots.filter((s) => s.status === 'ready' && !shotRuntimeMap[s.id]?.has_active_tasks).length,
    }),
    [shotRuntimeMap, shots],
  )

  const selectedShotIds = useMemo(() => selectedRowKeys.map((k) => String(k)), [selectedRowKeys])

  const openCreate = useCallback(() => {
    createForm.resetFields()
    setCreateOpen(true)
  }, [createForm])

  const closeCreate = useCallback(() => {
    setCreateOpen(false)
    createForm.resetFields()
  }, [createForm])

  const submitCreate = useCallback(async () => {
    if (!chapterId) return
    try {
      const v = await createForm.validateFields()
      setCreateSubmitting(true)
      const nextIndex = shots.reduce((m, s) => Math.max(m, s.index), 0) + 1
      const res = await StudioShotsService.createShotApiV1StudioShotsPost({
        requestBody: {
          id: crypto.randomUUID(),
          chapter_id: chapterId,
          index: nextIndex,
          title: v.title.trim(),
          script_excerpt: v.script_excerpt?.trim() ? v.script_excerpt.trim() : '',
          status: 'pending',
        },
      })
      const created = res.data
      if (created) {
        setShots((prev) => [...prev, created].sort((a, b) => a.index - b.index))
        message.success(l('已创建分镜', 'Storyboard created'))
        closeCreate()
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(l('创建失败', 'Failed to create storyboard'))
    } finally {
      setCreateSubmitting(false)
    }
  }, [chapterId, closeCreate, createForm, shots])

  const storyboardTemplate = useMemo(
    () =>
      [
        'shot_index',
        'shot_title',
        'script_excerpt',
        'description',
        'duration',
        'aspect_ratio',
        'scene_name',
        'characters',
        'costumes',
        'props',
        'dialogue',
        'camera_shot',
        'camera_angle',
        'camera_movement',
        'first_frame_prompt',
        'key_frame_prompt',
        'last_frame_prompt',
        'action_beats',
        'notes',
      ].join(',') + '\n',
    [],
  )

  const openImport = useCallback(() => {
    setImportContent('')
    setImportPreview(null)
    setImportOpen(true)
  }, [])

  const closeImport = useCallback(() => {
    setImportOpen(false)
    setImportContent('')
    setImportPreview(null)
  }, [])

  const downloadImportTemplate = useCallback(() => {
    const blob = new Blob([storyboardTemplate], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'jellyfish_storyboard_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [storyboardTemplate])

  const previewImport = useCallback(async () => {
    if (!chapterId) return
    if (!importContent.trim()) {
      message.error(l('请先上传 CSV 或粘贴表格文本', 'Upload a CSV or paste table text first'))
      return
    }
    setImportLoading(true)
    try {
      const data = await ShotTableImportApi.preview(chapterId, importContent)
      setImportPreview(data)
      message.success(l(`预览完成：将创建 ${data.will_create_shots} 条分镜`, `Preview complete: ${data.will_create_shots} storyboards will be created`))
    } catch (e) {
      message.error(getErrorMessage(e))
    } finally {
      setImportLoading(false)
    }
  }, [chapterId, importContent])

  const commitImport = useCallback(async () => {
    if (!chapterId) return
    if (!importPreview) {
      await previewImport()
      return
    }
    setImportLoading(true)
    try {
      const data = await ShotTableImportApi.commit(chapterId, importContent)
      message.success(l(`已导入 ${data.created_shots} 条分镜`, `Imported ${data.created_shots} storyboards`))
      closeImport()
      await refresh()
    } catch (e) {
      message.error(getErrorMessage(e))
    } finally {
      setImportLoading(false)
    }
  }, [chapterId, closeImport, importContent, importPreview, previewImport])

  const handleOneClickExtract = useCallback(async () => {
    if (!chapterId) return
    const scriptText = (chapterCondensedText || chapterRawText).trim()
    if (!scriptText) {
      message.error(l('章节没有可用文本（condensed/raw 为空）', 'The chapter has no usable text (condensed/raw is empty)'))
      return
    }
    setExtracting(true)
    try {
      await executeAsyncTaskCreate({
        request: () =>
          ScriptProcessingService.divideScriptAsyncApiV1ScriptProcessingDivideAsyncPost({
            requestBody: {
              script_text: scriptText,
              write_to_db: true,
              chapter_id: chapterId,
            },
          }),
        trackTaskData,
        startedMessage: taskCopy.startedMessage,
        reusedMessage: taskCopy.reusedMessage,
        fallbackErrorMessage: l('启动分镜提取失败', 'Failed to start storyboard extraction'),
        getErrorMessage: (error) => getErrorMessage(error),
      })
    } catch {
      // executeAsyncTaskCreate 已统一处理错误提示
    } finally {
      setExtracting(false)
    }
  }, [chapterCondensedText, chapterId, chapterRawText])

  const handleCancelChapterDivisionTask = useCallback(async () => {
    if (!chapterDivisionTask) return
    setChapterDivisionTaskLoading(true)
    try {
      await executeTaskCancel({
        taskId: chapterDivisionTask.taskId,
        reason: l('用户在分镜列表页取消分镜提取', 'User cancelled storyboard extraction from the storyboard list'),
        applyCancelData,
        cancelledImmediatelyMessage: taskCopy.cancelledImmediatelyMessage,
        cancelRequestedMessage: taskCopy.cancelRequestedMessage,
        fallbackErrorMessage: l('取消任务失败', 'Failed to cancel task'),
      })
    } catch {
      // executeTaskCancel 已统一处理错误提示
    } finally {
      setChapterDivisionTaskLoading(false)
    }
  }, [chapterDivisionTask])

  useRelationTaskNotification({
    task: chapterDivisionTask,
    settledTask: chapterDivisionSettledTask,
    title: taskCopy.title,
    sourceLabel: chapterTitle ? l(`章节：${chapterTitle}`, `Chapter: ${chapterTitle}`) : l('分镜管理页', 'Storyboard management'),
    runningDescription: taskCopy.runningDescription,
    cancellingDescription: taskCopy.cancellingDescription,
    successDescription: taskCopy.successDescription,
    cancelledDescription: taskCopy.cancelledDescription,
    failedDescription: taskCopy.failedDescription,
    onCancel: chapterDivisionTask ? () => void handleCancelChapterDivisionTask() : null,
    onNavigate:
      projectId && chapterId
        ? () => navigate(getChapterShotsPath(projectId, chapterId))
        : null,
  })

  const handleDelete = useCallback(
    async (shotId: string) => {
      setDeletingId(shotId)
      try {
        await StudioShotsService.deleteShotApiV1StudioShotsShotIdDelete({ shotId })
        setShots((prev) => prev.filter((s) => s.id !== shotId))
        setSelectedRowKeys((prev) => prev.filter((k) => String(k) !== shotId))
        message.success(l('已删除', 'Deleted'))
      } catch {
        message.error(l('删除失败', 'Failed to delete'))
      } finally {
        setDeletingId(null)
      }
    },
    [],
  )

  const handleBatchDelete = useCallback(async () => {
    if (selectedShotIds.length === 0) return
    const ids = [...selectedShotIds]

    setBatchDeleting(true)
    let ok = 0
    let fail = 0
    try {
      for (const id of ids) {
        try {
          await StudioShotsService.deleteShotApiV1StudioShotsShotIdDelete({ shotId: id })
          ok += 1
          setShots((prev) => prev.filter((s) => s.id !== id))
          setSelectedRowKeys((prev) => prev.filter((k) => String(k) !== id))
        } catch {
          fail += 1
        }
      }
    } finally {
      setBatchDeleting(false)
    }

    if (ok > 0 && fail === 0) {
      message.success(l(`已删除 ${ok} 条`, `Deleted ${ok}`))
    } else if (ok > 0 && fail > 0) {
      message.warning(l(`已删除 ${ok} 条，失败 ${fail} 条`, `Deleted ${ok}; ${fail} failed`))
    } else if (ok === 0 && fail > 0) {
      message.error(l(`删除失败（共 ${fail} 条）`, `Failed to delete ${fail}`))
    }
  }, [selectedShotIds])

  const handleOpenSelectedInStudio = useCallback(() => {
    if (!projectId || !chapterId || selectedShotIds.length === 0) return
    navigate(getChapterStudioPath(projectId, chapterId), {
      state: {
        focusShotId: selectedShotIds[0],
        selectedShotIds,
      },
    })
  }, [chapterId, navigate, projectId, selectedShotIds])

  const columns: TableColumnsType<ShotRead> = useMemo(
    () => [
      {
        title: l('序号', 'No.'),
        dataIndex: 'index',
        key: 'index',
        width: 72,
        align: 'center',
      },
      {
        title: l('标题', 'Title'),
        dataIndex: 'title',
        key: 'title',
        width: 200,
        ellipsis: { showTitle: false },
        render: (t: string) => {
          const text = t?.trim() ? t : '—'
          return (
            <Tooltip title={text}>
              <span>{text}</span>
            </Tooltip>
          )
        },
      },
      {
        title: l('状态', 'Status'),
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (_: unknown, r) => statusTag(r.status),
      },
      {
        title: l('准备度', 'Readiness'),
        key: 'preparation',
        width: 168,
        render: (_: unknown, r) => {
          const state = getShotPreparationState(r, shotRuntimeMap[r.id])
          return (
            <div className="space-y-1">
              <Tag color={state.color}>{state.text}</Tag>
              <div className="text-[11px] text-gray-500 leading-5">{state.hint}</div>
            </div>
          )
        },
      },
      {
        title: l('剧本摘录', 'Script excerpt'),
        dataIndex: 'script_excerpt',
        key: 'script_excerpt',
        width: 280,
        ellipsis: { showTitle: false },
        render: (v: string | undefined) => {
          const raw = v?.trim() ?? ''
          const display = raw || '—'
          return (
            <Tooltip title={raw ? raw : undefined} placement="topLeft">
              <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{display}</span>
            </Tooltip>
          )
        },
      },
      {
        title: l('角色', 'Characters'),
        key: 'characters',
        width: 260,
        ellipsis: { showTitle: false },
        render: (_: unknown, r) => {
          const display = getShotCharacterDisplay(r)
          if (!display) return <span className="text-gray-400">No confirmed characters</span>
          return (
            <Tooltip title={display} placement="topLeft">
              <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{display}</span>
            </Tooltip>
          )
        },
      },
      {
        title: l('操作', 'Actions'),
        key: 'actions',
        width: 170,
        render: (_: unknown, r) => (
          <Space size={0} wrap>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              disabled={extracting}
              loading={extracting}
              onClick={() =>
                projectId &&
                chapterId &&
                navigate(getChapterShotEditPath(projectId, chapterId, r.id))
              }
            >
              {l('编辑', 'Edit')}
            </Button>
            <Popconfirm
              title={l('确定删除该分镜？', 'Delete this storyboard?')}
              okText={l('删除', 'Delete')}
              cancelText={l('取消', 'Cancel')}
              onConfirm={() => void handleDelete(r.id)}
              okButtonProps={{ loading: extracting || deletingId === r.id, disabled: extracting }}
              cancelButtonProps={{ disabled: extracting }}
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={extracting || deletingId === r.id}
                disabled={extracting}
              >
                {l('删除', 'Delete')}
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [chapterId, deletingId, extracting, handleDelete, navigate, projectId, shotRuntimeMap],
  )

  const tableEmpty =
    !loading && shots.length === 0 ? (
      <Empty description={l('暂无分镜', 'No storyboards')} />
    ) : !loading && filteredShots.length === 0 ? (
      <Empty description={l('没有匹配的分镜', 'No matching storyboards')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
    ) : undefined

  const tableScrollY = 'calc(100vh - 320px)'

  if (!projectId || !chapterId) {
    return <Navigate to="/projects" replace />
  }

  return (
    <Layout style={{ height: '100%', minHeight: 0, background: '#eef2f7' }}>
      <Header
        style={{
          padding: '0 16px',
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Link
          to={`/projects/${projectId}?tab=chapters`}
          className="text-gray-600 hover:text-blue-600 flex items-center gap-1"
        >
          <ArrowLeftOutlined /> {l('返回章节列表', 'Back to chapters')}
        </Link>
        <Divider type="vertical" />

        <div className="min-w-0 flex-1 overflow-hidden">
          <Typography.Text
            strong
            className="truncate block"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {chapterIndex !== null ? l(`第${chapterIndex}章 · ${chapterTitle || l('未命名', 'Untitled')}`, `Chapter ${chapterIndex} · ${chapterTitle || l('未命名', 'Untitled')}`) : chapterTitle || l('章节', 'Chapter')}
          </Typography.Text>
          <Typography.Text
            type="secondary"
            className="text-xs truncate block"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {loadingChapter ? l('加载中…', 'Loading…') : l('分镜列表', 'Storyboards')}
          </Typography.Text>
        </div>

        {shots.length > 0 ? (
          <Space>
            <Button
              type="primary"
              icon={<FileSearchOutlined />}
              onClick={() => navigate(getChapterStudioPath(projectId, chapterId))}
            >
              {l('进入分镜工作室', 'Open storyboard studio')}
            </Button>
            <Button
              icon={<VideoCameraOutlined />}
              onClick={() => navigate(getChapterStudioPath(projectId, chapterId))}
            >
              {l('继续当前镜头', 'Continue current shot')}
            </Button>
          </Space>
        ) : null}
      </Header>

      <Content
        style={{
          padding: 16,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Card
          title={
            <div className="flex flex-wrap items-center gap-3">
              <span>{l('分镜', 'Storyboards')}</span>
              {shots.length > 0 ? (
                <Tag color="warning" className="!mr-0">
                  {l('当前章节已存在分镜，若要重新提取，请先删除现有分镜', 'This chapter already has storyboards. Delete them before extracting again.')}
                </Tag>
              ) : null}
            </div>
          }
          style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          bodyStyle={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            padding: 16,
          }}
          extra={
            <Space wrap>
              {selectedRowKeys.length > 0 ? (
                <>
                  <span className="text-gray-500 text-sm">{l(`已选 ${selectedRowKeys.length} 项`, `${selectedRowKeys.length} selected`)}</span>
                  <Popconfirm
                    title={l(`确定删除选中的 ${selectedRowKeys.length} 条分镜？`, `Delete ${selectedRowKeys.length} selected storyboards?`)}
                    okText={l('删除', 'Delete')}
                    cancelText={l('取消', 'Cancel')}
                    onConfirm={() => void handleBatchDelete()}
                    okButtonProps={{ danger: true, loading: batchDeleting, disabled: extracting || batchDeleting }}
                    cancelButtonProps={{ disabled: extracting || batchDeleting }}
                  >
                    <Button danger icon={<DeleteOutlined />} loading={batchDeleting} disabled={extracting || batchDeleting}>
                      {l('批量删除', 'Delete selected')}
                    </Button>
                  </Popconfirm>
                </>
              ) : null}
              <Tooltip
                title={
                  chapterDivisionTask
                    ? l('当前章节已有分镜提取任务在运行', 'A storyboard extraction task is already running for this chapter')
                    : shots.length > 0
                      ? l('已存在分镜时不允许同步分镜，需先清空分镜', 'Storyboards cannot be synchronized while existing storyboards remain; clear them first')
                      : undefined
                }
              >
                <span>
                  <Button
                    type={shots.length === 0 ? 'primary' : 'default'}
                    icon={<ScissorOutlined />}
                    loading={extracting}
                    disabled={extracting || shots.length > 0 || !!chapterDivisionTask}
                    onClick={() => void handleOneClickExtract()}
                  >
                    {chapterDivisionTask ? l('分镜提取中', 'Extracting storyboards') : shots.length === 0 ? l('一键提取分镜', 'Extract storyboards') : l('重新提取需先清空分镜', 'Clear storyboards before extracting again')}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={shots.length > 0 ? l('已存在分镜时不允许导入，需先清空分镜', 'Import is disabled while storyboards exist; clear them first') : undefined}>
                <span>
                  <Button
                    icon={<UploadOutlined />}
                    disabled={extracting || shots.length > 0 || !!chapterDivisionTask}
                    onClick={openImport}
                  >
                    {l('导入分镜表', 'Import storyboard table')}
                  </Button>
                </span>
              </Tooltip>
              <Button icon={<PlusOutlined />} onClick={openCreate} loading={extracting} disabled={extracting}>
                {l('创建分镜', 'Create storyboard')}
              </Button>
              <Button
                icon={<ReloadOutlined />}
                loading={extracting || loading}
                disabled={extracting || batchDeleting}
                onClick={() => void refresh()}
              >
                {l('刷新', 'Refresh')}
              </Button>
              {chapterDivisionTask ? (
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  loading={chapterDivisionTaskLoading}
                  disabled={chapterDivisionTask.cancelRequested || chapterDivisionTaskLoading}
                  onClick={() => void handleCancelChapterDivisionTask()}
                >
                  {chapterDivisionTask.cancelRequested ? l('正在取消', 'Cancelling') : l('取消提取', 'Cancel extraction')}
                </Button>
              ) : null}
            </Space>
          }
        >
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <Input.Search
              allowClear
              placeholder={l('搜索序号、标题或剧本摘录…', 'Search number, title, or script excerpt…')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                size="small"
                value={listFilter}
                onChange={(value) => setListFilter(value as ShotListFilter)}
                options={[
                  { label: l(`全部 ${shotFilterCounts.all}`, `All ${shotFilterCounts.all}`), value: 'all' },
                  { label: l(`待确认 ${shotFilterCounts.pending}`, `Awaiting confirmation ${shotFilterCounts.pending}`), value: 'pending' },
                  { label: l(`生成中 ${shotFilterCounts.generating}`, `Generating ${shotFilterCounts.generating}`), value: 'generating' },
                  { label: l(`已就绪 ${shotFilterCounts.ready}`, `Ready ${shotFilterCounts.ready}`), value: 'ready' },
                ]}
              />
              {selectedRowKeys.length > 0 ? (
                <Space size="small" wrap>
                  <Button
                    icon={<FileSearchOutlined />}
                    disabled={extracting || batchDeleting}
                    onClick={handleOpenSelectedInStudio}
                  >
                    {l('处理首个已选', 'Process first selected')}
                  </Button>
                  <Button
                    type="text"
                    disabled={extracting || batchDeleting}
                    onClick={() => setSelectedRowKeys([])}
                  >
                    {l('清空选择', 'Clear selection')}
                  </Button>
                </Space>
              ) : null}
            </div>
            <div className="flex-1 min-h-0">
              <Table<ShotRead>
                rowKey="id"
                size="small"
                loading={loading}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                  getCheckboxProps: () => ({
                    disabled: extracting || batchDeleting,
                  }),
                }}
                columns={columns}
                dataSource={filteredShots}
                pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
                scroll={{ x: 1180, y: tableScrollY }}
                locale={{
                  emptyText: tableEmpty ?? <Empty description={l('暂无数据', 'No data')} image={Empty.PRESENTED_IMAGE_SIMPLE} />,
                }}
              />
            </div>
          </div>
        </Card>
      </Content>

      <Modal
        title={l('导入分镜表', 'Import storyboard table')}
        open={importOpen}
        onCancel={importLoading ? undefined : closeImport}
        onOk={() => void commitImport()}
        okText={l('确认导入', 'Confirm import')}
        cancelText={l('取消', 'Cancel')}
        confirmLoading={importLoading}
        okButtonProps={{ disabled: importLoading || !importPreview || importPreview.errors.length > 0 || shots.length > 0 }}
        cancelButtonProps={{ disabled: importLoading }}
        destroyOnClose
        width={920}
      >
        <Space direction="vertical" className="w-full" size="middle">
          <Typography.Paragraph type="secondary" className="!mb-0">
            {l('这个入口与 AI 自动分镜平行，导入后仍写入 Jellyfish 原生 shots / shot_details / shot links，后续继续走分镜准备、关键帧和视频生成。', 'This import path runs alongside AI storyboarding and writes native Jellyfish shots, shot details, and shot links. Preparation, keyframes, and video generation continue normally.')}
          </Typography.Paragraph>
          <Space wrap>
            <Button onClick={downloadImportTemplate}>{l('下载 CSV 模板', 'Download CSV template')}</Button>
            <Upload
              accept=".csv,.tsv,.txt"
              showUploadList={false}
              beforeUpload={(file) => {
                const reader = new FileReader()
                reader.onload = () => {
                  setImportContent(String(reader.result ?? ''))
                  setImportPreview(null)
                }
                reader.readAsText(file)
                return false
              }}
            >
              <Button icon={<UploadOutlined />}>{l('上传 CSV/TSV', 'Upload CSV/TSV')}</Button>
            </Upload>
            <Button type="primary" loading={importLoading} onClick={() => void previewImport()}>
              {l('预览导入', 'Preview import')}
            </Button>
          </Space>
          <Input.TextArea
            rows={9}
            value={importContent}
            onChange={(e) => {
              setImportContent(e.target.value)
              setImportPreview(null)
            }}
            placeholder={storyboardTemplate}
          />
          {importPreview ? (
            <Space direction="vertical" className="w-full" size="small">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
                <Card size="small">{l('分镜', 'Storyboards')} {importPreview.will_create_shots}</Card>
                <Card size="small">{l('角色', 'Characters')} {importPreview.linked_characters}</Card>
                <Card size="small">{l('场景', 'Scenes')} {importPreview.linked_scenes}</Card>
                <Card size="small">{l('服装', 'Costumes')} {importPreview.linked_costumes}</Card>
                <Card size="small">{l('道具', 'Props')} {importPreview.linked_props}</Card>
                <Card size="small">{l('未匹配', 'Unmatched')} {importPreview.unresolved_count}</Card>
              </div>
              {importPreview.errors.length > 0 ? (
                <Card size="small" className="border-red-200">
                  <Typography.Text type="danger">{l('存在行级错误，修正后再导入。', 'Row-level errors exist. Fix them before importing.')}</Typography.Text>
                  {importPreview.errors.slice(0, 8).map((err) => (
                    <div key={`${err.row_number}-${err.field}`} className="text-xs text-red-600">
                      {l(`第 ${err.row_number} 行`, `Row ${err.row_number}`)} · {err.field}: {err.message}
                    </div>
                  ))}
                </Card>
              ) : null}
              <Table
                size="small"
                rowKey="row_number"
                dataSource={importPreview.rows}
                pagination={{ pageSize: 5 }}
                columns={[
                  { title: l('行号', 'Row'), dataIndex: 'row_number', width: 70 },
                  { title: l('序号', 'No.'), dataIndex: 'shot_index', width: 70 },
                  { title: l('标题', 'Title'), dataIndex: 'title', ellipsis: true },
                  {
                    title: l('匹配资产', 'Matched assets'),
                    key: 'matched',
                    render: (_, row) => (
                      <div className="text-xs text-gray-600">
                        <div>角色：{row.matched_characters.join(bilingualText('、', ', ')) || '—'}</div>
                        <div>{l('场景：', 'Scene: ')}{row.matched_scene || '—'}</div>
                        <div>{l('服装：', 'Costumes: ')}{row.matched_costumes.join(l('、', ', ')) || '—'}</div>
                        <div>{l('道具：', 'Props: ')}{row.matched_props.join(l('、', ', ')) || '—'}</div>
                      </div>
                    ),
                  },
                  {
                    title: l('未匹配', 'Unmatched'),
                    dataIndex: 'unresolved',
                    width: 220,
                    render: (items: string[]) =>
                      items.length > 0 ? <Typography.Text type="warning">{items.join('、')}</Typography.Text> : <Tag color="green">OK</Tag>,
                  },
                ]}
              />
            </Space>
          ) : null}
        </Space>
      </Modal>

      <Modal
        title={l('创建分镜', 'Create storyboard')}
        open={createOpen}
        onCancel={extracting ? undefined : closeCreate}
        onOk={() => void submitCreate()}
        confirmLoading={extracting || createSubmitting}
        okButtonProps={{ loading: extracting || createSubmitting, disabled: extracting }}
        cancelButtonProps={{ disabled: extracting }}
        closable={!extracting}
        maskClosable={!extracting}
        keyboard={!extracting}
        destroyOnClose
        width={520}
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item name="title" label={l('标题', 'Title')} rules={[{ required: true, message: l('请填写标题', 'Enter a title') }]}>
            <Input placeholder={l('分镜标题', 'Storyboard title')} />
          </Form.Item>
          <Form.Item name="script_excerpt" label={l('剧本摘录', 'Script excerpt')}>
            <Input.TextArea rows={8} placeholder={l('可选', 'Optional')} />
          </Form.Item>
        </Form>
      </Modal>

    </Layout>
  )
}
