import { Badge, Button, Card, Empty, Modal, Progress, Segmented, Select, Tag, message } from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CloseCircleOutlined,
  PushpinOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { BarChart3 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilmService } from '../../../services/generated'
import { unwrapApiData } from '../../../services/generatedResponse'
import type { TaskUiItem } from './taskUiStore'
import { GenerationFailureSummaryPanel } from './GenerationFailureSummaryPanel'
import {
  flattenPageContexts,
  isTaskHighlighted,
  mergeTaskUiItems,
  useTaskUiStore,
} from './taskUiStore'
import { useResolvedTaskCenterTasks } from './taskCenterMeta'
import { useBilingualText } from '../../../i18n/useBilingualText'
import i18n from '../../../i18n'

const TASK_CENTER_OPEN_STORAGE_KEY = 'jellyfish_task_center_open_v1'
const TASK_CENTER_POSITION_STORAGE_KEY = 'jellyfish_task_center_position_v1'
const TASK_CENTER_EDGE_PADDING = 24
const TASK_CENTER_BUTTON_WIDTH = 132
const TASK_CENTER_BUTTON_HEIGHT = 40
const TASK_CENTER_PANEL_WIDTH = 360
const TASK_CENTER_PANEL_HEIGHT = 420
const TASK_CENTER_PANEL_GAP = 12
const TASK_CENTER_PAGE_SIZE = 3

function getDefaultButtonPosition() {
  if (typeof window === 'undefined') {
    return { x: TASK_CENTER_EDGE_PADDING, y: 520 }
  }
  return {
    x: TASK_CENTER_EDGE_PADDING,
    y: Math.max(
      TASK_CENTER_EDGE_PADDING,
      window.innerHeight - TASK_CENTER_BUTTON_HEIGHT - TASK_CENTER_EDGE_PADDING,
    ),
  }
}

function getButtonBounds() {
  if (typeof window === 'undefined') {
    return {
      minX: TASK_CENTER_EDGE_PADDING,
      maxX: TASK_CENTER_EDGE_PADDING,
      minY: TASK_CENTER_EDGE_PADDING,
      maxY: 520,
    }
  }
  return {
    minX: TASK_CENTER_EDGE_PADDING,
    maxX: Math.max(
      TASK_CENTER_EDGE_PADDING,
      window.innerWidth - TASK_CENTER_BUTTON_WIDTH - TASK_CENTER_EDGE_PADDING,
    ),
    minY: TASK_CENTER_EDGE_PADDING,
    maxY: Math.max(
      TASK_CENTER_EDGE_PADDING,
      window.innerHeight - TASK_CENTER_BUTTON_HEIGHT - TASK_CENTER_EDGE_PADDING,
    ),
  }
}

function clampButtonPosition(position: { x: number; y: number }) {
  const bounds = getButtonBounds()
  return {
    x: Math.max(bounds.minX, Math.min(position.x, bounds.maxX)),
    y: Math.max(bounds.minY, Math.min(position.y, bounds.maxY)),
  }
}

function snapButtonPosition(position: { x: number; y: number }) {
  const bounds = getButtonBounds()
  const middleX = (bounds.minX + bounds.maxX) / 2
  return {
    x: position.x <= middleX ? bounds.minX : bounds.maxX,
    y: Math.max(bounds.minY, Math.min(position.y, bounds.maxY)),
  }
}

function formatElapsedMs(elapsedMs?: number | null, english = false): string | null {
  if (elapsedMs == null || elapsedMs < 0) return null
  const totalSeconds = Math.floor(elapsedMs / 1000)
  if (totalSeconds < 60) return english ? `${totalSeconds} sec` : `${totalSeconds} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return english ? (seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`) : (seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`)
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return english ? (remainMinutes > 0 ? `${hours} hr ${remainMinutes} min` : `${hours} hr`) : (remainMinutes > 0 ? `${hours} 小时 ${remainMinutes} 分` : `${hours} 小时`)
}

function formatStartedAt(startedAtTs?: number | null): string | null {
  if (!startedAtTs) return null
  return new Intl.DateTimeFormat(i18n.language.startsWith('en') ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(startedAtTs * 1000))
}

function taskTone(task: TaskUiItem, l: (zh: string, en: string) => string): { color: string; label: string } {
  if (task.cancelRequested) return { color: 'orange', label: l('取消中', 'Cancelling') }
  if (task.status === 'cancelled') return { color: 'orange', label: l('已取消', 'Cancelled') }
  if (task.status === 'recoverable_timeout') return { color: 'gold', label: l('可恢复超时', 'Recoverable timeout') }
  if (task.status === 'aspect_ratio_mismatch') return { color: 'red', label: l('比例不匹配', 'Aspect ratio mismatch') }
  if (task.status === 'failed') return { color: 'red', label: l('失败', 'Failed') }
  if (task.status === 'succeeded') return { color: 'green', label: l('已完成', 'Completed') }
  if (task.status === 'processing') return { color: 'cyan', label: l('处理中', 'Processing') }
  if (task.status === 'streaming') return { color: 'cyan', label: l('处理中', 'Processing') }
  if (task.status === 'running') return { color: 'blue', label: l('运行中', 'Running') }
  return { color: 'default', label: l('排队中', 'Queued') }
}

export function TaskCenter() {
  const l = useBilingualText()
  const english = i18n.language.startsWith('en')
  const navigate = useNavigate()
  const [scopeFilter, setScopeFilter] = useState<'auto' | 'all' | 'current' | 'active' | 'settled'>('auto')
  const [taskKindFilter, setTaskKindFilter] = useState<string | undefined>(undefined)
  const [taskIdFilter, setTaskIdFilter] = useState('')
  const [page, setPage] = useState(1)
  const [buttonPosition, setButtonPosition] = useState(getDefaultButtonPosition)
  const [dragging, setDragging] = useState(false)
  const [rawTaskTitle, setRawTaskTitle] = useState<string | null>(null)
  const [rawTaskJson, setRawTaskJson] = useState<string | null>(null)
  const [directLookupTask, setDirectLookupTask] = useState<{
    taskId: string
    status: string
    progress: number
    failureSummary: any
  } | null>(null)
  const [directLookupError, setDirectLookupError] = useState<string | null>(null)
  const open = useTaskUiStore((state) => state.open)
  const setOpen = useTaskUiStore((state) => state.setOpen)
  const toggleOpen = useTaskUiStore((state) => state.toggleOpen)
  const serverItems = useTaskUiStore((state) => state.serverItems)
  const optimisticItems = useTaskUiStore((state) => state.optimisticItems)
  const contextScopes = useTaskUiStore((state) => state.contextScopes)
  const cancelTask = useTaskUiStore((state) => state.cancelTask)
  const dragStateRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    moved: boolean
  } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const defaultPosition = getDefaultButtonPosition()
    try {
      setOpen(window.localStorage.getItem(TASK_CENTER_OPEN_STORAGE_KEY) === '1')
      const rawPosition = window.localStorage.getItem(TASK_CENTER_POSITION_STORAGE_KEY)
      if (!rawPosition) {
        setButtonPosition(defaultPosition)
        return
      }
      const parsed = JSON.parse(rawPosition) as { x?: number; y?: number }
      const x = Number.isFinite(parsed?.x) ? Number(parsed.x) : defaultPosition.x
      const y = Number.isFinite(parsed?.y) ? Number(parsed.y) : defaultPosition.y
      setButtonPosition({ x, y })
    } catch {
      setOpen(false)
      setButtonPosition(defaultPosition)
    }
  }, [setOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TASK_CENTER_OPEN_STORAGE_KEY, open ? '1' : '0')
  }, [open])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TASK_CENTER_POSITION_STORAGE_KEY, JSON.stringify(buttonPosition))
  }, [buttonPosition])

  useEffect(() => {
    const clampPosition = () => {
      if (typeof window === 'undefined') return
      setButtonPosition((prev) => snapButtonPosition(clampButtonPosition(prev)))
    }
    clampPosition()
    window.addEventListener('resize', clampPosition)
    return () => {
      window.removeEventListener('resize', clampPosition)
    }
  }, [])

  const tasks = useMemo(
    () =>
      mergeTaskUiItems(serverItems, optimisticItems).sort((a, b) => {
        const activeContexts = flattenPageContexts(contextScopes)
        const priority = (task: TaskUiItem): number => {
          if (isTaskHighlighted(task, activeContexts)) return 4
          if (task.cancelRequested) return 3
          if (task.status === 'running' || task.status === 'processing' || task.status === 'streaming') return 2
          if (task.status === 'pending') return 1
          return 0
        }
        const priorityDelta = priority(b) - priority(a)
        if (priorityDelta !== 0) return priorityDelta
        const aTs = a.startedAtTs ?? 0
        const bTs = b.startedAtTs ?? 0
        return bTs - aTs
      }),
    [contextScopes, optimisticItems, serverItems],
  )
  const activeContexts = useMemo(() => flattenPageContexts(contextScopes), [contextScopes])
  const resolvedTasks = useResolvedTaskCenterTasks(tasks, navigate)
  const taskKindOptions = useMemo(
    () =>
      Array.from(
        new Set(resolvedTasks.map((task) => task.title).filter((value): value is string => !!value)),
      ).map((title) => ({
        label: title,
        value: title,
      })),
    [resolvedTasks],
  )
  const summaryCounts = useMemo(
    () => ({
      current: resolvedTasks.filter((task) => isTaskHighlighted(task, activeContexts)).length,
      active: resolvedTasks.filter((task) => ['pending', 'running', 'processing', 'streaming'].includes(task.status)).length,
      settled: resolvedTasks.filter((task) => ['succeeded', 'recoverable_timeout', 'aspect_ratio_mismatch', 'failed', 'cancelled'].includes(task.status)).length,
    }),
    [activeContexts, resolvedTasks],
  )
  const effectiveScopeFilter = useMemo<'all' | 'current' | 'active' | 'settled'>(() => {
    if (scopeFilter !== 'auto') return scopeFilter
    if (summaryCounts.current > 0) return 'current'
    if (summaryCounts.active > 0) return 'active'
    if (summaryCounts.settled > 0) return 'settled'
    return 'all'
  }, [scopeFilter, summaryCounts.active, summaryCounts.current, summaryCounts.settled])
  const filteredTasks = useMemo(
    () =>
      resolvedTasks.filter((task) => {
        if (effectiveScopeFilter === 'current' && !isTaskHighlighted(task, activeContexts)) return false
        if (effectiveScopeFilter === 'active' && !['pending', 'running', 'processing', 'streaming'].includes(task.status)) return false
        if (effectiveScopeFilter === 'settled' && !['succeeded', 'recoverable_timeout', 'aspect_ratio_mismatch', 'failed', 'cancelled'].includes(task.status)) return false
        if (taskKindFilter && task.title !== taskKindFilter) return false
        const taskIdQuery = taskIdFilter.trim().toLowerCase()
        if (taskIdQuery && !task.taskId.toLowerCase().includes(taskIdQuery)) return false
        return true
      }),
    [activeContexts, effectiveScopeFilter, resolvedTasks, taskIdFilter, taskKindFilter],
  )
  const taskIdQuery = taskIdFilter.trim()
  const hasLocalTaskIdMatch = useMemo(
    () => Boolean(taskIdQuery) && resolvedTasks.some((task) => task.taskId.toLowerCase().includes(taskIdQuery.toLowerCase())),
    [resolvedTasks, taskIdQuery],
  )
  useEffect(() => {
    if (taskIdQuery.length < 16 || hasLocalTaskIdMatch) {
      setDirectLookupTask(null)
      setDirectLookupError(null)
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId: taskIdQuery })
          if (cancelled) return
          const data = res.data
          if (!data) {
            setDirectLookupTask(null)
            setDirectLookupError(l('未找到该任务，或任务详情暂时不可用。', 'Task not found or its details are temporarily unavailable.'))
            return
          }
          setDirectLookupTask({
            taskId: data.task_id,
            status: String(data.status),
            progress: Number(data.progress ?? 0),
            failureSummary: data.failure_summary ?? null,
          })
          setDirectLookupError(null)
        } catch {
          if (cancelled) return
          setDirectLookupTask(null)
          setDirectLookupError(l('未找到该任务，或任务详情暂时不可用。', 'Task not found or its details are temporarily unavailable.'))
        }
      })()
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [hasLocalTaskIdMatch, taskIdQuery])
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / TASK_CENTER_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedTasks = useMemo(
    () => filteredTasks.slice((currentPage - 1) * TASK_CENTER_PAGE_SIZE, currentPage * TASK_CENTER_PAGE_SIZE),
    [currentPage, filteredTasks],
  )
  const groupedTasks = useMemo(() => {
    if (effectiveScopeFilter !== 'all') {
      return [{ key: effectiveScopeFilter, title: null as string | null, tasks: pagedTasks }]
    }
    const currentTasks = pagedTasks.filter((task) => isTaskHighlighted(task, activeContexts))
    const activeTasks = pagedTasks.filter(
      (task) => !isTaskHighlighted(task, activeContexts) && ['pending', 'running', 'processing', 'streaming'].includes(task.status),
    )
    const settledTasks = pagedTasks.filter(
      (task) => !isTaskHighlighted(task, activeContexts) && ['succeeded', 'recoverable_timeout', 'aspect_ratio_mismatch', 'failed', 'cancelled'].includes(task.status),
    )
    const otherTasks = pagedTasks.filter(
      (task) =>
        !isTaskHighlighted(task, activeContexts) &&
        !['pending', 'running', 'processing', 'streaming', 'succeeded', 'recoverable_timeout', 'aspect_ratio_mismatch', 'failed', 'cancelled'].includes(task.status),
    )
    return [
      { key: 'current', title: currentTasks.length > 0 ? `${l('当前页', 'Current page')} ${currentTasks.length}` : null, tasks: currentTasks },
      { key: 'active', title: activeTasks.length > 0 ? `${l('运行中', 'Running')} ${activeTasks.length}` : null, tasks: activeTasks },
      { key: 'settled', title: settledTasks.length > 0 ? `${l('最近结束', 'Recently finished')} ${settledTasks.length}` : null, tasks: settledTasks },
      { key: 'all', title: otherTasks.length > 0 ? `${l('全部', 'All')} ${otherTasks.length}` : null, tasks: otherTasks },
    ].filter((group) => group.tasks.length > 0)
  }, [activeContexts, effectiveScopeFilter, pagedTasks])
  const panelStyle = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        left: TASK_CENTER_EDGE_PADDING,
        top: TASK_CENTER_EDGE_PADDING,
        width: TASK_CENTER_PANEL_WIDTH,
      }
    }
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const panelWidth = Math.min(TASK_CENTER_PANEL_WIDTH, viewportWidth - TASK_CENTER_EDGE_PADDING * 2)
    const preferTop = buttonPosition.y - TASK_CENTER_PANEL_GAP - TASK_CENTER_PANEL_HEIGHT
    const preferBottom = buttonPosition.y + TASK_CENTER_BUTTON_HEIGHT + TASK_CENTER_PANEL_GAP
    const hasSpaceAbove = preferTop >= TASK_CENTER_EDGE_PADDING
    const rawTop = hasSpaceAbove
      ? preferTop
      : Math.min(
          preferBottom,
          Math.max(TASK_CENTER_EDGE_PADDING, viewportHeight - TASK_CENTER_PANEL_HEIGHT - TASK_CENTER_EDGE_PADDING),
        )
    const alignedLeft = buttonPosition.x
    const alignedRight = buttonPosition.x + TASK_CENTER_BUTTON_WIDTH - panelWidth
    const rawLeft = alignedLeft + panelWidth <= viewportWidth - TASK_CENTER_EDGE_PADDING ? alignedLeft : alignedRight
    return {
      left: Math.max(
        TASK_CENTER_EDGE_PADDING,
        Math.min(rawLeft, viewportWidth - panelWidth - TASK_CENTER_EDGE_PADDING),
      ),
      top: Math.max(
        TASK_CENTER_EDGE_PADDING,
        Math.min(rawTop, viewportHeight - TASK_CENTER_PANEL_HEIGHT - TASK_CENTER_EDGE_PADDING),
      ),
      width: panelWidth,
    }
  }, [buttonPosition.x, buttonPosition.y])

  const handleButtonPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleButtonPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const nextX = event.clientX - drag.offsetX
    const nextY = event.clientY - drag.offsetY
    drag.moved = true
    setButtonPosition(clampButtonPosition({ x: nextX, y: nextY }))
  }

  const handleButtonPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setButtonPosition((prev) => snapButtonPosition(prev))
    setDragging(false)
  }

  const handleButtonClick = () => {
    const drag = dragStateRef.current
    if (drag?.moved) {
      dragStateRef.current = null
      return
    }
    dragStateRef.current = null
    toggleOpen()
  }

  const showTaskRawResult = async (taskId: string, mode: 'result' | 'payload') => {
    try {
      const res = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId })
      const data = res.data
      const result = data?.result ?? null
      const providerRaw =
        result && typeof result === 'object'
          ? (result as Record<string, unknown>).advanced_debug
          : null
      const raw =
        mode === 'payload' && providerRaw && typeof providerRaw === 'object'
          ? ((providerRaw as Record<string, unknown>).provider_raw as Record<string, unknown> | undefined)
              ?.submit_payload ?? null
          : result
      setRawTaskTitle(mode === 'payload' ? l('提交载荷', 'Submitted payload') : l('后端调度原始响应', 'Raw backend dispatch response'))
      setRawTaskJson(JSON.stringify(raw ?? data ?? {}, null, 2))
    } catch (error) {
      setRawTaskTitle(l('读取失败', 'Failed to read'))
      setRawTaskJson(String(error))
    }
  }

  const pollExistingProviderTask = async (taskId: string) => {
    const hide = message.loading(l('正在轮询已有后端调度任务...', 'Polling the existing backend dispatch task...'), 0)
    try {
      const response = await FilmService.recoverAtlasTaskApiV1FilmTasksTaskIdRecoverAtlasPost({ taskId })
      const report = unwrapApiData<Record<string, unknown>>(response, l('恢复轮询失败', 'Failed to resume polling'))
      if (report?.status === 'recovered') {
        message.success(l('已恢复并写回本地产物', 'Recovered and saved the local output'))
      } else if (report?.status === 'not_completed') {
        message.info(l(`后端调度仍在处理：${report?.provider_status || 'processing'}`, `Backend dispatch is still processing: ${report?.provider_status || 'processing'}`))
      } else if (report?.status === 'skipped') {
        message.info(l('该任务已有本地 file_id，无需恢复', 'This task already has a local file_id; recovery is unnecessary.'))
      } else {
        message.info(l('恢复轮询已完成', 'Recovery polling completed'))
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : l('恢复轮询失败', 'Failed to resume polling'))
    } finally {
      hide()
    }
  }

  return (
    <div
      className={`fixed z-[1200] pointer-events-none ${dragging ? '' : 'transition-[left,top] duration-200 ease-out'}`}
      style={{ left: buttonPosition.x, top: buttonPosition.y }}
    >
      {open ? (
        <div
          className={`fixed pointer-events-auto ${dragging ? '' : 'transition-[left,top] duration-200 ease-out'}`}
          style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
        >
          <Card
            title={l('任务中心', 'Task center')}
            size="small"
            className="shadow-lg"
            extra={
              <div className="flex items-center gap-1">
                <Button
                  size="small"
                  type="text"
                  icon={<BarChart3 size={14} strokeWidth={1.75} />}
                  onClick={() => {
                    navigate('/efficiency-overview')
                    setOpen(false)
                  }}
                >
                  {l('效能总览', 'Efficiency')}
                </Button>
                <Button size="small" type="text" onClick={() => setOpen(false)}>
                  {l('收起', 'Collapse')}
                </Button>
              </div>
            }
            bodyStyle={{ maxHeight: 304, overflow: 'auto' }}
          >
            <div className="mb-3 flex flex-col gap-2">
              <Segmented
                size="small"
                value={scopeFilter}
                onChange={(value) => {
                  setScopeFilter(value as 'auto' | 'all' | 'current' | 'active' | 'settled')
                  setPage(1)
                }}
                options={[
                  { label: l('智能', 'Smart'), value: 'auto' },
                  { label: l(`当前页 ${summaryCounts.current}`, `Current ${summaryCounts.current}`), value: 'current' },
                  { label: l(`运行中 ${summaryCounts.active}`, `Active ${summaryCounts.active}`), value: 'active' },
                  { label: l(`最近结束 ${summaryCounts.settled}`, `Recently finished ${summaryCounts.settled}`), value: 'settled' },
                  { label: l('全部', 'All'), value: 'all' },
                ]}
              />
              <Select
                size="small"
                allowClear
                placeholder={l('按任务类型筛选', 'Filter by task type')}
                value={taskKindFilter}
                onChange={(value) => {
                  setTaskKindFilter(value)
                  setPage(1)
                }}
                options={taskKindOptions}
              />
              <input
                className="h-7 rounded border border-gray-200 px-2 text-xs outline-none focus:border-blue-400"
                placeholder={l('按任务 ID 搜索', 'Search by task ID')}
                value={taskIdFilter}
                onChange={(event) => {
                  setTaskIdFilter(event.target.value)
                  setPage(1)
                }}
              />
              <div className="text-[11px] text-gray-400">
                {l('默认优先：当前页 → 运行中 → 最近结束 → 全部 · 最近 24 小时 · 每页最多 3 条；输入完整任务 ID 可直接查历史任务', 'Default priority: current page → running → recently finished → all · last 24 hours · up to 3 per page; enter a full task ID to query history')}
              </div>
            </div>
            {directLookupTask ? (
              <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-orange-950">{l('历史任务：', 'Historical task: ')}{directLookupTask.taskId}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-orange-800">
                      <Tag color={directLookupTask.status === 'failed' ? 'red' : directLookupTask.status === 'succeeded' ? 'green' : 'default'}>
                        {directLookupTask.status}
                      </Tag>
                      <span>{l('进度', 'Progress')} {Math.max(0, Math.min(100, Math.round(directLookupTask.progress)))}%</span>
                    </div>
                    {directLookupTask.failureSummary ? (
                      <GenerationFailureSummaryPanel
                        summary={directLookupTask.failureSummary}
                        status={directLookupTask.status}
                        onRecover={
                          directLookupTask.status === 'recoverable_timeout'
                            ? () => void pollExistingProviderTask(directLookupTask.taskId)
                            : null
                        }
                        onViewPayload={() => void showTaskRawResult(directLookupTask.taskId, 'payload')}
                        onViewRaw={() => void showTaskRawResult(directLookupTask.taskId, 'result')}
                      />
                    ) : (
                      <div className="mt-2 rounded border border-orange-100 bg-white p-2 text-xs text-orange-800">
                        {l('该任务没有结构化 failure_summary，可打开原始响应继续排查。', 'This task has no structured failure_summary. Open the raw response for further investigation.')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : directLookupError ? (
              <div className="mb-3 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {directLookupError}
              </div>
            ) : null}
            {filteredTasks.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={l('当前没有任务记录', 'No task records')} />
            ) : (
              <div className="space-y-3">
                {groupedTasks.map((group) => (
                  <div key={group.key} className="space-y-2">
                    {group.title ? <div className="text-[11px] font-medium text-gray-400">{group.title}</div> : null}
                    {group.tasks.map((task) => {
                      const tone = taskTone(task, l)
                      const elapsed = formatElapsedMs(task.elapsedMs, english)
                      const startedAt = formatStartedAt(task.startedAtTs)
                      const highlighted = isTaskHighlighted(task, activeContexts)
                      return (
                        <div
                          key={task.taskId}
                          className={`rounded-lg border px-3 py-2 ${
                            highlighted ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{task.title}</div>
                              {task.sourceLabel ? <div className="mt-1 text-xs text-gray-500 truncate">{task.sourceLabel}</div> : null}
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                                {highlighted ? <Tag color="blue">{l('当前页面', 'Current page')}</Tag> : null}
                                <Tag color={tone.color}>{tone.label}</Tag>
                                <span>{l('进度', 'Progress')} {Math.max(0, Math.min(100, Math.round(task.progress)))}%</span>
                                {elapsed ? <span>{l('耗时', 'Elapsed')} {elapsed}</span> : null}
                              </div>
                              {startedAt ? <div className="mt-1 text-xs text-gray-400">{l('开始于', 'Started at')} {startedAt}</div> : null}
                              {task.failureSummary ? (
                                <GenerationFailureSummaryPanel
                                  summary={task.failureSummary}
                                  status={task.status}
                                  onRecover={
                                    task.status === 'recoverable_timeout'
                                      ? () => void pollExistingProviderTask(task.taskId)
                                      : null
                                  }
                                  onViewPayload={() => void showTaskRawResult(task.taskId, 'payload')}
                                  onViewRaw={() => void showTaskRawResult(task.taskId, 'result')}
                                />
                              ) : task.status === 'failed' || task.status === 'recoverable_timeout' ? (
                                <div className="mt-2 rounded border border-red-100 bg-red-50 p-2 text-xs text-red-800">
                                  {l('后端调度没有返回详细失败原因，请查看原始响应。', 'Backend dispatch did not return a detailed failure reason. Check the raw response.')}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex flex-col gap-2">
                              {task.onNavigate ? (
                                <Button
                                  size="small"
                                  icon={<ArrowRightOutlined />}
                                  onClick={() => {
                                    task.onNavigate?.()
                                    setOpen(false)
                                  }}
                                >
                                  {l('查看', 'View')}
                                </Button>
                              ) : null}
                              {task.onCancel ? (
                                <Button
                                  size="small"
                                  danger
                                  icon={<CloseCircleOutlined />}
                                  disabled={task.cancelRequested}
                                  onClick={task.onCancel}
                                >
                                  {task.cancelRequested ? l('正在取消', 'Cancelling') : l('取消', 'Cancel')}
                                </Button>
                              ) : task.status === 'pending' || task.status === 'running' || task.status === 'processing' || task.status === 'streaming' ? (
                                <Button
                                  size="small"
                                  danger
                                  icon={<CloseCircleOutlined />}
                                  disabled={task.cancelRequested}
                                  onClick={() => {
                                    void cancelTask(task.taskId)
                                  }}
                                >
                                  {task.cancelRequested ? l('正在取消', 'Cancelling') : l('取消', 'Cancel')}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <Progress
                            percent={Math.max(0, Math.min(100, Math.round(task.progress)))}
                            size="small"
                            status={
                              task.cancelRequested || task.status === 'failed'
                                ? 'exception'
                                : task.status === 'succeeded'
                                  ? 'success'
                                  : 'active'
                            }
                            showInfo={false}
                            className="mt-2"
                          />
                        </div>
                      )
                    })}
                  </div>
                ))}
                {filteredTasks.length > TASK_CENTER_PAGE_SIZE ? (
                  <div className="flex items-center justify-end gap-1 pt-1 text-xs text-gray-500">
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowLeftOutlined />}
                      disabled={currentPage <= 1}
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    />
                    <span className="min-w-[32px] text-center">{currentPage}/{totalPages}</span>
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowRightOutlined />}
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      <Badge count={tasks.length} size="small" offset={[-4, 4]} showZero={false}>
        <Button
          type="primary"
          size="middle"
          shape="round"
          icon={<UnorderedListOutlined />}
          onClick={handleButtonClick}
          onPointerDown={handleButtonPointerDown}
          onPointerMove={handleButtonPointerMove}
          onPointerUp={handleButtonPointerUp}
          onPointerCancel={handleButtonPointerUp}
          className="task-center-trigger shadow-lg pointer-events-auto touch-none select-none"
        >
          <span className="inline-flex items-center gap-1">
            <span>{open ? l('收起任务', 'Collapse tasks') : l('任务中心', 'Task center')}</span>
            <PushpinOutlined className="text-[11px] opacity-70" />
          </span>
        </Button>
      </Badge>
      <Modal
        title={rawTaskTitle ?? l('任务详情', 'Task details')}
        open={!!rawTaskJson}
        footer={null}
        width={760}
        onCancel={() => {
          setRawTaskJson(null)
          setRawTaskTitle(null)
        }}
      >
        <pre className="max-h-[560px] overflow-auto rounded bg-gray-950 p-3 text-xs text-gray-100">
          {rawTaskJson}
        </pre>
      </Modal>
    </div>
  )
}
