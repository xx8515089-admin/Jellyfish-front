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

function harness(options = {}) {
  const calls = { requests: [], pending: [], navigation: [], messages: [] }
  const exports = {}
  const context = {
    exports,
    currentStep: 2,
    scriptImportId: 39,
    assetCompletionRequestRef: { current: null },
    setAssetCompletionCheckPending: (value) => calls.pending.push(value),
    navigateToWorkflowStep: (step) => calls.navigation.push(step),
    l: (_zh, en) => en,
    getApiErrorMessage: (error, fallback) => error?.message || fallback,
    message: Object.fromEntries(['warning', 'error', 'info'].map((level) => [level, (text) => calls.messages.push({ level, text })])),
    StudioAssetGenerationApi: {
      requestEpisodeAssetsGenerateStatus: (input) => {
        const response = deferred()
        const request = { promise: response.promise, cancel() {} }
        calls.requests.push({ input: JSON.parse(JSON.stringify(input)), request, ...response })
        return request
      },
    },
    ...options,
  }
  vm.runInNewContext(compiled, context, { filename: 'ProjectCreatePage.handleNext.js' })
  return { calls, context, next: exports.handleNext }
}

test('next step verifies the entire script once without episodeId and navigates on completion', async () => {
  const env = harness()
  const next = env.next()
  assert.equal(env.calls.requests.length, 1)
  assert.deepEqual(env.calls.requests[0].input, { scriptImportId: 39 })
  assert.equal(Object.hasOwn(env.calls.requests[0].input, 'episodeId'), false)
  assert.deepEqual(env.calls.pending, [true])
  assert.deepEqual(env.calls.navigation, [])
  env.calls.requests[0].resolve({ allGenerated: true })
  await next
  assert.deepEqual(env.calls.navigation, [3])
  assert.deepEqual(env.calls.pending, [true, false])
  assert.equal(env.context.assetCompletionRequestRef.current, null)
  assert.deepEqual(env.calls.messages, [])
})

test('unfinished assets keep the current step and release the check for a later retry', async () => {
  const env = harness()
  const next = env.next()
  env.calls.requests[0].resolve({ allGenerated: false, shouldPoll: false })
  await next
  assert.deepEqual(env.calls.navigation, [])
  assert.equal(env.calls.messages.length, 1)
  assert.equal(env.calls.messages[0].level, 'warning')
  assert.equal(env.context.assetCompletionRequestRef.current, null)
  assert.deepEqual(env.calls.pending, [true, false])
})

test('a failed completion query can be retried successfully without leaving pending state stuck', async () => {
  const env = harness()
  const failed = env.next()
  env.calls.requests[0].reject(new Error('Network unavailable'))
  await failed
  assert.deepEqual(env.calls.navigation, [])
  assert.equal(env.context.assetCompletionRequestRef.current, null)
  assert.deepEqual(env.calls.messages, [{ level: 'error', text: 'Network unavailable' }])

  const retry = env.next()
  assert.equal(env.calls.requests.length, 2)
  env.calls.requests[1].resolve({ allGenerated: true })
  await retry
  assert.deepEqual(env.calls.navigation, [3])
  assert.deepEqual(env.calls.pending, [true, false, true, false])
})

test('rapid repeated clicks share the existing completion check and navigate at most once', async () => {
  const env = harness()
  const first = env.next()
  await Promise.all([env.next(), env.next()])
  assert.equal(env.calls.requests.length, 1)
  env.calls.requests[0].resolve({ allGenerated: true })
  await first
  assert.deepEqual(env.calls.navigation, [3])
  assert.deepEqual(env.calls.pending, [true, false])
})

test('clearing request ownership prevents both late success navigation and late failure notifications', async () => {
  for (const outcome of ['success', 'failure']) {
    const env = harness()
    const next = env.next()
    env.context.assetCompletionRequestRef.current = null
    if (outcome === 'success') env.calls.requests[0].resolve({ allGenerated: true })
    else env.calls.requests[0].reject(new Error('Late error from previous step'))
    await next
    assert.deepEqual(env.calls.navigation, [], outcome)
    assert.deepEqual(env.calls.messages, [], outcome)
    assert.deepEqual(env.calls.pending, [true], 'A stale request must not update pending state')
  }
})

test('an old completion response cannot clear or navigate over a newer request', async () => {
  const env = harness()
  const old = env.next()
  env.context.assetCompletionRequestRef.current = null
  const current = env.next()
  const currentRequest = env.calls.requests[1].request
  env.calls.requests[0].resolve({ allGenerated: true })
  await old
  assert.equal(env.context.assetCompletionRequestRef.current, currentRequest)
  assert.deepEqual(env.calls.navigation, [])
  assert.deepEqual(env.calls.pending, [true, true])
  env.calls.requests[1].resolve({ allGenerated: true })
  await current
  assert.deepEqual(env.calls.navigation, [3])
  assert.equal(env.context.assetCompletionRequestRef.current, null)
})

test('missing script identity cannot issue a completion query or advance', async () => {
  const env = harness({ scriptImportId: null })
  await env.next()
  assert.deepEqual(env.calls.requests, [])
  assert.deepEqual(env.calls.navigation, [])
  assert.deepEqual(env.calls.pending, [])
})
