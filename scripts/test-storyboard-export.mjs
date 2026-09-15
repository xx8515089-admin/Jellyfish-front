import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function setup(responses = []) {
  const exports = {}; const calls = []; const saved = []
  const source = readFileSync(new URL('../src/services/storyboardExport.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, Response, Blob, Uint8Array, DOMException,
    require: (name) => name.includes('auth') ? { getAuthToken: () => 'token', getStoredAuthUser: () => ({ id: 1 }), clearAuthSession: () => {} } : name.includes('config') ? { apiBaseUrl: '/jellyfish', joinApiBasePath: (base, path) => base + path } : { OpenAPI: { BASE: '/jellyfish' } },
    fetch: async (url, options) => { calls.push({ url, ...options, body: JSON.parse(options.body) }); return responses.shift() },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    document: { createElement: () => ({ click() { saved.push(this.download) }, remove() {} }), body: { appendChild() {} } },
    window: { setTimeout: () => {}, location: { assign() {} } },
  })
  return { api: exports, calls, saved }
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const base = { scriptImportId: 1, dimension: 'episode', scope: 'all', content: 'media' }
const choices = [
  { segmentId: 11, generationId: 112, mediaType: 'image', episodeId: 101, episodeIndex: 1, segmentIndex: 1 },
  { segmentId: 12, generationId: 112, mediaType: 'video', episodeId: 101, episodeIndex: 1, segmentIndex: 2 },
  { segmentId: 21, generationId: 113, mediaType: 'video', episodeId: 102, episodeIndex: 2, segmentIndex: 1 },
]
const plain = (value) => JSON.parse(JSON.stringify(value))
test('filters by episode/segment ordinal and never confuses record IDs with indices', () => {
  const { api } = setup()
  const request = api.buildExportRequest({ ...base, dimension: 'segment', episodeId: 101, scope: 'custom', start: 2, end: 2 }, choices)
  assert.deepEqual(plain(request.mediaSelections), [{ segmentId: 12, generationId: 112, mediaType: 'video' }])
  assert.equal(choices.length, 3)
  const episodes = api.buildExportRequest({ ...base, scope: 'custom', start: 1, end: 1 }, choices)
  assert.equal(episodes.mediaSelections.length, 2)
})
test('audio omits media selections and all omits stale range and episode fields', () => {
  const { api } = setup()
  assert.deepEqual(plain(api.buildExportRequest({ ...base, content: 'audio', episodeId: 101, start: 1, end: 2 }, choices)), { ...base, content: 'audio' })
})
test('rejects reversed, fractional and unsafe ranges or IDs', () => {
  const { api } = setup()
  for (const id of [0, -1, 1.5, '9007199254740993']) assert.throws(() => api.buildExportRequest({ ...base, scriptImportId: id }, []))
  assert.throws(() => api.buildExportRequest({ ...base, scope: 'custom', start: 2, end: 1 }, []))
})
test('failed preview never downloads and retains detailed business problems', async () => {
  const problems = [{ code: 'NO_SEGMENTS', message: '第3集没有片段' }]
  const { api, calls, saved } = setup([json({ code: 200, data: { canExport: false, message: '素材缺失', problems } })])
  await assert.rejects(api.downloadStoryboardZip(base, new AbortController().signal, () => {}), (error) => error.message === '素材缺失' && error.problems.length === 1)
  assert.equal(calls.length, 1); assert.equal(saved.length, 0)
})
test('freezes both explicitly selected image and default video before downloading UTF-8 ZIP', async () => {
  const preview = { canExport: true, totalBytes: 5, fileName: 'fallback.zip', items: [{ segmentId: 11, generationId: 112, mediaType: 'image' }, { segmentId: 12, generationId: 112, mediaType: 'video' }, { segmentId: 12, generationId: 99, mediaType: 'audio' }] }
  const { api, calls, saved } = setup([json({ code: 200, data: preview }), new Response('zip', { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': "attachment; filename*=UTF-8''%E7%B4%A0%E6%9D%90.zip" } })])
  await api.downloadStoryboardZip({ ...base, content: 'mixed' }, new AbortController().signal, () => {})
  assert.deepEqual(plain(calls[1].body.mediaSelections), preview.items.slice(0, 2))
  assert.equal(calls[0].url, '/jellyfish/api/v1/studio/storyboards/exports/preview')
  assert.equal(calls[0].headers.Authorization, 'token')
  assert.deepEqual(saved, ['素材.zip'])
})
test('ZIP business JSON is never saved as a file', async () => {
  const { api, saved } = setup([json({ code: 200, data: { canExport: true, totalBytes: 5, items: [] } }), json({ code: 502, message: '所选图片失效' }, 502)])
  await assert.rejects(api.downloadStoryboardZip(base, new AbortController().signal, () => {}), /所选图片失效/)
  assert.equal(saved.length, 0)
})
test('oversized export stops before requesting ZIP', async () => {
  const { api, calls } = setup([json({ code: 200, data: { canExport: true, totalBytes: 300 * 1024 * 1024 } })])
  await assert.rejects(api.downloadStoryboardZip(base, new AbortController().signal, () => {}), /256 MiB/)
  assert.equal(calls.length, 1)
})
