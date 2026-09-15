import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
const source = readFileSync(new URL('../src/pages/aiStudio/project/imageToVideoContract.ts', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports })
const input = { imageGenerationId: '60', modelId: 4, resolution: '720p', duration: 5, prompt: '  Move slowly  ', visualStyleId: null, toneStyleId: null }

test('uses the image generation ID and excludes multi-reference request fields', () => {
  const payload = exports.buildImageToVideoRequest({ ...input, segmentId: 20, outputFileId: 99, aspectRatio: '9:16', references: [], generateAudio: true })
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), { imageGenerationId: 60, modelId: 4, resolution: '720p', durationSeconds: 5, prompt: 'Move slowly', visualStyleId: null, toneStyleId: null })
})
test('rejects invalid or imprecise generation IDs and invalid style IDs', () => {
  for (const id of ['0', '-1', 'abc', '9007199254740993']) assert.throws(() => exports.buildImageToVideoRequest({ ...input, imageGenerationId: id }))
  assert.throws(() => exports.buildImageToVideoRequest({ ...input, visualStyleId: 0 }))
})
test('HappyHorse counts Han characters twice without changing other model limits', () => {
  assert.equal(exports.imageToVideoPromptLength('  左移ab  ', 'happyhorse/image-to-video'), 6)
  assert.equal(exports.imageToVideoPromptLength('  左移ab  ', 'wan/2-6-image-to-video'), 4)
})

test('single-panel video freezes the panel and revision with the edited prompt', () => {
  const payload = exports.buildImageToVideoRequest({ ...input, scope: 'single_panel', panelId: 'p2', panelRevision: 3 })
  assert.equal(payload.scope, 'single_panel')
  assert.equal(payload.panelId, 'p2')
  assert.equal(payload.panelRevision, 3)
  assert.equal(payload.prompt, 'Move slowly')
})

test('all-panels video omits a stale panelId and rejects unconfirmed revision values', () => {
  const payload = exports.buildImageToVideoRequest({ ...input, scope: 'all_panels', panelId: 'p2', panelRevision: 3 })
  assert.equal(Object.hasOwn(payload, 'panelId'), false)
  assert.equal(payload.scope, 'all_panels')
  assert.throws(() => exports.buildImageToVideoRequest({ ...input, scope: 'single_panel', panelRevision: 3 }))
  assert.throws(() => exports.buildImageToVideoRequest({ ...input, scope: 'all_panels', panelRevision: 0 }))
})

test('whole image omits all panel metadata even if stale selection fields are provided', () => {
  const payload = exports.buildImageToVideoRequest({ ...input, scope: 'whole_image', panelId: 'old', panelRevision: 8 })
  assert.equal(payload.scope, 'whole_image')
  assert.equal(Object.hasOwn(payload, 'panelId'), false)
  assert.equal(Object.hasOwn(payload, 'panelRevision'), false)
})

test('ordinary images and detected panels need no confirmation or coordinates to generate a prompt', () => {
  const image = { id: 1, status: 3, panelStatus: 'unavailable', panels: [] }
  assert.equal(exports.canGenerateImageVideoPrompt(image, 'whole_image', undefined, 5), true)
  assert.equal(exports.canGenerateImageVideoPrompt({ ...image, status: 2 }, 'whole_image', undefined, 5), false)
  const detected = { ...image, panelStatus: 'detected', panels: [{ panelId: 'p1', description: 'Walk forward', bounds: null }] }
  assert.equal(exports.canGenerateImageVideoPrompt(detected, 'single_panel', 'p1', 5), true)
  assert.equal(exports.canGenerateImageVideoPrompt(detected, 'single_panel', 'p2', 5), false)
  assert.equal(exports.canGenerateImageVideoPrompt({ ...detected, panels: [{ panelId: 'p1', description: ' ' }] }, 'single_panel', 'p1', 5), false)
  assert.equal(exports.canGenerateImageVideoPrompt({ ...detected, panels: Array.from({ length: 6 }, () => detected.panels[0]) }, 'all_panels', undefined, 5), false)
})

test('only normalized non-empty crop bounds allow a panel video', () => {
  assert.equal(exports.validPanelBounds({ x: 0.5, y: 0, width: 0.5, height: 1 }), true)
  for (const bounds of [null, undefined, { x: 0, y: 0, width: 0, height: 1 }, { x: -0.1, y: 0, width: 1, height: 1 }, { x: 0.5, y: 0, width: 0.6, height: 1 }, { x: NaN, y: 0, width: 1, height: 1 }]) assert.equal(exports.validPanelBounds(bounds), false)
})
