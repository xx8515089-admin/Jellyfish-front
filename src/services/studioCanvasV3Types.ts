import type { CanvasId, CanvasOperation } from './studioCanvases'

export type CanvasTextOperation = 'promptEnhance' | 'promptFilter' | 'extractCharactersScenes' | 'storyboardSplit' | 'storyboardPromptMerge'
export interface CanvasCapabilities {
  chatReady?: boolean; workflowReady?: boolean; advancedFeatures?: boolean; advancedOperations?: string[]; providerIdentityReady?: boolean
  advancedInputPorts?: Record<string, unknown>
  textUnavailableReason?: string; apiVersion?: number; storageReady: boolean; textTasksReady?: boolean; libraryPublishReady?: boolean
}
export interface CanvasTextModel {
  modelId: number; name: string; supplierName?: string; available?: boolean; unavailableReason?: string
  operation?: CanvasTextOperation; operations?: CanvasTextOperation[]; supportedOperations?: CanvasTextOperation[]
  inputModalities?: string[]; defaultModel?: boolean
}
export interface CanvasTextCapabilities {
  textTasksReady?: boolean; storageReady?: boolean; inputModalities?: string[]
  maxInputCharacters?: number; maxShots?: number; operations?: CanvasTextOperation[]
}
export interface CanvasTextEstimateRequest {
  canvasId: CanvasId; revisionNo: number; nodeId: string; operation: CanvasTextOperation; modelId: number
}
export interface CanvasTextQuote extends CanvasTextEstimateRequest {
  quoteId: string; inputHash: string; reservedCredits: number; actualCredits: number | null
  currentBalance: number; sufficient: boolean; unlimited: boolean; expiresAt: string
}
export interface CanvasTextCreateRequest {
  canvasId: CanvasId; quoteId: string; clientRequestId: string; maxReservedCredits: number
}
export interface CanvasTextTask extends CanvasTextEstimateRequest {
  taskId: CanvasId; generationTaskId?: CanvasId; inputHash: string; status: number; shouldPoll: boolean
  cancelRequested?: boolean; actions: { cancel?: boolean; retry?: boolean; retrySettlement?: boolean }
  result?: { schemaVersion: number; operation: CanvasTextOperation; prompt?: string; removedTerms?: string[]; characters?: Record<string, unknown>[]; scenes?: Record<string, unknown>[]; shots?: Record<string, unknown>[] }
  error?: string; billingState: string; reservedCredits: number | null; actualCredits: number | null
  usage?: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; requestCount: number | null }
  createdAt?: string
}
export interface CanvasLibraryReview {
  reviewId: CanvasId; canvasId: CanvasId; canvasAssetId: CanvasId; fileId?: CanvasId
  status: number; riskLevel?: number; canPublish: boolean; error?: string; message?: string
}
export interface CanvasPublishLibraryRequest {
  canvasId: CanvasId; revisionNo: number; nodeId: string; canvasAssetId: CanvasId; reviewId: CanvasId
  assetType: 1 | 2 | 3; name: string; description: string; prompt: string
  aspectRatio: string; quality: 1 | 2; resolution: 1 | 2 | 4; clientRequestId: string
}
export interface CanvasLibraryPublication {
  assetType: number; libraryItemId: CanvasId; sourceLinkId: CanvasId; canvasAssetId: CanvasId
  originType: string; assetId: CanvasId | null; imageVersionId: CanvasId | null
}
export interface CanvasBatchSummary {
  batchId: CanvasId; canvasId: CanvasId; revisionNo: number; parentBatchId?: CanvasId
  status: string; reservedCredits: number | null; total: number; succeeded: number; createdAt: string
}
export interface CanvasBatchEstimate {
  totalCredits: number; pricingMode?: 'reservationEstimate'; actualCredits?: number | null
  sufficient?: boolean; currentBalance?: number
  items: { clientItemId: string; operation?: CanvasOperation; count: number; unitCredits: number; subtotalCredits: number; estimate: { creditCost: number } }[]
}
