import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduleCanvasSnapshotSync } from '../src/pages/canvas/TapnowStudio/canvasSnapshotSync.js'

function clock() {
  let now = 0, sequence = 0
  const pending = new Map()
  return {
    setTimeout(callback, delay) { const id = ++sequence; pending.set(id, { callback, at: now + delay }); return id },
    clearTimeout(id) { pending.delete(id) },
    tick(ms) {
      const until = now + ms
      while (true) {
        const next = [...pending].filter(([, item]) => item.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        pending.delete(next[0]); now = next[1].at; next[1].callback()
      }
      now = until
    },
  }
}
const initial = () => ({ nodes: [], connections: [], view: { x: 0, y: 0, zoom: 1 }, projectName: 'Canvas' })
const settle = async () => { await Promise.resolve(); await Promise.resolve() }
function harness(options = {}) {
  const drafts = [], writes = [], events = []
  const timers = clock()
  const saved = { current: JSON.stringify(initial()) }
  return {
    drafts, writes, events, timers, saved,
    schedule(snapshot, overrides = {}) {
      return scheduleCanvasSnapshotSync({ snapshot, timers, saved,
        session: { draft: async current => { drafts.push(current); return { snapshot: current } }, write: (key, value) => writes.push([key, value]) },
        save: async () => { events.push('save') }, onDirty: () => events.push('dirty'), onDraftError: () => events.push('error'),
        ...options, ...overrides,
      })
    },
  }
}

test('continuous pan does not serialize or back up the graph per frame; the final viewport is saved', async () => {
  const h = harness()
  let visits = 0, current
  const nodes = [{ id: 'media', toJSON() { visits++; return { id: 'media', content: 'image.png' } } }]
  for (let x = 1; x <= 120; x++) {
    current?.cancel()
    current = h.schedule({ ...initial(), nodes, view: { x, y: 0, zoom: 0.5 } })
    h.timers.tick(16)
  }
  assert.equal(visits, 0)
  assert.equal(h.drafts.length, 0)
  h.timers.tick(234)
  await settle()
  assert.equal(visits, 1)
  assert.equal(h.drafts.length, 1)
  assert.deepEqual(h.writes[0][1].snapshot.view, { x: 120, y: 0, zoom: 0.5 })
  assert.deepEqual(h.events, ['dirty'])
  h.timers.tick(1250)
  assert.deepEqual(h.events, ['dirty', 'save'])
})

test('a new snapshot cancels the previous scheduled cloud save', async () => {
  const h = harness()
  const first = h.schedule({ ...initial(), projectName: 'First' })
  h.timers.tick(500)
  first.cancel()
  h.schedule({ ...initial(), projectName: 'Latest' })
  h.timers.tick(1000)
  await settle()
  assert.equal(h.events.filter(event => event === 'save').length, 0)
  h.timers.tick(500)
  assert.equal(h.events.filter(event => event === 'save').length, 1)
  assert.equal(h.writes.at(-1)[1].snapshot.projectName, 'Latest')
})

test('paused sync still backs up local edits without saving them to the cloud', async () => {
  const h = harness({ autoSave: false })
  h.schedule({ ...initial(), view: { x: 50, y: 10, zoom: 0.25 } })
  h.timers.tick(2000)
  await settle()
  assert.equal(h.writes.length, 1)
  assert.deepEqual(h.events, [])
})

test('equivalent restored values do not create a draft or save another revision', async () => {
  const h = harness()
  h.schedule(initial())
  h.timers.tick(2000)
  await settle()
  assert.equal(h.drafts.length, 0)
  assert.deepEqual(h.events, [])
})

test('an old asynchronous media backup cannot overwrite a newer draft', async () => {
  const h = harness()
  let resolveOld
  const first = h.schedule({ ...initial(), projectName: 'Old' }, {
    session: { draft: () => new Promise(resolve => { resolveOld = resolve }), write: (key, draft) => h.writes.push([key, draft]) },
  })
  h.timers.tick(250)
  first.cancel()
  h.schedule({ ...initial(), projectName: 'New' })
  h.timers.tick(250)
  await settle()
  resolveOld({ snapshot: { projectName: 'Old' } })
  await settle()
  assert.equal(h.writes.length, 1)
  assert.equal(h.writes[0][1].snapshot.projectName, 'New')
})

test('a completed explicit save prevents its in-flight backup from recreating a dirty draft', async () => {
  const h = harness()
  const snapshot = { ...initial(), projectName: 'Saved' }
  let resolveDraft
  h.schedule(snapshot, { session: { draft: () => new Promise(resolve => { resolveDraft = resolve }), write: (key, draft) => h.writes.push([key, draft]) } })
  h.timers.tick(250)
  h.saved.current = JSON.stringify(snapshot)
  resolveDraft({ snapshot })
  await settle()
  h.timers.tick(1250)
  assert.equal(h.writes.length, 0)
  assert.equal(h.events.includes('save'), false)
})

test('leaving during the debounce window flushes the latest view even after effect cleanup', async () => {
  const h = harness()
  const snapshot = { ...initial(), view: { x: 90, y: 20, zoom: 0.1 } }
  const sync = h.schedule(snapshot)
  const flushed = sync.flush()
  sync.cancel()
  await flushed
  h.timers.tick(2000)
  assert.equal(h.drafts.length, 1)
  assert.deepEqual(h.writes[0][1].snapshot.view, snapshot.view)
  assert.equal(h.events.includes('save'), false)
})

test('unmount waits for an in-flight media draft instead of creating a second backup', async () => {
  const h = harness()
  let resolveDraft, count = 0
  const snapshot = { ...initial(), projectName: 'Unloading' }
  const sync = h.schedule(snapshot, { session: { draft: () => { count++; return new Promise(resolve => { resolveDraft = resolve }) }, write: (key, draft) => h.writes.push([key, draft]) } })
  h.timers.tick(250)
  const flushed = sync.flush()
  sync.cancel()
  resolveDraft({ snapshot })
  await flushed
  assert.equal(count, 1)
  assert.equal(h.writes.length, 1)
})

test('backup failures report an error and do not reject exit flushing', async () => {
  const h = harness()
  const sync = h.schedule({ ...initial(), projectName: 'Error' }, { session: { draft: async () => { throw new Error('disk full') } } })
  await sync.flush()
  assert.deepEqual(h.events, ['error'])
})
test('exit flushing uses the newest snapshot ref even before React installs its next effect', async () => {
  const h = harness()
  let latest = { ...initial(), projectName: 'Before' }
  const sync = h.schedule(latest, { getSnapshot: () => latest })
  h.timers.tick(250)
  await settle()
  latest = { ...latest, projectName: 'Latest', view: { x: 250, y: 30, zoom: 0.4 } }
  await sync.flush()
  sync.cancel()
  assert.equal(h.writes.length, 2)
  assert.deepEqual(h.writes.at(-1)[1].snapshot, latest)
})

test('a flushed pagehide backup cannot overwrite newer edits after navigation resumes', async () => {
  const h = harness()
  let latest = { ...initial(), projectName: 'Old' }, resolveOld
  const first = h.schedule(latest, {
    getSnapshot: () => latest,
    session: { draft: () => new Promise(resolve => { resolveOld = resolve }), write: (key, draft) => h.writes.push([key, draft]) },
  })
  const flushed = first.flush()
  first.cancel()
  latest = { ...latest, projectName: 'New' }
  h.schedule(latest, { getSnapshot: () => latest })
  h.timers.tick(250)
  await settle()
  resolveOld({ snapshot: { projectName: 'Old' } })
  await flushed
  assert.equal(h.writes.length, 1)
  assert.equal(h.writes[0][1].snapshot.projectName, 'New')
})