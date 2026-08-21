export interface CanvasWorkspace {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

const CANVAS_REGISTRY_KEY = 'jellyfish_canvas_workspaces_v1'

const canUseBrowserStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage)

const createWorkspaceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const parseWorkspaceRegistry = (value: string | null): CanvasWorkspace[] => {
  if (!value) return []
  try {
    const workspaces = JSON.parse(value) as unknown
    if (!Array.isArray(workspaces)) return []
    return workspaces.filter((workspace): workspace is CanvasWorkspace => (
      typeof workspace === 'object' &&
      workspace !== null &&
      typeof (workspace as CanvasWorkspace).id === 'string' &&
      typeof (workspace as CanvasWorkspace).name === 'string' &&
      typeof (workspace as CanvasWorkspace).createdAt === 'string' &&
      typeof (workspace as CanvasWorkspace).updatedAt === 'string'
    ))
  } catch {
    return []
  }
}

const saveCanvasWorkspaces = (workspaces: CanvasWorkspace[]) => {
  if (!canUseBrowserStorage()) return
  window.localStorage.setItem(CANVAS_REGISTRY_KEY, JSON.stringify(workspaces))
}

export const getCanvasStoragePrefix = (workspaceId: string) =>
  `jellyfish_canvas:${encodeURIComponent(workspaceId)}:`

export const listCanvasWorkspaces = (): CanvasWorkspace[] => {
  if (!canUseBrowserStorage()) return []
  return parseWorkspaceRegistry(window.localStorage.getItem(CANVAS_REGISTRY_KEY))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const getCanvasWorkspace = (workspaceId: string) =>
  listCanvasWorkspaces().find((workspace) => workspace.id === workspaceId) ?? null

export const createCanvasWorkspace = (name: string): CanvasWorkspace => {
  const now = new Date().toISOString()
  const workspace: CanvasWorkspace = {
    id: createWorkspaceId(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  }
  saveCanvasWorkspaces([workspace, ...listCanvasWorkspaces()])

  if (canUseBrowserStorage()) {
    const prefix = getCanvasStoragePrefix(workspace.id)
    window.localStorage.setItem(`${prefix}tapnow_project_name`, workspace.name)
  }
  return workspace
}

export const renameCanvasWorkspace = (workspaceId: string, name: string) => {
  const nextName = name.trim()
  if (!nextName) return null

  const now = new Date().toISOString()
  let renamedWorkspace: CanvasWorkspace | null = null
  const workspaces = listCanvasWorkspaces().map((workspace) => {
    if (workspace.id !== workspaceId) return workspace
    renamedWorkspace = { ...workspace, name: nextName, updatedAt: now }
    return renamedWorkspace
  })
  if (!renamedWorkspace) return null

  saveCanvasWorkspaces(workspaces)

  if (canUseBrowserStorage()) {
    const prefix = getCanvasStoragePrefix(workspaceId)
    window.localStorage.setItem(`${prefix}tapnow_project_name`, nextName)
  }

  return renamedWorkspace
}

export const touchCanvasWorkspace = (workspaceId: string) => {
  const now = new Date().toISOString()
  const workspaces = listCanvasWorkspaces().map((workspace) => (
    workspace.id === workspaceId ? { ...workspace, updatedAt: now } : workspace
  ))
  saveCanvasWorkspaces(workspaces)
}

const deleteScopedDatabases = async (prefix: string) => {
  if (typeof indexedDB === 'undefined') return

  const databaseFactory = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string }>>
  }
  if (databaseFactory.databases) {
    const databases = await databaseFactory.databases()
    await Promise.all(
      databases
        .map((database) => database.name)
        .filter((name): name is string => Boolean(name?.startsWith(prefix)))
        .map((name) => new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name)
          request.onsuccess = () => resolve()
          request.onerror = () => resolve()
          request.onblocked = () => resolve()
        })),
    )
    return
  }

  for (const databaseName of ['tapnow_images_db', 'tapnow_autosave_db']) {
    indexedDB.deleteDatabase(`${prefix}${databaseName}`)
  }
}

export const deleteCanvasWorkspace = async (workspaceId: string) => {
  saveCanvasWorkspaces(listCanvasWorkspaces().filter((workspace) => workspace.id !== workspaceId))
  if (!canUseBrowserStorage()) return

  const prefix = getCanvasStoragePrefix(workspaceId)
  const scopedKeys = Array.from({ length: window.localStorage.length }, (_, index) => (
    window.localStorage.key(index)
  )).filter((key): key is string => Boolean(key?.startsWith(prefix)))
  scopedKeys.forEach((key) => window.localStorage.removeItem(key))
  await deleteScopedDatabases(prefix)
}
