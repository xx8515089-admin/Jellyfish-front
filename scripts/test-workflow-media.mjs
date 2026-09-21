import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { webcrypto } from 'node:crypto'

function load(name, context = {}) {
  const exports = {}
  const source = readFileSync(new URL(`../src/pages/aiStudio/project/${name}.ts`, import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, ...context })
  return exports
}
const policy = load('workflowMediaPolicy', { crypto: webcrypto })
test('request IDs remain UUID v4 without randomUUID', () => {
  const fallback = load('workflowMediaPolicy', { crypto: { getRandomValues: (bytes) => webcrypto.getRandomValues(bytes) } })
  const ids = Array.from({ length: 100 }, () => fallback.createWorkflowRequestId())
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(new Set(ids).size, ids.length)
})
test('request ID generation uses native UUID when available and reports missing crypto clearly', () => {
  const native = load('workflowMediaPolicy', { crypto: { randomUUID: () => 'native-uuid' } })
  assert.equal(native.createWorkflowRequestId(), 'native-uuid')
  assert.throws(() => load('workflowMediaPolicy').createWorkflowRequestId(), /当前浏览器不支持/)
})
for (const mediaType of ['image', 'video']) test(`${mediaType} generation exposes progress until output is ready`, async () => {
  const states = []
  const timers = []
  const ids = []
  const stored = new Map()
  let count = 0
  const hook = load('useWorkflowMedia', {
    AbortController,
    sessionStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) },
    crypto: { randomUUID: () => 'original-key' },
    require: (name) => {
      if (name === 'react') return {
        useCallback: (fn) => fn, useEffect: () => {}, useRef: (current) => ({ current }),
        useState: (initial) => { const index = states.push(initial) - 1; return [initial, (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
      }
      if (name.endsWith('/WorkflowService')) return { WorkflowService: {
        [mediaType === 'image' ? 'generateImage' : 'generateVideo']: async () => ({ code: 200, data: { id: 1, taskId: 276, segmentId: 10, status: 1 } }),
        [mediaType === 'image' ? 'imageDetail' : 'videoDetail']: ({ id }) => { ids.push(id); return Promise.resolve({ code: 200, data: ++count < 3 ? { id: 1, segmentId: 10, status: 2, shouldPoll: true, pollAfterSeconds: 3, progress: 100 } : { id: 1, segmentId: 10, status: 3, shouldPoll: false, outputReady: true, outputFileId: 90, outputUrl: 'https://example.invalid/media' } }) },
      } }
      if (name.endsWith('/auth')) return { getAuthToken: () => 'token', getStoredAuthUser: () => ({ id: 1 }) }
      if (name.endsWith('/OpenAPI')) return { OpenAPI: {} }
      if (name.endsWith('/request')) return { getHeaders: async () => new Headers({ language: 'en' }) }
      if (name.endsWith('/workflowMediaTransport')) return { workflowMediaRead: async () => ({ items: [], hasMore: false }) }
      if (name.endsWith('/workflowMediaPolicy')) return policy
      if (name.endsWith('/assetBatchGenerationPolling')) return { schedulePollWhenVisible: (fn) => { timers.push(fn); return () => {} } }
      throw new Error(name)
    },
  })
  const workflow = hook.useWorkflowMedia('10')
  await workflow.submit(mediaType, { segmentId: 10 })
  assert.equal(states[1]['10'][0].progress, 100)
  assert.deepEqual(ids, [1])
  timers.shift()()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(ids, [1, 1])
  assert.equal(states[1]['10'][0].status, 2)
  assert.equal(states[1]['10'][0].outputFileId, undefined)
  assert.equal(states[0]['10'], undefined)
  timers.shift()()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(states[1]['10'].length, 0)
  assert.equal(states[5].itemKey, `${mediaType}:1`)
  assert.equal(states[0]['10'].items[0].mediaType, mediaType)
  assert.equal(states[0]['10'].items[0].outputFileId, 90)
  assert.equal(timers.length, 0)
})
test('progress updates avoid history requests; task completion and timeout refresh history', () => {
  const task = { id: 1, mediaType: 'image', status: 2, progress: 10 }
  assert.equal(policy.shouldRefreshWorkflowHistory([task], [{ ...task, progress: 80 }]), false)
  assert.equal(policy.shouldRefreshWorkflowHistory([task], []), true)
  assert.equal(policy.shouldRefreshWorkflowHistory([task], [{ ...task, status: 6 }]), true)
  assert.equal(policy.shouldRefreshWorkflowHistory([task], [{ ...task, mediaType: 'video' }]), true)
})
test('ambiguous server failures retain the original submission identity', () => {
  assert.equal(policy.isDefiniteSubmissionRejection(new Error('timeout')), false)
  assert.equal(policy.isDefiniteSubmissionRejection({ status: 500, body: { code: 502 } }), false)
  assert.equal(policy.isDefiniteSubmissionRejection({ status: 502, body: { code: 502, data: { errorCode: 'IDEMPOTENCY_CONFLICT' } } }), false)
  assert.equal(policy.isDefiniteSubmissionRejection({ status: 422, body: { code: 502 } }), false)
})
test('authenticated conditional reads reuse 304 data and isolate accounts', async () => {
  let token = 'account-a'
  let index = 0
  const seen = []
  const transport = load('workflowMediaTransport', {
    Blob, require: (name) => name.endsWith('/OpenAPI') ? { OpenAPI: { BASE: '/jellyfish' } }
      : name.endsWith('/request') ? { getHeaders: async () => new Headers({ Authorization: token }) }
      : { ApiError: Error },
    fetch: async (url, options) => {
      seen.push({ url, etag: options.headers.get('If-None-Match') })
      return ++index === 2 ? new Response(null, { status: 304 })
        : new Response(JSON.stringify({ code: 200, data: { items: [token] } }), { headers: { ETag: 'version-1', 'Content-Type': 'application/json' } })
    },
  })
  const signal = new AbortController().signal
  const first = await transport.workflowMediaRead('/history', signal)
  assert.equal(await transport.workflowMediaRead('/history', signal), first)
  token = 'account-b'
  const second = await transport.workflowMediaRead('/history', signal)
  assert.equal(second.items[0], token)
  assert.deepEqual(seen.map((item) => item.etag), [null, 'version-1', null])
  assert.equal(seen[0].url, '/jellyfish/history')
})
test('thumbnail processing and unavailable responses carry retry delays', async () => {
  for (const [status, delay] of [[202, 3], [503, 300]]) {
    const transport = load('workflowMediaTransport', {
      Blob, require: (name) => name.endsWith('/OpenAPI') ? { OpenAPI: { BASE: '' } }
        : name.endsWith('/request') ? { getHeaders: async () => new Headers() } : { ApiError: Error },
      fetch: async () => new Response('{}', { status }),
    })
    await assert.rejects(transport.workflowMediaRead('/thumbnail', new AbortController().signal, true), (error) => error.retryAfter === delay)
  }
})

test('media unknown/mismatch/success without output stops polling; readiness is explicit', () => {
 for(const status of [3,4,5,6,7])assert.equal(policy.workflowShouldPoll({status,shouldPoll:true}),false)
 assert.equal(policy.workflowShouldPoll({status:2,shouldPoll:false}),false)
 assert.equal(policy.workflowShouldPoll({status:2,terminal:true}),false)
 assert.equal(policy.workflowShouldPoll({status:2}),true)
 assert.equal(policy.workflowPollDelay({pollAfterSeconds:9}),9000)
 assert.equal(policy.workflowPollDelay({}),3000)
 assert.equal(policy.workflowOutputReady({status:3,outputFileId:4,outputUrl:'url'}),false)
 assert.equal(policy.workflowOutputReady({status:3,outputReady:true,outputFileId:4,outputUrl:'url'}),true)
})
