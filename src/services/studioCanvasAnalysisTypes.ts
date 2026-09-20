import type { CanvasId } from './studioCanvases'

export type CanvasAnalysisOperation = 'framePromptGenerate' | 'videoAnalyze' | 'transcribeAudio'
export interface CanvasAnalysisCapabilities {
  analysisTasksReady: boolean; storageReady: boolean; mediaToolsReady?: boolean
  operations: CanvasAnalysisOperation[]; retryAfterMs?: number; quoteTtlSeconds?: number
  analysisUnavailableCode?: string; analysisUnavailableReason?: string
  limits?: { maxFramesPerTask?: number; maxVideoDurationSeconds?: number; maxMediaSizeBytes?: number; maxScenes?: number; maxConcurrentTasksPerUser?: number }
  operationStatuses: { operation: CanvasAnalysisOperation; available: boolean; errorCode?: string; reason?: string; modelIds?: number[] }[]
}
export interface CanvasAnalysisModel {
  modelId: number; name: string; supplierName?: string; available: boolean; unavailableReason?: string
  supportedOperations?: CanvasAnalysisOperation[]; inputModalities?: string[]; supportsAudioTrack?: boolean
  limits?: Record<string, number>
}
export interface CanvasAnalysisEstimate {
  canvasId: CanvasId; revisionNo: number; nodeId: string; sourceNodeId: string; operation: CanvasAnalysisOperation; modelId: number
  selection: { frames?: { frameId: string; assetId: CanvasId; timeSeconds: number }[]; videoAssetId?: CanvasId; audioAssetId?: CanvasId }
  parameters?: { segmentDurationSeconds?: number; promptLanguages?: string[]; startSeconds?: number; endSeconds?: number }
}
export interface CanvasAnalysisQuote extends Omit<CanvasAnalysisEstimate, 'selection' | 'parameters'> {
  quoteId: string; inputHash: string; reservedCredits: number; actualCredits: number | null; currentBalance: number | null
  sufficient: boolean; unlimited: boolean; expiresAt: string; billingMode?: string; requiresConfirmation?: boolean
  providerCallRequired?: boolean; durationSeconds?: number; hasAudio?: boolean
}
export interface CanvasAnalysisScene {
  sceneId: string; startSeconds: number; endSeconds: number; description: string; cameraMovement?: string; cameraMovementInferred?: boolean
  subjectDynamics?: string; atmosphere?: string; prompts: { zh: string; en: string }; tags?: { style?: string[]; camera?: string[]; color?: string[] }
  keyframes: { frameId: string; assetId: CanvasId; timeSeconds: number; role?: string; description?: string }[]
}
export interface CanvasAnalysisResult {
  schemaVersion?: number; operation?: CanvasAnalysisOperation; durationSeconds?: number; hasAudio?: boolean; scenes?: CanvasAnalysisScene[]
  language?: string; segments?: { startSeconds: number; endSeconds: number; text: string; speaker?: string | null }[]; fullText?: string; warnings?: string[]
}
export interface CanvasAnalysisTask extends Omit<CanvasAnalysisEstimate, 'selection' | 'parameters'> {
  taskId: CanvasId; generationTaskId?: CanvasId; inputHash: string; status: number; shouldPoll: boolean; retryAfterMs?: number
  cancelRequested?: boolean; actions?: { cancel?: boolean; retry?: boolean; retrySettlement?: boolean; syncResult?: false }
  billingState: 'pending' | 'reserved' | 'settled' | 'released' | 'pendingReview'; reservedCredits: number | null; actualCredits: number | null
  errorCode?: string; error?: string; result?: CanvasAnalysisResult; createdAt?: string
}
