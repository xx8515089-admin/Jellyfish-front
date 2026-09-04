import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the production modules, including their actual normalization helpers.
const modules = new Map()
function loadTypeScript(file) {
  if (modules.has(file)) return modules.get(file).exports
  const module = { exports: {} }
  modules.set(file, module)
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require: (specifier) => {
      assert.ok(specifier.startsWith('.'), `Unexpected runtime dependency: ${specifier}`)
      return loadTypeScript(resolve(dirname(file), `${specifier}.ts`))
    },
  }, { filename: file })
  return module.exports
}

const { buildBatchGenerationState, selectAssetGenerationState, getBatchResultSignature } = loadTypeScript(
  fileURLToPath(new URL('../src/pages/aiStudio/project/assetBatchGenerationState.ts', import.meta.url)),
)
const assetKey = (id = 1060, type = 1) => `remote:39:${type}:${id}`
const item = (patch = {}) => ({
  scopeKey: 381,
  scopeCode: 'CH001/CO001',
  assetId: 1060,
  assetType: 1,
  assetName: 'Character',
  characterLookId: 381,
  characterLookName: 'Default look',
  coverFileId: null,
  coverUrl: null,
  status: 2,
  statusName: '生成中',
  taskId: 63,
  progress: 24,
  error: '',
  ...patch,
})
const frozen = (items) => Object.freeze(items.map((entry) => Object.freeze(entry)))
const plain = (value) => JSON.parse(JSON.stringify(value))

test('active task progress reaches its asset and exact character look', () => {
  const result = buildBatchGenerationState(39, frozen([item()]), false)
  assert.equal(result.assets[assetKey()].phase, 'running')
  assert.equal(result.assets[assetKey()].progress, 24)
  assert.equal(result.assets[assetKey()].lookId, 381)
  assert.equal(result.looks[assetKey()]['381'].progress, 24)
  assert.equal(result.looks[assetKey()]['381'].lookId, 381)
})

test('pending assets without a task and terminal assets never display loading', () => {
  const inactiveItems = [
    item({ taskId: null, status: 1, statusName: '未生成', progress: 0 }),
    item({ taskId: undefined }),
    item({ taskId: '  ' }),
    item({ status: 3, statusName: '已就绪', progress: 99 }),
    item({ status: 4, statusName: '失败', progress: 40 }),
    item({ status: 5, statusName: '已取消', progress: 40 }),
    item({ progress: 100 }),
  ]
  for (const entry of inactiveItems) {
    const result = buildBatchGenerationState(39, frozen([entry]), false)
    assert.deepEqual(Object.keys(result.assets), [], JSON.stringify(entry))
    assert.deepEqual(Object.keys(result.looks), [], JSON.stringify(entry))
  }
})

test('two running looks retain separate progress and use the lowest value on the card', () => {
  const input = frozen([
    item({ characterLookId: 381, progress: 76 }),
    item({ scopeKey: 382, characterLookId: 382, taskId: 64, progress: 18 }),
  ])
  const result = buildBatchGenerationState(39, input, false)
  assert.equal(result.assets[assetKey()].progress, 18)
  assert.equal(result.assets[assetKey()].lookId, undefined, 'A card aggregate must not masquerade as one look')
  assert.equal(result.looks[assetKey()]['381'].progress, 76)
  assert.equal(result.looks[assetKey()]['382'].progress, 18)
})

test('a completed sibling look cannot erase a running look regardless of response order', () => {
  const active = item({ characterLookId: 381, progress: 37 })
  const complete = item({ scopeKey: 382, characterLookId: 382, taskId: 64, status: 3, progress: 100 })
  for (const input of [[active, complete], [complete, active]]) {
    const result = buildBatchGenerationState(39, frozen(input), false)
    assert.equal(result.assets[assetKey()].progress, 37)
    assert.equal(result.looks[assetKey()]['381'].progress, 37)
    assert.equal(result.looks[assetKey()]['382'], undefined)
  }
})

test('asset identity includes type, and scene or prop tasks do not acquire character look entries', () => {
  const result = buildBatchGenerationState(39, frozen([
    item(),
    item({ assetType: 2, characterLookId: null, progress: 42 }),
    item({ assetType: 3, characterLookId: null, progress: 57 }),
  ]), false)
  assert.equal(result.assets[assetKey()].progress, 24)
  assert.equal(result.assets[assetKey(1060, 2)].progress, 42)
  assert.equal(result.assets[assetKey(1060, 3)].progress, 57)
  assert.equal(result.looks[assetKey(1060, 2)], undefined)
  assert.equal(result.looks[assetKey(1060, 3)], undefined)
})

test('a new full status snapshot removes disappeared tasks and a completed scope clears all loading', () => {
  const previous = buildBatchGenerationState(39, frozen([
    item(),
    item({ assetId: 1061, scopeKey: 382, characterLookId: 382, taskId: 64 }),
  ]), false)
  const next = buildBatchGenerationState(39, frozen([item({ progress: 48 })]), false, previous)
  assert.deepEqual(Object.keys(next.assets), [assetKey()])
  assert.deepEqual(Object.keys(next.looks), [assetKey()])
  assert.equal(next.assets[assetKey()].progress, 48)
  assert.equal(previous.assets[assetKey()].progress, 24, 'The previous snapshot must remain unchanged')
  const completed = buildBatchGenerationState(39, frozen([item()]), true, next)
  assert.deepEqual(plain(completed), { assets: {}, looks: {} })
  assert.deepEqual(plain(buildBatchGenerationState(39, [], false, next)), { assets: {}, looks: {} })
})

test('unchanged and reordered responses reuse the existing state reference', () => {
  const input = [item(), item({ assetId: 1061, scopeKey: 382, characterLookId: 382, taskId: 64 })]
  const previous = buildBatchGenerationState(39, frozen(input), false)
  const cloned = input.map((entry) => ({ ...entry }))
  assert.equal(buildBatchGenerationState(39, cloned, false, previous), previous)
  assert.equal(buildBatchGenerationState(39, [...cloned].reverse(), false, previous), previous)
  const empty = buildBatchGenerationState(39, [], true)
  assert.equal(buildBatchGenerationState(39, [], true, empty), empty)
  assert.notEqual(buildBatchGenerationState(39, [item({ progress: 25 })], false, previous), previous)
})

test('failed single generation cannot obscure a running batch, while recovery keeps single-task ownership', () => {
  const batch = { phase: 'running', progress: 36 }
  const failure = { phase: 'failed', progress: 5, errorMessage: 'Previous attempt failed' }
  assert.equal(selectAssetGenerationState(failure, batch), batch)
  assert.equal(selectAssetGenerationState(undefined, batch), batch)
  assert.equal(selectAssetGenerationState(failure, undefined), failure)
  assert.equal(selectAssetGenerationState(undefined, undefined), undefined)
  for (const phase of ['submitting', 'running', 'refreshing', 'poll-failed', 'refresh-failed']) {
    const single = { phase, progress: 12 }
    assert.equal(selectAssetGenerationState(single, batch), single, phase)
  }
})

test('result signatures ignore list ordering and intermediate task progress', () => {
  const done = item({ status: 3, statusName: '已就绪', progress: 100, coverFileId: 127, coverUrl: 'https://example.test/127.png' })
  const failed = item({ scopeKey: 382, assetId: 1061, characterLookId: 382, status: 4, statusName: '失败', taskId: 64 })
  const running = item({ scopeKey: 383, assetId: 1062, characterLookId: 383, taskId: 65, progress: 16 })
  const signature = getBatchResultSignature(frozen([done, failed, running]))
  assert.equal(getBatchResultSignature([failed, { ...running, progress: 90 }, done]), signature)
  assert.equal(getBatchResultSignature([done, failed]), signature)
  assert.notEqual(getBatchResultSignature([done]), signature, 'A failed task is a terminal result too')
  assert.notEqual(getBatchResultSignature([failed, { ...running, status: 3, progress: 100 }, done]), signature)
})

test('result signatures change when terminal asset identity, status or result file changes', () => {
  const done = item({ status: 3, statusName: '已就绪', progress: 100, coverFileId: 127, coverUrl: 'https://example.test/127.png' })
  const signature = getBatchResultSignature([done])
  for (const patch of [
    { scopeKey: 999 },
    { assetType: 2 },
    { assetId: 999 },
    { characterLookId: 999 },
    { status: 4, statusName: '失败', progress: 10 },
    { coverFileId: 999 },
    { coverUrl: 'https://example.test/new.png' },
  ]) {
    assert.notEqual(getBatchResultSignature([{ ...done, ...patch }]), signature, JSON.stringify(patch))
  }
})
