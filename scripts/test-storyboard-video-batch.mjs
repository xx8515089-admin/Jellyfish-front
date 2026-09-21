import { createUiTextFixture } from './ui-text-fixture.mjs'
const ui = createUiTextFixture()
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(path, context = {}) {
  const exports = {}
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, ...context })
  return exports
}
const batchErrors = load('src/services/storyboardVideoBatchErrors.ts', { require: () => ({ getApiErrorMessage: (error, fallback) => error?.body?.message || error?.message || fallback }) })
const policy = load('src/pages/aiStudio/project/storyboardVideoBatchPolicy.ts', { require: () => batchErrors })
const plain = (value) => JSON.parse(JSON.stringify(value))
const scope = { scriptImportId: 500, episodeId: 1500 }
const settings = { modelId: 4, resolution: '720p', aspectRatio: '16:9', durationSeconds: null, generateAudio: true, inheritPreviousVideo: true }
const candidates = [
  { segmentId: 11, segmentIndex: 1, revisionNo: 2, hasPrompt: true, selectable: true, latestVideoGenerationId: null },
  { segmentId: 12, segmentIndex: 2, revisionNo: 3, hasPrompt: false, selectable: true, latestVideoGenerationId: 99, videoState: 'failed' },
  { segmentId: 13, segmentIndex: 3, revisionNo: 4, hasPrompt: true, selectable: false, latestVideoGenerationId: null, videoState: 'needsReview' },
]
const valid = { valid: true, sufficient: true, fingerprint: 'fingerprint', estimatedCredits: 0, items: [], currentBalance: 0 }
test('selection uses latest successful version and excludes protected segments, respecting the server limit', () => {
  assert.deepEqual(plain(policy.batchSelectableIds(candidates, 50, true)), [11])
  assert.deepEqual(plain(policy.batchSelectableIds(candidates, 1)), [11])
  assert.deepEqual(plain(policy.batchSelectableIds(candidates, 50)), [11, 12])
})
test('request preserves current drafts, revisions, auto/per-item durations and explicit continuity false', () => {
  const request = policy.buildVideoBatchRequest(scope, { ...settings, inheritPreviousVideo: false }, candidates, [12, 11, 13], { 11: 'UNSAVED', 'image:12': 'not a video prompt' }, { 12: 8 }, { 12: 2.5 })
  assert.equal(request.settings.inheritPreviousVideo, false)
  assert.deepEqual(plain(request.items), [
    { segmentId: 11, expectedRevisionNo: 2, prompt: 'UNSAVED', durationSeconds: null, referenceVideoDurationSeconds: 0 },
    { segmentId: 12, expectedRevisionNo: 3, durationSeconds: 8, referenceVideoDurationSeconds: 2.5 },
  ])
})
test('zero-price quote is valid; confirmation, sufficient balance, fingerprint and budget are all required', () => {
  assert.equal(policy.canSubmitVideoBatch(valid, 0, true), true)
  for (const preview of [{ ...valid, valid: false }, { ...valid, sufficient: false }, { ...valid, fingerprint: null }, { ...valid, estimatedCredits: 12 }, { ...valid, estimatedCredits: NaN }]) {
    assert.equal(policy.canSubmitVideoBatch(preview, 0, true), false)
  }
  for (const budget of [null, -1, Infinity, 0.001]) assert.equal(policy.canSubmitVideoBatch(valid, budget, true), false)
  assert.equal(policy.canSubmitVideoBatch(valid, 0, false), false)
})
test('uncertain submissions and conflicts retain identity; explicit validation rejects release it', () => {
  const error = (code) => ({ status: 502, body: { code: 502, data: { errorCode: code } } })
  for (const reason of [new Error('timeout'), { status: 500 }, error('IDEMPOTENCY_CONFLICT'), error('VIDEO_BATCH_RESULT_UNCERTAIN'), error('VIDEO_BATCH_SUBMISSION_NOT_FOUND')]) assert.equal(policy.isVideoBatchRejected(reason), false)
  assert.equal(policy.isVideoBatchRejected(error('VIDEO_BATCH_PREVIEW_CHANGED')), true)
  assert.equal(policy.isVideoBatchRejected({ status: 422 }), true)
})

function hooks() {
  const slots = []; const effects = []; let cursor = 0; let dirty = false; let renderFn; let value
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]))
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, (next) => { const previous = slots[index].value; slots[index].value = typeof next === 'function' ? next(previous) : next; if (!Object.is(previous, slots[index].value)) dirty = true }]
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    useCallback(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, fn }; return slots[index].fn },
    useEffect(fn, deps) {
      const index = cursor++
      if (!same(slots[index]?.deps, deps)) { const cleanup = slots[index]?.cleanup; slots[index] = { deps }; effects.push(() => { cleanup?.(); slots[index].cleanup = fn() }) }
    },
  }
  return {
    react,
    render(fn = renderFn) { renderFn = fn; cursor = 0; dirty = false; value = fn(); while (effects.length) effects.shift()(); return value },
    async settle() { for (let i = 0; i < 12; i++) { await new Promise((resolve) => setImmediate(resolve)); if (dirty) this.render() } return value },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()) },
  }
}
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function timerQueue() {
  const queue = new Map(); let next = 0
  return { set(fn) { queue.set(++next, fn); return next }, clear(id) { queue.delete(id) }, run() { const entry = queue.entries().next().value; if (entry) { queue.delete(entry[0]); entry[1]() } }, get size() { return queue.size } }
}
function hookFixture(apiOverrides = {}, stored = new Map()) {
  const runner = hooks(); const timers = timerQueue(); const changes = []; const requests = []
  const account = { id: 9, token: 'token' }
  const currentScope = { ...scope }
  const api = { list: async () => [], detail: async () => { throw new Error('unexpected detail') }, create: async (body) => { requests.push(plain(body)); throw new Error('timeout') }, submission: async () => { throw new Error('timeout') }, ...apiOverrides }
  const exports = load('src/pages/aiStudio/project/useStoryboardVideoBatches.ts', {
    sessionStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) },
    require(name) {
      if (name.endsWith('/i18n/uiText')) return ui
    if (name === 'react') return runner.react
      if (name.endsWith('/auth')) return { getAuthToken: () => account.token, getStoredAuthUser: () => ({ id: account.id }) }
      if (name.endsWith('/apiErrors')) return { getApiErrorMessage: (error) => error.message }
      if (name.endsWith('/storyboardVideoBatchErrors')) return batchErrors
      if (name.endsWith('/storyboardVideoBatch')) return { StoryboardVideoBatchApi: api }
      if (name.endsWith('/storyboardVideoBatchPolicy')) return policy
      if (name.endsWith('/assetBatchGenerationPolling')) return { schedulePollWhenVisible: (fn) => { const id = timers.set(fn); return () => timers.clear(id) } }
      throw new Error(name)
    },
  })
  runner.render(() => exports.useStoryboardVideoBatches(currentScope, (batch) => changes.push(batch)))
  return { runner, stored, requests, timers, changes, account, currentScope }
}
const original = { clientRequestId: 'stable-request', previewFingerprint: 'original-fingerprint', maxTotalCredits: 0, request: { ...scope, settings, items: [{ segmentId: 11, expectedRevisionNo: 2, prompt: 'UNSAVED' }] }, retryOfBatchId: null }
const detail = { ...scope, id: 90, status: 'running', shouldPoll: true, items: [{ segmentId: 11, status: 'submitted', generationId: 91 }] }
test('timeout and reload preserve the full request; resend never substitutes a new identity or draft', async () => {
  const first = hookFixture(); let state = await first.runner.settle()
  await assert.rejects(state.send(original), /timeout/)
  state = await first.runner.settle()
  assert.equal(state.pending.clientRequestId, original.clientRequestId)
  first.runner.unmount()
  const next = hookFixture({}, first.stored); state = await next.runner.settle()
  await assert.rejects(state.send({ ...original, clientRequestId: 'wrong-new-id' }), /timeout/)
  assert.deepEqual(next.requests[0], original)
  next.runner.unmount()
})
test('double submit dispatches once and acceptance clears recovery storage', async () => {
  const accepted = deferred(); let calls = 0
  const fixture = hookFixture({ create: () => { calls++; return accepted.promise } })
  const state = await fixture.runner.settle()
  const one = state.send(original); const two = state.send(original)
  assert.equal(calls, 1)
  accepted.resolve(detail); await Promise.all([one, two])
  const updated = await fixture.runner.settle()
  assert.equal(updated.pending, undefined); assert.equal(fixture.stored.size, 0)
  assert.equal(updated.batches[0].id, 90)
  fixture.runner.unmount()
})
test('retries call the retry endpoint and structured preview changes clear the pending submission', async () => {
  let body
  const fixture = hookFixture({ retry: async (request) => { body = request; throw { status: 502, body: { data: { errorCode: 'VIDEO_BATCH_PREVIEW_CHANGED' } } } } })
  const state = await fixture.runner.settle()
  await assert.rejects(state.send({ ...original, retryOfBatchId: 8 }))
  assert.equal(body.retryOfBatchId, 8)
  assert.equal((await fixture.runner.settle()).pending, undefined)
  fixture.runner.unmount()
})
test('restored batches poll until shouldPoll=false; progress alone does not refresh clip history', async () => {
  let read = 0
  const fixture = hookFixture({ list: async () => [detail], detail: async () => ++read === 1
    ? { ...detail, items: [{ ...detail.items[0], progress: 80 }] }
    : { ...detail, status: 'succeeded', shouldPoll: false, items: [{ ...detail.items[0], status: 'succeeded' }] } })
  await fixture.runner.settle(); assert.equal(fixture.timers.size, 1)
  fixture.timers.run(); await fixture.runner.settle(); assert.equal(fixture.changes.length, 1)
  fixture.timers.run(); await fixture.runner.settle(); assert.equal(fixture.changes.length, 2)
  assert.equal(fixture.timers.size, 0)
  fixture.runner.unmount()
})

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer), ...nodes(tree.props?.description), ...nodes(tree.props?.items?.map((item) => item.children))]
}
const textOf = (value) => Array.isArray(value) ? value.map(textOf).join('') : typeof value === 'string' || typeof value === 'number' ? String(value) : value?.props ? textOf(value.props.children) : ''
test('modal discards stale previews, re-previews continuity toggles and submits the original frozen request', async () => {
  const runner = hooks(); const timers = timerQueue(); const previews = []; const sent = []
  const antd = Object.fromEntries(['Alert', 'Button', 'Checkbox', 'Collapse', 'InputNumber', 'Modal', 'Select', 'Space', 'Spin', 'Switch', 'Tag'].map((name) => [name, name]))
  antd.Input = { TextArea: 'TextArea' }; antd.Empty = 'Empty'
  const exports = load('src/pages/aiStudio/project/StoryboardVideoBatchModal.tsx', {
    window: { setTimeout: (fn) => timers.set(fn), clearTimeout: (id) => timers.clear(id) },
    require(name) {
      if (name.endsWith('/i18n/uiText')) return ui
    if (name === 'react') return runner.react
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }
      if (name === 'antd') return antd
      if (name.endsWith('.css')) return {}
      if (name.endsWith('/auth')) return { getAuthToken: () => 'token' }
      if (name.endsWith('/apiErrors')) return { getApiErrorMessage: (error) => error.message }
      if (name.endsWith('/storyboardVideoBatchErrors')) return batchErrors
      if (name.endsWith('/studioModels')) return { StudioModelsApi: { getVideoModels: async () => [{ id: 4, name: 'Video', defaultModel: true, videoCapabilities: { resolutions: ['720p'], nativeAudioSupported: true } }] } }
      if (name.endsWith('/storyboardVideoBatch')) return { StoryboardVideoBatchApi: { candidates: async () => ({ maxItems: 50, items: candidates }), preview: (request) => { const job = deferred(); previews.push({ ...job, request: plain(request) }); return job.promise } } }
      if (name.endsWith('/utils')) return { resolveAssetUrl: (url) => url }
      if (name.endsWith('/storyboardVideoBatchPolicy')) return policy
      if (name.endsWith('/workflowMediaPolicy')) return { createWorkflowRequestId: () => 'one-id' }
      if (name.endsWith('/useStoryboardVideoBatches')) return { useStoryboardVideoBatches: () => ({ batches: [], busy: false, send: async (request) => { sent.push(plain(request)); return detail } }) }
      throw new Error(name)
    },
  })
  let tree = runner.render(() => exports.default({ ...scope, open: true, ratio: '16:9', promptDrafts: { 11: 'UNSAVED' }, visualStyleOptions: [], toneStyleOptions: [], onBatchChange() {}, onPromptChange() {}, onClose() {} }))
  tree = await runner.settle()
  nodes(tree).find((node) => node.type === 'Button' && textOf(node) === '选择未生成').props.onClick()
  tree = await runner.settle(); timers.run(); await runner.settle()
  assert.equal(previews.length, 1)
  nodes(tree).find((node) => node.type === 'label' && textOf(node) === '视频衔接').props.children[1].props.onChange(false)
  tree = await runner.settle(); timers.run(); await runner.settle()
  assert.equal(previews.length, 2)
  previews[1].resolve({ ...valid, fingerprint: 'new', items: [{ segmentId: 11, valid: true, prompt: 'RESOLVED DO NOT COPY', durationSeconds: 8, estimatedCredits: 0 }] })
  tree = await runner.settle()
  previews[0].resolve({ ...valid, fingerprint: 'stale', estimatedCredits: 999 })
  tree = await runner.settle()
  assert.ok(!textOf(tree).includes('999'))
  nodes(tree).find((node) => node.type === 'Checkbox' && textOf(node) === '确认本次报价及预算上限').props.onChange({ target: { checked: true } })
  tree = await runner.settle()
  const submit = nodes(tree).find((node) => node.type === 'Button' && textOf(node) === '生成 1 个片段')
  assert.equal(submit.props.disabled, false)
  submit.props.onClick(); await runner.settle()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].previewFingerprint, 'new')
  assert.equal(sent[0].request.settings.inheritPreviousVideo, false)
  assert.equal(sent[0].request.items[0].prompt, 'UNSAVED')
  assert.deepEqual(sent[0].request, previews[1].request)
  runner.unmount()
})

test('all seven routes use the shared client, and HTTP-200 business errors preserve stable codes', async () => {
  const seen = []; let fail = false
  const service = load('src/services/storyboardVideoBatch.ts', { require: (name) => name.endsWith('/OpenAPI') ? { OpenAPI: { BASE: '/jellyfish' } } : { request: async (config, options) => { seen.push({ config, options }); return fail ? { code: 502, data: { errorCode: 'VIDEO_BATCH_SCHEMA_REQUIRED' } } : { code: 200, data: [] } } } }).StoryboardVideoBatchApi
  await service.candidates(scope); await service.preview(original.request); await service.create(original)
  await service.detail(90); await service.submission('one-id'); await service.list(scope, 80); await service.retry({ ...original, retryOfBatchId: 8 })
  assert.deepEqual(seen.map((entry) => [entry.options.method, entry.options.url.split('/batches')[1]]), [['GET', '/candidates'], ['POST', '/preview'], ['POST', '/create'], ['GET', '/detail'], ['GET', '/submission'], ['GET', ''], ['POST', '/retry']])
  assert.equal(seen[5].options.query.beforeId, 80)
  assert.equal(seen[0].config.BASE, '/jellyfish')
  fail = true
  await assert.rejects(service.candidates(scope), (error) => policy.videoBatchErrorCode(error) === 'VIDEO_BATCH_SCHEMA_REQUIRED')
})

test('switching accounts clears the old account submission and ignores its late acceptance', async () => {
  const accepted = deferred()
  const fixture = hookFixture({ create: () => accepted.promise })
  let state = await fixture.runner.settle()
  const inFlight = state.send(original)
  state = await fixture.runner.settle()
  assert.equal(state.pending.clientRequestId, 'stable-request')
  fixture.account.id = 10; fixture.account.token = 'other-account'
  fixture.runner.render(); state = await fixture.runner.settle()
  assert.equal(state.pending, undefined)
  assert.equal(state.busy, false)
  accepted.resolve(detail); await inFlight
  state = await fixture.runner.settle()
  assert.equal(state.batches.length, 0)
  assert.equal(fixture.stored.size, 1, 'old account keeps its recovery record')
  fixture.runner.unmount()
})
// Exercise the real modal and submission hook together, with only the transport mocked.
function batchModalFixture({ failFirst = true, stored = new Map(), initialDrafts = { 11: 'ORIGINAL' }, apiOverrides = {}, modelOptions } = {}) {
  const runner = hooks(); const timers = timerQueue(); const sent = []; const previews = []; const lookups = []
  let uuidCount = 0; let candidateLoads = 0; let lookupError
  let tree; let hookState
  const accepted = { ...detail, status: 'failed', shouldPoll: false, items: [{ ...detail.items[0], id: 101, status: 'failed', retryable: true }] }
  const api = {
    list: async () => [], detail: async () => accepted,
    candidates: async () => { candidateLoads++; return { maxItems: 50, items: [{ ...candidates[0], hasPrompt: false }] } },
    preview: async (request) => { previews.push(plain(request)); return { ...valid, fingerprint: 'fingerprint', items: [] } },
    create: async (request) => { sent.push(plain(request)); if (failFirst && sent.length === 1) throw new Error('timeout'); return accepted },
    submission: async (id) => { lookups.push(id); if (lookupError) throw lookupError; return accepted },
    retry: async (request) => { sent.push(plain(request)); return accepted },
    ...apiOverrides,
  }
  const antd = Object.fromEntries(['Alert', 'Button', 'Checkbox', 'Collapse', 'InputNumber', 'Modal', 'Select', 'Space', 'Spin', 'Switch', 'Tag'].map((name) => [name, name]))
  antd.Input = { TextArea: 'TextArea' }; antd.Empty = 'Empty'
  let hook
  const require = (name) => {
    if (name.endsWith('/i18n/uiText')) return ui
    if (name === 'react') return runner.react
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }
    if (name === 'antd') return antd
    if (name.endsWith('.css')) return {}
    if (name.endsWith('/auth')) return { getAuthToken: () => 'token', getStoredAuthUser: () => ({ id: 9 }) }
    if (name.endsWith('/apiErrors')) return { getApiErrorMessage: (error) => error.message }
      if (name.endsWith('/storyboardVideoBatchErrors')) return batchErrors
    if (name.endsWith('/studioModels')) return { StudioModelsApi: { getVideoModels: async () => (modelOptions ?? [{ id: 4, name: 'Video', defaultModel: true, videoCapabilities: { resolutions: ['720p'], nativeAudioSupported: true } }]) } }
    if (name.endsWith('/storyboardVideoBatch')) return { StoryboardVideoBatchApi: api }
    if (name.endsWith('/utils')) return { resolveAssetUrl: (url) => url }
    if (name.endsWith('/storyboardVideoBatchPolicy')) return policy
    if (name.endsWith('/workflowMediaPolicy')) return { createWorkflowRequestId: () => `uuid-${++uuidCount}` }
    if (name.endsWith('/assetBatchGenerationPolling')) return { schedulePollWhenVisible: (fn) => { const id = timers.set(fn); return () => timers.clear(id) } }
    if (name.endsWith('/useStoryboardVideoBatches')) return { useStoryboardVideoBatches: (...args) => { hookState = hook.useStoryboardVideoBatches(...args); return hookState } }
    throw new Error(name)
  }
  hook = load('src/pages/aiStudio/project/useStoryboardVideoBatches.ts', {
    require,
    sessionStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) },
  })
  const modal = load('src/pages/aiStudio/project/StoryboardVideoBatchModal.tsx', {
    require, window: { setTimeout: (fn) => timers.set(fn), clearTimeout: (id) => timers.clear(id) },
  })
  let props = {
    ...scope, open: true, ratio: '16:9', promptDrafts: initialDrafts, visualStyleOptions: [], toneStyleOptions: [],
    onBatchChange() {}, onClose() {}, onPromptChange(segmentId, prompt) {
      props = { ...props, promptDrafts: { ...props.promptDrafts, [segmentId]: prompt } }
      tree = runner.render()
    },
  }
  tree = runner.render(() => modal.default(props))
  return {
    runner, sent, previews, lookups, stored,
    get tree() { return tree },
    get state() { return hookState },
    get drafts() { return props.promptDrafts },
    get candidateLoads() { return candidateLoads },
    setLookupError(error) { lookupError = error },
    async settle() { tree = await runner.settle() },
    async quote() { tree = await runner.settle(); timers.run(); tree = await runner.settle() },
    async setProps(patch) { props = { ...props, ...patch }; tree = runner.render(); tree = await runner.settle() },
    node(type, label) { return nodes(tree).find((node) => node.type === type && (label === undefined || textOf(node) === label)) },
    click(label) { const node = this.node('Button', label); assert.ok(node, label); assert.notEqual(node.props.disabled, true, label); node.props.onClick() },
    async select() { this.click('选择未生成'); await this.quote() },
    async confirmAndSubmit() {
      const checkbox = this.node('Checkbox', '确认本次报价及预算上限')
      assert.notEqual(checkbox.props.disabled, true)
      checkbox.props.onChange({ target: { checked: true } })
      tree = await runner.settle(); this.click('生成 1 个片段'); tree = await runner.settle()
    },
  }
}

for (const recovery of ['原样重发', '查询提交状态']) test(`${recovery} ends the accepted submission and gives the next identical batch a new ID`, async () => {
  const f = batchModalFixture(); await f.settle(); await f.select(); await f.confirmAndSubmit()
  assert.equal(f.state.pending.clientRequestId, 'uuid-1')
  const before = f.candidateLoads
  f.click(recovery); await f.settle()
  assert.equal(f.state.pending, undefined)
  assert.equal(f.stored.size, 0)
  assert.ok(f.candidateLoads > before)
  assert.equal(f.node('Button', '生成 0 个片段').props.disabled, true)
  assert.equal(f.node('Checkbox', '确认本次报价及预算上限').props.checked, false)
  await f.select(); await f.confirmAndSubmit()
  assert.equal(f.sent.at(-1).clientRequestId, 'uuid-2')
  assert.deepEqual(f.sent.at(-1).request, f.sent[0].request)
  if (recovery === '原样重发') assert.deepEqual(f.sent[1], f.sent[0])
  else assert.deepEqual(f.lookups, ['uuid-1'])
  f.runner.unmount()
})

test('ordinary acceptance also clears selection, quote and identity before another batch', async () => {
  const f = batchModalFixture({ failFirst: false }); await f.settle(); await f.select(); await f.confirmAndSubmit()
  assert.equal(f.node('Button', '生成 0 个片段').props.disabled, true)
  await f.select(); await f.confirmAndSubmit()
  assert.deepEqual(f.sent.map((request) => request.clientRequestId), ['uuid-1', 'uuid-2'])
  f.runner.unmount()
})

test('modal edits share the editor draft; closing/reopening keeps edits and then follows newer editor text', async () => {
  const f = batchModalFixture({ failFirst: false, initialDrafts: {} }); await f.settle(); await f.select()
  f.node('TextArea').props.onChange({ target: { value: 'MODAL DRAFT' } }); await f.quote()
  assert.equal(f.drafts[11], 'MODAL DRAFT')
  await f.setProps({ open: false }); await f.setProps({ open: true }); await f.quote()
  assert.equal(f.previews.at(-1).items[0].prompt, 'MODAL DRAFT')
  await f.setProps({ open: false })
  await f.setProps({ promptDrafts: { 11: 'NEW EDITOR DRAFT' } })
  await f.setProps({ open: true }); await f.quote()
  assert.equal(f.node('TextArea').props.value, 'NEW EDITOR DRAFT')
  assert.equal(f.previews.at(-1).items[0].prompt, 'NEW EDITOR DRAFT')
  await f.confirmAndSubmit()
  assert.equal(f.sent[0].request.items[0].prompt, 'NEW EDITOR DRAFT')
  f.runner.unmount()
})

test('changing or clearing the shared draft invalidates budget confirmation and refreshes the quote', async () => {
  const f = batchModalFixture({ failFirst: false }); await f.settle(); await f.select()
  f.node('Checkbox', '确认本次报价及预算上限').props.onChange({ target: { checked: true } }); await f.settle()
  assert.equal(f.node('Button', '生成 1 个片段').props.disabled, false)
  await f.setProps({ promptDrafts: { 11: '' } })
  assert.equal(f.node('Button', '生成 1 个片段').props.disabled, true)
  await f.quote()
  assert.equal(f.node('TextArea').props.value, '')
  assert.equal(f.previews.at(-1).items[0].prompt, '')
  assert.equal(f.node('Checkbox', '确认本次报价及预算上限').props.checked, false)
  f.runner.unmount()
})

test('failed lookup retains the original frozen body even after the editor changes', async () => {
  const f = batchModalFixture(); await f.settle(); await f.select(); await f.confirmAndSubmit()
  const frozen = plain(f.state.pending)
  f.setLookupError({ body: { data: { errorCode: 'VIDEO_BATCH_SUBMISSION_NOT_FOUND' } } })
  f.click('查询提交状态'); await f.settle()
  assert.deepEqual(plain(f.state.pending), frozen)
  assert.equal(f.stored.size, 1)
  await f.setProps({ open: false, promptDrafts: { 11: 'NEW DRAFT AFTER TIMEOUT' } })
  await f.setProps({ open: true })
  f.click('原样重发'); await f.settle()
  assert.deepEqual(f.sent[1], frozen)
  assert.equal(f.drafts[11], 'NEW DRAFT AFTER TIMEOUT')
  assert.equal(f.state.pending, undefined)
  f.runner.unmount()
})

test('automatic recovery after reload ends the saved submission without sending another create', async () => {
  const stored = new Map([['storyboard-video-batch:9:500:1500', JSON.stringify(original)]])
  const f = batchModalFixture({ stored, failFirst: false }); await f.settle()
  assert.deepEqual(f.lookups, ['stable-request'])
  assert.equal(f.sent.length, 0)
  assert.equal(f.state.pending, undefined)
  assert.equal(stored.size, 0)
  await f.select(); await f.confirmAndSubmit()
  assert.notEqual(f.sent[0].clientRequestId, original.clientRequestId)
  f.runner.unmount()
})
test('stable batch errors explain recovery and retain per-item validation details', () => {
  assert.match(batchErrors.videoBatchErrorMessage({ status: 502, message: 'Bad Gateway', body: { data: { errorCode: 'VIDEO_BATCH_SCHEMA_REQUIRED' } } }), /093/)
  assert.match(batchErrors.videoBatchItemError('VIDEO_BATCH_STRUCTURE_BUSY'), /插入、删除或合并/)
  assert.match(batchErrors.videoBatchItemError('VIDEO_BATCH_ITEM_INVALID', '最多支持 3 张图片'), /最多支持 3 张图片/)
  assert.match(batchErrors.videoBatchItemError('VIDEO_BATCH_RESULT_UNCERTAIN'), /核查或恢复原视频/)
  assert.equal(batchErrors.videoBatchErrorMessage(new Error('network offline')), 'network offline')
})

test('switching episodes ignores late submission acceptance and keeps its recovery record', async () => {
  const response = deferred()
  const f = hookFixture({ create: () => response.promise })
  let state = await f.runner.settle()
  const sending = state.send(original)
  await f.runner.settle()
  f.currentScope.episodeId = 1600
  f.runner.render(); state = await f.runner.settle()
  assert.equal(state.pending, undefined)
  assert.equal(state.busy, false)
  response.resolve(detail); await sending
  state = await f.runner.settle()
  assert.equal(state.batches.length, 0)
  assert.ok(f.stored.has('storyboard-video-batch:9:500:1500'))
  f.runner.unmount()
})

test('revisiting an episode ignores responses from its earlier visit', async () => {
  const oldList = deferred(); let calls = 0
  const f = hookFixture({ list: () => ++calls === 1 ? oldList.promise : Promise.resolve([]) })
  await f.runner.settle()
  f.currentScope.episodeId = 1600
  f.runner.render(); await f.runner.settle()
  f.currentScope.episodeId = 1500
  f.runner.render(); await f.runner.settle()
  oldList.resolve([detail])
  assert.equal((await f.runner.settle()).batches.length, 0)
  f.runner.unmount()
})

test('batch changes refresh candidates and invalidate the confirmed quote', async () => {
  let terminal = false
  const f = batchModalFixture({ failFirst: false, apiOverrides: {
    list: async () => [{ ...detail, shouldPoll: false, status: terminal ? 'succeeded' : 'running', items: [{ ...detail.items[0], status: terminal ? 'succeeded' : 'submitted' }] }],
  } })
  await f.settle(); await f.select()
  f.node('Checkbox', '确认本次报价及预算上限').props.onChange({ target: { checked: true } })
  await f.settle()
  assert.equal(f.node('Button', '生成 1 个片段').props.disabled, false)
  const loads = f.candidateLoads
  terminal = true
  f.click('刷新进度'); await f.settle()
  assert.ok(f.candidateLoads > loads)
  assert.equal(f.node('Button', '生成 1 个片段').props.disabled, true)
  await f.quote()
  assert.equal(f.node('Checkbox', '确认本次报价及预算上限').props.checked, false)
  f.runner.unmount()
})

test('retry selects only retryable items, reloads revisions and submits a separate retry batch', async () => {
  let revision = 2
  const source = { ...detail, status: 'partialFailed', shouldPoll: false, items: [
    { id: 101, segmentId: 11, segmentIndex: 1, status: 'blocked', retryable: true },
    { id: 102, segmentId: 12, segmentIndex: 2, status: 'needsReview', retryable: false },
  ] }
  const f = batchModalFixture({ failFirst: false, apiOverrides: {
    list: async () => [source],
    candidates: async () => ({ maxItems: 50, items: candidates.map((item) => ({ ...item, revisionNo: revision })) }),
  } })
  await f.settle()
  assert.equal(f.node('Checkbox', '片段 2').props.disabled, true)
  f.click('选择全部可重试项'); await f.settle()
  revision = 7
  f.click('重新预检所选失败／阻塞项'); await f.quote()
  assert.deepEqual(f.previews.at(-1).items.map((item) => [item.segmentId, item.expectedRevisionNo]), [[11, 7]])
  f.node('Checkbox', '确认本次报价及预算上限').props.onChange({ target: { checked: true } })
  await f.settle()
  f.click('确认创建重试批次'); await f.settle()
  assert.equal(f.sent.length, 1)
  assert.equal(f.sent[0].retryOfBatchId, 90)
  assert.deepEqual(f.sent[0].request, f.previews.at(-1))
  f.runner.unmount()
})

test('no configured model shows a recoverable error and cannot submit', async () => {
  const f = batchModalFixture({ modelOptions: [] })
  await f.settle()
  assert.ok(f.node('Alert').props.message.includes('暂无可用的视频模型'))
  assert.equal(f.node('Button', '生成 0 个片段').props.disabled, true)
  assert.equal(f.previews.length, 0)
  f.runner.unmount()
})

test('switching batch labels to English keeps unsaved prompts, selected IDs and quoted parameters intact', async () => {
  const f = batchModalFixture({ initialDrafts: { 11: '未保存的用户输入' } })
  try {
    await f.settle(); await f.select()
    const before = plain(f.previews.at(-1))
    ui.setLanguage('en-US')
    f.runner.render()
    await f.settle()
    assert.ok(f.node('Button', 'Select ungenerated'))
    assert.ok(nodes(f.tree).some(node => node.type === 'TextArea' && node.props.value === '未保存的用户输入'))
    assert.deepEqual(plain(f.previews.at(-1)), before)
    ui.setLanguage('zh-CN')
    f.runner.render(); await f.settle()
    assert.ok(f.node('Button', '选择未生成'))
  } finally {
    ui.setLanguage('zh-CN')
    f.runner.unmount()
  }
})
