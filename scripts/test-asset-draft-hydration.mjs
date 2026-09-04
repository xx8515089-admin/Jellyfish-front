import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/aiStudio/project/ProjectAssetsStep.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('ProjectAssetsStep.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const declarations = new Map()
const effects = []
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node)
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node)
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEffect') effects.push(node)
  ts.forEachChild(node, visit)
}
visit(tree)
const declaration = (name) => {
  const node = declarations.get(name)
  assert.ok(node, `Missing production declaration: ${name}`)
  return node
}
const effectFor = (fragment) => {
  const effect = effects.find((node) => node.arguments[0]?.getText(tree).includes(fragment))
  assert.ok(effect, `Missing production effect: ${fragment}`)
  return effect.arguments[0].getText(tree)
}
const readEffect = effectFor('readFullProjectCreationDraft')
const persistEffect = effectFor('draftPersistenceEnabledRef.current = true')
const modelEffect = effectFor('const defaultModel =')
const resolutionEffect = effectFor('const nextResolution = selectImageResolution')
const component = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectAssetsStep')
const persistenceRenderGuard = component.body.statements.find((node) => (
  ts.isIfStatement(node) && node.getText(tree).includes('draftPersistenceEnabledRef.current = false')
))
assert.ok(persistenceRenderGuard, 'Missing render-time persistence guard')
const compile = (code) => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText
const plain = (value) => JSON.parse(JSON.stringify(value))
const hydrationExports = {}
vm.runInNewContext(compile(readFileSync(new URL('../src/pages/aiStudio/project/assetDraftHydration.ts', import.meta.url), 'utf8')), { exports: hydrationExports })
const settingsExports = {}
vm.runInNewContext(compile(readFileSync(new URL('../src/pages/aiStudio/project/assetImageGenerationSettings.ts', import.meta.url), 'utf8')), { exports: settingsExports })
const asset = (id, overrides = {}) => ({ id, name: id, kind: 'role', episodeIds: ['episode-1'], ...overrides })
const draft = (overrides = {}) => ({
  sourceSignature: 'remote:39:1:episode-1',
  kind: 'prop', assets: [asset('saved', { imageUrl: 'data:image/png;base64,saved' })],
  model: '20', resolution: '4', resolutionChosenByUser: true,
  hiddenRemoteAssetIds: ['hidden-saved'], unsavedImageOptionKeys: ['unsaved-saved'], pendingImageTasks: [],
  ...overrides,
})

// Execute the production effect closures, but deliberately defer all state updater
// commits. This models the gap between a promise settling and React committing the
// next render, when flushing the previous draft would lose IndexedDB-only assets.
function harness({ compact, initial = {} } = {}) {
  const state = {
    kind: compact?.kind ?? 'role', assets: compact?.assets ?? [], model: compact?.model ?? '',
    resolution: compact?.resolutionChosenByUser ? compact.resolution : '',
    resolutionChosenByUser: Boolean(compact?.resolutionChosenByUser),
    hiddenRemoteAssetIds: new Set(compact?.hiddenRemoteAssetIds ?? []),
    unsavedAssetImageOptionKeys: new Set(compact?.unsavedImageOptionKeys ?? []),
    completedEpisodeIds: new Set(), pendingAssetImageTasks: [], hydratedDraftToken: undefined,
    ...initial,
  }
  const refs = {
    draftPersistenceEnabledRef: { current: false }, latestAssetDraftRef: { current: undefined },
    draftSelectionEditsRef: { current: { kind: 0, model: 0, resolution: 0 } },
    resolvedAssetImageTaskIdsRef: { current: new Set() }, activeAssetImageRunsRef: { current: new Map() },
  }
  const environment = { draftKey: 'assets-39', scriptImportId: 39, sourceSignature: draft().sourceSignature, sourceResetPending: false }
  const updates = []
  const reads = []
  const writes = []
  const sidecarWrites = []
  let renderContext
  let lastCleanup
  const memoSlots = []
  const setters = Object.fromEntries(Object.keys(state).map((name) => [
    `set${name[0].toUpperCase()}${name.slice(1)}`,
    (value) => updates.push(() => { state[name] = typeof value === 'function' ? value(state[name]) : value }),
  ]))
  const flushAssetDraft = () => {
    if (refs.draftPersistenceEnabledRef.current) writes.push(plain(refs.latestAssetDraftRef.current))
  }
  const evaluate = (code) => vm.runInContext(compile(code), renderContext)
  const evaluateDeclaration = (name) => {
    const node = declaration(name)
    const code = ts.isFunctionDeclaration(node) ? node.getText(tree) : node.initializer.getText(tree)
    evaluate(`globalThis.${name} = ${code}`)
  }
  const render = () => {
    let memoIndex = 0
    renderContext = vm.createContext({
      ...state, ...environment, ...refs, ...setters, ...hydrationExports, ...settingsExports, flushAssetDraft,
      completedEpisodeIdList: [...state.completedEpisodeIds],
      hiddenRemoteAssetIdList: [...state.hiddenRemoteAssetIds],
      unsavedAssetImageOptionKeyList: [...state.unsavedAssetImageOptionKeys],
      useMemo: (factory, dependencies) => {
        const index = memoIndex++
        const previous = memoSlots[index]
        if (!previous || dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))) {
          memoSlots[index] = { dependencies, value: factory() }
        }
        return memoSlots[index].value
      },
      imageModelsLoading: false, imageModelsError: undefined,
      imageModels: [
        { id: 10, defaultModel: true, imageCapabilities: { resolutions: [4, 2] } },
        { id: 20, imageCapabilities: { resolutions: [4, 2] } },
        { id: 30, imageCapabilities: { resolutions: [2, 4] } },
      ],
      readProjectCreationDraft: () => compact,
      readFullProjectCreationDraft: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
      readPendingAssetImageTaskSidecar: () => undefined,
      normalizePersistedAssetImageTasks: (tasks) => tasks ?? [],
      writePendingAssetImageTaskSidecar: (key, tasks) => sidecarWrites.push({ key, tasks: plain(tasks) }),
    })
    evaluateDeclaration('isAssetKind')
    for (const name of [
      'hydrationToken', 'pendingTasksHydrated', 'selectedImageModelById', 'selectedImageModel',
      'imageResolutionValues', 'assetDraft',
    ]) evaluateDeclaration(name)
    evaluate(persistenceRenderGuard.getText(tree))
    refs.latestAssetDraftRef.current = renderContext.assetDraft
    return renderContext
  }
  const run = (effect) => evaluate(`(${effect})()`)
  const commit = ({ persist = true } = {}) => {
    while (updates.length) updates.shift()()
    render()
    if (persist) run(persistEffect)
  }
  render()
  return {
    state, refs, environment, writes, sidecarWrites, updates, reads, render, commit,
    start: () => { lastCleanup = run(readEffect); return lastCleanup },
    cleanup: () => lastCleanup?.(),
    runDefaults: () => { run(modelEffect); run(resolutionEffect) },
    runPersistence: () => run(persistEffect),
    flush: flushAssetDraft,
    get hydrated() { return renderContext.pendingTasksHydrated },
    async resolve(fullDraft, index = reads.length - 1) {
      reads[index].resolve(fullDraft)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    },
    select(name, value) {
      const handler = { kind: 'handleKindChange', model: 'handleModelChange', resolution: 'handleResolutionChange' }[name]
      evaluateDeclaration(handler)
      renderContext[handler](value)
      commit()
    },
  }
}

test('API models arriving before IndexedDB do not prevent the full-only draft from restoring', async () => {
  const env = harness()
  env.start()
  env.runDefaults()
  env.commit()
  assert.equal(env.state.model, '')
  assert.equal(env.state.resolution, '')
  assert.equal(env.hydrated, false)
  await env.resolve(draft())
  env.commit()
  env.runDefaults()
  env.commit()
  assert.equal(env.state.model, '20')
  assert.equal(env.state.resolution, '4')
  assert.equal(env.state.kind, 'prop')
  assert.deepEqual(plain(env.state.assets), draft().assets)
})

test('hydration completion cannot flush the empty render before React commits restored state', async () => {
  const env = harness()
  env.start()
  await env.resolve(draft())
  env.flush()
  env.runPersistence()
  assert.equal(env.refs.draftPersistenceEnabledRef.current, false)
  assert.equal(env.writes.length, 0)
  assert.equal(env.state.assets.length, 0)
  env.commit()
  assert.equal(env.hydrated, true)
  assert.ok(env.writes.length > 0)
  assert.deepEqual(env.writes.at(-1).assets, draft().assets)
  assert.deepEqual(env.writes.at(-1).hiddenRemoteAssetIds, ['hidden-saved'])
  assert.deepEqual(env.writes.at(-1).unsavedImageOptionKeys, ['unsaved-saved'])
})

test('user model, resolution and tab selections survive while full-only assets still hydrate', async () => {
  const env = harness()
  env.start()
  env.select('kind', 'scene')
  env.select('model', '30')
  env.select('resolution', '2')
  await env.resolve(draft())
  env.commit()
  assert.equal(env.state.kind, 'scene')
  assert.equal(env.state.model, '30')
  assert.equal(env.state.resolution, '2')
  assert.equal(env.state.resolutionChosenByUser, true)
  assert.deepEqual(plain(env.state.assets), draft().assets)
})

test('user additions, deletions and asset edits merge with IndexedDB-only fields', async () => {
  const baseline = [asset('edited'), asset('deleted')]
  const env = harness({ initial: { assets: baseline } })
  env.start()
  env.state.assets = [asset('edited', { name: 'User name' }), asset('added')]
  env.state.hiddenRemoteAssetIds.add('hidden-new')
  env.state.unsavedAssetImageOptionKeys.add('unsaved-new')
  env.state.completedEpisodeIds.add('episode-1')
  env.render()
  await env.resolve(draft({ assets: [
    asset('edited', { name: 'Saved name', imageUrl: 'data:image/png;base64,full' }),
    asset('deleted'), asset('saved-only'),
  ] }))
  env.commit()
  const assets = new Map(env.state.assets.map((item) => [item.id, item]))
  assert.equal(assets.size, 3)
  assert.equal(assets.has('deleted'), false)
  assert.equal(assets.has('added'), true)
  assert.equal(assets.has('saved-only'), true)
  assert.equal(assets.get('edited').name, 'User name')
  assert.equal(assets.get('edited').imageUrl, 'data:image/png;base64,full')
  assert.deepEqual([...env.state.hiddenRemoteAssetIds].sort(), ['hidden-new', 'hidden-saved'])
  assert.deepEqual([...env.state.unsavedAssetImageOptionKeys].sort(), ['unsaved-new', 'unsaved-saved'])
  assert.equal(env.state.completedEpisodeIds.has('episode-1'), true)
})

test('compact drafts retain current fields while missing image payloads hydrate', async () => {
  const compact = draft({ assets: [
    asset('same', { name: 'Older name' }), asset('changed', { imageUrl: 'data:image/png;base64,old' }), asset('obsolete'),
  ] })
  const env = harness({ compact })
  env.start()
  env.state.assets = [
    { ...env.state.assets[0], name: 'same' },
    { ...env.state.assets[1], imageUrl: 'data:image/png;base64,new' },
  ]
  env.render()
  env.select('kind', 'scene')
  await env.resolve(draft({ assets: [
    asset('same', { name: 'Older name', imageUrl: 'data:image/png;base64,full' }),
    asset('changed', { imageUrl: 'data:image/png;base64,old' }),
    asset('obsolete'),
  ] }))
  env.commit()
  assert.equal(env.state.kind, 'scene')
  assert.equal(env.state.assets.length, 2)
  assert.equal(env.state.assets[0].name, 'same')
  assert.equal(env.state.assets[0].imageUrl, 'data:image/png;base64,full')
  assert.equal(env.state.assets[1].imageUrl, 'data:image/png;base64,new')
})

test('source reset prevents early reads and persistence, then restores compact-only assets after reset commits', async () => {
  const compact = draft()
  const env = harness({ compact })
  env.start()
  await env.resolve(compact)
  env.commit()
  const previousWriteCount = env.writes.length
  env.cleanup()
  env.environment.sourceSignature = 'remote:39:2:episode-2'
  compact.sourceSignature = env.environment.sourceSignature
  env.environment.sourceResetPending = true
  env.render()
  assert.equal(env.hydrated, false)
  assert.equal(env.start(), undefined)
  env.runPersistence()
  env.flush()
  assert.equal(env.reads.length, 1)
  assert.equal(env.writes.length, previousWriteCount)

  env.state.assets = []
  env.state.kind = 'role'
  env.state.hiddenRemoteAssetIds = new Set()
  env.state.unsavedAssetImageOptionKeys = new Set()
  env.environment.sourceResetPending = false
  env.render()
  env.start()
  assert.equal(env.reads.length, 2)
  await env.resolve(undefined)
  env.commit()
  assert.equal(env.hydrated, true)
  assert.deepEqual(plain(env.state.assets), compact.assets)
  assert.equal(env.state.kind, compact.kind)
  assert.deepEqual([...env.state.hiddenRemoteAssetIds], compact.hiddenRemoteAssetIds)
  assert.deepEqual([...env.state.unsavedAssetImageOptionKeys], compact.unsavedImageOptionKeys)
  assert.deepEqual(env.writes.at(-1).assets, compact.assets)
})

test('unmount ignores late IndexedDB data and never persists the initial empty draft', async () => {
  const env = harness()
  env.start()
  env.cleanup()
  await env.resolve(draft())
  env.flush()
  assert.equal(env.updates.length, 0)
  assert.equal(env.writes.length, 0)
  assert.equal(env.sidecarWrites.length, 0)
})

test('a changed source with the same storage key requires hydration and ignores the previous read', async () => {
  const env = harness()
  env.start()
  await env.resolve(draft())
  env.commit()
  assert.equal(env.hydrated, true)
  env.cleanup()
  env.environment.sourceSignature = 'remote:39:2:episode-2'
  env.render()
  assert.equal(env.hydrated, false)
  env.start()
  env.cleanup()
  env.environment.sourceSignature = 'remote:39:3:episode-3'
  env.render()
  env.start()
  await env.resolve(draft({ sourceSignature: 'remote:39:2:episode-2', assets: [asset('stale')] }), 1)
  assert.equal(env.updates.length, 0)
  await env.resolve(draft({ sourceSignature: env.environment.sourceSignature, assets: [asset('current')] }), 2)
  env.commit()
  assert.equal(env.hydrated, true)
  assert.equal(env.state.assets[0].id, 'current')
})

test('returning to a previous source while the intervening read is pending does not reuse its old ready state', async () => {
  const env = harness()
  const originalSource = env.environment.sourceSignature
  env.start()
  await env.resolve(draft())
  env.commit()
  assert.equal(env.hydrated, true)
  env.cleanup()
  env.environment.sourceSignature = 'remote:39:2:episode-2'
  env.render()
  env.start()
  env.cleanup()
  env.environment.sourceSignature = originalSource
  env.render()
  assert.equal(env.hydrated, false)
  env.start()
  env.flush()
  const writeCount = env.writes.length
  await env.resolve(draft({ sourceSignature: 'remote:39:2:episode-2' }), 1)
  env.commit()
  assert.equal(env.hydrated, false)
  assert.equal(env.writes.length, writeCount)
  await env.resolve(draft({ assets: [asset('latest-original')] }), 2)
  env.commit()
  assert.equal(env.hydrated, true)
  assert.equal(env.writes.at(-1).assets[0].id, 'latest-original')
})

test('field merging keeps user field removals and combines saved and new override markers', async () => {
  const original = asset('edited', { prompt: 'Original prompt', name: 'Original name', overrideFields: ['prompt'] })
  const env = harness({ initial: { assets: [original] } })
  env.start()
  const changed = { ...original, name: 'User name', overrideFields: ['name'] }
  delete changed.prompt
  env.state.assets = [changed]
  env.render()
  await env.resolve(draft({ assets: [asset('edited', {
    prompt: 'Stored prompt', imageUrl: 'data:image/png;base64,saved', overrideFields: ['prompt', 'imageUrl'],
  })] }))
  env.commit()
  assert.equal(env.state.assets[0].name, 'User name')
  assert.equal(Object.hasOwn(env.state.assets[0], 'prompt'), false)
  assert.equal(env.state.assets[0].imageUrl, 'data:image/png;base64,saved')
  assert.deepEqual([...env.state.assets[0].overrideFields].sort(), ['imageUrl', 'name'])
})

test('hydration keeps local removals from saved hidden and unsaved-option sets', async () => {
  const env = harness({ initial: {
    hiddenRemoteAssetIds: new Set(['hidden-removed']),
    unsavedAssetImageOptionKeys: new Set(['unsaved-removed']),
  } })
  env.start()
  env.state.hiddenRemoteAssetIds = new Set(['hidden-added'])
  env.state.unsavedAssetImageOptionKeys = new Set(['unsaved-added'])
  env.render()
  await env.resolve(draft({
    hiddenRemoteAssetIds: ['hidden-removed', 'hidden-saved'],
    unsavedImageOptionKeys: ['unsaved-removed', 'unsaved-saved'],
  }))
  env.commit()
  assert.deepEqual([...env.state.hiddenRemoteAssetIds].sort(), ['hidden-added', 'hidden-saved'])
  assert.deepEqual([...env.state.unsavedAssetImageOptionKeys].sort(), ['unsaved-added', 'unsaved-saved'])
})

test('missing or incompatible full drafts release default selection only after hydration settles', async () => {
  for (const fullDraft of [undefined, draft({ sourceSignature: 'unrelated-source' })]) {
    const env = harness()
    env.start()
    await env.resolve(fullDraft)
    env.commit()
    env.runDefaults()
    env.commit()
    env.runDefaults()
    env.commit()
    assert.equal(env.state.model, '10')
    assert.equal(env.state.resolution, '2')
    assert.equal(env.hydrated, true)
    assert.deepEqual(plain(env.state.assets), [])
  }
})
