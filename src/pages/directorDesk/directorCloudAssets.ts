import { StudioDirectorDesks as api, type DirectorDesk } from '../../services/studioDirectorDesks'
import { registerCloudPackage } from './runtime/editor/loaders/cloudAssetRuntime'
import { getStoredAssetKey, localAssetBinaryStorage } from './runtime/editor/loaders/localAssetBinaryStorage'
import type { DirectorProject } from './runtime/editor/schema/directorProject'

function validateEmbeddedUris(bytes: ArrayBuffer, path: string) {
  let json: unknown
  if (/\.gltf$/i.test(path)) json = JSON.parse(new TextDecoder().decode(bytes))
  if (/\.glb$/i.test(path)) {
    const view = new DataView(bytes)
    if (view.byteLength < 20) throw new Error('GLB 文件不完整')
    const length = view.getUint32(12, true)
    json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + length)).trim())
  }
  const inspect = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) {
      if (key === 'uri' && typeof item === 'string' && !item.startsWith('data:') && (/^[a-z][a-z\d+.-]*:/i.test(item) || item.startsWith('/') || item.includes('\\'))) throw new Error(`模型包含非清单资源：${item}`)
      inspect(item)
    }
  }
  inspect(json)
}


const hashes = new WeakMap<Blob, Promise<string>>()
const digest = (blob: Blob) => {
  if (!hashes.has(blob)) hashes.set(blob, (async () => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join(''))())
  return hashes.get(blob)!
}
const packagePath = (packageId: string | null | undefined, path: string) => JSON.stringify([packageId || null, path])
function safePath(path: string) {
  const value = path.replace(/\\/g, '/')
  if (!value || value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value) || value.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('素材包路径无效：' + path)
  return value
}
export async function restoreCloudAssets(desk: DirectorDesk) {
  const manifest = desk.project.jellyfishCloudAssets ?? []
  if (!manifest.length) {
    if ([...desk.project.assets, ...(desk.project.animationAssets ?? [])].some(asset => asset.cloudFileId != null)) throw new Error('工程云素材清单缺失')
    return
  }
  const result = await api.validateAssets(desk.id, manifest)
  const ids = new Set(manifest.map(entry => entry.assetFileId))
  if (ids.size !== manifest.length || !result.valid || result.files.length !== manifest.length || new Set(result.files.map(file => file.assetFileId)).size !== manifest.length || result.files.some(file => !ids.has(file.assetFileId) || file.status !== 'available')) throw new Error(result.files.filter(file => file.status !== 'available').map(file => file.message).join('；') || '云素材验证失败')
  const metadata = new Map((await api.assets(desk.id)).map(file => [file.id, file]))
  const groups = new Map<string, { id: number; path: string; blob: Blob }[]>()
  const paths = new Set<string>()
  for (const entry of manifest) {
    const item = metadata.get(entry.assetFileId)
    if (!item || item.relativePath !== entry.relativePath || (entry.packageId != null && entry.packageId !== item.packageId)) throw new Error('素材包元数据不一致：' + entry.relativePath)
    entry.packageId = item.packageId ?? null
    const path = safePath(item.relativePath)
    const key = packagePath(item.packageId, path)
    if (paths.has(key)) throw new Error('素材包路径重复：' + path)
    paths.add(key)
    const blob = await api.downloadAsset(entry.assetFileId)
    const hash = await digest(blob)
    if (blob.size !== entry.byteSize || hash !== entry.sha256.toLowerCase() || blob.size !== item.byteSize || hash !== item.sha256.toLowerCase()) throw new Error('素材大小或 SHA-256 不匹配：' + path)
    validateEmbeddedUris(await blob.arrayBuffer(), path)
    const group = item.packageId || '_legacy'
    const files = groups.get(group) || []
    files.push({ id: entry.assetFileId, path, blob }); groups.set(group, files)
  }
  // Register only after every file has passed validation. A loader sees one package only.
  const run = crypto.randomUUID()
  for (const [key, files] of groups) registerCloudPackage(desk.id + '/' + run + '/' + key, files)
}

/** One immutable package per imported primary model; content changes create a new identity. */
export async function uploadProjectAssets(id: string | number, project: DirectorProject, dependencies: File[]) {
  const next = structuredClone(project)
  const manifest = new Map((next.jellyfishCloudAssets ?? []).map(entry => [entry.assetFileId, entry]))
  const selected = new Map<string, Blob>()
  for (const file of dependencies) {
    if (file.size > 100 * 1024 * 1024) throw new Error('单文件不能超过 100 MiB：' + file.name)
    const relative = file.webkitRelativePath || file.name
    const path = safePath(file.webkitRelativePath ? relative.slice(relative.indexOf('/') + 1) : relative)
    if (selected.has(path) && await digest(selected.get(path)!) !== await digest(file)) throw new Error('所选素材路径重复且内容不同：' + path)
    selected.set(path, file)
  }
  let imported = false
  for (const asset of [...next.assets, ...(next.animationAssets ?? [])]) {
    if (asset.cloudFileId != null) continue
    const storageKey = asset.storageKey || getStoredAssetKey(asset.url)
    let blob: Blob | undefined
    if (storageKey) blob = (await localAssetBinaryStorage.read(storageKey))?.blob
    else if (/^(data:|blob:)/.test(asset.url)) { const response = await fetch(asset.url); if (!response.ok) throw new Error('本地素材读取失败'); blob = await response.blob() }
    else continue
    if (!blob) throw new Error('本地素材缺失，请重新导入：' + asset.fileName)
    if (blob.size > 100 * 1024 * 1024) throw new Error('单文件不能超过 100 MiB：' + asset.fileName)
    const hash = await digest(blob)
    // A folder selection may carry the original nested path of the primary model.
    let primary = safePath(asset.fileName)
    for (const [path, value] of selected) if (path.split('/').pop() === asset.fileName.split('/').pop() && await digest(value) === hash) { primary = path; break }
    const files = new Map(selected)
    if (files.has(primary) && await digest(files.get(primary)!) !== hash) throw new Error('主模型路径与所选文件内容冲突：' + primary)
    files.set(primary, blob)
    const fingerprints = await Promise.all([...files].map(async ([path, value]) => [path, await digest(value)]))
    fingerprints.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    // Stable across lost responses/reloads, without storing file bytes or credentials in localStorage.
    const packageId = 'pkg-' + (await digest(new Blob([JSON.stringify(fingerprints)]))).slice(0, 60)
    for (const [path, value] of files) {
      const item = await api.uploadAsset(id, new File([value], path.split('/').pop()!, { type: value.type }), path, packageId)
      if (item.packageId !== packageId || item.relativePath !== path || item.sha256.toLowerCase() !== await digest(value) || item.byteSize !== value.size) throw new Error('素材上传回执与当前包不一致，请确认后端已升级后重试')
      manifest.set(item.id, { assetFileId: item.id, packageId: item.packageId, relativePath: item.relativePath, sha256: item.sha256, byteSize: item.byteSize })
      if (path === primary) asset.cloudFileId = item.id
    }
    imported = true
  }
  if (dependencies.length && !imported) throw new Error('请同时导入主模型；已上传的素材包不可修改，变更依赖需重新导入模型形成新包')
  next.jellyfishCloudAssets = [...manifest.values()]
  const result = await api.validateAssets(id, next.jellyfishCloudAssets)
  if (!result.valid || result.files.length !== next.jellyfishCloudAssets.length || result.files.some(file => file.status !== 'available')) throw new Error(result.files.filter(file => file.status !== 'available').map(file => file.message).join('；') || '云素材依赖不完整')
  return next
}

export async function copyCloudAssets(id: string | number, project: DirectorProject) {
  const next = structuredClone(project)
  const ids = new Map<number, number>()
  // The target desk has its own namespace. Preserve source package boundaries on retries.
  const legacyPackage = 'legacy-' + (await digest(new Blob([JSON.stringify(next.jellyfishCloudAssets || [])]))).slice(0, 57)
  for (const entry of next.jellyfishCloudAssets ?? []) {
    const blob = await api.downloadAsset(entry.assetFileId)
    if (blob.size !== entry.byteSize || await digest(blob) !== entry.sha256.toLowerCase()) throw new Error('素材校验失败：' + entry.relativePath)
    const packageId = entry.packageId || legacyPackage
    const saved = await api.uploadAsset(id, new File([blob], entry.relativePath.split('/').pop()!, { type: blob.type }), entry.relativePath, packageId)
    if (saved.packageId !== packageId || saved.relativePath !== entry.relativePath || saved.sha256 !== entry.sha256 || saved.byteSize !== entry.byteSize) throw new Error('副本素材回执不一致')
    ids.set(entry.assetFileId, saved.id)
    entry.assetFileId = saved.id; entry.packageId = saved.packageId
  }
  for (const asset of [...next.assets, ...(next.animationAssets ?? [])]) if (asset.cloudFileId != null) {
    const mapped = ids.get(asset.cloudFileId)
    if (mapped == null) throw new Error('云模型未列入完整清单')
    asset.cloudFileId = mapped
  }
  return next
}
