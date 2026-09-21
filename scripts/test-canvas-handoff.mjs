import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { withCanvasOperationLock } from './canvas-test-transport.mjs'

function load(path, imports, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, { exports, Headers, FormData, URLSearchParams, URL, Blob, Map, console, ...globals, require: name => { assert.ok(name in imports, name); return imports[name] } })
  return exports
}
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers })
function transport(fetch, extra = {}) {
  return load('../src/services/studioCanvases.ts', {
    './generated': { OpenAPI: {} }, './generated/core/request': { getHeaders: async () => ({ Authorization: 'Bearer test' }) },
    '../auth': { getStoredAuthUser: () => ({ id: 42 }) }, ...extra,
  }, { fetch })
}
const plain = value => JSON.parse(JSON.stringify(value))
const document = () => ({ canvasId: 7, revisionNo: 2, currentRevisionNo: 2, project: { nodes: [], connections: [], view: { x: 0, y: 0, zoom: 1 } }, assetBindings: [], modelBindings: [] })
function session(api = {}, doc = document(), options = {}) {
  const values = new Map()
  const auth = { id: 42 }
  const window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }
  let seq = 0
  const { CanvasCloudSession } = load('../src/pages/canvas/TapnowStudio/canvasCloud.js', {
    './canvasOperationLock': { withCanvasOperationLock }, '../../../auth': { getStoredAuthUser: () => auth },
    '../../../services/studioCanvases': { StudioCanvases: api, canvasRequestId: kind => kind + '-' + ++seq },
  }, { window })
  return { session: new CanvasCloudSession(doc, [], value => value, options), values, auth }
}

test('all HTTP failures retain status, structured data, headers and conservative state', async () => {
  for (const status of [401, 403, 404, 410, 413, 422, 429, 503]) {
    const api = transport(async () => json({ code: 502, message: 'failure', data: { errorCode: 'CANVAS_SUBMISSION_NOT_FOUND', nodeId: 'n', shotId: '01', fieldPath: '/settings/model', retryable: false } }, status, { 'Retry-After': '2' }))
    await assert.rejects(api.StudioCanvases.submission(7, 'original'), error => {
      assert.equal(error.status, status); assert.equal(error.envelopeCode, 502)
      assert.equal(error.submissionState, 'unknown'); assert.equal(error.data.shotId, '01')
      assert.equal(error.headers.get('Retry-After'), '2'); assert.equal(error.retryAfterMs, 2000)
      return true
    })
  }
})
test('business envelope 502 is not an HTTP gateway response; HTML has unknown outcome', async () => {
  const api = transport(async () => json({ code: 502, data: { submissionState: 'notAccepted' } }))
  await assert.rejects(api.StudioCanvases.generate({}), error => error.status === 200 && error.envelopeCode === 502 && error.submissionState === 'notAccepted')
  const html = transport(async () => new Response('<html>gateway</html>', { status: 503 }))
  await assert.rejects(html.StudioCanvases.submission(7, 'original'), error => error.submissionState === 'unknown')
})
test('57001 millisecond throttle takes precedence over Retry-After and prevents immediate network retry', async () => {
  let calls = 0
  const api = transport(async () => { calls++; return json({ code: 502, data: { retryAfterMs: 57001, submissionState: 'unknown' } }, 429, { 'Retry-After': '90' }) })
  await assert.rejects(api.StudioCanvases.generations(7), error => error.retryAfterMs === 57001)
  await assert.rejects(api.StudioCanvases.generations(7), error => error.retryAfterMs > 55000)
  assert.equal(calls, 1)
  assert.equal(api.canvasRetryAfter(undefined, new Headers({ 'Retry-After': 'Wed, 21 Oct 2015 07:28:00 GMT' }), Date.parse('Wed, 21 Oct 2015 07:27:00 GMT')), 60000)
})
test('account switching while headers resolve prevents a request under the new login', async () => {
  let id = 42, calls = 0
  const api = transport(async () => { calls++; return json({ code: 200, data: {} }) }, {
    '../auth': { getStoredAuthUser: () => ({ id }) }, './generated/core/request': { getHeaders: async () => { id = 43; return {} } },
  })
  await assert.rejects(api.StudioCanvases.generate({}), /账户已变化/)
  assert.equal(calls, 0)
})
test('unknown 422 and misleading NOT_FOUND retain original generation and never replay', async () => {
  let creates = 0
  const h = session({ generate: async () => { creates++; throw Object.assign(new Error('lost'), { status: 422 }) }, submission: async () => { throw Object.assign(new Error('unknown'), { errorCode: 'CANVAS_SUBMISSION_NOT_FOUND', submissionState: 'unknown' }) } })
  const body = { canvasId: 7, clientRequestId: 'original' }
  await assert.rejects(h.session.submit(body))
  await assert.rejects(h.session.recover())
  assert.deepEqual(plain(h.session.read('generation').body), body); assert.equal(creates, 1)
  h.auth.id = 43
  await assert.rejects(h.session.recover(), /账户已变化/)
  assert.equal(creates, 1)
})
test('missing media is local, all analysis frame occurrences get markers and original bindings survive save preparation', async () => {
  const api = transport(async url => url.includes('assetId=55') ? json({ code: 502, data: { errorCode: 'CANVAS_ASSET_NOT_FOUND' } }, 404) : new Response(new Blob(['image'])))
  const doc = document()
  doc.project.nodes = [{ id: 'missing', type: 'input-image', content: null, settings: {} }, { id: 'ok', type: 'input-image', content: null, settings: {} }, { id: 'analysis', type: 'video-analysis', settings: { analysisResultData: { scenes: [{ keyframes: [{ assetId: 55 }, { assetId: 55 }] }] } } }]
  doc.assetBindings = [{ nodeId: 'missing', fieldPath: '/content', assetId: 55 }, { nodeId: 'ok', fieldPath: '/content', assetId: 56 }]
  doc.assetIssues = [{ nodeId: null, fieldPath: 'analysisKeyframe', assetId: 55, errorCode: 'CANVAS_ASSET_NOT_FOUND' }]
  const urls = []
  const hydrated = await api.hydrateCanvasDocument(doc, urls)
  assert.match(hydrated.project.nodes[0].content, /^canvas-asset:/)
  assert.match(hydrated.project.nodes[1].content, /^blob:/)
  assert.ok(hydrated.project.nodes[2].settings.analysisResultData.scenes[0].keyframes.every(frame => frame.url.startsWith('canvas-asset:')))
  const h = session({}, hydrated)
  const saved = await h.session.prepare(hydrated.project)
  assert.equal(saved.assetBindings.find(binding => binding.nodeId === 'missing').assetId, 55)
  assert.equal(saved.project.nodes[0].content, null)
  assert.equal(saved.project.nodes[2].settings.analysisResultData.scenes[0].keyframes[0].url, undefined)
  urls.forEach(URL.revokeObjectURL)
})
test('historical unavailable models remain saveable, but a new generation cannot use them', async () => {
  const doc = document()
  doc.project.nodes = [{ id: 'n', type: 'gen-image', settings: { model: 'studio-9', prompt: 'edited prose' } }]
  doc.modelBindings = [{ nodeId: 'n', fieldPath: '/settings/model', modelId: 9, operation: 'imageGenerate' }]
  const h = session({}, doc)
  const saved = await h.session.prepare(doc.project)
  assert.equal(saved.modelBindings[0].modelId, 9)
  assert.throws(() => h.session.assertGenerationModel({ nodeId: 'n', operation: 'imageGenerate' }))
})
test('media capability blocks new generation without blocking text document saves', async () => {
  let creates = 0, saves = 0
  const doc = document()
  const h = session({ generate: async () => { creates++ }, save: async () => { saves++; return { ...doc, revisionNo: 3, currentRevisionNo: 3 } } }, doc, { capabilities: { mediaWriteReady: false } })
  await assert.rejects(h.session.submit({}), /媒体写入暂不可用/)
  await h.session.save(doc.project)
  assert.equal(creates, 0); assert.equal(saves, 1)
})
test('late deleted save receipt archives original request and blocks all new writes', async () => {
  const doc = document()
  const h = session({ save: async () => ({ ...doc, revisionNo: 3, currentRevisionNo: 3, deleted: true }) }, doc)
  await assert.rejects(h.session.save(doc.project), /画布已删除/)
  assert.equal(h.session.read('save'), null)
  assert.ok([...h.values.keys()].some(key => key.includes('request-history:save:')))
  assert.throws(() => h.session.write('draft', {}), /画布已删除/)
})
test('admin review uses business taskRef and leaves array history intact', async () => {
  const requests = []
  const api = transport(async (url, init) => { requests.push({ url, body: init.body && JSON.parse(init.body) }); return json({ code: 200, data: url.includes('/history') ? [{ state: 'open' }] : {} }) })
  const history = await api.StudioCanvases.reviewHistory('execution', 71)
  assert.ok(Array.isArray(history))
  const body = { family: 'execution', taskRef: 71, clientRequestId: 'review-original', state: 'resolved', reason: 'verified', evidenceRef: 'evidence-1' }
  await api.StudioCanvases.reviewRecord(body)
  assert.match(requests[0].url, /taskRef=71/)
  assert.deepEqual(requests[1].body, body)
})
test('concurrent same-action submissions acquire only one operation lock', async () => {
  let release
  const first = withCanvasOperationLock('handoff-double-click', () => new Promise(resolve => { release = resolve }))
  await assert.rejects(withCanvasOperationLock('handoff-double-click', () => assert.fail('duplicate request')))
  release(); await first
  assert.equal(await withCanvasOperationLock('handoff-double-click', async () => 'next'), 'next')
})

test('copy timeout replays original name and revision even after user inputs change', async () => {
  const requests = []
  const h = session({ copy: async (...args) => { requests.push(args); if (requests.length === 1) throw new Error('offline'); return { ...document(), canvasId: 99 } } })
  await assert.rejects(h.session.projectOperation('copy', { canvasId: 7, sourceRevisionNo: 2, name: 'original' }))
  const result = await h.session.projectOperation('copy', { canvasId: 7, sourceRevisionNo: 3, name: 'changed' })
  assert.deepEqual(requests[0], requests[1]); assert.equal(result.canvasId, 99)
  assert.equal(h.session.read('project:copy'), null)
})
test('local preview retry restores only markers and registers their original asset identity', async () => {
  const doc = document()
  doc.project.nodes = [{ id: 'n', type: 'input-image', content: 'canvas-asset:7:55:9' }]
  doc.assetBindings = [{ nodeId: 'n', fieldPath: '/content', assetId: 55, sourceLinkId: 9 }]
  const h = session({ content: async (canvasId, assetId) => { assert.equal(canvasId, '7'); assert.equal(assetId, '55'); return new Blob(['image']) } }, doc)
  const result = await h.session.retryNodeAssets(doc.project.nodes[0])
  const url = result.replacements.get('canvas-asset:7:55:9')
  assert.match(url, /^blob:/)
  assert.equal(h.session.media.get(url).sourceLinkId, '9')
  assert.equal(doc.project.nodes[0].content, 'canvas-asset:7:55:9')
  URL.revokeObjectURL(url)
})
