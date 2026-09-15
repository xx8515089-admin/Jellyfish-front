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
