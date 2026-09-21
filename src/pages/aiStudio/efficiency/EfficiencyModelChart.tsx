import { Empty } from 'antd'
import { chartDataIndex, EfficiencyChart } from './EfficiencyChart'
import type { EfficiencyChartOption } from './EfficiencyChart'
import type { EfficiencyModelGroup } from '../../../services/efficiencyGenerated'
import { formatMetric } from './efficiencyModel'
import { useEfficiencyLabels } from './useEfficiencyLabels'

const colors = ['#ffae54', '#30d8c2', '#a3a0ff', '#67b8ff', '#ed91c3', '#d4d978', '#79bba7', '#de926f']

/** Render model shares from stable model identities, retaining the server's group totals. */
export function EfficiencyModelChart({ group, onDrill }: { group: EfficiencyModelGroup; onDrill: (modelKey?: string, name?: string) => void }) {
  const { l } = useEfficiencyLabels()
  if (group.credits <= 0 || !group.models.length) return <div className="efficiency-overview__model-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={l('暂无模型消耗', 'No model usage')} /></div>
  const label = l('模型积分消耗环图', 'Model credit usage doughnut chart')
  const option: EfficiencyChartOption = {
    animation: false,
    color: colors,
    aria: { enabled: true, label: { description: label } },
    title: { text: formatMetric(group.credits, 'credits'), subtext: l('积分', 'credits'), left: 'center', top: '37%', itemGap: 4, textStyle: { fontSize: 18, color: '#eef4f2' }, subtextStyle: { fontSize: 12, color: '#a6b8ad' } },
    tooltip: { trigger: 'item', renderMode: 'richText', confine: true, backgroundColor: '#202723', borderColor: '#47584e', textStyle: { color: '#e8f1ec', fontSize: 12 }, formatter: (params) => {
      const model = group.models[chartDataIndex(params)]
      return model ? `${model.modelName ?? l('未知模型', 'Unknown model')} · ${model.supplierName ?? l('未知供应商', 'Unknown supplier')}\n${formatMetric(model.credits, 'credits')} ${l('积分', 'credits')} (${model.sharePercent.toFixed(2)}%)` : ''
    } },
    series: [{ type: 'pie', radius: ['58%', '80%'], center: ['50%', '50%'], stillShowZeroSum: false, label: { show: false }, emphasis: { scale: true, scaleSize: 3 }, data: group.models.map((model) => ({ id: model.modelKey, name: model.modelKey, value: model.credits })) }],
  }
  return <>
    <div className="efficiency-overview__model-donut">
      <EfficiencyChart className="efficiency-echart--donut" option={option} label={label} onDatumClick={(index) => { const model = group.models[index]; if (model) onDrill(model.modelKey, model.modelName ?? l('未知模型', 'Unknown model')) }} />
    </div>
    <div className="efficiency-overview__model-legend">{group.models.map((model, index) => <button type="button" key={model.modelKey} onClick={() => onDrill(model.modelKey, model.modelName ?? l('未知模型', 'Unknown model'))}>
      <i style={{ background: colors[index % colors.length] }} />
      <span>{model.modelName ?? l('未知模型', 'Unknown model')}<small>{model.supplierName ?? l('未知供应商', 'Unknown supplier')}</small></span>
      <strong>{formatMetric(model.credits, 'credits')}<small>{model.sharePercent.toFixed(2)}%</small></strong>
    </button>)}</div>
  </>
}
