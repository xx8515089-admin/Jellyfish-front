import { OpenAPI } from './generated'
import { request, getHeaders } from './generated/core/request'
import type { ApiRequestOptions } from './generated/core/ApiRequestOptions'

export type CanvasId = number | string
export interface CanvasSummary {
  canvasId: CanvasId; name: string; revisionNo: number; currentRevisionNo: number
  createdAt: string; updatedAt: string
}
export interface CanvasDocument extends CanvasSummary {
  schemaVersion: number
  project: { nodes: unknown[]; connections: unknown[]; view: { x: number; y: number; zoom: number }; projectName?: string; [key: string]: unknown }
  assetBindings: { nodeId: string; fieldPath: string; assetId: CanvasId; shotId?: CanvasId }[]
  modelBindings: { nodeId: string; fieldPath: string; modelId: number }[]
}
export interface CanvasAsset {
  assetId: CanvasId; canvasId: CanvasId; name: string; mediaType: string; mimeType: string
  sizeBytes: number; url?: string; contentUrl?: string; downloadUrl?: string; removed?: boolean
}
export interface CanvasGeneration {
  generationId: CanvasId; canvasId: CanvasId; revisionNo: number; nodeId: string
  status: number; progress: number; cancelRequested: boolean; error?: string; billingState: string
  operation: 'imageGenerate' | 'videoGenerate'; canSync: boolean; outputs: CanvasAsset[]; createdAt: string
}
export interface CanvasGenerateRequest {
  canvasId: CanvasId; revisionNo: number; nodeId: string
  operation: 'imageGenerate' | 'videoGenerate'; clientRequestId: string
}
export interface CanvasPage<T> { items: T[]; page: number; pageSize: number; total: number }
export class CanvasApiError extends Error {
  constructor(message: string, public errorCode?: string, public status?: number) { super(message) }
}
export const canvasRequestId = (operation: string) => {
  if (typeof crypto.randomUUID === 'function') return `${operation}-${crypto.randomUUID()}`
  // getRandomValues remains available on HTTP LAN deployments where randomUUID is absent.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `${operation}-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
}
async function call<T>(options: ApiRequestOptions): Promise<T> {
  try {
    const result = await request<{ code: number; message?: string; data: T & { errorCode?: string } }>(OpenAPI, options)
    if (result.code !== 200) throw new CanvasApiError(result.message || '画布请求失败', result.data?.errorCode, result.code)
    return result.data
  } catch (error) {
    const body = (error as { body?: { message?: string; data?: { errorCode?: string } } }).body
    if (body) throw new CanvasApiError(body.message || '画布请求失败', body.data?.errorCode, (error as { status?: number }).status)
    throw error
  }
}
const base = '/api/v1/studio/canvases'
const get = <T>(path: string, query: Record<string, unknown> = {}) => call<T>({ method: 'GET', url: base + path, query })
const post = <T>(path: string, body: unknown) => call<T>({ method: 'POST', url: base + path, body, mediaType: 'application/json' })
export const StudioCanvases = {
  capabilities: () => get<{ storageReady: boolean; [key: string]: unknown }>('/capabilities'),
  list: (page = 1, pageSize = 20, keyword?: string) => get<CanvasPage<CanvasSummary>>('/list', { page, pageSize, keyword }),
  create: (name: string, clientRequestId: string) => post<CanvasDocument>('/create', { name, clientRequestId }),
  detail: (canvasId: CanvasId, revisionNo?: number) => get<CanvasDocument>('/detail', { canvasId, revisionNo }),
  save: (body: { canvasId: CanvasId; expectedRevisionNo: number; clientSaveId: string; schemaVersion: number; project: CanvasDocument['project']; assetBindings: CanvasDocument['assetBindings']; modelBindings: CanvasDocument['modelBindings'] }) => post<CanvasDocument>('/save', body),
  rename: (canvasId: CanvasId, expectedRevisionNo: number, name: string, clientRequestId: string) => post<CanvasDocument>('/rename', { canvasId, expectedRevisionNo, name, clientRequestId }),
  delete: (canvasId: CanvasId, expectedRevisionNo: number) => post<null>('/delete', { canvasId, expectedRevisionNo }),
  revisions: (canvasId: CanvasId, page = 1) => get<CanvasPage<{ revisionNo: number; createdAt: string }>>('/revisions', { canvasId, page, pageSize: 20 }),
  restore: (canvasId: CanvasId, expectedRevisionNo: number, sourceRevisionNo: number, clientRequestId: string) => post<CanvasDocument>('/restore', { canvasId, expectedRevisionNo, sourceRevisionNo, clientRequestId }),
  copy: (canvasId: CanvasId, sourceRevisionNo: number, name: string, clientRequestId: string) => post<CanvasDocument>('/copy', { canvasId, sourceRevisionNo, name, clientRequestId }),
  upload: (canvasId: CanvasId, file: File) => call<CanvasAsset>({ method: 'POST', url: base + '/assets/upload', formData: { canvasId, file } }),
  assets: (canvasId: CanvasId, page = 1) => get<CanvasPage<CanvasAsset>>('/assets/list', { canvasId, page, pageSize: 100 }),
  attach: (canvasId: CanvasId, sourceAssetId: CanvasId) => post<CanvasAsset>('/assets/attach', { canvasId, sourceAssetId }),
  removeAsset: (canvasId: CanvasId, assetId: CanvasId) => post<null>('/assets/remove', { canvasId, assetId }),
  async content(canvasId: CanvasId, assetId: CanvasId, download = false) {
    const url = `${base}/assets/${download ? 'download' : 'content'}?canvasId=${encodeURIComponent(canvasId)}&assetId=${encodeURIComponent(assetId)}`
    const headers = await getHeaders(OpenAPI, { method: 'GET', url })
    const response = await fetch(OpenAPI.BASE + url, { headers, credentials: OpenAPI.WITH_CREDENTIALS ? OpenAPI.CREDENTIALS : 'same-origin' })
    if (!response.ok) throw new Error(`素材读取失败（${response.status}）`)
    return response.blob()
  },
  estimate: (body: CanvasGenerateRequest) => post<{ creditCost: number; currentBalance: number; sufficient: boolean; unlimited: boolean }>('/generations/costEstimate', body),
  generate: (body: CanvasGenerateRequest) => post<CanvasGeneration>('/generations/create', body),
  generation: (canvasId: CanvasId, generationId: CanvasId) => get<CanvasGeneration>('/generations/detail', { canvasId, generationId }),
  generations: (canvasId: CanvasId, page = 1, nodeId?: string) => get<CanvasPage<CanvasGeneration>>('/generations/list', { canvasId, page, pageSize: 20, nodeId }),
  submission: (canvasId: CanvasId, clientRequestId: string) => get<CanvasGeneration>('/generations/submission', { canvasId, clientRequestId }),
  cancel: (canvasId: CanvasId, generationId: CanvasId) => post<CanvasGeneration>('/generations/cancel', { canvasId, generationId }),
  retry: (canvasId: CanvasId, generationId: CanvasId, clientRequestId: string) => post<CanvasGeneration>('/generations/retry', { canvasId, generationId, clientRequestId }),
  sync: (canvasId: CanvasId, generationId: CanvasId) => post<CanvasGeneration>('/generations/sync', { canvasId, generationId }),
}

/** Resolve protected media using login headers; the page owns the object URLs. */
export async function hydrateCanvasDocument(document: CanvasDocument, urls: string[]) {
  const copy = JSON.parse(JSON.stringify(document)) as CanvasDocument
  const assets = new Map<string, string>()
  for (const binding of copy.assetBindings ?? []) {
    const node = copy.project.nodes.find((value) => (value as { id: string }).id === binding.nodeId) as Record<string, unknown> | undefined
    if (!node || (binding.shotId !== null && binding.shotId !== undefined)) continue
    let target = node
    const parts = binding.fieldPath.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    for (const part of parts.slice(0, -1)) target = target?.[part] as Record<string, unknown>
    if (!target) continue
    let url = assets.get(String(binding.assetId))
    if (!url) {
      url = URL.createObjectURL(await StudioCanvases.content(copy.canvasId, binding.assetId))
      urls.push(url)
      assets.set(String(binding.assetId), url)
    }
    target[parts[parts.length - 1]] = url
  }
  for (const binding of copy.modelBindings ?? []) {
    const node = copy.project.nodes.find((value) => (value as { id: string }).id === binding.nodeId) as { settings?: { model?: string } } | undefined
    if (node?.settings) node.settings.model = `studio-${binding.modelId}`
  }
  return copy
}
