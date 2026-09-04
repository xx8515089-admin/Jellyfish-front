import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/aiStudio/project/assetBatchGenerationPolling.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText
const running = { allGenerated: false, shouldPoll: true, items: [] }
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve() }

function harness() {
  let timerId = 0
  const timers = new Map()
  const requests = []
  const statuses = []
  const errors = []
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    window: {
      setTimeout: (callback, delay) => {
        const id = ++timerId
        timers.set(id, { callback, delay })
        return id
      },
      clearTimeout: (id) => timers.delete(id),
    },
  }, { filename: 'assetBatchGenerationPolling.js' })
  const start = (scope = 'overview', isCurrent = () => true) => exports.startBatchGenerationPolling({
    requestStatus: () => {
      let resolve
      let reject
      const promise = new Promise((yes, no) => { resolve = yes; reject = no })
      const request = {
        scope, promise, resolve, reject, cancelled: false,
        cancel() { this.cancelled = true },
      }
      requests.push(request)
      return request
    },
    onStatus: (status) => statuses.push({ scope, status }),
    onError: (error) => errors.push({ scope, error }),
    isCurrent,
  })
  return {
    start, requests, statuses, errors, timers,
    resolve: async (status = running, index = requests.length - 1) => {
      requests[index].resolve(status)
      await flush()
    },
    reject: async (error = new Error('Network offline'), index = requests.length - 1) => {
      requests[index].reject(error)
      await flush()
    },
    tick: async () => {
      assert.equal(timers.size, 1, 'A polling lane should schedule exactly one next query')
      const [id, timer] = [...timers.entries()][0]
      timers.delete(id)
      timer.callback()
      await flush()
      return timer.delay
    },
  }
}

test('the selected scope has one in-flight query and schedules the next only after its response', async () => {
  const env = harness()
  const stop = env.start('episode-2571')
  assert.equal(env.requests.length, 1)
  assert.equal(env.timers.size, 0)
  await flush()
  assert.equal(env.requests.length, 1)
  await env.resolve()
  assert.equal(env.requests.length, 1)
  assert.equal(await env.tick(), 3000)
  assert.equal(env.requests.length, 2)
  assert.deepEqual(env.requests.map((request) => request.scope), ['episode-2571', 'episode-2571'])
  assert.equal(env.timers.size, 0)
  stop()
  assert.equal(env.requests[1].cancelled, true)
})

test('shouldPoll false stops even if some assets are still pending', async () => {
  const env = harness()
  env.start()
  await env.resolve({ ...running, shouldPoll: false, pendingCount: 12 })
  assert.equal(env.statuses.length, 1)
  assert.equal(env.requests.length, 1)
  assert.equal(env.timers.size, 0)
})

test('allGenerated true stops even if the response still says shouldPoll true', async () => {
  const env = harness()
  env.start()
  await env.resolve({ ...running, allGenerated: true })
  assert.equal(env.statuses[0].status.allGenerated, true)
  assert.equal(env.timers.size, 0)
})

test('switching scopes cancels the old in-flight query and ignores its late successful response', async () => {
  const env = harness()
  const stopPrevious = env.start('episode-1')
  stopPrevious()
  env.start('overview')
  assert.equal(env.requests[0].cancelled, true)
  await env.resolve({ ...running, allGenerated: true }, 0)
  assert.equal(env.statuses.length, 0)
  assert.equal(env.timers.size, 0)
  await env.resolve({ ...running, shouldPoll: false }, 1)
  assert.deepEqual(env.statuses.map(({ scope }) => scope), ['overview'])
  assert.equal(env.errors.length, 0)
})

test('cancellation ignores a late rejection and removes a scheduled timer', async () => {
  const failed = harness()
  const stopFailed = failed.start()
  stopFailed()
  await failed.reject()
  assert.equal(failed.errors.length, 0)
  assert.equal(failed.timers.size, 0)

  const scheduled = harness()
  const stopScheduled = scheduled.start()
  await scheduled.resolve()
  assert.equal(scheduled.timers.size, 1)
  stopScheduled()
  assert.equal(scheduled.timers.size, 0)
  assert.equal(scheduled.requests.length, 1)
})

test('network errors back off for 3s and 6s then pause after the third failure', async () => {
  const env = harness()
  env.start()
  await env.reject()
  assert.equal(await env.tick(), 3000)
  await env.reject()
  assert.equal(await env.tick(), 6000)
  await env.reject()
  assert.equal(env.errors.length, 3)
  assert.equal(env.requests.length, 3)
  assert.equal(env.statuses.length, 0)
  assert.equal(env.timers.size, 0)
})

test('401 and 403 stop immediately without retrying', async () => {
  for (const status of [401, 403]) {
    const env = harness()
    env.start()
    const error = Object.assign(new Error('Access denied'), { status })
    await env.reject(error)
    assert.equal(env.errors[0].error, error)
    assert.equal(env.requests.length, 1)
    assert.equal(env.timers.size, 0)
  }
})

test('a successful query resets the consecutive error count', async () => {
  const env = harness()
  env.start()
  await env.reject()
  assert.equal(await env.tick(), 3000)
  await env.reject()
  assert.equal(await env.tick(), 6000)
  await env.resolve()
  assert.equal(await env.tick(), 3000)
  await env.reject()
  assert.equal(await env.tick(), 3000)
  await env.reject()
  assert.equal(await env.tick(), 6000)
  await env.reject()
  assert.equal(env.errors.length, 5)
  assert.equal(env.statuses.length, 1)
  assert.equal(env.timers.size, 0)
})

test('an invalidated scope never queries or schedules another query', async () => {
  const inactive = harness()
  inactive.start('episode-1', () => false)
  assert.equal(inactive.requests.length, 0)
  assert.equal(inactive.timers.size, 0)

  const env = harness()
  let current = true
  env.start('episode-1', () => current)
  await env.resolve()
  current = false
  await env.tick()
  assert.equal(env.requests.length, 1)
  assert.equal(env.timers.size, 0)
})

test('a submission revision invalidates older status responses before they can overwrite newer state', async () => {
  const env = harness()
  let revision = 0
  env.start('episode-1', () => revision === 0)
  revision = 1
  env.start('episode-1', () => revision === 1)
  const currentStatus = { ...running, items: [{ taskId: 72, progress: 9 }] }
  await env.resolve(currentStatus, 1)
  await env.resolve({ ...running, allGenerated: true, shouldPoll: false }, 0)
  assert.equal(env.statuses.length, 1)
  assert.equal(env.statuses[0].status, currentStatus)
  assert.equal(env.timers.size, 1)
  assert.equal(env.errors.length, 0)
})

test('an invalidated in-flight error does not report a failure or retry', async () => {
  const env = harness()
  let current = true
  env.start('episode-1', () => current)
  current = false
  await env.reject()
  assert.equal(env.errors.length, 0)
  assert.equal(env.statuses.length, 0)
  assert.equal(env.timers.size, 0)
})
