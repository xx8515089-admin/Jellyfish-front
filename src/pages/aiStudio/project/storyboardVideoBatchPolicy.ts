import type { VideoBatchCandidate, VideoBatchPreview, VideoBatchRequest, VideoBatchSettings, BatchScope } from '../../../services/storyboardVideoBatch'
import { videoBatchErrorCode } from '../../../services/storyboardVideoBatchErrors'
export { videoBatchErrorCode } from '../../../services/storyboardVideoBatchErrors'

export function buildVideoBatchRequest(scope: BatchScope, settings: VideoBatchSettings, candidates: VideoBatchCandidate[], selected: number[], drafts: Record<string, string>, durations: Record<number, number | null>, referenceDurations: Record<number, number | null>): VideoBatchRequest {
  return {
    ...scope, settings: { ...settings }, items: candidates.filter((item) => selected.includes(item.segmentId) && item.selectable).map((item) => ({
      segmentId: item.segmentId, expectedRevisionNo: item.revisionNo,
      ...(drafts[String(item.segmentId)] !== undefined ? { prompt: drafts[String(item.segmentId)] } : {}),
      durationSeconds: durations[item.segmentId] ?? null,
      referenceVideoDurationSeconds: referenceDurations[item.segmentId] ?? 0,
    })),
  }
}

export function canSubmitVideoBatch(preview: VideoBatchPreview | undefined, budget: number | null, confirmed: boolean): boolean {
  return Boolean(preview?.valid && preview.sufficient && preview.fingerprint && confirmed
    && Number.isFinite(preview.estimatedCredits) && preview.estimatedCredits >= 0
    && budget !== null && Number.isFinite(budget) && budget >= preview.estimatedCredits
    && Math.abs(budget * 100 - Math.round(budget * 100)) < 0.000001)
}

/** Only explicit pre-acceptance failures permit discarding a frozen submission. */
export function isVideoBatchRejected(error: unknown): boolean {
  const code = videoBatchErrorCode(error)
  if (code === 'IDEMPOTENCY_CONFLICT' || code === 'VIDEO_BATCH_RESULT_UNCERTAIN') return false
  return Number((error as { status?: number } | null)?.status) === 422
    || Boolean(code?.startsWith('VIDEO_BATCH_') && code !== 'VIDEO_BATCH_SUBMISSION_NOT_FOUND')
}

export function batchSelectableIds(candidates: VideoBatchCandidate[], maxItems: number, missingOnly = false): number[] {
  return candidates.filter((item) => item.selectable && (!missingOnly || (item.latestVideoGenerationId === null || item.latestVideoGenerationId === undefined)))
    .slice(0, Math.min(50, maxItems)).map((item) => item.segmentId)
}
