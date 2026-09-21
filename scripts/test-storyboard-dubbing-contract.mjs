import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function setup(data, code = 200) {
  const calls = []
  const exports = {}
  const source = readFileSync(new URL('../src/services/studioDubbing.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports,
    require: (name) => name.endsWith('/request') ? { request: async (_, options) => { calls.push(JSON.parse(JSON.stringify(options))); return { code, data, message: 'rejected' } } } : { OpenAPI: {} },
  })
  return { api: exports.StudioDubbingApi, calls }
}

test('opening an empty panel is one read and preserves the empty result', async () => {
  const panel = { settings: { runId: '9007199254740993', volume: 1, speechRate: 1 }, characters: [], lines: [] }
  const { api, calls } = setup(panel)
  assert.equal(await api.panel('30'), panel)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].url, '/api/v1/studio/storyboards/dubbing/panel')
  assert.deepEqual(calls[0].query, { segmentId: '30' })
})

test('voice binding preserves shared asset ID and sends explicit null to unbind', async () => {
  const { api, calls } = setup({ assetId: '9007199254740993', voiceConfigured: false, voiceConfig: null })
  const result = await api.updateVoice(30, '9007199254740993', null)
  assert.equal(result.voiceConfig, null)
  assert.deepEqual(calls[0].body, { segmentId: 30, assetId: '9007199254740993', voiceId: null })
})

test('line edits preserve inherited values, and deleting the final line does not initialize', async () => {
  const { api, calls } = setup(null)
  const fields = { characterAssetId: null, dialogueText: '原话', emotionPrompt: '低声', volume: null, speechRate: null }
  await api.updateLine('8', fields)
  await api.deleteLine('8')
  assert.deepEqual(calls[0].body, { id: '8', ...fields })
  assert.deepEqual(calls[1].body, { id: '8' })
  assert.equal(calls.length, 2)
})

const input = {characterAssetId: 102, voiceId: 1901, languageCode: 'en-US', dialogueText: 'confirmed text', emotionPrompt: null, volume: 1, speechRate: 1}

test('generation sends complete frozen input/model/format and reads detail and history separately', async () => {
  const { api, calls } = setup({ id: 72, status: 1 })
  const generation = await api.generate('8', input, 'wav', 4)
  await api.detail(generation.id)
  await api.history('8')
  assert.deepEqual(calls[0].body, { lineId: '8', input, modelId: 4, outputFormat: 'wav' })
  assert.deepEqual(calls[1].query, { id: 72 })
  assert.deepEqual(calls[2].query, { lineId: '8' })
})

test('business errors reject instead of presenting a successful mutation', async () => {
  const { api } = setup(null, 403)
  await assert.rejects(api.updateSettings({ runId: 1, volume: 1, speechRate: 1 }), /rejected/)
})

test('default voice generation omits modelId and polls the returned generation ID', async () => {
  const { api, calls } = setup({ id: 456, status: 1 })
  const generation = await api.generate(123, input)
  await api.detail(generation.id)
  assert.deepEqual(calls[0].body, { lineId: 123, input, outputFormat: 'mp3' })
  assert.deepEqual(calls[1].query, { id: 456 })
})
