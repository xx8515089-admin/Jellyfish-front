import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Spin, message } from 'antd'
import type { TaskListItemRead } from '../../../services/generated'
import { FilmService } from '../../../services/generated'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { resolveTaskSourceLabel, resolveTaskTitle } from '../components/taskCopy'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Download,
  Gem,
  PackageOpen,
  Sparkles,
  X,
} from 'lucide-react'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import './EfficiencyOverview.css'

const { RangePicker } = DatePicker

type MetricKey = 'credits' | 'duration' | 'draws'
type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'custom'
type DrawScope = 'video' | 'image' | 'asset'

type DateRange = {
  start: number
  end: number
  label: string
}

type Summary = {
  credits: number
  durationMinutes: number
  draws: number
}

type GroupRow = {
  key: string
  label: string
  value: number
}

const DRAW_RELATION_TYPES = new Set([
  'video',
  'shot_first_frame_prompt',
  'shot_last_frame_prompt',
  'shot_key_frame_prompt',
  'shot_frame_image',
  'actor_image',
  'scene_image',
  'prop_image',
  'costume_image',
  'character_image',
])

const ASSET_IMAGE_RELATION_TYPES = new Set([
  'actor_image',
  'scene_image',
  'prop_image',
  'costume_image',
  'character_image',
])

function getTaskTimestampMs(task: TaskListItemRead): number {
  const timestamp = task.started_at_ts ?? task.created_at_ts ?? task.updated_at_ts ?? 0
  return timestamp * 1000
}

function getTaskElapsedMs(task: TaskListItemRead, now: number): number {
  if (typeof task.elapsed_ms === 'number' && task.elapsed_ms > 0) return task.elapsed_ms
  if (task.started_at_ts && ['pending', 'running', 'processing', 'streaming'].includes(task.status)) {
    return Math.max(0, now - task.started_at_ts * 1000)
  }
  return 0
}

function isDrawTask(task: TaskListItemRead): boolean {
  const kind = task.task_kind ?? ''
  const relationType = task.relation_type ?? ''
  return kind.includes('generation') || kind.includes('shot_frame') || DRAW_RELATION_TYPES.has(relationType)
}

function isDrawTaskInScope(task: TaskListItemRead, scope: DrawScope): boolean {
  const kind = task.task_kind ?? ''
  const relationType = task.relation_type ?? ''
  if (scope === 'video') return kind === 'video_generation' || relationType === 'video'
  if (scope === 'image') {
    return kind === 'image_generation' || relationType === 'shot_frame_image' || relationType.includes('frame_prompt')
  }
  return ASSET_IMAGE_RELATION_TYPES.has(relationType) || kind.includes('portrait') || kind.includes('_info')
}

function buildDateRange(rangeKey: RangeKey, customRange: [Dayjs | null, Dayjs | null] | null, l: (zh: string, en: string) => string): DateRange {
  const now = dayjs()
  if (rangeKey === 'today') {
    return { start: now.startOf('day').valueOf(), end: now.valueOf(), label: l('今日', 'Today') }
  }
  if (rangeKey === 'yesterday') {
    const yesterday = now.subtract(1, 'day')
    return { start: yesterday.startOf('day').valueOf(), end: yesterday.endOf('day').valueOf(), label: l('昨日', 'Yesterday') }
  }
  if (rangeKey === '30d') {
    return { start: now.subtract(29, 'day').startOf('day').valueOf(), end: now.valueOf(), label: l('近30天', 'Last 30 days') }
  }
  if (rangeKey === 'custom' && customRange?.[0] && customRange?.[1]) {
    return {
      start: customRange[0].startOf('day').valueOf(),
      end: customRange[1].endOf('day').valueOf(),
      label: l('自定义', 'Custom'),
    }
  }
  return { start: now.subtract(6, 'day').startOf('day').valueOf(), end: now.valueOf(), label: l('近7天', 'Last 7 days') }
}

function filterTasksByRange(tasks: TaskListItemRead[], range: DateRange): TaskListItemRead[] {
  return tasks.filter((task) => {
    const timestamp = getTaskTimestampMs(task)
    return timestamp >= range.start && timestamp <= range.end
  })
}

function getPreviousRange(range: DateRange): DateRange {
  const duration = range.end - range.start
  return {
    start: range.start - duration,
    end: range.start,
    label: 'previous',
  }
}

function summarizeTasks(tasks: TaskListItemRead[], now: number): Summary {
  return {
    credits: 0,
    durationMinutes: tasks.reduce((total, task) => total + getTaskElapsedMs(task, now) / 60000, 0),
    draws: tasks.filter(isDrawTask).length,
  }
}

function getMetricUnit(metric: MetricKey, l: (zh: string, en: string) => string): string {
  if (metric === 'credits') return l('积分', 'pts')
  if (metric === 'duration') return l('分钟', 'min')
  return l('次', 'times')
}

function getChangePercent(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return 100
  return ((current - previous) / previous) * 100
}

function formatMetricValue(value: number, metric: MetricKey): string {
  if (metric === 'duration') {
    if (value === 0) return '0'
    if (value < 1) return value.toFixed(1)
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: metric === 'duration' ? 1 : 0 }).format(value)
}

function getTaskMetricValue(task: TaskListItemRead, metric: MetricKey, now: number, drawScope: DrawScope): number {
  if (metric === 'credits') return 0
  if (metric === 'duration') return getTaskElapsedMs(task, now) / 60000
  return isDrawTaskInScope(task, drawScope) ? 1 : 0
}

function buildTrend(tasks: TaskListItemRead[], range: DateRange, metric: MetricKey, now: number, drawScope: DrawScope) {
  const rangeDays = Math.max(1, Math.ceil((range.end - range.start) / 86400000))
  const bucketCount = rangeDays <= 2 ? 24 : Math.min(rangeDays, 30)
  const bucketSize = (range.end - range.start) / bucketCount
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = range.start + bucketSize * index
    const end = index === bucketCount - 1 ? range.end : start + bucketSize
    return {
      label: rangeDays <= 2 ? dayjs(start).format('HH:mm') : dayjs(start).format('MM/DD'),
      start,
      end,
      value: 0,
    }
  })

  tasks.forEach((task) => {
    const timestamp = getTaskTimestampMs(task)
    const bucket = buckets.find((item) => timestamp >= item.start && timestamp <= item.end)
    if (!bucket) return
    bucket.value += getTaskMetricValue(task, metric, now, drawScope)
  })

  return buckets
}

function groupTasks(
  tasks: TaskListItemRead[],
  metric: MetricKey,
  now: number,
  drawScope: DrawScope,
  mode: 'project' | 'member' | 'kind',
  l: (zh: string, en: string) => string,
): GroupRow[] {
  const map = new Map<string, GroupRow>()
  tasks.forEach((task) => {
    const value = getTaskMetricValue(task, metric, now, drawScope)
    if (value <= 0) return
    const label =
      mode === 'member'
        ? l('当前账号', 'Current account')
        : mode === 'kind'
          ? resolveTaskTitle(task.task_kind)
          : resolveTaskSourceLabel(task.relation_type, task.relation_entity_id) ?? l('未关联项目', 'Unlinked project')
    const key = `${mode}:${label}`
    const current = map.get(key)
    if (current) {
      current.value += value
    } else {
      map.set(key, { key, label, value })
    }
  })
  return Array.from(map.values()).sort((first, second) => second.value - first.value).slice(0, 8)
}

function downloadCsv(tasks: TaskListItemRead[], l: (zh: string, en: string) => string) {
  const headers = [
    'task_id',
    'task_kind',
    'title',
    'status',
    'progress',
    'started_at',
    'finished_at',
    'elapsed_minutes',
    'relation_type',
    'relation_entity_id',
  ]
  const rows = tasks.map((task) => [
    task.task_id,
    task.task_kind,
    resolveTaskTitle(task.task_kind),
    task.status,
    String(task.progress ?? 0),
    task.started_at_ts ? new Date(task.started_at_ts * 1000).toISOString() : '',
    task.finished_at_ts ? new Date(task.finished_at_ts * 1000).toISOString() : '',
    task.elapsed_ms ? String((task.elapsed_ms / 60000).toFixed(2)) : '',
    task.relation_type ?? '',
    task.relation_entity_id ?? '',
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `efficiency-overview-${dayjs().format('YYYYMMDD-HHmmss')}.csv`
  link.click()
  URL.revokeObjectURL(url)
  message.success(l('已导出当前筛选数据', 'Current filtered data exported'))
}

const EfficiencyOverview: React.FC = () => {
  const l = useBilingualText()
  const navigate = useNavigate()
  const [metric, setMetric] = useState<MetricKey>('credits')
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d')
  const [drawScope, setDrawScope] = useState<DrawScope>('video')
  const [customRange, setCustomRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [tasks, setTasks] = useState<TaskListItemRead[]>([])
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const dateRange = useMemo(() => buildDateRange(rangeKey, customRange, l), [customRange, l, rangeKey])
  const previousRange = useMemo(() => getPreviousRange(dateRange), [dateRange])
  const selectedTasks = useMemo(() => filterTasksByRange(tasks, dateRange), [dateRange, tasks])
  const previousTasks = useMemo(() => filterTasksByRange(tasks, previousRange), [previousRange, tasks])
  const summary = useMemo(() => summarizeTasks(selectedTasks, now), [now, selectedTasks])
  const previousSummary = useMemo(() => summarizeTasks(previousTasks, now), [now, previousTasks])
  const trend = useMemo(() => buildTrend(selectedTasks, dateRange, metric, now, drawScope), [dateRange, drawScope, metric, now, selectedTasks])
  const trendHasData = trend.some((item) => item.value > 0)
  const projectRows = useMemo(() => groupTasks(selectedTasks, metric, now, drawScope, 'project', l), [drawScope, l, metric, now, selectedTasks])
  const memberRows = useMemo(() => groupTasks(selectedTasks, metric, now, drawScope, 'member', l), [drawScope, l, metric, now, selectedTasks])
  const kindRows = useMemo(() => groupTasks(selectedTasks, metric, now, drawScope, 'kind', l), [drawScope, l, metric, now, selectedTasks])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const seconds = Math.max(300, Math.ceil((Date.now() - previousRange.start) / 1000))
    setLoading(true)
    void FilmService.listTasksApiV1FilmTasksGet({
      recentSeconds: seconds,
      page: 1,
      pageSize: 200,
    })
      .then((response) => {
        if (cancelled) return
        setTasks(response.data?.items ?? [])
      })
      .catch(() => {
        if (cancelled) return
        setTasks([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [previousRange.start])

  const metricTabs = [
    { key: 'credits' as const, label: l('积分消耗', 'Credits') },
    { key: 'duration' as const, label: l('生成时长', 'Duration') },
    { key: 'draws' as const, label: l('抽卡次数', 'Draws') },
  ]
  const rangeTabs = [
    { key: 'today' as const, label: l('今日', 'Today') },
    { key: 'yesterday' as const, label: l('昨日', 'Yesterday') },
    { key: '7d' as const, label: l('近7天', 'Last 7 days') },
    { key: '30d' as const, label: l('近30天', 'Last 30 days') },
  ]
  const customRangeLabel =
    customRange?.[0] && customRange?.[1]
      ? `${customRange[0].format('MM/DD')}-${customRange[1].format('MM/DD')}`
      : l('自定义', 'Custom')
  const drawTabs = [
    { key: 'video' as const, label: l('片段编辑-视频抽卡', 'Clip edit - video draws') },
    { key: 'image' as const, label: l('片段编辑-图片抽卡', 'Clip edit - image draws') },
    { key: 'asset' as const, label: l('提取资产-图片抽卡', 'Asset extraction - image draws') },
  ]

  const trendTitle =
    metric === 'credits'
      ? l('消耗趋势', 'Consumption trend')
      : metric === 'duration'
        ? l('生成时长趋势', 'Generation duration trend')
        : l('抽卡趋势', 'Draw trend')
  const projectTitle =
    metric === 'credits'
      ? l('项目消耗', 'Project consumption')
      : metric === 'duration'
        ? l('项目生成时长', 'Project generation duration')
        : l('项目抽卡数', 'Project draws')
  const thirdTitle =
    metric === 'credits'
      ? l('消耗分布', 'Consumption distribution')
      : metric === 'duration'
        ? l('成员生成时长', 'Member generation duration')
        : l('成员抽卡数', 'Member draws')
  const thirdRows = metric === 'credits' ? kindRows : memberRows

  return (
    <main className="efficiency-overview">
      <button
        type="button"
        className="efficiency-overview__close"
        aria-label={l('关闭', 'Close')}
        onClick={() => {
          if (window.history.length > 1) navigate(-1)
          else navigate('/projects', { replace: true })
        }}
      >
        <X size={18} strokeWidth={1.75} />
      </button>

      <section className="efficiency-overview__hero">
        <div>
          <h1>{l('AI制剧效能总览', 'AI production efficiency overview')}</h1>
          <p>{l('监控生产效率与资源消耗，非实时数据，约1小时延迟', 'Track production efficiency and resource usage with about a one-hour reporting delay')}</p>
        </div>
        <div className="efficiency-overview__actions">
          <div className="efficiency-overview__range-tabs" role="tablist" aria-label={l('时间范围', 'Date range')}>
            {rangeTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                className={rangeKey === item.key ? 'is-active' : ''}
                onClick={() => {
                  setCustomRange(null)
                  setRangeKey(item.key)
                }}
              >
                {item.label}
              </button>
            ))}
            <span
              className={[
                'efficiency-overview__custom-range-trigger',
                rangeKey === 'custom' ? 'is-active' : '',
                customRange?.[0] && customRange?.[1] ? 'has-value' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="efficiency-overview__custom-range-label">{customRangeLabel}</span>
              <RangePicker
                size="small"
                className="efficiency-overview__custom-range"
                onChange={(dates) => {
                  setCustomRange(dates ? [dates[0], dates[1]] : null)
                  setRangeKey('custom')
                }}
              />
            </span>
          </div>
          <Button
            className="efficiency-overview__export"
            icon={<Download size={15} strokeWidth={1.75} />}
            onClick={() => downloadCsv(selectedTasks, l)}
          >
            {l('导出', 'Export')}
          </Button>
        </div>
      </section>

      <section className="efficiency-overview__stats">
        <MetricCard
          label={l('消耗积分', 'Credits used')}
          value={formatMetricValue(summary.credits, 'credits')}
          unit={l('积分', 'pts')}
          change={getChangePercent(summary.credits, previousSummary.credits)}
          icon={<Gem size={24} strokeWidth={1.6} />}
        />
        <MetricCard
          label={l('生成时长', 'Generation duration')}
          value={formatMetricValue(summary.durationMinutes, 'duration')}
          unit={l('分钟', 'min')}
          change={getChangePercent(summary.durationMinutes, previousSummary.durationMinutes)}
          icon={<Clock3 size={24} strokeWidth={1.6} />}
        />
        <MetricCard
          label={l('抽卡次数', 'Draw count')}
          value={formatMetricValue(summary.draws, 'draws')}
          unit={l('次', 'times')}
          change={getChangePercent(summary.draws, previousSummary.draws)}
          icon={<Sparkles size={24} strokeWidth={1.6} />}
        />
      </section>

      <div className="efficiency-overview__metric-tabs" role="tablist" aria-label={l('指标', 'Metric')}>
        {metricTabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={metric === item.key ? 'is-active' : ''}
            onClick={() => setMetric(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {metric === 'draws' ? (
        <div className="efficiency-overview__draw-tabs" role="tablist" aria-label={l('抽卡类型', 'Draw type')}>
          {drawTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              className={drawScope === item.key ? 'is-active' : ''}
              onClick={() => setDrawScope(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <section className="efficiency-overview__panel efficiency-overview__panel--trend">
        <PanelHeader title={trendTitle} suffix={dateRange.label} />
        {loading ? (
          <div className="efficiency-overview__panel-loading"><Spin /></div>
        ) : trendHasData ? (
          <TrendChart items={trend} metric={metric} l={l} />
        ) : (
          <EmptyState />
        )}
      </section>

      <section className="efficiency-overview__panel">
        <PanelHeader title={projectTitle} />
        {loading ? (
          <div className="efficiency-overview__panel-loading"><Spin /></div>
        ) : projectRows.length > 0 ? (
          <RankList rows={projectRows} metric={metric} l={l} />
        ) : (
          <EmptyState />
        )}
      </section>

      <section className="efficiency-overview__panel">
        <PanelHeader title={thirdTitle} />
        {loading ? (
          <div className="efficiency-overview__panel-loading"><Spin /></div>
        ) : thirdRows.length > 0 ? (
          <RankList rows={thirdRows} metric={metric} l={l} />
        ) : (
          <EmptyState />
        )}
      </section>
    </main>
  )
}

function MetricCard({
  label,
  value,
  unit,
  change,
  icon,
}: {
  label: string
  value: string
  unit: string
  change: number | null
  icon: React.ReactNode
}) {
  const improved = change == null || change >= 0
  return (
    <article className="efficiency-overview__metric-card">
      <div className="efficiency-overview__metric-label">{label}</div>
      <div className="efficiency-overview__metric-value">
        <strong>{value}</strong>
        <span>{unit}</span>
        {change == null ? (
          <small>-</small>
        ) : (
          <small className={improved ? 'is-positive' : 'is-negative'}>
            {improved ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(change).toFixed(1)}%
          </small>
        )}
      </div>
      <div className="efficiency-overview__metric-orb">{icon}</div>
    </article>
  )
}

function PanelHeader({ title, suffix }: { title: string; suffix?: string }) {
  return (
    <header className="efficiency-overview__panel-header">
      <h2>{title}</h2>
      {suffix ? <span>{suffix}</span> : null}
    </header>
  )
}

function EmptyState() {
  return (
    <div className="efficiency-overview__empty">
      <PackageOpen size={42} strokeWidth={1.5} />
      <span>暂无内容</span>
    </div>
  )
}

function TrendChart({
  items,
  metric,
  l,
}: {
  items: Array<{ label: string; value: number }>
  metric: MetricKey
  l: (zh: string, en: string) => string
}) {
  const max = Math.max(...items.map((item) => item.value), 1)
  return (
    <div className="efficiency-overview__trend">
      {items.map((item) => (
        <div key={item.label} className="efficiency-overview__trend-item">
          <div className="efficiency-overview__trend-bar-wrap">
            <div
              className="efficiency-overview__trend-bar"
              style={{ height: `${Math.max(6, (item.value / max) * 100)}%` }}
              title={`${item.label}: ${formatMetricValue(item.value, metric)} ${getMetricUnit(metric, l)}`}
            />
          </div>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

function RankList({
  rows,
  metric,
  l,
}: {
  rows: GroupRow[]
  metric: MetricKey
  l: (zh: string, en: string) => string
}) {
  const max = Math.max(...rows.map((row) => row.value), 1)
  return (
    <div className="efficiency-overview__rank">
      {rows.map((row) => (
        <div key={row.key} className="efficiency-overview__rank-row">
          <div className="efficiency-overview__rank-label">
            <Activity size={14} strokeWidth={1.75} />
            <span>{row.label}</span>
          </div>
          <div className="efficiency-overview__rank-track">
            <div style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
          </div>
          <strong>{formatMetricValue(row.value, metric)} {getMetricUnit(metric, l)}</strong>
        </div>
      ))}
    </div>
  )
}

export default EfficiencyOverview
