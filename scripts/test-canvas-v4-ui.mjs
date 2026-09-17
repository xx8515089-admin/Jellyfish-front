import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as textTasks from '../src/pages/canvas/TapnowStudio/canvasTextTasks.js'

/** Test the actual async UI handlers with controlled server responses and confirmation races. */
function handler(file, name, globals) {
  const source = ts.createSourceFile(file, readFileSync(new URL('../src/pages/canvas/TapnowStudio/components/' + file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
  let expression
  const walk = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.getText(source)
    ts.forEachChild(node, walk)
  }
  walk(source)
  assert.ok(expression, name)
  const code = ts.transpileModule(`var invoke = ${expression}`, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText
  const context = vm.createContext({ console, ...textTasks, React: { createElement: (...args) => args }, ...globals })
  vm.runInContext(code, context)
  return context.invoke
}
function logic() {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../src/pages/canvas/TapnowStudio/canvasExecution.js', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, { exports, require: name => name.endsWith('canvasTextTasks') ? textTasks : { canvasRequestId: kind => kind + '-123' } })
  return exports
}
const current = { canvasId: 12, sessionId: 31, version: 0, archived: false }
const quote = { canvasId: 12, revisionNo: 8, quoteId: 'q', nodeId: 'sidebar:31', operation: 'chat', modelId: 201, reservedCredits: 3 }
function chat(overrides = {}) {
  const calls = [], messages = []
  const ctx = {
    ...logic(), run: fn => fn(), assertReady() {}, ready: true, pending: null, prompt: '你好', queuedFiles: [], attachments: [],
    canvasId: 12, modelId: 201, model: { modelId: 201, available: true }, current, session: {},
    listSessions: async () => [{ ...current, version: 7 }],
    StudioCanvases: { chatMessages: async () => [], executionEstimate: async body => { calls.push(['estimate', body]); return quote } },
    setMessages: value => messages.push(value), save: async () => ({ canvasId: 12, revisionNo: 8 }),
    confirm: async () => true, submitCanvasV4: async (...args) => calls.push(['submit', ...args]),
    setPrompt: value => calls.push(['prompt', value]), setSelected() {}, refresh: async () => calls.push(['refresh']), loadCatalog: async () => calls.push(['catalog']),
    ...overrides,
  }
  return { send: handler('CanvasCloudChat.jsx', 'send', ctx), calls, messages, ctx }
}
test('send quotes latest session version and saved revision, confirms reservation then submits', async () => {
  const h = chat()
  await h.send()
  const request = h.calls.find(call => call[0] === 'estimate')[1]
  assert.equal(request.expectedSessionVersion, 7); assert.equal(request.revisionNo, 8)
  assert.equal(request.nodeId, 'sidebar:31'); assert.equal(request.parameters.prompt, '你好')
  const submitted = h.calls.find(call => call[0] === 'submit')
  assert.equal(submitted[2], 'execution'); assert.equal(submitted[3].quoteId, 'q'); assert.equal(submitted[3].maxReservedCredits, 3)
})
test('busy or unknown chat history stops before quote and purchase', async () => {
  for (const status of [1, 2, 6]) {
    const h = chat({ StudioCanvases: { chatMessages: async () => [{ taskId: 71, status }], executionEstimate: () => { throw new Error('must not quote') } } })
    await assert.rejects(h.send(), /原任务/)
    assert.equal(h.calls.length, 0)
  }
})
test('archived sessions, pending receipts, history limits and unavailable capability stop sending', async () => {
  for (const patch of [{ pending: {} }, { ready: false }, { listSessions: async () => [{ ...current, archived: true }] }, { listSessions: async () => [{ ...current, version: 30 }] }]) {
    const h = chat(patch)
    await assert.rejects(h.send())
    assert.equal(h.calls.filter(call => ['estimate', 'submit'].includes(call[0])).length, 0)
  }
})
test('cancelled quote confirmation keeps composer and does not submit', async () => {
  const h = chat({ confirm: async () => false })
  await h.send()
  assert.equal(h.calls.filter(call => call[0] === 'submit' || call[0] === 'prompt').length, 0)
})
test('version conflict refreshes messages without silent requote or resubmit', async () => {
  const h = chat({ submitCanvasV4: async () => { throw Object.assign(new Error('conflict'), { errorCode: 'CHAT_VERSION_CONFLICT' }) } })
  await assert.rejects(h.send(), /conflict/)
  assert.equal(h.calls.filter(call => call[0] === 'estimate').length, 1)
  assert.equal(h.calls.filter(call => call[0] === 'refresh').length, 1)
  assert.equal(h.calls.filter(call => call[0] === 'prompt').length, 0)
})
test('a mismatched quote cannot be sent even if it has a valid quote ID', async () => {
  const h = chat({ StudioCanvases: { chatMessages: async () => [], executionEstimate: async () => ({ ...quote, nodeId: 'another' }) } })
  await assert.rejects(h.send(), /不一致/)
  assert.equal(h.calls.length, 0)
})

function workflow(overrides = {}) {
  const snapshotRef = { current: { nodes: [{ id: '角色', type: 'character-description', settings: { prompt: '原文' } }], connections: [] } }
  const saves = []
  const context = {
    snapshotRef, preview: { workflow: { workflowId: 8, revisionNo: 3 }, task: { taskId: 71, nodeId: '角色', operation: 'promptEnhance', status: 3, inputHash: 'hash', result: { schemaVersion: 1, operation: 'promptEnhance', prompt: '增强后' } } },
    run: fn => fn(), assertReady() {}, confirm: async () => true, setNodes() {}, save: async () => saves.push(JSON.stringify(snapshotRef.current)), setPreview() {},
    ...overrides,
  }
  return { apply: handler('CanvasWorkflowPanel.jsx', 'apply', context), context, snapshotRef, saves }
}
test('workflow result only applies after explicit confirmation and saves a new document', async () => {
  const h = workflow()
  await h.apply()
  assert.equal(h.snapshotRef.current.nodes[0].settings.prompt, '增强后'); assert.equal(h.saves.length, 1)
  const denied = workflow({ confirm: async () => false })
  await denied.apply()
  assert.equal(denied.snapshotRef.current.nodes[0].settings.prompt, '原文'); assert.equal(denied.saves.length, 0)
})
test('workflow result application preserves edits made while confirmation is open', async () => {
  const h = workflow()
  h.context.confirm = async () => { h.snapshotRef.current.nodes[0].settings.prompt = '新编辑'; return true }
  const apply = handler('CanvasWorkflowPanel.jsx', 'apply', h.context)
  await assert.rejects(apply(), /节点已变化/)
  assert.equal(h.snapshotRef.current.nodes[0].settings.prompt, '新编辑'); assert.equal(h.saves.length, 0)
})
