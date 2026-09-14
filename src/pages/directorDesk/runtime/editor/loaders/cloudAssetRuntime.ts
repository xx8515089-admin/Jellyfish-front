import { DefaultLoadingManager, LoadingManager, type Loader } from 'three'

const packages = new Map<string, Map<string, string>>()
const assets = new Map<number, string>()
const loaderTypes = new Map<string, Map<new () => Loader, new () => Loader>>()
export function directorLoader<T extends new () => Loader>(Constructor: T, url: string): T {
  if (![...packages.keys()].some((base) => url.startsWith(base))) return Constructor
  let byType = loaderTypes.get(url)
  if (!byType) { byType = new Map(); loaderTypes.set(url, byType) }
  if (!byType.has(Constructor)) {
    byType.set(Constructor, class extends (Constructor as new () => Loader) {
      constructor() { super(); configureCloudLoader(url, this) }
    })
  }
  return byType.get(Constructor)! as T
}
export function registerCloudPackage(key: string, files: { id: number; path: string; blob: Blob }[]) {
  const base = `https://director-cloud.invalid/${key}/`
  const resources = new Map<string, string>()
  for (const file of files) {
    const url = base + file.path
    resources.set(url, URL.createObjectURL(file.blob))
    assets.set(file.id, url)
  }
  packages.set(base, resources)
}
export function clearCloudPackages() {
  for (const resources of packages.values()) for (const url of resources.values()) URL.revokeObjectURL(url)
  packages.clear()
  assets.clear()
  loaderTypes.clear()
}
export function cloudAssetUrl(id: number, image = false) {
  const url = assets.get(id)
  if (!url) throw new Error(`云素材 ${id} 尚未验证恢复`)
  if (image) {
    for (const resources of packages.values()) if (resources.has(url)) return resources.get(url)!
  }
  return url
}
export function configureCloudLoader(url: string, loader: Loader) {
  const entry = [...packages].find(([base]) => url.startsWith(base))
  if (!entry) { loader.manager = DefaultLoadingManager; return }
  const [base, resources] = entry
  loader.manager = new LoadingManager()
  loader.manager.setURLModifier((requested) => {
    // Embedded data is part of the validated model bytes. External resources must be in this manifest.
    if (requested.startsWith('data:') || requested.startsWith('blob:')) return requested
    const resolved = new URL(requested, url).href
    const mapped = resources.get(resolved)
    if (!resolved.startsWith(base) || !mapped) throw new Error(`云模型缺少已验证依赖：${requested}`)
    return mapped
  })
}
