import { StudioCanvases, canvasRequestId } from '../../../services/studioCanvases'
import { getStoredAuthUser } from '../../../auth'

const mediaValue = (value) => typeof value === 'string' && /^(blob:|data:|file:|https?:\/\/|img_)/i.test(value)
const secretKey = /^(api[-_]?key|authorization|headers|requestTemplate|requestOverrides|provider|providers|apiConfigs|token|accessToken|baseUrl|endpoint|key)$/i
const stripSecrets = (value) => {
  if (Array.isArray(value)) return value.map(stripSecrets)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !secretKey.test(key)).map(([key, item]) => [key, stripSecrets(item)]))
  return value
}
const definitiveFailure = (error) => error?.errorCode !== 'IDEMPOTENCY_CONFLICT' && (
  (error?.status >= 400 && error.status < 500 && ![408, 425, 429].includes(error.status)) || Boolean(error?.errorCode)
)
const pointerParts = (path) => path.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
export const readPointer = (node, path) => pointerParts(path).reduce((value, part) => value?.[part], node)
const escapePointer = (key) => String(key).replace(/~/g, '~0').replace(/\//g, '~1')

export function canvasModelConfigs(models) {
  return models.map((model) => ({
    id: `studio-${model.id}`, _uid: `studio-${model.id}`, backendModelId: model.id,
    modelName: model.modelCode, displayName: model.name, provider: model.supplierName || 'Studio',
    type: model.type === 2 ? 'Image' : 'Video',
    ratioLimits: model.imageCapabilities?.aspectRatios || ['16:9', '9:16', '1:1'],
    resolutionLimits: model.type === 2 ? (model.imageCapabilities?.resolutions || [1, 2, 4]).map((value) => `${value}K`) : model.videoCapabilities?.resolutions || ['720p'],
    videoResolutions: model.videoCapabilities?.resolutions || ['720p'],
    defaultRatio: model.imageCapabilities?.aspectRatios?.[0] || '16:9',
    defaultImageConcurrency: 1,
    durations: model.videoCapabilities ? Array.from({ length: model.videoCapabilities.maxDurationSeconds - model.videoCapabilities.minDurationSeconds + 1 }, (_, index) => `${model.videoCapabilities.minDurationSeconds + index}s`) : undefined,
  }))
}

export class CanvasCloudSession {
  constructor(document, models, resolveMedia) {
    this.document = document
    this.models = models
    this.resolveMedia = resolveMedia
    this.media = new Map()
    this.uploads = new Map()
    this.urls = []
    this.revision = document.revisionNo
    this.blocked = document.currentRevisionNo > document.revisionNo
    const user = getStoredAuthUser()
    this.prefix = `canvas-cloud:${user?.id ?? user?.username ?? 'anonymous'}:${document.canvasId}:`
    this.pendingSave = this.read('save')
    this.pendingGeneration = this.read('generation')
    for (const binding of document.assetBindings || []) {
      const node = document.project.nodes.find((node) => node.id === binding.nodeId)
      const value = readPointer(node, binding.fieldPath)
      if (value && binding.shotId == null) this.media.set(value, { assetId: binding.assetId, canvasId: document.canvasId })
    }
  }
  read(key) {
    try { return JSON.parse(window.localStorage.getItem(this.prefix + key) || 'null') } catch { throw new Error('画布请求记录无法读取，请检查浏览器存储') }
  }
  write(key, value) {
    // Persist before sending: a failed write must prevent a billable submission.
    if (value == null) window.localStorage.removeItem(this.prefix + key)
    else window.localStorage.setItem(this.prefix + key, JSON.stringify(value))
  }
  async upload(value) {
    if (this.media.has(value)) return this.media.get(value)
    let pending = this.uploads.get(value)
    if (pending) {
      for (let page = 1; ; page++) {
        const result = await StudioCanvases.assets(this.document.canvasId, page)
        const asset = result.items.find((asset) => asset.name === pending.name && asset.sizeBytes === pending.size)
        if (asset) { this.media.set(value, asset); this.uploads.delete(value); return asset }
        if (page * 100 >= result.total || !result.items.length) break
      }
      throw new Error('素材上传结果尚未确认，请稍后重试保存；不会自动重复上传')
    }
    const source = await this.resolveMedia(value)
    if (!source || source.startsWith('file:') || source.startsWith('img_')) throw new Error('素材无法读取，请重新选择本地文件')
    const response = await fetch(source)
    if (!response.ok) throw new Error('素材读取失败，请重新上传')
    const blob = await response.blob()
    const kind = blob.type.split('/')[0]
    const limit = { image: 10, audio: 20, video: 50 }[kind]
    if (!limit) throw new Error('仅支持图片、音频和视频素材')
    if (blob.size > limit * 1024 * 1024) throw new Error(`${kind} 素材不能超过 ${limit} MB`)
    const extension = blob.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'
    const file = new File([blob], `${canvasRequestId('media')}.${extension}`, { type: blob.type })
    pending = { name: file.name, size: file.size }
    this.uploads.set(value, pending)
    let asset
    try { asset = await StudioCanvases.upload(this.document.canvasId, file) }
    catch (error) { if (definitiveFailure(error)) this.uploads.delete(value); throw error }
    this.uploads.delete(value)
    this.media.set(value, asset)
    return asset
  }
  async prepare(snapshot) {
    const assetBindings = [], modelBindings = []
    const clean = async (value, node, path = '') => {
      if (['/id', '/type', '/settings/model'].includes(path)) return value
      const isBody = /\/(prompt|videoPrompt|text)$/.test(path) || (path === '/settings/content' && node.type === 'novel-input') || (path === '/content' && ['text-node', 'novel-input'].includes(node.type))
      if (isBody) return value
      if (mediaValue(value)) {
        const asset = await this.upload(value)
        assetBindings.push({ nodeId: node.id, fieldPath: path, assetId: asset.assetId })
        return null
      }
      if (Array.isArray(value)) { const result = []; for (let index = 0; index < value.length; index++) result.push(await clean(value[index], node, `${path}/${index}`)); return result }
      if (value && typeof value === 'object') {
        const result = {}
        for (const [key, item] of Object.entries(value)) {
          if (!secretKey.test(key)) result[key] = await clean(item, node, `${path}/${escapePointer(key)}`)
        }
        return result
      }
      return value
    }
    const nodes = []
    for (const node of snapshot.nodes) {
      if ((this.document.assetBindings || []).some((binding) => binding.nodeId === node.id && binding.shotId != null)) throw new Error('此版本包含镜头级素材绑定，首版编辑器暂不支持重新保存，请保留原版本')
      const cleaned = await clean(node, node)
      if (['gen-image', 'gen-video'].includes(node.type) && node.settings?.model) {
        const model = this.models.find((model) => `studio-${model.id}` === node.settings.model && model.type === (node.type === 'gen-image' ? 2 : 3))
        if (!model) throw new Error('请选择后端模型目录中的图片或视频模型')
        modelBindings.push({ nodeId: node.id, fieldPath: '/settings/model', modelId: model.id })
      }
      if (node.type === 'gen-image') cleaned.settings = { ...cleaned.settings, quality: cleaned.settings?.quality ?? 1 };
      if (node.type === 'gen-video' && typeof cleaned.settings?.resolution === 'string') cleaned.settings.resolution = cleaned.settings.resolution.toLowerCase();
      nodes.push(cleaned)
    }
    const project = { ...stripSecrets(this.document.project), version: '2.5.7', projectName: snapshot.projectName, nodes, connections: snapshot.connections, view: snapshot.view }
    for (const key of Object.keys(project)) if (secretKey.test(key)) delete project[key]
    const result = { schemaVersion: this.document.schemaVersion || 1, project, assetBindings, modelBindings }
    if (nodes.length > 1000 || snapshot.connections.length > 5000 || new Blob([JSON.stringify(result)]).size > 2 * 1024 * 1024) throw new Error('画布超过大小限制（1000 节点、5000 连线、2 MB）')
    return result
  }
  async save(snapshot) {
    if (this.saving) throw new Error('画布正在保存，请稍后重试')
    if (this.blocked) throw new Error('云端修订发生冲突，本地编辑已保留，请先处理冲突')
    this.saving = true
    try {
      const replay = this.pendingSave ? await this.sendSave() : null
      const prepared = await this.prepare(snapshot)
      if (replay && JSON.stringify(prepared.project) === JSON.stringify(replay.project) && JSON.stringify(prepared.assetBindings) === JSON.stringify(replay.assetBindings) && JSON.stringify(prepared.modelBindings) === JSON.stringify(replay.modelBindings)) return replay
      const pending = { ...prepared, canvasId: this.document.canvasId, expectedRevisionNo: this.revision, clientSaveId: canvasRequestId('save') }
      this.write('save', pending)
      this.pendingSave = pending
      return await this.sendSave()
    } finally { this.saving = false }
  }
  async sendSave() {
    try {
      const result = await StudioCanvases.save(this.pendingSave)
      this.revision = result.revisionNo
      this.document = result
      this.pendingSave = null
      this.write('save', null)
      if (result.currentRevisionNo > result.revisionNo) {
        this.blocked = true
        throw new Error('原保存请求已成功，但云端又有新版本，请处理修订冲突')
      }
      return result
    } catch (error) {
      if (definitiveFailure(error) && error.errorCode !== 'CANVAS_REVISION_CONFLICT') { this.write('save', null); this.pendingSave = null }
      if (error.errorCode === 'CANVAS_REVISION_CONFLICT') {
        this.blocked = true
        this.latest = await StudioCanvases.detail(this.document.canvasId).catch(() => null)
        throw new Error(`保存冲突：云端版本 ${this.latest?.currentRevisionNo ?? '已更新'}。本地编辑已保留，请导出后重新打开云端版本。`)
      }
      throw error
    }
  }
  async recover() {
    try { return await this.recoverSubmission() }
    catch (error) {
      if (definitiveFailure(error)) { this.write('generation', null); this.pendingGeneration = null }
      throw error
    }
  }
  async recoverSubmission() {
    const pending = this.pendingGeneration
    if (!pending) return null
    let result
    try { result = await StudioCanvases.submission(this.document.canvasId, pending.body.clientRequestId) }
    catch (error) {
      if (error.errorCode !== 'CANVAS_SUBMISSION_NOT_FOUND') throw error
      result = pending.kind === 'retry'
        ? await StudioCanvases.retry(pending.body.canvasId, pending.body.generationId, pending.body.clientRequestId)
        : await StudioCanvases.generate(pending.body)
    }
    this.write('generation', null)
    this.pendingGeneration = null
    return result
  }
  async submit(body, kind = 'create') {
    if (this.pendingGeneration) throw new Error('还有待确认的生成提交，请先点击找回提交')
    const pending = { kind, body }
    this.write('generation', pending)
    this.pendingGeneration = pending
    return this.recover()
  }
  async output(asset) {
    if (!asset.assetId) throw new Error('生成结果缺少 assetId，无法应用')
    const url = URL.createObjectURL(await StudioCanvases.content(this.document.canvasId, asset.assetId))
    this.urls.push(url)
    this.media.set(url, asset)
    return url
  }
  async draft(snapshot) {
    const media = []
    const copies = new Map()
    const visit = async (value) => {
      if (typeof value === 'string' && this.media.has(value)) { media.push([value, this.media.get(value)]); return value }
      if (typeof value === 'string' && value.startsWith('blob:')) {
        if (!copies.has(value)) {
          const response = await fetch(value)
          if (!response.ok) throw new Error('本地素材备份失败')
          const blob = await response.blob()
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob)
          })
          copies.set(value, data)
        }
        return copies.get(value)
      }
      if (Array.isArray(value)) { const result = []; for (const item of value) result.push(await visit(item)); return result }
      if (value && typeof value === 'object') { const result = {}; for (const [key, item] of Object.entries(value)) result[key] = await visit(item); return result }
      return value
    }
    return { snapshot: await visit(snapshot), media, baseRevisionNo: this.revision }
  }
  async restoreDraft(draft) {
    // A draft from another revision may be restored locally but must never overwrite cloud edits.
    if (draft.baseRevisionNo !== this.revision) this.blocked = true
    const replacements = new Map()
    for (const [source, asset] of draft.media || []) if (!replacements.has(source)) replacements.set(source, await this.output(asset))
    const visit = (value) => {
      if (typeof value === 'string') return replacements.get(value) || value
      if (Array.isArray(value)) return value.map(visit)
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]))
      return value
    }
    return visit(draft.snapshot || draft)
  }
  dispose() { this.urls.forEach(URL.revokeObjectURL) }
}
