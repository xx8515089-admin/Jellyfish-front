import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { webcrypto } from 'node:crypto'
import { File } from 'node:buffer'
function load(file, imports, globals = {}) {
 const exports = {}
 const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
 vm.runInNewContext(code, { exports, Blob, File, Headers, crypto: webcrypto, setTimeout, ...globals, require: name => { assert.ok(name in imports, name); return imports[name] } })
 return exports
}
const ok = data => ({ code: 200, message: 'ok', data })
const limits = { maxTextBytes: 100, maxRows: 5, maxFileBytes: 10, maxFiles: 2, maxBatchBytes: 15 }
function session(api) { return load('../src/pages/aiStudio/assets/components/assetImportSession.ts', { '../../../../services/assetImportGenerated': { AssetImportsService: { getImportTemplate: async () => ok({ limits }), ...api } } }).AssetImportSession }

test('generated eight routes place batchId in query, JSON or multipart, never URL path', async () => {
 const calls = []
 const { AssetImportsService: api } = load('../src/services/assetImportGenerated/services/AssetImportsService.ts', { '../core/OpenAPI': { OpenAPI: {} }, '../core/request': { request: async (_, options) => { calls.push(options); return ok({}) } } })
 await api.getImportTemplate({ format: 'tsv' })
 await api.createImportBatch({ idempotencyKey: 'create', requestBody: { source: 'manifest', content: 'x' } })
 await api.uploadImportFile({ idempotencyKey: 'file', formData: { batchId: 'imp_one', clientItemId: '1', file: new File(['x'], 'x.png') } })
 await api.previewImportBatch({ requestBody: { batchId: 'imp_one', revision: 2 } })
 await api.commitImportBatch({ idempotencyKey: 'commit', requestBody: { batchId: 'imp_one', revision: 2, previewToken: 'opaque' } })
 await api.getImportBatch({ batchId: 'imp_one' })
 await api.listImportItems({ batchId: 'imp_one', page: 2, pageSize: 100 })
 await api.retryImportBatch({ idempotencyKey: 'retry', requestBody: { batchId: 'imp_one', itemIds: ['item1'] } })
 assert.deepEqual(calls.map(item => item.url.split('/assetLibrary/')[1]), ['importTemplate','importBatches','importBatches/files','importBatches/preview','importBatches/commit','importBatches/detail','importBatches/items','importBatches/retry'])
 assert.equal(calls[2].formData.batchId, 'imp_one')
 for(const index of [3,4,7]) assert.equal(calls[index].body.batchId, 'imp_one')
 for(const index of [5,6]) assert.equal(calls[index].query.batchId, 'imp_one')
 assert.ok(calls.every(item => !item.path))
 assert.equal(calls[4].headers['Idempotency-Key'], 'commit')
})
test('dynamic byte/count limits reject input before creating business batches', async () => {
 let creates = 0
 const Session = session({ createImportBatch: async () => { creates++; return ok({ batchId: 'one' }) } })
 const s = new Session()
 await assert.rejects(s.prepare({ source: 'manifest', content: '字'.repeat(40) }), /限额/)
 await assert.rejects(s.prepare({ source: 'images', defaultAssetType: 1, items: [{ size: 11 }] }), /限额/)
 await assert.rejects(s.prepare({ source: 'images', defaultAssetType: 1, items: [{ size: 8 }, { size: 8 }] }), /限额/)
 assert.equal(creates, 0)
})
test('uncertain upload uses same key; changed bytes under same clientItemId require new draft', async () => {
 const uploads = []
 const Session = session({ createImportBatch: async () => ok({ batchId: 'one', revision: 1 }), uploadImportFile: async body => { uploads.push(body); if (uploads.length === 1) throw new Error('lost'); return ok({ revision: 3 }) } })
 const s = new Session()
 await s.prepare({ source: 'images', defaultAssetType: 1, items: [{ clientItemId: 'item', fileName: 'a.png', size: 1 }] })
 await assert.rejects(s.upload('item', new File(['a'], 'a.png')), /lost/)
 await assert.rejects(s.upload('item', new File(['b'], 'a.png')), /重建/)
 await s.upload('item', new File(['a'], 'a.png'))
 assert.equal(uploads[0].idempotencyKey, uploads[1].idempotencyKey)
 assert.equal(uploads[1].formData.batchId, 'one'); assert.equal(s.batch.revision, 3)
})
test('nonretryable target changes never call retry endpoint', async () => {
 let retries = 0
 const Session = session({ listImportItems: async () => ok({ items: [{ itemId: 'x', status: 'failed', retryable: false }], total: 1 }), retryImportBatch: async () => { retries++ } })
 const s = new Session(); s.batch = { batchId: 'one' }
 await assert.rejects(s.retry(['x']), /可重试/)
 assert.equal(retries, 0)
})
test('transport preserves 429 headers and backs off before repeating requests', async () => {
 let sends = 0
 class Cancellable extends Promise { constructor(executor) { super((resolve, reject) => executor(resolve, reject, Object.assign(() => {}, { isCancelled: false }))) } }
 const { request } = load('../src/services/assetImportTransport.ts', {
 './generated/core/CancelablePromise': { CancelablePromise: Cancellable },
 '../config/api': { joinApiBasePath: (base, path) => base + path },
 './generated/core/request': { getHeaders: async () => new Headers({ Authorization: 'raw-token', language: 'zh' }), getQueryString: () => '', getRequestBody: () => undefined, getFormData: () => undefined,
 sendRequest: async (_, __, url, ___, ____, headers) => { sends++; assert.match(url, /^\/jellyfish\/api/); assert.equal(headers.get('Authorization'), 'raw-token'); return new Response(JSON.stringify({ message: 'slow down', errorCode: 'RATE_LIMITED', data: { errorCode: 'RATE_LIMITED' } }), { status: 429, headers: { 'Retry-After': '3' } }) } },
 })
 for(let i=0;i<2;i++) await assert.rejects(request({ BASE: '/jellyfish' }, { method: 'GET', url: '/api/test' }), error => error.status === 429 && error.retryAfterMs > 2000)
 assert.equal(sends, 1)
})
