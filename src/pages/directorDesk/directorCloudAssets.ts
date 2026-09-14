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

export async function restoreCloudAssets(desk: DirectorDesk) {
  const manifest = desk.project.jellyfishCloudAssets ?? []
  if (!manifest.length) {
    if ([...desk.project.assets, ...(desk.project.animationAssets ?? [])].some((asset) => asset.cloudFileId != null)) throw new Error('工程云素材清单缺失')
    return
  }
  const result = await api.validateAssets(desk.id, manifest)
  if (!result.valid || result.files.length !== manifest.length || result.files.some((file) => file.status !== 'available')) throw new Error(result.files.filter((file) => file.status !== 'available').map((file) => file.message).join('；') || '云素材验证失败')
  const files = []
  for (const entry of manifest) {
    const blob = await api.downloadAsset(entry.assetFileId)
    const bytes = await blob.arrayBuffer()
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    if (blob.size !== entry.byteSize || hash !== entry.sha256.toLowerCase()) throw new Error(`素材大小或 SHA-256 不匹配：${entry.relativePath}`)
    validateEmbeddedUris(bytes, entry.relativePath)
    files.push({ id: entry.assetFileId, path: entry.relativePath, blob })
  }
  registerCloudPackage(`${desk.id}/${crypto.randomUUID()}`, files)
}

/** Upload local primary files; separately selected dependencies retain their package-relative paths. */
export async function uploadProjectAssets(id: string | number, project: DirectorProject, dependencies: File[]) {
  const next = structuredClone(project)
  const manifest = new Map((next.jellyfishCloudAssets ?? []).map((entry) => [entry.relativePath, entry]))
  const upload = async (file: File, path: string) => {
    if (manifest.has(path)) throw new Error(`清单已包含 ${path}，请使用不同路径，避免替换历史素材引用`)
    const item = await api.uploadAsset(id, file, path)
    const entry = { assetFileId: item.id, relativePath: item.relativePath, sha256: item.sha256, byteSize: item.byteSize }
    manifest.set(entry.relativePath, entry)
    return item.id
  }
  for (const file of dependencies) await upload(file, file.webkitRelativePath || file.name)
  for (const asset of [...next.assets, ...(next.animationAssets ?? [])]) {
    if (asset.cloudFileId != null) continue
    const key = asset.storageKey || getStoredAssetKey(asset.url)
    let blob: Blob | undefined
    if (key) blob = (await localAssetBinaryStorage.read(key))?.blob
    else if (/^(data:|blob:)/.test(asset.url)) blob = await (await fetch(asset.url)).blob()
    else continue // Built-in remote library resources retain their existing references.
    if (!blob) throw new Error(`本地素材缺失，请重新导入：${asset.fileName}`)
    if (manifest.has(asset.fileName)) throw new Error(`素材路径重复：${asset.fileName}，请为主模型使用唯一文件名`)
    asset.cloudFileId = await upload(new File([blob], asset.fileName, { type: blob.type }), asset.fileName)
  }
  next.jellyfishCloudAssets = [...manifest.values()]
  const result = await api.validateAssets(id, next.jellyfishCloudAssets)
  if (!result.valid || result.files.some((file) => file.status !== 'available')) throw new Error(result.files.filter((file) => file.status !== 'available').map((file) => file.message).join('；') || '云素材依赖不完整')
  return next
}

export async function copyCloudAssets(id: string | number, project: DirectorProject) {
  const next = structuredClone(project)
  const ids = new Map<number, number>()
  for (const entry of next.jellyfishCloudAssets ?? []) {
    const blob = await api.downloadAsset(entry.assetFileId)
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    if (blob.size !== entry.byteSize || hash !== entry.sha256.toLowerCase()) throw new Error(`素材校验失败：${entry.relativePath}`)
    const saved = await api.uploadAsset(id, new File([blob], entry.relativePath.split('/').pop()!, { type: blob.type }), entry.relativePath)
    ids.set(entry.assetFileId, saved.id)
    entry.assetFileId = saved.id
    entry.sha256 = saved.sha256
    entry.byteSize = saved.byteSize
  }
  for (const asset of [...next.assets, ...(next.animationAssets ?? [])]) {
    if (asset.cloudFileId != null) {
      const mapped = ids.get(asset.cloudFileId)
      if (mapped == null) throw new Error('云模型未列入完整清单')
      asset.cloudFileId = mapped
    }
  }
  return next
}
