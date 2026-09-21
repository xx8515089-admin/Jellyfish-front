import { useBilingualText } from '../../../i18n/useBilingualText'

/** Recompute dashboard labels when the application language changes. */
export function useEfficiencyLabels() {
  const l = useBilingualText()
  const units = { credits: l("积分", "credits"), duration: l("分钟", "min"), draws: l("次", "generations") }
  const titles = { credits: l("积分消耗", "Credit usage"), duration: l("生成时长", "Generation time"), draws: l("抽卡次数", "Generations") }
  const taskStatuses: Record<number, string> = { 1: l("待执行", "Pending"), 2: l("执行中", "Running"), 3: l("成功", "Succeeded"), 4: l("失败", "Failed"), 5: l("已取消", "Cancelled"), 6: l("可恢复超时", "Recoverable timeout"), 7: l("输出比例不匹配", "Output aspect ratio mismatch") }
  const billingStatuses: Record<number, string> = { 1: l("待结算", "Pending settlement"), 2: l("已结算", "Settled"), 3: l("已释放", "Released"), 4: l("结算失败", "Settlement failed") }
  return { l, units, titles, taskStatuses, billingStatuses }
}
