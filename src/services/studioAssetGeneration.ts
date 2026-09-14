import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'
import { unwrapApiData } from './generatedResponse'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

export type StudioAssetImageGenerateRequest = {
  id: number
  lookId: number | null
  prompt: string
  aspectRatio: string
  visualStyleId: number | null
  quality: number | null
  resolution: number
  modelId: number
}

export type StudioAssetGenerateEstimateRequest = {
  modelId: number
  quality: string | number | null
  resolution: number
}

export type StudioAssetGenerateEstimateResult = {
  modelId?: number | null
  modelName?: string
  quality?: string | number | null
  resolution?: number | null
  billingUnit?: string
  creditCost: number
}

export type StudioEpisodeAssetsGenerateEstimateRequest = {
  modelId: number
  quality: string | number | null
  resolution: number
  scriptImportId: string | number
  episodeId?: string | number
}

export type StudioEpisodeAssetsGenerateRequest = {
  scriptImportId: string | number
  episodeId?: string | number
  modelId: number
  quality: number | null
  resolution: number
  regenerate: boolean
}

export type StudioEpisodeAssetsGenerateEstimateResult = {
  scriptImportId?: string | number | null
  chapterId?: string | number | null
  episodeIndex?: number | null
  modelId?: number | null
  modelName?: string
  quality?: string | number | null
  resolution?: number | null
  totalCount: number
  generatedCount: number
  pendingCount: number
  unitCreditCost: number
  totalCreditCost: number
}

export type StudioEpisodeAssetsGenerateStatusRequest = {
  scriptImportId: string | number
  episodeId?: string | number
}

export type StudioStoryboardVideoGenerateEstimateRequest = {
  modelId: number
  resolution: string
  durationSeconds: number
}

export type StudioStoryboardVideoGenerateRequest = {
  segmentId: string | number
  modelId: number
  directorPromptRunId: string | number | null
  visualStyleId: string | number | null
  toneStyleId: string | number | null
  aspectRatio: string
  resolution: string
  durationSeconds: number
  generateAudio: boolean
  prompt: string
}

export type StudioStoryboardVideoGenerateEstimateResult = {
  modelId?: number | null
  modelName?: string
  resolution?: string
  durationSeconds: number
  generateAudio?: boolean
  referenceVideoDurationSeconds?: number
  billingUnit?: string
  billableQuantity?: number
  unitCreditCost?: number
  creditCost: number
  estimated?: boolean
  pricingSource?: string
  priceValidUntil?: string | null
}

export type StudioStoryboardVideoReferenceOptionSource = 'character' | 'scene' | 'prop' | 'dubbing'

export type StudioStoryboardVideoReferenceOptionsRequest = {
  segmentId: string | number
  source: StudioStoryboardVideoReferenceOptionSource
}

export type StudioStoryboardVideoReferenceDeleteRequest = {
  segmentId: string | number
  expectedRevisionNo: number
  referenceIndex: number
}

export type StudioStoryboardImageSkillRequest = {
  segmentId: string | number
}

export type StudioStoryboardVideoReferenceDeleteResult = {
  segmentId?: string | number | null
  revisionNo?: number | null
}

export type StudioStoryboardVideoReferenceAddItem = {
  referenceType?: number | null
  fileId?: string | number | null
  assetId?: string | number | null
  characterLookId?: string | number | null
  sourceSegmentId?: string | number | null
  durationSeconds?: number | null
  audioSource?: string | null
  voiceId?: string | number | null
  voiceName?: string | null
  characterName?: string | null
  dubbingGenerationId?: string | number | null
  displayName: string
}

export type StudioStoryboardVideoReferenceAddRequest = {
  segmentId: string | number
  expectedRevisionNo: number
  references: StudioStoryboardVideoReferenceAddItem[]
}

export type StudioStoryboardVideoReferenceAddResult = StudioStoryboardVideoReferenceDeleteResult

export type StudioStoryboardVideoReferenceOption = {
  source: StudioStoryboardVideoReferenceOptionSource
  referenceType?: number | null
  fileId?: string | number | null
  fileUrl?: string | null
  displayName: string
  assetId?: string | number | null
  characterLookId?: string | number | null
  sourceSegmentId?: string | number | null
  durationSeconds?: number | null
  audioSource?: string | null
  voiceId?: string | number | null
  voiceName?: string | null
  characterName?: string | null
  dubbingGenerationId?: string | number | null
  characterCoverUrl?: string | null
  character_cover_url?: string | null
  characterLookName?: string | null
  defaultLook?: boolean
  selected: boolean
  referenceIndex?: number | null
  referenceSelectionRevisionNo?: number | null
  selectable: boolean
  disabledReason?: string | null
  historical?: boolean
  assetName?: string | null
  lookName?: string | null
}

export type StudioEpisodeAssetsConfirmRequest = {
  scriptImportId: string | number
  episodeId: string | number
}

export type StudioEpisodeAssetsConfirmResult = {
  currentStep?: number | null
  runId?: string | number | null
  editor?: StudioEpisodeStoryboardEditorResult | null
}

export type StudioEpisodeAssetsGenerateStatusItem = {
  scopeKey?: string | number | null
  scopeCode?: string
  assetId?: number | null
  assetType?: number | null
  assetName?: string
  characterLookId?: number | null
  characterLookName?: string | null
  coverFileId?: string | number | null
  coverUrl?: string | null
  status?: number | null
  statusName?: string
  taskId?: string | number | null
  progress?: number | null
  error?: string
}

export type StudioEpisodeAssetsGenerateStatusResult = {
  scriptImportId?: string | number | null
  episodeId?: string | number | null
  episodeIndex?: number | null
  totalCount: number
  generatedCount: number
  generatingCount: number
  pendingCount: number
  failedCount: number
  allGenerated: boolean
  shouldPoll: boolean
  batch?: unknown
  items: StudioEpisodeAssetsGenerateStatusItem[]
}

export type StudioEpisodeStoryboardEditorRequest = {
  scriptImportId: string | number
  episodeId: string | number
}

export type StudioEpisodeStoryboardAssetReadiness = {
  totalCount: number
  readyCount: number
  generatingCount: number
  missingCount: number
  failedCount: number
  unconfirmedCount: number
}

export type StudioEpisodeStoryboardRun = {
  runId?: string | number | null
  episodeId?: string | number | null
  taskId?: string | number | null
  status?: number | null
  statusName?: string
  progress?: number | null
  skillStage?: string
  shouldPoll: boolean
  canEdit?: boolean
  error?: string
  createdAt?: string
  finishedAt?: string
}

export type StudioEpisodeStoryboardShot = {
  id?: string | number | null
  shotIndex?: number | null
  title?: string
  editorDescription?: string
  coverFileId?: string | number | null
  coverUrl?: string | null
}

export type StudioEpisodeStoryboardAssetReference = {
  scopeCode?: string
  assetId?: number | null
  assetType?: number | null
  assetName: string
  characterLookId?: number | null
  characterLookName?: string | null
  coverFileId?: string | number | null
  coverUrl?: string | null
}

export type StudioEpisodeStoryboardPromptReference = {
  referenceIndex?: number | null
  referenceKey?: string | null
  referenceType?: number | null
  referenceTypeName?: string
  referenceToken: string
  fileId?: string | number | null
  fileUrl?: string | null
  displayName: string
  matchNames?: string[]
}

export type StudioEpisodeStoryboardPromptMention = {
  start: number | null
  end: number | null
  text: string
  referenceKey?: string | null
}

export type StudioEpisodeStoryboardDirectorPrompt = {
  id?: string | number | null
  taskId?: string | number | null
  status?: number | null
  progress?: number | null
  skillCode?: string
  skillName?: string
  textModelId?: number | null
  videoModelId?: number | null
  sourceChanged: boolean
  durationSeconds?: number | null
  suggestedDurationSeconds?: number | null
  generateAudio?: boolean
  prompt: string
  promptCharacters?: number | null
  maxPromptCharacters?: number | null
  references: StudioEpisodeStoryboardPromptReference[]
  mentions: StudioEpisodeStoryboardPromptMention[]
  warnings: string[]
  canUndoSkill?: boolean
  error?: string
}

export type StudioStoryboardImageSkillResult = StudioEpisodeStoryboardDirectorPrompt & {
  segmentId?: string | number | null
}

export type StudioEpisodeStoryboardReferenceSelection = {
  revisionNo?: number | null
  references: StudioEpisodeStoryboardPromptReference[]
}

export type StudioEpisodeStoryboardSegmentSourceType = 1 | 2 | 3

export type StudioEpisodeStoryboardSegment = {
  id: string
  segmentIndex: number
  title: string
  editorDescription: string
  sourceType?: StudioEpisodeStoryboardSegmentSourceType | null
  source_type?: StudioEpisodeStoryboardSegmentSourceType | null
  status?: number | null
  statusName?: string
  progress?: number | null
  taskId?: string | number | null
  shouldPoll?: boolean
  canEdit?: boolean
  error?: string
  durationSeconds?: number | null
  suggestedDurationSeconds?: number | null
  manuallyEdited?: boolean
  manuallyAdded?: boolean
  revisionNo?: number | null
  primaryImageId?: string | number | null
  coverFileId?: string | number | null
  coverUrl?: string | null
  shots: StudioEpisodeStoryboardShot[]
  assetReferences?: StudioEpisodeStoryboardAssetReference[]
  referenceSelection?: StudioEpisodeStoryboardReferenceSelection | null
  directorPrompt?: StudioEpisodeStoryboardDirectorPrompt | null
  imagePrompt?: StudioEpisodeStoryboardDirectorPrompt | null
}

export type StudioEpisodeStoryboardEditorResult = {
  scriptImportId?: string | number | null
  episodeId?: string | number | null
  episodeIndex?: number | null
  episodeTitle?: string
  canEnterEditor: boolean
  shouldPoll: boolean
  sourceChanged: boolean
  assetReadiness?: StudioEpisodeStoryboardAssetReadiness
  storyboard?: StudioEpisodeStoryboardRun | null
  segments: StudioEpisodeStoryboardSegment[]
}

export type StudioEpisodeStoryboardSegmentDetailResult = StudioEpisodeStoryboardSegment & {
  runId?: string | number | null
  episodeId?: string | number | null
}

export type StudioEpisodeStoryboardSegmentUpdateRequest = {
  id: string | number
  description: string
}

export type StudioEpisodeStoryboardSegmentInsertRequest = {
  id: string | number
  description: string
}

export type StudioEpisodeStoryboardSegmentDeleteRequest = {
  id: string | number
}

export type StudioEpisodeStoryboardSegmentMergeUpRequest = {
  id: string | number
  previousSegmentId: string | number
  previousRevisionNo: number
  currentRevisionNo: number
  description: string
}

export type StudioStoryboardVideoPromptRegenerateRequest = {
  segmentId: string | number
}

export type StudioStoryboardVideoPromptRegenerateResult = {
  id: string | number
  segmentId?: string | number | null
  taskId?: string | number | null
  status?: number | null
  progress?: number | null
}

export type StudioStoryboardVideoPromptDetailResult = {
  id?: string | number | null
  segmentId?: string | number | null
  taskId?: string | number | null
  textModelId?: number | null
  videoModelId?: number | null
  status?: number | null
  progress?: number | null
  segmentRevision?: number | null
  sourceChanged: boolean
  durationSeconds?: number | null
  suggestedDurationSeconds?: number | null
  generateAudio?: boolean
  prompt?: string | null
  promptCharacters?: number | null
  maxPromptCharacters?: number | null
  references: StudioEpisodeStoryboardPromptReference[]
  result?: unknown
  error?: string
  usage?: unknown
  createdAt?: string
  finishedAt?: string | null
  stage?: string
  stageName?: string
}

export type StudioStoryboardMediaType = 'image' | 'video'

export type StudioStoryboardMediaHistoryItem = {
  mediaType: StudioStoryboardMediaType
  id: string
  segmentId?: string | number | null
  taskId?: string | number | null
  versionNo?: number | null
  modelId?: number | null
  modelName?: string
  prompt?: string
  aspectRatio?: string
  resolution?: string
  generateAudio?: boolean
  visualStyleId?: number | null
  visualStyleName?: string | null
  toneStyleId?: number | null
  toneStyleName?: string | null
  status?: number | null
  progress?: number | null
  outputFileId?: string | number | null
  outputUrl?: string | null
  durationSeconds?: number | null
  primary?: boolean | null
  createdAt?: string
  finishedAt?: string
  itemKey?: string
  thumbnailUrl?: string | null
  statusName?: string
}

export type StudioStoryboardVideoDetailResult = StudioStoryboardMediaHistoryItem & {
  templateId?: string | number | null
  providerTaskId?: string | null
  error?: string
  creditCost?: number
  references: StudioEpisodeStoryboardPromptReference[]
}

export type StudioAssetImageOptionsUpdateRequest = {
  id: number
  prompt: string
  lookId: number | null
  aspectRatio: string
  visualStyleId: number | null
}

export type StudioAssetPrimaryImageRequest = {
  assetId: number
  versionId: number
  lookId: number
}

export type StudioAssetCopyrightReviewRequest = {
  assetId: number
  versionId: number
}

export type StudioAssetCopyrightReviewResult = {
  versionId: number
  reviewStatus: number | null
  reviewStatusName: string | null
  riskLevel: number | null
  riskLevelName: string | null
  riskScore: number | null
  findings: string | null
  reviewMethod: string | null
  reviewedAt: string | null
  resultMessage: string | null
  disclaimer: string | null
}

export type StudioAssetLookUploadRequest = {
  assetId: number
  name: string
  file: File
}

export type StudioAssetLookGenerateRequest = {
  assetId: number
  name: string
  prompt: string
  referenceFileIds: number[]
  aspectRatio: string
  visualStyleId: number | null
  quality: number | null
  resolution: number
  modelId: number
}

export type StudioAssetLookEpisodeSelectionRequest = {
  lookId: number
  episodeId: number
  selected: boolean
}

export type StudioAssetLookRenameRequest = {
  lookId: number
  name: string
}

export type StudioAssetLookItem = {
  id: string
  lookCode?: string
  name: string
  description?: string
  prompt?: string
  aspectRatio?: string
  visualStyleId?: number | null
  quality?: number | null
  resolution?: number | null
  modelId?: number | null
  status?: number | null
  statusName?: string
  defaultLook?: boolean
  coverFileId?: string
  coverUrl?: string
  episodeIds: string[]
  createdAt?: string
  updatedAt?: string
}

export type StudioAssetImageHistoryItem = {
  id: string
  fileId?: string
  fileUrl?: string
  imageUrl?: string
  thumbnailUrl?: string
  versionId?: string
  taskId?: string | null
  characterLookId?: number | null
  characterLookName?: string | null
  operationType?: number | null
  operationTypeName?: string | null
  versionNo?: number | null
  versionLabel?: string | null
  isCurrent?: boolean
  primary?: boolean
  status?: number | null
  statusName?: string | null
  progress?: number | null
  copyrightReviewStatus?: number | null
  copyrightReviewStatusName?: string | null
  copyrightRiskLevel?: number | null
  copyrightRiskLevelName?: string | null
  createdAt?: string
  updatedAt?: string
  prompt?: string
  aspectRatio?: string
  visualStyleId?: number | null
  quality?: number | null
  modelId?: number | null
  modelName?: string | null
  resolution?: number | null
  lookId?: number | null
  error?: string | null
  usage?: unknown
}

export type StudioAssetReferenceItem = {
  id: string
  fileId?: string
  name: string
  url?: string
  mimeType?: string
  sizeBytes?: number
  sortOrder?: number
  createdAt?: string
}

export type StudioAssetReferenceListResult = {
  total: number
  maxCount: number
  list: StudioAssetReferenceItem[]
}

export type StudioAssetReferenceAttachRequest = {
  assetId: number
  fileId: string
}

export type StudioAssetImageTaskDetail = {
  createdAt?: string | null
  updatedAt?: string | null
  id: string | number
  mode?: string | null
  taskKind?: string | null
  status: number
  progress?: number | null
  payload?: string | null
  result?: string | null
  error?: string | null
  cancelRequested?: boolean
  cancelRequestedAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  cancelReason?: string | null
  cancelledAt?: string | null
  executorType?: string | null
  executorTaskId?: string | null
  statusName?: string | null
}

export type StudioAssetImageTaskResult = {
  fileId?: string | number | null
  versionId?: string | number | null
}

export type StudioAssetImageTaskRequest<T> = {
  promise: Promise<T>
  cancel: () => void
}

function createAssetImageTask(
  requestBody: StudioAssetImageGenerateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/generate',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function updateAssetImageOptions(
  requestBody: StudioAssetImageOptionsUpdateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/imageOptions/update',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function estimateAssetGenerateCredits(
  requestBody: StudioAssetGenerateEstimateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/assets/generate/estimate',
    query: requestBody,
    errors: {
      422: 'Validation Error',
    },
  })
}

function estimateEpisodeAssetsGenerateCredits(
  requestBody: StudioEpisodeAssetsGenerateEstimateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  const { episodeId, ...query } = requestBody
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/episodes/assets/generate/estimate',
    query: episodeId === undefined || episodeId === null || String(episodeId).trim() === ''
      ? query
      : { ...query, episodeId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function estimateStoryboardVideoGenerateCredits(
  requestBody: StudioStoryboardVideoGenerateEstimateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/storyboards/videos/generate/estimate',
    query: requestBody,
    errors: {
      422: 'Validation Error',
    },
  })
}

function createStoryboardVideoGenerateTask(
  requestBody: StudioStoryboardVideoGenerateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/storyboards/videos/generate',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getStoryboardVideoDetail(
  id: string | number,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/storyboards/videos/detail',
    query: { id },
    errors: {
      422: 'Validation Error',
    },
  })
}

function getStoryboardVideoReferenceOptions(
  requestBody: StudioStoryboardVideoReferenceOptionsRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/storyboards/videos/references/options',
    query: requestBody,
    errors: {
      422: 'Validation Error',
    },
  })
}

function addStoryboardVideoReferences(
  requestBody: StudioStoryboardVideoReferenceAddRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/storyboards/videos/references/add',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function deleteStoryboardVideoReference(
  requestBody: StudioStoryboardVideoReferenceDeleteRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/storyboards/videos/references/delete',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function applyStoryboardImageSkill(
  requestBody: StudioStoryboardImageSkillRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/storyboards/images/applySkill',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function undoStoryboardImageSkill(
  requestBody: StudioStoryboardImageSkillRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/storyboards/images/undoSkill',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function createEpisodeAssetsGenerateTask(
  requestBody: StudioEpisodeAssetsGenerateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  const { episodeId, ...body } = requestBody
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/episodes/assets/generate',
    body: episodeId === undefined || episodeId === null || String(episodeId).trim() === ''
      ? body
      : { ...body, episodeId },
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getEpisodeAssetsGenerateStatus(
  requestBody: StudioEpisodeAssetsGenerateStatusRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  const { episodeId, ...query } = requestBody
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/episodes/assets/generate/status',
    query: episodeId === undefined || episodeId === null || String(episodeId).trim() === ''
      ? query
      : { ...query, episodeId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function confirmEpisodeAssets(
  requestBody: StudioEpisodeAssetsConfirmRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/episodes/assets/confirm',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getEpisodeStoryboardEditor(
  requestBody: StudioEpisodeStoryboardEditorRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/episodes/storyboards/editor',
    query: requestBody,
    errors: {
      422: 'Validation Error',
    },
  })
}

function getEpisodeStoryboardDetail(
  id: string | number,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/episodes/storyboards/detail',
    query: { id },
    errors: {
      422: 'Validation Error',
    },
  })
}

function getEpisodeStoryboardSegmentDetail(
  id: string | number,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/episodes/storyboards/segments/detail',
    query: { id },
    errors: {
      422: 'Validation Error',
    },
  })
}

function updateEpisodeStoryboardSegment(
  requestBody: StudioEpisodeStoryboardSegmentUpdateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/episodes/storyboards/segments/update',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function insertEpisodeStoryboardSegmentUp(
  requestBody: StudioEpisodeStoryboardSegmentInsertRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/episodes/storyboards/segments/insertUp',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function insertEpisodeStoryboardSegmentDown(
  requestBody: StudioEpisodeStoryboardSegmentInsertRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/episodes/storyboards/segments/insertDown',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function deleteEpisodeStoryboardSegment(
  requestBody: StudioEpisodeStoryboardSegmentDeleteRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/episodes/storyboards/segments/delete',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function mergeEpisodeStoryboardSegmentUp(
  requestBody: StudioEpisodeStoryboardSegmentMergeUpRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/episodes/storyboards/segments/mergeUp',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function regenerateStoryboardVideoPrompt(
  requestBody: StudioStoryboardVideoPromptRegenerateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/storyboards/videos/prompts/regenerate',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getStoryboardVideoPromptDetail(
  id: string | number,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/storyboards/videos/prompts/detail',
    query: { id },
    errors: {
      422: 'Validation Error',
    },
  })
}

function getStoryboardMediaHistory(
  segmentId: string | number,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/storyboards/media/history',
    query: { segmentId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function getAssetImageHistory(
  assetId: number,
  lookId?: number | null,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/assets/images/history',
    query: lookId === undefined || lookId === null
      ? { assetId }
      : { assetId, lookId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function reviewAssetImageCopyright(
  requestBody: StudioAssetCopyrightReviewRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/images/copyright-review',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function setAssetPrimaryImage(
  requestBody: StudioAssetPrimaryImageRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/images/primary',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getAssetLooks(
  assetId: number,
  episodeId?: string | number,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/assets/looks',
    query: episodeId === undefined || episodeId === null || String(episodeId).trim() === ''
      ? { assetId }
      : { assetId, episodeId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function uploadAssetLook(
  requestBody: StudioAssetLookUploadRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/looks/upload',
    formData: requestBody,
    mediaType: 'multipart/form-data',
    errors: {
      422: 'Validation Error',
    },
  })
}

function generateAssetLook(
  requestBody: StudioAssetLookGenerateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/looks/generate',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function updateAssetLookEpisodeSelection(
  requestBody: StudioAssetLookEpisodeSelectionRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/looks/episodeSelection',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function renameAssetLook(
  requestBody: StudioAssetLookRenameRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/looks/rename',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getAssetReferences(
  assetId: number,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/assets/references',
    query: { assetId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function uploadAssetReference(
  assetId: number,
  file: File,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/references',
    formData: { assetId, file },
    mediaType: 'multipart/form-data',
    errors: {
      422: 'Validation Error',
    },
  })
}

function attachAssetReference(
  requestBody: StudioAssetReferenceAttachRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/references',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getAssetImageTaskDetail(
  id: string,
): CancelablePromise<ApiEnvelope<StudioAssetImageTaskDetail>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/film/tasks/detail',
    query: { id },
    errors: {
      422: 'Validation Error',
    },
  })
}

function normalizeTaskId(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeHistoryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function normalizeHistoryBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return undefined
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const normalized = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(normalized) ? normalized : undefined
}

function parseHistoryPayload(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object') return asRecord(value)
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return asRecord(JSON.parse(value) as unknown)
  } catch {
    return null
  }
}

function extractHistoryRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const record = asRecord(data)
  if (!record) return []
  for (const key of ['list', 'items', 'records', 'images', 'content', 'rows', 'history']) {
    if (Array.isArray(record[key])) return record[key] as unknown[]
  }
  return [record]
}

function normalizeAssetImageHistory(data: unknown): StudioAssetImageHistoryItem[] {
  const seen = new Set<string>()
  const result: StudioAssetImageHistoryItem[] = []

  extractHistoryRows(data).forEach((value, index) => {
    if (typeof value === 'string' || typeof value === 'number') {
      const imageUrl = normalizeHistoryValue(value)
      if (!imageUrl || seen.has(imageUrl)) return
      seen.add(imageUrl)
      result.push({ id: `history-${index}`, imageUrl })
      return
    }

    const record = asRecord(value)
    if (!record) return
    const payload = parseHistoryPayload(record.payload)
    const file = asRecord(record.file)
    const fileId = normalizeHistoryValue(
      record.fileId
      ?? record.file_id
      ?? record.imageFileId
      ?? record.image_file_id
      ?? record.resultFileId
      ?? record.coverFileId
      ?? file?.id,
    )
    const imageUrl = normalizeHistoryValue(
      record.imageUrl
      ?? record.image_url
      ?? record.fileUrl
      ?? record.file_url
      ?? record.coverUrl
      ?? record.cover_url
      ?? record.downloadUrl
      ?? record.download_url
      ?? record.previewUrl
      ?? record.preview_url
      ?? record.url
      ?? file?.url
      ?? file?.downloadUrl
      ?? file?.previewUrl,
    )
    const thumbnailUrl = normalizeHistoryValue(
      record.thumbnailUrl
      ?? record.thumbnail_url
      ?? record.thumbUrl
      ?? record.thumb_url
      ?? record.thumbnail,
    )
    const versionId = normalizeHistoryValue(record.versionId ?? record.version_id)
    const taskId = normalizeHistoryValue(record.taskId ?? record.task_id) ?? null
    const dedupeKey = versionId
      ?? normalizeHistoryValue(record.id)
      ?? fileId
      ?? imageUrl
      ?? thumbnailUrl
    if (!dedupeKey || seen.has(dedupeKey)) return
    seen.add(dedupeKey)

    const characterLookId = normalizeFiniteNumber(
      record.characterLookId
        ?? record.character_look_id
        ?? record.lookId
        ?? record.look_id
        ?? payload?.characterLookId
        ?? payload?.lookId,
    ) ?? null
    const primary = normalizeHistoryBoolean(
      record.primary
        ?? record.isCurrent
        ?? record.current
        ?? record.selected
        ?? record.main,
    )
    result.push({
      id: versionId
        ?? normalizeHistoryValue(record.id)
        ?? fileId
        ?? imageUrl
        ?? thumbnailUrl
        ?? `history-${index}`,
      fileId,
      fileUrl: imageUrl,
      imageUrl,
      thumbnailUrl,
      versionId,
      taskId,
      characterLookId,
      characterLookName: normalizeHistoryValue(
        record.characterLookName ?? record.character_look_name,
      ) ?? null,
      operationType: normalizeFiniteNumber(
        record.operationType ?? record.operation_type,
      ) ?? null,
      operationTypeName: normalizeHistoryValue(
        record.operationTypeName ?? record.operation_type_name,
      ) ?? null,
      versionNo: normalizeFiniteNumber(record.versionNo ?? record.version_no) ?? null,
      versionLabel: normalizeHistoryValue(record.versionLabel ?? record.version_label) ?? null,
      isCurrent: primary,
      primary,
      status: normalizeFiniteNumber(record.status) ?? null,
      statusName: normalizeHistoryValue(record.statusName ?? record.status_name) ?? null,
      progress: normalizeFiniteNumber(record.progress) ?? null,
      copyrightReviewStatus: normalizeFiniteNumber(
        record.copyrightReviewStatus ?? record.copyright_review_status,
      ) ?? null,
      copyrightReviewStatusName: normalizeHistoryValue(
        record.copyrightReviewStatusName ?? record.copyright_review_status_name,
      ) ?? null,
      copyrightRiskLevel: normalizeFiniteNumber(
        record.copyrightRiskLevel ?? record.copyright_risk_level,
      ) ?? null,
      copyrightRiskLevelName: normalizeHistoryValue(
        record.copyrightRiskLevelName ?? record.copyright_risk_level_name,
      ) ?? null,
      createdAt: normalizeHistoryValue(record.createdAt ?? record.created_at),
      updatedAt: normalizeHistoryValue(record.updatedAt ?? record.updated_at),
      prompt: normalizeHistoryValue(record.prompt ?? payload?.prompt),
      aspectRatio: normalizeHistoryValue(record.aspectRatio ?? record.aspect_ratio ?? payload?.aspectRatio),
      visualStyleId: normalizeFiniteNumber(
        record.visualStyleId ?? record.visual_style_id ?? payload?.visualStyleId,
      ) ?? null,
      quality: normalizeFiniteNumber(record.quality ?? payload?.quality) ?? null,
      modelId: normalizeFiniteNumber(record.modelId ?? record.model_id ?? payload?.modelId) ?? null,
      modelName: normalizeHistoryValue(record.modelName ?? record.model_name) ?? null,
      resolution: normalizeFiniteNumber(record.resolution ?? payload?.resolution) ?? null,
      lookId: characterLookId,
      error: typeof record.error === 'string'
        ? record.error
        : normalizeHistoryValue(record.error) ?? null,
      usage: record.usage ?? payload?.usage ?? null,
    })
  })

  return result
}

function normalizeAssetCopyrightReview(data: unknown): StudioAssetCopyrightReviewResult {
  const record = asRecord(data)
  const versionId = normalizeFiniteNumber(record?.versionId ?? record?.version_id)
  if (!record || versionId === undefined) {
    throw new Error('Copyright review returned invalid data')
  }
  return {
    versionId,
    reviewStatus: normalizeFiniteNumber(record.reviewStatus ?? record.review_status) ?? null,
    reviewStatusName: normalizeHistoryValue(
      record.reviewStatusName ?? record.review_status_name,
    ) ?? null,
    riskLevel: normalizeFiniteNumber(record.riskLevel ?? record.risk_level) ?? null,
    riskLevelName: normalizeHistoryValue(record.riskLevelName ?? record.risk_level_name) ?? null,
    riskScore: normalizeFiniteNumber(record.riskScore ?? record.risk_score) ?? null,
    findings: normalizeHistoryValue(record.findings) ?? null,
    reviewMethod: normalizeHistoryValue(record.reviewMethod ?? record.review_method) ?? null,
    reviewedAt: normalizeHistoryValue(record.reviewedAt ?? record.reviewed_at) ?? null,
    resultMessage: normalizeHistoryValue(record.resultMessage ?? record.result_message) ?? null,
    disclaimer: normalizeHistoryValue(record.disclaimer) ?? null,
  }
}

function normalizeAssetReferences(data: unknown): StudioAssetReferenceListResult {
  const record = asRecord(data)
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(record?.list)
      ? record.list
      : []
  const seen = new Set<string>()
  const list = rows.flatMap((value, index): StudioAssetReferenceItem[] => {
    const item = asRecord(value)
    if (!item) return []
    const file = asRecord(item.file)
    const fileId = normalizeHistoryValue(
      item.fileId ?? item.file_id ?? item.imageFileId ?? item.image_file_id ?? file?.id,
    )
    const url = normalizeHistoryValue(
      item.url
      ?? item.fileUrl
      ?? item.file_url
      ?? item.imageUrl
      ?? item.image_url
      ?? file?.url
      ?? file?.downloadUrl,
    )
    const id = normalizeHistoryValue(item.id) ?? fileId ?? url ?? `reference-${index}`
    const dedupeKey = fileId ? `file:${fileId}` : url ? `url:${url}` : `id:${id}`
    if ((!fileId && !url) || seen.has(dedupeKey)) return []
    seen.add(dedupeKey)
    return [{
      id,
      fileId,
      name: normalizeHistoryValue(item.name ?? item.fileName ?? item.file_name)
        ?? `reference-${index + 1}`,
      url,
      mimeType: normalizeHistoryValue(item.mimeType ?? item.mime_type),
      sizeBytes: normalizeFiniteNumber(item.sizeBytes ?? item.size_bytes),
      sortOrder: normalizeFiniteNumber(item.sortOrder ?? item.sort_order),
      createdAt: normalizeHistoryValue(item.createdAt ?? item.created_at),
    }]
  })
  const rawMaxCount = normalizeFiniteNumber(record?.maxCount ?? record?.max_count)
  const maxCount = rawMaxCount === undefined
    ? 14
    : Math.max(0, Math.floor(rawMaxCount))
  const rawTotal = normalizeFiniteNumber(record?.total)

  return {
    total: rawTotal === undefined ? list.length : Math.max(0, Math.floor(rawTotal)),
    maxCount,
    list,
  }
}

function normalizeNumberOrNull(value: unknown): number | null {
  const normalized = normalizeFiniteNumber(value)
  return normalized === undefined ? null : normalized
}

function normalizeAssetGenerateEstimate(data: unknown): StudioAssetGenerateEstimateResult {
  const record = asRecord(data)
  const creditCost = normalizeFiniteNumber(record?.creditCost)
  return {
    modelId: normalizeNumberOrNull(record?.modelId),
    modelName: typeof record?.modelName === 'string' ? record.modelName : undefined,
    quality: typeof record?.quality === 'string' || typeof record?.quality === 'number'
      ? record.quality
      : null,
    resolution: normalizeNumberOrNull(record?.resolution),
    billingUnit: typeof record?.billingUnit === 'string' ? record.billingUnit : undefined,
    creditCost: creditCost ?? 0,
  }
}

function normalizeEpisodeAssetsGenerateEstimate(data: unknown): StudioEpisodeAssetsGenerateEstimateResult {
  const record = asRecord(data)
  return {
    scriptImportId: typeof record?.scriptImportId === 'string' || typeof record?.scriptImportId === 'number'
      ? record.scriptImportId
      : null,
    chapterId: typeof record?.chapterId === 'string' || typeof record?.chapterId === 'number'
      ? record.chapterId
      : null,
    episodeIndex: normalizeNumberOrNull(record?.episodeIndex),
    modelId: normalizeNumberOrNull(record?.modelId),
    modelName: typeof record?.modelName === 'string' ? record.modelName : undefined,
    quality: typeof record?.quality === 'string' || typeof record?.quality === 'number'
      ? record.quality
      : null,
    resolution: normalizeNumberOrNull(record?.resolution),
    totalCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.totalCount) ?? 0)),
    generatedCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.generatedCount) ?? 0)),
    pendingCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.pendingCount) ?? 0)),
    unitCreditCost: normalizeFiniteNumber(record?.unitCreditCost) ?? 0,
    totalCreditCost: normalizeFiniteNumber(record?.totalCreditCost) ?? 0,
  }
}

function normalizeStoryboardVideoGenerateEstimate(data: unknown): StudioStoryboardVideoGenerateEstimateResult {
  const record = asRecord(data)
  return {
    modelId: normalizeNumberOrNull(record?.modelId ?? record?.model_id),
    modelName: normalizeHistoryValue(record?.modelName ?? record?.model_name),
    resolution: normalizeHistoryValue(record?.resolution),
    durationSeconds: Math.max(
      0,
      Math.floor(normalizeFiniteNumber(record?.durationSeconds ?? record?.duration_seconds) ?? 0),
    ),
    generateAudio: normalizeHistoryBoolean(record?.generateAudio ?? record?.generate_audio),
    referenceVideoDurationSeconds: normalizeFiniteNumber(
      record?.referenceVideoDurationSeconds ?? record?.reference_video_duration_seconds,
    ),
    billingUnit: normalizeHistoryValue(record?.billingUnit ?? record?.billing_unit),
    billableQuantity: normalizeFiniteNumber(record?.billableQuantity ?? record?.billable_quantity),
    unitCreditCost: normalizeFiniteNumber(record?.unitCreditCost ?? record?.unit_credit_cost),
    creditCost: normalizeFiniteNumber(record?.creditCost ?? record?.credit_cost) ?? 0,
    estimated: normalizeHistoryBoolean(record?.estimated),
    pricingSource: normalizeHistoryValue(record?.pricingSource ?? record?.pricing_source),
    priceValidUntil: normalizeHistoryValue(record?.priceValidUntil ?? record?.price_valid_until) ?? null,
  }
}

function normalizeEpisodeAssetsGenerateStatus(data: unknown): StudioEpisodeAssetsGenerateStatusResult {
  const record = asRecord(data)
  const rows = Array.isArray(record?.items) ? record.items : []
  return {
    scriptImportId: typeof record?.scriptImportId === 'string' || typeof record?.scriptImportId === 'number'
      ? record.scriptImportId
      : null,
    episodeId: typeof record?.episodeId === 'string' || typeof record?.episodeId === 'number'
      ? record.episodeId
      : null,
    episodeIndex: normalizeNumberOrNull(record?.episodeIndex),
    totalCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.totalCount) ?? 0)),
    generatedCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.generatedCount) ?? 0)),
    generatingCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.generatingCount) ?? 0)),
    pendingCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.pendingCount) ?? 0)),
    failedCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.failedCount) ?? 0)),
    allGenerated: Boolean(normalizeHistoryBoolean(record?.allGenerated)),
    shouldPoll: Boolean(normalizeHistoryBoolean(record?.shouldPoll)),
    batch: record?.batch,
    items: rows.flatMap((value): StudioEpisodeAssetsGenerateStatusItem[] => {
      const item = asRecord(value)
      if (!item) return []
      return [{
        scopeKey: typeof item.scopeKey === 'string' || typeof item.scopeKey === 'number' ? item.scopeKey : null,
        scopeCode: normalizeHistoryValue(item.scopeCode),
        assetId: normalizeNumberOrNull(item.assetId),
        assetType: normalizeNumberOrNull(item.assetType),
        assetName: normalizeHistoryValue(item.assetName),
        characterLookId: normalizeNumberOrNull(item.characterLookId),
        characterLookName: normalizeHistoryValue(item.characterLookName) ?? null,
        coverFileId: normalizeHistoryValue(item.coverFileId) ?? null,
        coverUrl: normalizeHistoryValue(item.coverUrl) ?? null,
        status: normalizeNumberOrNull(item.status),
        statusName: normalizeHistoryValue(item.statusName),
        taskId: normalizeHistoryValue(item.taskId) ?? null,
        progress: normalizeNumberOrNull(item.progress),
        error: normalizeHistoryValue(item.error),
      }]
    }),
  }
}

function normalizeStoryboardAssetReadiness(data: unknown): StudioEpisodeStoryboardAssetReadiness | undefined {
  const record = asRecord(data)
  if (!record) return undefined
  return {
    totalCount: Math.max(0, Math.floor(normalizeFiniteNumber(record.totalCount ?? record.total_count) ?? 0)),
    readyCount: Math.max(0, Math.floor(normalizeFiniteNumber(record.readyCount ?? record.ready_count) ?? 0)),
    generatingCount: Math.max(0, Math.floor(normalizeFiniteNumber(record.generatingCount ?? record.generating_count) ?? 0)),
    missingCount: Math.max(0, Math.floor(normalizeFiniteNumber(record.missingCount ?? record.missing_count) ?? 0)),
    failedCount: Math.max(0, Math.floor(normalizeFiniteNumber(record.failedCount ?? record.failed_count) ?? 0)),
    unconfirmedCount: Math.max(0, Math.floor(normalizeFiniteNumber(record.unconfirmedCount ?? record.unconfirmed_count) ?? 0)),
  }
}

function normalizeStoryboardRun(data: unknown): StudioEpisodeStoryboardRun | null {
  const record = asRecord(data)
  if (!record) return null
  return {
    runId: normalizeHistoryValue(record.runId ?? record.run_id ?? record.id) ?? null,
    episodeId: normalizeHistoryValue(record.episodeId ?? record.episode_id) ?? null,
    taskId: normalizeHistoryValue(record.taskId ?? record.task_id) ?? null,
    status: normalizeNumberOrNull(record.status),
    statusName: normalizeHistoryValue(record.statusName ?? record.status_name),
    progress: normalizeNumberOrNull(record.progress),
    skillStage: normalizeHistoryValue(record.skillStage ?? record.skill_stage),
    shouldPoll: Boolean(normalizeHistoryBoolean(record.shouldPoll ?? record.should_poll)),
    canEdit: normalizeHistoryBoolean(record.canEdit ?? record.can_edit),
    error: normalizeHistoryValue(record.error),
    createdAt: normalizeHistoryValue(record.createdAt ?? record.created_at),
    finishedAt: normalizeHistoryValue(record.finishedAt ?? record.finished_at),
  }
}

function normalizeStoryboardShots(data: unknown): StudioEpisodeStoryboardShot[] {
  const rows = Array.isArray(data) ? data : []
  return rows.flatMap((value, index): StudioEpisodeStoryboardShot[] => {
    const item = asRecord(value)
    if (!item) return []
    return [{
      id: normalizeHistoryValue(item.id ?? item.shotId ?? item.shot_id) ?? `shot-${index + 1}`,
      shotIndex: normalizeNumberOrNull(item.shotIndex ?? item.shot_index ?? item.index),
      title: normalizeHistoryValue(item.title ?? item.name),
      editorDescription: normalizeHistoryValue(
        item.editorDescription
          ?? item.editor_description
          ?? item.description
          ?? item.prompt,
      ),
      coverFileId: normalizeHistoryValue(item.coverFileId ?? item.cover_file_id ?? item.primaryImageId ?? item.primary_image_id) ?? null,
      coverUrl: normalizeHistoryValue(item.coverUrl ?? item.cover_url ?? item.imageUrl ?? item.image_url) ?? null,
    }]
  })
}

function normalizeStoryboardAssetReferenceRows(data: unknown): StudioEpisodeStoryboardAssetReference[] {
  const rows = Array.isArray(data) ? data : []
  return rows.flatMap((value): StudioEpisodeStoryboardAssetReference[] => {
    const item = asRecord(value)
    if (!item) return []
    const assetName = normalizeHistoryValue(item.assetName ?? item.asset_name ?? item.name)
    if (!assetName) return []
    return [{
      scopeCode: normalizeHistoryValue(item.scopeCode ?? item.scope_code),
      assetId: normalizeNumberOrNull(item.assetId ?? item.asset_id),
      assetType: normalizeNumberOrNull(item.assetType ?? item.asset_type),
      assetName,
      characterLookId: normalizeNumberOrNull(item.characterLookId ?? item.character_look_id),
      characterLookName: normalizeHistoryValue(item.characterLookName ?? item.character_look_name) ?? null,
      coverFileId: normalizeHistoryValue(item.coverFileId ?? item.cover_file_id) ?? null,
      coverUrl: normalizeHistoryValue(item.coverUrl ?? item.cover_url ?? item.imageUrl ?? item.image_url) ?? null,
    }]
  })
}

function normalizeStoryboardPromptReferences(data: unknown): StudioEpisodeStoryboardPromptReference[] {
  const rows = Array.isArray(data) ? data : []
  return rows.flatMap((value, index): StudioEpisodeStoryboardPromptReference[] => {
    const item = asRecord(value)
    if (!item) return []
    const referenceToken = normalizeHistoryValue(
      item.referenceToken
        ?? item.reference_token
        ?? item.token,
    ) ?? `@图片${index + 1}`
    const displayName = normalizeHistoryValue(
      item.displayName
        ?? item.display_name
        ?? item.assetName
        ?? item.asset_name
        ?? item.name,
    ) ?? referenceToken
    return [{
      referenceIndex: normalizeNumberOrNull(item.referenceIndex ?? item.reference_index ?? item.index),
      referenceKey: normalizeHistoryValue(item.referenceKey ?? item.reference_key) ?? null,
      referenceType: normalizeNumberOrNull(item.referenceType ?? item.reference_type ?? item.assetType ?? item.asset_type),
      referenceTypeName: normalizeHistoryValue(item.referenceTypeName ?? item.reference_type_name),
      referenceToken,
      fileId: normalizeHistoryValue(item.fileId ?? item.file_id ?? item.coverFileId ?? item.cover_file_id) ?? null,
      fileUrl: normalizeHistoryValue(
        item.fileUrl
          ?? item.file_url
          ?? item.coverUrl
          ?? item.cover_url
          ?? item.imageUrl
          ?? item.image_url,
      ) ?? null,
      displayName,
      matchNames: normalizeStringList(item.matchNames ?? item.match_names),
    }]
  })
}

function normalizeStoryboardReferenceSelection(data: unknown): StudioEpisodeStoryboardReferenceSelection | null {
  const record = asRecord(data)
  if (!record) return null
  return {
    revisionNo: normalizeNumberOrNull(record.revisionNo ?? record.revision_no),
    references: normalizeStoryboardPromptReferences(record.references),
  }
}

function normalizeStoryboardVideoReferenceOptionSource(
  value: unknown,
  fallback: StudioStoryboardVideoReferenceOptionSource,
): StudioStoryboardVideoReferenceOptionSource {
  const source = normalizeHistoryValue(value)
  if (source === 'character' || source === 'scene' || source === 'prop' || source === 'dubbing') {
    return source
  }
  return fallback
}

function normalizeStoryboardSegmentSourceType(value: unknown): StudioEpisodeStoryboardSegmentSourceType | undefined {
  const sourceType = normalizeNumberOrNull(value)
  if (sourceType === 1 || sourceType === 2 || sourceType === 3) return sourceType
  return undefined
}

function normalizeStoryboardVideoReferenceOptions(
  data: unknown,
  fallbackSource: StudioStoryboardVideoReferenceOptionSource,
): StudioStoryboardVideoReferenceOption[] {
  const record = asRecord(data)
  const referenceSelectionRecord = asRecord(record?.referenceSelection ?? record?.reference_selection)
  const referenceSelection = normalizeStoryboardReferenceSelection(referenceSelectionRecord)
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(record?.options)
      ? record.options as unknown[]
      : Array.isArray(record?.references)
        ? record.references as unknown[]
        : Array.isArray(referenceSelectionRecord?.references)
          ? referenceSelectionRecord.references as unknown[]
          : extractHistoryRows(data)

  return rows.flatMap((value): StudioStoryboardVideoReferenceOption[] => {
    const item = asRecord(value)
    if (!item) return []
    const source = normalizeStoryboardVideoReferenceOptionSource(item.source, fallbackSource)
    const itemReferenceSelection = normalizeStoryboardReferenceSelection(item.referenceSelection ?? item.reference_selection)
    const displayName = normalizeHistoryValue(
      item.displayName
        ?? item.display_name
        ?? item.characterName
        ?? item.character_name
        ?? item.assetName
        ?? item.asset_name
        ?? item.voiceName
        ?? item.voice_name
        ?? item.name,
    )
    if (!displayName) return []
    return [{
      source,
      referenceType: normalizeNumberOrNull(item.referenceType ?? item.reference_type),
      fileId: normalizeHistoryValue(item.fileId ?? item.file_id ?? item.coverFileId ?? item.cover_file_id) ?? null,
      fileUrl: normalizeHistoryValue(
        item.fileUrl
          ?? item.file_url
          ?? item.coverUrl
          ?? item.cover_url
          ?? item.imageUrl
          ?? item.image_url,
      ) ?? null,
      displayName,
      assetId: normalizeHistoryValue(item.assetId ?? item.asset_id) ?? null,
      characterLookId: normalizeHistoryValue(item.characterLookId ?? item.character_look_id) ?? null,
      sourceSegmentId: normalizeHistoryValue(item.sourceSegmentId ?? item.source_segment_id) ?? null,
      durationSeconds: normalizeNumberOrNull(item.durationSeconds ?? item.duration_seconds),
      audioSource: normalizeHistoryValue(item.audioSource ?? item.audio_source) ?? null,
      voiceId: normalizeHistoryValue(item.voiceId ?? item.voice_id) ?? null,
      voiceName: normalizeHistoryValue(item.voiceName ?? item.voice_name) ?? null,
      characterName: normalizeHistoryValue(item.characterName ?? item.character_name) ?? null,
      dubbingGenerationId: normalizeHistoryValue(item.dubbingGenerationId ?? item.dubbing_generation_id) ?? null,
      characterCoverUrl: normalizeHistoryValue(item.characterCoverUrl ?? item.character_cover_url) ?? null,
      characterLookName: normalizeHistoryValue(item.characterLookName ?? item.character_look_name) ?? null,
      defaultLook: normalizeHistoryBoolean(item.defaultLook ?? item.default_look),
      selected: Boolean(normalizeHistoryBoolean(item.selected)),
      referenceIndex: normalizeNumberOrNull(item.referenceIndex ?? item.reference_index),
      referenceSelectionRevisionNo: itemReferenceSelection?.revisionNo
        ?? referenceSelection?.revisionNo
        ?? normalizeNumberOrNull(item.referenceSelectionRevisionNo ?? item.reference_selection_revision_no),
      selectable: normalizeHistoryBoolean(item.selectable) ?? true,
      disabledReason: normalizeHistoryValue(item.disabledReason ?? item.disabled_reason) ?? null,
      historical: normalizeHistoryBoolean(item.historical),
      assetName: normalizeHistoryValue(item.assetName ?? item.asset_name) ?? null,
      lookName: normalizeHistoryValue(item.lookName ?? item.look_name) ?? null,
    }]
  })
}

function normalizeStoryboardVideoReferenceDelete(data: unknown): StudioStoryboardVideoReferenceDeleteResult | null {
  const record = asRecord(data)
  if (!record) return null
  const referenceSelection = normalizeStoryboardReferenceSelection(record.referenceSelection ?? record.reference_selection)
  return {
    segmentId: normalizeHistoryValue(record.segmentId ?? record.segment_id) ?? null,
    revisionNo: referenceSelection?.revisionNo ?? null,
  }
}

function normalizeStoryboardPromptMentions(data: unknown): StudioEpisodeStoryboardPromptMention[] {
  const rows = Array.isArray(data) ? data : []
  return rows.flatMap((value): StudioEpisodeStoryboardPromptMention[] => {
    const item = asRecord(value)
    if (!item) return []
    const text = normalizeHistoryValue(item.text)
    if (!text) return []
    return [{
      start: normalizeNumberOrNull(item.start),
      end: normalizeNumberOrNull(item.end),
      text,
      referenceKey: normalizeHistoryValue(item.referenceKey ?? item.reference_key) ?? null,
    }]
  })
}

function normalizeStoryboardDirectorPrompt(data: unknown): StudioEpisodeStoryboardDirectorPrompt | null {
  const record = asRecord(data)
  if (!record) return null
  return {
    id: normalizeHistoryValue(record.id) ?? null,
    taskId: normalizeHistoryValue(record.taskId ?? record.task_id) ?? null,
    status: normalizeNumberOrNull(record.status),
    progress: normalizeNumberOrNull(record.progress),
    skillCode: normalizeHistoryValue(record.skillCode ?? record.skill_code),
    skillName: normalizeHistoryValue(record.skillName ?? record.skill_name),
    textModelId: normalizeNumberOrNull(record.textModelId ?? record.text_model_id),
    videoModelId: normalizeNumberOrNull(record.videoModelId ?? record.video_model_id),
    sourceChanged: Boolean(normalizeHistoryBoolean(record.sourceChanged ?? record.source_changed)),
    durationSeconds: normalizeNumberOrNull(record.durationSeconds ?? record.duration_seconds),
    suggestedDurationSeconds: normalizeNumberOrNull(
      record.suggestedDurationSeconds ?? record.suggested_duration_seconds,
    ),
    generateAudio: normalizeHistoryBoolean(record.generateAudio ?? record.generate_audio),
    prompt: normalizeHistoryValue(record.prompt) ?? '',
    promptCharacters: normalizeNumberOrNull(record.promptCharacters ?? record.prompt_characters),
    maxPromptCharacters: normalizeNumberOrNull(record.maxPromptCharacters ?? record.max_prompt_characters),
    references: normalizeStoryboardPromptReferences(record.references),
    mentions: normalizeStoryboardPromptMentions(record.mentions),
    warnings: normalizeStringList(record.warnings),
    canUndoSkill: normalizeHistoryBoolean(record.canUndoSkill ?? record.can_undo_skill),
    error: normalizeHistoryValue(record.error),
  }
}

function normalizeStoryboardImageSkill(data: unknown): StudioStoryboardImageSkillResult {
  const record = asRecord(data)
  const prompt = normalizeStoryboardDirectorPrompt(data)
  if (!record || !prompt) {
    throw new Error('Storyboard image skill returned invalid data')
  }
  return {
    ...prompt,
    segmentId: normalizeHistoryValue(record.segmentId ?? record.segment_id) ?? null,
  }
}

function normalizeStoryboardVideoPromptRegenerate(data: unknown): StudioStoryboardVideoPromptRegenerateResult {
  const record = asRecord(data)
  const rawId = typeof data === 'string' || typeof data === 'number'
    ? data
    : record?.id ?? record?.promptId ?? record?.prompt_id ?? record?.directorPromptId ?? record?.director_prompt_id
  const id = normalizeHistoryValue(rawId)
  if (!id) throw new Error('Storyboard video prompt regenerate returned no id')
  return {
    id: /^\d+$/.test(id) ? Number(id) : id,
    segmentId: normalizeHistoryValue(record?.segmentId ?? record?.segment_id) ?? null,
    taskId: normalizeHistoryValue(record?.taskId ?? record?.task_id) ?? null,
    status: normalizeNumberOrNull(record?.status),
    progress: normalizeNumberOrNull(record?.progress),
  }
}

function normalizeStoryboardVideoPromptDetail(data: unknown): StudioStoryboardVideoPromptDetailResult {
  const record = asRecord(data)
  const resultRecord = asRecord(record?.result)
  const prompt = normalizeHistoryValue(record?.prompt ?? resultRecord?.prompt ?? record?.result) ?? null
  return {
    id: normalizeHistoryValue(record?.id) ?? null,
    segmentId: normalizeHistoryValue(record?.segmentId ?? record?.segment_id) ?? null,
    taskId: normalizeHistoryValue(record?.taskId ?? record?.task_id) ?? null,
    textModelId: normalizeNumberOrNull(record?.textModelId ?? record?.text_model_id),
    videoModelId: normalizeNumberOrNull(record?.videoModelId ?? record?.video_model_id),
    status: normalizeNumberOrNull(record?.status),
    progress: normalizeNumberOrNull(record?.progress),
    segmentRevision: normalizeNumberOrNull(record?.segmentRevision ?? record?.segment_revision),
    sourceChanged: Boolean(normalizeHistoryBoolean(record?.sourceChanged ?? record?.source_changed)),
    durationSeconds: normalizeNumberOrNull(record?.durationSeconds ?? record?.duration_seconds),
    suggestedDurationSeconds: normalizeNumberOrNull(
      record?.suggestedDurationSeconds ?? record?.suggested_duration_seconds,
    ),
    generateAudio: normalizeHistoryBoolean(record?.generateAudio ?? record?.generate_audio),
    prompt,
    promptCharacters: normalizeNumberOrNull(record?.promptCharacters ?? record?.prompt_characters),
    maxPromptCharacters: normalizeNumberOrNull(record?.maxPromptCharacters ?? record?.max_prompt_characters),
    references: normalizeStoryboardPromptReferences(record?.references),
    result: record?.result,
    error: normalizeHistoryValue(record?.error),
    usage: record?.usage,
    createdAt: normalizeHistoryValue(record?.createdAt ?? record?.created_at),
    finishedAt: normalizeHistoryValue(record?.finishedAt ?? record?.finished_at) ?? null,
    stage: normalizeHistoryValue(record?.stage),
    stageName: normalizeHistoryValue(record?.stageName ?? record?.stage_name),
  }
}

function extractStoryboardSegmentRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const record = asRecord(data)
  if (!record) return []
  for (const key of ['segments', 'list', 'items', 'storyboardSegments', 'storyboard_segments']) {
    if (Array.isArray(record[key])) return record[key] as unknown[]
  }
  const nestedSegment = asRecord(record.segment ?? record.storyboardSegment ?? record.storyboard_segment)
  if (nestedSegment) {
    return [{
      ...nestedSegment,
      sourceType: nestedSegment.sourceType ?? nestedSegment.source_type ?? record.sourceType ?? record.source_type,
      source_type: nestedSegment.source_type ?? nestedSegment.sourceType ?? record.source_type ?? record.sourceType,
      shots: nestedSegment.shots ?? nestedSegment.lens ?? record.shots ?? record.lens,
    }]
  }
  if (
    record.id !== undefined
    && (
      record.segmentIndex !== undefined
      || record.segment_index !== undefined
      || record.editorDescription !== undefined
      || record.editor_description !== undefined
    )
  ) return [record]
  return []
}

function normalizeStoryboardSegments(data: unknown): StudioEpisodeStoryboardSegment[] {
  return extractStoryboardSegmentRows(data).flatMap((value, index): StudioEpisodeStoryboardSegment[] => {
    const item = asRecord(value)
    if (!item) return []
    const segmentIndex = Math.max(
      1,
      Math.floor(normalizeFiniteNumber(item.segmentIndex ?? item.segment_index ?? item.index) ?? (index + 1)),
    )
    const id = normalizeHistoryValue(item.id ?? item.segmentId ?? item.segment_id) ?? `segment-${segmentIndex}`
    const sourceType = normalizeStoryboardSegmentSourceType(item.sourceType ?? item.source_type)
    const directorPromptSource = item.directorPrompt
      ?? item.director_prompt
      ?? (item.prompt !== undefined || item.references !== undefined || item.skillCode !== undefined || item.skill_code !== undefined
        ? item
        : undefined)
    const imagePromptSource = item.imagePrompt ?? item.image_prompt
    return [{
      id,
      segmentIndex,
      title: normalizeHistoryValue(item.title ?? item.name) ?? `片段-${segmentIndex}`,
      editorDescription: normalizeHistoryValue(
        item.editorDescription
          ?? item.editor_description
          ?? item.description
          ?? item.prompt,
      ) ?? '',
      sourceType: sourceType ?? null,
      status: normalizeNumberOrNull(item.status),
      statusName: normalizeHistoryValue(item.statusName ?? item.status_name),
      progress: normalizeNumberOrNull(item.progress),
      taskId: normalizeHistoryValue(item.taskId ?? item.task_id) ?? null,
      shouldPoll: normalizeHistoryBoolean(item.shouldPoll ?? item.should_poll),
      canEdit: normalizeHistoryBoolean(item.canEdit ?? item.can_edit),
      error: normalizeHistoryValue(item.error),
      durationSeconds: normalizeNumberOrNull(item.durationSeconds ?? item.duration_seconds),
      suggestedDurationSeconds: normalizeNumberOrNull(
        item.suggestedDurationSeconds ?? item.suggested_duration_seconds,
      ),
      manuallyEdited: normalizeHistoryBoolean(item.manuallyEdited ?? item.manually_edited),
      manuallyAdded: sourceType !== undefined
        ? sourceType === 2
        : normalizeHistoryBoolean(
          item.manuallyAdded
            ?? item.manually_added
            ?? item.manualAdded
            ?? item.manual_added
            ?? item.createdManually
            ?? item.created_manually
            ?? item.insertedManually
            ?? item.inserted_manually,
        ),
      revisionNo: normalizeNumberOrNull(item.revisionNo ?? item.revision_no),
      primaryImageId: normalizeHistoryValue(item.primaryImageId ?? item.primary_image_id) ?? null,
      coverFileId: normalizeHistoryValue(item.coverFileId ?? item.cover_file_id) ?? null,
      coverUrl: normalizeHistoryValue(item.coverUrl ?? item.cover_url ?? item.imageUrl ?? item.image_url) ?? null,
      shots: normalizeStoryboardShots(item.shots ?? item.lens ?? item.items),
      assetReferences: normalizeStoryboardAssetReferenceRows(item.assetReferences ?? item.asset_references),
      referenceSelection: normalizeStoryboardReferenceSelection(item.referenceSelection ?? item.reference_selection),
      directorPrompt: normalizeStoryboardDirectorPrompt(directorPromptSource),
      imagePrompt: normalizeStoryboardDirectorPrompt(imagePromptSource),
    }]
  })
}

function normalizeEpisodeStoryboardEditor(data: unknown): StudioEpisodeStoryboardEditorResult {
  const record = asRecord(data)
  const source = asRecord(record?.editor) ?? record
  const storyboardRecord = asRecord(source?.storyboard ?? source?.run)
  const segments = normalizeStoryboardSegments(source)
  const storyboardSegments = segments.length > 0
    ? segments
    : normalizeStoryboardSegments(storyboardRecord?.segments ?? storyboardRecord)
  const storyboard = normalizeStoryboardRun(source?.storyboard ?? source?.run ?? source)
  const canEnterEditor = normalizeHistoryBoolean(source?.canEnterEditor ?? source?.can_enter_editor)
  const shouldPoll = normalizeHistoryBoolean(source?.shouldPoll ?? source?.should_poll)
    ?? storyboard?.shouldPoll
    ?? false
  return {
    scriptImportId: normalizeHistoryValue(source?.scriptImportId ?? source?.script_import_id) ?? null,
    episodeId: normalizeHistoryValue(source?.episodeId ?? source?.episode_id ?? source?.chapterId ?? source?.chapter_id) ?? null,
    episodeIndex: normalizeNumberOrNull(source?.episodeIndex ?? source?.episode_index),
    episodeTitle: normalizeHistoryValue(source?.episodeTitle ?? source?.episode_title ?? source?.title),
    canEnterEditor: canEnterEditor ?? storyboardSegments.length > 0,
    shouldPoll,
    sourceChanged: Boolean(normalizeHistoryBoolean(source?.sourceChanged ?? source?.source_changed)),
    assetReadiness: normalizeStoryboardAssetReadiness(source?.assetReadiness ?? source?.asset_readiness),
    storyboard,
    segments: storyboardSegments,
  }
}

function normalizeEpisodeAssetsConfirm(data: unknown): StudioEpisodeAssetsConfirmResult {
  const record = asRecord(data)
  const editorRecord = asRecord(record?.editor)
  const storyboardRecord = asRecord(
    record?.storyboard
      ?? record?.run
      ?? editorRecord?.storyboard
      ?? editorRecord?.run,
  )
  const runId = normalizeHistoryValue(
    record?.runId
      ?? record?.run_id
      ?? storyboardRecord?.runId
      ?? storyboardRecord?.run_id
      ?? storyboardRecord?.id,
  )
  return {
    currentStep: normalizeNumberOrNull(record?.currentStep ?? record?.current_step),
    runId: runId ?? null,
    editor: editorRecord ? normalizeEpisodeStoryboardEditor(editorRecord) : null,
  }
}

function normalizeEpisodeStoryboardSegmentDetail(data: unknown): StudioEpisodeStoryboardSegmentDetailResult {
  const record = asRecord(data)
  const [segment] = normalizeStoryboardSegments(data)
  const fallbackSegmentIndex = normalizeNumberOrNull(record?.segmentIndex ?? record?.segment_index) ?? 1
  const fallbackSourceType = normalizeStoryboardSegmentSourceType(record?.sourceType ?? record?.source_type)
  const directDirectorPromptSource = record?.directorPrompt
    ?? record?.director_prompt
    ?? (record?.prompt !== undefined || record?.references !== undefined || record?.skillCode !== undefined || record?.skill_code !== undefined
      ? record
      : undefined)
  const directImagePromptSource = record?.imagePrompt ?? record?.image_prompt
  const normalizedSegment: StudioEpisodeStoryboardSegment = segment ?? {
    id: normalizeHistoryValue(record?.id ?? record?.segmentId ?? record?.segment_id) ?? `segment-${fallbackSegmentIndex}`,
    segmentIndex: fallbackSegmentIndex,
    title: normalizeHistoryValue(record?.title ?? record?.name) ?? `片段-${fallbackSegmentIndex}`,
    editorDescription: normalizeHistoryValue(record?.editorDescription ?? record?.editor_description ?? record?.description) ?? '',
    sourceType: fallbackSourceType ?? null,
    status: normalizeNumberOrNull(record?.status),
    statusName: normalizeHistoryValue(record?.statusName ?? record?.status_name),
    progress: normalizeNumberOrNull(record?.progress),
    taskId: normalizeHistoryValue(record?.taskId ?? record?.task_id) ?? null,
    shouldPoll: normalizeHistoryBoolean(record?.shouldPoll ?? record?.should_poll),
    canEdit: normalizeHistoryBoolean(record?.canEdit ?? record?.can_edit),
    error: normalizeHistoryValue(record?.error),
    durationSeconds: normalizeNumberOrNull(record?.durationSeconds ?? record?.duration_seconds),
    suggestedDurationSeconds: normalizeNumberOrNull(
      record?.suggestedDurationSeconds ?? record?.suggested_duration_seconds,
    ),
    manuallyEdited: normalizeHistoryBoolean(record?.manuallyEdited ?? record?.manually_edited),
    manuallyAdded: fallbackSourceType !== undefined
      ? fallbackSourceType === 2
      : normalizeHistoryBoolean(
        record?.manuallyAdded
          ?? record?.manually_added
          ?? record?.manualAdded
          ?? record?.manual_added
          ?? record?.createdManually
          ?? record?.created_manually
          ?? record?.insertedManually
          ?? record?.inserted_manually,
      ),
    revisionNo: normalizeNumberOrNull(record?.revisionNo ?? record?.revision_no),
    primaryImageId: normalizeHistoryValue(record?.primaryImageId ?? record?.primary_image_id) ?? null,
    coverFileId: normalizeHistoryValue(record?.coverFileId ?? record?.cover_file_id) ?? null,
    coverUrl: normalizeHistoryValue(record?.coverUrl ?? record?.cover_url ?? record?.imageUrl ?? record?.image_url) ?? null,
    shots: normalizeStoryboardShots(record?.shots ?? record?.lens ?? record?.items),
    assetReferences: normalizeStoryboardAssetReferenceRows(record?.assetReferences ?? record?.asset_references),
    referenceSelection: normalizeStoryboardReferenceSelection(record?.referenceSelection ?? record?.reference_selection),
    directorPrompt: normalizeStoryboardDirectorPrompt(directDirectorPromptSource),
    imagePrompt: normalizeStoryboardDirectorPrompt(directImagePromptSource),
  }
  const referenceSelection = normalizeStoryboardReferenceSelection(record?.referenceSelection ?? record?.reference_selection)
  const directDirectorPrompt = normalizeStoryboardDirectorPrompt(directDirectorPromptSource)
  const directImagePrompt = normalizeStoryboardDirectorPrompt(directImagePromptSource)
  return {
    ...normalizedSegment,
    referenceSelection: referenceSelection ?? normalizedSegment.referenceSelection ?? null,
    directorPrompt: directDirectorPrompt ?? normalizedSegment.directorPrompt ?? null,
    imagePrompt: directImagePrompt ?? normalizedSegment.imagePrompt ?? null,
    runId: normalizeHistoryValue(record?.runId ?? record?.run_id) ?? null,
    episodeId: normalizeHistoryValue(record?.episodeId ?? record?.episode_id) ?? null,
  }
}

function normalizeStoryboardMediaType(mediaType: unknown, outputUrl?: string | null): StudioStoryboardMediaType {
  const normalizedType = normalizeHistoryValue(mediaType)?.toLocaleLowerCase()
  if (normalizedType?.includes('video')) return 'video'
  if (normalizedType?.includes('image') || normalizedType?.includes('picture')) return 'image'
  const normalizedUrl = outputUrl?.toLocaleLowerCase() ?? ''
  if (/\.(mp4|webm|mov|m4v|m3u8)(?:[?#]|$)/.test(normalizedUrl)) return 'video'
  return 'image'
}

function normalizeStoryboardMediaHistory(data: unknown): StudioStoryboardMediaHistoryItem[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.list)
      ? asRecord(data)?.list as unknown[]
      : Array.isArray(asRecord(data)?.items)
        ? asRecord(data)?.items as unknown[]
        : Array.isArray(asRecord(data)?.records)
          ? asRecord(data)?.records as unknown[]
          : []

  return rows.flatMap((value, index): StudioStoryboardMediaHistoryItem[] => {
    const item = asRecord(value)
    if (!item) return []
    const outputUrl = normalizeHistoryValue(
      item.outputUrl
        ?? item.output_url
        ?? item.url
        ?? item.fileUrl
        ?? item.file_url
        ?? item.imageUrl
        ?? item.image_url
        ?? item.videoUrl
        ?? item.video_url,
    ) ?? null
    const id = normalizeHistoryValue(item.id)
      ?? normalizeHistoryValue(item.itemKey ?? item.item_key)
      ?? normalizeHistoryValue(item.outputFileId ?? item.output_file_id)
      ?? `storyboard-media-${index + 1}`

    return [{
      mediaType: normalizeStoryboardMediaType(item.mediaType ?? item.media_type ?? item.type, outputUrl),
      id,
      segmentId: normalizeHistoryValue(item.segmentId ?? item.segment_id) ?? null,
      taskId: normalizeHistoryValue(item.taskId ?? item.task_id) ?? null,
      versionNo: normalizeNumberOrNull(item.versionNo ?? item.version_no),
      modelId: normalizeNumberOrNull(item.modelId ?? item.model_id),
      modelName: normalizeHistoryValue(item.modelName ?? item.model_name),
      prompt: normalizeHistoryValue(item.prompt),
      aspectRatio: normalizeHistoryValue(item.aspectRatio ?? item.aspect_ratio),
      resolution: normalizeHistoryValue(item.resolution),
      generateAudio: normalizeHistoryBoolean(item.generateAudio ?? item.generate_audio),
      visualStyleId: normalizeNumberOrNull(item.visualStyleId ?? item.visual_style_id),
      visualStyleName: normalizeHistoryValue(item.visualStyleName ?? item.visual_style_name) ?? null,
      toneStyleId: normalizeNumberOrNull(item.toneStyleId ?? item.tone_style_id),
      toneStyleName: normalizeHistoryValue(item.toneStyleName ?? item.tone_style_name) ?? null,
      status: normalizeNumberOrNull(item.status),
      progress: normalizeNumberOrNull(item.progress),
      outputFileId: normalizeHistoryValue(item.outputFileId ?? item.output_file_id ?? item.fileId ?? item.file_id) ?? null,
      outputUrl,
      durationSeconds: normalizeNumberOrNull(item.durationSeconds ?? item.duration_seconds),
      primary: normalizeHistoryBoolean(item.primary),
      createdAt: normalizeHistoryValue(item.createdAt ?? item.created_at),
      finishedAt: normalizeHistoryValue(item.finishedAt ?? item.finished_at),
      itemKey: normalizeHistoryValue(item.itemKey ?? item.item_key),
      thumbnailUrl: normalizeHistoryValue(item.thumbnailUrl ?? item.thumbnail_url ?? item.coverUrl ?? item.cover_url) ?? null,
      statusName: normalizeHistoryValue(item.statusName ?? item.status_name),
    }]
  })
}

function normalizeStoryboardVideoDetail(data: unknown): StudioStoryboardVideoDetailResult {
  const item = asRecord(data)
  const [normalizedMedia] = normalizeStoryboardMediaHistory(item ? [{ ...item, mediaType: 'video' }] : [])
  const id = normalizedMedia?.id
    ?? normalizeHistoryValue(item?.id)
    ?? normalizeHistoryValue(item?.itemKey ?? item?.item_key)
    ?? 'storyboard-video'

  return {
    ...(normalizedMedia ?? {
      mediaType: 'video' as const,
      id,
      segmentId: null,
      taskId: null,
      versionNo: null,
      modelId: null,
      prompt: '',
      generateAudio: false,
      status: null,
      progress: null,
      outputFileId: null,
      outputUrl: null,
      durationSeconds: null,
      primary: null,
      thumbnailUrl: null,
    }),
    mediaType: 'video',
    id,
    templateId: normalizeHistoryValue(item?.templateId ?? item?.template_id) ?? null,
    providerTaskId: normalizeHistoryValue(item?.providerTaskId ?? item?.provider_task_id) ?? null,
    error: normalizeHistoryValue(item?.error) ?? '',
    creditCost: normalizeFiniteNumber(item?.creditCost ?? item?.credit_cost),
    references: normalizeStoryboardPromptReferences(item?.references),
  }
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.flatMap((item) => {
    const normalized = normalizeHistoryValue(item)
    return normalized ? [normalized] : []
  }))]
}

function normalizeAssetLooks(data: unknown): StudioAssetLookItem[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.list)
      ? asRecord(data)?.list as unknown[]
      : asRecord(data)
        ? [data]
        : []
  const seen = new Set<string>()

  return rows.flatMap((value, index): StudioAssetLookItem[] => {
    const item = asRecord(value)
    if (!item) return []
    const id = normalizeHistoryValue(item.id)
      ?? normalizeHistoryValue(item.lookId ?? item.look_id)
      ?? normalizeHistoryValue(item.lookCode ?? item.look_code)
      ?? `look-${index}`
    if (seen.has(id)) return []
    seen.add(id)
    const coverFileId = normalizeHistoryValue(
      item.coverFileId ?? item.cover_file_id ?? item.fileId ?? item.file_id,
    )
    const coverUrl = normalizeHistoryValue(
      item.coverUrl ?? item.cover_url ?? item.imageUrl ?? item.image_url ?? item.url,
    )

    return [{
      id,
      lookCode: normalizeHistoryValue(item.lookCode ?? item.look_code),
      name: normalizeHistoryValue(item.name) ?? `look-${index + 1}`,
      description: normalizeHistoryValue(item.description),
      prompt: normalizeHistoryValue(item.prompt),
      aspectRatio: normalizeHistoryValue(item.aspectRatio ?? item.aspect_ratio),
      visualStyleId: normalizeNumberOrNull(item.visualStyleId ?? item.visual_style_id),
      quality: normalizeNumberOrNull(item.quality),
      resolution: normalizeNumberOrNull(item.resolution),
      modelId: normalizeNumberOrNull(item.modelId ?? item.model_id),
      status: normalizeNumberOrNull(item.status),
      statusName: normalizeHistoryValue(item.statusName ?? item.status_name),
      defaultLook: Boolean(normalizeHistoryBoolean(item.defaultLook ?? item.default_look)),
      coverFileId,
      coverUrl,
      episodeIds: normalizeStringList(item.episodeIds ?? item.episode_ids),
      createdAt: normalizeHistoryValue(item.createdAt ?? item.created_at),
      updatedAt: normalizeHistoryValue(item.updatedAt ?? item.updated_at),
    }]
  })
}

/** 创建接口尚未固定公开任务字段名，同时兼容 data.id、taskId、task_id 和直接返回 ID。 */
function extractCreatedTaskId(response: ApiEnvelope<unknown>): string | null {
  const directDataId = normalizeTaskId(response.data)
  if (directDataId) return directDataId
  if (!response.data || typeof response.data !== 'object') return null
  const data = response.data as Record<string, unknown>
  return normalizeTaskId(data.taskId ?? data.task_id ?? data.id)
}

export function parseStudioAssetImageTaskResult(
  result: string | null | undefined,
): StudioAssetImageTaskResult | null {
  if (!result?.trim()) return null
  try {
    const parsed = JSON.parse(result) as unknown
    return parsed && typeof parsed === 'object'
      ? parsed as StudioAssetImageTaskResult
      : null
  } catch {
    return null
  }
}

export const StudioAssetGenerationApi = {
  requestGenerateEstimate(
    requestBody: StudioAssetGenerateEstimateRequest,
  ): StudioAssetImageTaskRequest<StudioAssetGenerateEstimateResult> {
    const request = estimateAssetGenerateCredits(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset generation credit estimate failed')
        }
        return normalizeAssetGenerateEstimate(response.data)
      }),
    }
  },

  requestEpisodeAssetsGenerateEstimate(
    requestBody: StudioEpisodeAssetsGenerateEstimateRequest,
  ): StudioAssetImageTaskRequest<StudioEpisodeAssetsGenerateEstimateResult> {
    const request = estimateEpisodeAssetsGenerateCredits(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode assets generation credit estimate failed')
        }
        return normalizeEpisodeAssetsGenerateEstimate(response.data)
      }),
    }
  },

  requestEpisodeAssetsGenerate(
    requestBody: StudioEpisodeAssetsGenerateRequest,
  ): StudioAssetImageTaskRequest<void> {
    const request = createEpisodeAssetsGenerateTask(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode assets generation task creation failed')
        }
      }),
    }
  },

  requestEpisodeAssetsGenerateStatus(
    requestBody: StudioEpisodeAssetsGenerateStatusRequest,
  ): StudioAssetImageTaskRequest<StudioEpisodeAssetsGenerateStatusResult> {
    const request = getEpisodeAssetsGenerateStatus(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if (response.code !== 200) {
          throw Object.assign(new Error(response.message || 'Episode assets generation status loading failed'), { status: response.code })
        }
        return normalizeEpisodeAssetsGenerateStatus(response.data)
      }),
    }
  },

  requestEpisodeAssetsConfirm(
    requestBody: StudioEpisodeAssetsConfirmRequest,
  ): StudioAssetImageTaskRequest<StudioEpisodeAssetsConfirmResult> {
    const request = confirmEpisodeAssets(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode assets confirmation failed')
        }
        return normalizeEpisodeAssetsConfirm(response.data)
      }),
    }
  },

  requestEpisodeStoryboardEditor(
    requestBody: StudioEpisodeStoryboardEditorRequest,
  ): StudioAssetImageTaskRequest<StudioEpisodeStoryboardEditorResult> {
    const request = getEpisodeStoryboardEditor(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode storyboard editor loading failed')
        }
        return normalizeEpisodeStoryboardEditor(response.data)
      }),
    }
  },

  requestEpisodeStoryboardDetail(
    id: string | number,
  ): StudioAssetImageTaskRequest<StudioEpisodeStoryboardEditorResult> {
    const request = getEpisodeStoryboardDetail(id)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode storyboard detail loading failed')
        }
        return normalizeEpisodeStoryboardEditor(response.data)
      }),
    }
  },

  requestEpisodeStoryboardSegmentDetail(
    id: string | number,
  ): StudioAssetImageTaskRequest<StudioEpisodeStoryboardSegmentDetailResult> {
    const request = getEpisodeStoryboardSegmentDetail(id)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode storyboard segment detail loading failed')
        }
        return normalizeEpisodeStoryboardSegmentDetail(response.data)
      }),
    }
  },

  requestEpisodeStoryboardSegmentUpdate(
    requestBody: StudioEpisodeStoryboardSegmentUpdateRequest,
  ): StudioAssetImageTaskRequest<StudioEpisodeStoryboardSegmentDetailResult | null> {
    const request = updateEpisodeStoryboardSegment(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode storyboard segment update failed')
        }
        return response.data === undefined || response.data === null
          ? null
          : normalizeEpisodeStoryboardSegmentDetail(response.data)
      }),
    }
  },

  requestEpisodeStoryboardSegmentInsertUp(
    requestBody: StudioEpisodeStoryboardSegmentInsertRequest,
  ): StudioAssetImageTaskRequest<StudioEpisodeStoryboardSegmentDetailResult | null> {
    const request = insertEpisodeStoryboardSegmentUp(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode storyboard segment insertion failed')
        }
        return response.data === undefined || response.data === null
          ? null
          : normalizeEpisodeStoryboardSegmentDetail(response.data)
      }),
    }
  },

  requestEpisodeStoryboardSegmentInsertDown(
    requestBody: StudioEpisodeStoryboardSegmentInsertRequest,
  ): StudioAssetImageTaskRequest<StudioEpisodeStoryboardSegmentDetailResult | null> {
    const request = insertEpisodeStoryboardSegmentDown(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode storyboard segment insertion failed')
        }
        return response.data === undefined || response.data === null
          ? null
          : normalizeEpisodeStoryboardSegmentDetail(response.data)
      }),
    }
  },

  requestEpisodeStoryboardSegmentDelete(
    requestBody: StudioEpisodeStoryboardSegmentDeleteRequest,
  ): StudioAssetImageTaskRequest<null> {
    const request = deleteEpisodeStoryboardSegment(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode storyboard segment deletion failed')
        }
        return null
      }),
    }
  },

  requestEpisodeStoryboardSegmentMergeUp(
    requestBody: StudioEpisodeStoryboardSegmentMergeUpRequest,
  ): StudioAssetImageTaskRequest<StudioEpisodeStoryboardSegmentDetailResult | null> {
    const request = mergeEpisodeStoryboardSegmentUp(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode storyboard segment merge failed')
        }
        return response.data === undefined || response.data === null
          ? null
          : normalizeEpisodeStoryboardSegmentDetail(response.data)
      }),
    }
  },

  requestStoryboardVideoPromptRegenerate(
    requestBody: StudioStoryboardVideoPromptRegenerateRequest,
  ): StudioAssetImageTaskRequest<StudioStoryboardVideoPromptRegenerateResult> {
    const request = regenerateStoryboardVideoPrompt(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard video prompt regenerate failed')
        }
        return normalizeStoryboardVideoPromptRegenerate(response.data)
      }),
    }
  },

  requestStoryboardVideoPromptDetail(
    id: string | number,
  ): StudioAssetImageTaskRequest<StudioStoryboardVideoPromptDetailResult> {
    const request = getStoryboardVideoPromptDetail(id)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard video prompt detail loading failed')
        }
        return normalizeStoryboardVideoPromptDetail(response.data)
      }),
    }
  },

  requestStoryboardMediaHistory(
    segmentId: string | number,
  ): StudioAssetImageTaskRequest<StudioStoryboardMediaHistoryItem[]> {
    const request = getStoryboardMediaHistory(segmentId)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard media history loading failed')
        }
        return normalizeStoryboardMediaHistory(response.data)
      }),
    }
  },

  requestStoryboardVideoGenerateEstimate(
    requestBody: StudioStoryboardVideoGenerateEstimateRequest,
  ): StudioAssetImageTaskRequest<StudioStoryboardVideoGenerateEstimateResult> {
    const request = estimateStoryboardVideoGenerateCredits(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard video generation estimate failed')
        }
        return normalizeStoryboardVideoGenerateEstimate(response.data)
      }),
    }
  },

  requestStoryboardVideoGenerate(
    requestBody: StudioStoryboardVideoGenerateRequest,
  ): StudioAssetImageTaskRequest<StudioStoryboardVideoDetailResult> {
    const request = createStoryboardVideoGenerateTask(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard video generation failed')
        }
        return normalizeStoryboardVideoDetail(response.data)
      }),
    }
  },

  requestStoryboardVideoDetail(
    id: string | number,
  ): StudioAssetImageTaskRequest<StudioStoryboardVideoDetailResult> {
    const request = getStoryboardVideoDetail(id)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard video detail loading failed')
        }
        return normalizeStoryboardVideoDetail(response.data)
      }),
    }
  },

  requestStoryboardVideoReferenceOptions(
    requestBody: StudioStoryboardVideoReferenceOptionsRequest,
  ): StudioAssetImageTaskRequest<StudioStoryboardVideoReferenceOption[]> {
    const request = getStoryboardVideoReferenceOptions(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard video reference options loading failed')
        }
        return normalizeStoryboardVideoReferenceOptions(response.data, requestBody.source)
      }),
    }
  },

  requestStoryboardVideoReferenceAdd(
    requestBody: StudioStoryboardVideoReferenceAddRequest,
  ): StudioAssetImageTaskRequest<StudioStoryboardVideoReferenceAddResult | null> {
    const request = addStoryboardVideoReferences(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard video reference addition failed')
        }
        return normalizeStoryboardVideoReferenceDelete(response.data)
      }),
    }
  },

  requestStoryboardVideoReferenceDelete(
    requestBody: StudioStoryboardVideoReferenceDeleteRequest,
  ): StudioAssetImageTaskRequest<StudioStoryboardVideoReferenceDeleteResult | null> {
    const request = deleteStoryboardVideoReference(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard video reference deletion failed')
        }
        return normalizeStoryboardVideoReferenceDelete(response.data)
      }),
    }
  },

  requestStoryboardImageSkillApply(
    requestBody: StudioStoryboardImageSkillRequest,
  ): StudioAssetImageTaskRequest<StudioStoryboardImageSkillResult> {
    const request = applyStoryboardImageSkill(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard image skill application failed')
        }
        return normalizeStoryboardImageSkill(response.data)
      }),
    }
  },

  requestStoryboardImageSkillUndo(
    requestBody: StudioStoryboardImageSkillRequest,
  ): StudioAssetImageTaskRequest<StudioStoryboardImageSkillResult> {
    const request = undoStoryboardImageSkill(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Storyboard image skill undo failed')
        }
        return normalizeStoryboardImageSkill(response.data)
      }),
    }
  },

  requestLooks(assetId: number, episodeId?: string | number): StudioAssetImageTaskRequest<StudioAssetLookItem[]> {
    const request = getAssetLooks(assetId, episodeId)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if (response.code !== 200) {
          throw new Error(response.message || 'Asset looks loading failed')
        }
        return normalizeAssetLooks(response.data)
      }),
    }
  },

  requestReferenceList(assetId: number): StudioAssetImageTaskRequest<StudioAssetReferenceListResult> {
    const request = getAssetReferences(assetId)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset reference images loading failed')
        }
        return normalizeAssetReferences(response.data)
      }),
    }
  },

  requestLookUpload(
    requestBody: StudioAssetLookUploadRequest,
  ): StudioAssetImageTaskRequest<StudioAssetLookItem | null> {
    const request = uploadAssetLook(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset look upload failed')
        }
        return normalizeAssetLooks(response.data)[0] ?? null
      }),
    }
  },

  requestLookGenerate(
    requestBody: StudioAssetLookGenerateRequest,
  ): StudioAssetImageTaskRequest<string> {
    const request = generateAssetLook(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset look generation task creation failed')
        }
        const taskId = extractCreatedTaskId(response)
        if (!taskId) {
          throw new Error(response.message || 'Asset look generation returned no task ID')
        }
        return taskId
      }),
    }
  },

  requestLookEpisodeSelection(
    requestBody: StudioAssetLookEpisodeSelectionRequest,
  ): StudioAssetImageTaskRequest<void> {
    const request = updateAssetLookEpisodeSelection(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset look episode selection update failed')
        }
      }),
    }
  },

  requestLookRename(
    requestBody: StudioAssetLookRenameRequest,
  ): StudioAssetImageTaskRequest<void> {
    const request = renameAssetLook(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset look rename failed')
        }
      }),
    }
  },

  requestReferenceUpload(assetId: number, file: File): StudioAssetImageTaskRequest<void> {
    const request = uploadAssetReference(assetId, file)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset reference image upload failed')
        }
      }),
    }
  },

  requestReferenceAttach(assetId: number, fileId: string): StudioAssetImageTaskRequest<void> {
    const request = attachAssetReference({ assetId, fileId })
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset reference image attach failed')
        }
      }),
    }
  },

  requestImageHistory(assetId: number, lookId?: number | null): StudioAssetImageTaskRequest<StudioAssetImageHistoryItem[]> {
    const request = getAssetImageHistory(assetId, lookId)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if (response.code !== 200) {
          throw new Error(response.message || 'Asset image history loading failed')
        }
        return normalizeAssetImageHistory(response.data)
      }),
    }
  },

  requestCopyrightReview(
    requestBody: StudioAssetCopyrightReviewRequest,
  ): StudioAssetImageTaskRequest<StudioAssetCopyrightReviewResult> {
    const request = reviewAssetImageCopyright(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if (response.code !== 200) {
          throw new Error(response.message || 'Asset image copyright review failed')
        }
        return normalizeAssetCopyrightReview(response.data)
      }),
    }
  },

  requestSetPrimaryImage(
    requestBody: StudioAssetPrimaryImageRequest,
  ): StudioAssetImageTaskRequest<void> {
    const request = setAssetPrimaryImage(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset primary image update failed')
        }
      }),
    }
  },

  requestUpdateImageOptions(
    requestBody: StudioAssetImageOptionsUpdateRequest,
  ): StudioAssetImageTaskRequest<void> {
    const request = updateAssetImageOptions(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset image options update failed')
        }
      }),
    }
  },

  requestGenerate(
    requestBody: StudioAssetImageGenerateRequest,
  ): StudioAssetImageTaskRequest<string> {
    const request = createAssetImageTask(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset image generation task creation failed')
        }
        const taskId = extractCreatedTaskId(response)
        if (!taskId) {
          throw new Error(response.message || 'Asset image generation returned no task ID')
        }
        return taskId
      }),
    }
  },

  requestTaskDetail(
    id: string,
  ): StudioAssetImageTaskRequest<StudioAssetImageTaskDetail> {
    const request = getAssetImageTaskDetail(id)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => unwrapApiData<StudioAssetImageTaskDetail>(
        response,
        'Asset image generation task loading failed',
      )),
    }
  },
}
