import { OpenAPI } from './generated/core/OpenAPI'
import { request } from './generated/core/request'

export type BatchScope = { scriptImportId: string | number; episodeId: string | number }
export type VideoBatchCandidate = {
  segmentId: number; segmentIndex: number; revisionNo: number; title: string; description: string
  coverUrl?: string | null; hasPrompt: boolean; suggestedDurationSeconds?: number | null
  latestVideoGenerationId?: number | null; videoState: string; selectable: boolean
  errorCode?: string | null; reason?: string | null
}
export type VideoBatchCandidates = BatchScope & { runId: number; maxItems: number; items: VideoBatchCandidate[] }
export type VideoBatchSettings = {
  modelId: number; aspectRatio: string; resolution: string; durationSeconds: number | null
  generateAudio: boolean; inheritPreviousVideo: boolean
  visualStyleId?: string | number | null; toneStyleId?: string | number | null
}
export type VideoBatchRequest = BatchScope & {
  settings: VideoBatchSettings
  items: Array<{ segmentId: number; expectedRevisionNo: number; prompt?: string; durationSeconds?: number | null; referenceVideoDurationSeconds?: number }>
}
export type VideoBatchPreviewItem = {
  segmentId: number; segmentIndex: number; durationSeconds: number | null; prompt: string
  dependencySegmentId?: number | null; previousVideoGenerationId?: number | null
  referenceVideoDurationSeconds: number; estimatedCredits: number; valid: boolean
  errorCode?: string | null; reason?: string | null
}
export type VideoBatchPreview = {
  fingerprint: string | null; valid: boolean; hasPendingDependencies: boolean
  estimatedCredits: number; currentBalance: number; unlimited: boolean; sufficient: boolean
  items: VideoBatchPreviewItem[]
}
export type VideoBatchSubmission = {
  clientRequestId: string; previewFingerprint: string; maxTotalCredits: number
  request: VideoBatchRequest; retryOfBatchId: number | null
}
export type VideoBatchItem = {
  id: number; segmentId: number; segmentIndex: number
  status: 'waiting' | 'submitted' | 'succeeded' | 'failed' | 'blocked' | 'needsReview'
  dependencySegmentId?: number | null; generationId?: number | null; taskId?: number | null
  videoStatus?: number | null; progress?: number | null; outputUrl?: string | null
  estimatedCredits: number; reservedCredits?: number | null
  errorCode?: string | null; errorMessage?: string | null; retryable: boolean
}
export type VideoBatchDetail = BatchScope & {
  id: number; retryOfBatchId?: number | null; status: string; shouldPoll: boolean; total: number
  waitingCount: number; runningCount: number; succeededCount: number; failedCount: number
  blockedCount: number; needsReviewCount: number; estimatedCredits: number; maxTotalCredits: number
  committedCredits: number; createdAt: string; items: VideoBatchItem[]
}

const base = '/api/v1/studio/storyboards/videos/batches'
async function call<T>(method: 'GET' | 'POST', path: string, data: object): Promise<T> {
  const response = await request<{ code: number; message?: string; data: T }>(OpenAPI, {
    method, url: `${base}${path}`, ...(method === 'GET' ? { query: data } : { body: data, mediaType: 'application/json' }),
  })
  if (response.code !== 200 || (response.data === null || response.data === undefined)) {
    throw Object.assign(new Error(response.message || '批量视频请求失败'), { body: response })
  }
  return response.data
}
export const StoryboardVideoBatchApi = {
  candidates: (scope: BatchScope) => call<VideoBatchCandidates>('GET', '/candidates', scope),
  preview: (body: VideoBatchRequest) => call<VideoBatchPreview>('POST', '/preview', body),
  create: (body: VideoBatchSubmission) => call<VideoBatchDetail>('POST', '/create', body),
  retry: (body: VideoBatchSubmission) => call<VideoBatchDetail>('POST', '/retry', body),
  detail: (id: number) => call<VideoBatchDetail>('GET', '/detail', { id }),
  submission: (clientRequestId: string) => call<VideoBatchDetail>('GET', '/submission', { clientRequestId }),
  list: (scope: BatchScope, beforeId?: number) => call<VideoBatchDetail[]>('GET', '', { ...scope, limit: 10, beforeId }),
}
