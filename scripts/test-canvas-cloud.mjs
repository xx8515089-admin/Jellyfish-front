import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { File } from 'node:buffer'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(path, imports, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, { exports, Blob, File, fetch, URL, Map, ...globals, require(name) {
    if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`)
    return imports[name]
  } })
  return exports
}
const fixture = () => ({ canvasId: 7, revisionNo: 2, currentRevisionNo: 2, schemaVersion: 1,
  project: { version: '2.5.7', projectName: '测试', nodes: [], connections: [], view: { x: 20, y: 30, zoom: 0.5 } }, assetBindings: [], modelBindings: [] })
const models = [{ id: 9, type: 2, name: '图片模型', modelCode: 'image-test', imageCapabilities: { aspectRatios: ['16:9'], resolutions: [1, 2] } }]
function harness(api = {}, document = fixture(), globals = {}) {
  let sequence = 0
  const storage = new Map()
  const window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) } }
  const module = load('../src/pages/canvas/TapnowStudio/canvasCloud.js', {
    '../../../services/studioCanvases': { StudioCanvases: api, canvasRequestId: (operation) => `${operation}-${++sequence}` },
    '../../../auth': { getStoredAuthUser: () => ({ id: 42 }) },
  }, { window, ...globals })
  return { ...module, session: new module.CanvasCloudSession(document, models, async (value) => value), storage, window }
}
const node = (id, type, content, settings = {}) => ({ id, type, content, settings, x: 0, y: 0, width: 300, height: 250 })

test('snapshot preserves string identifiers, viewport and prose, strips credentials and binds media/model IDs', async () => {
  const doc = fixture()
  doc.project.nodes = [node('node-ref -1', 'input-image', 'blob:protected')]
  doc.assetBindings = [{ nodeId: 'node-ref -1', fieldPath: '/content', assetId: 55 }]
  const { session } = harness({}, doc)
  const input = { ...doc.project, nodes: [...doc.project.nodes, node('gen-1', 'gen-image', null, { model: 'studio-9', prompt: 'https://example.com 作为正文保留', apiKey: 'secret', headers: { Authorization: 'secret' }, nested: { requestTemplate: 'secret', keep: true } })] }
  const result = await session.prepare(input)
  assert.equal(result.project.nodes[0].id, 'node-ref -1')
  assert.equal(result.project.nodes[0].content, null)
  assert.equal(result.assetBindings[0].assetId, 55)
  assert.equal(result.modelBindings[0].modelId, 9)
  assert.equal(result.project.nodes[1].settings.quality, 1)
  assert.equal(result.project.nodes[1].settings.prompt, 'https://example.com 作为正文保留')
  assert.equal(JSON.stringify(result).includes('secret'), false)
  assert.equal(input.nodes[0].content, 'blob:protected')
  assert.equal(result.project.view.zoom, 0.5)
})

test('unknown frontend model cannot become a backend generation binding', async () => {
  const { session } = harness()
  await assert.rejects(session.prepare({ ...fixture().project, nodes: [node('g', 'gen-image', null, { model: 'provider-model' })] }), /后端模型/)
})

test('save conflicts fetch latest revision and block all further saves without advancing revision', async () => {
  let saves = 0, reads = 0
  const { session } = harness({ save: async () => { saves++; throw Object.assign(new Error('conflict'), { errorCode: 'CANVAS_REVISION_CONFLICT' }) }, detail: async () => { reads++; return { currentRevisionNo: 5 } } })
  await assert.rejects(session.save(fixture().project), /保存冲突/)
  await assert.rejects(session.save(fixture().project), /修订发生冲突/)
  assert.equal(session.revision, 2)
  assert.equal(saves, 1)
  assert.equal(reads, 1)
})

test('uncertain save keeps exact original parameters and request ID for replay', async () => {
  const calls = []
  const { session } = harness({ save: async (body) => {
    calls.push(JSON.stringify(body))
    if (calls.length === 1) throw new Error('timeout')
    return { ...body, revisionNo: 3, currentRevisionNo: 3 }
  } })
  await assert.rejects(session.save(fixture().project), /timeout/)
  await session.save(fixture().project)
  assert.equal(calls[0], calls[1])
  assert.equal(calls.length, 2)
  assert.equal(session.revision, 3)
})

test('replayed old save does not overwrite a newer server revision', async () => {
  const { session } = harness({ save: async (body) => ({ ...body, revisionNo: 3, currentRevisionNo: 8 }) })
  await assert.rejects(session.save(fixture().project), /新版本/)
  assert.equal(session.blocked, true)
})

test('generation is persisted before create and recovered through submission after timeout', async () => {
  let creates = 0, submissions = 0
  let harnessResult
  harnessResult = harness({
    submission: async () => { submissions++; if (submissions === 1) throw Object.assign(new Error('missing'), { errorCode: 'CANVAS_SUBMISSION_NOT_FOUND' }); return { generationId: 90, status: 2 } },
    generate: async () => { creates++; assert.ok(harnessResult.storage.has(harnessResult.session.prefix + 'generation')); throw new Error('timeout') },
  })
  const body = { canvasId: 7, revisionNo: 2, nodeId: 'g-1', operation: 'imageGenerate', clientRequestId: 'generate-stable' }
  await assert.rejects(harnessResult.session.submit(body), /timeout/)
  assert.equal((await harnessResult.session.recover()).generationId, 90)
  assert.equal(creates, 1)
  assert.equal(harnessResult.session.pendingGeneration, null)
})

test('submission not found resends original create parameters, never retry', async () => {
  const calls = []
  const { session } = harness({ submission: async () => { throw Object.assign(new Error('missing'), { errorCode: 'CANVAS_SUBMISSION_NOT_FOUND' }) }, generate: async (body) => { calls.push(JSON.stringify(body)); if (calls.length === 1) throw new Error('timeout'); return { generationId: 6 } } })
  await assert.rejects(session.submit({ canvasId: 7, revisionNo: 2, nodeId: 'g-1', operation: 'imageGenerate', clientRequestId: 'same' }), /timeout/)
  await session.recover()
  assert.equal(calls[0], calls[1])
})

test('storage failure prevents a billable request', async () => {
  let requests = 0
  const { session, window } = harness({ submission: async () => { requests++ }, generate: async () => { requests++ } })
  window.localStorage.setItem = () => { throw new Error('quota') }
  await assert.rejects(session.submit({ clientRequestId: 'x' }), /quota/)
  assert.equal(requests, 0)
})

test('same image used in multiple fields uploads once and binds each location', async () => {
  let uploads = 0
  const { session } = harness({ upload: async () => { uploads++; return { assetId: 50 } } }, fixture(), { fetch: async () => ({ ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) }) })
  const result = await session.prepare({ ...fixture().project, nodes: [node('ref', 'input-image', 'blob:local'), node('gen', 'gen-image', null, { model: 'studio-9', referenceImages: ['blob:local', 'blob:local'] })] })
  assert.equal(uploads, 1)
  assert.equal(result.assetBindings.length, 3)
})

test('uncertain upload reconciles list by unique name and size without uploading again', async () => {
  let uploads = 0, uploadedFile
  const { session } = harness({ upload: async (_id, file) => { uploads++; uploadedFile = file; throw new Error('timeout') }, assets: async () => ({ items: [{ assetId: 88, name: uploadedFile.name, sizeBytes: uploadedFile.size }], total: 1 }) }, fixture(), { fetch: async () => ({ ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) }) })
  await assert.rejects(session.upload('blob:x'), /timeout/)
  assert.equal((await session.upload('blob:x')).assetId, 88)
  assert.equal(uploads, 1)
})

test('API retains stable business errors even on HTTP 502 and uses multipart form data', async () => {
  const calls = []
  let fail = true
  const { StudioCanvases } = load('../src/services/studioCanvases.ts', {
    './generated': { OpenAPI: {} }, './generated/core/request': { request: async (_config, options) => { calls.push(options); if (fail) throw { status: 502, body: { message: 'conflict', data: { errorCode: 'CANVAS_REVISION_CONFLICT' } } }; return { code: 200, data: { assetId: 8 } } }, getHeaders: async () => ({}) },
  })
  await assert.rejects(StudioCanvases.save({}), (error) => error.errorCode === 'CANVAS_REVISION_CONFLICT')
  fail = false
  await StudioCanvases.upload(7, new File(['x'], 'x.png'))
  assert.equal(calls[1].mediaType, undefined)
  assert.equal(calls[1].formData.canvasId, 7)
})

test('model catalog uses actual backend IDs and capability field names read by the editor', () => {
  const { canvasModelConfigs } = harness()
  const config = canvasModelConfigs(models)[0]
  assert.equal(config.id, 'studio-9')
  assert.equal(config.ratioLimits[0], '16:9')
  assert.equal(config.resolutionLimits[1], '2K')
})

test('HTTP validation failure permits a corrected save with a new request ID', async () => {
  const calls = []
  const { session } = harness({ save: async (body) => {
    calls.push(JSON.parse(JSON.stringify(body)))
    if (calls.length === 1) throw Object.assign(new Error('invalid dimensions'), { status: 422 })
    return { ...body, revisionNo: 3, currentRevisionNo: 3 }
  } })
  await assert.rejects(session.save(fixture().project), /invalid dimensions/)
  assert.equal(session.pendingSave, null)
  await session.save({ ...fixture().project, projectName: 'corrected' })
  assert.notEqual(calls[0].clientSaveId, calls[1].clientSaveId)
  assert.equal(calls[1].project.projectName, 'corrected')
})

test('a draft from an older revision restores locally but blocks cloud overwrite', async () => {
  let saves = 0
  const { session } = harness({ save: async () => { saves++ } })
  const draft = await session.draft(fixture().project)
  assert.equal(draft.baseRevisionNo, 2)
  session.revision = 3
  const restored = await session.restoreDraft(draft)
  assert.equal(restored.projectName, '测试')
  await assert.rejects(session.save(restored), /修订发生冲突/)
  assert.equal(saves, 0)
})

test('a same-revision draft does not unnecessarily block saving', async () => {
  const { session } = harness()
  await session.restoreDraft(await session.draft(fixture().project))
  assert.equal(session.blocked, false)
})

test('definitively rejected upload allows the user to retry instead of polling forever', async () => {
  let uploads = 0
  const { session } = harness({ upload: async () => { uploads++; if (uploads === 1) throw Object.assign(new Error('validation'), { status: 422 }); return { assetId: 19 } } }, fixture(), { fetch: async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) }) })
  await assert.rejects(session.upload('blob:x'), /validation/)
  assert.equal((await session.upload('blob:x')).assetId, 19)
  assert.equal(uploads, 2)
})

test('definitively rejected generation clears pending submission but network failure retains it', async () => {
  const { session } = harness({ submission: async () => { throw Object.assign(new Error('missing'), { errorCode: 'CANVAS_SUBMISSION_NOT_FOUND' }) }, generate: async () => { throw Object.assign(new Error('validation'), { status: 422 }) } })
  await assert.rejects(session.submit({ clientRequestId: 'bad' }), /validation/)
  assert.equal(session.pendingGeneration, null)
})

test('API exposes HTTP status for recoverable validation failures', async () => {
  const { StudioCanvases } = load('../src/services/studioCanvases.ts', {
    './generated': { OpenAPI: {} }, './generated/core/request': { request: async () => { throw { status: 422, body: { message: 'invalid input' } } }, getHeaders: async () => ({}) },
  })
  await assert.rejects(StudioCanvases.save({}), (error) => error.status === 422)
})

test('node IDs that resemble cached media keys remain unchanged', async () => {
  const { session } = harness()
  const result = await session.prepare({ ...fixture().project, nodes: [node('img_user-defined-id', 'input-image', null)] })
  assert.equal(result.project.nodes[0].id, 'img_user-defined-id')
  assert.equal(result.assetBindings.length, 0)
})

test('request IDs work on HTTP LAN pages without crypto.randomUUID', () => {
  const { canvasRequestId } = load('../src/services/studioCanvases.ts', {
    './generated': { OpenAPI: {} }, './generated/core/request': { request: async () => {}, getHeaders: async () => ({}) },
  }, { crypto: { getRandomValues: (array) => array.fill(9) }, Uint8Array })
  assert.match(canvasRequestId('save'), /^save-[a-f0-9]{32}$/)
})
