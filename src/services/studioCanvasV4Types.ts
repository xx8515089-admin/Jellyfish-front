import type { CanvasId, CanvasPage } from './studioCanvases'
import type { CanvasTextOperation } from './studioCanvasV3Types'

export type CanvasExecutionOperation = 'chat' | 'imageInpaint' | 'imageOutpaint' | 'imageVariation' | 'imageUpscale' | 'videoGenerate' | 'videoExtend' | 'videoRemix'
export interface CanvasExecutionCapabilities {
  storageReady: boolean; operations: CanvasExecutionOperation[]; maxConcurrentTasksPerUser?: number
  quoteTtlSeconds?: number; retryAfterMs?: number; chatStreaming?: boolean
}
export interface CanvasExecutionModel {
  modelId: number; name: string; available: boolean; unavailableReason?: string
  operation?: CanvasExecutionOperation; operations?: CanvasExecutionOperation[]; inputModalities?: string[]
  limits?: Record<string, number>; defaultModel?: boolean
}
export interface CanvasExecutionReference { assetId: CanvasId; sourceNodeId: string; fieldPath: string; role: 'image' | 'video' | 'audio' }
export interface CanvasChatEstimateRequest {
  canvasId: CanvasId; revisionNo: number; nodeId: string; operation: 'chat'; modelId: number
  sessionId: CanvasId; expectedSessionVersion: number
  selection: { references: CanvasExecutionReference[] }; parameters: { prompt: string }
}
export interface CanvasExecutionQuote {
  quoteId: string; canvasId: CanvasId; revisionNo: number; nodeId: string; operation: CanvasExecutionOperation; modelId: number
  reservedCredits: number; actualCredits?: number | null; expiresAt: string; sufficient?: boolean; unlimited?: boolean
}
export interface CanvasExecutionCreate { canvasId: CanvasId; quoteId: string; clientRequestId: string; maxReservedCredits: number }
export interface CanvasExecutionTask {
  taskId: CanvasId; generationTaskId?: CanvasId; canvasId: CanvasId; revisionNo: number; nodeId: string
  operation: CanvasExecutionOperation; modelId: number; sessionId?: CanvasId; status: number; shouldPoll: boolean
  actions?: { cancel?: boolean; retry?: boolean; retrySettlement?: boolean; syncResult?: boolean }; cancelRequested?: boolean
  billingState: string; reservedCredits: number | null; actualCredits: number | null; error?: string
  result?: { schemaVersion: number; operation: CanvasExecutionOperation; text?: string }; createdAt?: string
}
export interface CanvasChatSession { sessionId: CanvasId; canvasId: CanvasId; title: string; version: number; archived: boolean; createdAt?: string }
export interface CanvasChatMessage { taskId: CanvasId; version: number; text: string; attachmentAssetIds: CanvasId[]; status: number; reply?: string }
export interface CanvasWorkflowCapabilities { storageReady?: boolean; workflowReady?: boolean; operations: string[]; maxConcurrentRunsPerUser?: number; retryAfterMs?: number }
export interface CanvasWorkflowStep { nodeId: string; operation: CanvasTextOperation; modelId: number }
export interface CanvasWorkflowEstimateRequest { canvasId: CanvasId; revisionNo: number; targetNodeIds: string[]; steps: CanvasWorkflowStep[]; failurePolicy: 'stop' | 'continueIndependent' }
export interface CanvasWorkflowQuote { quoteId: string; canvasId: CanvasId; revisionNo: number; expiresAt?: string; reservedCredits?: number; [key: string]: unknown }
export interface CanvasWorkflowNode {
  nodeId: string; operation?: string; status: 'pending' | 'running' | 'waitingReview' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'
  taskFamily?: 'text' | 'analysis' | 'execution' | 'generation'; taskId?: CanvasId; error?: string
}
export interface CanvasWorkflow {
  workflowId: CanvasId; canvasId: CanvasId; revisionNo: number
  status: 'running' | 'waitingReview' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled'
  nodes: CanvasWorkflowNode[]; submittedReservedCredits: number; actualCredits: number | null; error?: string
}
export type CanvasChatSessionPage = CanvasPage<CanvasChatSession>
