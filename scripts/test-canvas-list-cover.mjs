import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(path, imports, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText
  vm.runInNewContext(code, {
    exports, Headers, URLSearchParams, FormData, Blob, ...globals,
    require(name) {
      assert.ok(name in imports, name)
      return imports[name]
    },
  })
  return exports
}

test('canvas list preserves private cover fields without requesting details or assets', async () => {
  const cover = { coverAssetId: 103, coverFileId: 206, coverUrl: null, coverType: 'video',
    coverContentUrl: '/api/v1/studio/canvases/assets/content?canvasId=501&assetId=103' }
  const { listCanvasWorkspaces } = load('src/pages/canvas/canvasWorkspaces.ts', {
    './TapnowStudio/canvasOperationLock': {},
    './canvasCache': {},
    '../../services/studioCanvases': { StudioCanvases: {
      capabilities: async () => ({ storageReady: true }),
      list: async () => ({ total: 2, items: [
        { canvasId: 501, name: 'private', revisionNo: 1, ...cover },
        { canvasId: 502, name: 'legacy', revisionNo: 1 },
      ] }),
    } },
  }, { window: { localStorage: { getItem: () => null } } })
  const items = await listCanvasWorkspaces()
  for (const [key, value] of Object.entries(cover)) assert.equal(items[0][key], value)
  assert.equal(items[0].id, '501')
  assert.equal(items[1].coverUrl, undefined)
})

test('protected media uses login headers and propagates cancellation without URL credentials', async () => {
  const controller = new AbortController()
  const { StudioCanvases } = load('src/services/studioCanvases.ts', {
    '../auth': { getStoredAuthUser: () => ({ id: 42 }) },
    './generated': { OpenAPI: { BASE: 'https://backend.test' } },
    './generated/core/request': { getHeaders: async () => new Headers({ Authorization: 'Bearer test-session' }) },
  }, { fetch: async (url, options) => {
    assert.equal(url, 'https://backend.test/api/v1/studio/canvases/assets/content?canvasId=501&assetId=103')
    assert.equal(options.headers.get('Authorization'), 'Bearer test-session')
    assert.equal(options.signal, controller.signal)
    return { ok: true, blob: async () => new Blob(['media']) }
  } })
  const blob = await StudioCanvases.content(501, 103, false, controller.signal)
  assert.equal(await blob.text(), 'media')
})
