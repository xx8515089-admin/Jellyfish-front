export function getApiErrorMessage(error: unknown, fallback = '请求失败'): string {
  if (!error) return fallback
  const maybe = error as {
    message?: unknown
    body?: unknown
    status?: unknown
    statusText?: unknown
  }
  const body = maybe.body
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    const detail = record.detail
    if (typeof detail === 'string' && detail.trim()) return detail.trim()
    const message = record.message
    if (typeof message === 'string' && message.trim()) return message.trim()
    const data = record.data
    if (data && typeof data === 'object') {
      const dataRecord = data as Record<string, unknown>
      if (typeof dataRecord.message === 'string' && dataRecord.message.trim()) return dataRecord.message.trim()
      if (typeof dataRecord.error === 'string' && dataRecord.error.trim()) return dataRecord.error.trim()
    }
  }
  if (typeof maybe.message === 'string' && maybe.message.trim()) return maybe.message.trim()
  if (maybe.status || maybe.statusText) return `${fallback}（${maybe.status ?? ''} ${maybe.statusText ?? ''}）`.trim()
  return fallback
}
