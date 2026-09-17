import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { removeQueuedSnapshot, stopRunningSnapshot } from '../src/pages/canvas/TapnowStudio/canvasQueueSnapshots.js'

const appSource = ts.createSourceFile('App.jsx', readFileSync(new URL('../src/pages/canvas/TapnowStudio/App.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
const callbackNames = new Set(['clearBatchQueue', 'removeQueuedBatchItem', 'stopRunningShot', 'removeQueuedBatchGroup', 'clearNodeQueue'])
const callbacks = new Map()
function visit(node) {
  if (ts.isVariableDeclaration(node) && callbackNames.has(node.name.getText(appSource))) {
    callbacks.set(node.name.getText(appSource), node.initializer.arguments[0].getText(appSource))
  }
  ts.forEachChild(node, visit)
}
visit(appSource)

const makeNode = (id, shots) => ({ id, type: 'storyboard-node', settings: { shots } })
const running = (id, started = 1000) => ({ id, status: 'generating', generationStartTime: started })
const runningItem = (nodeId, shot) => ({ nodeId, shotId: shot.id, shot, generationStartTime: shot.generationStartTime })
const queued = (shotId, extra = {}) => ({ nodeId: 'board', shotId, batchId: 'batch', ...extra })

function harness(queue, nodes) {
  const state = { queue, nodes, updates: 0 }
  const refs = { pendingStartsRef: { current: new Set(['unrelated:shot']) }, batchStateRef: { current: 'running' }, shotBatchMapRef: { current: new Map([['unrelated:shot', { batchId: 'new' }]]) } }
  const scope = {
    removeQueuedSnapshot, stopRunningSnapshot, ...refs,
    setBatchQueue: update => { state.queue = typeof update === 'function' ? update(state.queue) : update },
    setNodes: update => { state.nodes = typeof update === 'function' ? update(state.nodes) : update },
    updateShot: (nodeId, shotId, patch) => {
      state.updates++
      state.nodes = state.nodes.map(node => node.id !== nodeId ? node : { ...node, settings: { ...node.settings, shots: node.settings.shots.map(shot => shot.id === shotId ? { ...shot, ...patch } : shot) } })
    },
  }
  const actions = Object.fromEntries([...callbacks].map(([name, source]) => [name, vm.runInNewContext(`(${source})`, scope)]))
  return { state, refs, actions }
}

test('queue snapshots preserve replacements even when legacy or batch identifiers match', () => {
  const original = queued('shot'), replacement = { ...original }, added = queued('new')
  const legacy = queued('legacy', { batchId: undefined }), legacyReplacement = { ...legacy }
  const current = [original, replacement, added, legacyReplacement]
  assert.deepEqual(removeQueuedSnapshot(current, [{ ...original, status: 'queued', queueItem: original }, legacy]), [replacement, added, legacyReplacement])
  assert.equal(removeQueuedSnapshot(current, []), current)
  assert.equal(removeQueuedSnapshot(current, [{ ...original }]), current)
})

for (const action of ['clearBatchQueue', 'clearNodeQueue']) {
  test(`${action} targets the confirmation snapshot, leaving added work and completed results intact`, () => {
    const original = queued('queued'), replacement = { ...original }
    const active = running('active'), completedBeforeConfirm = running('completed'), restartedBeforeConfirm = running('restarted')
    const snapshot = { queued: [original], running: [active, completedBeforeConfirm, restartedBeforeConfirm].map(shot => runningItem('board', shot)) }
    const done = { ...completedBeforeConfirm, status: 'done', output_url: 'https://example.test/result.png' }
    const restarted = { ...restartedBeforeConfirm, generationStartTime: 2000 }
    const added = running('added', 3000)
    const h = harness([original, replacement, queued('new')], [makeNode('board', [active, done, restarted, added])])
    if (action === 'clearBatchQueue') h.actions[action](true, snapshot)
    else h.actions[action]('board', true, snapshot)
    assert.deepEqual(h.state.queue.map(item => item.shotId), ['queued', 'new'])
    assert.equal(h.state.queue[0], replacement)
    const shots = h.state.nodes[0].settings.shots
    assert.equal(shots[0].status, 'failed')
    assert.equal(shots[1], done)
    assert.equal(shots[2], restarted)
    assert.equal(shots[3], added)
    assert.equal(h.refs.pendingStartsRef.current.has('unrelated:shot'), true)
    assert.equal(h.refs.shotBatchMapRef.current.has('unrelated:shot'), true)
    assert.equal(h.refs.batchStateRef.current, 'running')
  })
}

test('clearNodeQueue cannot remove another node even if accidentally included in the snapshot', () => {
  const first = queued('one'), other = queued('two', { nodeId: 'other' })
  const otherShot = running('two')
  const h = harness([first, other], [makeNode('other', [otherShot])])
  h.actions.clearNodeQueue('board', true, { queued: [first, other], running: [runningItem('other', otherShot)] })
  assert.deepEqual(h.state.queue, [other])
  assert.equal(h.state.nodes[0].settings.shots[0], otherShot)
})

test('clear queued work does not stop the tasks that were running while the dialog opened', () => {
  const item = queued('queued'), active = running('active')
  const h = harness([item], [makeNode('board', [active])])
  h.actions.clearBatchQueue(false, { queued: [item], running: [runningItem('board', active)] })
  assert.equal(h.state.queue.length, 0)
  assert.equal(h.state.nodes[0].settings.shots[0], active)
})

for (const status of ['generating', 'done']) {
  test(`removing a queue item that became ${status} while confirming preserves its current state`, () => {
    const original = queued('shot'), replacement = { ...original }, shot = { ...running('shot'), status, output_url: 'result' }
    const h = harness([replacement], [makeNode('board', [shot])])
    h.actions.removeQueuedBatchItem('board', 'shot', { ...original, queueItem: original })
    assert.deepEqual(h.state.queue, [replacement])
    assert.equal(h.state.nodes[0].settings.shots[0], shot)
    assert.equal(h.state.updates, 0)
  })
}

test('removing a group keeps tasks added to the same batch after confirmation opened', () => {
  const original = queued('one'), newTask = queued('two')
  const h = harness([original, newTask], [])
  h.actions.removeQueuedBatchGroup('batch', [original])
  assert.deepEqual(h.state.queue, [newTask])
  assert.equal(h.state.updates, 0)
})

test('stopRunningShot checks generation attempt after progress creates a new shot object', () => {
  const old = running('shot'), progressed = { ...old, progress: 80 }
  const h = harness([], [makeNode('board', [progressed])])
  h.actions.stopRunningShot('board', 'shot', runningItem('board', old))
  assert.equal(h.state.nodes[0].settings.shots[0].status, 'failed')
  assert.equal(h.state.nodes[0].settings.shots[0].progress, 80)
})

for (const next of [{ status: 'done' }, { generationStartTime: 2000 }]) {
  test(`stopRunningShot preserves a task that ${next.status ? 'completed' : 'restarted'} while confirming`, () => {
    const old = running('shot'), current = { ...old, ...next }
    const h = harness([], [makeNode('board', [current])])
    const originalNodes = h.state.nodes
    h.actions.stopRunningShot('board', 'shot', runningItem('board', old))
    assert.equal(h.state.nodes, originalNodes)
  })
}

test('legacy running tasks without timestamps require the original shot reference', () => {
  const old = { id: 'shot', status: 'generating' }, different = { ...old }
  const nodes = [makeNode('board', [different])]
  assert.equal(stopRunningSnapshot(nodes, [runningItem('board', old)]), nodes)
  assert.equal(stopRunningSnapshot([makeNode('board', [old])], [runningItem('board', old)])[0].settings.shots[0].status, 'failed')
})

test('calls without a snapshot preserve the existing immediate cancellation behavior', () => {
  const shot = running('shot')
  const h = harness([queued('shot')], [makeNode('board', [shot])])
  h.actions.clearBatchQueue(true)
  assert.equal(h.state.queue.length, 0)
  assert.equal(h.state.nodes[0].settings.shots[0].status, 'failed')
  assert.equal(h.refs.pendingStartsRef.current.size, 0)
  assert.equal(h.refs.shotBatchMapRef.current.size, 0)
  assert.equal(h.refs.batchStateRef.current, 'idle')
})
