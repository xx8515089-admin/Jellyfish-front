export function extractTaskIdFromResponse(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null
  const root = response as Record<string, unknown>
  const direct = pickTaskId(root)
  if (direct) return direct
  const data = root.data
  if (data && typeof data === 'object') return pickTaskId(data as Record<string, unknown>)
  return null
}

function pickTaskId(record: Record<string, unknown>): string | null {
  const value = record.task_id ?? record.taskId ?? record.id
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
