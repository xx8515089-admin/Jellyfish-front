import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText
const progressState = {}
vm.runInNewContext(compile(readFileSync(new URL('../src/pages/aiStudio/project/assetGenerationProgressState.ts', import.meta.url), 'utf8')), {
  exports: progressState,
})
const { normalizeAssetGenerationProgress: normalize } = progressState
const source = readFileSync(new URL('../src/pages/aiStudio/project/ProjectAssetsStep.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('ProjectAssetsStep.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['clampTaskProgress', 'normalizePersistedAssetImageTasks', 'toPersistedAssetImageTask', 'pollAssetImageTask']
const declarations = new Map()
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
    declarations.set(node.name.text, `const ${node.getText(tree)}`)
  }
  if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) {
    declarations.set(node.name.text, node.getText(tree))
  }
  ts.forEachChild(node, visit)
}
visit(tree)
for (const name of names) assert.ok(declarations.has(name), `Missing production function: ${name}`)
const compiled = compile(`${names.map((name) => declarations.get(name)).join('\n')}\nexport { ${names.join(', ')} }`)
const makeRun = () => ({
  assetKey: 'role-12', backendAssetId: 12, lookId: 31, progress: 0,
  assetName: 'Character', scriptImportId: 7, scopeId: 'episode-3', chapterId: 303,
  assetType: 1, sourceSignature: 'project-7', taskId: 'task-1', timer: null,
})

function harness() {
  const exports = {}
  const calls = { persisted: [], patches: [], scheduled: [], refreshed: [] }
  let response = { id: 'task-1', status: 2, progress: 36 }
  let error
  vm.runInNewContext(compiled, {
    exports, ...progressState,
    StudioAssetGenerationApi: { requestTaskDetail: () => ({ promise: error ? Promise.reject(error) : Promise.resolve(response) }) },
    isCurrentAssetImageRun: () => true,
    isAssetImageTaskSucceeded: (detail) => detail.status === 3,
    isAssetImageTaskFailed: (detail) => detail.status > 3,
    parseStudioAssetImageTaskResult: (result) => result ? JSON.parse(result) : null,
    persistAssetImageRun: (run) => calls.persisted.push(exports.toPersistedAssetImageTask(run)),
    patchAssetImageTask: (_key, patch) => calls.patches.push(patch),
    refreshGeneratedAsset: (run) => calls.refreshed.push(run.progress),
    failAssetImageRun: () => { throw new Error('Unexpected terminal failure') },
    scheduleAssetImageTaskPoll: (_run, delay) => calls.scheduled.push(delay),
    ASSET_IMAGE_TASK_POLL_INTERVAL_MS: 1200, ASSET_IMAGE_TASK_MAX_REQUEST_FAILURES: 4,
    isCancelledRequestError: () => false, getErrorStatus: () => 500,
    getApiErrorMessage: (failure) => failure.message, l: (_zh, en) => en,
    message: { warning() {} },
  })
  return { exports, calls, setResponse: (value) => { response = value; error = undefined }, setError: (value) => { error = value } }
}

test('API progress is rounded and bounded, while absent or invalid values retain the last percentage', () => {
  assert.equal(normalize('36.5'), 37)
  assert.equal(normalize(-4), 0)
  assert.equal(normalize(150), 100)
  assert.equal(normalize(0, 36), 0)
  for (const value of [undefined, null, '', '  ', 'invalid', false, {}, [], NaN, Infinity]) {
    assert.equal(normalize(value, 36), 36)
  }
  assert.equal(normalize(undefined), 0)
})

test('ordinary task polling keeps progress across omitted fields and persists only changed percentages', async () => {
  const { exports, calls, setResponse } = harness()
  const run = makeRun()
  await exports.pollAssetImageTask(run)
  assert.equal(run.progress, 36)
  assert.equal(calls.persisted[0].progress, 36)
  assert.equal(calls.persisted[0].lookId, 31)
  for (const progress of [undefined, null, '', 'invalid', 36]) {
    setResponse({ id: 'task-1', status: 2, progress })
    await exports.pollAssetImageTask(run)
    assert.equal(run.progress, 36)
    assert.equal(calls.patches.at(-1).progress, 36)
  }
  assert.equal(calls.persisted.length, 1)
})

test('ordinary task query failures preserve the last progress through the paused query state', async () => {
  const { exports, calls, setError } = harness()
  const run = makeRun()
  await exports.pollAssetImageTask(run)
  setError(new Error('Offline'))
  await exports.pollAssetImageTask(run, 3)
  assert.equal(run.progress, 36)
  assert.equal(calls.patches.at(-1).phase, 'poll-failed')
  assert.equal(calls.patches.at(-1).progress, undefined, 'Do not overwrite the last view progress')
  assert.equal(calls.persisted.length, 1)
})

test('ordinary task storage restores progress and look identity and tolerates older drafts', () => {
  const { exports } = harness()
  const saved = exports.toPersistedAssetImageTask({ ...makeRun(), progress: 36 })
  const [restored] = exports.normalizePersistedAssetImageTasks([saved])
  assert.equal(restored.progress, 36)
  assert.equal(restored.lookId, 31)
  const old = { ...saved }
  delete old.progress
  assert.equal(exports.normalizePersistedAssetImageTasks([old])[0].progress, 0)
  assert.equal(exports.normalizePersistedAssetImageTasks([{ ...saved, progress: 150 }])[0].progress, 100)
})

test('confirmed task success stores completion before loading the generated asset', async () => {
  const { exports, calls, setResponse } = harness()
  const run = makeRun()
  setResponse({ id: 'task-1', status: 3, progress: null, result: '{"fileId":42}' })
  await exports.pollAssetImageTask(run)
  assert.equal(run.progress, 100)
  assert.equal(calls.persisted[0].progress, 100)
  assert.equal(calls.persisted[0].taskSucceeded, true)
  assert.deepEqual(calls.refreshed, [100])
})
