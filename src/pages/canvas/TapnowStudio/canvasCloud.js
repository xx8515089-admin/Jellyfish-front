import { withCanvasOperationLock } from './canvasOperationLock'
import { StudioCanvases, canvasRequestId, hydrateCanvasDocument } from '../../../services/studioCanvases'
import { getStoredAuthUser } from '../../../auth'

export const mediaOperation = type => ['gen-image', 'generate-character-image', 'generate-scene-image'].includes(type) ? 'imageGenerate' : ['gen-video', 'generate-character-video', 'generate-scene-video'].includes(type) ? 'videoGenerate' : null
const backendModelId = value => Number(String(value ?? '').replace(/^studio-/, ''))
const mediaValue = (value) => typeof value === 'string' && /^(blob:|data:|file:|https?:\/\/|img_)/i.test(value)
const secretKey = /^(api[-_]?key|authorization|headers|requestTemplate|requestOverrides|provider|providers|apiConfigs|token|accessToken|baseUrl|endpoint|key)$/i
const stripSecrets = (value) => {
  if (Array.isArray(value)) return value.map(stripSecrets)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !secretKey.test(key)).map(([key, item]) => [key, stripSecrets(item)]))
  return value
}
const definitiveFailure = error => error?.submissionState === 'notAccepted'
const pointerParts = (path) => path.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
export const readPointer = (node, path) => pointerParts(path).reduce((value, part) => value?.[part], node)
export const bindingTarget = (node, shotId) => shotId == null ? node : node?.settings?.shots?.find(shot => String(shot.id) === String(shotId))
export const shouldPollTask = task => task.status !== 6 && (task.shouldPoll ?? [1, 2].includes(task.status))
export const taskAction = (task, action) => task.actions ? !!task.actions[action] : ({ cancel: [1, 2].includes(task.status), retry: [4, 5].includes(task.status) && task.billingState === 'released', syncResult: task.canSync, retrySettlement: false })[action]
const escapePointer = (key) => String(key).replace(/~/g, '~0').replace(/\//g, '~1')

export function canvasModelConfigs(models) {
  return models.map((model) => ({
    id: `studio-${model.id}`, _uid: `studio-${model.id}`, backendModelId: model.id,
    supportedNodeTypes: model.supportedNodeTypes,
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
  constructor(document, models, resolveMedia, options = {}) {
    this.textModels = options.textModels || []
    this.capabilities = options.capabilities || {}
    this.document = document
    this.models = models
    this.resolveMedia = resolveMedia
    this.media = new Map()
    this.uploads = new Map()
    this.urls = []
    this.revision = document.revisionNo
    this.blocked = document.currentRevisionNo > document.revisionNo
    const user = getStoredAuthUser()
    this.userScope = String(user?.id ?? user?.username ?? 'anonymous')
    this.deletedKey = `canvas-deleted:${user?.id ?? user?.username ?? 'anonymous'}:${document.canvasId}`
    this.prefix = `canvas-cloud:${user?.id ?? user?.username ?? 'anonymous'}:${document.canvasId}:`
    this.pendingSave = this.read('save')
    this.pendingGeneration = this.read('generation')
    this.pendingBatch = this.read('batch')
    this.pendingText = this.read('text')
    this.pendingLibraryReview = this.read('libraryReview')
    this.pendingLibraryPublish = this.read('libraryPublish')
    for (const binding of document.assetBindings || []) {
      const node = document.project.nodes.find((node) => node.id === binding.nodeId)
      const value = readPointer(bindingTarget(node, binding.shotId), binding.fieldPath)
      if (value) this.media.set(value, { assetId: binding.assetId, canvasId: document.canvasId, ...(binding.sourceLinkId != null ? { sourceLinkId: binding.sourceLinkId } : {}) })
    }
  }
  async retryNodeAssets(node) {
    this.assertAccount()
    const markers = new Set()
    const collect = value => {
      if (typeof value === 'string' && value.startsWith('canvas-asset:')) markers.add(value)
      else if (Array.isArray(value)) value.forEach(collect)
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => { if (!key.startsWith('_canvas')) collect(item) })
    }
    collect(node)
    const replacements = new Map()
    let failure
    for (const marker of markers) {
      try {
        const [, canvasId, assetId, sourceLinkId] = marker.split(':')
        if (String(this.document.canvasId) !== canvasId) continue
        const blob = await StudioCanvases.content(canvasId, assetId)
        this.assertAccount()
        const url = URL.createObjectURL(blob)
        this.urls.push(url)
        this.media.set(url, { canvasId, assetId, ...(sourceLinkId ? { sourceLinkId } : {}) })
        replacements.set(marker, url)
      } catch (error) { failure = error }
    }
    return { replacements, failure }
  }
  exclusive(family, work) { return withCanvasOperationLock(this.prefix + family, () => { this.assertWritable(); return work() }) }
  archiveRequest(key, error) {
    const request = this.read(key); if (!request) return
    const id = request.clientRequestId || request.clientSaveId || request.body?.clientRequestId
    if (id) this.write('request-history:' + key + ':' + id, { request, errorCode: error?.errorCode, submissionState: error?.submissionState, closedAt: Date.now() })
  }
  submit(...args) { return this.exclusive("generation", () => this._submit(...args)) }
  recover(...args) { return this.exclusive("generation", () => this._recover(...args)) }
  submitBatch(...args) { return this.exclusive("batch", () => this._submitBatch(...args)) }
  recoverBatch(...args) { return this.exclusive("batch", () => this._recoverBatch(...args)) }
  submitText(...args) { return this.exclusive("text", () => this._submitText(...args)) }
  recoverText(...args) { return this.exclusive("text", () => this._recoverText(...args)) }
  save(...args) { return this.exclusive("save", () => this._save(...args)) }
  attachLibrary(...args) { return this.exclusive("attach", () => this._attachLibrary(...args)) }
  uploadV2(...args) { return this.exclusive("upload", () => this._uploadV2(...args)) }
  async projectOperation(kind, body) {
    return this.exclusive('project:' + kind, async () => {
      const key = 'project:' + kind
      let pending = this.read(key)
      if (!pending) { pending = { ...body, clientRequestId: canvasRequestId(kind) }; this.write(key, pending) }
      let result
      try {
      if (kind === 'copy') result = await StudioCanvases.copy(pending.canvasId, pending.sourceRevisionNo, pending.name, pending.clientRequestId)
      else if (kind === 'restore') result = await StudioCanvases.restore(pending.canvasId, pending.expectedRevisionNo, pending.sourceRevisionNo, pending.clientRequestId)
      else throw new Error('未知工程操作')
      } catch (error) {
        if (definitiveFailure(error)) { this.archiveRequest(key); this.write(key, null) }
        throw error
      }
      this.archiveRequest(key); this.write(key, null)
      return result
    })
  }
  adopt(document) {
    this.document = document
    this.revision = document.revisionNo
    this.blocked = document.currentRevisionNo > document.revisionNo
    this.pendingSave = null
    for (const binding of document.assetBindings || []) {
      const node = document.project.nodes.find((node) => node.id === binding.nodeId)
      const value = readPointer(bindingTarget(node, binding.shotId), binding.fieldPath)
      if (value) this.media.set(value, { assetId: binding.assetId, canvasId: document.canvasId, ...(binding.sourceLinkId != null ? { sourceLinkId: binding.sourceLinkId } : {}) })
    }
    try { this.write('save', null); this.write('draft', null) } catch { this.storageWarning = '云端已载入，但浏览器草稿未能清理' }
  }
  isDeleted() { return this.document.deleted === true || !!window.localStorage.getItem(this.deletedKey) }
  assertAccount() {
    const user = getStoredAuthUser()
    if (String(user?.id ?? user?.username ?? 'anonymous') !== this.userScope) throw new Error('登录账户已变化，请使用原账户恢复请求；记录已保留')
  }
  assertMediaWritable() { this.assertWritable(); if (this.capabilities.mediaWriteReady === false) throw new Error('媒体写入暂不可用，可继续编辑文字和查看历史素材') }
  assertWritable() { this.assertAccount(); if (this.isDeleted()) throw new Error('此画布已删除，已停止本地缓存和云端同步') }
  read(key) {
    this.assertAccount()
    try { return JSON.parse(window.localStorage.getItem(this.prefix + key) || 'null') } catch { throw new Error('画布请求记录无法读取，请检查浏览器存储') }
  }
  write(key, value) {
    this.assertAccount()
    if (value != null && !key.startsWith("request-history:") && this.isDeleted()) this.assertWritable()
    // Keep unresolved requests even if a late receipt reports a deleted canvas.
    // Persist before sending: a failed write must prevent a billable submission.
    if (value == null) {
      if (['generation', 'batch', 'text', 'save', 'libraryReview', 'libraryPublish', 'analysis:submission', 'v4:execution', 'v4:workflow'].includes(key)) this.archiveRequest(key)
      window.localStorage.removeItem(this.prefix + key)
    }
    else window.localStorage.setItem(this.prefix + key, JSON.stringify(value))
  }
  async _attachLibrary(item) {
    this.assertWritable()
    const key = `library:${item.assetType}:${item.id}`
    let body = this.read(key)
    const fresh = !body
    if (!body) {
      body = { canvasId: this.document.canvasId, assetType: item.assetType, libraryItemId: item.id, mediaSelection: 'cover', clientRequestId: canvasRequestId('library') }
      this.write(key, body)
    }
    let receipt
    try { receipt = fresh ? await StudioCanvases.attachLibrary(body) : await StudioCanvases.assetSubmission(body.canvasId, body.clientRequestId) }
    catch (error) {
      if (fresh || error.submissionState !== 'notFound') throw error
      receipt = await StudioCanvases.attachLibrary(body)
    }
    const asset = { ...receipt.asset, sourceLinkId: receipt.source?.sourceLinkId }
    const url = await this.output(asset)
    this.write(key, null)
    return { url, asset, source: receipt.source }
  }
  async _uploadV2(value) {
    this.assertMediaWritable()
    const source = await this.resolveMedia(value)
    const response = await fetch(source)
    if (!response.ok) throw new Error('素材读取失败，请重新选择文件')
    const blob = await response.blob()
    const limit = { image: 10, audio: 50, video: 50 }[blob.type.split('/')[0]]
    if (!limit || blob.size > limit * 1024 * 1024) throw new Error('素材格式不支持或超过上传大小限制')
    // Content fingerprint keeps the request identity stable after draft Blob URLs change.
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let a = 2166136261, b = 5381
    for (const byte of bytes) { a = Math.imul(a ^ byte, 16777619); b = Math.imul(b, 33) ^ byte }
    const key = `upload:${blob.type}:${blob.size}:${a >>> 0}:${b >>> 0}`
    let pending = this.read(key)
    const fresh = !pending
    if (!pending) {
      const id = canvasRequestId('upload')
      pending = { clientRequestId: id, name: `${id}.${blob.type.split('/')[1].replace(/[^a-z0-9]/gi, '')}` }
      this.write(key, pending)
    }
    let asset
    try { asset = fresh ? await StudioCanvases.upload(this.document.canvasId, new File([blob], pending.name, { type: blob.type }), pending.clientRequestId) : (await StudioCanvases.assetSubmission(this.document.canvasId, pending.clientRequestId)).asset }
    catch (error) {
      if (fresh || error.submissionState !== 'notFound') throw error
      asset = await StudioCanvases.upload(this.document.canvasId, new File([blob], pending.name, { type: blob.type }), pending.clientRequestId)
    }
    this.media.set(value, asset)
    return asset
  }
  async upload(value) {
    if (this.media.has(value)) return this.media.get(value)
    this.assertMediaWritable()
    if (StudioCanvases.assetSubmission) return this.uploadV2(value)
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
    const limit = { image: 10, audio: 50, video: 50 }[kind]
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
  historicalModel(nodeId, shotId, fieldPath, modelId, operation) {
    const prior = this.document.modelBindings?.find(binding => binding.nodeId === nodeId && String(binding.shotId ?? '') === String(shotId ?? '') && binding.fieldPath === fieldPath && binding.modelId === modelId && (!binding.operation || !operation || binding.operation === operation))
    return prior ? { id: prior.modelId } : null
  }
  assertGenerationModel(body) {
    const binding = this.document.modelBindings.find(item => item.nodeId === body.nodeId && String(item.shotId ?? '') === String(body.shotId ?? '') && (!item.operation || item.operation === body.operation))
    const model = this.models.find(item => item.id === binding?.modelId && item.type === (body.operation === 'imageGenerate' ? 2 : 3) && item.available !== false)
    if (!model) throw new Error('原模型已不可用，请选择当前可用模型并保存后再生成；旧任务仍可按允许动作补拉')
  }
  async prepare(snapshot) {
    const assetBindings = [], modelBindings = []
    const clean = async (value, node, path = '', shotId = undefined) => {
      if (['/id', '/type', '/settings/model', '/settings/textModelId', '/settings/analysisModelId', '/settings/chatModel', '/model', '/imageModel', '/videoModel'].includes(path)) return value
      const isBody = ['/settings/analysisResults', '/settings/voiceoverResults', '/settings/analysisResultData', '/settings/analysisProvenance', '/settings/tableData'].includes(path) || /\/(id|frameId|sceneId|nodeId|taskId)$/.test(path) || /\/(prompt|prompts|videoPrompt|text|description|tags|camera|scriptText|tableMarkdown)$/.test(path) || (path === '/settings/content' && node.type === 'novel-input') || (path === '/content' && ['text-node', 'novel-input'].includes(node.type))
      if (isBody) {
        if (['/settings/analysisResults', '/settings/analysisResultData'].includes(path)) {
          const stripPreview = item => Array.isArray(item) ? item.map(stripPreview) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).filter(([key]) => !(item.assetId != null && key === 'url') && !key.startsWith('_canvas')).map(([key, child]) => [key, stripPreview(child)])) : item
          return stripPreview(value)
        }
        return value
      }
      if (mediaValue(value) || this.media.has(value)) {
        const asset = await this.upload(value)
        assetBindings.push({ nodeId: node.id, fieldPath: path, assetId: asset.assetId, ...(shotId != null ? { shotId } : {}), ...(asset.sourceLinkId != null ? { sourceLinkId: asset.sourceLinkId } : {}) })
        return null
      }
      if (Array.isArray(value)) { const result = []; for (let index = 0; index < value.length; index++) result.push(await clean(value[index], node, `${path}/${index}`, shotId)); return result }
      if (value && typeof value === 'object') {
        const result = {}
        for (const [key, item] of Object.entries(value)) {
          if (node.type === 'storyboard-node' && path === '/settings' && key === 'shots' && Array.isArray(item)) {
            result[key] = []
            for (const shot of item) {
              if (shot.id == null || String(shot.id) === '') throw new Error('镜头缺少稳定 ID，不能按数组下标保存')
              result[key].push(await clean(shot, node, '', String(shot.id)))
            }
          } else if (!key.startsWith('_canvas') && !secretKey.test(key)) result[key] = await clean(item, node, `${path}/${escapePointer(key)}`, shotId)
        }
        return result
      }
      return value
    }
    const nodes = []
    for (const node of snapshot.nodes) {
      const cleaned = await clean(node, node)
      if (mediaOperation(node.type) && node.settings?.model) {
        const model = this.models.find((model) => model.id === backendModelId(node.settings.model) && model.type === (mediaOperation(node.type) === 'imageGenerate' ? 2 : 3)) || this.historicalModel(node.id, null, '/settings/model', backendModelId(node.settings.model), mediaOperation(node.type))
        if (!model) throw new Error('请选择后端模型目录中的图片或视频模型')
        if (model.supportedNodeTypes?.length && !model.supportedNodeTypes.includes(node.type)) throw new Error('所选模型不支持此节点类型')
        modelBindings.push({ nodeId: node.id, fieldPath: '/settings/model', modelId: model.id })
      }
      if (node.type === 'video-analyze' && node.settings?.analysisModelId != null) {
        const modelId = Number(node.settings.analysisModelId)
        if (!Number.isSafeInteger(modelId) || modelId <= 0) throw new Error('请选择分析目录中的模型')
        cleaned.settings.analysisModelId = modelId
        modelBindings.push({ nodeId: node.id, fieldPath: '/settings/analysisModelId', modelId })
      }
      for (const field of ['textModelId', 'chatModel']) {
        if (!['character-description', 'scene-description', 'novel-input', 'extract-characters-scenes', 'storyboard-node'].includes(node.type) || !node.settings?.[field]) continue
        const modelId = backendModelId(node.settings[field])
        if (field === 'chatModel' && node.settings.textModelId) continue
        if (!this.textModels.some(model => model.modelId === modelId && model.available !== false) && !this.historicalModel(node.id, null, '/settings/' + field, modelId)) throw new Error('请选择后端目录中的可用文本模型')
        cleaned.settings[field] = modelId
        modelBindings.push({ nodeId: node.id, fieldPath: '/settings/' + field, modelId })
      }
      if (node.type === 'storyboard-node') {
        for (const shot of node.settings?.shots || []) {
          const fields = shot.imageModel || shot.videoModel
            ? [['imageModel', 'imageGenerate'], ['videoModel', 'videoGenerate']]
            : [['model', (node.settings.mode || 'image') === 'video' ? 'videoGenerate' : 'imageGenerate']]
          for (const [field, operation] of fields) {
            if (!shot[field]) continue
            const model = this.models.find(model => `studio-${model.id}` === shot[field] && model.type === (operation === 'imageGenerate' ? 2 : 3)) || this.historicalModel(node.id, shot.id, '/' + field, backendModelId(shot[field]), operation)
            if (!model) throw new Error(`镜头 ${shot.id} 请选择可用的画布模型`)
            modelBindings.push({ nodeId: node.id, shotId: String(shot.id), fieldPath: `/${field}`, operation, modelId: model.id })
          }
        }
      }
      if (mediaOperation(node.type) === 'imageGenerate') cleaned.settings = { ...cleaned.settings, quality: cleaned.settings?.quality ?? 1 };
      if (mediaOperation(node.type) === 'videoGenerate' && typeof cleaned.settings?.resolution === 'string') cleaned.settings.resolution = cleaned.settings.resolution.toLowerCase();
      nodes.push(cleaned)
    }
    const project = { ...stripSecrets(this.document.project), version: '2.5.7', projectName: snapshot.projectName, nodes, connections: snapshot.connections, view: snapshot.view }
    for (const key of Object.keys(project)) if (secretKey.test(key)) delete project[key]
    const result = { schemaVersion: this.document.schemaVersion || 1, project, assetBindings, modelBindings }
    if (nodes.length > 1000 || snapshot.connections.length > 5000 || new Blob([JSON.stringify(result)]).size > 2 * 1024 * 1024) throw new Error('画布超过大小限制（1000 节点、5000 连线、2 MB）')
    return result
  }
  async _save(snapshot) {
    this.assertWritable()
    if (this.saving) throw new Error('画布正在保存，请稍后重试')
    if (this.blocked) throw new Error('云端修订发生冲突，本地编辑已保留，请先处理冲突')
    this.pendingSave = this.read('save')
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
    this.assertWritable()
    try {
      const result = await StudioCanvases.save(this.pendingSave)
      this.assertAccount()
      this.revision = result.revisionNo
      this.document = result
      this.pendingSave = null
      try { this.write('save', null) } catch { this.storageWarning = '云端已保存，但浏览器请求记录未能清理' }
      if (result.deleted) { this.blocked = true; throw new Error('原保存已确认，但画布已删除；本地编辑和其他待确认请求已保留') }
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
        throw new Error(`保存冲突：云端版本 ${this.latest?.currentRevisionNo ?? '已更新'}。本地编辑已保留，请保留本地快照或读取云端版本，无需刷新页面。`)
      }
      throw error
    }
  }
  async _recover() {
    try { return await this.recoverSubmission() }
    catch (error) {
      if (definitiveFailure(error)) { this.write('generation', null); this.pendingGeneration = null }
      throw error
    }
  }
  async recoverSubmission() {
    this.assertWritable()
    const pending = this.pendingGeneration = this.read('generation')
    if (!pending) return null
    let result
    try { result = await StudioCanvases.submission(this.document.canvasId, pending.body.clientRequestId) }
    catch (error) {
      if (error.submissionState !== 'notFound') throw error
      result = pending.kind === 'retry'
        ? await StudioCanvases.retry(pending.body.canvasId, pending.body.generationId, pending.body.clientRequestId)
        : await StudioCanvases.generate(pending.body)
    }
    this.write('generation', null)
    this.pendingGeneration = null
    return result
  }
  async _submit(body, kind = 'create') {
    this.assertMediaWritable()
    this.pendingGeneration = this.read('generation')
    if (this.pendingBatch) throw new Error('存在待确认的批次，请先找回批次')
    if (this.pendingGeneration) throw new Error('还有待确认的生成提交，请先点击找回提交')
    const pending = { kind, body }
    this.write('generation', pending)
    this.pendingGeneration = pending
    try {
      const result = kind === 'retry' ? await StudioCanvases.retry(body.canvasId, body.generationId, body.clientRequestId) : await StudioCanvases.generate(body)
      this.write('generation', null); this.pendingGeneration = null
      return result
    } catch (error) {
      if (definitiveFailure(error)) { this.write('generation', null); this.pendingGeneration = null }
      throw error
    }
  }
  async _submitBatch(body, kind = 'create') {
    this.assertMediaWritable()
    this.pendingBatch = this.read('batch')
    if (this.pendingGeneration) throw new Error('存在待确认的生成提交，请先找回提交')
    if (this.pendingBatch) throw new Error('存在待确认批次，请先找回批次')
    this.write('batch', { body, kind })
    this.pendingBatch = { body, kind }
    try {
      const result = kind === 'retry' ? await StudioCanvases.batchRetry(body) : await StudioCanvases.batchCreate(body)
      this.write('batch', null); this.pendingBatch = null
      return result
    } catch (error) {
      if (definitiveFailure(error)) { this.write('batch', null); this.pendingBatch = null }
      throw error
    }
  }
  async _recoverBatch() {
    this.assertWritable()
    this.pendingBatch = this.read('batch')
    if (!this.pendingBatch) return null
    const { body, kind } = this.pendingBatch
    let result
    try {
      try { result = await StudioCanvases.batchSubmission(body.canvasId, body.clientRequestId) }
      catch (error) {
        if (error.submissionState !== 'notFound') throw error
        result = kind === 'retry' ? await StudioCanvases.batchRetry(body) : await StudioCanvases.batchCreate(body)
      }
    } catch (error) {
      if (definitiveFailure(error)) { this.write('batch', null); this.pendingBatch = null }
      throw error
    }
    this.write('batch', null); this.pendingBatch = null
    return result
  }
  async _submitText(body, quote, kind = 'create') {
    this.pendingText = this.read('text')
    this.assertWritable()
    if (this.pendingText) throw new Error('还有待确认的文本提交，请先找回任务')
    const pending = { body: { ...body }, quote: { ...quote }, kind }
    this.write('text', pending)
    this.pendingText = pending
    return this.sendText(false)
  }
  async _recoverText() { return this.sendText(true) }
  async sendText(recover) {
    this.assertWritable()
    const pending = this.pendingText = this.read('text')
    if (!pending) return null
    const { body, kind, quote } = pending
    try {
      let task
      if (recover) {
        try { task = await StudioCanvases.textSubmission(body.canvasId, body.clientRequestId) }
        catch (error) {
          if (error.submissionState !== 'notFound') throw error
        }
      }
      if (!task) {
        try { task = kind === 'retry' ? await StudioCanvases.textRetry(body) : await StudioCanvases.textCreate(body) }
        catch (error) { if (definitiveFailure(error)) { this.write('text', null); this.pendingText = null }; throw error }
      }
      if (String(task.canvasId) !== String(body.canvasId) || task.nodeId !== quote.nodeId || task.revisionNo !== quote.revisionNo || task.operation !== quote.operation || task.modelId !== quote.modelId || task.inputHash !== quote.inputHash) throw new Error('返回的文本任务与原报价不一致，已保留提交记录')
      this.write('text-proof:' + task.taskId, quote)
      this.write('text', null); this.pendingText = null
      return task
    } catch (error) {
      throw error
    }
  }
  reviewLibrary(...args) { return this.exclusive('libraryReview', () => this._reviewLibrary(...args)) }
  publishLibrary(...args) { return this.exclusive('libraryPublish', () => this._publishLibrary(...args)) }
  recoverLibraryPublish() { return this.exclusive('libraryPublish', () => { this.pendingLibraryPublish = this.read('libraryPublish'); return this.sendLibraryPublish(true) }) }
  async _reviewLibrary(canvasAssetId, restart = false) {
    this.pendingLibraryReview = this.read('libraryReview')
    this.assertWritable()
    if (!this.pendingLibraryReview || restart) {
      if (restart && this.pendingLibraryReview && (!this.pendingLibraryReview.receipt || Number(this.pendingLibraryReview.receipt.status) <= 1)) throw new Error('请先找回上次初筛回执')
      const body = { canvasId: this.document.canvasId, canvasAssetId, clientRequestId: canvasRequestId('library-review') }
      this.write('libraryReview', { body })
      this.pendingLibraryReview = { body }
      try {
        const receipt = await StudioCanvases.reviewLibrary(body)
        this.pendingLibraryReview = { body, receipt }; this.write('libraryReview', this.pendingLibraryReview)
        return receipt
      } catch (error) {
        if (definitiveFailure(error)) { this.write('libraryReview', null); this.pendingLibraryReview = null }
        throw error
      }
    }
    if (String(this.pendingLibraryReview.body.canvasAssetId) !== String(canvasAssetId)) throw new Error('请先处理上次选图的初筛回执')
    const { body } = this.pendingLibraryReview
    let receipt
    try { receipt = await StudioCanvases.reviewLibrarySubmission(body.canvasId, body.clientRequestId) }
    catch (error) {
      if (error.submissionState !== 'notFound') throw error
      receipt = await StudioCanvases.reviewLibrary(body)
    }
    this.pendingLibraryReview = { body, receipt }; this.write('libraryReview', this.pendingLibraryReview)
    return receipt
  }
  async _publishLibrary(body) {
    this.pendingLibraryPublish = this.read('libraryPublish')
    this.pendingLibraryReview = this.read('libraryReview')
    this.assertWritable()
    if (this.pendingLibraryPublish) return this.sendLibraryPublish(true)
    const review = this.pendingLibraryReview?.receipt
    if (!review?.canPublish || String(review.reviewId) !== String(body.reviewId) || String(this.pendingLibraryReview.body.canvasAssetId) !== String(body.canvasAssetId)) throw new Error('所选图片尚未通过初筛')
    const pending = { ...body }
    this.write('libraryPublish', pending); this.pendingLibraryPublish = pending
    return this.sendLibraryPublish(false)
  }
  async sendLibraryPublish(recover) {
    this.assertWritable()
    const body = this.pendingLibraryPublish
    if (!body) return null
    try {
      let result
      if (recover) {
        try {
          const receipt = await StudioCanvases.assetSubmission(body.canvasId, body.clientRequestId)
          if (!receipt.source?.libraryItemId) throw new Error('入库回执尚未返回库条目标识，请稍后找回')
          result = { ...receipt.source, canvasAssetId: receipt.asset?.assetId || body.canvasAssetId }
        } catch (error) { if (error.submissionState !== 'notFound') throw error }
      }
      if (!result) {
        try { result = await StudioCanvases.publishLibrary(body) }
        catch (error) { if (definitiveFailure(error)) { this.write('libraryPublish', null); this.pendingLibraryPublish = null }; throw error }
      }
      if (!result.libraryItemId || !result.sourceLinkId) throw new Error('入库回执缺少条目标识，已保留提交记录')
      this.write('libraryPublish', null); this.pendingLibraryPublish = null
      this.write('libraryReview', null); this.pendingLibraryReview = null
      return result
    } catch (error) {
      throw error
    }
  }
  async hydrate(document) {
    if (String(document.canvasId) !== String(this.document.canvasId)) throw new Error('文档不属于当前画布')
    const hydrated = await hydrateCanvasDocument(document, this.urls)
    for (const binding of hydrated.assetBindings || []) {
      const node = hydrated.project.nodes.find(item => item.id === binding.nodeId)
      const value = readPointer(bindingTarget(node, binding.shotId), binding.fieldPath)
      if (value) this.media.set(value, { canvasId: hydrated.canvasId, assetId: binding.assetId, ...(binding.sourceLinkId != null ? { sourceLinkId: binding.sourceLinkId } : {}) })
    }
    return hydrated
  }
  async output(asset) {
    if (asset.canvasId != null && String(asset.canvasId) !== String(this.document.canvasId)) throw new Error('素材不属于当前画布，请先关联素材')
    if (!asset.assetId) throw new Error('生成结果缺少 assetId，无法应用')
    if (asset.availability === 'missing') throw new Error('此素材已缺失，原引用已保留；请选择其他可用素材')
    const url = URL.createObjectURL(await StudioCanvases.content(this.document.canvasId, asset.assetId))
    this.urls.push(url)
    this.media.set(url, asset)
    return url
  }
  async draft(snapshot) {
    this.assertWritable()
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
