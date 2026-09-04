import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(ts.transpileModule(readFileSync(
  new URL('../src/pages/aiStudio/project/assetGenerationWorkspaceState.ts', import.meta.url), 'utf8',
), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports })

test('a look awaiting history uses its own file ID and never borrows the asset cover ID', () => {
  const asset = { imageUrl: 'https://example.test/a.png', fileId: '10' }
  const look = { imageUrl: 'https://example.test/b.png', fileId: '20' }
  assert.equal(exports.resolvePreviewImageFileId(look.imageUrl, look, asset), '20')
  assert.equal(exports.resolvePreviewImageFileId(look.imageUrl, { imageUrl: look.imageUrl }, asset), undefined)
  assert.equal(exports.resolvePreviewImageFileId(asset.imageUrl, look, asset), '10')
  assert.equal(exports.resolvePreviewImageFileId('https://example.test/history.png', look, asset), undefined)
})

test('batch progress belongs only to its backend look ID, including completed sibling looks', () => {
  const first = { phase: 'running', progress: 30 }
  const second = { phase: 'running', progress: 70 }
  const states = { 381: first, 382: second }
  assert.equal(exports.getLookGenerationState(381, states, second), first)
  assert.equal(exports.getLookGenerationState(382, states, first), second)
  assert.equal(exports.getLookGenerationState(383, states, first), undefined)
  assert.equal(exports.getLookGenerationState(undefined, states, first), undefined)
  assert.equal(exports.getLookGenerationState(381, undefined, first), first)
})

test('switching looks retains prompt, ratio and style without pairing a history preview with the main file ID', () => {
  const original = { id: 'look-a', prompt: 'old', aspectRatio: '9:16', visualStyleId: 1,
    imageUrl: 'https://example.test/main-a.png', coverFileId: '10' }
  const other = { id: 'look-b', imageUrl: 'https://example.test/main-b.png', coverFileId: '20' }
  const [saved, unchanged] = exports.captureLookEditorOptions([original, other], 'look-a', {
    prompt: 'edited', aspectRatio: '16:9', visualStyleId: 2,
  })
  assert.equal(saved.prompt, 'edited')
  assert.equal(saved.aspectRatio, '16:9')
  assert.equal(saved.visualStyleId, 2)
  assert.equal(saved.editorOptionsTouched, true)
  assert.equal(saved.imageUrl, original.imageUrl)
  assert.equal(saved.coverFileId, original.coverFileId)
  assert.equal(unchanged, other)
  assert.equal(exports.resolvePreviewImageFileId('https://example.test/history-a.png', {
    imageUrl: saved.imageUrl, fileId: saved.coverFileId,
  }, {}), undefined)
})
