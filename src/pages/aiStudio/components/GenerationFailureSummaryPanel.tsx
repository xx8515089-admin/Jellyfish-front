import { Button, Tag } from 'antd'
import type { TaskFailureSummaryRead } from '../../../services/generated'

type GenerationFailureSummaryPanelProps = {
  summary: TaskFailureSummaryRead
  status?: string | null
  onViewRaw?: (() => void) | null
  onViewPayload?: (() => void) | null
  onRecover?: (() => void) | null
  compact?: boolean
}

export function GenerationFailureSummaryPanel({
  summary,
  status = 'failed',
  onViewRaw,
  onViewPayload,
  onRecover,
  compact = false,
}: GenerationFailureSummaryPanelProps) {
  const recoverable = status === 'recoverable_timeout'
  return (
    <div className={`mt-2 rounded border p-2 text-xs ${recoverable ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-red-200 bg-red-50 text-red-900'}`}>
      <div className="flex flex-wrap items-center gap-1">
        <Tag color="red">Provider: {summary.provider}</Tag>
        <Tag color="volcano">{summary.failure_category}</Tag>
        <Tag color={recoverable ? 'gold' : 'red'}>Status: {recoverable ? 'recoverable_timeout' : 'failed'}</Tag>
        {summary.atlas_error_code ? <Tag color="orange">Error code: {summary.atlas_error_code}</Tag> : null}
      </div>
      <div className="mt-1 font-medium">Human explanation: {summary.short_explanation}</div>
      {summary.atlas_raw_error_message ? (
        <div className="mt-1 break-words">Raw backend dispatch error message: {summary.atlas_raw_error_message}</div>
      ) : null}
      <div className="mt-1 break-words">Failure reason: {summary.user_visible_failure_reason}</div>
      {!compact || summary.suggested_fix ? <div className={`mt-1 ${recoverable ? 'text-amber-800' : 'text-red-700'}`}>Suggested fix: {summary.suggested_fix}</div> : null}
      {summary.provider_task_id ? <div className={`mt-1 ${recoverable ? 'text-amber-700' : 'text-red-500'}`}>Provider task: {summary.provider_task_id}</div> : null}
      {onViewRaw || onViewPayload || onRecover ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {onRecover ? (
            <Button size="small" type={recoverable ? 'primary' : 'default'} onClick={onRecover}>
              Poll existing backend task
            </Button>
          ) : null}
          {onViewPayload ? (
            <Button size="small" onClick={onViewPayload}>
              View submitted payload
            </Button>
          ) : null}
          {onViewRaw ? (
            <Button size="small" onClick={onViewRaw}>
              View raw backend response
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
