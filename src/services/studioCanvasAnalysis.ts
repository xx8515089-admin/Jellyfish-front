import { CanvasAnalysisService } from './generated/services/CanvasAnalysisService'
import { canvasResult } from './studioCanvases'
import type { CanvasId, CanvasPage } from './studioCanvases'
import type { CanvasAnalysisCapabilities, CanvasAnalysisModel, CanvasAnalysisEstimate, CanvasAnalysisQuote, CanvasAnalysisTask } from './studioCanvasAnalysisTypes'

/** Domain adapter; generated requests use the application's shared authentication. */
export const CanvasAnalysis = {
  capabilities: () => canvasResult<CanvasAnalysisCapabilities>(CanvasAnalysisService.analysisCapabilities()),
  models: (operation: string) => canvasResult<CanvasAnalysisModel[]>(CanvasAnalysisService.analysisModels({ operation })),
  estimate: (requestBody: CanvasAnalysisEstimate) => canvasResult<CanvasAnalysisQuote>(CanvasAnalysisService.analysisCostEstimate({ requestBody, language: 'zh' })),
  create: (requestBody: { canvasId: CanvasId; quoteId: string; clientRequestId: string }) => canvasResult<CanvasAnalysisTask>(CanvasAnalysisService.analysisCreate({ requestBody })),
  detail: (canvasId: CanvasId, taskId: CanvasId) => canvasResult<CanvasAnalysisTask>(CanvasAnalysisService.analysisDetail({ canvasId, taskId })),
  submission: (canvasId: CanvasId, clientRequestId: string) => canvasResult<CanvasAnalysisTask>(CanvasAnalysisService.analysisSubmission({ canvasId, clientRequestId })),
  list: (canvasId: CanvasId, page = 1) => canvasResult<CanvasPage<CanvasAnalysisTask>>(CanvasAnalysisService.analysisList({ canvasId, page, pageSize: 20 })),
  cancel: (canvasId: CanvasId, taskId: CanvasId) => canvasResult<CanvasAnalysisTask>(CanvasAnalysisService.analysisCancel({ requestBody: { canvasId, taskId } })),
  retry: (requestBody: { canvasId: CanvasId; quoteId: string; clientRequestId: string; taskId: CanvasId }) => canvasResult<CanvasAnalysisTask>(CanvasAnalysisService.analysisRetry({ requestBody })),
  retrySettlement: (canvasId: CanvasId, taskId: CanvasId) => canvasResult<CanvasAnalysisTask>(CanvasAnalysisService.analysisRetrySettlement({ requestBody: { canvasId, taskId } })),
}
