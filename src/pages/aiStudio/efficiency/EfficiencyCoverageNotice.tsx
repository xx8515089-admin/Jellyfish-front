import type { EfficiencyMeta, EfficiencyMetric } from '../../../services/efficiencyGenerated'
import { coverageIssues } from './efficiencyModel'
import { useEfficiencyLabels } from './useEfficiencyLabels'

type Props = { metas: EfficiencyMeta[]; metric?: EfficiencyMetric; impact?: 'metric' | 'attribution'; compact?: boolean }

/** Explain evidence and attribution separately for the current and comparison periods. */
export function EfficiencyCoverageNotice({ metas, metric, impact, compact = false }: Props) {
  const { l, titles } = useEfficiencyLabels()
  const issues = coverageIssues(metas, metric, impact)
  if (!issues.length) return null
  const reasonNames: Record<string, string> = {
    HISTORICAL_UNVERIFIED: l('历史覆盖尚未核实', 'Historical coverage is unverified'),
    SOURCE_PROJECTION_MISMATCH: l('来源记录与统计事实存在差异', 'Source records differ from statistics facts'),
    MISSING_DURATION: l('部分任务缺少有效耗时', 'Some tasks have no valid duration'),
    ESTIMATED_DURATION: l('部分耗时为估算值', 'Some durations are estimated'),
    MISSING_BILLING_RECORD: l('部分任务缺少账单，费用是否发生待核对', 'Some tasks have no billing record; whether a charge occurred needs review'),
    UNKNOWN_PROJECT: l('部分记录项目归属未知', 'Some records have no known project'),
    UNKNOWN_MEMBER: l('部分记录成员归属未知', 'Some records have no known member'),
    UNKNOWN_MODEL: l('部分记录模型归属未知', 'Some records have no known model'),
  }
  const recovery: Record<string, string> = { backfillable: l('可回填', 'Backfillable'), manualReview: l('需人工核对', 'Manual review needed'), notRecoverable: l('不可恢复', 'Not recoverable'), unknown: l('恢复方式未知', 'Recovery unknown') }
  return <details className={`efficiency-overview__coverage-details${compact ? ' is-compact' : ''}`}>
    <summary>{l('当前公共范围质量提示', 'Quality notes for the current common scope')}{metric ? ` · ${titles[metric]}` : ''} ({issues.length})</summary>
    <ul>{issues.map((issue) => <li key={`${issue.period}:${issue.id}`}>
      <strong>{issue.period === 'current' ? l('当前期', 'Current period') : l('上一期', 'Previous period')} · {reasonNames[issue.code] ?? issue.message}</strong>
      <span>{issue.certainty === 'confirmed' ? l('已确认', 'Confirmed') : l('尚未核实', 'Unverified')} · {issue.affectedMetrics.map((value) => titles[value]).join(' / ')} · {issue.impact === 'metric' ? l('影响指标完整性', 'Affects metric completeness') : l('影响归属，已知贡献仍保留', 'Affects attribution; known contributions are retained')}</span>
      <span>{issue.affectedCount === null ? l('缺失数量未知', 'Missing count unknown') : l(`涉及 ${issue.affectedCount} 条记录`, `${issue.affectedCount} affected records`)} · {recovery[issue.recoverability]}</span>
      <span>{issue.affectedRange.startAt} — {issue.affectedRange.endAt}</span>
    </li>)}</ul>
  </details>
}
