import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { applyTextResult, textInputFingerprint, textModelId, textOperations } from '../src/pages/canvas/TapnowStudio/canvasTextTasks.js'

const file = new URL('../src/pages/canvas/TapnowStudio/useCanvasTextTasks.jsx', import.meta.url)
const source = ts.createSourceFile('useCanvasTextTasks.jsx', readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
const initializers = new Map()
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) initializers.set(node.name.text, node.initializer.getText(source))
  ts.forEachChild(node, visit)
}
visit(source)
function expression(name, globals) {
  const code = ts.transpileModule(`var runHandler = ${initializers.get(name)};`, { fileName: 'handler.jsx', compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText
  const context = vm.createContext({ console, applyTextResult, textInputFingerprint, textModelId, textOperations, ...globals })
  vm.runInContext(code, context)
  return context.runHandler
}
const clone = value => JSON.parse(JSON.stringify(value))
const originalNode = () => ({ id: '角色 中文', type: 'character-description', settings: { textModelId: 9, prompt: '原始输入' } })
const originalProject = () => ({ nodes: [originalNode()], connections: [], view: { x: 0, y: 0, zoom: 1 } })
const originalTask = () => ({ taskId: 70, canvasId: 12, nodeId: '角色 中文', revisionNo: 8, modelId: 9, inputHash: 'input-hash', operation: 'promptEnhance', status: 3, billingState: 'pendingReview', actualCredits: null, result: { schemaVersion: 1, operation: 'promptEnhance', prompt: '增强结果' } })
function application(overrides = {}) {
  const snapshotRef = { current: originalProject() }
  const confirmations = [], saves = [], applied = []
  const current = originalTask()
  const context = {
    snapshotRef, run: fn => fn(), assertReady() {},
    session: { document: { canvasId: 12 }, models: [], read: () => null },
    StudioCanvases: { textDetail: async () => current, detail: async () => ({ canvasId: 12, revisionNo: 8, project: originalProject(), modelBindings: [{ nodeId: '角色 中文', fieldPath: '/settings/textModelId', modelId: 9 }] }) },
    confirm: async (title, text) => { confirmations.push({ title, text }); return true },
    setNodes: nodes => applied.push(nodes), save: async () => { saves.push(clone(snapshotRef.current)); return {} },
    ...overrides,
  }
  return { run: expression('apply', context), current, snapshotRef, confirmations, saves, applied, context }
}

test('a recovered cross-device text result can be applied while actual fees remain pending', async () => {
  const h = application()
  await h.run(originalTask())
  assert.equal(h.applied[0][0].settings.prompt, '增强结果')
  assert.equal(h.saves.length, 1)
  assert.equal(h.confirmations.length, 1)
})

test('edited input requires explicit confirmation and cancellation preserves new text', async () => {
  const questions = []
  const h = application({ confirm: async title => { questions.push(title); return false } })
  h.snapshotRef.current.nodes[0].settings.prompt = '用户的新编辑'
  await h.run(originalTask())
  assert.match(questions[0], /已修改/)
  assert.equal(h.snapshotRef.current.nodes[0].settings.prompt, '用户的新编辑')
  assert.equal(h.saves.length, 0)
})

test('edits arriving during the confirmation dialog are never overwritten', async () => {
  const snapshotRef = { current: originalProject() }
  const h = application({ snapshotRef, confirm: async () => { snapshotRef.current.nodes[0].settings.prompt = '确认期间编辑'; return true } })
  await assert.rejects(h.run(originalTask()), /发生变化/)
  assert.equal(h.applied.length, 0); assert.equal(h.saves.length, 0)
})

test('a task from another canvas or changed hash cannot be applied', async () => {
  const h = application()
  h.current.canvasId = 99
  await assert.rejects(h.run(originalTask()), /输入身份/)
  h.current.canvasId = 12; h.current.inputHash = 'different'
  await assert.rejects(h.run(originalTask()), /输入身份/)
  assert.equal(h.applied.length, 0)
})

test('unknown frozen model or removed node keeps the result in history only', async () => {
  const h = application()
  h.current.modelId = 99
  await assert.rejects(h.run(originalTask()), /模型/)
  h.current.modelId = 9; h.snapshotRef.current.nodes = []
  await assert.rejects(h.run(originalTask()), /已删除/)
})

test('insufficient text balance stops before confirmation or submit', async () => {
  let calls = 0
  const accept = expression('acceptQuote', { confirm: async () => { calls++; return true }, session: { document: { canvasId: 12 }, submitText: () => { calls++ } } })
  await assert.rejects(accept({ ...originalTask(), quoteId: 'q', reservedCredits: 4, sufficient: false, unlimited: false }), /积分不足/)
  assert.equal(calls, 0)
})

test('zero reservation is shown and submitted as zero rather than invented final cost', async () => {
  const bodies = []
  const accept = expression('acceptQuote', {
    React: { createElement: (...args) => args }, confirm: async () => true, canvasRequestId: () => 'stable-id',
    session: { document: { canvasId: 12 }, submitText: async body => { bodies.push(body); return originalTask() } }, put() {}, onOpen() {},
  })
  await accept({ ...originalTask(), quoteId: 'q', reservedCredits: 0, sufficient: true, unlimited: false })
  assert.equal(bodies[0].maxReservedCredits, 0)
  assert.equal(bodies[0].quoteId, 'q')
})

test('text polling follows shouldPoll even when numeric status looks active', () => {
  const active = { current: new Map() }
  const put = expression('put', { useCallback: fn => fn, mounted: { current: true }, active, setTasks() {} })
  put({ taskId: 70, status: 1, shouldPoll: false })
  assert.equal(active.current.size, 0)
  put({ taskId: 71, status: 3, shouldPoll: true })
  assert.equal(active.current.size, 1)
})

function loadActions(path) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, { exports, console, require: () => ({}), fetch: () => { throw new Error('Legacy supplier request must not run') } })
  return exports
}

test('all five P0 action buttons dispatch to cloud text execution, without legacy credentials', async () => {
  const actions = loadActions('../src/pages/canvas/TapnowStudio/actions/storyboardActions.js')
  const media = loadActions('../src/pages/canvas/TapnowStudio/actions/mediaActions.js')
  const calls = []
  const nodesMap = new Map([['角色 中文', originalNode()], ['分镜', { id: '分镜', type: 'storyboard-node', settings: { tableData: { headers: ['描述'], rows: [['画面']] } } }]])
  const context = { cloudDocument: {}, canvasCloud: { textExecute: (...args) => calls.push(args) }, nodesMap, normalizeStoryboardTableData: value => value, buildStoryboardTableSyncPatch: () => ({ shots: [{ id: 7, prompt: '画面' }] }) }
  await actions.runDescriptionPromptAction(context, '角色 中文', 'enhance')
  await actions.runDescriptionPromptAction(context, '角色 中文', 'filter')
  await actions.runStoryboardLlmSplit(context, '分镜')
  await actions.runStoryboardTablePromptMerge(context, '分镜')
  await media.handleExtractAnalysis(context, '小说')
  assert.deepEqual(calls.map(args => args[1]), ['promptEnhance', 'promptFilter', 'storyboardSplit', 'storyboardPromptMerge', 'extractCharactersScenes'])
  assert.equal(calls[3][2].shots[0].id, 7)
})

test('unopened multimodal and supplier identity operations cannot fall through to legacy providers', async () => {
  const media = loadActions('../src/pages/canvas/TapnowStudio/actions/mediaActions.js')
  const calls = []
  const context = { cloudDocument: {}, canvasCloud: { unsupported: name => calls.push(name) } }
  for (const name of ['createCharacter', 'handleExpandImageZoom', 'handleAutoVideoAnalysis', 'handleGeneratePrompts', 'handleExtractVoiceover']) await media[name](context, 'node')
  assert.equal(calls.length, 5)
})
