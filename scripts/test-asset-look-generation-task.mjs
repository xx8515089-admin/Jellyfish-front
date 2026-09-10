import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/aiStudio/project/assetLookGenerationTask.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText
const progressState = {}
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL('../src/pages/aiStudio/project/assetGenerationProgressState.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } },
).outputText, { exports: progressState })
const input = {
  assetId: 12, name: 'Raincoat', prompt: 'A raincoat', referenceFileIds: [],
  aspectRatio: '9:16', visualStyleId: null, quality: null, resolution: 2, modelId: 1,
}
const running = { id: 'task-1', status: 2, progress: 36 }
const succeeded = { id: 'task-1', status: 3, progress: 100, result: '{"fileId":42}' }
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve() }

function harness(storage = new Map()) {
  let user = { id: 'alice' }
  let clock = 0
  let timerId = 0
  let create = () => Promise.resolve('task-1')
  let detail = () => Promise.resolve(running)
  const timers = new Map()
  const creates = []
  const queries = []
  const makeRequest = (promise) => ({ promise, cancelled: false, cancel() { this.cancelled = true } })
  const schedulePollWhenVisible = (callback, delay) => {
    const id = ++timerId
    timers.set(id, { callback, due: clock + delay, delay })
    return () => timers.delete(id)
  }
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name.endsWith('/assetGenerationProgressState')) return progressState
      if (name.endsWith('/assetBatchGenerationPolling')) return { schedulePollWhenVisible }
      if (name.endsWith('/auth')) return { getStoredAuthUser: () => user }
      if (name.endsWith('/useBilingualText')) return { bilingualText: (_zh, en) => en }
      if (name.endsWith('/apiErrors')) return { getApiErrorMessage: (error, fallback) => error?.message || fallback }
      if (name.endsWith('/studioAssetGeneration')) return {
        parseStudioAssetImageTaskResult: (result) => result ? JSON.parse(result) : null,
        StudioAssetGenerationApi: {
          requestLookGenerate: (requestInput) => {
            const request = makeRequest(create(requestInput))
            creates.push({ input: requestInput, request })
            return request
          },
          requestTaskDetail: (taskId) => {
            const request = makeRequest(detail(taskId))
            queries.push({ taskId, request })
            return request
          },
        },
      }
      throw new Error(`Unexpected import: ${name}`)
    },
    window: {
      sessionStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      setTimeout: (callback, delay) => {
        const id = ++timerId
        timers.set(id, { callback, due: clock + delay, delay })
        return id
      },
      clearTimeout: (id) => timers.delete(id),
    },
  }, { filename: 'assetLookGenerationTask.js' })
  return {
    get: (assetId = 12) => exports.getAssetLookGenerationTask(assetId),
    active: exports.getActiveAssetLookGenerationTasks,
    subscribeActivity: exports.subscribeAssetLookGenerationTasks,
    setUser: (value) => { user = value },
    setCreate: (callback) => { create = callback },
    setDetail: (callback) => { detail = callback },
    creates, queries, timers, storage,
    tick: async () => {
      const [id, timer] = [...timers.entries()].sort((first, second) => first[1].due - second[1].due)[0] ?? []
      assert.ok(timer, 'Expected a scheduled poll')
      timers.delete(id)
      clock = timer.due
      timer.callback()
      await flush()
      return timer.delay
    },
  }
}

test('temporary lookup failure retries the same task and never creates another task', async () => {
  const env = harness()
  let attempt = 0
  env.setDetail(() => ++attempt === 1 ? Promise.reject(new Error('Network offline')) : Promise.resolve(running))
  const task = env.get()
  const unsubscribe = task.subscribe(() => {})
  await task.submit(input)
  await flush()
  assert.equal(task.getSnapshot().phase, 'running')
  assert.equal(task.getSnapshot().taskId, 'task-1')
  assert.equal(await env.tick(), 1200)
  assert.equal(task.getSnapshot().progress, 36)
  assert.equal(task.getSnapshot().errorMessage, undefined)
  assert.equal(env.creates.length, 1)
  assert.deepEqual(env.queries.map((query) => query.taskId), ['task-1', 'task-1'])
  unsubscribe()
})

test('exhausted lookup retries retain ID; repeated resume does one GET and cannot POST', async () => {
  const env = harness()
  env.setDetail(() => Promise.reject(new Error('Network offline')))
  const task = env.get()
  const unsubscribe = task.subscribe(() => {})
  await task.submit(input)
  await flush()
  for (const delay of [1200, 2400, 4800]) assert.equal(await env.tick(), delay)
  assert.equal(task.getSnapshot().phase, 'poll-failed')
  assert.equal(task.getSnapshot().taskId, 'task-1')
  assert.equal(env.timers.size, 0)
  await assert.rejects(task.submit(input), /already exists/)
  const response = deferred()
  env.setDetail(() => response.promise)
  task.resume()
  task.resume()
  task.resume()
  assert.equal(env.queries.length, 5)
  response.resolve(succeeded)
  await flush()
  assert.equal(task.getSnapshot().phase, 'refreshing')
  assert.equal(task.getSnapshot().taskId, 'task-1')
  assert.equal(task.getSnapshot().expectedFileId, '42')
  assert.equal(env.creates.length, 1)
  unsubscribe()
})

test('explicit failed and cancelled server tasks clear ownership and allow a new task', async () => {
  for (const failure of [
    { status: 4, error: 'Provider failed' },
    { status: 5, cancelReason: 'Cancelled by user' },
  ]) {
    const env = harness()
    env.setDetail(() => Promise.resolve({ ...running, ...failure }))
    const task = env.get()
    const unsubscribe = task.subscribe(() => {})
    await task.submit(input)
    await flush()
    assert.equal(task.getSnapshot().phase, 'failed')
    assert.equal(task.getSnapshot().taskId, undefined)
    assert.equal(env.storage.size, 0)
    assert.equal(env.timers.size, 0)
    await task.submit(input)
    assert.equal(env.creates.length, 2)
    unsubscribe()
  }
})

test('nonterminal error metadata does not falsely mark a running task as failed', async () => {
  const env = harness()
  env.setDetail(() => Promise.resolve({ ...running, error: 'Provider retrying', finishedAt: 'stale metadata' }))
  const task = env.get()
  const unsubscribe = task.subscribe(() => {})
  await task.submit(input)
  await flush()
  assert.equal(task.getSnapshot().phase, 'running')
  assert.equal(task.getSnapshot().taskId, 'task-1')
  unsubscribe()
})

test('result refresh failure retains successful task and resumes without GET or POST', async () => {
  const env = harness()
  env.setDetail(() => Promise.resolve(succeeded))
  const task = env.get()
  const unsubscribe = task.subscribe(() => {})
  await task.submit(input, ['main', 'existing-look'])
  await flush()
  const revision = task.getSnapshot().revision
  task.setRefreshFailed('stale-task', 'Ignore stale result')
  assert.equal(task.getSnapshot().phase, 'refreshing')
  task.setRefreshFailed('task-1', 'Looks unavailable')
  assert.equal(task.getSnapshot().phase, 'refresh-failed')
  await assert.rejects(task.submit(input), /already exists/)
  task.resume()
  assert.equal(task.getSnapshot().phase, 'refreshing')
  assert.ok(task.getSnapshot().revision > revision)
  assert.deepEqual([...task.getSnapshot().previousLookIds], ['main', 'existing-look'])
  assert.equal(env.queries.length, 1)
  assert.equal(env.creates.length, 1)
  task.complete('stale-task')
  assert.equal(task.getSnapshot().phase, 'refreshing')
  task.complete('task-1')
  assert.equal(task.getSnapshot().phase, 'idle')
  assert.equal(env.storage.size, 0)
  unsubscribe()
})

test('closing during POST preserves late creation response and reopening resumes the same task', async () => {
  const env = harness()
  const creation = deferred()
  env.setCreate(() => creation.promise)
  const task = env.get()
  const unsubscribe = task.subscribe(() => {})
  const submitting = task.submit(input)
  unsubscribe()
  await assert.rejects(task.submit(input), /already exists/)
  assert.equal(env.creates[0].request.cancelled, false)
  creation.resolve('task-late')
  await submitting
  assert.equal(task.getSnapshot().taskId, 'task-late')
  assert.equal(env.storage.size, 1)
  assert.equal(env.queries.length, 0)
  assert.equal(env.get(), task)
  const closeAgain = env.get().subscribe(() => {})
  await flush()
  assert.deepEqual(env.queries.map((query) => query.taskId), ['task-late'])
  assert.equal(env.creates.length, 1)
  closeAgain()
})

test('unsubscribing cancels GET; its late response cannot replace a reopened poll', async () => {
  const env = harness()
  const stale = deferred()
  const current = deferred()
  let attempt = 0
  env.setDetail(() => ++attempt === 1 ? stale.promise : current.promise)
  const task = env.get()
  const unsubscribe = task.subscribe(() => {})
  await task.submit(input)
  unsubscribe()
  assert.equal(env.queries[0].request.cancelled, true)
  assert.equal(env.timers.size, 0)
  const closeAgain = task.subscribe(() => {})
  stale.resolve({ ...running, status: 4, error: 'Old response' })
  await flush()
  assert.equal(task.getSnapshot().phase, 'running')
  assert.equal(task.getSnapshot().taskId, 'task-1')
  current.resolve(succeeded)
  await flush()
  assert.equal(task.getSnapshot().phase, 'refreshing')
  assert.equal(env.timers.size, 0)
  closeAgain()
})

test('only the final subscriber stops polling, and reopening restarts it', async () => {
  const env = harness()
  const task = env.get()
  const closeFirst = task.subscribe(() => {})
  const closeSecond = task.subscribe(() => {})
  await task.submit(input)
  await flush()
  closeFirst()
  assert.equal(env.timers.size, 1)
  await env.tick()
  closeSecond()
  assert.equal(env.timers.size, 0)
  const closeThird = task.subscribe(() => {})
  await flush()
  assert.equal(env.queries.length, 3)
  closeThird()
})

test('reload restores pending task ID, progress, name, and earlier look IDs', async () => {
  const env = harness()
  const task = env.get()
  const unsubscribe = task.subscribe(() => {})
  await task.submit(input, ['older-look'])
  await flush()
  unsubscribe()
  const reloaded = harness(env.storage)
  const restored = reloaded.get()
  assert.equal(restored.getSnapshot().phase, 'running')
  assert.equal(restored.getSnapshot().progress, 36)
  assert.equal(restored.getSnapshot().lookName, 'Raincoat')
  assert.deepEqual([...restored.getSnapshot().previousLookIds], ['older-look'])
  const close = restored.subscribe(() => {})
  await flush()
  assert.deepEqual(reloaded.queries.map((query) => query.taskId), ['task-1'])
  assert.equal(reloaded.creates.length, 0)
  close()
})

test('reload of a successful task only refreshes results and retains expected file ID', async () => {
  const env = harness()
  env.setDetail(() => Promise.resolve(succeeded))
  const task = env.get()
  const unsubscribe = task.subscribe(() => {})
  await task.submit(input)
  await flush()
  task.setRefreshFailed('task-1', 'Offline')
  unsubscribe()
  const reloaded = harness(env.storage)
  const restored = reloaded.get()
  const close = restored.subscribe(() => {})
  assert.equal(restored.getSnapshot().phase, 'refreshing')
  assert.equal(restored.getSnapshot().expectedFileId, '42')
  assert.equal(restored.getSnapshot().taskId, 'task-1')
  assert.equal(reloaded.queries.length, 0)
  assert.equal(reloaded.creates.length, 0)
  close()
})

test('controllers and persisted tasks are scoped to the signed-in user and asset', async () => {
  const env = harness()
  const task = env.get()
  await task.submit(input)
  assert.notEqual(env.get(13), task)
  env.setUser({ id: 'bob' })
  const otherUserTask = env.get()
  assert.notEqual(otherUserTask, task)
  assert.equal(otherUserTask.getSnapshot().phase, 'idle')
  task.resume()
  assert.equal(env.queries.length, 0)
  await assert.rejects(task.submit(input), /signed-in user changed/)
  env.setUser({ id: 'alice' })
  assert.equal(env.get(), task)
})

test('omitted or invalid task progress and query failures retain the last reported percentage', async () => {
  const env = harness()
  const task = env.get()
  const unsubscribe = task.subscribe(() => {})
  await task.submit(input)
  await flush()
  for (const progress of [undefined, null, '', 'invalid']) {
    env.setDetail(() => Promise.resolve({ ...running, progress }))
    await env.tick()
    assert.equal(task.getSnapshot().progress, 36)
  }
  env.setDetail(() => Promise.reject(new Error('Offline')))
  await env.tick()
  assert.equal(task.getSnapshot().progress, 36)
  const stored = JSON.parse([...env.storage.values()][0])
  assert.equal(stored.progress, 36)
  env.setDetail(() => Promise.resolve({ ...running, progress: 0 }))
  await env.tick()
  assert.equal(task.getSnapshot().progress, 0, 'A genuine API zero must still be shown')
  unsubscribe()
})

test('activity snapshot retains ownership offscreen without rerendering the parent for progress', async () => {
  const env = harness()
  const task = env.get()
  let notifications = 0
  const stopActivity = env.subscribeActivity(() => { notifications += 1 })
  const closeEditor = task.subscribe(() => {})
  await task.submit(input, [], 'draft-look-12')
  await flush()
  const active = env.active()
  assert.deepEqual([...active], [12])
  assert.equal(notifications, 1)
  env.setDetail(() => Promise.resolve({ ...running, progress: 70 }))
  await env.tick()
  assert.equal(env.active(), active)
  assert.equal(notifications, 1)
  closeEditor()
  assert.equal(env.timers.size, 0)
  assert.equal(env.active(), active, 'Closing the editor must not release task ownership')
  env.setUser({ id: 'bob' })
  assert.deepEqual([...env.active()], [])
  env.setUser({ id: 'alice' })
  assert.equal(env.active(), active)
  const reloaded = harness(env.storage)
  const restored = reloaded.get()
  assert.deepEqual([...reloaded.active()], [12])
  assert.equal(restored.getSnapshot().clientLookId, 'draft-look-12')
  env.setDetail(() => Promise.resolve(succeeded))
  const reopen = task.subscribe(() => {})
  await flush()
  task.complete('task-1')
  assert.deepEqual([...env.active()], [])
  assert.equal(notifications, 2)
  reopen()
  stopActivity()
})
