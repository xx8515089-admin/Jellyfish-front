export const textOperations = {
  promptEnhance: '增强提示词', promptFilter: '过滤提示词', extractCharactersScenes: '提取角色和场景',
  storyboardSplit: '拆分分镜', storyboardPromptMerge: '汇总分镜提示词',
}
const targets = {
  promptEnhance: ['character-description', 'scene-description'], promptFilter: ['character-description', 'scene-description'],
  extractCharactersScenes: ['novel-input', 'extract-characters-scenes'], storyboardSplit: ['storyboard-node'], storyboardPromptMerge: ['storyboard-node'],
}
export const textModelId = value => {
  const id = Number(String(value ?? '').replace(/^studio-/, ''))
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
export const supportsTextOperation = (model, operation) => {
  const operations = model.supportedOperations || model.operations || (model.operation ? [model.operation] : null)
  return model.available !== false && (!operation || !operations || operations.includes(operation))
}
const connectedText = (project, nodeId) => (project.connections || []).filter(c => c.to === nodeId).map(c => {
  const node = project.nodes.find(n => n.id === c.from)
  return node && ['novel-input', 'text-node'].includes(node.type) ? { id: node.id, text: (node.type === 'text-node' ? node.settings?.text : node.settings?.content) ?? node.content ?? '' } : null
}).filter(Boolean)

/** Only text inputs are included: media URLs never become multimodal text requests. */
export function textInputFingerprint(project, nodeId, operation) {
  const node = project.nodes.find(n => n.id === nodeId)
  if (!node) throw new Error('原节点已删除')
  const settings = node.settings || {}
  const modelId = textModelId(settings.textModelId ?? settings.chatModel)
  let input
  if (operation === 'promptEnhance' || operation === 'promptFilter') input = settings.prompt?.trim() ? settings.prompt : settings.description || ''
  else if (operation === 'storyboardPromptMerge') input = (settings.shots || []).map(s => ({ id: String(s.id), description: s.description || '', prompt: s.prompt || '', camera: s.camera || '', tags: s.tags || [] }))
  else input = { text: node.type === 'novel-input' ? settings.content || '' : settings.scriptText || '', connected: connectedText(project, nodeId) }
  return JSON.stringify({ nodeId, type: node.type, operation, modelId, input })
}

export function prepareTextSnapshot(snapshot, nodeId, operation, models, patch = {}) {
  const node = snapshot.nodes.find(n => n.id === nodeId)
  if (!node || !targets[operation]?.includes(node.type)) throw new Error('当前节点不支持此文本操作')
  const settings = { ...node.settings, ...patch }
  const modelId = textModelId(settings.textModelId ?? settings.chatModel)
  if (!modelId || !models.some(m => m.modelId === modelId && supportsTextOperation(m, operation))) throw new Error('请先选择支持此操作的云端文本模型')
  settings.textModelId = modelId
  if (operation === 'storyboardSplit' && !settings.scriptText?.trim() && settings.tableMarkdown) settings.scriptText = settings.tableMarkdown
  if (node.type === 'extract-characters-scenes' && !settings.scriptText?.trim() && settings.content) settings.scriptText = settings.content
  const nextNode = { ...node, settings }
  const next = { ...snapshot, nodes: snapshot.nodes.map(n => n.id === nodeId ? nextNode : n) }
  let input
  if (operation === 'promptEnhance' || operation === 'promptFilter') input = settings.prompt?.trim() ? settings.prompt : settings.description || ''
  else if (operation === 'storyboardPromptMerge') {
    const shots = settings.shots || []
    if (!shots.length || shots.length > 100) throw new Error('请先准备 1–100 个分镜')
    if (shots.some(s => s.id == null || String(s.id) === '') || new Set(shots.map(s => String(s.id))).size !== shots.length) throw new Error('镜头必须具有唯一且稳定的 ID')
    input = shots.map(s => [s.description, s.prompt, s.camera, ...(Array.isArray(s.tags) ? s.tags : [s.tags])].filter(Boolean).join('\n')).join('\n')
  } else input = [node.type === 'novel-input' ? settings.content : settings.scriptText, ...connectedText(next, nodeId).map(n => n.text)].filter(Boolean).join('\n\n')
  if (!String(input).trim()) throw new Error('请先填写文本或连接小说/文本节点')
  if (String(input).length > 60000) throw new Error('文本输入不能超过 60,000 字符，请手动缩减后重试')
  return { snapshot: next, modelId }
}

function resultTable(node, shots, replace) {
  const original = !replace && node.settings?.tableData
  const headers = original?.headers?.length ? [...original.headers] : ['场次镜号', '画面描述', '生图提示词', '时长']
  let promptColumn = headers.findIndex(header => /提示词|prompt/i.test(String(header)))
  if (promptColumn < 0) { promptColumn = headers.length; headers.push('生图提示词') }
  const rows = shots.map((shot, index) => {
    const row = original?.rows?.[index] ? headers.map((_, column) => String(original.rows[index][column] ?? '')) : [String(shot.scene_index || index + 1), shot.description || '', shot.prompt || '', String(shot.duration || '')]
    row[promptColumn] = shot.prompt || ''
    return row
  })
  const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
  const rowText = row => '| ' + row.map(cell).join(' | ') + ' |'
  return { tableData: { headers, rows }, tableMarkdown: [rowText(headers), rowText(headers.map(() => '---')), ...rows.map(rowText)].join('\n') }
}

export function applyTextResult(node, task, shotDefaults = {}) {
  const result = task.result
  if (!targets[task.operation]?.includes(node.type) || task.nodeId !== node.id || task.status !== 3 || !task.inputHash || result?.schemaVersion !== 1 || result.operation !== task.operation) throw new Error('文本结果与节点或操作不匹配')
  let patch
  if (['promptEnhance', 'promptFilter'].includes(task.operation)) {
    if (typeof result.prompt !== 'string' || !result.prompt.trim()) throw new Error('任务未返回有效提示词')
    patch = { prompt: result.prompt }
  } else if (task.operation === 'extractCharactersScenes') {
    if (!Array.isArray(result.characters) || !Array.isArray(result.scenes) || result.characters.length > 100 || result.scenes.length > 100) throw new Error('角色/场景结果格式不正确')
    patch = { analysisResults: { characters: result.characters, scenes: result.scenes }, isAnalyzing: false }
  } else if (task.operation === 'storyboardSplit') {
    if (!Array.isArray(result.shots) || !result.shots.length || result.shots.length > 100) throw new Error('分镜结果格式不正确')
    const ids = result.shots.map(s => s.id == null ? '' : String(s.id))
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('分镜结果缺少稳定的唯一 ID')
    patch = { shots: result.shots.map((s, index) => ({ ...shotDefaults, ...s, id: s.id, description: s.description || '', prompt: s.prompt || '', scene_index: index + 1, duration: s.durationSeconds != null ? `${s.durationSeconds}s` : s.duration ?? shotDefaults.duration, status: 'draft', outputEnabled: false, selectedImageIndex: -1 })), tableData: undefined, tableMarkdown: '', isGenerating: false }
  } else if (task.operation === 'storyboardPromptMerge') {
    const shots = node.settings?.shots || []
    const rows = result.shots
    if (!Array.isArray(rows) || rows.length !== shots.length || rows.some(r => r.rowId == null || typeof r.prompt !== 'string')) throw new Error('汇总结果缺少镜头')
    const byId = new Map(rows.map(r => [String(r.rowId), r.prompt]))
    if (byId.size !== shots.length || shots.some(s => !byId.has(String(s.id)))) throw new Error('汇总结果包含未知、重复或缺失的镜头 ID')
    patch = { shots: shots.map(s => ({ ...s, prompt: byId.get(String(s.id)) })), tableData: undefined, tableMarkdown: '', isGenerating: false }
  } else throw new Error('未知文本操作')
  if (patch.shots) Object.assign(patch, resultTable(node, patch.shots, task.operation === 'storyboardSplit'))
  return { ...node, settings: { ...node.settings, ...patch, errorMsg: '' } }
}
