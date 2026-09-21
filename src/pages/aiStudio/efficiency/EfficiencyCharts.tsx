import { Empty } from 'antd'
import type { EfficiencyRankings, EfficiencyTrend } from '../../../services/efficiencyGenerated'
import { formatMetric, trendDisplayValue } from './efficiencyModel'
import { useEfficiencyLabels } from './useEfficiencyLabels'
import { chartDataIndex, EfficiencyChart } from './EfficiencyChart'
import type { EfficiencyChartOption } from './EfficiencyChart'

const tooltipStyle = { renderMode: 'richText' as const, confine: true, backgroundColor: '#202723', borderColor: '#47584e', textStyle: { color: '#e8f1ec', fontSize: 12 } }
const grid = { left: 12, right: 24, top: 30, bottom: 12, containLabel: true }
const axisLabel = { color: '#98a59e', fontSize: 12, hideOverlap: true }
const splitLine = { lineStyle: { color: '#8fa69a1a', type: 'dashed' as const } }

/** ECharts draws the trend while display-only zero filling leaves backend totals untouched. */
export function EfficiencyTrendChart({ data }: { data: EfficiencyTrend }) {
  const { l, units } = useEfficiencyLabels()
  if (!data.buckets.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={l('暂无趋势数据', 'No trend data')} />
  const divisor = data.metric === 'duration' ? 60000 : 1
  const values = data.buckets.map((bucket) => trendDisplayValue(bucket) / divisor)
  const label = l(`${units[data.metric]}趋势折线面积图`, `${units[data.metric]} trend area chart`)
  const option: EfficiencyChartOption = {
    animation: false,
    aria: { enabled: true, label: { description: label } },
    grid,
    tooltip: { ...tooltipStyle, trigger: 'axis', formatter: (params) => {
      const bucket = data.buckets[chartDataIndex(params)]
      if (!bucket) return ''
      const filled = bucket.plotValue === null || !Number.isFinite(bucket.plotValue)
      return `${bucket.label}: ${formatMetric(trendDisplayValue(bucket), data.metric)} ${units[data.metric]}${filled ? l(`\n缺失数据按 0 展示；已知贡献 ${formatMetric(bucket.value, data.metric)} ${units[data.metric]}`, `\nMissing data displayed as 0; known contribution ${formatMetric(bucket.value, data.metric)} ${units[data.metric]}`) : ''}${bucket.partial ? l('\n时间桶未结束', '\nOngoing time bucket') : ''}`
    } },
    xAxis: { type: 'category', boundaryGap: false, data: data.buckets.map((bucket) => `${bucket.label}${bucket.partial ? '*' : ''}`), axisLabel, axisTick: { show: false }, axisLine: { lineStyle: { color: '#8fa69a33' } } },
    yAxis: { type: 'value', min: 0, max: values.every((value) => value === 0) ? 1 : undefined, splitNumber: 4, axisLabel: { ...axisLabel, formatter: (value: number) => formatMetric(value * divisor, data.metric) }, splitLine },
    series: [{ type: 'line', data: values, smooth: false, showSymbol: true, symbol: 'circle', symbolSize: data.buckets.length > 60 ? 4 : 7, lineStyle: { color: '#36e3c9', width: 2 }, itemStyle: { color: '#30e6ca' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#16daca40' }, { offset: 1, color: '#16daca00' }] } } }],
  }
  return <div className="efficiency-chart">
    {data.buckets.some((bucket) => bucket.plotValue === null || !Number.isFinite(bucket.plotValue)) && <p className="efficiency-overview__note">{l('缺失数据按 0 展示，不代表已确认零消耗；统计总额保留已知贡献。', 'Missing data is displayed as 0, not confirmed zero usage; totals retain known contributions.')}</p>}
    <EfficiencyChart option={option} label={label} />
  </div>
}

/** ECharts columns drill by row identity; keyboard users have equivalent data buttons. */
export function EfficiencyMemberChart({ data, onDrill }: { data: EfficiencyRankings; onDrill: (key: string, name: string) => void }) {
  const { l, units } = useEfficiencyLabels()
  if (!data.rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={l('暂无成员数据', 'No member data')} />
  const divisor = data.metric === 'duration' ? 60000 : 1
  const values = data.rows.map((row) => row.value / divisor)
  const label = l('成员消耗柱状图', 'Member usage bar chart')
  const option: EfficiencyChartOption = {
    animation: false,
    aria: { enabled: true, label: { description: label } },
    grid,
    tooltip: { ...tooltipStyle, trigger: 'item', formatter: (params) => {
      const row = data.rows[chartDataIndex(params)]
      return row ? `${row.name}: ${formatMetric(row.value, data.metric)} ${units[data.metric]}\n${l('点击查看明细', 'Click to view details')}` : ''
    } },
    xAxis: { type: 'category', data: data.rows.map((row) => row.groupKey), axisLabel: { ...axisLabel, formatter: (_value: string, index: number) => { const name = data.rows[index]?.name ?? ''; return name.length > 14 ? `${name.slice(0, 13)}…` : name } }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#8fa69a33' } } },
    yAxis: { type: 'value', min: 0, max: values.every((value) => value === 0) ? 1 : undefined, splitNumber: 4, axisLabel: { ...axisLabel, formatter: (value: number) => formatMetric(value * divisor, data.metric) }, splitLine },
    series: [{ type: 'bar', data: values, barMaxWidth: 48, label: { show: true, position: 'top', color: '#b6c6bb', fontSize: 12, formatter: (params) => formatMetric(data.rows[params.dataIndex].value, data.metric) }, itemStyle: { borderRadius: [3, 3, 0, 0], color: { type: 'linear', x: 0, y: 1, x2: 0, y2: 0, colorStops: [{ offset: 0, color: '#00d8da' }, { offset: 1, color: '#b9f59f' }] } } }],
  }
  return <div className="efficiency-chart efficiency-chart--members">
    <EfficiencyChart option={option} label={label} onDatumClick={(index) => { const row = data.rows[index]; if (row) onDrill(row.groupKey, row.name) }} />
    <div className="efficiency-chart__keyboard-data">{data.rows.map((row) => <button type="button" key={row.groupKey} onClick={() => onDrill(row.groupKey, row.name)}>{row.name}: {formatMetric(row.value, data.metric)} {units[data.metric]} · {l('查看明细', 'View details')}</button>)}</div>
  </div>
}
