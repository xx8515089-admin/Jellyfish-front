import { canvasCall, type CanvasId, type CanvasPage } from './studioCanvases'
import type { CanvasAnalysisCapabilities, CanvasAnalysisModel, CanvasAnalysisEstimate, CanvasAnalysisQuote, CanvasAnalysisTask } from './studioCanvasAnalysisTypes'
const base = '/api/v1/studio/canvases/analysis'
const get = <T>(path: string, query: Record<string, unknown> = {}) => canvasCall<T>({ method: 'GET', url: base + path, query })
const post = <T>(path: string, body: unknown) => canvasCall<T>({ method: 'POST', url: base + path, body, mediaType: 'application/json' })
export const CanvasAnalysis = {
  capabilities: () => get<CanvasAnalysisCapabilities>('/capabilities'),
  models: (operation: string) => get<CanvasAnalysisModel[]>('/models', { operation }),
  estimate: (body: CanvasAnalysisEstimate) => post<CanvasAnalysisQuote>('/costEstimate', body),
  create: (body: { canvasId: CanvasId; quoteId: string; clientRequestId: string }) => post<CanvasAnalysisTask>('/create', body),
  detail: (canvasId: CanvasId, taskId: CanvasId) => get<CanvasAnalysisTask>('/detail', { canvasId, taskId }),
  submission: (canvasId: CanvasId, clientRequestId: string) => get<CanvasAnalysisTask>('/submission', { canvasId, clientRequestId }),
  list: (canvasId: CanvasId, page = 1) => get<CanvasPage<CanvasAnalysisTask>>('/list', { canvasId, page, pageSize: 20 }),
  cancel: (canvasId: CanvasId, taskId: CanvasId) => post<CanvasAnalysisTask>('/cancel', { canvasId, taskId }),
  retry: (body: { canvasId: CanvasId; quoteId: string; clientRequestId: string; taskId: CanvasId }) => post<CanvasAnalysisTask>('/retry', body),
  retrySettlement: (canvasId: CanvasId, taskId: CanvasId) => post<CanvasAnalysisTask>('/retrySettlement', { canvasId, taskId }),
}
