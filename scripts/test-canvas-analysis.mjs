import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { actualBillingQuote, canvasBillingError, zeroBalanceMessage, billingLabels } from '../src/pages/canvas/TapnowStudio/canvasActualBilling.js'
import * as textTasks from '../src/pages/canvas/TapnowStudio/canvasTextTasks.js'

/** Load production logic with only transport and persistent-storage boundaries replaced. */
function load(file, imports) {
  const exports = {}
  const output = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(output, { exports, require: name => { assert.ok(name in imports, name); return imports[name] } })
  return exports
}
const plain = value => JSON.parse(JSON.stringify(value))
const fail = errorCode => Object.assign(new Error(errorCode), { errorCode })
function harness(api = {}, storage = new Map()) {
  let serial = 0
  const service = { canvasRequestId: prefix => `${prefix}-${++serial}` }
  const logic = load('src/pages/canvas/TapnowStudio/canvasAnalysis.js', { '../../../services/studioCanvasAnalysis': { CanvasAnalysis: api }, '../../../services/studioCanvases': service })
  const session = { assertWritable() {}, read: key => plain(storage.get(key) ?? null), write: (key, value) => storage.set(key, plain(value)) }
  return { ...logic, session, storage, service }
}
const caps = { analysisTasksReady: true, advancedFeatures: false, chatReady: false, operationStatuses: ['framePromptGenerate', 'videoAnalyze', 'transcribeAudio'].map(operation => ({ operation, available: true, modelIds: [47] })) }
const models = [{ modelId: 47, name: 'catalogue-model', available: true }]
function document() {
  return { canvasId: 9, revisionNo: 2, project: { nodes: [{ id: '分析 节点 ', type: 'video-analyze', settings: { analysisModelId: 47, analysisStartSeconds: 3, analysisEndSeconds: 8 } }, { id: ' 原视频', type: 'video-input', content: null, duration: 40, selectedKeyframes: [{ frameId: ' 帧 一 ', timeSeconds: 1, url: null }, { frameId: '第二帧', timeSeconds: 4, url: null }] }], connections: [{ from: ' 原视频', to: '分析 节点 ' }] }, modelBindings: [{ nodeId: '分析 节点 ', fieldPath: '/settings/analysisModelId', modelId: 47 }], assetBindings: [{ nodeId: ' 原视频', fieldPath: '/content', assetId: 300 }, { nodeId: ' 原视频', fieldPath: '/selectedKeyframes/0/url', assetId: 301 }, { nodeId: ' 原视频', fieldPath: '/selectedKeyframes/1/url', assetId: 302 }] }
}
const quote = { canvasId: 9, revisionNo: 2, quoteId: 'quote', billingMode: 'balance_then_actual', requiresConfirmation: false, currentBalance: 10, sufficient: true, unlimited: false, expiresAt: '2099-01-01T00:00:00Z' }
test('actual billing requires explicit protocol flags and never treats unknown balance as permission', () => {
  assert.equal(actualBillingQuote(quote, 9, 2), quote)
  for (const patch of [{ requiresConfirmation: undefined }, { requiresConfirmation: true }, { billingMode: undefined }, { sufficient: undefined }]) assert.throws(() => actualBillingQuote({ ...quote, ...patch }, 9, 2))
  assert.throws(() => actualBillingQuote({ ...quote, expiresAt: '2000-01-01' }, 9, 2), /过期/)
})
test('zero balance, actual zero, unknown charge, unlimited and no-audio branch remain distinct', () => {
  assert.throws(() => actualBillingQuote({ ...quote, currentBalance: 0 }, 9, 2), { message: zeroBalanceMessage })
  assert.throws(() => actualBillingQuote({ ...quote, sufficient: false, unlimited: 'true' }, 9, 2))
  assert.ok(actualBillingQuote({ ...quote, currentBalance: 0, sufficient: false, unlimited: true }, 9, 2))
  assert.ok(actualBillingQuote({ ...quote, currentBalance: 0, sufficient: false, providerCallRequired: false }, 9, 2))
  assert.equal(canvasBillingError({ errorCode: 'INSUFFICIENT_CREDITS', error: 'other' }), zeroBalanceMessage)
  assert.equal(billingLabels.pending, '待结算')
})
test('frozen frame requests preserve exact IDs, all selected frames and numeric binding without crop fields', () => {
  const h = harness(), doc = document()
  const body = h.analysisEstimate(doc, '分析 节点 ', 'framePromptGenerate', caps, models)
  assert.deepEqual(plain(body.selection.frames), [{ frameId: ' 帧 一 ', timeSeconds: 1, assetId: 301 }, { frameId: '第二帧', timeSeconds: 4, assetId: 302 }])
  assert.equal(body.sourceNodeId, ' 原视频'); assert.equal(body.modelId, 47)
  assert.deepEqual(plain(body.parameters), { segmentDurationSeconds: 4, promptLanguages: ['zh-CN', 'en'] })
  assert.equal(JSON.stringify(body).includes('url'), false)
})
test('static images use source ID and zero time; operation gating is independent of chat and advanced features', () => {
  const h = harness(), doc = document()
  doc.project.nodes[1].type = 'input-image'
  assert.deepEqual(plain(h.analysisEstimate(doc, '分析 节点 ', 'framePromptGenerate', caps, models).selection), { frames: [{ frameId: ' 原视频', timeSeconds: 0, assetId: 300 }] })
  const limited = { ...caps, operationStatuses: caps.operationStatuses.map(item => ({ ...item, available: item.operation === 'framePromptGenerate' })) }
  assert.ok(h.analysisEstimate(doc, '分析 节点 ', 'framePromptGenerate', limited, models))
  assert.throws(() => h.analysisEstimate(doc, '分析 节点 ', 'videoAnalyze', limited, models), /不可用/)
})
test('direct video/audio use exclusive media bindings and original crop times', () => {
  const h = harness(), doc = document()
  const video = h.analysisEstimate(doc, '分析 节点 ', 'videoAnalyze', caps, models)
  assert.deepEqual(plain(video.selection), { videoAssetId: 300 }); assert.deepEqual(plain(video.parameters), { startSeconds: 3, endSeconds: 8 })
  doc.project.nodes[1].type = 'audio-input'
  assert.deepEqual(plain(h.analysisEstimate(doc, '分析 节点 ', 'transcribeAudio', caps, models).selection), { audioAssetId: 300 })
  assert.throws(() => h.analysisEstimate(doc, '分析 节点 ', 'videoAnalyze', caps, models), /类型/)
})
test('extra ports, missing binding, stale models, duplicates and empty selections stop before quoting', () => {
  const h = harness()
  for (const change of [doc => doc.project.connections.push({ from: ' 原视频', to: '分析 节点 ', inputType: 'reference' }), doc => doc.assetBindings.pop(), doc => doc.modelBindings[0].modelId = 32, doc => doc.project.nodes[1].selectedKeyframes = [], doc => doc.project.nodes[1].selectedKeyframes[1].frameId = ' 帧 一 ']) {
    const doc = document(); change(doc)
    assert.throws(() => h.analysisEstimate(doc, '分析 节点 ', 'framePromptGenerate', caps, models))
  }
})
test('legacy frame metadata is normalized once and existing whitespace identifiers stay intact', () => {
  const h = harness(), project = document().project
  project.nodes[1].selectedKeyframes = [{ url: 'blob:one', time: '1.25' }, { frameId: ' 空格 ', url: 'blob:two', timeSeconds: 2 }]
  const first = h.normalizeAnalysisFrames(project, '分析 节点 ')
  const next = h.normalizeAnalysisFrames(first, '分析 节点 ')
  assert.deepEqual(plain(first), plain(next)); assert.equal(next.nodes[1].selectedKeyframes[0].timeSeconds, 1.25); assert.equal(next.nodes[1].selectedKeyframes[1].frameId, ' 空格 ')
})
const estimate = { canvasId: 9, revisionNo: 2, nodeId: '分析 节点 ', sourceNodeId: ' 原视频', modelId: 47, operation: 'videoAnalyze', selection: { videoAssetId: 300 } }
const task = { ...estimate, taskId: 81, inputHash: 'frozen-hash', status: 3, result: { scenes: [{ sceneId: '场景 一', startSeconds: 3, endSeconds: 8, prompts: { zh: '中文', en: 'English' }, keyframes: [{ frameId: 'kf', assetId: 333, timeSeconds: 4 }] }] } }
for (const kind of ['create', 'retry']) {
  test(`${kind}: timeout is persisted before send, survives reload and only explicit absence permits exact replay`, async () => {
    const calls = []
    const body = { canvasId: 9, quoteId: 'q', clientRequestId: 'stable', ...(kind === 'retry' ? { taskId: 70 } : {}) }
    const request = { kind, body, inputHash: task.inputHash, estimate }
    const h = harness({ [kind]: async value => { calls.push(plain(value)); throw new TypeError('offline') } })
    await assert.rejects(h.submitAnalysis(h.session, request), /offline/)
    request.body.quoteId = 'changed-after-timeout'
    const reload = harness({ submission: async () => { throw fail('CANVAS_ANALYSIS_SUBMISSION_NOT_FOUND') }, [kind]: async value => { calls.push(plain(value)); return task } }, h.storage)
    await reload.submitAnalysis(reload.session, null, true)
    assert.deepEqual(calls[0], calls[1]); assert.equal('maxReservedCredits' in calls[1], false); assert.equal(reload.session.read('analysis:submission'), null)
  })
}
test('receipt lookup success never creates again; authorization and malformed receipts preserve pending input', async () => {
  const request = { kind: 'create', body: { canvasId: 9, quoteId: 'q', clientRequestId: 'stable' }, inputHash: task.inputHash, estimate }
  const h = harness({ create: async () => { throw new TypeError('offline') } })
  await assert.rejects(h.submitAnalysis(h.session, request))
  for (const reply of [async () => { throw fail('FORBIDDEN') }, async () => ({ ...task, sourceNodeId: 'other' }), async () => ({ ...task, inputHash: 'other' })]) {
    const reload = harness({ submission: reply }, h.storage)
    await assert.rejects(reload.submitAnalysis(reload.session, null, true)); assert.ok(reload.session.read('analysis:submission'))
  }
  const reload = harness({ submission: async () => task }, h.storage)
  await reload.submitAnalysis(reload.session, null, true)
  assert.equal(reload.session.read('analysis:submission'), null)
})
test('failed local persistence prevents paid calls, and insufficient balance is a definitive rejection', async () => {
  let sends = 0
  const h = harness({ create: async () => { sends++; throw fail('INSUFFICIENT_CREDITS') } })
  const request = { kind: 'create', body: { canvasId: 9, quoteId: 'q', clientRequestId: 'stable' }, inputHash: task.inputHash, estimate }
  await assert.rejects(h.submitAnalysis({ ...h.session, write: () => { throw new Error('storage full') } }, request), /storage/); assert.equal(sends, 0)
  await assert.rejects(h.submitAnalysis(h.session, request)); assert.equal(h.session.read('analysis:submission'), null)
})
test('result application records provenance once and leaves source duration and original media unchanged', () => {
  const h = harness(), doc = document(), original = plain(doc.project.nodes)
  const next = h.applyAnalysisResult(doc.project.nodes, task)
  assert.deepEqual(plain(next[1]), original[1]); assert.equal(next[0].settings.analysisResults[0].sceneId, '场景 一')
  assert.equal(next[0].settings.analysisResults[0].keyframes[0].time, 4)
  assert.equal(next[0].settings.analysisProvenance[0].inputHash, task.inputHash)
  assert.throws(() => h.applyAnalysisResult(next, task), /已应用/)
  assert.deepEqual(plain(doc.project.nodes), original)
  assert.throws(() => h.applyAnalysisResult(doc.project.nodes, { ...task, status: 6 }), /不能应用/)
})
test('empty no-audio transcript persists free result and does not invent speech or add crop offsets', () => {
  const h = harness(), nodes = document().project.nodes
  const empty = { ...task, operation: 'transcribeAudio', result: { hasAudio: false, segments: [], fullText: '', warnings: ['NO_AUDIO_TRACK'] } }
  assert.deepEqual(plain(h.applyAnalysisResult(nodes, empty)[0].settings.voiceoverResults), [])
  const spoken = { ...empty, result: { hasAudio: true, segments: [{ startSeconds: 4, endSeconds: 5, speaker: null, text: 'hello' }], fullText: 'hello' } }
  assert.equal(h.applyAnalysisResult(nodes, spoken)[0].settings.voiceoverResults[0].startSeconds, 4)
})
test('application fingerprint detects edits to source, target, edge, asset and model while ignoring unrelated nodes', () => {
  const h = harness(), doc = document(), original = h.analysisFingerprint(doc, task)
  for (const change of [value => value.project.nodes[0].settings.analysisModelId = 50, value => value.project.nodes[1].duration = 10, value => value.project.connections[0].inputType = 'reference', value => value.assetBindings[0].assetId = 999, value => value.modelBindings[0].modelId = 999]) {
    const next = plain(doc); change(next); assert.notEqual(h.analysisFingerprint(next, task), original)
  }
  doc.project.nodes.push({ id: 'unrelated', type: 'text-node', content: 'anything' }); assert.equal(h.analysisFingerprint(doc, task), original)
})
test('workflow includes a complete frozen analysis template and retains the overall reservation budget', () => {
  const h = harness(), doc = document()
  const execution = load('src/pages/canvas/TapnowStudio/canvasExecution.js', { '../../../services/studioCanvases': h.service, './canvasTextTasks': textTasks })
  const plan = execution.workflowPlan(doc, ['分析 节点 '], { '分析 节点 ': 'videoAnalyze' }, { operations: ['videoAnalyze'] }, [], 'stop', { build: h.analysisEstimate, capabilities: caps, catalogs: { videoAnalyze: models } })
  assert.equal(plan.steps[0].analysis.selection.videoAssetId, 300)
  assert.equal(plan.steps[0].analysis.sourceNodeId, ' 原视频')
  assert.equal(execution.createV4Body(9, 'q', 0, 'workflow').maxReservedCredits, 0)
  assert.equal('maxReservedCredits' in execution.createV4Body(9, 'q', undefined, 'chat'), false)
})


test('catalog failure and unavailable media tools do not hide the usable image operation', async () => {
  const calls = []
  const h = harness({ models: async operation => { calls.push(operation); if (operation === 'videoAnalyze') throw new Error('catalog offline'); return models } })
  const limited = { ...caps, operationStatuses: caps.operationStatuses.map(item => ({ ...item, available: item.operation !== 'transcribeAudio' })) }
  const result = await h.loadAnalysisCatalogs(limited)
  assert.deepEqual(calls, ['framePromptGenerate', 'videoAnalyze'])
  assert.equal(result.catalogs.framePromptGenerate[0].modelId, 47)
  assert.equal(result.errors.videoAnalyze, 'catalog offline')
  assert.equal(result.catalogs.transcribeAudio, undefined)
})

test('a lookup error never discards an accepted submission, including admission-like error codes', async () => {
  const h = harness({ create: async () => { throw new Error('timeout') }, submission: async () => { throw fail('INSUFFICIENT_CREDITS') } })
  await assert.rejects(h.submitAnalysis(h.session, { kind: 'create', body: { canvasId: 9, quoteId: 'q', clientRequestId: 'stable', maxReservedCredits: 10 }, inputHash: task.inputHash, estimate }))
  await assert.rejects(h.submitAnalysis(h.session, null, true))
  assert.equal(h.session.read('analysis:submission').body.maxReservedCredits, 10)
})

test('binding-only model references are valid; mismatched direct fields are rejected', () => {
  const h = harness(), doc = document()
  delete doc.project.nodes[0].settings.analysisModelId
  assert.equal(h.analysisEstimate(doc, '分析 节点 ', 'videoAnalyze', caps, models).modelId, 47)
  doc.project.nodes[0].settings.analysisModelId = 'studio-47'
  assert.throws(() => h.analysisEstimate(doc, '分析 节点 ', 'videoAnalyze', caps, models), /模型/)
})

test('preview modality, full-source duration and crop limits are checked before estimate', () => {
  const h = harness(), doc = document()
  doc.project.nodes[1].type = 'preview'; doc.project.nodes[1].previewType = 'image'
  assert.throws(() => h.analysisEstimate(doc, '分析 节点 ', 'videoAnalyze', caps, models), /类型/)
  doc.project.nodes[1].previewType = 'video'; doc.project.nodes[1].duration = 301
  assert.throws(() => h.analysisEstimate(doc, '分析 节点 ', 'videoAnalyze', caps, models), /完整来源/)
  doc.project.nodes[1].duration = 5
  assert.throws(() => h.analysisEstimate(doc, '分析 节点 ', 'videoAnalyze', caps, models), /裁剪时间/)
  doc.project.nodes[1].duration = 40
  assert.throws(() => h.analysisEstimate(doc, '分析 节点 ', 'transcribeAudio', caps, [{ ...models[0], supportsAudioTrack: false }]), /音轨/)
})

test('invalid scenes, duplicate scene identities and invalid timestamps cannot be applied', () => {
  const h = harness()
  for (const mutate of [value => value.scenes[0].prompts = {}, value => value.scenes.push(value.scenes[0]), value => value.scenes[0].keyframes[0].assetId = null, value => value.scenes[0].endSeconds = 1]) {
    const result = plain(task.result); mutate(result)
    assert.throws(() => h.applyAnalysisResult(document().project.nodes, { ...task, result }))
  }
  assert.throws(() => h.applyAnalysisResult(document().project.nodes, { ...task, operation: 'transcribeAudio', result: { fullText: 'x', segments: [{ startSeconds: 5, endSeconds: 2, text: 'x' }] } }), /不完整/)
})

/** Invoke the real hook callbacks with deterministic state and async boundaries. */
function uiHandler(name, globals) {
  const file = 'useCanvasAnalysis.jsx'
  const source = ts.createSourceFile(file, readFileSync(new URL('../src/pages/canvas/TapnowStudio/' + file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
  let expression
  const walk = node => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.getText(source); ts.forEachChild(node, walk) }
  walk(source)
  assert.ok(expression, name)
  const code = ts.transpileModule(`var invoke = ${expression}`, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText
  const context = vm.createContext({ useCallback: fn => fn, session: {}, page: 1, ...globals })
  vm.runInContext(code, context)
  return context.invoke
}

function application() {
  const h = harness(), doc = document(), snapshotRef = { current: plain(doc.project) }, calls = []
  const context = { ...h, run: fn => fn(), assertReady() {}, snapshotRef, session: { ...h.session, document: doc, prepare: async snapshot => ({ ...doc, project: snapshot }) },
    detail: async () => plain(task), StudioCanvases: { detail: async () => plain(doc) }, confirm: async () => { calls.push('confirm'); return true },
    setNodes() {}, saveToUndoStack: () => calls.push('undo'), save: async () => calls.push('save') }
  return { context, calls, snapshotRef, apply: () => uiHandler('apply', context)(task) }
}

test('result application remains undoable and works while actual cost is pending', async () => {
  const h = application()
  await h.apply()
  assert.deepEqual(h.calls, ['undo', 'save'])
  assert.equal(h.snapshotRef.current.nodes[0].settings.analysisProvenance[0].taskId, 81)
  await assert.rejects(h.apply(), /已应用/)
})

test('historical results require an explicit choice; cancellation keeps the current edit', async () => {
  const h = application()
  h.context.session.document.revisionNo = 3
  h.context.confirm = async () => false
  assert.equal(await h.apply(), false)
  assert.equal(h.snapshotRef.current.nodes[0].settings.analysisResults, undefined)
  assert.deepEqual(h.calls, [])
  h.context.confirm = async () => true
  await h.apply()
  assert.deepEqual(h.calls, ['undo', 'save'])
})

test('edits during result retrieval or historical confirmation never get overwritten', async () => {
  for (const stage of ['detail', 'confirm']) {
    const h = application()
    h.context.session.document.revisionNo = 3
    h.context[stage] = async () => { h.snapshotRef.current = { ...h.snapshotRef.current, projectName: 'new edit' }; return stage === 'detail' ? plain(task) : true }
    await assert.rejects(h.apply(), /画布已变化/)
    assert.deepEqual(h.calls.filter(call => call === 'save'), [])
    assert.equal(h.snapshotRef.current.projectName, 'new edit')
  }
})

test('history loads completed details after reload and preserves summaries if one detail fails', async () => {
  let items = [], total
  const h = harness()
  const context = { CanvasAnalysis: { list: async () => ({ total: 2, items: [{ taskId: 81 }, { taskId: 82 }] }) }, session: { document: { canvasId: 9 } },
    detail: async (_, id) => { if (id === 82) throw new Error('offline'); return task }, listSequence: { current: 0 }, mounted: { current: true },
    canvasBillingError, setError() {}, setTotal: value => total = value, setTasks: update => items = update(items) }
  await uiHandler('refresh', context)()
  assert.equal(total, 2); assert.equal(items[0].result.scenes.length, 1); assert.equal(items[1].taskId, 82)
})

test('manual and polling detail reads share the same in-flight request', async () => {
  let calls = 0, resolve
  const response = new Promise(done => resolve = done)
  const detail = uiHandler('detail', { detailRequests: { current: new Map() }, nextPoll: { current: new Map() }, CanvasAnalysis: { detail: () => { calls++; return response } } })
  const first = detail(9, 81), second = detail(9, 81)
  assert.equal(first, second); assert.equal(calls, 1)
  resolve({ ...task, retryAfterMs: 2500 }); await first
  await detail(9, 81); assert.equal(calls, 2)
})

test('generated transport keeps analysis task IDs, shared authentication configuration and Chinese input checks', async () => {
  const requests = [], config = { BASE: '/jellyfish', HEADERS: { Authorization: 'raw-token' } }
  const { CanvasAnalysisService: service } = load('src/services/generated/services/CanvasAnalysisService.ts', {
    '../core/OpenAPI': { OpenAPI: config }, '../core/request': { request: (actual, options) => { assert.equal(actual, config); requests.push(options); return Promise.resolve({ code: 200, data: {} }) } },
  })
  await service.analysisCostEstimate({ requestBody: estimate, language: 'zh' })
  assert.equal(requests[0].headers.language, 'zh'); assert.equal(requests[0].body, estimate)
  await service.analysisRetrySettlement({ requestBody: { canvasId: 9, taskId: 81 } })
  assert.equal(requests[1].url, '/api/v1/studio/canvases/analysis/retrySettlement')
  assert.deepEqual(requests[1].body, { canvasId: 9, taskId: 81 })
  assert.equal(service.analysisSyncResult, undefined)
})
