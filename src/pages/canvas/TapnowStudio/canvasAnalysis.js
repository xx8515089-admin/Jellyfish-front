import { CanvasAnalysis } from '../../../services/studioCanvasAnalysis'
import { canvasRequestId } from '../../../services/studioCanvases'

export const analysisOperations = { framePromptGenerate: '关键帧反推', videoAnalyze: '视频导演拆解', transcribeAudio: '音轨转写' }
const videoTypes = ['video-input', 'gen-video', 'generate-character-video', 'generate-scene-video']
const audioTypes = ['input-audio', 'audio-input']
const clone = value => JSON.parse(JSON.stringify(value))

/** Load available operations independently so one failed catalog cannot disable the others. */
export async function loadAnalysisCatalogs(capabilities) {
  const operations = Object.keys(analysisOperations).filter(operation => capabilities.operationStatuses?.some(item => item.operation === operation && item.available === true))
  const results = await Promise.allSettled(operations.map(operation => CanvasAnalysis.models(operation)))
  const catalogs = {}, errors = {}
  results.forEach((result, index) => {
    const operation = operations[index]
    if (result.status === 'fulfilled') catalogs[operation] = result.value
    else errors[operation] = result.reason?.message || '模型目录加载失败，请刷新重试'
  })
  return { catalogs, errors }
}

/** Interpret persisted preview metadata instead of guessing the modality from a blob URL. */
export function analysisSourceKind(source) {
  if (source.type === 'input-image') return 'image'
  if (audioTypes.includes(source.type)) return 'audio'
  if (videoTypes.includes(source.type)) return 'video'
  if (source.type === 'preview') return source.previewType || source.mediaType || source.contentType
  return undefined
}

/** One default edge, including legacy edges whose inputType is omitted. */
export function analysisSource(project, nodeId) {
  const edges = project.connections.filter(edge => edge.to === nodeId)
  if (edges.length !== 1 || (edges[0].inputType && edges[0].inputType !== 'default')) throw new Error('分析节点必须只连接一个默认输入来源')
  const source = project.nodes.find(node => node.id === edges[0].from)
  if (!source) throw new Error('来源节点已删除')
  return source
}

/** Fill legacy frame metadata before saving; never trim existing identifiers. */
export function normalizeAnalysisFrames(project, nodeId) {
  const source = analysisSource(project, nodeId)
  if (source.type === 'input-image') return project
  return { ...project, nodes: project.nodes.map(node => node.id !== source.id ? node : { ...node, selectedKeyframes: (node.selectedKeyframes || []).map(frame => ({ ...frame, frameId: frame.frameId ?? canvasRequestId('frame'), timeSeconds: frame.timeSeconds ?? (frame.time === '' || frame.time == null ? null : Number(frame.time)) })) }) }
}

/** Build every selection from bindings in a saved revision, never from local URLs. */
export function analysisEstimate(document, nodeId, operation, capabilities, models) {
  const node = document.project.nodes.find(item => item.id === nodeId)
  if (node?.type !== 'video-analyze') throw new Error('请选择分析节点')
  const status = capabilities?.operationStatuses?.find(item => item.operation === operation)
  if (status?.available !== true) throw new Error(status?.reason || capabilities?.analysisUnavailableReason || '此分析操作暂不可用，请刷新能力')
  const source = analysisSource(document.project, nodeId)
  const binding = document.modelBindings.find(item => item.nodeId === nodeId && item.fieldPath === '/settings/analysisModelId')
  const model = models.find(item => item.modelId === binding?.modelId && item.available === true && (!item.supportedOperations || item.supportedOperations.includes(operation)))
  if (!model || !Number.isSafeInteger(binding?.modelId) || (node.settings?.analysisModelId != null && node.settings.analysisModelId !== binding.modelId) || (status.modelIds?.length && !status.modelIds.includes(binding.modelId))) throw new Error('请为当前操作选择可用分析模型并保存')
  const asset = path => {
    const matches = document.assetBindings.filter(item => item.nodeId === source.id && item.fieldPath === path)
    if (matches.length !== 1 || matches[0].assetId == null) throw new Error('来源素材尚未绑定到当前保存版本，请重新上传并保存')
    return matches[0].assetId
  }
  let selection, parameters
  if (operation === 'framePromptGenerate') {
    if (source.type !== 'input-image' && !videoTypes.includes(source.type) && source.type !== 'preview') throw new Error('关键帧反推需要图片或视频来源')
    const frames = source.type === 'input-image' ? [{ frameId: source.id, timeSeconds: 0, assetId: asset('/content') }] : (source.selectedKeyframes || []).map((frame, index) => ({ frameId: frame.frameId, timeSeconds: frame.timeSeconds, assetId: asset(`/selectedKeyframes/${index}/url`) }))
    const limit = Math.min(capabilities.limits?.maxFramesPerTask || 60, model.limits?.maxFramesPerTask || 60)
    if (!frames.length) throw new Error('请先选择并上传关键帧')
    if (frames.length > limit) throw new Error(`最多选择 ${limit} 个关键帧后保存`)
    if (frames.some(frame => typeof frame.frameId !== 'string' || frame.frameId.length === 0 || !Number.isFinite(frame.timeSeconds) || frame.timeSeconds < 0) || new Set(frames.map(frame => frame.frameId)).size !== frames.length) throw new Error('关键帧需要唯一 ID 和有效时间')
    const segmentDurationSeconds = Number(node.settings?.analysisSegmentSeconds ?? 4)
    if (!Number.isFinite(segmentDurationSeconds) || segmentDurationSeconds <= 0) throw new Error('分组秒数必须大于 0')
    selection = { frames }; parameters = { segmentDurationSeconds, promptLanguages: ['zh-CN', 'en'] }
  } else {
    const kind = analysisSourceKind(source), audio = kind === 'audio'
    if (!['audio', 'video'].includes(kind) || (operation === 'videoAnalyze' && audio)) throw new Error('当前操作的来源类型不匹配')
    if (operation === 'transcribeAudio' && model.supportsAudioTrack === false) throw new Error('当前模型不支持音轨输入，请重新选择模型')
    selection = audio ? { audioAssetId: asset('/content') } : { videoAssetId: asset('/content') }
    parameters = {}
    for (const [field, setting] of [['startSeconds', 'analysisStartSeconds'], ['endSeconds', 'analysisEndSeconds']]) {
      const value = node.settings?.[setting]
      if (value !== '' && value != null) { if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('裁剪时间必须是非负秒数'); parameters[field] = Number(value) }
    }
    if (parameters.endSeconds != null && parameters.endSeconds <= (parameters.startSeconds || 0)) throw new Error('结束时间必须晚于开始时间')
    const duration = source.videoMeta?.duration ?? source.durationSeconds ?? source.duration
    if (Number.isFinite(duration) && duration > 0) {
      const limit = Math.min(capabilities.limits?.maxVideoDurationSeconds || 300, model.limits?.maxVideoDurationSeconds || 300)
      if (duration > limit) throw new Error(`完整来源媒体不得超过 ${limit} 秒；裁剪不能绕过时长限制`)
      if ((parameters.startSeconds ?? 0) >= duration || (parameters.endSeconds ?? duration) > duration) throw new Error('裁剪时间超出来源媒体时长')
    }
  }
  return { canvasId: document.canvasId, revisionNo: document.revisionNo, nodeId, sourceNodeId: source.id, operation, modelId: binding.modelId, selection, parameters }
}

/** Persist the exact create/retry body before sending; ambiguous receipts never generate a new ID. */
export async function submitAnalysis(session, request, recover = false) {
  session.assertWritable()
  const key = 'analysis:submission'
  if (!recover && session.read(key)) throw new Error('请先找回上次分析提交')
  const pending = recover ? session.read(key) : clone(request)
  if (!pending) return null
  if (!recover) session.write(key, pending)
  // Only errors from admission may clear the request; lookup failures always retain it.
  const send = async () => {
    try { return await CanvasAnalysis[pending.kind](pending.body) }
    catch (error) {
      if (['INSUFFICIENT_CREDITS', 'CANVAS_QUOTE_EXPIRED', 'CANVAS_QUOTE_CHANGED', 'ANALYSIS_CONCURRENCY_LIMIT', 'ANALYSIS_RATE_LIMIT', 'MODEL_OPERATION_UNSUPPORTED', 'SOURCE_CONNECTION_CHANGED', 'FRAME_SELECTION_CHANGED'].includes(error.errorCode)) session.write(key, null)
      throw error
    }
  }
  let receipt
  if (recover) {
    try { receipt = await CanvasAnalysis.submission(pending.body.canvasId, pending.body.clientRequestId) }
    catch (error) { if (error.errorCode !== 'CANVAS_ANALYSIS_SUBMISSION_NOT_FOUND') throw error; receipt = await send() }
  } else receipt = await send()
  if (!receipt?.taskId || String(receipt.canvasId) !== String(pending.body.canvasId) || receipt.inputHash !== pending.inputHash || receipt.nodeId !== pending.estimate.nodeId || receipt.sourceNodeId !== pending.estimate.sourceNodeId || receipt.revisionNo !== pending.estimate.revisionNo || receipt.modelId !== pending.estimate.modelId || receipt.operation !== pending.estimate.operation) throw new Error('分析回执与原输入不一致，已保留提交记录')
  session.write('analysis:input:' + receipt.taskId, pending.estimate)
  session.write(key, null)
  return receipt
}

/** Compare complete involved nodes and bindings, so local edits cannot be overwritten by old results. */
export function analysisFingerprint(document, task) {
  return JSON.stringify({
    nodes: [task.nodeId, task.sourceNodeId].map(id => document.project.nodes.find(node => node.id === id)),
    connections: document.project.connections.filter(edge => edge.to === task.nodeId),
    assets: document.assetBindings.filter(binding => [task.nodeId, task.sourceNodeId].includes(binding.nodeId)),
    models: document.modelBindings.filter(binding => binding.nodeId === task.nodeId),
  })
}

/** Preserve native result fields, legacy storyboard aliases, and stable task/scene provenance. */
export function applyAnalysisResult(nodes, task) {
  if (task.status !== 3 || !task.result || !analysisOperations[task.operation] || (task.result.operation && task.result.operation !== task.operation)) throw new Error('结果尚未完成，不能应用')
  const result = task.result
  const target = nodes.find(node => node.id === task.nodeId)
  if (target?.type !== 'video-analyze') throw new Error('原分析节点已不存在')
  const prior = target.settings?.analysisProvenance || []
  if (prior.some(item => String(item.taskId) === String(task.taskId))) throw new Error('此任务结果已应用')
  let patch
  if (task.operation === 'transcribeAudio') {
    if (!Array.isArray(result.segments) || typeof result.fullText !== 'string' || result.segments.some(segment => !Number.isFinite(segment.startSeconds) || !Number.isFinite(segment.endSeconds) || segment.startSeconds < 0 || segment.endSeconds < segment.startSeconds || typeof segment.text !== 'string')) throw new Error('转写结果不完整，无法应用')
    patch = { voiceoverResults: result.segments.map(segment => ({ ...segment, time: `${segment.startSeconds}–${segment.endSeconds}`, taskId: task.taskId })) }
  } else {
    if (!Array.isArray(result.scenes) || !result.scenes.length || result.scenes.some(scene => !scene.sceneId || !Number.isFinite(scene.startSeconds) || !Number.isFinite(scene.endSeconds) || scene.startSeconds < 0 || scene.endSeconds < scene.startSeconds || typeof scene.prompts?.zh !== 'string' || typeof scene.prompts?.en !== 'string' || !Array.isArray(scene.keyframes) || scene.keyframes.some(frame => typeof frame.frameId !== 'string' || !frame.frameId.length || frame.assetId == null || !Number.isFinite(frame.timeSeconds) || frame.timeSeconds < 0))) throw new Error('场景结果不完整，无法应用')
    if (new Set(result.scenes.map(scene => scene.sceneId)).size !== result.scenes.length) throw new Error('场景标识重复，无法应用')
    patch = { analysisResults: result.scenes.map((scene, index) => ({ ...scene, taskId: task.taskId, scene_index: index + 1, time_range: `${scene.startSeconds}–${scene.endSeconds}`, global_tags: scene.tags, keyframes: scene.keyframes.map(frame => ({ ...frame, type: frame.role || 'current', time: frame.timeSeconds, jimeng_prompt: scene.prompts.zh, mj_prompt: scene.prompts.en })) })) }
  }
  return nodes.map(node => node.id !== task.nodeId ? node : { ...node, settings: { ...node.settings, ...patch, analysisResultData: result, analysisProvenance: [...prior, { taskId: task.taskId, sceneIds: (result.scenes || []).map(scene => scene.sceneId), inputHash: task.inputHash, revisionNo: task.revisionNo }] } })
}
