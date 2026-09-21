import { StudioCanvases, canvasRequestId } from '../../../services/studioCanvases'
import { applyTextResult, textModelId, textOperations, supportsTextOperation } from './canvasTextTasks'

export const executionStatus = { 1: '排队', 2: '执行中', 3: '已完成', 4: '失败', 5: '调用前取消', 6: '结果待核查' }
export const workflowStatus = { running: '运行中', waitingReview: '等待核查', cancelling: '取消中', succeeded: '已完成', failed: '失败', cancelled: '已取消', pending: '等待依赖', skipped: '已跳过' }
export const chatBlocked = messages => messages.some(message => [1, 2, 6].includes(message.status))
export const workflowPolling = workflow => workflow.shouldPoll ?? ['running', 'cancelling'].includes(workflow.status)
export const credits = value => value == null ? '待核算' : String(value)
const copy = value => JSON.parse(JSON.stringify(value))

// Only definitive admission rejections can discard the original paid request.
const rejected = error => error?.submissionState === 'notAccepted'
async function performsubmitCanvasV4(session, family, body, recover = false) {
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
      if (error.submissionState !== 'notFound') throw error
      // Explicit absence permits replay of exactly the persisted body and identity.
      try { receipt = await StudioCanvases[family + 'Create'](pending) }
      catch (reason) { if (rejected(reason)) session.write(key, null); throw reason }
    }
    if (!receipt) throw new Error('尚未找到回执，请稍后再次查询；原提交标识已保留')
  } else {
    try { receipt = await StudioCanvases[family + 'Create'](pending) }
    catch (error) { if (rejected(error)) session.write(key, null); throw error }
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
  'video-analyze': ['framePromptGenerate', 'videoAnalyze', 'transcribeAudio'],
  'character-description': ['promptEnhance', 'promptFilter'], 'scene-description': ['promptEnhance', 'promptFilter'],
  'novel-input': ['extractCharactersScenes'], 'extract-characters-scenes': ['extractCharactersScenes'],
  'storyboard-node': ['storyboardSplit', 'storyboardPromptMerge'],
}[node.type] || [])

const savedTextTypes = ['text-node', 'novel-input', 'character-description', 'scene-description']
const textOutputOperations = ['promptEnhance', 'promptFilter', 'transcribeAudio']
const shotOutputOperations = ['storyboardSplit', 'storyboardPromptMerge']

/** Validate actual output types: saved prose and executed structured results are distinct inputs. */
export function validateWorkflowInputs(document, steps) {
  const byId = new Map(steps.map(step => [step.nodeId, step]))
  for (const step of steps.filter(item => textOperations[item.operation])) {
    const edges = document.project.connections.filter(edge => edge.to === step.nodeId)
    if (edges.some(edge => edge.inputType != null && edge.inputType !== 'default')) throw new Error('文字步骤只支持 default 默认端口，请修改连线')
    if (step.operation === 'storyboardPromptMerge' && edges.length > 1) throw new Error('分镜汇总只能连接一个分镜来源')
    for (const edge of edges) {
      const source = document.project.nodes.find(node => node.id === edge.from)
      const operation = byId.get(edge.from)?.operation
      const valid = step.operation === 'storyboardPromptMerge'
        ? source?.type === 'storyboard-node' && shotOutputOperations.includes(operation)
        : operation ? textOutputOperations.includes(operation) : savedTextTypes.includes(source?.type)
      if (!valid) throw new Error('上游输出不支持此操作，请先将分析场景、角色/场景或镜头数组转换为所需输入；分镜汇总需连接执行拆分或汇总的分镜节点')
    }
  }
}

/** Only explicitly selected operations execute; unselected prose nodes supply their saved text. */
export function workflowPlan(document, targets, choices, capabilities, models, failurePolicy, analysis) {
  if (!targets.length || targets.length > 50) throw new Error('请选择 1–50 个目标节点')
  const nodes = new Map(document.project.nodes.map(node => [node.id, node]))
  const visiting = new Set(), visited = new Set(), steps = []
  const walk = id => {
    if (visiting.has(id)) throw new Error('依赖图包含循环，请先修复连线')
    if (visited.has(id)) return
    const node = nodes.get(id)
    if (!node) throw new Error('目标或依赖节点已删除')
    if (!choices[id] && !targets.includes(id) && savedTextTypes.includes(node.type)) { visited.add(id); return }
    visiting.add(id)
    document.project.connections.filter(connection => connection.to === id).forEach(connection => walk(connection.from))
    const supported = nodeOperations(node)
    const passive = ['text-node', 'input-image', 'video-input', 'audio-input', 'input-audio', 'preview', 'group', 'character-library', 'scene-library', 'prop-library'].includes(node.type)
    if (!supported.length && !passive) throw new Error(`节点 ${node.title || id} 尚不能作为当前工作流步骤，请使用独立任务或批次`)
    if (supported.length || targets.includes(id)) {
      const operation = choices[id]
      if (node.type === 'video-analyze') {
        if (!supported.includes(operation) || !capabilities.operations?.includes(operation) || !analysis) throw new Error('请为分析节点选择已开放的工作流操作')
        const template = analysis.build(document, id, operation, analysis.capabilities, analysis.catalogs[operation] || [])
        steps.push({ nodeId: id, operation, modelId: template.modelId, analysis: template })
        visiting.delete(id); visited.add(id); return
      }
      if (!textOperations[operation] || !supported.includes(operation) || !capabilities.operations?.includes(operation)) throw new Error(`请为节点 ${node.title || id} 选择已开放的操作`)
      const binding = document.modelBindings.find(binding => binding.nodeId === id && ['/settings/textModelId', '/settings/chatModel'].includes(binding.fieldPath))
      const modelId = textModelId(binding?.modelId)
      const selectedModel = node.settings?.textModelId ?? node.settings?.chatModel
      if (selectedModel != null && textModelId(selectedModel) !== modelId) throw new Error('文字模型与保存版本不一致，请重新选择模型并保存')
      if (!models.some(model => model.modelId === modelId && model.available === true && supportsTextOperation(model, operation))) throw new Error(`请先为节点 ${node.title || id} 绑定可用文本模型并保存`)
      steps.push({ nodeId: id, operation, modelId })
    }
    visiting.delete(id); visited.add(id)
  }
  targets.forEach(walk)
  if (!steps.length || steps.length > 50) throw new Error('工作流必须包含 1–50 个步骤')
  validateWorkflowInputs(document, steps)
  return { canvasId: document.canvasId, revisionNo: document.revisionNo, targetNodeIds: targets, steps, failurePolicy }
}

export const createV4Body = (canvasId, quoteId, maxReservedCredits, family) => ({ canvasId, quoteId, ...(maxReservedCredits === undefined ? {} : { maxReservedCredits }), clientRequestId: canvasRequestId(family) })

/** Rebuild the immutable run's shot chain, never match merge rows against the target's old shots. */
export async function applyWorkflowTextResult(node, task, document, workflow, loadTask) {
  if (String(document.canvasId) !== String(workflow.canvasId) || document.revisionNo !== workflow.revisionNo) throw new Error('工作流保存版本不一致')
  if (node.id !== task.nodeId || node.type !== document.project.nodes.find(item => item.id === task.nodeId)?.type) throw new Error('目标节点类型已变化，请重新查看结果')
  const cache = new Map(), visiting = new Set()
  const resolve = async (nodeId, supplied) => {
    if (visiting.has(nodeId)) throw new Error('工作流分镜依赖包含循环')
    if (cache.has(nodeId)) return cache.get(nodeId)
    const run = workflow.nodes.find(item => item.nodeId === nodeId)
    const saved = document.project.nodes.find(item => item.id === nodeId)
    if (!run || !saved || run.taskFamily !== 'text' || run.taskId == null) throw new Error('缺少本次工作流的文字任务')
    const current = supplied || await loadTask(workflow.canvasId, run.taskId)
    if (String(current.canvasId) !== String(workflow.canvasId) || current.revisionNo !== workflow.revisionNo || current.nodeId !== nodeId || String(current.taskId) !== String(run.taskId) || current.operation !== run.operation) throw new Error('子任务与工作流保存版本不一致')
    visiting.add(nodeId)
    let base = saved
    if (current.operation === 'storyboardPromptMerge') {
      const edges = document.project.connections.filter(edge => edge.to === nodeId)
      if (edges.length > 1) throw new Error('分镜汇总只能连接一个分镜来源')
      if (edges.length) {
        const upstream = workflow.nodes.find(item => item.nodeId === edges[0].from)
        if (!shotOutputOperations.includes(upstream?.operation)) throw new Error('缺少本次上游分镜结果')
        base = { ...saved, settings: { ...saved.settings, ...(await resolve(edges[0].from)).settings } }
      }
    }
    const result = applyTextResult(base, current)
    visiting.delete(nodeId); cache.set(nodeId, result)
    return result
  }
  const resolved = await resolve(task.nodeId, task)
  // Only task-owned fields change; retain current target settings such as model selection.
  if (task.operation === 'storyboardPromptMerge') return { ...node, settings: { ...node.settings, shots: resolved.settings.shots, tableData: resolved.settings.tableData, tableMarkdown: resolved.settings.tableMarkdown, isGenerating: false, errorMsg: '' } }
  return applyTextResult(node, task)
}

export function submitCanvasV4(session, family, body, recover = false) {
  const work = () => performsubmitCanvasV4(session, family, body, recover)
  return session.exclusive ? session.exclusive('v4:' + family, work) : work()
}
