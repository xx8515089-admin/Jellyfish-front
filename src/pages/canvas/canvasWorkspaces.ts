import { StudioCanvases, canvasRequestId, type CanvasSummary } from '../../services/studioCanvases'

export interface CanvasWorkspace {
  id: string; name: string; createdAt: string; updatedAt: string; revisionNo: number
}
const revisions = new Map<string, number>()
const workspace = (item: CanvasSummary): CanvasWorkspace => {
  const id = String(item.canvasId)
  revisions.set(id, item.currentRevisionNo ?? item.revisionNo)
  return { id, name: item.name, createdAt: item.createdAt, updatedAt: item.updatedAt, revisionNo: item.revisionNo }
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
let pendingCreate: { name: string; id: string } | null = null
export async function createCanvasWorkspace(name: string) {
  if (!pendingCreate || pendingCreate.name !== name) pendingCreate = { name, id: canvasRequestId('create') }
  const result = workspace(await StudioCanvases.create(name, pendingCreate.id))
  pendingCreate = null
  return result
}
export async function renameCanvasWorkspace(id: string, name: string) {
  if (getLegacyCanvasWorkspace(id)) return changeLegacy(id, name)
  const revision = revisions.get(id)
  if (!revision) throw new Error('请刷新画布列表后重试')
  return workspace(await StudioCanvases.rename(id, revision, name, canvasRequestId('rename')))
}
export async function deleteCanvasWorkspace(id: string) {
  if (getLegacyCanvasWorkspace(id)) { changeLegacy(id); return }
  const revision = revisions.get(id)
  if (!revision) throw new Error('请刷新画布列表后重试')
  await StudioCanvases.delete(id, revision)
  revisions.delete(id)
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
