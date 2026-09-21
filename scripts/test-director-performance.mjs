import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { createUiTextFixture } from './ui-text-fixture.mjs'
const ui = createUiTextFixture()
import ts from 'typescript'
import { Vector3, PerspectiveCamera } from 'three'

function load(path, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../src/pages/directorDesk/' + path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(code, { exports, structuredClone, ...globals, require(name) {
    if (name.endsWith('/uiText')) return ui
    if (!(name in imports)) throw new Error('Unexpected dependency: ' + name)
    return imports[name]
  } })
  return exports
}
function observerHarness() {
  let state = { project: { objects: [] }, viewportAspectRatio: '16:9', finishedShotFov: null, cameraMotionProgress: 0, cameraMotionPlaying: false }
  const timers = new Map()
  const listeners = new Set()
  let id = 0, now = 0, pending = 0, checks = 0, dirty = false
  const baseline = JSON.stringify(state.project)
  const module = load('directorDirtyObserver.ts', {}, {
    setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id },
    clearTimeout(id) { timers.delete(id) },
  })
  const dispose = module.observeDirectorChanges((fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    () => { pending++; dirty = true }, () => { checks++; dirty = JSON.stringify(state.project) !== baseline })
  return {
    patch(patch) { const previous = state; state = { ...state, ...patch }; for (const listener of listeners) listener(state, previous) },
    tick(ms) { now += ms; for (const [id, task] of timers) if (task.at <= now) { timers.delete(id); task.fn() } },
    get pending() { return pending }, get checks() { return checks }, get dirty() { return dirty },
    get timers() { return timers.size }, get listeners() { return listeners.size }, dispose,
  }
}
test('600 playback progress events cause no snapshot checks; stopping checks once', () => {
  const h = observerHarness()
  h.patch({ cameraMotionPlaying: true })
  for (let frame = 1; frame <= 600; frame++) { h.patch({ cameraMotionProgress: frame / 600 }); h.tick(16) }
  assert.equal(h.checks, 0)
  assert.equal(h.pending, 0)
  h.patch({ cameraMotionPlaying: false })
  assert.equal(h.dirty, true)
  h.tick(200)
  assert.equal(h.checks, 1)
})
test('a continuous drag marks dirty immediately and coalesces 120 edits into one check', () => {
  const h = observerHarness()
  for (let frame = 0; frame < 120; frame++) {
    h.patch({ project: { objects: [{ x: frame }] } })
    assert.equal(h.dirty, true)
    h.tick(16)
  }
  assert.equal(h.checks, 0)
  assert.equal(h.timers, 1)
  h.tick(200)
  assert.equal(h.checks, 1)
})
test('real edits during playback are still checked', () => {
  const h = observerHarness()
  h.patch({ cameraMotionPlaying: true })
  h.patch({ project: { objects: [{ id: 'new' }] } })
  h.tick(200)
  assert.equal(h.checks, 1)
  assert.equal(h.dirty, true)
})
test('paused seeks and view changes trigger checks, unrelated selection changes do not', () => {
  const h = observerHarness()
  h.patch({ selectedObjectId: 'object-1' })
  h.tick(200)
  assert.equal(h.checks, 0)
  for (const patch of [{ cameraMotionProgress: .5 }, { finishedShotFov: 60 }, { viewportAspectRatio: '9:16' }]) {
    h.patch(patch); h.tick(200)
  }
  assert.equal(h.checks, 3)
})
test('undo back to baseline clears dirty after the coalesced comparison', () => {
  const h = observerHarness()
  h.patch({ project: { objects: [{ id: 'new' }] } })
  h.tick(200)
  assert.equal(h.dirty, true)
  h.patch({ project: { objects: [] } })
  h.tick(200)
  assert.equal(h.dirty, false)
})
test('disposing observer removes subscriptions and pending comparisons', () => {
  const h = observerHarness()
  h.patch({ cameraMotionProgress: .4 })
  h.dispose()
  h.tick(200)
  assert.equal(h.listeners, 0)
  assert.equal(h.timers, 0)
  assert.equal(h.checks, 0)
})
test('fingerprinting avoids cloning, while saved snapshots remain isolated from later edits', () => {
  let clones = 0
  const state = { project: { objects: [{ id: 'actor' }] }, viewportAspectRatio: '16:9', finishedShotFov: null }
  const module = load('directorCloudSnapshot.ts', {
    './runtime/editor/store/directorStore': { useDirectorStore: { getState: () => state } },
    './runtime/editor/runtime/playbackRuntime': { getRuntimePlaybackProgress: () => .4 },
    './runtime/editor/io/projectDocument': {},
    './runtime/editor/io/cleanFrameExport': {},
    './runtime/editor/io/referenceVideoExport': {},
  }, { structuredClone(value) { clones++; return structuredClone(value) } })
  const bindings = [{ objectId: 'actor', assetId: 1 }]
  const fingerprint = module.fingerprintDirectorSnapshot(bindings)
  assert.equal(clones, 0)
  const snapshot = module.readDirectorSnapshot()
  assert.equal(clones, 1)
  assert.equal(fingerprint, JSON.stringify({ ...snapshot, characterBindings: bindings }))
  state.project.objects[0].id = 'changed'
  assert.equal(snapshot.project.objects[0].id, 'actor')
})

function demandHarness(frameloop = 'demand') {
  const state = { frameloop, internal: { frames: 0 } }
  const stores = new Set(), playback = new Set()
  const effects = [], calls = []
  const three = { get: () => state, invalidate: (frames) => { calls.push(frames); state.internal.frames += frames } }
  const module = load('runtime/editor/canvas/DirectorDemandFrames.tsx', {
    react: { useEffect: (fn) => effects.push(fn) },
    '@react-three/fiber': { useThree: (selector) => selector(three) },
    '../store/directorStore': { useDirectorStore: { subscribe(fn) { stores.add(fn); return () => stores.delete(fn) } } },
    '../runtime/playbackRuntime': { subscribeRuntimePlayback(fn) { playback.add(fn); return () => playback.delete(fn) } },
  })
  module.default()
  const dispose = effects[0]()
  return { state, calls, stores, playback, dispose }
}
test('idle canvas wakes for edits and paused seeks; a burst does not accumulate frames', () => {
  const h = demandHarness()
  assert.deepEqual(h.calls, [2])
  for (let event = 0; event < 100; event++) for (const fn of h.stores) fn()
  assert.deepEqual(h.calls, [2])
  h.state.internal.frames = 0
  for (const fn of h.playback) fn()
  assert.deepEqual(h.calls, [2, 2])
  h.state.internal.frames = 1
  for (const fn of h.stores) fn()
  assert.equal(h.state.internal.frames, 2)
})
test('continuous playback does not enqueue idle frames, and unmount releases both subscriptions', () => {
  const h = demandHarness('always')
  for (const fn of h.stores) fn()
  for (const fn of h.playback) fn()
  assert.equal(h.calls.length, 0)
  h.dispose()
  assert.equal(h.stores.size, 0)
  assert.equal(h.playback.size, 0)
})
test('keyboard navigation wakes a demand canvas and keeps moving until keyup', () => {
  const handlers = new Map(), effects = []
  let frame, invalidations = 0
  const camera = new PerspectiveCamera()
  const controls = { target: new Vector3(), update() {} }
  const module = load('runtime/editor/canvas/DirectorKeyboardController.tsx', {
    react: { useRef: (current) => ({ current }), useEffect: (fn) => effects.push(fn) },
    '@react-three/fiber': { useThree: () => ({ camera, invalidate: () => invalidations++ }), useFrame: (fn) => { frame = fn } },
    three: { Vector3 },
    '../io/directorDeskDom': { getDirectorDeskEventTarget: () => null },
  }, { window: { addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: (name) => handlers.delete(name) } })
  module.DirectorKeyboardController({ active: true, controlsRef: { current: controls } })
  const dispose = effects[0]()
  const key = { code: 'KeyW', preventDefault() {} }
  handlers.get('keydown')(key)
  assert.equal(invalidations, 1)
  frame({}, 1 / 60)
  assert.ok(camera.position.z < 0)
  assert.equal(invalidations, 2)
  handlers.get('keyup')(key)
  const z = camera.position.z
  frame({}, 1 / 60)
  assert.equal(camera.position.z, z)
  assert.equal(invalidations, 2)
  dispose()
  assert.equal(handlers.size, 0)
})

function entryHarness(query) {
  const states = [], refs = [], effects = []
  let stateIndex = 0, refIndex = 0, first = true
  const params = new URLSearchParams(query)
  const host = { shadowRoot: { replaceChildren() {} } }
  const element = (type, props, key) => ({ type, props, key })
  const module = load('DirectorDeskStandalonePage.tsx', {
    react: {
      useState(initial) {
        const index = stateIndex++
        if (first) states[index] = typeof initial === 'function' ? initial() : initial
        return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
      },
      useRef(initial) {
        const index = refIndex++
        if (first) refs[index] = { current: initial === null ? host : initial }
        return refs[index]
      },
      useLayoutEffect(fn) { if (first) effects.push(fn) },
      useCallback(fn) { return fn },
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-dom': { createPortal: (child) => child },
    'react-router-dom': { useNavigate: () => () => {}, useParams: () => ({ deskId: 'segment-1' }), useSearchParams: () => [params] },
    './DirectorDeskCaptureBridge': { default: 'CaptureBridge' },
    './runtime/DirectorDeskApp': { default: 'Editor' },
    './runtime/editor/io/directorDeskDom': { registerDirectorDeskDom() {}, unregisterDirectorDeskDom() {}, applyDirectorDeskTheme() {} },
    './runtime/styles/index.css?inline': { default: '' },
    './DirectorDeskCloudPanel': { default: 'CloudPanel' },
    antd: { Modal: {} },
  }, { document: { createElement: () => ({}) } })
  function render() {
    stateIndex = 0; refIndex = 0
    const tree = module.default({})
    if (first) { first = false; for (const effect of effects) effect(); return render() }
    return tree
  }
  const find = (tree, type) => {
    if (!tree || typeof tree !== 'object') return []
    if (Array.isArray(tree)) return tree.flatMap((child) => find(child, type))
    return [...(tree.type === type ? [tree] : []), ...find(tree.props?.children, type)]
  }
  return { render, find }
}
test('cloud entry mounts no local editor; only the resolved cloud scene is mounted', () => {
  const h = entryHarness('segmentId=1')
  let tree = h.render()
  assert.equal(h.find(tree, 'Editor').length, 0)
  assert.equal(h.find(tree, 'CaptureBridge').length, 0)
  // Waiting for a draft decision leaves the loader in place.
  tree = h.render()
  assert.equal(h.find(tree, 'Editor').length, 0)
  h.find(tree, 'CloudPanel')[0].props.onOpen({ id: 8, instanceId: 'cloud-8', name: 'Test' })
  tree = h.render()
  assert.equal(h.find(tree, 'Editor').length, 1)
  assert.equal(h.find(tree, 'Editor')[0].props.cloudDesk.id, 8)
  assert.equal(h.find(tree, 'Editor')[0].key, 'cloud-1')
})
test('failed/cancelled cloud resolution releases the loader, local entry does not wait', () => {
  const h = entryHarness('cloudDeskId=8')
  let tree = h.render()
  h.find(tree, 'CloudPanel')[0].props.onInitialLoadSettled()
  tree = h.render()
  assert.equal(h.find(tree, 'Editor').length, 1)
  const local = entryHarness('')
  assert.equal(local.find(local.render(), 'Editor').length, 1)
})

function hookHarness() {
  const refs = [], effects = []
  let refIndex = 0, effectIndex = 0
  function effect(fn, deps) {
    const index = effectIndex++
    const old = effects[index]
    if (deps && old?.deps && deps.length === old.deps.length && deps.every((value, i) => Object.is(value, old.deps[i]))) return
    old?.cleanup?.()
    effects[index] = { deps, cleanup: fn() }
  }
  return {
    react: {
      useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial } },
      useLayoutEffect: effect, useEffect: effect,
    },
    render(fn) { refIndex = 0; effectIndex = 0; return fn() },
  }
}
test('orbit redraws reuse the same pose; seeks and model commits invalidate it', () => {
  const hooks = hookHarness()
  const { useRuntimePoseSample } = load('runtime/editor/runtime/useRuntimePoseSample.ts', { react: hooks.react })
  let shouldSample = hooks.render(() => useRuntimePoseSample())
  let samples = 0
  for (let frame = 0; frame < 600; frame++) if (shouldSample(.4)) samples++
  assert.equal(samples, 1)
  assert.equal(shouldSample(.5), true)
  assert.equal(shouldSample(.4), true)
  shouldSample = hooks.render(() => useRuntimePoseSample())
  assert.equal(shouldSample(.4), true, 'changed rig/action at the same time must update')
  assert.equal(shouldSample(.4), false)
})
test('UI snapshot refresh cannot rewind a camera being rotated; explicit commands still apply', () => {
  const hooks = hookHarness()
  const camera = new PerspectiveCamera()
  let invalidations = 0, controlUpdates = 0
  const invalidate = () => invalidations++
  const { DirectorViewCameraSync } = load('runtime/editor/canvas/DirectorViewCameraSync.tsx', {
    react: hooks.react,
    '@react-three/fiber': { useThree: () => ({ camera, invalidate }) },
  })
  const snapshot = (x) => ({ position: [x, 2, 3], target: [0, 1, 0], fov: 50 })
  const snapshotRef = { current: snapshot(10) }
  const controlsRef = { current: { target: new Vector3(), update() { controlUpdates++ } } }
  let props = { controlsRef, snapshotRef, revision: 0, viewMode: 'director', disabled: false }
  const render = () => hooks.render(() => DirectorViewCameraSync(props))
  render()
  assert.equal(camera.position.x, 10)
  // The actual controls advance beyond the snapshot a delayed React render saw.
  snapshotRef.current = snapshot(20)
  camera.position.x = 21
  for (let update = 0; update < 120; update++) render()
  assert.equal(camera.position.x, 21)
  assert.equal(controlUpdates, 1)
  assert.equal(invalidations, 1)
  snapshotRef.current = snapshot(30)
  props = { ...props, revision: 1 }
  render()
  assert.equal(camera.position.x, 30)
  assert.equal(controlUpdates, 2)
  props = { ...props, viewMode: 'camera' }
  camera.position.x = 90
  render()
  assert.equal(camera.position.x, 90)
  props = { ...props, viewMode: 'director' }
  render()
  assert.equal(camera.position.x, 30)
  props = { ...props, disabled: true, revision: 2 }
  snapshotRef.current = snapshot(40)
  render()
  assert.equal(camera.position.x, 30)
  props = { ...props, disabled: false }
  render()
  assert.equal(camera.position.x, 40)
})
test('Auto reduces interaction pixel work and restores it; manual quality and exports bypass it', () => {
  const hooks = hookHarness(), dprs = []
  const state = { performance: { current: 1 }, setDpr: (value) => dprs.push(value) }
  const { DirectorInteractionResolution } = load('runtime/editor/canvas/DirectorInteractionResolution.tsx', {
    react: hooks.react,
    '@react-three/fiber': { useThree: (selector) => selector(state) },
  }, { window: { devicePixelRatio: 2 } })
  let props = { baseDpr: 1, enabled: true }
  const render = () => hooks.render(() => DirectorInteractionResolution(props))
  render()
  assert.equal(dprs.at(-1), 1)
  state.performance.current = .75
  render()
  assert.equal(dprs.at(-1), .75)
  assert.equal(dprs.at(-1) ** 2, .5625)
  state.performance.current = 1
  render()
  assert.equal(dprs.at(-1), 1)
  state.performance.current = .75
  props = { baseDpr: .75, enabled: true }
  render()
  assert.equal(dprs.at(-1), .5625)
  props = { baseDpr: [1, 2], enabled: false }
  render()
  assert.equal(dprs.at(-1), 2, 'manual quality must not be overwritten by the old Auto DPR')
  props = { baseDpr: 1, enabled: false }
  render()
  assert.equal(dprs.at(-1), 1, 'capture mode restores full configured resolution')
})
