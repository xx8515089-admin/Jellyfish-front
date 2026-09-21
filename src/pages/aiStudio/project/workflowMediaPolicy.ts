type Task = { id: number; mediaType?: string; status: number }

/** Create a UUID v4 even when randomUUID is unavailable (for example on an HTTP LAN origin). */
export function createWorkflowRequestId(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (typeof cryptoApi?.getRandomValues !== 'function') throw new Error('当前浏览器不支持生成请求标识，请更新浏览器后重试')
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Progress alone does not invalidate history; additions, removals and status changes do. */
export function shouldRefreshWorkflowHistory(previous: Task[] | undefined, next: Task[]): boolean {
  if (!previous || previous.length !== next.length) return true
  const states = new Map(previous.map((item) => [`${item.mediaType}:${item.id}`, item.status]))
  return next.some((item) => states.get(`${item.mediaType}:${item.id}`) !== item.status)
}

/** Only explicit pre-acceptance rejections release an idempotency key; server failures remain uncertain. */
export function isDefiniteSubmissionRejection(reason: unknown): boolean {
  const failure = reason as { status?: number; body?: { code?: number; data?: { errorCode?: string; acceptance?: string } } }
  const data = failure?.body?.data
  return failure?.status !== 401 && failure?.body?.code !== 401 && data?.acceptance === 'rejected'
    && ['WORKFLOW_INVALID_REQUEST', 'WORKFLOW_REQUEST_REJECTED', 'WORKFLOW_STORAGE_NOT_READY'].includes(data.errorCode || '')
}

/** Only queued/running media may fall back to polling on old servers. */
export const workflowShouldPoll = (item: {status:number;shouldPoll?:boolean;terminal?:boolean}) => [1,2].includes(item.status) && item.shouldPoll !== false && item.terminal !== true
export const workflowPollDelay = (item: {pollAfterSeconds?:number}) => Number.isFinite(item.pollAfterSeconds) && item.pollAfterSeconds! > 0 ? Math.max(1000,item.pollAfterSeconds!*1000) : 3000
export const workflowOutputReady = (item: {status:number;outputReady?:boolean;outputFileId?:unknown;outputUrl?:string|null}) => item.status===3 && item.outputReady===true && item.outputFileId!=null && !!item.outputUrl
