import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { File } from 'node:buffer'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { webcrypto } from 'node:crypto'

function load(path, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText
  vm.runInNewContext(code, { exports, Blob, File, structuredClone, fetch, ...globals, require(name) {
    if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`)
    return imports[name]
  } })
  return exports
}
const snapshot = () => ({ projectSchemaVersion: 1, project: { objects: [], cameras: [], activeCameraId: 'camera-2' }, viewSettings: { viewportAspectRatio: '16:9', finishedShotFov: null, cameraMotionProgress: 0.4 } })

test('upload uses the revision returned by saving the same captured snapshot', async () => {
  const calls = []
  const module = load('../src/pages/directorDesk/directorCloudUpload.ts', {
    '../../services/studioDirectorDesks': { StudioDirectorDesks: { upload: async (body) => { calls.push(body); return { fileId: 99 } } } },
  })
  const frame = { snapshot: snapshot(), file: new File(['png'], 'frame.png') }
  const result = await module.saveAndUploadDirectorFrame(frame, '101', async (value) => {
    assert.equal(value, frame.snapshot)
    assert.equal(calls.length, 0)
    return { id: 12, revisionNo: 8 }
  })
  assert.equal(calls[0].directorRevisionNo, 8)
  assert.equal(calls[0].directorDeskId, 12)
  assert.equal(calls[0].cameraId, 'camera-2')
  assert.equal(calls[0].captureProgress, 0.4)
  assert.equal(calls[0].file, frame.file)
  assert.equal(result.reference.fileId, 99)
})

test('a save conflict never uploads or automatically retries', async () => {
  let uploads = 0
  let saves = 0
  const module = load('../src/pages/directorDesk/directorCloudUpload.ts', {
    '../../services/studioDirectorDesks': { StudioDirectorDesks: { upload: async () => { uploads++ } } },
  })
  await assert.rejects(module.saveAndUploadDirectorFrame({ snapshot: snapshot(), file: new File([], 'x.png') }, '101', async () => { saves++; throw new Error('revision conflict') }), /revision conflict/)
  assert.equal(saves, 1)
  assert.equal(uploads, 0)
})

function captureHarness(exportFrame) {
  const listeners = new Set()
  let state = { ...snapshot().viewSettings, project: snapshot().project, cameraMotionPlaying: true }
  const update = (patch) => { const previous = state; state = { ...state, ...patch }; listeners.forEach((listener) => listener(state, previous)) }
  state.setCameraMotionPlaying = (value) => update({ cameraMotionPlaying: value })
  state.setCameraMotionProgress = (value) => update({ cameraMotionProgress: value })
  const module = load('../src/pages/directorDesk/directorCloudSnapshot.ts', {
    './runtime/editor/store/directorStore': { useDirectorStore: { getState: () => state, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) } } },
    './runtime/editor/runtime/playbackRuntime': { getRuntimePlaybackProgress: () => state.cameraMotionProgress },
    './runtime/editor/io/projectDocument': { parseDirectorProjectDocument: (value) => value.project },
    './runtime/editor/io/referenceVideoExport': { requestReferenceVideoExport: async () => { throw new Error('not used') } },
    './runtime/editor/io/cleanFrameExport': { requestCleanFrameExport: () => exportFrame(update) },
  })
  return { module, update, state: () => state, listeners }
}

test('scene changes during export reject the frame and restore editor interaction/playback', async () => {
  const harness = captureHarness(async (update) => {
    update({ project: { ...snapshot().project, activeCameraId: 'changed' } })
    return { dataUrl: 'data:image/png;base64,AA==', fileName: 'frame.png' }
  })
  const root = { inert: false }
  await assert.rejects(harness.module.captureDirectorSnapshot(root), /场景发生变化/)
  assert.equal(root.inert, false)
  assert.equal(harness.state().cameraMotionPlaying, true)
  assert.equal(harness.listeners.size, 0)
})

test('clean capture produces a binary file, preserving the original inert state', async () => {
  const harness = captureHarness(async () => ({ dataUrl: 'data:image/png;base64,AA==', fileName: 'frame.png' }))
  const root = { inert: true }
  const result = await harness.module.captureDirectorSnapshot(root)
  assert.equal(result.file.type, 'image/png')
  assert.equal(result.file.size, 1)
  assert.equal(result.snapshot.viewSettings.cameraMotionProgress, 0.4)
  assert.equal(root.inert, true)
  assert.equal(harness.state().cameraMotionPlaying, true)
})

test('auto aspect ratio fails before invoking the exporter', async () => {
  const harness = captureHarness(() => { throw new Error('should not export') })
  harness.update({ viewportAspectRatio: 'auto' })
  await assert.rejects(harness.module.captureDirectorSnapshot({ inert: false }), /固定画幅/)
})

test('API rejects business errors, bounds snapshot size and keeps multipart headers automatic', async () => {
  const calls = []
  let response = { code: 200, data: { fileId: 99 } }
  const { StudioDirectorDesks: api, buildDirectorImageReferences } = load('../src/services/studioDirectorDesks.ts', {
    './generated': { OpenAPI: {} },
    './generated/core/request': { request: async (_, options) => { calls.push(options); return response } },
  })
  await api.upload({ segmentId: 101, file: new File([], 'x.png'), directorDeskId: 12, directorRevisionNo: 8, captureProgress: 0.4 })
  assert.equal(calls[0].mediaType, undefined)
  assert.equal(calls[0].formData.directorRevisionNo, 8)
  response = { code: 502, message: 'conflict', data: null }
  await assert.rejects(api.save({ ...snapshot(), id: 12, expectedRevisionNo: 7, characterBindings: [] }), /conflict/)
  assert.equal(calls.length, 2)
  const oversized = snapshot()
  oversized.project.extra = '大'.repeat(2 * 1024 * 1024)
  assert.throws(() => api.save({ ...oversized, id: 12, expectedRevisionNo: 7, characterBindings: [] }), /5 MiB/)
  assert.equal(calls.length, 2)
  const refs = buildDirectorImageReferences({ referenceType: 5, fileId: 99, displayName: '站位' }, [{ objectId: 'a', assetId: 1, referenceFileId: 5 }, { objectId: 'b', assetId: 1, referenceFileId: 5 }])
  assert.equal(refs.length, 2)
  assert.equal(refs[0].referenceType, 1)
  assert.equal(refs[1].referenceType, 5)
  assert.ok(refs.every((item) => item.useOnly && item.doNotUse))
  assert.throws(() => buildDirectorImageReferences({ referenceType: 7, fileId: 100 }, []), /必须是图片/)
})

test('cloud restoration rejects invalid manifests and corrupted downloads before registering resources', async () => {
  let valid = false
  let downloads = 0
  let registered = 0
  const blob = new Blob(['model'])
  const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', await blob.arrayBuffer())).toString('hex')
  const module = load('../src/pages/directorDesk/directorCloudAssets.ts', {
    '../../services/studioDirectorDesks': { StudioDirectorDesks: {
      validateAssets: async () => ({ valid, files: [{ assetFileId: 3, status: valid ? 'available' : 'missingDependency', message: 'missing dependency' }] }),
      downloadAsset: async () => { downloads++; return blob },
    } },
    './runtime/editor/loaders/cloudAssetRuntime': { registerCloudPackage: () => { registered++ } },
    './runtime/editor/loaders/localAssetBinaryStorage': {},
  }, { crypto: webcrypto, TextDecoder })
  const desk = { id: 1, project: { assets: [], jellyfishCloudAssets: [{ assetFileId: 3, relativePath: 'test.bin', byteSize: 5, sha256: hash }] } }
  await assert.rejects(module.restoreCloudAssets(desk), /missing dependency/)
  assert.equal(downloads, 0)
  valid = true
  desk.project.jellyfishCloudAssets[0].sha256 = '0'.repeat(64)
  await assert.rejects(module.restoreCloudAssets(desk), /SHA-256/)
  assert.equal(registered, 0)
  desk.project.jellyfishCloudAssets[0].sha256 = hash
  await module.restoreCloudAssets(desk)
  assert.equal(registered, 1)
})

test('cloud loaders resolve only their own manifest and isolate loader instances', () => {
  class LoadingManager { setURLModifier(modifier) { this.modifier = modifier } }
  class Loader {}
  let sequence = 0
  const module = load('../src/pages/directorDesk/runtime/editor/loaders/cloudAssetRuntime.ts', {
    three: { LoadingManager, DefaultLoadingManager: {} },
  }, { URL: class extends URL { static createObjectURL() { return `blob:test-${++sequence}` } static revokeObjectURL() {} } })
  module.registerCloudPackage('one', [{ id: 1, path: 'model.glb', blob: new Blob() }, { id: 2, path: 'textures/a.png', blob: new Blob() }])
  const url = module.cloudAssetUrl(1)
  const Constructor = module.directorLoader(Loader, url)
  assert.notEqual(Constructor, Loader)
  assert.equal(module.directorLoader(Loader, url), Constructor)
  assert.equal(module.directorLoader(Loader, '/built-in.glb'), Loader)
  const loader = new Constructor()
  assert.equal(loader.manager.modifier(new URL('textures/a.png', url).href), 'blob:test-2')
  assert.throws(() => loader.manager.modifier('https://external.example/a.png'), /缺少已验证依赖/)
  assert.throws(() => loader.manager.modifier(new URL('../other.bin', url).href), /缺少已验证依赖/)
})

test('draft, publication and application keep independent versions and propagate conflicts without retry', async () => {
  const calls = []
  const { StudioDirectorDesks: api } = load('../src/services/studioDirectorDesks.ts', {
    './generated': { OpenAPI: {} },
    './generated/core/request': { request: async (_, options) => {
      calls.push(options)
      return options.url.endsWith('publishDraft') ? { code: 502, message: 'publication conflict' } : { code: 200, data: {} }
    } },
  })
  await api.saveDraft({ ...snapshot(), id: 1, baseRevisionNo: 4, expectedDraftRevisionNo: 12, characterBindings: [] })
  await assert.rejects(api.publishDraft(1, 13, 4), /publication conflict/)
  await api.applyCapture({ segmentId: 2, fileId: 3, target: 'video', modelId: 5, includeCharacters: false, expectedApplicationRevisionNo: 7, expectedReferenceRevisionNo: 20 })
  assert.equal(calls.length, 3)
  assert.equal(calls[0].body.baseRevisionNo, 4)
  assert.equal(calls[0].body.expectedDraftRevisionNo, 12)
  assert.equal(calls[1].body.expectedRevisionNo, 4)
  assert.equal(calls[1].body.expectedDraftRevisionNo, 13)
  assert.equal(calls[2].body.expectedApplicationRevisionNo, 7)
  assert.equal(calls[2].body.expectedReferenceRevisionNo, 20)
})


test('director image generation preserves the selected visual style and explicit no-style value', async () => {
  const calls = []
  const { StudioDirectorDesks: api } = load('../src/services/studioDirectorDesks.ts', {
    './generated': { OpenAPI: {} },
    './generated/core/request': { request: async (_, options) => { calls.push(options); return { code: 200, data: {} } } },
  })
  for (const visualStyleId of [12, 27, null]) {
    await api.generateImage({ segmentId: 101, modelId: 2, prompt: '人物对话', aspectRatio: '16:9', resolution: 2, visualStyleId, references: [] })
    const body = calls.at(-1).body
    assert.equal(body.visualStyleId, visualStyleId)
    assert.equal(JSON.parse(JSON.stringify(body)).visualStyleId, visualStyleId)
  }
})


test('reference preview uses readable names, preserves bindings and does not merge same-name characters', () => {
  const { buildDirectorImageReferences } = load('../src/services/studioDirectorDesks.ts', {
    './generated': { OpenAPI: {} }, './generated/core/request': {},
  })
  const bindings = [
    { objectId: 'a', assetId: 1694, characterLookId: 613, referenceFileId: 134 },
    { objectId: 'b', assetId: 1695, characterLookId: 614, referenceFileId: 135 },
    { objectId: 'c', assetId: 1696, referenceFileId: 136 },
  ]
  const options = [
    { assetId: '1694', characterLookId: '613', fileId: '134', assetName: '沈清', characterName: '备用名称', lookName: '晚宴礼服', characterLookName: '备用造型' },
    { assetId: 1695, characterLookId: 614, fileId: 135, characterName: '沈清', characterLookName: '晚宴礼服' },
  ]
  const refs = buildDirectorImageReferences({ referenceType: 5, fileId: 263, displayName: '导演台3版本5产物263' }, bindings, options)
  assert.equal(refs.length, 4)
  assert.equal(refs[0].displayName, '沈清 · 晚宴礼服 · 外观参考')
  assert.equal(refs[1].displayName, refs[0].displayName)
  assert.equal(refs[2].displayName, '角色参考图 3 · 外观参考')
  assert.equal(refs[3].displayName, '导演台 · 构图参考')
  assert.equal(refs[0].assetId, 1694)
  assert.equal(refs[0].characterLookId, 613)
  assert.equal(refs[0].fileId, 134)
  assert.equal(refs[3].referenceType, 5)
  assert.equal(refs[3].useOnly, '人物站位、朝向、姿势、位置关系和镜头构图')
  const alone = buildDirectorImageReferences({ referenceType: 5, fileId: 263 }, [])
  assert.equal(alone.length, 1)
  assert.equal(alone[0].displayName, '导演台 · 构图参考')
  const long = buildDirectorImageReferences({ referenceType: 5, fileId: 263 }, bindings.slice(0, 1), [{ ...options[0], assetName: '@{沈清} '.repeat(50) }])[0]
  assert.ok(long.displayName.length <= 128)
  assert.doesNotMatch(long.displayName, /[@{}]/)
  const main = buildDirectorImageReferences({ referenceType: 5, fileId: 263 }, bindings.slice(0, 1), [{ assetId: 1694, characterLookId: 613, fileId: 134, assetName: '陆沉', defaultLook: true }])[0]
  assert.equal(main.displayName, '陆沉 · 主图 · 外观参考')
})

test('refreshed and idempotent application responses preserve custom reference text and full generation payload', async () => {
  const refs = [
    { referenceType: 1, fileId: 135, assetId: 1695, characterLookId: 614, fileUrl: '/api/v1/studio/files/content?id=135', displayName: '同名参考', useOnly: '用户指定用途', doNotUse: '用户指定约束' },
    { referenceType: 1, fileId: 134, assetId: 1694, characterLookId: 613, displayName: '同名参考', useOnly: '另一用途', doNotUse: '另一约束' },
    { referenceType: 5, fileId: 263, displayName: '我的构图标题', useOnly: '我的构图用途', doNotUse: '我的限制' },
  ]
  const application = { imageReferences: refs, alreadyApplied: true, applicationRevisionNo: 7 }
  const calls = []
  const { StudioDirectorDesks: api } = load('../src/services/studioDirectorDesks.ts', {
    './generated': { OpenAPI: {} },
    './generated/core/request': { request: async (_, options) => { calls.push(options); return { code: 200, data: options.method === 'GET' ? { image: application } : application } } },
  })
  const current = await api.segmentApplications(101)
  assert.equal(current.image.imageReferences, refs)
  assert.equal(calls.length, 1)
  const result = await api.applyCapture({ segmentId: 101, target: 'image', fileId: 263, expectedApplicationRevisionNo: 7, includeCharacters: true })
  assert.equal(result.alreadyApplied, true)
  assert.equal(result.imageReferences, refs)
  await api.generateImage({ segmentId: 101, modelId: 2, prompt: '人物对话', aspectRatio: '16:9', resolution: 2, visualStyleId: null, references: result.imageReferences })
  assert.deepEqual(JSON.parse(JSON.stringify(calls[2].body.references)), refs.map(({ fileUrl, ...item }) => item))
  assert.equal('referenceFileIds' in calls[2].body, false)
  assert.equal(calls[2].body.references[0].fileId, 135)
})


test('reference image URLs use the configured API prefix and only authenticate the trusted media endpoint', () => {
  const { resolveDirectorImageSource: resolve } = load('../src/pages/directorDesk/directorImageSource.ts', {
    '../../services/generated': { OpenAPI: {} }, '../../services/generated/core/request': {},
  }, { URL })
  const base = 'https://api.example.com/jellyfish'
  const page = 'http://localhost:5173/director-desk'
  assert.equal(resolve('/api/v1/studio/files/content?id=134', base, page).url, `${base}/api/v1/studio/files/content?id=134`)
  assert.equal(resolve('/api/v1/studio/files/content?id=134', base, page).authenticated, true)
  assert.equal(resolve(`${base}/api/v1/studio/files/content?id=134`, base, page).authenticated, true)
  assert.equal(resolve('https://cdn.example.com/134.png', base, page).authenticated, false)
  assert.equal(resolve('https://other.example.com/jellyfish/api/v1/studio/files/content?id=134', base, page).authenticated, false)
  assert.equal(resolve('https://api.example.com/jellyfish/api/v1/studio/files/content-extra?id=134', base, page).authenticated, false)
  assert.throws(() => resolve('javascript:alert(1)', base, page), /图片地址无效/)
})

test('public images bypass credential requests; authenticated images support cancellation and revoke their Blob URL', async () => {
  let requests = 0
  let headersRead = 0
  let revoked = ''
  let requestOptions
  const { loadDirectorImage } = load('../src/pages/directorDesk/directorImageSource.ts', {
    '../../services/generated': { OpenAPI: { BASE: 'https://api.example.com/jellyfish' } },
    '../../services/generated/core/request': { getHeaders: async () => { headersRead++; return new Headers({ Authorization: 'test-token' }) } },
  }, {
    window: { location: { href: 'http://localhost:5173/director-desk' } },
    URL: class extends URL { static createObjectURL() { return 'blob:loaded-image' } static revokeObjectURL(url) { revoked = url } },
    fetch: async (_, options) => { requests++; requestOptions = options; return { ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) } },
  })
  const controller = new AbortController()
  const publicImage = await loadDirectorImage('https://cdn.example.com/p.png', controller.signal)
  assert.equal(publicImage.url, 'https://cdn.example.com/p.png')
  assert.equal(requests, 0)
  assert.equal(headersRead, 0)
  const privateImage = await loadDirectorImage('/api/v1/studio/files/content?id=1', controller.signal)
  assert.equal(requestOptions.headers.get('Authorization'), 'test-token')
  assert.equal(requestOptions.signal, controller.signal)
  assert.equal(requestOptions.redirect, 'error')
  assert.equal(privateImage.url, 'blob:loaded-image')
  privateImage.release()
  assert.equal(revoked, 'blob:loaded-image')
  controller.abort()
  await assert.rejects(loadDirectorImage('/api/v1/studio/files/content?id=1', controller.signal), /已取消/)
})


test('reported OSS image stays unchanged and video references use video MIME validation', async () => {
  let mime = 'video/mp4'
  let calls = 0
  let accept
  let released = false
  const { loadDirectorMedia, directorReferenceMediaType } = load('../src/pages/directorDesk/directorImageSource.ts', {
    '../../services/generated': { OpenAPI: { BASE: 'https://api.example.com/jellyfish' } },
    '../../services/generated/core/request': { getHeaders: async () => new Headers() },
  }, {
    window: { location: { href: 'http://localhost:5173/director-desk' } },
    URL: class extends URL { static createObjectURL() { return 'blob:video' } static revokeObjectURL() { released = true } },
    fetch: async (_, options) => { calls++; accept = options.headers.get('Accept'); return { ok: true, blob: async () => new Blob(['media'], { type: mime }) } },
  })
  const signal = new AbortController().signal
  const reported = 'https://oss.composer.mangamixbox.com/2026/09/04/0d9e5c2a-3264-4ec7-b1db-e30aa96b65bd.png'
  assert.equal((await loadDirectorMedia(reported, signal)).url, reported)
  assert.equal(calls, 0)
  assert.equal(directorReferenceMediaType({ referenceType: 5 }), 'image')
  assert.equal(directorReferenceMediaType({ referenceType: 7 }), 'video')
  assert.equal(directorReferenceMediaType({ referenceType: 6 }), 'audio')
  const endpoint = '/api/v1/studio/files/content?id=7'
  const video = await loadDirectorMedia(endpoint, signal, 'video')
  assert.equal(accept, 'video/*,application/octet-stream')
  assert.equal(video.url, 'blob:video')
  video.release()
  assert.equal(released, true)
  await assert.rejects(loadDirectorMedia(endpoint, signal, 'image'), /返回的内容不是/)
  mime = 'application/json'
  await assert.rejects(loadDirectorMedia(endpoint, signal, 'video'), /返回的内容不是/)
  mime = 'application/octet-stream'
  assert.equal((await loadDirectorMedia(endpoint, signal, 'video')).url, 'blob:video')
})
