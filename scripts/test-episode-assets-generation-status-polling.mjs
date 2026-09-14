import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const source = read('../src/pages/aiStudio/project/ProjectAssetsStep.tsx')
const serviceSource = read('../src/services/studioAssetGeneration.ts')
const tree = ts.createSourceFile('ProjectAssetsStep.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const effects = []
const declarations = new Map()
const visit = (node) => {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEffect') effects.push(node)
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node)
  ts.forEachChild(node, visit)
}
visit(tree)
const effectFor = (request) => {
  const effect = effects.find((node) => node.getText(tree).includes(request))
  assert.ok(effect, `Missing effect for ${request}`)
  return effect
}
const statusEffect = effectFor('requestEpisodeAssetsGenerateStatus')
const assetListEffect = effectFor('StudioScriptsApi.requestAssetList')
const estimateEffect = effectFor('requestEpisodeAssetsGenerateEstimate')
const declaration = (name) => {
  assert.ok(declarations.has(name), `Missing integration declaration: ${name}`)
  return declarations.get(name).getText(tree)
}
const compile = (text) => ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText
const progressExports = {}
vm.runInNewContext(compile(read('../src/pages/aiStudio/project/assetGenerationProgressState.ts')), { exports: progressExports })
const batchExports = {}
vm.runInNewContext(compile(read('../src/pages/aiStudio/project/assetBatchGenerationState.ts')), {
  exports: batchExports,
  require: (name) => {
    assert.equal(name, './assetGenerationProgressState')
    return progressExports
  },
})

// Execute the production effect with a stubbed lane. Timer/cancellation mechanics are
// tested against the real lane in test-asset-batch-generation-polling.mjs.
function harness(scope = 'episode-1', pending = false) {
  let statuses = {}
  let completed = new Set()
  let batch = batchExports.EMPTY_BATCH_GENERATION_STATE
  let listRefreshes = 0
  let cleanupCalls = 0
  const configs = []
  const requests = []
  const responses = []
  const laneRequests = []
  const pendingTasksRef = { current: [] }
  const activeRunsRef = { current: new Map() }
  const lookTasks = new Map()
  const ref = { current: statuses }
  const revision = { current: 0 }
  const exports = {}
  vm.runInNewContext(compile(`export const run = ${statusEffect.arguments[0].getText(tree)}`), {
    exports, scope, scriptImportId: 39, episodes: [{ id: 'episode-1' }, { id: 'episode-2' }],
    episodeAssetsGeneratePending: pending,
    batchStatusRevisionRef: revision,
    latestScriptImportIdRef: { current: 39 },
    assetGenerationStatusByScopeRef: ref,
    latestPendingImageTasksRef: pendingTasksRef,
    activeAssetImageRunsRef: activeRunsRef,
    getActiveAssetLookGenerationTasks: () => [...lookTasks.keys()],
    getAssetLookGenerationTask: (assetId) => ({ getSnapshot: () => lookTasks.get(assetId) }),
    ...batchExports,
    setAssetGenerationStatusByScope: (update) => {
      statuses = typeof update === 'function' ? update(statuses) : update
      ref.current = statuses
    },
    setCompletedEpisodeIds: (update) => { completed = typeof update === 'function' ? update(completed) : update },
    setBatchGenerationState: (update) => { batch = update(batch) },
    setAssetPollingRetryToken: (update) => { listRefreshes = update(listRefreshes) },
    onGenerationCompletionStateChange: () => {},
    StudioAssetGenerationApi: {
      requestEpisodeAssetsGenerateStatus: (params) => {
        requests.push({ ...params })
        let resolve
        const promise = new Promise((yes) => { resolve = yes })
        const response = { promise, resolve, cancelled: false, cancel() { this.cancelled = true } }
        responses.push(response)
        return response
      },
    },
    startBatchGenerationPolling: (config) => {
      configs.push(config)
      laneRequests.push(config.requestStatus())
      return () => { cleanupCalls += 1 }
    },
  })
  return {
    run: exports.run, configs, requests, revision, pendingTasksRef, activeRunsRef, lookTasks,
    laneRequests, responses,
    respond: async (value, index = 0) => {
      responses[index].resolve(value)
      const transformed = await laneRequests[index].promise
      configs[index].onStatus(transformed)
      return transformed
    },
    get statuses() { return statuses },
    get completed() { return completed },
    get batch() { return batch },
    get listRefreshes() { return listRefreshes },
    get cleanupCalls() { return cleanupCalls },
  }
}
const runningItem = { assetType: 1, assetId: 1060, characterLookId: 381, scopeKey: 381, taskId: 63, status: 2, progress: 9 }
const status = (items, overrides = {}) => ({ allGenerated: false, shouldPoll: true, items, ...overrides })

test('the selected scope routes to one status lane and returns its cleanup to React', () => {
  for (const scope of ['episode-1', 'overview']) {
    const env = harness(scope)
    const cleanup = env.run()
    assert.equal(env.configs.length, 1)
    assert.deepEqual(env.requests, [scope === 'overview'
      ? { scriptImportId: 39 }
      : { scriptImportId: 39, episodeId: scope }])
    assert.equal(typeof cleanup, 'function')
    cleanup()
    assert.equal(env.cleanupCalls, 1)
  }
  const dependencies = statusEffect.arguments[1].elements.map((node) => node.getText(tree))
  assert.ok(dependencies.includes('scope'))
  assert.ok(dependencies.includes('scriptImportId'))
})

test('a pending POST suppresses the GET lane and a changed submission revision invalidates an older lane', () => {
  const pending = harness('episode-1', true)
  assert.equal(pending.run(), undefined)
  assert.equal(pending.configs.length, 0)
  const env = harness()
  env.run()
  assert.equal(env.configs[0].isCurrent(), true)
  env.revision.current += 1
  assert.equal(env.configs[0].isCurrent(), false)
  assert.match(declaration('requestGeneration'), /batchStatusRevisionRef\.current\s*\+=\s*1/)
})

test('backend shouldPoll controls the scope and query failures preserve its last known value', () => {
  for (const shouldPoll of [false, true]) {
    const env = harness()
    env.run()
    env.configs[0].onStatus(status([runningItem], { shouldPoll }))
    assert.equal(env.statuses['episode-1'].shouldPoll, shouldPoll)
    const error = new Error('Network offline')
    env.configs[0].onError(error)
    assert.equal(env.statuses['episode-1'].shouldPoll, shouldPoll)
    assert.equal(env.statuses['episode-1'].error, error)
  }
  const env = harness()
  env.run()
  env.configs[0].onStatus(status([], { allGenerated: true, shouldPoll: true }))
  assert.equal(env.statuses['episode-1'].shouldPoll, false)
})

test('partial terminal changes refresh asset data while progress-only updates do not', () => {
  const env = harness()
  env.run()
  const onStatus = env.configs[0].onStatus
  onStatus(status([runningItem]))
  assert.equal(env.listRefreshes, 0)
  const initialSignature = env.statuses['episode-1'].resultSignature
  onStatus(status([{ ...runningItem, progress: 38 }]))
  assert.equal(env.listRefreshes, 0)
  assert.equal(env.statuses['episode-1'].resultSignature, initialSignature)
  onStatus(status([{ ...runningItem, status: 3, progress: 100, coverFileId: 127 }]))
  assert.equal(env.listRefreshes, 1)
  assert.notEqual(env.statuses['episode-1'].resultSignature, initialSignature)
  assert.equal(env.statuses['episode-1'].allGenerated, false)
  assert.equal(Object.keys(env.batch.assets).length, 0)
  const dependencies = estimateEffect.arguments[1].elements.map((node) => node.getText(tree))
  assert.ok(dependencies.includes('currentScopeResultSignature'), 'Credits must refresh when generated results change')
  assert.ok(dependencies.includes('assetGenerationEstimateRefreshToken'), 'Credits must refresh when a single image task changes billable scope')
})

test('unchanged snapshots preserve scope, batch and completion references instead of rewriting the draft', () => {
  const env = harness()
  env.run()
  env.configs[0].onStatus(status([runningItem]))
  const before = { statuses: env.statuses, completed: env.completed, batch: env.batch }
  env.configs[0].onStatus(status([{ ...runningItem }]))
  assert.equal(env.statuses, before.statuses)
  assert.equal(env.completed, before.completed)
  assert.equal(env.batch, before.batch)
  assert.equal(env.listRefreshes, 0)
})

test('overview completion marks every episode and repeated completed snapshots preserve the Set', () => {
  const env = harness('overview')
  env.run()
  const onStatus = env.configs[0].onStatus
  onStatus(status([], { allGenerated: false, shouldPoll: false }))
  assert.equal(env.completed.size, 0)
  onStatus(status([], { allGenerated: true, shouldPoll: false }))
  assert.deepEqual([...env.completed].sort(), ['episode-1', 'episode-2'])
  const completed = env.completed
  onStatus(status([], { allGenerated: true, shouldPoll: false }))
  assert.equal(env.completed, completed)
})

test('the real request wrapper gives restored, active and new-look tasks only their detail-query owner', async () => {
  for (const owner of ['restored', 'active', 'look']) {
    const env = harness()
    env.run()
    // Ownership can be restored after the GET starts; use the latest owner when it resolves.
    if (owner === 'restored') env.pendingTasksRef.current = [{ taskId: '63' }]
    if (owner === 'active') env.activeRunsRef.current.set('asset-1060', { taskId: '63' })
    if (owner === 'look') env.lookTasks.set(1060, { taskId: '63' })
    const raw = status([runningItem], { batch: null })
    const transformed = await env.respond(raw)
    assert.equal(raw.shouldPoll, true, 'The server response must not be mutated')
    assert.equal(raw.items.length, 1)
    assert.equal(transformed.shouldPoll, false)
    assert.equal(transformed.items.length, 0)
    assert.equal(env.statuses['episode-1'].shouldPoll, false)
    assert.equal(Object.keys(env.batch.assets).length, 0)
    env.laneRequests[0].cancel()
    assert.equal(env.responses[0].cancelled, true, 'Wrapper cancellation must reach the original request')
  }
})

test('the request wrapper keeps polling for unowned tasks and excludes owned cards', async () => {
  const env = harness()
  env.pendingTasksRef.current = [{ taskId: '63' }]
  env.run()
  const unowned = { ...runningItem, taskId: 64, assetId: 1061, characterLookId: 382, scopeKey: 382 }
  const transformed = await env.respond(status([runningItem, unowned], { batch: null }))
  assert.equal(transformed.shouldPoll, true)
  assert.equal(transformed.items.length, 1)
  assert.equal(transformed.items[0].taskId, 64)
  assert.deepEqual(Object.keys(env.batch.assets), ['remote:39:1:1061'])
  assert.equal(env.statuses['episode-1'].shouldPoll, true)
})

test('the request wrapper preserves polling when an explicit batch exists or no tasks are locally owned', async () => {
  const batched = harness()
  batched.pendingTasksRef.current = [{ taskId: '63' }]
  batched.run()
  const transformed = await batched.respond(status([runningItem], { batch: { id: 10 } }))
  assert.equal(transformed.shouldPoll, true)
  assert.equal(transformed.items.length, 0)
  assert.equal(Object.keys(batched.batch.assets).length, 0)

  const unowned = harness()
  unowned.run()
  const original = status([runningItem], { batch: null })
  assert.equal(await unowned.respond(original), original)
  assert.equal(unowned.statuses['episode-1'].shouldPoll, true)
  assert.deepEqual(Object.keys(unowned.batch.assets), ['remote:39:1:1060'])
})

test('asset extraction polling stops at completion but still loads the initial asset lists', () => {
  const effectText = assetListEffect.getText(tree)
  assert.match(effectText, /result\.polling\s*&&\s*!generationCompleted\(\)/)
  assert.match(effectText, /ASSET_TYPES\.forEach\(\(assetType\)\s*=>\s*void runLane\(assetType\)\)/)
  assert.doesNotMatch(effectText, /if\s*\(currentScopeGenerationCompleted\)\s*\{[\s\S]*?return/)
  assert.doesNotMatch(statusEffect.getText(tree), /requestTaskDetail/)
})

test('creation is blocked during hydration, recovery and uncertain batch status in both entry points', () => {
  const singleLock = declaration('singleAssetGenerationActive')
  assert.match(singleLock, /!pendingTasksHydrated/)
  assert.match(singleLock, /pendingAssetImageTasks\.length\s*>\s*0/)
  assert.match(singleLock, /some\(isAssetImageTaskLocked\)/)
  assert.match(singleLock, /activeLookTaskAssetIds/)
  const uncertain = declaration('currentScopeGenerationStatusUncertain')
  assert.match(uncertain, /!currentAssetGenerationStatus/)
  assert.match(uncertain, /currentAssetGenerationStatus\.loading/)
  assert.match(uncertain, /currentAssetGenerationStatus\.error/)
  for (const handler of ['requestGeneration', 'startAssetImageGeneration']) {
    assert.match(declaration(handler), /batchCreationBlockedRef\.current/)
    assert.match(declaration(handler), /activeEpisodeAssetsGenerateRequestRef\.current/)
  }
  assert.ok(/generationUnavailableReason=\{currentScopeBatchGenerationActive\s*\|\|\s*currentScopeGenerationStatusUncertain/.test(source), 'The workspace must respect the batch status lock')
})

test('batch submission uses the documented payload and reconciles status even when the response fails', () => {
  const handler = declaration('requestGeneration')
  assert.match(serviceSource, /url:\s*'\/api\/v1\/studio\/episodes\/assets\/generate'/)
  assert.match(handler, /targetEpisodeId === undefined \? \{\} : \{ episodeId: targetEpisodeId \}/)
  for (const field of [/scriptImportId,/, /modelId,/, /quality:\s*null/, /resolution:\s*resolutionValue/, /regenerate:\s*false/]) {
    assert.match(handler, field)
  }
  const catchClause = declarations.get('requestGeneration').initializer.body.statements
    .find(ts.isTryStatement)?.catchClause
  assert.ok(catchClause)
  assert.match(catchClause.getText(tree), /setAssetGenerationStatusRefreshToken/)
  assert.doesNotMatch(catchClause.getText(tree), /requestEpisodeAssetsGenerate\(/)
})

test('completed scope hides retry and credits, while cards and workspace share the state selector', () => {
  assert.ok(/assetPollingErrorMessage\s*&&\s*!currentScopeGenerationCompleted/.test(source), 'Completed scopes hide the retry action')
  assert.ok(/disabled=\{\s*currentScopeGenerationCompleted/.test(source), 'Completed scopes disable batch creation')
  assert.ok(/\{!currentScopeGenerationCompleted\s*&&\s*\(\s*<span className="project-assets-step__generation-cost">/.test(source), 'Completed scopes hide batch credits')
  assert.match(declaration('cardGenerationState'), /selectAssetGenerationState\(assetImageTasks\[asset\.id\], batchAssetImageTasks\[asset\.id\]\)/)
  assert.ok(/generationState=\{generationAssetId\s*\?\s*selectAssetGenerationState\(/.test(source), 'Workspace and cards use the same source selector')
  assert.ok(/batchGenerationStatesByLookId=\{[^}]*batchGenerationState\.looks\[generationAssetId\]/.test(source), 'Workspace receives batch states for individual looks')
})
