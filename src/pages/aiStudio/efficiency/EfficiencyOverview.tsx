import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, DatePicker, Drawer, Empty, Select, Space, Spin, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Clock3, Download, Gem, RefreshCw, Sparkles, X } from 'lucide-react'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { getAuthUserView, getStoredAuthUser } from '../../../auth'
import { useEfficiencyLabels } from './useEfficiencyLabels'
import { EfficiencyService as api } from '../../../services/efficiencyGenerated'
import type { EfficiencyMetric, EfficiencyDrawScope, EfficiencyMeta, EfficiencyComparison, EfficiencyRankings, EfficiencyRecord } from '../../../services/efficiencyGenerated'
import type { CancelablePromise } from '../../../services/generated'
import { coverageIssues, detailQuery, efficiencyError, formatMetric, metricQuery, projectHref, shanghaiToday, validateDates } from './efficiencyModel'
import type { CommonFilters, DrillFilter } from './efficiencyModel'
import { useEfficiencyResource } from './useEfficiencyResource'
import type { EfficiencyResource } from './useEfficiencyResource'
import { EfficiencyMemberChart, EfficiencyTrendChart } from './EfficiencyCharts'
import { EfficiencyCoverageNotice } from './EfficiencyCoverageNotice'
import { EfficiencyModelChart } from './EfficiencyModelChart'
import './EfficiencyOverview.css'

type Details = { title?: string; metric: EfficiencyMetric; drill?: DrillFilter }

/** Load statistics on entry, filter changes or explicit refresh; never poll or create snapshots. */
export default function EfficiencyOverview() {
  const { l, units, titles, taskStatuses, billingStatuses } = useEfficiencyLabels()
  const navigate = useNavigate()
  const isAdmin = getAuthUserView(getStoredAuthUser()).isAdmin
  const [filters, setFilters] = useState<CommonFilters>({ range: '7d' })
  const [filterNames, setFilterNames] = useState<{ project?: string; member?: string }>({})
  const [metric, setMetric] = useState<EfficiencyMetric>('credits')
  const [drawScope, setDrawScope] = useState<EfficiencyDrawScope>('all')
  const [refresh, setRefresh] = useState(0)
  const [details, setDetails] = useState<Details | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [invalidDates, setInvalidDates] = useState<[string, string]>()
  const dateError = invalidDates ? validateDates(...invalidDates, new Date(), l) : undefined
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>()
  const exportRequest = useRef<CancelablePromise<Blob> | null>(null)
  const viewFilters = filters
  const commonKey = JSON.stringify([viewFilters, refresh])
  const query = metricQuery(viewFilters, metric, drawScope)
  const metricKey = JSON.stringify([query, refresh])
  const summary = useEfficiencyResource(commonKey, () => api.getSummary(viewFilters))
  const trend = useEfficiencyResource(metricKey, () => api.getTrend({ ...query, granularity: 'auto' }))
  const projects = useEfficiencyResource(metricKey, () => api.getRankings({ ...query, groupBy: 'project', limit: 8 }))
  const members = useEfficiencyResource(metricKey, () => api.getRankings({ ...query, groupBy: 'member', limit: 8 }))
  const distribution = useEfficiencyResource(commonKey, () => api.getDistribution(viewFilters))
  const models = useEfficiencyResource(commonKey, () => api.getModelDistribution(viewFilters))
  const recordQuery = detailQuery(viewFilters, details?.metric ?? metric, drawScope, details?.drill)
  const recordKey = details ? JSON.stringify([recordQuery, page, pageSize, refresh]) : null
  const records = useEfficiencyResource(recordKey, () => api.getRecords({ ...recordQuery, page, pageSize }))
  const exportContext = JSON.stringify([viewFilters, metric, drawScope, details, refresh])

  useEffect(() => {
    setExporting(false)
    setExportError(undefined)
    return () => { exportRequest.current?.cancel(); exportRequest.current = null }
  }, [exportContext])

  /** Reset pagination and drilling whenever the common scope changes. */
  const changeFilters = (next: CommonFilters) => { setFilters(next); setPage(1); setDetails(null); setInvalidDates(undefined) }
  /** Keep metric-specific drill filters from leaking into another metric. */
  const changeMetric = (next: EfficiencyMetric) => { setMetric(next); setPage(1); setDetails(null) }
  /** A drill always starts at the first contribution page. */
  const openDetails = (next: Details) => { setDetails(next); setPage(1) }
  /** Download all matching rows through the generated endpoint, never the current table page. */
  const download = async (selection: ReturnType<typeof detailQuery>) => {
    if (exportRequest.current) return
    setExportError(undefined); setExporting(true)
    const pending = api.getExport(selection)
    exportRequest.current = pending
    try {
      const blob = await pending
      if (exportRequest.current !== pending) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = blob instanceof File ? blob.name : 'efficiency-overview.csv'
      document.body.appendChild(link)
      try { link.click() } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000) }
      message.success(l("已下载全部匹配明细", "All matching records downloaded"))
    } catch (error) {
      if (exportRequest.current === pending) setExportError(error)
    } finally {
      if (exportRequest.current === pending) { exportRequest.current = null; setExporting(false) }
    }
  }
  /** Use a ranking's real ID as a common filter while retaining the visible snapshot name. */
  const filterRanking = (group: 'project' | 'member', id: number, name: string) => {
    changeFilters({ ...filters, ...(group === 'project' ? { projectId: id } : { memberId: id }) })
    setFilterNames((previous) => ({ ...previous, [group]: name }))
  }
  const retry = () => setRefresh((value) => value + 1)
  const columns: ColumnsType<EfficiencyRecord> = [
    { title: l("任务", "Task"), dataIndex: 'taskId', width: 100 },
    { title: l("项目", "Project"), width: 160, render: (_, row) => {
      const href = projectHref(row)
      return href ? <Button type="link" onClick={() => navigate(href)}>{row.projectName || l("项目", "Project")}</Button> : row.projectName || l("归属未知", "Unknown project")
    } },
    { title: l("成员", "Member"), dataIndex: 'memberName', render: (value: string | null) => value || l("成员未知", "Unknown member"), width: 120 },
    { title: l("业务", "Operation"), dataIndex: 'operationCode', width: 150 },
    { title: l('供应商', 'Supplier'), dataIndex: 'supplierName', render: (value: string | null) => value || '—', width: 140 },
    { title: l("模型", "Model"), dataIndex: 'modelName', render: (value: string | null) => value || '—', width: 150 },
    { title: l("任务状态", "Task status"), dataIndex: 'taskStatus', render: (value: number) => taskStatuses[value] || l("未知", "Unknown"), width: 130 },
    { title: l("账单状态", "Billing status"), dataIndex: 'billingStatus', render: (value: number | null) => value === null ? l("无账单", "No billing record") : billingStatuses[value] || l("未知", "Unknown"), width: 110 },
    { title: `${titles[details?.metric ?? metric]}（${units[details?.metric ?? metric]}）`, dataIndex: 'metricValue', render: (value: number) => formatMetric(value, details?.metric ?? metric), width: 150 },
    { title: l("实际积分", "Actual credits"), dataIndex: 'actualCredits', render: (value: number | null) => formatMetric(value, 'credits'), width: 110 },
    { title: l("耗时（分钟）", "Duration (min)"), render: (_, row) => `${formatMetric(row.durationMs, 'duration')}${row.durationQuality === 'estimated' ? l("（估算）", " (estimated)") : ''}`, width: 140 },
    { title: l("统计时间（上海）", "Event time (Shanghai)"), dataIndex: 'eventAt', render: (value: string) => shanghaiTime(value), width: 200 },
  ]
  const rangeLabel = filters.range === 'custom' ? `${filters.startDate} — ${filters.endDate}` : ({ today: l("今日", "Today"), yesterday: l("昨日", "Yesterday"), '7d': l("近7天", "Last 7 days"), '30d': l("近30天", "Last 30 days") } as const)[filters.range]
  const coverageMetas = [summary.data?.meta, trend.data?.meta, projects.data?.meta, members.data?.meta, distribution.data?.meta, models.data?.meta].filter((meta): meta is EfficiencyMeta => Boolean(meta))
  const hasCoverageWarning = coverageIssues(coverageMetas).length > 0
  return <main className="efficiency-overview">
    <button type="button" className="efficiency-overview__close" aria-label={l('关闭', 'Close')} onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/projects', { replace: true })}><X size={18} /></button>
    <section className="efficiency-overview__hero">
      <div><h1>{l('AI制剧效能总览', 'AI production efficiency overview')}</h1><p>{l("监控生产效率与资源消耗", "Monitor production efficiency and resource usage")}</p></div>
      <div className="efficiency-overview__actions">
        <div className="efficiency-overview__range-tabs" role="tablist" aria-label={l("时间范围", "Date range")}>
          {(['today', 'yesterday', '7d', '30d'] as const).map((range, index) => <button type="button" role="tab" aria-selected={filters.range === range} key={range} className={filters.range === range ? 'is-active' : ''} onClick={() => changeFilters({ ...filters, range, startDate: undefined, endDate: undefined })}>{[l("今日", "Today"), l("昨日", "Yesterday"), l("近7天", "Last 7 days"), l("近30天", "Last 30 days")][index]}</button>)}
          <span className={`efficiency-overview__custom-range-trigger ${filters.range === 'custom' ? 'is-active has-value' : ''}`}>
            <span className="efficiency-overview__custom-range-label">{filters.range === 'custom' ? `${filters.startDate?.slice(5)}–${filters.endDate?.slice(5)}` : l("自定义", "Custom")}</span>
        <DatePicker.RangePicker className="efficiency-overview__custom-range" aria-label={l("自定义时间范围", "Custom date range")} size="small" disabledDate={(date) => date.format('YYYY-MM-DD') > shanghaiToday()} value={filters.range === 'custom' ? [dayjs(filters.startDate), dayjs(filters.endDate)] : null} onChange={(dates) => {
          if (!dates?.[0] || !dates[1]) { changeFilters({ ...filters, range: '7d', startDate: undefined, endDate: undefined }); return }
          const startDate = dates[0].format('YYYY-MM-DD'), endDate = dates[1].format('YYYY-MM-DD')
          const error = validateDates(startDate, endDate, new Date(), l)
          if (error) { setInvalidDates([startDate, endDate]); return }
          changeFilters({ ...filters, range: 'custom', startDate, endDate })
        }} />
          </span>
        </div>
        <Button className="efficiency-overview__refresh" aria-label={l("刷新统计", "Refresh statistics")} title={l("刷新统计", "Refresh statistics")} icon={<RefreshCw size={14} />} onClick={retry} />
        <Button className="efficiency-overview__export" icon={<Download size={15} />} loading={exporting} onClick={() => void download(detailQuery(viewFilters, metric, drawScope))}>{l("导出", "Export")}</Button>
      </div>
    </section>
    {(filters.projectId || filters.memberId) && <Space className="efficiency-overview__filters">
      {filters.projectId && <Tag closable onClose={() => changeFilters({ ...filters, projectId: undefined })}>{l("项目：", "Project: ")}{filterNames.project || filters.projectId}</Tag>}
      {filters.memberId && <Tag closable onClose={() => changeFilters({ ...filters, memberId: undefined })}>{l("成员：", "Member: ")}{filterNames.member || filters.memberId}</Tag>}
    </Space>}
    {dateError && <Alert type="warning" showIcon message={dateError} />}
    {exportError !== undefined && <Alert type="error" showIcon message={efficiencyError(exportError, l)} />}
    <Resource state={summary} retry={retry}>{(data) => <section className="efficiency-overview__stats">
      <MetricCard meta={data.meta} label={l("消耗积分", "Credits used")} metric="credits" comparison={data.credits} icon={<Gem size={26} />} />
      <MetricCard meta={data.meta} label={l("生成时长", "Generation time")} metric="duration" comparison={data.duration} icon={<Clock3 size={26} />} />
      <MetricCard meta={data.meta} label={l("抽卡次数", "Generations")} metric="draws" comparison={data.draws} icon={<Sparkles size={26} />} />
    </section>}</Resource>
    <div className="efficiency-overview__metric-tabs" role="tablist" aria-label={l("指标", "Metric")}>
      {(['credits', 'duration', 'draws'] as const).map((key) => <button type="button" role="tab" aria-selected={metric === key} key={key} className={metric === key ? 'is-active' : ''} onClick={() => changeMetric(key)}>{titles[key]}</button>)}
    </div>
    {metric === 'draws' && <div className="efficiency-overview__draw-tabs" role="tablist" aria-label={l("抽卡类型", "Generation type")}>
      {(['all', 'video', 'image', 'asset'] as const).map((key, index) => <button type="button" role="tab" aria-selected={drawScope === key} key={key} className={drawScope === key ? 'is-active' : ''} onClick={() => { setDrawScope(key); setPage(1); setDetails(null) }}>{[l("全部", "All"), l("视频", "Video"), l("分镜图片", "Storyboard images"), l("资产图片", "Asset images")][index]}</button>)}
    </div>}
    <details className={`efficiency-overview__data-note${hasCoverageWarning ? ' has-warning' : ''}`}>
      <summary>{hasCoverageWarning ? l('统计覆盖与归属提示 · 查看说明', 'Coverage and attribution notes · View details') : l("统计说明", "Statistics notes")}{summary.data && <span>{l("更新于", "Updated at")} {shanghaiTime(summary.data.meta.generatedAt)}</span>}</summary>
      <EfficiencyCoverageNotice metas={coverageMetas} />
      <p>{l("上海时间统计。积分按结算时间；耗时为已结束任务自身执行阶段的累计时间，包含供应商等待；抽卡按创建时间，顶部卡片统计全部类型。", "Statistics use Shanghai time. Credits are counted by settlement time; duration is the cumulative execution time of finished tasks, including provider wait time; generations are counted by creation time. The summary card includes all generation types.")}</p>
      {summary.data && <p>{l(`待结算 ${summary.data.quality.pendingBillingCount} 笔（非已消费积分） · 缺少耗时 ${summary.data.quality.missingDurationCount} 笔 · 估算耗时 ${summary.data.quality.estimatedDurationCount} 笔。抽卡：视频 ${summary.data.drawBreakdown.video} / 分镜图片 ${summary.data.drawBreakdown.image} / 资产图片 ${summary.data.drawBreakdown.asset}。`, `Pending settlement: ${summary.data.quality.pendingBillingCount} (not spent credits) · Missing durations: ${summary.data.quality.missingDurationCount} · Estimated durations: ${summary.data.quality.estimatedDurationCount}. Generations: video ${summary.data.drawBreakdown.video} / storyboard images ${summary.data.drawBreakdown.image} / asset images ${summary.data.drawBreakdown.asset}.`)}</p>}
      {summary.data && <p>{l(`缺少账单 ${summary.data.quality.missingBillingCount} 条 · 未知模型 ${summary.data.quality.unknownModelCount} 条；未知归属仍保留已知贡献。`, `Missing billing records: ${summary.data.quality.missingBillingCount} · Unknown models: ${summary.data.quality.unknownModelCount}. Known contributions are retained when attribution is unknown.`)}</p>}
      <p>{l('数据在进入页面、切换筛选或手动刷新时更新，不自动更新。导出以下载时的数据为准。趋势标记 * 表示当前自然时间桶尚未结束；缺失数据在图中按 0 展示，不代表已确认零消耗。', 'Data loads when you open the page, change filters or refresh manually. It does not update automatically. Exports reflect data at download time. An asterisk (*) marks an ongoing calendar bucket; missing data is plotted as 0, not confirmed zero usage.')}</p>
    </details>
    <section className="efficiency-overview__panel efficiency-overview__panel--trend">
      <PanelHeader title={metric === 'credits' ? l("消耗趋势", "Usage trend") : l(`${titles[metric]}趋势`, `${titles[metric]} trend`)} action={<Space><span className="efficiency-overview__note">{rangeLabel}</span><Button className="efficiency-overview__subtle-action" type="link" size="small" onClick={() => openDetails({ metric })}>{l("明细", "Details")}</Button></Space>} />
      <Resource state={trend} retry={retry}>{(data) => <><EfficiencyCoverageNotice metas={[data.meta]} metric={metric} impact="metric" compact /><EfficiencyTrendChart data={data} /></>}</Resource>
    </section>
    <section className="efficiency-overview__panel efficiency-overview__panel--projects">
      <PanelHeader title={metric === 'credits' ? l("项目消耗", "Project usage") : metric === 'duration' ? l("项目生成时长", "Generation time by project") : l("项目抽卡数", "Generations by project")} />
      <Resource state={projects} retry={retry}>{(data) => <><EfficiencyCoverageNotice metas={[data.meta]} metric={metric} impact="attribution" compact /><RankList data={data} onDrill={(groupKey, name) => openDetails({ title: name, metric, drill: { groupBy: 'project', groupKey } })} /></>}</Resource>
    </section>
    <section className="efficiency-overview__panel efficiency-overview__panel--distribution">
      <PanelHeader title={metric === 'credits' ? l("消耗分布", "Usage distribution") : metric === 'duration' ? l("生成时长分布", "Generation time distribution") : l("抽卡分布", "Generation distribution")} />
      <div className="efficiency-overview__member-panel">
        <h3>{metric === 'credits' ? l("成员消耗", "Member usage") : metric === 'duration' ? l("成员生成时长", "Generation time by member") : l("成员抽卡数", "Generations by member")}</h3>
        <Resource state={members} retry={retry}>{(data) => <>
          <EfficiencyCoverageNotice metas={[data.meta]} metric={metric} impact="attribution" compact />
          <EfficiencyMemberChart data={data} onDrill={(groupKey, name) => openDetails({ title: name, metric, drill: { groupBy: 'member', groupKey } })} />
          <div className="efficiency-overview__chart-footer"><span>{l("合计", "Total")} {formatMetric(data.totalValue, metric)} {units[metric]}{data.otherValue > 0 ? ` · ${l('榜外其他', 'Other entries')} ${formatMetric(data.otherValue, metric)} ${units[metric]}` : ''}</span>
            {isAdmin && data.rows.some((row) => row.id !== null) && <Select size="small" className="efficiency-overview__member-filter" placeholder={l("筛选成员", "Filter members")} aria-label={l("筛选成员", "Filter members")} allowClear value={filters.memberId} options={data.rows.filter((row) => row.id !== null).map((row) => ({ value: row.id as number, label: row.name }))} onChange={(id: number | undefined) => id === undefined ? changeFilters({ ...filters, memberId: undefined }) : filterRanking('member', id, data.rows.find((row) => row.id === id)?.name ?? '')} />}
          </div>
        </>}</Resource>
      </div>
      {metric === 'credits' && <>
        <Resource state={models} retry={retry}>{(data) => <>
          <EfficiencyCoverageNotice metas={[data.meta]} metric="credits" impact="attribution" compact />
          <div className="efficiency-overview__model-grid">
            {(['video', 'image', 'other'] as const).map((code) => {
              const group = data.groups.find((value) => value.code === code)
              const label = code === 'video' ? l('生视频模型', 'Video models') : code === 'image' ? l('生图模型', 'Image models') : l('其他消耗', 'Other usage')
              return <section key={code} className={`efficiency-overview__model-panel efficiency-overview__model-panel--${code}`} aria-label={label}>
                <h3>{label}</h3>
                {group ? <EfficiencyModelChart group={group} onDrill={(modelKey, name) => openDetails({ title: name, metric: 'credits', drill: { modelGroup: code, ...(modelKey ? { modelKey } : {}) } })} /> : <Alert type="error" message={l('模型分组响应不完整，请重试。', 'The model group response is incomplete. Please retry.')} />}
              </section>
            })}
          </div>
        </>}</Resource>
        <details className="efficiency-overview__business-detail"><summary>{l("查看业务分类明细", "View usage by operation")}</summary>
          <Resource state={distribution} retry={retry}>{(data) => <><p className="efficiency-overview__note">{l(`已结算总计 ${formatMetric(data.totalCredits, 'credits')} 积分。以下为业务分类，不代表模型消费分布。`, `Settled total: ${formatMetric(data.totalCredits, 'credits')} credits. The breakdown below is by operation, not by model.`)}</p>
            <div className="efficiency-overview__categories">{data.categories.map((item) => <button type="button" key={item.code} onClick={() => openDetails({ title: item.name, metric: 'credits', drill: { operationCode: item.code } })}><span>{item.name}</span><strong>{formatMetric(item.credits, 'credits')}</strong><small>{finitePercent(item.sharePercent)}</small></button>)}</div>
          </>}</Resource>
        </details>
      </>}
    </section>
    <Drawer title={`${details?.title ?? titles[details?.metric ?? metric]} · ${l('贡献明细', 'Contribution details')}`} open={details !== null} width="min(1120px, 100vw)" onClose={() => { setDetails(null); setPage(1) }} extra={<Button loading={exporting} icon={<Download size={15} />} onClick={() => void download(recordQuery)}>{l("导出全部匹配明细", "Export all matching records")}</Button>}>
      {exportError !== undefined && <Alert type="error" message={efficiencyError(exportError, l)} showIcon />}
      <Resource state={records} retry={retry}>{(data) => <><EfficiencyCoverageNotice metas={[data.meta]} metric={details?.metric ?? metric} /><p>{l(`共 ${data.total} 条 · 全部页总计 ${formatMetric(data.totalValue, data.metric)} ${units[data.metric]}`, `${data.total} records · Total across all pages: ${formatMetric(data.totalValue, data.metric)} ${units[data.metric]}`)}</p>
        <Table<EfficiencyRecord> rowKey="recordKey" columns={columns} dataSource={data.items} scroll={{ x: 1570 }} pagination={{ current: page, pageSize, total: data.total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], onChange: (nextPage, nextSize) => { setPage(nextSize !== pageSize ? 1 : nextPage); setPageSize(nextSize) } }} />
      </>}</Resource>
    </Drawer>
  </main>
}

/** Each region distinguishes a failed response from a successful zero-value result. */
function Resource<T>({ state, retry, children }: { state: EfficiencyResource<T>; retry: () => void; children: (data: T) => ReactNode }) {
  const { l } = useEfficiencyLabels()
  const retryable = (state.cause as { body?: { data?: { readiness?: { retryable?: boolean } } } })?.body?.data?.readiness?.retryable !== false
  if (state.loading) return <div className="efficiency-overview__panel-loading"><Spin /></div>
  if (state.error) return <Alert type="error" showIcon message={efficiencyError(state.cause ?? { message: state.error }, l)} action={retryable ? <Button onClick={retry}>{l("重试", "Retry")}</Button> : undefined} />
  return state.data ? <>{children(state.data)}</> : null
}

/** Format timestamps in the contract timezone rather than the device timezone. */
function shanghaiTime(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.valueOf()) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date) : '—'
}

/** Avoid displaying non-finite percentages, preserving the server's denominator. */
function finitePercent(value: number): string { return Number.isFinite(value) ? `${value.toFixed(2)}%` : '—' }

/** Current and previous values share the same units; changes are supplied by the server. */
function MetricCard({ label, metric, comparison, icon, meta }: { meta: EfficiencyMeta; label: string; metric: EfficiencyMetric; comparison: EfficiencyComparison; icon: ReactNode }) {
  const { l, units } = useEfficiencyLabels()
  return <article className="efficiency-overview__metric-card" title={metric === 'draws' ? l('包含全部抽卡类型', 'Includes all generation types') : undefined}><div className="efficiency-overview__metric-label">{label}</div><div className="efficiency-overview__metric-value"><strong>{formatMetric(comparison.current, metric)}</strong><span>{units[metric]}</span></div><div className="efficiency-overview__metric-orb">{icon}</div><EfficiencyCoverageNotice metas={[meta]} metric={metric} impact="metric" compact /></article>
}

/** Shared heading for the existing dashboard panels. */
function PanelHeader({ title, action }: { title: string; action?: ReactNode }) { return <div className="efficiency-overview__panel-heading"><h2>{title}</h2>{action}</div> }

/** Rank shares and total/other amounts come from the full server result, not the visible Top N. */
function RankList({ data, onDrill }: { data: EfficiencyRankings; onDrill: (key: string, name: string) => void }) {
  const { l, units } = useEfficiencyLabels()
  return <>
    {!data.rows.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={l("暂无项目数据", "No project data")} /> : <div className="efficiency-overview__rank">{data.rows.map((row) => {
      return <div key={row.groupKey} className="efficiency-overview__rank-row">
        <div className="efficiency-overview__rank-top"><button type="button" className="efficiency-overview__text-button" onClick={() => onDrill(row.groupKey, row.name)}><span className="efficiency-overview__rank-number">{row.rank}</span>{row.name} ›</button><strong>{formatMetric(row.value, data.metric)} {units[data.metric]} <span>({finitePercent(row.sharePercent)})</span></strong></div>
        <div className="efficiency-overview__rank-track"><div style={{ width: `${Number.isFinite(row.sharePercent) ? Math.max(0, Math.min(100, row.sharePercent)) : 0}%` }} /></div>
      </div>
    })}</div>}
    {data.otherValue > 0 && <p className="efficiency-overview__note">{l("全部总计", "Overall total")} {formatMetric(data.totalValue, data.metric)} {units[data.metric]} {l("· 榜外其他", "· Other entries")} {formatMetric(data.otherValue, data.metric)} {units[data.metric]}</p>}
  </>
}
