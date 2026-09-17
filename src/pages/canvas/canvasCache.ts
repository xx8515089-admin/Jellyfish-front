import { getStoredAuthUser } from '../../auth'

export const canvasUserScope = () => {
  const user = getStoredAuthUser()
  return String(user?.id ?? user?.username ?? 'anonymous')
}
export const canvasEditorScope = (canvasId: string, user = canvasUserScope()) => `cloud:${user}:${canvasId}`
const editorPrefix = (scope: string) => `jellyfish_canvas:${encodeURIComponent(scope)}:`
export const canvasDeletedKey = (canvasId: string, user = canvasUserScope()) => `canvas-deleted:${user}:${canvasId}`

/** Only clear the selected canvas. Never clear shared login or other canvas data. */
export async function clearCanvasCache(canvasId: string, cloud = true) {
  const user = canvasUserScope()
  const scopes = cloud ? [canvasEditorScope(canvasId, user), canvasId] : [canvasId]
  const prefixes = scopes.map(editorPrefix)
  if (cloud) prefixes.push(`canvas-cloud:${user}:${canvasId}:`)
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index)
    if (key && prefixes.some(prefix => key.startsWith(prefix))) keys.push(key)
  }
  keys.forEach(key => window.localStorage.removeItem(key))
  if (!window.indexedDB) return
  await Promise.all(scopes.flatMap(scope => ['tapnow_autosave_db', 'tapnow_images_db'].map(name => new Promise<void>((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase(`${editorPrefix(scope)}${name}`)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('画布本地数据库清理失败'))
    // Existing connections receive versionchange and close. A legacy tab may block deletion;
    // the request remains queued and the deletion marker prevents cloud replay meanwhile.
    request.onblocked = () => resolve()
  }))))
}
