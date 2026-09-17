import { StudioCanvases, canvasRequestId } from '../../../services/studioCanvases'
import { textModelId, textOperations, supportsTextOperation } from './canvasTextTasks'

export const executionStatus = { 1: '排队', 2: '执行中', 3: '已完成', 4: '失败', 5: '调用前取消', 6: '结果待核查' }
export const workflowStatus = { running: '运行中', waitingReview: '等待核查', cancelling: '取消中', succeeded: '已完成', failed: '失败', cancelled: '已取消', pending: '等待依赖', skipped: '已跳过' }
export const chatBlocked = messages => messages.some(message => [1, 2, 6].includes(message.status))
export const workflowPolling = workflow => ['running', 'cancelling'].includes(workflow.status)
export const credits = value => value == null ? '待核算' : String(value)
const copy = value => JSON.parse(JSON.stringify(value))

// Only definitive admission rejections can discard the original paid request.
const rejected = new Set(['CANVAS_QUOTE_EXPIRED', 'CANVAS_QUOTE_CHANGED', 'CHAT_VERSION_CONFLICT', 'CHAT_SESSION_BUSY', 'CHAT_HISTORY_LIMIT', 'EXECUTION_CONCURRENCY_LIMIT', 'WORKFLOW_CONCURRENCY_LIMIT', 'MEDIA_PROVIDER_NOT_CONFIGURED', 'WORKFLOW_MEDIA_PROVIDER_NOT_CONFIGURED', 'MODEL_OPERATION_UNSUPPORTED', 'INPUT_MODALITY_UNSUPPORTED'])
export async function submitCanvasV4(session, family, body, recover = false) {
  if (!['execution', 'workflow'].includes(family)) throw new Error('未知任务类型')
  session.assertWritable()
  const key = 'v4:' + family
  let pending = session.read(key)
  if (!recover) {
    if (pending) throw new Error('请先找回上次提交，避免重复预留积分')
    pending = copy(body)
    session.write(key, pending)
  }
  if (!pending) return null
  let receipt
  if (recover) {
    // Lookup errors, including permission failures, must preserve the request.
    try { receipt = await StudioCanvases[family + 'Submission'](pending.canvasId, pending.clientRequestId) }
    catch (error) {
      const missing = family === 'execution' ? ['CANVAS_EXECUTION_SUBMISSION_NOT_FOUND'] : ['WORKFLOW_SUBMISSION_NOT_FOUND', 'CANVAS_WORKFLOW_SUBMISSION_NOT_FOUND']
      if (!missing.includes(error.errorCode)) throw error
      // Explicit absence permits replay of exactly the persisted body and identity.
      try { receipt = await StudioCanvases[family + 'Create'](pending) }
      catch (reason) { if (rejected.has(reason.errorCode)) session.write(key, null); throw reason }
    }
    if (!receipt) throw new Error('尚未找到回执，请稍后再次查询；原提交标识已保留')
  } else {
    try { receipt = await StudioCanvases[family + 'Create'](pending) }
    catch (error) { if (rejected.has(error.errorCode)) session.write(key, null); throw error }
  }
  if (!receipt || String(receipt.canvasId) !== String(pending.canvasId) || receipt[family === 'execution' ? 'taskId' : 'workflowId'] == null) throw new Error('回执与原画布不一致，提交记录已保留')
  session.write(key, null)
  return receipt
}

/** Validate frozen quote identity and preserve unknown fees instead of coercing them to zero. */
export function quoteBudget(quote, canvasId, revisionNo) {
  if (!quote?.quoteId || String(quote.canvasId) !== String(canvasId) || quote.revisionNo !== revisionNo) throw new Error('报价与保存版本不一致')
  if (!Number.isFinite(quote.reservedCredits) || quote.reservedCredits < 0) throw new Error('报价缺少有效的预留积分，请刷新后重试')
  if (quote.sufficient === false && !quote.unlimited) throw new Error('积分不足')
  if (quote.expiresAt && (!Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now())) throw new Error('报价已过期，请重新报价')
  return quote.reservedCredits
}

/** Convert owned assets into server references after checking chat-specific media bounds. */
export function validateChat(prompt, model, assets, canvasId) {
  if (!prompt.trim() || prompt.length > 60000) throw new Error('请输入 1–60,000 字符的消息')
  if (model?.available !== true) throw new Error('请选择当前可用的聊天模型')
  if (assets.length > 8) throw new Error('每条消息最多 8 份附件')
  let bytes = 0
  const references = assets.map(asset => {
    if (asset.assetId == null || String(asset.canvasId) !== String(canvasId) || asset.removed) throw new Error('附件必须是当前画布的真实素材')
    const role = asset.mimeType?.split('/')[0]
    if (!['image', 'audio', 'video'].includes(role) || !model.inputModalities?.includes(role)) throw new Error('所选模型未声明支持此附件类型，请刷新模型目录')
    if (role === 'image' && !['image/png', 'image/jpeg'].includes(asset.mimeType)) throw new Error('图片附件仅支持 PNG/JPEG')
    if (!Number.isFinite(asset.sizeBytes) || asset.sizeBytes <= 0 || asset.sizeBytes > (role === 'image' ? 10 : 50) * 1024 * 1024) throw new Error('附件大小无效或超限：图片 10MiB，音视频 50MiB')
    if (role !== 'image' && asset.durationSeconds != null && (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0 || asset.durationSeconds > 300)) throw new Error('音视频附件不得超过 300 秒')
    bytes += asset.sizeBytes
    return { assetId: asset.assetId, sourceNodeId: 'sidebar', fieldPath: '/content', role }
  })
  if (bytes > 50 * 1024 * 1024) throw new Error('附件合计不得超过 50MiB')
  return references
}

export const nodeOperations = node => ({
  'character-description': ['promptEnhance', 'promptFilter'], 'scene-description': ['promptEnhance', 'promptFilter'],
  'novel-input': ['extractCharactersScenes'], 'extract-characters-scenes': ['extractCharactersScenes'],
  'storyboard-node': ['storyboardSplit', 'storyboardPromptMerge'],
}[node.type] || [])

/** Traverse the saved dependency graph and require an explicit operation for every executable ancestor. */
export function workflowPlan(document, targets, choices, capabilities, models, failurePolicy) {
  if (!targets.length || targets.length > 50) throw new Error('请选择 1–50 个目标节点')
  const nodes = new Map(document.project.nodes.map(node => [node.id, node]))
  const visiting = new Set(), visited = new Set(), steps = []
  const walk = id => {
    if (visiting.has(id)) throw new Error('依赖图包含循环，请先修复连线')
    if (visited.has(id)) return
    const node = nodes.get(id)
    if (!node) throw new Error('目标或依赖节点已删除')
    visiting.add(id)
    document.project.connections.filter(connection => connection.to === id).forEach(connection => walk(connection.from))
    const supported = nodeOperations(node)
    const passive = ['text-node', 'input-image', 'video-input', 'audio-input', 'group', 'character-library', 'scene-library', 'prop-library'].includes(node.type)
    if (!supported.length && !passive) throw new Error(`节点 ${node.title || id} 尚不能作为当前工作流步骤，请使用独立任务或批次`)
    if (supported.length || targets.includes(id)) {
      const operation = choices[id]
      if (!textOperations[operation] || !supported.includes(operation) || !capabilities.operations?.includes(operation)) throw new Error(`请为节点 ${node.title || id} 选择已开放的操作`)
      const binding = document.modelBindings.find(binding => binding.nodeId === id && ['/settings/textModelId', '/settings/chatModel'].includes(binding.fieldPath))
      const modelId = textModelId(binding?.modelId)
      if (!models.some(model => model.modelId === modelId && model.available === true && supportsTextOperation(model, operation))) throw new Error(`请先为节点 ${node.title || id} 绑定可用文本模型并保存`)
      steps.push({ nodeId: id, operation, modelId })
    }
    visiting.delete(id); visited.add(id)
  }
  targets.forEach(walk)
  if (!steps.length || steps.length > 50) throw new Error('工作流必须包含 1–50 个步骤')
  return { canvasId: document.canvasId, revisionNo: document.revisionNo, targetNodeIds: targets, steps, failurePolicy }
}

export const createV4Body = (canvasId, quoteId, maxReservedCredits, family) => ({ canvasId, quoteId, maxReservedCredits, clientRequestId: canvasRequestId(family) })
