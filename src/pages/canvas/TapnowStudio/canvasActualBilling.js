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
export const canvasBillingError = error => error?.errorCode === 'INSUFFICIENT_CREDITS' ? zeroBalanceMessage : error?.error || error?.message || '画布请求失败'
