export const zeroBalanceMessage = '积分余额为0，请等重置后再发送消息'
export const billingLabels = { pending: '待结算', reserved: '已预留', settled: '已结算', released: '未扣费', pendingReview: '费用待核算' }

/** Only an explicit new-protocol flag authorizes omission of the legacy reservation field. */
export function actualBillingQuote(quote, canvasId, revisionNo) {
  if (!quote?.quoteId || String(quote.canvasId) !== String(canvasId) || quote.revisionNo !== revisionNo) throw new Error('检查回执与保存版本不一致')
  if (!quote.expiresAt || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now()) throw new Error('检查回执已过期，请重新检查输入')
  if (quote.billingMode !== 'balance_then_actual' || quote.requiresConfirmation !== false) throw new Error('后端尚未返回无预留计费协议，请刷新或确认后端已更新后再发送')
  // A video with no audio track must still create a persisted, empty transcript, even at zero balance.
  const noCall = quote.providerCallRequired === false
  if (!noCall && quote.unlimited !== true && (quote.sufficient === false || (Number.isFinite(quote.currentBalance) && quote.currentBalance <= 0))) throw new Error(zeroBalanceMessage)
  if (!noCall && quote.unlimited !== true && (quote.sufficient !== true || !Number.isFinite(quote.currentBalance))) throw new Error('无法确认当前余额，请重新检查输入')
  return quote
}

/** The same balance message is used for synchronous errors and accepted tasks that later fail. */
const inputErrors = {
  WORKFLOW_INPUT_UNSUPPORTED: '上游输出不能用于此操作，请调整连线或先将结果转换为正文/分镜。',
  WORKFLOW_INPUT_PORT_UNSUPPORTED: '文字步骤只支持默认输入端口，请修改连线。',
  WORKFLOW_INPUT_AMBIGUOUS: '分镜汇总只能连接一个执行拆分或汇总的分镜来源。',
  WORKFLOW_INPUT_INVALID: '上游正文为空、格式不正确或超过 60,000 字符，请检查本次结果。',
  CANVAS_TEXT_MODEL_BINDING_MISMATCH: '文字模型与保存版本不一致，请重新选择模型并保存。',
}
export const canvasBillingError = error => error?.errorCode === 'INSUFFICIENT_CREDITS' ? zeroBalanceMessage : inputErrors[error?.errorCode] || error?.error || error?.message || '画布请求失败'
