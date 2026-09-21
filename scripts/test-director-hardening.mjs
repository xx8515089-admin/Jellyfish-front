import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { webcrypto } from 'node:crypto'
import { File } from 'node:buffer'
import { withCanvasOperationLock } from '../src/pages/canvas/TapnowStudio/canvasOperationLock.js'

function load(path, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, { exports, Blob, File, structuredClone, TextDecoder, crypto: webcrypto, ...globals, require: name => { assert.ok(name in imports, name); return imports[name] } })
  return exports
}
const plain = value => JSON.parse(JSON.stringify(value))
const hash = async blob => Buffer.from(await webcrypto.subtle.digest('SHA-256', await blob.arrayBuffer())).toString('hex')
function publications(api, values = new Map(), user = { id: 42 }) {
  const window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }
  return { ...load('../src/pages/directorDesk/directorPublication.ts', {
    '../../auth': { getStoredAuthUser: () => user }, '../../services/studioDirectorDesks': { StudioDirectorDesks: api }, '../canvas/TapnowStudio/canvasOperationLock': { withCanvasOperationLock },
  }, { window }), values, user }
}
const receipt = { desk: { id: 12, revisionNo: 4, latestRevisionNo: 6, deleted: true }, draft: { hasDraft: true, draftRevisionNo: 9, project: { newer: true } } }

test('lost publication survives reload; NOT_FOUND does not republish or change original versions', async () => {
  const calls = []
  const api = {
    publishDraft: async (...args) => { calls.push(args); if (calls.length === 1) throw new Error('offline'); return receipt },
    publication: async () => { throw Object.assign(new Error('not found'), { errorCode: 'DIRECTOR_PUBLICATION_NOT_FOUND' }) },
  }
  const first = publications(api)
  await assert.rejects(first.publishDirectorDraft(12, 5, 3), /offline/)
  const reload = publications(api, first.values)
  await assert.rejects(reload.recoverDirectorPublication(12), /not found/)
  assert.equal(calls.length, 1)
  await assert.rejects(reload.publishDirectorDraft(12, 9, 6), /待确认/)
  assert.equal(await reload.recoverDirectorPublication(12, true), receipt)
  assert.deepEqual(calls[0], calls[1])
  assert.equal(calls[1][1], 5); assert.equal(calls[1][2], 3)
  assert.match(calls[1][3], /^publish-[a-f0-9]{32}$/)
  assert.equal(reload.hasPendingDirectorPublication(12), false)
  assert.ok([...first.values.keys()].some(key => key.includes(':history:')))
  assert.equal(receipt.draft.project.newer, true)
})
test('read-only recovery returns historical/deleted publication and current draft without performing writes', async () => {
  let writes = 0, reads = 0
  const api = { publishDraft: async () => { writes++; throw new Error('lost') }, publication: async () => { reads++; return receipt } }
  const h = publications(api)
  await assert.rejects(h.publishDirectorDraft(12, 5, 3))
  assert.equal(await h.recoverDirectorPublication(12), receipt)
  assert.equal(writes, 1); assert.equal(reads, 1)
})
test('publication forbids account switch cleanup and keeps original account queue', async () => {
  const user = { id: 42 }
  const h = publications({ publishDraft: async () => { user.id = 43; return receipt } }, new Map(), user)
  await assert.rejects(h.publishDirectorDraft(12, 5, 3), /账户已变化/)
  assert.equal(h.hasPendingDirectorPublication(12), false)
  user.id = 42; assert.equal(h.hasPendingDirectorPublication(12), true)
})
test('new failed validation can be corrected, but a replay conflict never discards the original ID', async () => {
  const rejected = Object.assign(new Error('conflict'), { errorCode: 'DIRECTOR_DRAFT_REVISION_CONFLICT' })
  const h = publications({ publishDraft: async () => { throw rejected } })
  await assert.rejects(h.publishDirectorDraft(12, 5, 3)); assert.equal(h.hasPendingDirectorPublication(12), false)
  const queued = publications({ publishDraft: async () => { throw new Error('offline') } })
  await assert.rejects(queued.publishDirectorDraft(12, 5, 3))
  const reload = publications({ publishDraft: async () => { throw rejected } }, queued.values)
  await assert.rejects(reload.recoverDirectorPublication(12, true)); assert.equal(reload.hasPendingDirectorPublication(12), true)
})
test('structured errors retain HTTP status, errorCode, fieldPath and revision without parsing Chinese', async () => {
  for (const status of [200, 413, 422, 503]) {
    const body = { code: 502, message: 'structured failure', data: { errorCode: 'DIRECTOR_DRAFT_REVISION_CONFLICT', fieldPath: 'expectedDraftRevisionNo', currentRevisionNo: 6 } }
    const { StudioDirectorDesks: api } = load('../src/services/studioDirectorDesks.ts', { './generated': { OpenAPI: {} }, './generated/core/request': { request: async () => { if (status === 200) return body; throw { status, body } } } })
    await assert.rejects(api.publishDraft(12, 5, 3, 'stable'), error => {
      assert.equal(error.status, status); assert.equal(error.errorCode, body.data.errorCode)
      assert.equal(error.fieldPath, 'expectedDraftRevisionNo'); assert.equal(error.currentRevisionNo, 6); return true
    })
  }
})
test('API passes package identity and publication identity unchanged', async () => {
  const calls = []
  const { StudioDirectorDesks: api } = load('../src/services/studioDirectorDesks.ts', { './generated': { OpenAPI: {} }, './generated/core/request': { request: async (_, options) => { calls.push(options); return { code: 200, data: {} } } } })
  await api.uploadAsset(12, new File(['x'], 'a.fbx'), 'models/a.fbx', 'package-1')
  await api.publishDraft(12, 5, 3, 'publish-original')
  await api.publication(12, 'publish-original')
  assert.equal(calls[0].formData.packageId, 'package-1')
  assert.equal(calls[1].body.clientRequestId, 'publish-original')
  assert.equal(calls[2].method, 'GET'); assert.equal(calls[2].query.clientRequestId, 'publish-original')
})
function assets(api, blobs = new Map(), registered = []) {
  return load('../src/pages/directorDesk/directorCloudAssets.ts', {
    '../../services/studioDirectorDesks': { StudioDirectorDesks: api },
    './runtime/editor/loaders/cloudAssetRuntime': { registerCloudPackage: (key, files) => registered.push({ key, files }) },
    './runtime/editor/loaders/localAssetBinaryStorage': { getStoredAssetKey: value => value, localAssetBinaryStorage: { read: async key => ({ blob: blobs.get(key) }) } },
  })
}
const project = () => ({ assets: [{ fileName: 'model.fbx', url: 'local-1', storageKey: 'local-1' }], animationAssets: [] })
test('upload lost response reuses package/path/bytes; changed content creates a new package', async () => {
  const calls = [], stored = new Map(), blobs = new Map([['local-1', new Blob(['model'])]])
  let lost = true
  const h = assets({ uploadAsset: async (id, file, path, packageId) => {
    const sha256 = await hash(file), key = packageId + ':' + path
    const item = stored.get(key) || { id: stored.size + 1, packageId, relativePath: path, sha256, byteSize: file.size }
    stored.set(key, item); calls.push({ packageId, path, sha256 })
    if (lost) { lost = false; throw new Error('lost response') }
    return item
  }, validateAssets: async (_, manifest) => ({ valid: true, files: manifest.map(entry => ({ assetFileId: entry.assetFileId, status: 'available' })) }) }, blobs)
  await assert.rejects(h.uploadProjectAssets(12, project(), []), /lost/)
  const saved = await h.uploadProjectAssets(12, project(), [])
  assert.deepEqual(calls[0], calls[1]); assert.equal(stored.size, 1)
  assert.equal(saved.assets[0].cloudFileId, 1)
  blobs.set('local-1', new Blob(['changed model']))
  const changed = await h.uploadProjectAssets(12, project(), [])
  assert.notEqual(saved.jellyfishCloudAssets[0].packageId, changed.jellyfishCloudAssets[0].packageId)
})
test('same relative path in separate packages restores into separate loader maps', async () => {
  const blobs = [new Blob(['a']), new Blob(['b'])]
  const files = await Promise.all(blobs.map(async (blob, index) => ({ id: index + 1, packageId: index ? 'legacy' : null, relativePath: 'model.fbx', byteSize: blob.size, sha256: await hash(blob) })))
  const registered = []
  const h = assets({ assets: async () => files, downloadAsset: async id => blobs[id - 1], validateAssets: async () => ({ valid: true, files: files.map(file => ({ assetFileId: file.id, status: 'available' })) }) }, new Map(), registered)
  await h.restoreCloudAssets({ id: 12, project: { assets: [], jellyfishCloudAssets: files.map(({ id, ...file }) => ({ ...file, assetFileId: id })) } })
  assert.equal(registered.length, 2)
  assert.notEqual(registered[0].key, registered[1].key)
  assert.equal(registered[0].files.length, 1); assert.equal(registered[1].files.length, 1)
})
test('server package mismatch and unverified dependencies stop restoration before registration', async () => {
  let valid = true
  const registered = [], blob = new Blob(['a'])
  const entry = { assetFileId: 1, packageId: 'wrong', relativePath: 'a.fbx', byteSize: 1, sha256: await hash(blob) }
  const h = assets({ assets: async () => [{ ...entry, id: 1, packageId: 'actual' }], validateAssets: async () => ({ valid, files: [{ assetFileId: 1, status: valid ? 'available' : 'invalidDependencies', message: 'FBX invalid dependencies' }] }) }, new Map(), registered)
  const desk = { id: 12, project: { assets: [], jellyfishCloudAssets: [entry] } }
  await assert.rejects(h.restoreCloudAssets(desk), /元数据不一致/)
  valid = false
  await assert.rejects(h.restoreCloudAssets(desk), /FBX invalid dependencies/)
  assert.equal(registered.length, 0)
})
test('copy keeps same-name package boundaries and remaps model IDs', async () => {
  const blob = new Blob(['same']), sha256 = await hash(blob), calls = []
  const h = assets({ downloadAsset: async () => blob, uploadAsset: async (id, file, path, packageId) => { calls.push(packageId); return { id: calls.length + 10, relativePath: path, packageId, byteSize: blob.size, sha256 } } })
  const input = { assets: [{ cloudFileId: 1 }, { cloudFileId: 2 }], jellyfishCloudAssets: ['one', 'two'].map((packageId, i) => ({ assetFileId: i + 1, packageId, relativePath: 'model.fbx', sha256, byteSize: blob.size })) }
  const copied = await h.copyCloudAssets(99, input)
  assert.deepEqual(calls, ['one', 'two']); assert.deepEqual(plain(copied.assets), [{ cloudFileId: 11 }, { cloudFileId: 12 }])
  assert.equal(input.assets[0].cloudFileId, 1)
})

test('model loaders cannot resolve a same-name dependency from another package', () => {
  class LoadingManager { setURLModifier(modifier) { this.modifier = modifier } }
  class Loader {}
  let sequence = 0
  const h = load('../src/pages/directorDesk/runtime/editor/loaders/cloudAssetRuntime.ts', { three: { LoadingManager, Loader, DefaultLoadingManager: {} } }, { URL: class extends URL { static createObjectURL() { return 'blob:asset-' + ++sequence } static revokeObjectURL() {} } })
  h.registerCloudPackage('12/a', [{ id: 1, path: 'model name.fbx', blob: new Blob() }, { id: 2, path: 'textures/shared.png', blob: new Blob() }])
  h.registerCloudPackage('12/b', [{ id: 3, path: 'model name.fbx', blob: new Blob() }, { id: 4, path: 'textures/shared.png', blob: new Blob() }])
  const a = h.cloudAssetUrl(1), b = h.cloudAssetUrl(3)
  const A = h.directorLoader(Loader, a), B = h.directorLoader(Loader, b)
  const first = new A(), second = new B()
  assert.match(a, /model%20name.fbx$/)
  assert.equal(first.manager.modifier(new URL('textures/shared.png', a).href), 'blob:asset-2')
  assert.equal(second.manager.modifier(new URL('textures/shared.png', b).href), 'blob:asset-4')
  assert.throws(() => first.manager.modifier(new URL('textures/shared.png', b).href), /缺少已验证依赖/)
})
