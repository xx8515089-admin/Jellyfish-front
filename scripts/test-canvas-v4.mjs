import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as textTasks from '../src/pages/canvas/TapnowStudio/canvasTextTasks.js'

/** Execute the production modules with an in-memory transport/storage boundary. */
function load(path, imports) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText
  vm.runInNewContext(code, { exports, console, require(name) { assert.ok(name in imports, name); return imports[name] } })
  return exports
}
const plain = value => JSON.parse(JSON.stringify(value))
function harness(api = {}, storage = new Map()) {
  const logic = load('../src/pages/canvas/TapnowStudio/canvasExecution.js', {
    '../../../services/studioCanvases': { StudioCanvases: api, canvasRequestId: kind => kind + '-stable-id' },
    './canvasTextTasks': textTasks,
  })
  const session = { assertWritable() {}, read: key => JSON.parse(storage.get(key) || 'null'), write: (key, value) => value == null ? storage.delete(key) : storage.set(key, JSON.stringify(value)) }
  return { ...logic, session, storage }
}
const body = { canvasId: 12, quoteId: 'quote-1', clientRequestId: 'chat-message-1', maxReservedCredits: 20 }
const receipt = { canvasId: 12, taskId: 71, generationTaskId: 901, sessionId: 31, status: 1, shouldPoll: true }
const failure = errorCode => Object.assign(new Error(errorCode), { errorCode })

for (const family of ['execution', 'workflow']) {
  test(`${family}: timeout survives reload and recovers without duplicate purchase`, async () => {
    let creates = 0
    const saved = { ...receipt, ...(family === 'workflow' ? { workflowId: 8 } : {}) }
    const first = harness({ [family + 'Create']: async () => { creates++; throw new TypeError('offline') } })
    await assert.rejects(first.submitCanvasV4(first.session, family, body), /offline/)
    const next = harness({ [family + 'Submission']: async (id, key) => { assert.equal(id, 12); assert.equal(key, body.clientRequestId); return saved } }, first.storage)
    assert.equal((await next.submitCanvasV4(next.session, family, null, true)).canvasId, 12)
    assert.equal(creates, 1); assert.equal(next.session.read('v4:' + family), null)
  })
  test(`${family}: confirmed missing receipt replays the original body`, async () => {
    const attempts = []
    const h = harness({
      [family + 'Create']: async payload => { attempts.push(plain(payload)); if (attempts.length === 1) throw new TypeError('offline'); return { ...receipt, workflowId: 8 } },
      [family + 'Submission']: async () => { throw failure(family === 'execution' ? 'CANVAS_EXECUTION_SUBMISSION_NOT_FOUND' : 'WORKFLOW_SUBMISSION_NOT_FOUND') },
    })
    const original = { ...body }
    await assert.rejects(h.submitCanvasV4(h.session, family, original))
    original.quoteId = 'changed'
    await h.submitCanvasV4(h.session, family, null, true)
    assert.deepEqual(attempts, [body, body])
  })
}

test('storage failure prevents all paid submissions', async () => {
  let calls = 0
  const h = harness({ executionCreate: async () => { calls++; return receipt } })
  h.session.write = () => { throw new Error('storage full') }
  await assert.rejects(h.submitCanvasV4(h.session, 'execution', body), /storage full/)
  assert.equal(calls, 0)
})

test('unknown outcome, idempotency conflict and authorization lookup errors keep original identity', async () => {
  for (const code of ['PROVIDER_RESULT_UNKNOWN', 'IDEMPOTENCY_CONFLICT']) {
    const h = harness({ executionCreate: async () => { throw failure(code) }, executionSubmission: async () => { throw Object.assign(new Error('forbidden'), { status: 403 }) } })
    await assert.rejects(h.submitCanvasV4(h.session, 'execution', body))
    await assert.rejects(h.submitCanvasV4(h.session, 'execution', null, true), /forbidden/)
    assert.deepEqual(plain(h.session.read('v4:execution')), body)
    await assert.rejects(h.submitCanvasV4(h.session, 'execution', { ...body, clientRequestId: 'new' }), /找回/)
  }
})

test('admission rejection clears pending and allows explicit requote, malformed receipt does not', async () => {
  const h = harness({ executionCreate: async () => { throw failure('CHAT_VERSION_CONFLICT') } })
  await assert.rejects(h.submitCanvasV4(h.session, 'execution', body))
  assert.equal(h.session.read('v4:execution'), null)
  for (const bad of [{}, { ...receipt, canvasId: 88 }, { canvasId: 12, generationTaskId: 99 }]) {
    const other = harness({ executionCreate: async () => bad })
    await assert.rejects(other.submitCanvasV4(other.session, 'execution', body), /回执/)
    assert.ok(other.session.read('v4:execution'))
  }
})

const model = { modelId: 201, available: true, inputModalities: ['image', 'video', 'audio'] }
const asset = { canvasId: 12, assetId: 100, mimeType: 'image/png', sizeBytes: 1024 }
test('chat references contain owned IDs and explicit roles, never raw media or secrets', () => {
  const h = harness()
  assert.deepEqual(plain(h.validateChat('消息', model, [{ ...asset, url: 'https://remote', content: 'base64', key: 'secret' }], 12)), [{ assetId: 100, sourceNodeId: 'sidebar', fieldPath: '/content', role: 'image' }])
  assert.throws(() => h.validateChat('消息', model, [{ ...asset, canvasId: 13 }], 12), /当前画布/)
  assert.throws(() => h.validateChat('消息', { ...model, inputModalities: [] }, [asset], 12), /未声明/)
  assert.throws(() => h.validateChat('消息', { ...model, available: false }, [], 12), /可用/)
})
test('chat enforces prompt, count, format, byte and duration limits without truncation', () => {
  const h = harness()
  for (const prompt of ['', ' ', '字'.repeat(60001)]) assert.throws(() => h.validateChat(prompt, model, [], 12), /字符/)
  assert.throws(() => h.validateChat('消息', model, Array(9).fill(asset), 12), /8/)
  assert.throws(() => h.validateChat('消息', model, [{ ...asset, mimeType: 'image/webp' }], 12), /PNG/)
  assert.throws(() => h.validateChat('消息', model, [{ ...asset, sizeBytes: 10 * 1024 * 1024 + 1 }], 12), /超限/)
  assert.throws(() => h.validateChat('消息', model, [{ ...asset, mimeType: 'video/mp4', durationSeconds: 301 }], 12), /300/)
  assert.throws(() => h.validateChat('消息', model, Array(6).fill({ ...asset, sizeBytes: 10 * 1024 * 1024 }), 12), /合计/)
  assert.equal(h.chatBlocked([{ status: 6 }]), true)
  assert.equal(h.chatBlocked([{ status: 4 }, { status: 5 }, { status: 3 }]), false)
  assert.equal(h.credits(null), '待核算'); assert.equal(h.credits(0), '0')
})
test('quotes preserve zero-cost reservations and reject missing, expired, insufficient or mismatched quotes', () => {
  const h = harness(), quote = { canvasId: 12, revisionNo: 8, quoteId: 'q', reservedCredits: 0 }
  assert.equal(h.quoteBudget(quote, 12, 8), 0)
  for (const patch of [{ reservedCredits: null }, { revisionNo: 9 }, { sufficient: false }, { expiresAt: '2000-01-01' }]) assert.throws(() => h.quoteBudget({ ...quote, ...patch }, 12, 8))
})

function document() {
  return { canvasId: 12, revisionNo: 8, project: {
    nodes: [{ id: '输入', type: 'text-node' }, { id: '角色', type: 'character-description' }, { id: '场景', type: 'scene-description' }],
    connections: [{ from: '输入', to: '角色' }, { from: '角色', to: '场景' }],
  }, modelBindings: ['角色', '场景'].map(nodeId => ({ nodeId, fieldPath: '/settings/textModelId', modelId: 201 })) }
}
const caps = { operations: ['promptEnhance', 'promptFilter'] }
const choices = { '角色': 'promptEnhance', '场景': 'promptFilter' }
test('workflow uses saved dependencies and explicitly includes executable ancestors in order', () => {
  const h = harness()
  const plan = h.workflowPlan(document(), ['场景'], choices, caps, [model], 'continueIndependent')
  assert.deepEqual(plain(plan.steps), [{ nodeId: '角色', operation: 'promptEnhance', modelId: 201 }, { nodeId: '场景', operation: 'promptFilter', modelId: 201 }])
  assert.equal(plan.revisionNo, 8); assert.equal(plan.failurePolicy, 'continueIndependent')
})
test('workflow rejects cycles, omitted operations, unavailable models and media ancestors', () => {
  const h = harness(), create = doc => h.workflowPlan(doc, ['场景'], choices, caps, [model], 'stop')
  const cycle = document(); cycle.project.connections.push({ from: '场景', to: '角色' })
  assert.throws(() => create(cycle), /循环/)
  assert.throws(() => h.workflowPlan(document(), ['场景'], { 场景: 'promptFilter' }, caps, [model], 'stop'), /选择/)
  assert.throws(() => h.workflowPlan(document(), ['场景'], choices, caps, [{ ...model, available: false }], 'stop'), /模型/)
  const media = document(); media.project.nodes[0].type = 'gen-image'
  assert.throws(() => create(media), /独立任务/)
  assert.throws(() => h.workflowPlan(document(), ['场景'], choices, { operations: [] }, [model], 'stop'), /选择/)
  assert.equal(h.workflowPolling({ status: 'waitingReview' }), false)
  assert.equal(h.workflowPolling({ status: 'running' }), true)
})
test('V4 API wrappers use business IDs, envelope errors and original create bodies', async () => {
  const calls = []
  const { StudioCanvases } = load('../src/services/studioCanvases.ts', {
    './generated': { OpenAPI: {} }, './generated/core/request': { request: async (_, options) => { calls.push(plain(options)); return { code: 200, data: receipt } } },
  })
  await StudioCanvases.executionDetail(12, 71)
  await StudioCanvases.executionCreate(body)
  await StudioCanvases.executionSubmission(12, body.clientRequestId)
  await StudioCanvases.executionRetrySettlement(12, 71)
  await StudioCanvases.chatArchive(12, 31, true)
  await StudioCanvases.workflowResume(12, 8)
  assert.deepEqual(calls.map(item => item.url), ['/executions/detail', '/executions/create', '/executions/submission', '/executions/retrySettlement', '/chat/sessions/archive', '/workflows/resume'].map(path => '/api/v1/studio/canvases' + path))
  assert.equal(calls[0].query.taskId, 71); assert.deepEqual(calls[1].body, body)
  assert.equal(calls[4].body.archived, true); assert.equal(calls[5].body.workflowId, 8)
})
