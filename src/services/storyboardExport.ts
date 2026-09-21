import { getAuthToken, clearAuthSession, getStoredAuthUser } from '../auth'
import { apiBaseUrl, joinApiBasePath } from '../config/api'
import { OpenAPI } from './generated'

export type ExportSelection = { segmentId: number; generationId: number; mediaType: 'image' | 'video'; episodeId: number; episodeIndex: number; segmentIndex: number }
export type ExportRequest = { snapshotToken?: string; scriptImportId: number; dimension: 'episode' | 'segment'; episodeId?: number; scope: 'all' | 'custom'; start?: number; end?: number; content: 'media' | 'audio' | 'mixed'; mediaSelections?: { segmentId: number; generationId: number; mediaType: 'image' | 'video' }[] }
export type ExportProblem = { code: string; message: string; episodeIndex?: number; segmentIndex?: number }
export type ExportPreview = { snapshotToken?: string; snapshotExpiresAt?: string; canExport: boolean; message: string; fileName: string; imageCount: number; videoCount: number; audioCount: number; totalBytes: number; problems: ExportProblem[]; items: { segmentId: number; generationId: number; mediaType: 'image' | 'video' | 'audio' }[] }
export class StoryboardExportError extends Error {
  constructor(message: string, public problems: ExportProblem[] = [], public errorCode?: string) { super(message) }
}
export function exportInteger(value: unknown): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('导出 ID 和范围必须为正整数')
  return number
}
export function selectionsInRange(request: ExportRequest, selections: ExportSelection[]) {
  return selections.filter((item) => {
    if (request.dimension === 'segment' && item.episodeId !== request.episodeId) return false
    const index = request.dimension === 'segment' ? item.segmentIndex : item.episodeIndex
    return request.scope === 'all' || (index >= request.start! && index <= request.end!)
  })
}
export function buildExportRequest(input: ExportRequest, selections: ExportSelection[]): ExportRequest {
  const result: ExportRequest = { scriptImportId: exportInteger(input.scriptImportId), dimension: input.dimension, scope: input.scope, content: input.content }
  if (input.dimension === 'segment') result.episodeId = exportInteger(input.episodeId)
  if (input.scope === 'custom') {
    result.start = exportInteger(input.start); result.end = exportInteger(input.end)
    if (result.start > result.end) throw new Error('起始序号不能大于结束序号')
  }
  if (input.content !== 'audio') {
    const selected = selectionsInRange(result, selections)
    if (selected.length) result.mediaSelections = selected.map(({ segmentId, generationId, mediaType }) => ({ segmentId: exportInteger(segmentId), generationId: exportInteger(generationId), mediaType }))
  }
  return result
}
export function freezeExportRequest(request: ExportRequest, preview: ExportPreview): ExportRequest {
  if (!preview.snapshotToken) throw new StoryboardExportError('预检未返回快照凭据，请确认后端已升级后重试')
  return { ...JSON.parse(JSON.stringify(request)), snapshotToken: preview.snapshotToken }
}
const storageKey = (id: string | number) => `storyboard-export-selections:${getStoredAuthUser()?.id ?? 'anonymous'}:${id}`
export function readExportSelections(id: string | number): ExportSelection[] {
  try { const value: unknown = JSON.parse(sessionStorage.getItem(storageKey(id)) || '[]'); return Array.isArray(value) ? value.filter((item) => item && Number.isSafeInteger(item.segmentId) && Number.isSafeInteger(item.generationId) && (item.mediaType === 'image' || item.mediaType === 'video')) : [] } catch { return [] }
}
export function writeExportSelections(id: string | number, selections: ExportSelection[]) { sessionStorage.setItem(storageKey(id), JSON.stringify(selections)) }

async function post(path: string, request: ExportRequest, signal: AbortSignal) {
  const token = getAuthToken()
  if (!token) throw new Error('请先登录后再导出')
  const response = await fetch(joinApiBasePath(OpenAPI.BASE || apiBaseUrl, `/api/v1/studio/storyboards/exports/${path}`), { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal })
  if (response.status === 401) { clearAuthSession(); window.location.assign('/login'); throw new Error('登录已失效，请重新登录') }
  if (!response.ok || response.headers.get('Content-Type')?.includes('json')) {
    const body = await response.json().catch(() => null)
    if (!response.ok || (body?.code ?? 200) >= 400 || path === 'zip') throw new StoryboardExportError(body?.message || '导出失败，请重试', body?.data?.problems || [], body?.data?.errorCode || body?.errorCode)
    return body.data as ExportPreview
  }
  if (path === 'preview') throw new Error('导出预检响应格式错误')
  return response
}
const BLOB_LIMIT = 256 * 1024 * 1024
export async function downloadStoryboardZip(request: ExportRequest, signal: AbortSignal, onPreview: (preview: ExportPreview) => void) {
  const frozen: ExportRequest = JSON.parse(JSON.stringify(request))
  const account = getStoredAuthUser()?.id
  const preview = await post('preview', frozen, signal) as ExportPreview
  if (getStoredAuthUser()?.id !== account) throw new Error('账号已变化，已停止导出')
  onPreview(preview)
  if (!preview.canExport) throw new StoryboardExportError(preview.message, preview.problems)
  if (preview.totalBytes > BLOB_LIMIT) throw new Error('素材包超过 256 MiB，请缩小导出范围后重试')
  const response = await post('zip', freezeExportRequest(frozen, preview), signal) as Response
  if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/zip')) throw new Error('导出响应不是 ZIP 文件，请重试')
  if (Number(response.headers.get('Content-Length')) > BLOB_LIMIT) { await response.body?.cancel(); throw new Error('素材包超过 256 MiB，请缩小导出范围') }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取 ZIP 文件')
  const chunks: ArrayBuffer[] = []; let size = 0
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > BLOB_LIMIT) throw new Error('素材包超过 256 MiB，请缩小导出范围')
      chunks.push(new Uint8Array(value).buffer)
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error }
  finally { reader.releaseLock() }
  if (signal.aborted) throw new DOMException('已取消导出', 'AbortError')
  const expected = Number(response.headers.get('Content-Length'))
  if (!response.headers.get('Content-Encoding') && expected > 0 && size !== expected) throw new Error('ZIP 下载不完整，请重试')
  const signature = new Uint8Array(await new Blob(chunks).slice(0, 4).arrayBuffer())
  if (size < 4 || signature[0] !== 0x50 || signature[1] !== 0x4b) throw new Error('ZIP 文件内容无效')
  if (getStoredAuthUser()?.id !== account) throw new Error('账号已变化，已停止导出')
  const disposition = response.headers.get('Content-Disposition') || ''
  let filename = preview.fileName || '素材.zip'
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  if (encoded) { try { filename = decodeURIComponent(encoded) } catch { /* use preview filename */ } }
  else filename = /filename="([^"]+)"/i.exec(disposition)?.[1] || filename
  const url = URL.createObjectURL(new Blob(chunks, { type: 'application/zip' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link)
  link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}
