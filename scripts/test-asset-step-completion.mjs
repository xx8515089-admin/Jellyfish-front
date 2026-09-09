import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/aiStudio/project/ProjectCreatePage.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('ProjectCreatePage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let declaration
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'handleNext') {
    declaration = node.getText(tree)
  }
  ts.forEachChild(node, visit)
}
visit(tree)
assert.ok(declaration, 'The production next-step handler must exist')
const compiled = ts.transpileModule(`const ${declaration}\nexport { handleNext }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const flushAsyncWork = () => new Promise((resolve) => setImmediate(resolve))

function harness(options = {}) {
  const calls = {
    statusRequests: [],
    confirmRequests: [],
    completionPending: [],
    confirmPending: [],
    navigation: [],
    messages: [],
    storyboardEpisodeIds: [],
    storyboardRunIds: [],
    storyboardEditorValues: [],
    storyboardErrors: [],
    storyboardRetryTokens: [],
  }
  const exports = {}
  const context = {
    exports,
    currentStep: 2,
    scriptImportId: 39,
    selectedAssetEpisodeId: 'episode-1',
    assetCompletionRequestRef: { current: null },
    assetConfirmRequestRef: { current: null },
    setAssetCompletionCheckPending: (value) => calls.completionPending.push(value),
    setAssetConfirmPending: (value) => calls.confirmPending.push(value),
    setStoryboardEpisodeId: (value) => calls.storyboardEpisodeIds.push(value),
    setStoryboardRunId: (value) => calls.storyboardRunIds.push(value),
    setStoryboardEditor: (value) => calls.storyboardEditorValues.push(value),
    setStoryboardEditorError: (value) => calls.storyboardErrors.push(value),
    setStoryboardEditorRetryToken: (update) => {
      calls.storyboardRetryTokens.push(typeof update === 'function' ? update(0) : update)
    },
    navigateToWorkflowStep: (step) => calls.navigation.push(step),
    l: (_zh, en) => en,
    getApiErrorMessage: (error, fallback) => error?.message || fallback,
    message: Object.fromEntries(['warning', 'error', 'info'].map((level) => [level, (text) => calls.messages.push({ level, text })])),
    StudioAssetGenerationApi: {
      requestEpisodeAssetsGenerateStatus: (input) => {
        const response = deferred()
        const request = { promise: response.promise, cancel() {} }
        calls.statusRequests.push({ input: JSON.parse(JSON.stringify(input)), request, ...response })
        return request
      },
      requestEpisodeAssetsConfirm: (input) => {
        const response = deferred()
        const request = { promise: response.promise, cancel() {} }
        calls.confirmRequests.push({ input: JSON.parse(JSON.stringify(input)), request, ...response })
        return request
      },
    },
    ...options,
  }
  vm.runInNewContext(compiled, context, { filename: 'ProjectCreatePage.handleNext.js' })
  return { calls, context, next: exports.handleNext }
}

test('next step verifies the selected episode, confirms assets and stores storyboard run id', async () => {
  const env = harness()
  const next = env.next()
  assert.equal(env.calls.statusRequests.length, 1)
  assert.deepEqual(env.calls.statusRequests[0].input, { scriptImportId: 39, episodeId: 'episode-1' })
  assert.deepEqual(env.calls.completionPending, [true])
  assert.deepEqual(env.calls.storyboardEpisodeIds, ['episode-1'])
  assert.deepEqual(env.calls.storyboardRunIds, [null])
  assert.deepEqual(env.calls.storyboardEditorValues, [null])
  assert.deepEqual(env.calls.storyboardErrors, [undefined])
  assert.deepEqual(env.calls.navigation, [])

  env.calls.statusRequests[0].resolve({ allGenerated: true })
  await flushAsyncWork()
  assert.equal(env.calls.confirmRequests.length, 1)
  assert.deepEqual(env.calls.confirmRequests[0].input, { scriptImportId: 39, episodeId: 'episode-1' })
  assert.deepEqual(env.calls.confirmPending, [true])

  env.calls.confirmRequests[0].resolve({ runId: 'storyboard-run-9' })
  await next
  assert.deepEqual(env.calls.navigation, [3])
  assert.deepEqual(env.calls.completionPending, [true, false])
  assert.deepEqual(env.calls.confirmPending, [true, false])
  assert.deepEqual(env.calls.storyboardEpisodeIds, ['episode-1', 'episode-1'])
  assert.deepEqual(env.calls.storyboardRunIds, [null, 'storyboard-run-9'])
  assert.deepEqual(env.calls.storyboardEditorValues, [null, null])
  assert.deepEqual(env.calls.storyboardErrors, [undefined, undefined])
  assert.deepEqual(env.calls.storyboardRetryTokens, [1])
  assert.equal(env.context.assetCompletionRequestRef.current, null)
  assert.equal(env.context.assetConfirmRequestRef.current, null)
  assert.deepEqual(env.calls.messages, [])
})

test('unfinished assets keep the current step and release the check for a later retry', async () => {
  const env = harness()
  const next = env.next()
  env.calls.statusRequests[0].resolve({ allGenerated: false, shouldPoll: false })
  await next
  assert.deepEqual(env.calls.confirmRequests, [])
  assert.deepEqual(env.calls.navigation, [])
  assert.equal(env.calls.messages.length, 1)
  assert.equal(env.calls.messages[0].level, 'warning')
  assert.equal(env.context.assetCompletionRequestRef.current, null)
  assert.equal(env.context.assetConfirmRequestRef.current, null)
  assert.deepEqual(env.calls.completionPending, [true, false])
})

test('a failed completion query can be retried and then confirmed successfully', async () => {
  const env = harness()
  const failed = env.next()
  env.calls.statusRequests[0].reject(new Error('Network unavailable'))
  await failed
  assert.deepEqual(env.calls.navigation, [])
  assert.equal(env.context.assetCompletionRequestRef.current, null)
  assert.deepEqual(env.calls.messages, [{ level: 'error', text: 'Network unavailable' }])

  const retry = env.next()
  assert.equal(env.calls.statusRequests.length, 2)
  env.calls.statusRequests[1].resolve({ allGenerated: true })
  await flushAsyncWork()
  assert.equal(env.calls.confirmRequests.length, 1)
  env.calls.confirmRequests[0].resolve({ editor: { storyboard: { runId: 'run-from-editor' } } })
  await retry
  assert.deepEqual(env.calls.navigation, [3])
  assert.deepEqual(env.calls.completionPending, [true, false, true, false])
  assert.deepEqual(env.calls.confirmPending, [false, true, false])
  assert.deepEqual(env.calls.storyboardRunIds, [null, null, 'run-from-editor'])
})

test('rapid repeated clicks share the existing completion check and navigate at most once', async () => {
  const env = harness()
  const first = env.next()
  await Promise.all([env.next(), env.next()])
  assert.equal(env.calls.statusRequests.length, 1)
  env.calls.statusRequests[0].resolve({ allGenerated: true })
  await flushAsyncWork()
  assert.equal(env.calls.confirmRequests.length, 1)
  await env.next()
  assert.equal(env.calls.statusRequests.length, 1)
  assert.equal(env.calls.confirmRequests.length, 1)
  env.calls.confirmRequests[0].resolve({ runId: 'storyboard-run-once' })
  await first
  assert.deepEqual(env.calls.navigation, [3])
  assert.deepEqual(env.calls.completionPending, [true, false])
  assert.deepEqual(env.calls.confirmPending, [true, false])
})

test('clearing request ownership prevents both late success navigation and late failure notifications', async () => {
  for (const outcome of ['success', 'failure']) {
    const env = harness()
    const next = env.next()
    env.context.assetCompletionRequestRef.current = null
    if (outcome === 'success') env.calls.statusRequests[0].resolve({ allGenerated: true })
    else env.calls.statusRequests[0].reject(new Error('Late error from previous step'))
    await next
    assert.deepEqual(env.calls.navigation, [], outcome)
    assert.deepEqual(env.calls.messages, [], outcome)
    assert.deepEqual(env.calls.confirmRequests, [], outcome)
    assert.deepEqual(env.calls.completionPending, [true], 'A stale request must not update completion pending state')
  }
})

test('an old completion response cannot clear or navigate over a newer request', async () => {
  const env = harness()
  const old = env.next()
  env.context.assetCompletionRequestRef.current = null
  const current = env.next()
  const currentRequest = env.calls.statusRequests[1].request
  env.calls.statusRequests[0].resolve({ allGenerated: true })
  await old
  assert.equal(env.context.assetCompletionRequestRef.current, currentRequest)
  assert.deepEqual(env.calls.navigation, [])
  assert.deepEqual(env.calls.completionPending, [true, true])
  env.calls.statusRequests[1].resolve({ allGenerated: true })
  await flushAsyncWork()
  assert.equal(env.calls.confirmRequests.length, 1)
  env.calls.confirmRequests[0].resolve({ runId: 'current-run' })
  await current
  assert.deepEqual(env.calls.navigation, [3])
  assert.equal(env.context.assetCompletionRequestRef.current, null)
  assert.equal(env.context.assetConfirmRequestRef.current, null)
})

test('a failed asset confirmation releases ownership and reports the confirmation error', async () => {
  const env = harness()
  const next = env.next()
  env.calls.statusRequests[0].resolve({ allGenerated: true })
  await flushAsyncWork()
  env.calls.confirmRequests[0].reject(new Error('Confirm unavailable'))
  await next
  assert.deepEqual(env.calls.navigation, [])
  assert.equal(env.context.assetCompletionRequestRef.current, null)
  assert.equal(env.context.assetConfirmRequestRef.current, null)
  assert.deepEqual(env.calls.completionPending, [true, false])
  assert.deepEqual(env.calls.confirmPending, [true, false])
  assert.deepEqual(env.calls.messages, [{ level: 'error', text: 'Confirm unavailable' }])
})

test('missing selected episode cannot issue a completion query or advance', async () => {
  const env = harness({ selectedAssetEpisodeId: null })
  await env.next()
  assert.deepEqual(env.calls.statusRequests, [])
  assert.deepEqual(env.calls.confirmRequests, [])
  assert.deepEqual(env.calls.navigation, [])
  assert.deepEqual(env.calls.completionPending, [])
  assert.deepEqual(env.calls.confirmPending, [])
  assert.deepEqual(env.calls.messages, [{
    level: 'warning',
    text: 'Choose an episode before entering clip editing.',
  }])
})

test('missing script identity cannot issue a completion query or advance', async () => {
  const env = harness({ scriptImportId: null })
  await env.next()
  assert.deepEqual(env.calls.statusRequests, [])
  assert.deepEqual(env.calls.confirmRequests, [])
  assert.deepEqual(env.calls.navigation, [])
  assert.deepEqual(env.calls.completionPending, [])
  assert.deepEqual(env.calls.confirmPending, [])
})
