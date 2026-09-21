import { canvasMockFetch, withCanvasOperationLock } from './canvas-test-transport.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { applyTextResult, prepareTextSnapshot, textInputFingerprint } from '../src/pages/canvas/TapnowStudio/canvasTextTasks.js'

function load(path, imports, globals = {}) {
  imports = { './canvasOperationLock': { withCanvasOperationLock }, '../auth': { getStoredAuthUser: () => ({ id: 42 }) }, ...imports }
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText
  vm.runInNewContext(code, { exports, Headers, FormData, URLSearchParams, fetch: canvasMockFetch(imports), Blob, URL, Map, Set, console, ...globals, require(name) { assert.ok(name in imports, `Unexpected dependency: ${name}`); return imports[name] } })
  return exports
}
const plain = value => JSON.parse(JSON.stringify(value))
const document = () => ({ canvasId: 12, revisionNo: 8, currentRevisionNo: 8, schemaVersion: 1, project: { nodes: [], connections: [], view: { x: 0, y: 0, zoom: 1 } }, assetBindings: [], modelBindings: [] })
const node = (id, type, settings = {}) => ({ id, type, settings, x: 0, y: 0, width: 300, height: 200 })
const textModels = [{ modelId: 9, name: '文字模型', available: true }]
const quote = () => ({ quoteId: 'quote-1', canvasId: 12, revisionNo: 8, nodeId: '中文 节点', operation: 'promptEnhance', modelId: 9, inputHash: 'frozen-hash', reservedCredits: 1.5 })
const task = (patch = {}) => ({ ...quote(), taskId: 70, generationTaskId: 900, status: 3, shouldPoll: false, actions: {}, result: { schemaVersion: 1, operation: 'promptEnhance', prompt: '增强后的描述' }, actualCredits: null, ...patch })
const body = () => ({ canvasId: 12, quoteId: 'quote-1', clientRequestId: 'text-stable-1', maxReservedCredits: 1.5 })
const notFound = code => Object.assign(new Error('not found'), { errorCode: code, status: 502, submissionState: code === "CANVAS_QUOTE_EXPIRED" ? "notAccepted" : "notFound" })
function harness(api = {}, options = {}) {
  const storage = options.storage || new Map()
  let sequence = 0
  const window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } }
  const module = load('../src/pages/canvas/TapnowStudio/canvasCloud.js', {
    '../../../services/studioCanvases': { StudioCanvases: api, canvasRequestId: op => `${op}-${++sequence}` },
    '../../../auth': { getStoredAuthUser: () => ({ id: 42 }) },
  }, { window })
  const models = [{ id: 2, type: 2 }, { id: 3, type: 3 }]
  const session = new module.CanvasCloudSession(document(), models, async value => value, { textModels, capabilities: { apiVersion: 3, textTasksReady: true, libraryPublishReady: true } })
  return { ...module, session, storage, window }
}

test('v3 saves all four media types, description reference bindings and the explicitly selected second image', async () => {
  const { session } = harness()
  session.media.set('blob:first', { assetId: 310 }); session.media.set('blob:second', { assetId: 311 })
  const nodes = ['generate-character-image', 'generate-scene-image', 'generate-character-video', 'generate-scene-video'].map(type => node(type + ' 中文', type, { model: type.endsWith('image') ? 'studio-2' : 'studio-3' }))
  nodes[0].settings.imageUrls = ['blob:first', 'blob:second']; nodes[0].settings.selectedImageIndex = 1
  nodes.push(node('角色 描述', 'character-description', { prompt: '人物描述', referenceImages: ['blob:second'], textModelId: 9 }))
  const result = await session.prepare({ ...document().project, nodes })
  assert.equal(result.modelBindings.length, 5)
  assert.equal(result.project.nodes[0].settings.selectedImageIndex, 1)
  assert.ok(result.assetBindings.some(b => b.nodeId === nodes[0].id && b.fieldPath === '/settings/imageUrls/1' && b.assetId === 311))
  assert.ok(result.assetBindings.some(b => b.nodeId === '角色 描述' && b.fieldPath === '/settings/referenceImages/0' && b.assetId === 311))
  assert.equal(result.project.nodes[4].settings.textModelId, 9)
})

test('v3 text fields containing URLs stay text and text models bind existing numeric fields', async () => {
  const { session } = harness()
  const result = await session.prepare({ ...document().project, nodes: [node('小说', 'novel-input', { content: 'https://example.test 是故事正文', textModelId: 9 }), node('提取', 'extract-characters-scenes', { scriptText: 'https://example.test 也是正文', chatModel: 'studio-9' })] })
  assert.equal(result.assetBindings.length, 0)
  assert.deepEqual(plain(result.modelBindings).map(b => b.fieldPath), ['/settings/textModelId', '/settings/chatModel'])
  assert.equal(result.project.nodes[1].settings.chatModel, 9)
})

test('v3 rejects a media model not supporting the chosen node type', async () => {
  const { session } = harness(); session.models[0].supportedNodeTypes = ['gen-image']
  await assert.rejects(session.prepare({ ...document().project, nodes: [node('c', 'generate-character-image', { model: 'studio-2' })] }), /不支持/)
})

test('text timeout is recovered after reload with the same identity and without resubmitting', async () => {
  let creates = 0
  const first = harness({ textCreate: async () => { creates++; throw new TypeError('network lost') } })
  await assert.rejects(first.session.submitText(body(), quote()), /network/)
  const next = harness({ textSubmission: async (canvasId, requestId) => { assert.equal(canvasId, 12); assert.equal(requestId, body().clientRequestId); return task() } }, { storage: first.storage })
  assert.equal((await next.session.recoverText()).taskId, 70)
  assert.equal(creates, 1); assert.equal(next.session.pendingText, null)
})

test('missing text receipt replays the exact original quote and request payload', async () => {
  const submitted = []
  const { session } = harness({ textCreate: async value => { submitted.push(plain(value)); if (submitted.length === 1) throw new TypeError('offline'); return task() }, textSubmission: async () => { throw notFound('CANVAS_TEXT_SUBMISSION_NOT_FOUND') } })
  await assert.rejects(session.submitText(body(), quote()))
  await session.recoverText()
  assert.deepEqual(submitted, [body(), body()])
})

test('expired quote clears rejected submission and never silently requotes', async () => {
  let attempts = 0
  const { session } = harness({ textCreate: async () => { attempts++; throw notFound('CANVAS_QUOTE_EXPIRED') } })
  await assert.rejects(session.submitText(body(), quote()), /not found/)
  assert.equal(session.pendingText, null); assert.equal(attempts, 1)
})

test('text result with a different input hash retains the pending record', async () => {
  const { session } = harness({ textCreate: async () => task({ inputHash: 'wrong' }) })
  await assert.rejects(session.submitText(body(), quote()), /不一致/)
  assert.equal(session.pendingText.body.clientRequestId, body().clientRequestId)
})

test('text storage failure prevents a paid submission', async () => {
  let calls = 0
  const { session, window } = harness({ textCreate: async () => { calls++; return task() } })
  window.localStorage.setItem = () => { throw new Error('quota') }
  await assert.rejects(session.submitText(body(), quote()), /quota/)
  assert.equal(calls, 0)
})

test('text retry uses the canvas task ID, not the generic generation task ID', async () => {
  const { session } = harness({ textRetry: async value => { assert.equal(value.taskId, 70); return task() } })
  await session.submitText({ ...body(), taskId: 70 }, quote(), 'retry')
})

test('text preparation honors description fallback, operation-specific catalogs and the 60000 character bound', () => {
  const snapshot = { ...document().project, nodes: [node('中文 节点', 'character-description', { prompt: '', description: '角色', textModelId: 9 })] }
  assert.equal(prepareTextSnapshot(snapshot, '中文 节点', 'promptEnhance', textModels).modelId, 9)
  assert.throws(() => prepareTextSnapshot(snapshot, '中文 节点', 'promptEnhance', [{ ...textModels[0], operations: ['storyboardSplit'] }]), /文本模型/)
  assert.throws(() => prepareTextSnapshot(snapshot, '中文 节点', 'promptEnhance', textModels, { prompt: '字'.repeat(60001) }), /60,000/)
  assert.equal(snapshot.nodes[0].settings.prompt, '')
})

test('storyboard input preparation maps Markdown and rejects duplicate numeric shot IDs', () => {
  const snapshot = { ...document().project, nodes: [node('分镜', 'storyboard-node', { textModelId: 9, tableMarkdown: '| 镜头 | 描述 |\n| 1 | 日出 |' })] }
  const result = prepareTextSnapshot(snapshot, '分镜', 'storyboardSplit', textModels)
  assert.equal(result.snapshot.nodes[0].settings.scriptText, snapshot.nodes[0].settings.tableMarkdown)
  assert.throws(() => prepareTextSnapshot(snapshot, '分镜', 'storyboardPromptMerge', textModels, { shots: [{ id: 1 }, { id: '1' }] }), /唯一/)
})

test('text fingerprints detect upstream edits but ignore canvas geometry', () => {
  const snapshot = { ...document().project, nodes: [node('提取', 'extract-characters-scenes', { textModelId: 9 }), node('小说 中文', 'novel-input', { content: '之前' })], connections: [{ from: '小说 中文', to: '提取' }] }
  const before = textInputFingerprint(snapshot, '提取', 'extractCharactersScenes')
  snapshot.nodes[0].x = 500
  assert.equal(textInputFingerprint(snapshot, '提取', 'extractCharactersScenes'), before)
  snapshot.nodes[1].settings.content = '修改之后'
  assert.notEqual(textInputFingerprint(snapshot, '提取', 'extractCharactersScenes'), before)
})

test('text prompt application changes only the matching node and keeps unknown fees unknown', () => {
  const source = node('中文 节点', 'character-description', { prompt: '旧描述', referenceImages: ['blob:a'] })
  const result = applyTextResult(source, task())
  assert.equal(result.settings.prompt, '增强后的描述')
  assert.equal(source.settings.prompt, '旧描述')
  assert.deepEqual(result.settings.referenceImages, ['blob:a'])
  assert.throws(() => applyTextResult(source, task({ nodeId: '另一个节点' })), /不匹配/)
  assert.equal(task().actualCredits, null)
})

test('storyboard merge uses stable row IDs, preserves image bindings and rejects unknown or duplicate rows', () => {
  const source = node('中文 节点', 'storyboard-node', { shots: [{ id: 7, image_url: 'blob:a', prompt: '旧' }, { id: '中文 镜头', prompt: '旧2' }] })
  const merged = task({ operation: 'storyboardPromptMerge', result: { schemaVersion: 1, operation: 'storyboardPromptMerge', shots: [{ rowId: '中文 镜头', prompt: '新2' }, { rowId: '7', prompt: '新' }] } })
  const result = applyTextResult(source, merged)
  assert.deepEqual(result.settings.shots.map(s => [s.id, s.prompt]), [[7, '新'], ['中文 镜头', '新2']])
  assert.equal(result.settings.shots[0].image_url, 'blob:a')
  merged.result.shots[1].rowId = '中文 镜头'
  assert.throws(() => applyTextResult(source, merged), /重复|缺失/)
})

test('storyboard split retains server IDs instead of generating new IDs on replay', () => {
  const source = node('中文 节点', 'storyboard-node')
  const split = task({ operation: 'storyboardSplit', result: { schemaVersion: 1, operation: 'storyboardSplit', shots: [{ id: '服务端 1', description: '日出', prompt: '远景', durationSeconds: 5 }] } })
  assert.deepEqual(applyTextResult(source, split), applyTextResult(source, split))
  assert.equal(applyTextResult(source, split).settings.shots[0].id, '服务端 1')
})

const review = () => ({ reviewId: 25, canvasId: 12, canvasAssetId: 310, status: 2, riskLevel: 1, canPublish: true })
const publication = () => ({ assetType: 2, libraryItemId: 86, sourceLinkId: 145, canvasAssetId: 310, assetId: null, imageVersionId: null })
const publishBody = () => ({ canvasId: 12, revisionNo: 8, nodeId: '图片 中文', canvasAssetId: 310, reviewId: 25, assetType: 2, name: '场景', description: '', prompt: '', aspectRatio: '16:9', quality: 1, resolution: 2, clientRequestId: 'publish-1' })

test('review timeout is recovered by receipt and does not run paid image recognition twice', async () => {
  let calls = 0
  const first = harness({ reviewLibrary: async () => { calls++; throw new TypeError('offline') } })
  await assert.rejects(first.session.reviewLibrary(310))
  const next = harness({ reviewLibrarySubmission: async () => review() }, { storage: first.storage })
  assert.equal((await next.session.reviewLibrary(310)).canPublish, true)
  assert.equal(calls, 1)
})

test('library publishing cannot bypass failed review or swap images after review', async () => {
  const { session } = harness({ reviewLibrary: async () => ({ ...review(), canPublish: false }) })
  await session.reviewLibrary(310)
  await assert.rejects(session.publishLibrary(publishBody()), /初筛/)
  session.pendingLibraryReview.receipt.canPublish = true
  await assert.rejects(session.publishLibrary({ ...publishBody(), canvasAssetId: 311 }), /初筛/)
})

test('publish timeout recovers real library and source IDs from the generic asset receipt', async () => {
  let creates = 0
  const { session } = harness({ reviewLibrary: async () => review(), publishLibrary: async () => { creates++; throw new TypeError('offline') }, assetSubmission: async () => ({ asset: { assetId: 310 }, source: { libraryItemId: 86, sourceLinkId: 145, assetType: 2 } }) })
  await session.reviewLibrary(310)
  await assert.rejects(session.publishLibrary(publishBody()))
  const result = await session.publishLibrary({ ...publishBody(), name: '不得换用新请求' })
  assert.equal(result.libraryItemId, 86); assert.equal(result.sourceLinkId, 145); assert.equal(creates, 1)
})

test('missing publish receipt replays identical original parameters', async () => {
  const calls = []
  const { session } = harness({ reviewLibrary: async () => review(), publishLibrary: async value => { calls.push(plain(value)); if (calls.length === 1) throw new TypeError('offline'); return publication() }, assetSubmission: async () => { throw notFound('CANVAS_ASSET_SUBMISSION_NOT_FOUND') } })
  await session.reviewLibrary(310)
  await assert.rejects(session.publishLibrary(publishBody()))
  await session.recoverLibraryPublish()
  assert.deepEqual(calls, [publishBody(), publishBody()])
})

test('v3 API wrappers use documented endpoints and preserve text IDs, filters and request bodies', async () => {
  const calls = []
  const { StudioCanvases } = load('../src/services/studioCanvases.ts', {
    './generated': { OpenAPI: {} }, './generated/core/request': { request: async (_config, options) => { calls.push(options); return { code: 200, data: {} } }, getHeaders: async () => ({}) },
  })
  await StudioCanvases.textEstimate({ ...quote(), nodeId: '中文 节点' })
  await StudioCanvases.textCreate(body())
  await StudioCanvases.textRetry({ ...body(), taskId: 70 })
  await StudioCanvases.textList(12, 3, { nodeId: '中文 节点', status: 6 })
  await StudioCanvases.batches(12, 2, 'needsReview')
  await StudioCanvases.reviewLibrary({ canvasId: 12, canvasAssetId: 310, clientRequestId: 'review-1' })
  await StudioCanvases.publishLibrary(publishBody())
  assert.deepEqual(calls.map(c => c.url), ['/tasks/costEstimate', '/tasks/create', '/tasks/retry', '/tasks/list', '/batches/list', '/assets/reviewLibrary', '/assets/publishLibrary'].map(p => '/api/v1/studio/canvases' + p))
  assert.equal(calls[2].body.taskId, 70); assert.equal(calls[3].query.nodeId, '中文 节点'); assert.equal(calls[4].query.status, 'needsReview')
})

test('hydration retains numeric V3 text model IDs while adapting legacy chat and media selectors', async () => {
  const { hydrateCanvasDocument } = load('../src/services/studioCanvases.ts', { './generated': { OpenAPI: {} }, './generated/core/request': { request() {}, getHeaders() {} } })
  const doc = document(); doc.project.nodes = [node('文字', 'character-description', { textModelId: 9 }), node('图片', 'gen-image', { model: 2 })]
  doc.modelBindings = [{ nodeId: '文字', fieldPath: '/settings/textModelId', modelId: 9 }, { nodeId: '图片', fieldPath: '/settings/model', modelId: 2 }]
  const result = await hydrateCanvasDocument(doc, [])
  assert.equal(result.project.nodes[0].settings.textModelId, 9); assert.equal(result.project.nodes[1].settings.model, 'studio-2')
})


test('receipt lookup authorization failure preserves the original text request for later recovery', async () => {
  const { session } = harness({ textCreate: async () => { throw new TypeError('offline') }, textSubmission: async () => { throw Object.assign(new Error('forbidden'), { status: 403 }) } })
  await assert.rejects(session.submitText(body(), quote()))
  await assert.rejects(session.recoverText(), /forbidden/)
  assert.equal(session.pendingText.body.clientRequestId, body().clientRequestId)
})

test('pending text parameters are snapshots and cannot be changed by later caller edits', async () => {
  const { session } = harness({ textCreate: async () => { throw new TypeError('offline') } })
  const request = body(), estimate = quote()
  await assert.rejects(session.submitText(request, estimate))
  request.quoteId = 'new-quote'; estimate.inputHash = 'new-input'
  assert.equal(session.pendingText.body.quoteId, 'quote-1')
  assert.equal(session.pendingText.quote.inputHash, 'frozen-hash')
})

test('incomplete publish response keeps the request so it can be recovered without a duplicate', async () => {
  const { session } = harness({ reviewLibrary: async () => review(), publishLibrary: async () => ({}) })
  await session.reviewLibrary(310)
  await assert.rejects(session.publishLibrary(publishBody()), /条目标识/)
  assert.equal(session.pendingLibraryPublish.clientRequestId, 'publish-1')
})

test('structured text results containing URLs or image-like IDs never trigger asset uploads', async () => {
  const { session } = harness()
  const result = await session.prepare({ ...document().project, nodes: [node('提取', 'novel-input', { content: '正文', textModelId: 9, analysisResults: { characters: [{ id: 'img_character', name: 'https://example.test' }], scenes: [] } })] })
  assert.equal(result.assetBindings.length, 0)
  assert.equal(result.project.nodes[0].settings.analysisResults.characters[0].id, 'img_character')
})
