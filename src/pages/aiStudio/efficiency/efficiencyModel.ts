import type { EfficiencyComparison, EfficiencyMetric, EfficiencyRange, EfficiencyDrawScope, EfficiencyCoverageReason, EfficiencyMeta, EfficiencyBucket } from '../../../services/efficiencyGenerated'

/** Pure helpers accept the UI translator, keeping contract logic independent of React. */
type BilingualText = (zh: string, en: string) => string
const chineseText: BilingualText = (zh) => zh

export type CommonFilters = { range: EfficiencyRange; startDate?: string; endDate?: string; projectId?: number; memberId?: number; snapshotId?: string }
type RankingDrill = { groupBy: 'project' | 'member'; groupKey: string; operationCode?: never } | { operationCode: string; groupBy?: never; groupKey?: never }

export type DrillFilter = RankingDrill | { modelGroup: 'video' | 'image' | 'other'; modelKey?: string; groupBy?: never; groupKey?: never; operationCode?: never }

/** Send only documented combinations; summary/distribution use the common filters directly. */
export function metricQuery(filters: CommonFilters, metric: EfficiencyMetric, drawScope: EfficiencyDrawScope) {
  return { ...filters, metric, ...(metric === 'draws' ? { drawScope } : {}) }
}

/** Records and export share exactly the same contribution filters, excluding pagination. */
export function detailQuery(filters: CommonFilters, metric: EfficiencyMetric, drawScope: EfficiencyDrawScope, drill?: DrillFilter) {
  return { ...metricQuery(filters, metric, drawScope), ...(drill && ('modelGroup' in drill || drill.operationCode) ? (metric === 'credits' ? drill : {}) : drill) }
}

/** Share Shanghai's current calendar day between the picker and range validation. */
export function shanghaiToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Validate inclusive Shanghai calendar dates, independent of the browser's timezone. */
export function validateDates(startDate: string, endDate: string, now = new Date(), l: BilingualText = chineseText): string | undefined {
  const today = shanghaiToday(now)
  const start = Date.parse(startDate + 'T00:00:00Z'), end = Date.parse(endDate + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0, 10) !== startDate || new Date(end).toISOString().slice(0, 10) !== endDate) return l("请选择有效日期", "Please select valid dates")
  if (end < start) return l("结束日期不能早于开始日期", "The end date cannot precede the start date")
  if ((end - start) / 86400000 + 1 > 366) return l("日期范围最多为 366 天", "The date range cannot exceed 366 days")
  if (endDate > today) return l("不能选择晚于上海今天的日期", "Dates after today in Shanghai cannot be selected")
  return undefined
}

/** Keep server comparison semantics; never invent a percentage for zero or partial baselines. */
export function comparisonText(value: EfficiencyComparison, l: BilingualText = chineseText): string {
  if (value.changeState === 'new') return l("新增", "New")
  if (value.changeState === 'noData') return l("暂无变化数据", "No comparison data")
  if (value.changeState === 'unavailable') return l("暂不可比较", "Comparison unavailable")
  if (value.changeState === 'unchanged') return l("持平", "Unchanged")
  if (value.changePercent === null || !Number.isFinite(value.changePercent)) return l("暂不可比较", "Comparison unavailable")
  return `${value.changePercent > 0 ? '+' : ''}${value.changePercent.toFixed(2)}%`
}

/** Duration always uses minutes so cards, prior values, charts and records remain comparable. */
export function formatMetric(value: number | null | undefined, metric: EfficiencyMetric): string {
  if ((value === null || value === undefined) || !Number.isFinite(value)) return '—'
  const display = metric === 'duration' ? value / 60000 : value
  if (display > 0 && display < 0.01 && metric === 'duration') return '<0.01'
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: metric === 'credits' ? 2 : 0, maximumFractionDigits: metric === 'draws' ? 0 : 2 }).format(display)
}

/** Unwrap Java business errors even when transport HTTP status is successful. */
export function unwrapEfficiency<T>(response: { code: number; message: string; data: T }): T {
  if (response.code !== 200 || (response.data === null || response.data === undefined)) throw { body: response, message: response.message || '统计响应无效' }
  return response.data
}

/** Use backend messages and structured codes rather than mistaking business code 502 for HTTP status. */
export function efficiencyError(error: unknown, l: BilingualText = chineseText): string {
  const value = error as { message?: string; status?: number; body?: { message?: string; data?: { errorCode?: string } | null } }
  const rawMessage = value?.body?.message || value?.message
  const message = rawMessage === '统计响应无效' ? l('统计响应无效', 'Invalid statistics response') : rawMessage === '导出失败：未收到有效 CSV 文件' ? l('导出失败：未收到有效 CSV 文件', 'Export failed: no valid CSV file received') : rawMessage || l("统计加载失败，请重试", "Failed to load statistics. Please retry.")
  const code = value?.body?.data?.errorCode
  if (code === 'SNAPSHOT_EXPIRED' || value?.status === 410) return l('统计快照已过期，请整页刷新。', 'This statistics snapshot has expired. Refresh the entire view.')
  if (code === 'SNAPSHOT_INVALID' || code === 'SNAPSHOT_SCOPE_MISMATCH' || value?.status === 409) return l('统计快照与当前范围不一致，请整页刷新。', 'The snapshot does not match this view. Refresh the entire view.')
  if (code === 'SNAPSHOT_LIMIT') return l('有效统计快照已达上限，请等待现有快照到期后重试。', 'The active snapshot limit has been reached. Wait for an existing snapshot to expire before retrying.')
  if (code === 'SNAPSHOT_TOO_LARGE') return l('统计范围超过快照容量，请缩小日期或项目范围。', 'This scope exceeds the snapshot capacity. Narrow the date or project filters.')
  if (code === 'STATISTICS_NOT_READY') {
    const readiness = (error as { body?: { data?: { readiness?: { status?: string; retryable?: boolean; failureCode?: string } } } }).body?.data?.readiness
    const status = readiness?.status
    const labels: Record<string, string> = { pending: l('等待统计回填', 'Statistics backfill is pending'), running: l('统计回填进行中', 'Statistics backfill is running'), failed: l('统计回填失败', 'Statistics backfill failed'), missingMigration: l('统计数据库迁移尚未完成', 'Statistics database migration is incomplete') }
    if (status && labels[status]) return `${labels[status]}${readiness?.retryable === false ? l('，请联系管理员。', '. Contact an administrator.') : l('，请稍后刷新。', '. Refresh later.')}${readiness?.failureCode ? ` (${readiness.failureCode})` : ''}`
    return `${l('统计尚未就绪，迁移或历史回填未完成。', 'Statistics are not ready: migration or historical backfill is incomplete. ')}${message}`
  }
  if (code === 'EXPORT_TOO_LARGE') return `${l('导出超过 100000 条，请缩小筛选范围。', 'The export exceeds 100,000 records. Narrow your filters. ')}${message}`
  if (code === 'EFFICIENCY_FORBIDDEN' || value?.status === 403) return `${l('没有查询或导出权限。', 'You do not have permission to query or export. ')}${message}`
  if (value?.status === 401) return l("登录已过期，请重新登录", "Your session has expired. Please sign in again.")
  return message
}

/** Localize coverage codes at render time, including an already-open detail drawer. */
export function getCoverageWarningText(l: BilingualText = chineseText): Record<string, string> { return {
  HISTORICAL_DATA_MAY_BE_INCOMPLETE: l("上线前历史数据可能不完整", "Historical data from before launch may be incomplete"), MISSING_DURATION: l("部分任务缺少有效耗时，未计入统计", "Some tasks lack valid durations and are excluded from duration statistics"),
  ESTIMATED_DURATION: l("部分历史耗时为估算值", "Some historical durations are estimated"), UNKNOWN_PROJECT: l("部分记录项目归属未知", "Some records have no known project"), UNKNOWN_MEMBER: l("部分记录成员归属未知", "Some records have no known member"),
} }

/** Use backend project identity and permission, never a relation label or project owner guess. */
export function projectHref(project: { id?: number | null; projectId?: number | null; entityState: string; canNavigate: boolean }): string | undefined {
  const id = project.projectId ?? project.id
  return project.canNavigate && project.entityState === 'active' && id !== null && id !== undefined && Number.isSafeInteger(id) && id > 0
    ? `/projects/create?scriptImportId=${encodeURIComponent(String(id))}` : undefined
}

/** Snapshot failures must renew the whole view, never a single chart's snapshot. */
export function isSnapshotInvalid(error: unknown): boolean {
  const value = error as { status?: number; body?: { data?: { errorCode?: string } } }
  return value?.status === 409 || value?.status === 410 || ['SNAPSHOT_EXPIRED', 'SNAPSHOT_INVALID', 'SNAPSHOT_SCOPE_MISMATCH'].includes(value?.body?.data?.errorCode ?? '')
}

export type CoverageIssue = EfficiencyCoverageReason & { period: 'current' | 'previous' }
/** De-duplicate endpoint diagnostics without merging current and comparison periods. */
export function coverageIssues(metas: EfficiencyMeta[], metric?: EfficiencyMetric, impact?: 'metric' | 'attribution'): CoverageIssue[] {
  const result = new Map<string, CoverageIssue>()
  for (const meta of metas) for (const period of ['current', 'previous'] as const) {
    for (const reason of meta.coverage[period]?.reasons ?? []) {
      if ((!metric || reason.affectedMetrics.includes(metric)) && (!impact || reason.impact === impact)) result.set(period + ':' + reason.id, { ...reason, period })
    }
  }
  return [...result.values()]
}

/** Fill missing plot values only for display; never overwrite the backend's known contribution. */
export function trendDisplayValue(bucket: Pick<EfficiencyBucket, 'plotValue'>): number {
  return bucket.plotValue !== null && Number.isFinite(bucket.plotValue) ? bucket.plotValue : 0
}
