import { withCanvasOperationLock } from './TapnowStudio/canvasOperationLock'
import { canvasDeletedKey, clearCanvasCache, canvasUserScope } from './canvasCache'
import { StudioCanvases, canvasRequestId, type CanvasSummary } from '../../services/studioCanvases'

export interface CanvasWorkspace extends Pick<CanvasSummary, 'coverAssetId' | 'coverFileId' | 'coverUrl' | 'coverType' | 'coverContentUrl'> {
  id: string; name: string; createdAt: string; updatedAt: string; revisionNo: number
}
const revisions = new Map<string, number>()
const workspace = (item: CanvasSummary): CanvasWorkspace => {
  const id = String(item.canvasId)
  revisions.set(id, item.currentRevisionNo ?? item.revisionNo)
  return {
    id, name: item.name, createdAt: item.createdAt, updatedAt: item.updatedAt, revisionNo: item.revisionNo,
    coverAssetId: item.coverAssetId, coverFileId: item.coverFileId,
    coverUrl: item.coverUrl, coverType: item.coverType, coverContentUrl: item.coverContentUrl,
  }
}
export const getCanvasStoragePrefix = (id: string) => `jellyfish_canvas:${encodeURIComponent(id)}:`
export async function listCanvasWorkspaces(): Promise<CanvasWorkspace[]> {
  const capabilities = await StudioCanvases.capabilities()
  if (!capabilities.storageReady) throw new Error('画布存储尚未初始化，请联系管理员')
  const items: CanvasWorkspace[] = []
  for (let page = 1; ; page++) {
    const result = await StudioCanvases.list(page, 100)
    items.push(...result.items.map(workspace))
    if (!result.items.length || items.length >= result.total) return [...items, ...listLegacyCanvasWorkspaces()]
  }
}
async function projectRequest<T>(kind: string, id: string, body: Record<string, any>, send: (body: Record<string, any>) => Promise<T>) {
  const owner = canvasUserScope()
  const key = 'canvas-project:' + owner + ':' + id + ':' + kind
  return withCanvasOperationLock(key, async () => {
    let pending = JSON.parse(window.localStorage.getItem(key) || 'null')
    if (!pending) { pending = { ...body, clientRequestId: canvasRequestId(kind) }; window.localStorage.setItem(key, JSON.stringify(pending)) }
    if (canvasUserScope() !== owner) throw new Error('账户已变化，请使用原账户恢复请求')
    try {
      const result = await send(pending)
      if (canvasUserScope() !== owner) throw new Error('账户已变化，原请求记录已保留')
      window.localStorage.setItem(key + ':history:' + pending.clientRequestId, JSON.stringify(pending))
      window.localStorage.removeItem(key)
      return result
    } catch (error) {
      if ((error as { submissionState?: string }).submissionState === 'notAccepted') {
        window.localStorage.setItem(key + ':history:' + pending.clientRequestId, JSON.stringify(pending))
        window.localStorage.removeItem(key)
      }
      throw error
    }
  })
}
export async function createCanvasWorkspace(name: string) {
  const created = await projectRequest('create', 'new', { name }, body => StudioCanvases.create(body.name, body.clientRequestId))
  if (created.deleted) throw new Error('原创建请求已确认，但画布已删除，请重新创建')
  const result = workspace(created)
  if (created.revisionNo === 1 && created.currentRevisionNo === 1 && !created.project.nodes.length) {
    await clearCanvasCache(result.id)
    window.localStorage.removeItem(canvasDeletedKey(result.id))
  }
  return result
}
export async function renameCanvasWorkspace(id: string, name: string) {
  if (getLegacyCanvasWorkspace(id)) return changeLegacy(id, name)
  const revision = revisions.get(id)
  if (!revision) throw new Error('请刷新画布列表后重试')
  return workspace(await projectRequest('rename', id, { canvasId: id, expectedRevisionNo: revision, name }, body => StudioCanvases.rename(body.canvasId, body.expectedRevisionNo, body.name, body.clientRequestId)))
}
export async function deleteCanvasWorkspace(id: string) {
  if (getLegacyCanvasWorkspace(id)) { changeLegacy(id); await clearCanvasCache(id, false); return }
  const revision = revisions.get(id)
  if (!revision) throw new Error('请刷新画布列表后重试')
  await StudioCanvases.delete(id, revision)
  revisions.delete(id)
  window.localStorage.setItem(canvasDeletedKey(id), String(Date.now()))
  await clearCanvasCache(id)
}

const LEGACY_REGISTRY_KEY = 'jellyfish_canvas_workspaces_v1'
export function listLegacyCanvasWorkspaces(): CanvasWorkspace[] {
  try {
    const items: unknown = JSON.parse(window.localStorage.getItem(LEGACY_REGISTRY_KEY) || '[]')
    if (!Array.isArray(items)) return []
    return items.filter((item) => item && typeof item.id === 'string' && !/^[1-9]\d*$/.test(item.id) && typeof item.name === 'string')
      .map((item) => ({ ...item, revisionNo: 0 }))
  } catch { return [] }
}
export const getLegacyCanvasWorkspace = (id: string) => listLegacyCanvasWorkspaces().find((item) => item.id === id)
function changeLegacy(id: string, name?: string) {
  const items = listLegacyCanvasWorkspaces()
  const result = name ? items.map((item) => item.id === id ? { ...item, name, updatedAt: new Date().toISOString() } : item) : items.filter((item) => item.id !== id)
  window.localStorage.setItem(LEGACY_REGISTRY_KEY, JSON.stringify(result))
  if (name) window.localStorage.setItem(`${getCanvasStoragePrefix(id)}tapnow_project_name`, name)
  return result.find((item) => item.id === id)
}
