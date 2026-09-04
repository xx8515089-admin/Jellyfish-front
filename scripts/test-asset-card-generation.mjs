import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText
const source = readFileSync(new URL('../src/pages/aiStudio/project/ProjectAssetsStep.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('ProjectAssetsStep.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['getAssetImageOptionsQueueKey', 'startAssetImageGeneration', 'submitExistingAssetImage', 'generateAssetFromCard']
const declarations = new Map()
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
    declarations.set(node.name.text, `const ${node.getText(tree)}`)
  }
  ts.forEachChild(node, visit)
}
visit(tree)
for (const name of names) assert.ok(declarations.has(name), `Production function is missing: ${name}`)
const compiled = compile(`${names.map((name) => declarations.get(name)).join('\n')}\nexport { generateAssetFromCard, startAssetImageGeneration }`)
const settings = {}
vm.runInNewContext(compile(readFileSync(new URL('../src/pages/aiStudio/project/assetImageGenerationSettings.ts', import.meta.url), 'utf8')), {
  exports: settings,
}, { filename: 'assetImageGenerationSettings.js' })

const plain = (value) => JSON.parse(JSON.stringify(value))
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve() }
const asset = {
  id: 'role-12', backendAssetId: 12, kind: 'role', name: '  Character  ', episodeIds: ['episode-3'],
  prompt: 'Asset prompt', styleName: 'Film', visualStyleId: 12, aspectRatio: '16:9',
}
const looks = [
  { id: 30, defaultLook: true, prompt: 'Default prompt', visualStyleId: 12, aspectRatio: '16:9' },
  { id: 31, status: 1, prompt: '  Performing look prompt  ', visualStyleId: 24, aspectRatio: '1:1' },
]

function harness(options = {}) {
  const calls = { order: [], looks: [], saves: [], posts: [], opened: [], messages: [], persisted: [], polls: [], generationReconciles: 0 }
  let imageTasks = {}
  const activeRuns = new Map()
  const exports = {}
  const request = (promise) => ({ promise, cancel() {} })
  const patchTask = (key, patch) => { imageTasks[key] = { ...imageTasks[key], ...patch } }
  const context = {
    exports, ...settings,
    pendingTasksHydrated: true,
    batchCreationBlockedRef: { current: false },
    activeEpisodeAssetsGenerateRequestRef: { current: null },
    model: '8', resolution: '2', scriptImportId: 7,
    selectedImageModelById: { id: 8 }, imageResolutionValues: [4, 2, 1], imageAspectRatioOptions: ['16:9', '1:1'],
    scope: 'episode-3', currentEpisode: { id: 303 }, sourceSignature: 'project-7', episodes: [], ratio: '16:9',
    visualStyleOptions: [{ id: 12, name: 'Film' }, { id: 24, name: 'Anime' }],
    ASSET_TYPE_BY_KIND: { role: 1 },
    componentMountedRef: { current: true }, latestSourceSignatureRef: { current: 'project-7' },
    activeAssetImageRunsRef: { current: activeRuns }, pendingAssetImageTaskKeys: new Set(),
    confirmedAssetImagesRef: { current: new Set() }, resolvedAssetImageTaskIdsRef: { current: new Set() },
    assetImageRunTokenRef: { current: 0 }, assetCardGenerationRequestsRef: { current: new Map() },
    assetImageOptionsQueuesRef: { current: new Map(options.queuedInput ? [['7:role-12', { latestInput: options.queuedInput }]] : []) },
    getBackendAssetId: (id) => Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : null,
    getAssetLookGenerationTask: () => ({ getSnapshot: () => ({ phase: options.lookPhase ?? 'idle' }) }),
    // Leave the card request ref responsible for excluding duplicate preparation calls.
    assetImageOperationLocked: (key) => activeRuns.has(key),
    patchAssetImageTask: patchTask,
    setAssetImageTasks: (update) => { imageTasks = update(imageTasks) },
    openAssetWorkspace: (value) => calls.opened.push(value),
    buildAssetPrompt: (value) => value.prompt,
    loadAssetVisualStyleOptions: async () => context.visualStyleOptions,
    queueAssetImageOptionsUpdate: async (value, input, revision) => {
      calls.order.push('save')
      calls.saves.push({ asset: value, input: plain(input), revision })
      return options.save ? options.save() : undefined
    },
    saveAssetOverride: () => {}, onImageSubmissionStateChange: () => {},
    persistAssetImageRun: (run) => calls.persisted.push(run.taskId),
    reconcileAssetGenerationAfterSingleTaskChange: () => { calls.generationReconciles += 1 },
    isCurrentAssetImageRun: (run) => activeRuns.get(run.assetKey) === run,
    scheduleAssetImageTaskPoll: (run, delay) => calls.polls.push({ taskId: run.taskId, delay }),
    failAssetImageRun: (run, errorMessage) => {
      activeRuns.delete(run.assetKey)
      patchTask(run.assetKey, { phase: 'failed', errorMessage })
    },
    l: (_zh, en) => en,
    message: Object.fromEntries(['info', 'warning', 'error', 'success'].map((level) => [level, (text) => calls.messages.push({ level, text })])),
    getApiErrorMessage: (error, fallback) => error?.message || fallback,
    isCancelledRequestError: () => false,
    StudioAssetGenerationApi: {
      requestLooks: (id, chapterId) => {
        calls.order.push('looks')
        calls.looks.push({ id, chapterId })
        return request(options.lookup ? options.lookup() : Promise.resolve(looks))
      },
      requestGenerate: (input) => {
        calls.order.push('post')
        calls.posts.push(plain(input))
        return request(Promise.resolve('image-task-1'))
      },
    },
  }
  Object.assign(context, options.context)
  vm.runInNewContext(compiled, context, { filename: 'ProjectAssetsStep.card-generation.js' })
  return {
    calls,
    context,
    generate: () => exports.generateAssetFromCard(asset),
    start: () => exports.startAssetImageGeneration(asset, {
      name: 'Character', lookId: 31, prompt: 'Performing look prompt',
      styleName: 'Anime', visualStyleId: 24, aspectRatio: '1:1',
    }),
    tasks: () => imageTasks,
  }
}

test('card selects the current chapter look and saves its options before posting through the shared generator', async () => {
  const saved = deferred()
  const env = harness({ save: () => saved.promise })
  const generated = env.generate()
  await flush()
  assert.deepEqual(env.calls.looks, [{ id: 12, chapterId: 303 }])
  assert.deepEqual(env.calls.saves[0].input, {
    name: 'Character', lookId: 31, prompt: 'Performing look prompt',
    styleName: 'Anime', visualStyleId: 24, aspectRatio: '1:1',
  })
  assert.ok(Number.isInteger(env.calls.saves[0].revision))
  assert.equal(env.calls.posts.length, 0)
  saved.resolve()
  await generated
  assert.deepEqual(env.calls.order, ['looks', 'save', 'post'])
  assert.deepEqual(env.calls.posts, [{
    id: 12, lookId: 31, prompt: 'Performing look prompt', aspectRatio: '1:1',
    visualStyleId: 24, quality: null, resolution: 2, modelId: 8,
  }])
  assert.deepEqual(env.calls.persisted, ['image-task-1'])
  assert.deepEqual(env.calls.polls, [{ taskId: 'image-task-1', delay: 800 }])
  assert.equal(env.calls.generationReconciles, 1)
  assert.equal(env.tasks()['role-12'].phase, 'running')
})

test('failed look lookup or failed image-options save never posts a generation task', async () => {
  for (const failure of ['lookup', 'save']) {
    const env = harness({ [failure]: () => Promise.reject(new Error(`${failure} unavailable`)) })
    await env.generate()
    assert.equal(env.calls.posts.length, 0, failure)
    assert.equal(env.calls.saves.length, failure === 'save' ? 1 : 0)
    assert.equal(env.tasks()['role-12'].phase, 'failed')
    assert.equal(env.calls.messages.filter(({ level }) => level === 'error').length, 1)
    assert.equal(env.context.assetCardGenerationRequestsRef.current.size, 0)
  }
})

test('rapid repeated card clicks do not duplicate lookup, save, or generation', async () => {
  const lookup = deferred()
  const saved = deferred()
  const env = harness({ lookup: () => lookup.promise, save: () => saved.promise })
  const generated = env.generate()
  await Promise.all([env.generate(), env.generate()])
  assert.equal(env.calls.looks.length, 1)
  lookup.resolve(looks)
  await flush()
  await env.generate()
  assert.equal(env.calls.saves.length, 1)
  saved.resolve()
  await generated
  await env.generate()
  assert.equal(env.calls.posts.length, 1)
  assert.equal(env.calls.looks.length, 1)
})

test('an unfinished new-look task opens its editor instead of submitting a normal image task', async () => {
  for (const lookPhase of ['submitting', 'running', 'poll-failed', 'refreshing', 'refresh-failed']) {
    const env = harness({ lookPhase })
    await env.generate()
    assert.deepEqual(env.calls.opened, [asset], lookPhase)
    assert.equal(env.calls.looks.length, 0)
    assert.equal(env.calls.saves.length, 0)
    assert.equal(env.calls.posts.length, 0)
  }
})

test('queued unsaved settings apply only to the selected look', async () => {
  for (const lookId of [30, 31]) {
    const env = harness({ queuedInput: {
      lookId, prompt: 'Unsaved prompt', styleName: 'No style', visualStyleId: null, aspectRatio: '16:9',
    } })
    await env.generate()
    assert.equal(env.calls.posts.length, 1)
    const input = env.calls.posts[0]
    assert.equal(input.lookId, 31)
    assert.equal(input.prompt, lookId === 31 ? 'Unsaved prompt' : 'Performing look prompt')
    assert.equal(input.visualStyleId, lookId === 31 ? null : 24)
    assert.equal(input.aspectRatio, lookId === 31 ? '16:9' : '1:1')
  }
})

test('a resolution outside the current model capabilities cannot post even when settings are saved', async () => {
  for (const supported of [[4, 1], []]) {
    const env = harness({ context: { imageResolutionValues: supported } })
    await env.generate()
    assert.equal(env.calls.saves.length, 1)
    assert.equal(env.calls.posts.length, 0)
    assert.equal(env.tasks()['role-12'].phase, 'failed')
    assert.ok(env.calls.messages.some(({ level, text }) => level === 'warning' && text.includes('supported')))
  }
})

test('the shared single-image generator rejects uncertain or active batch ownership before creating a task', async () => {
  for (const blockedContext of [
    { batchCreationBlockedRef: { current: true } },
    { activeEpisodeAssetsGenerateRequestRef: { current: { promise: Promise.resolve() } } },
  ]) {
    const env = harness({ context: blockedContext })
    await assert.rejects(env.start(), /batch status confirmation or completion/)
    assert.equal(env.calls.posts.length, 0)
    assert.equal(env.calls.persisted.length, 0)
    assert.equal(env.calls.polls.length, 0)
    assert.equal(env.context.activeAssetImageRunsRef.current.size, 0)
  }
})

test('batch ownership is checked before input capabilities, without creating a misleading validation warning', async () => {
  const env = harness({ context: {
    batchCreationBlockedRef: { current: true },
    imageResolutionValues: [],
  } })
  await assert.rejects(env.start(), /batch status confirmation or completion/)
  assert.equal(env.calls.posts.length, 0)
  assert.equal(env.calls.messages.some(({ text }) => text.includes('supported')), false)
})

test('batch activity starting while card settings are being saved prevents the eventual generation POST', async () => {
  for (const changedRef of ['batchCreationBlockedRef', 'activeEpisodeAssetsGenerateRequestRef']) {
    const saved = deferred()
    const env = harness({ save: () => saved.promise })
    const generated = env.generate()
    await flush()
    assert.equal(env.calls.saves.length, 1)
    env.context[changedRef].current = changedRef === 'batchCreationBlockedRef' ? true : { promise: Promise.resolve() }
    saved.resolve()
    await generated
    assert.equal(env.calls.posts.length, 0, changedRef)
    assert.equal(env.context.activeAssetImageRunsRef.current.size, 0)
    assert.equal(env.context.assetCardGenerationRequestsRef.current.size, 0)
    assert.match(env.tasks()['role-12'].errorMessage, /batch status confirmation or completion/)
  }
})

test('a look response arriving after unmount or a source change cannot save options or generate', async () => {
  for (const changedRef of ['componentMountedRef', 'latestSourceSignatureRef']) {
    const lookup = deferred()
    const env = harness({ lookup: () => lookup.promise })
    const generated = env.generate()
    env.context[changedRef].current = changedRef === 'componentMountedRef' ? false : 'project-8'
    lookup.resolve(looks)
    await generated
    assert.equal(env.calls.saves.length, 0, changedRef)
    assert.equal(env.calls.posts.length, 0)
    assert.equal(env.context.assetCardGenerationRequestsRef.current.size, 0)
  }
})

test('an image-options save finishing after unmount or a source change cannot post a task', async () => {
  for (const changedRef of ['componentMountedRef', 'latestSourceSignatureRef']) {
    const saved = deferred()
    const env = harness({ save: () => saved.promise })
    const generated = env.generate()
    await flush()
    assert.equal(env.calls.saves.length, 1)
    env.context[changedRef].current = changedRef === 'componentMountedRef' ? false : 'project-8'
    saved.resolve()
    await generated
    assert.equal(env.calls.posts.length, 0, changedRef)
    assert.equal(env.context.assetCardGenerationRequestsRef.current.size, 0)
  }
})
