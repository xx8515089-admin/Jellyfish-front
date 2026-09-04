import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/aiStudio/project/assetImageGenerationSettings.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText
const exports = {}
vm.runInNewContext(compiled, { exports }, { filename: 'assetImageGenerationSettings.js' })
const { selectImageResolution, selectInitialAssetLook, resolveAssetImageOptions, createImageOptionsClientRevision } = exports
const resolve = (overrides = {}) => resolveAssetImageOptions({
  asset: { prompt: 'Asset prompt', aspectRatio: '16:9', styleName: 'Film', visualStyleId: 12 },
  ratio: '9:16',
  ratioOptions: ['9:16', '16:9', '1:1'],
  styleOptions: [{ id: 12, name: 'Film' }, { id: '24', name: 'Anime' }],
  noStyleName: '无风格',
  ...overrides,
})
const plain = (value) => JSON.parse(JSON.stringify(value))

test('resolution defaults to API-supported 2K regardless of option order', () => {
  assert.equal(selectImageResolution([4, 2, 1]), '2')
  assert.equal(selectImageResolution([1, 2, 4]), '2')
})

test('resolution uses API fallback and never invents an unsupported option', () => {
  assert.equal(selectImageResolution([4, 1]), '4')
  assert.equal(selectImageResolution([]), '')
  assert.equal(selectImageResolution([4, 1], '2K'), '4')
  assert.equal(selectImageResolution([], '2K'), '')
})

test('valid explicit resolution selections are retained and normalized', () => {
  assert.equal(selectImageResolution([4, 2, 1], '4K'), '4')
  assert.equal(selectImageResolution([4, 2, 1], ' 1k '), '1')
  assert.equal(selectImageResolution([4, 2, 1], '4'), '4')
})

test('initial look uses the performing look, then default, then first', () => {
  const first = { id: '1' }
  const defaultLook = { id: '2', defaultLook: true }
  const performingLook = { id: '3', status: 1 }
  assert.equal(selectInitialAssetLook([first, defaultLook, performingLook]), performingLook)
  assert.equal(selectInitialAssetLook([first, defaultLook]), defaultLook)
  assert.equal(selectInitialAssetLook([first]), first)
  assert.equal(selectInitialAssetLook([]), undefined)
})

test('look generation uses the look prompt, ratio and style instead of the asset defaults', () => {
  assert.deepEqual(plain(resolve({ look: { id: '7', prompt: 'Look prompt', aspectRatio: '1:1', visualStyleId: 24 } })), {
    prompt: 'Look prompt', lookId: 7, styleName: 'Anime', visualStyleId: 24, aspectRatio: '1:1',
  })
  assert.equal(resolve({ look: { id: '7' } }).prompt, '')
  assert.equal(resolve().prompt, 'Asset prompt')
})

test('invalid look ratios fall back to valid asset, project or API ratio choices', () => {
  assert.equal(resolve({ look: { id: '7', aspectRatio: 'unsupported' } }).aspectRatio, '16:9')
  assert.equal(resolve({ asset: { aspectRatio: 'unsupported' } }).aspectRatio, '9:16')
  assert.equal(resolve({ asset: {}, ratio: 'unsupported', ratioOptions: ['1:1'] }).aspectRatio, '1:1')
  assert.equal(resolve({ ratioOptions: [] }).aspectRatio, '')
})

test('explicit no-style values override saved styles and normalize translated labels', () => {
  for (const overrides of [
    { look: { id: '7', visualStyleId: null } },
    { asset: { visualStyleId: null, styleName: 'Film' } },
    { asset: { styleName: 'No STYLE', visualStyleId: 12 } },
    { asset: { styleName: '无风格' } },
  ]) {
    const result = resolve(overrides)
    assert.equal(result.styleName, '无风格')
    assert.equal(result.visualStyleId, null)
  }
  assert.equal(resolve({ asset: { styleName: '无风格' }, noStyleName: 'No style' }).styleName, 'No style')
})

test('style IDs resolve by API ID or name and absent look styles preserve the asset', () => {
  assert.equal(resolve({ asset: { styleName: 'Anime' } }).visualStyleId, 24)
  assert.equal(resolve({ asset: { visualStyleId: 24 } }).styleName, 'Anime')
  assert.equal(resolve({ look: { id: '7' } }).styleName, 'Film')
  assert.equal(resolve({ look: { id: '7', visualStyleId: 12 }, styleOptions: [] }).styleName, 'Film')
  const unknown = resolve({ look: { id: '7', visualStyleId: 99 } })
  assert.equal(unknown.visualStyleId, 99)
  assert.equal(unknown.styleName, '')
})

test('unsaved edits apply only to their own look, including the unassigned asset', () => {
  const queuedInput = { prompt: 'Unsaved', aspectRatio: '1:1', visualStyleId: 24, styleName: 'Anime', lookId: 7 }
  assert.deepEqual(plain(resolve({ look: { id: '7' }, queuedInput })), queuedInput)
  assert.equal(resolve({ look: { id: '8', prompt: 'Another look' }, queuedInput }).prompt, 'Another look')
  assert.equal(resolve({ queuedInput }).prompt, 'Asset prompt')
  assert.equal(resolve({ queuedInput: { ...queuedInput, lookId: null } }).prompt, 'Unsaved')
  const changedModel = resolve({ look: { id: '7' }, queuedInput, ratioOptions: ['16:9'] })
  assert.equal(changedModel.aspectRatio, '16:9')
  assert.equal(changedModel.prompt, 'Unsaved')
  assert.equal(resolve({ look: { id: 'invalid' } }).lookId, null)
})

test('option revisions remain distinct across rapid updates', () => {
  const first = createImageOptionsClientRevision()
  const second = createImageOptionsClientRevision()
  assert.ok(second > first)
})
