// Audit evidence, NOT a correctness regression suite: these assertions reproduce
// defects in the 2026-09-20 working tree. After repair, replace with desired behavior.
// No network requests, services, or paid generations are performed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText
const load = (path, context = {}) => {
  const exports = {}
  vm.runInNewContext(compile(read(path)), { exports, ...context })
  return exports
}
function nodes(path, predicate) {
  const tree = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []
  function visit(node) { if (predicate(node)) found.push(node.getText(tree)); ts.forEachChild(node, visit) }
  visit(tree)
  return found
}
const project = 'pages/aiStudio/project/'
const policy = load(`${project}workflowMediaPolicy.ts`, { crypto: { randomUUID: () => 'audit-key' } })
const tick = () => new Promise((resolve) => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
function mediaHarness(overrides = {}) {
  const states = [], timers = [], stored = new Map()
  let sequence = 0
  const api = {
    generateVideo: async () => ({ code: 200, data: { id: 1, segmentId: 10, status: 1 } }),
    videoDetail: async () => ({ code: 200, data: { id: 1, segmentId: 10, status: 6 } }),
    ...overrides,
  }
  const exports = load(`${project}useWorkflowMedia.ts`, {
    AbortController,
    sessionStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) },
    require: (name) => {
      if (name === 'react') return {
        useCallback: (fn) => fn, useEffect: () => {}, useRef: (current) => ({ current }),
        useState: (initial) => { const i = states.push(initial) - 1; return [initial, (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v }] },
      }
      if (name.endsWith('/WorkflowService')) return { WorkflowService: api }
      if (name.endsWith('/auth')) return { getAuthToken: () => 'token', getStoredAuthUser: () => ({ id: 1 }) }
      if (name.endsWith('/OpenAPI')) return { OpenAPI: {} }
      if (name.endsWith('/request')) return { getHeaders: async () => new Headers({ language: 'en' }) }
      if (name.endsWith('/workflowMediaTransport')) return { workflowMediaRead: async () => ({ items: [], hasMore: false }) }
      if (name.endsWith('/workflowMediaPolicy')) return { ...policy, createWorkflowRequestId: () => `request-${++sequence}` }
      if (name.endsWith('/assetBatchGenerationPolling')) return { schedulePollWhenVisible: (fn) => { timers.push(fn); return () => {} } }
      throw new Error(`Unexpected import ${name}`)
    },
  })
  return { workflow: exports.useWorkflowMedia(undefined), states, timers, stored }
}

test('REPRO FE-01: a restored local prompt is overwritten by detail hydration', () => {
  const path = `${project}ProjectClipEditingStep.tsx`
  const declaration = nodes(path, (n) => ts.isVariableDeclaration(n) && n.name.getText() === 'manuallyEditedPromptClipIdsRef')[0]
  const setter = nodes(path, (n) => ts.isCallExpression(n) && n.expression.getText() === 'setPromptByClip'
    && n.arguments[0]?.getText().includes('manuallyEditedPromptClipIdsRef.current.has(clipId)'))[0]
  assert.ok(declaration && setter)
  let prompt = { '10': 'UNSAVED LOCAL PROMPT' }
  vm.runInNewContext(compile(`const ${declaration}; ${setter}`), {
    useRef: (current) => ({ current }), clipId: '10', directorPrompt: 'OLD SERVER PROMPT',
    setPromptByClip: (update) => { prompt = update(prompt) },
  })
  assert.equal(prompt['10'], 'OLD SERVER PROMPT')
})

test('REPRO FE-02: project draft remains readable after account change', () => {
  const stored = new Map()
  const window = { localStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) } }
  const auth = load('auth.ts', { window })
  const drafts = load(`${project}projectCreationDraft.ts`, { window, require: () => ({}) })
  auth.createAuthSession('a', { id: 'a' }, [])
  const key = drafts.PROJECT_CREATION_DRAFT_KEYS.project
  window.localStorage.setItem(key, JSON.stringify({ version: 2, updatedAt: Date.now(), data: { script: 'ACCOUNT A SCRIPT' } }))
  auth.clearAuthSession()
  auth.createAuthSession('b', { id: 'b' }, [])
  assert.equal(auth.getStoredAuthUser().id, 'b')
  assert.equal(drafts.readProjectCreationDraft(key).script, 'ACCOUNT A SCRIPT')
})

test('REPRO FE-03: late recovery of A clears newer pending submission B', async () => {
  const queries = []
  const h = mediaHarness({
    generateVideo: async () => { throw new Error('timeout') },
    submission: () => { const q = deferred(); queries.push(q); return q.promise },
  })
  await assert.rejects(h.workflow.submit('video', { segmentId: 10 }), /timeout/)
  const first = h.workflow.recover()
  const second = h.workflow.recover()
  const accepted = { code: 200, data: { generationRecordId: 1, segmentId: 10 } }
  queries[1].resolve(accepted); await second
  await assert.rejects(h.workflow.submit('video', { segmentId: 20 }), /timeout/)
  assert.equal(h.states[4].body.clientRequestId, 'request-2')
  queries[0].resolve(accepted); await first; await tick()
  assert.equal(h.states[4], undefined)
  assert.equal(h.stored.size, 0)
})

test('REPRO FE-04: generic 502 discards original request identity', async () => {
  const failure = { status: 502, body: { code: 502, message: 'upstream timeout' } }
  assert.equal(policy.isDefiniteSubmissionRejection(failure), true)
  const h = mediaHarness({ generateVideo: async () => { throw failure } })
  await assert.rejects(h.workflow.submit('video', { segmentId: 10 }))
  assert.equal(h.states[4], undefined)
  assert.equal(h.stored.size, 0)
})

test('REPRO FE-05a: outputReady=false is marked complete when output URLs exist', async () => {
  const h = mediaHarness({ videoDetail: async () => ({ code: 200, data: {
    id: 1, segmentId: 10, status: 3, outputFileId: 8, outputUrl: 'https://example.invalid/video', outputReady: false, shouldPoll: true,
  } }) })
  await h.workflow.submit('video', { segmentId: 10 }); await tick()
  assert.equal(h.timers.length, 0)
  assert.equal(h.states[5].itemKey, 'video:1')
  assert.equal(h.states[1]['10'].length, 0)
})

test('REPRO FE-05b: shouldPoll=false/terminal=true still schedules a status-2 poll', async () => {
  const h = mediaHarness({ videoDetail: async () => ({ code: 200, data: {
    id: 1, segmentId: 10, status: 2, terminal: true, shouldPoll: false,
  } }) })
  await h.workflow.submit('video', { segmentId: 10 }); await tick()
  assert.equal(h.timers.length, 1)
})

test('REPRO FE-06a: dubbing timeout unlocks another generation without recovery', async () => {
  const path = `${project}StoryboardDubbingPanel.tsx`
  const act = nodes(path, (n) => ts.isFunctionDeclaration(n) && n.name?.text === 'act')[0]
  const generate = nodes(path, (n) => ts.isArrowFunction(n) && n.getText().includes('const generation = await api.generate(source.id, format, modelId)'))
    .sort((a, b) => a.length - b.length)[0]
  assert.ok(act && generate)
  let busy = false, calls = 0, updates = 0
  const line = { id: '1', dialogueText: 'hello' }
  const context = vm.createContext({
    busyRef: { current: false }, setBusy: (value) => { busy = value }, alive: { current: true },
    message: { error: () => {} }, getApiErrorMessage: () => 'timeout', line,
    panel: { lines: [line] }, fieldsOf: (value) => value, settings: {}, format: 'mp3', modelId: undefined,
    setPanel: () => { updates++ },
    api: { updateLine: async () => {}, updateSettings: async () => {}, generate: async () => { calls++; throw new Error('timeout') } },
  })
  vm.runInContext(compile(`${act}; globalThis.action = ${generate}`), context)
  await vm.runInContext('act(action)', context)
  assert.equal(busy, false)
  assert.equal(updates, 0)
  await vm.runInContext('act(action)', context)
  assert.equal(calls, 2)
})

test('REPRO FE-07: stale ordinal drops a selected version after segment insertion', () => {
  const service = load('services/storyboardExport.ts', { require: () => ({}) })
  // Segment 10 was index 2 when chosen; an insertion above moved it to index 3.
  const selected = { segmentId: 10, generationId: 99, mediaType: 'video', episodeId: 7, episodeIndex: 1, segmentIndex: 2 }
  const request = service.buildExportRequest({ scriptImportId: 1, dimension: 'segment', episodeId: 7, scope: 'custom', start: 3, end: 3, content: 'media' }, [selected])
  assert.equal(request.mediaSelections, undefined)
})
