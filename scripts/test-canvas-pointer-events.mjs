import test from 'node:test'
import assert from 'node:assert/strict'
import { bindCanvasPointerEvents } from '../src/pages/canvas/TapnowStudio/canvasPointerEvents.js'

function harness() {
  const listeners = new Map(), frames = new Map(), calls = []
  let seq = 0, hit = null
  const target = {
    document: { elementFromPoint: () => hit },
    addEventListener(name, fn, capture) { assert.equal(capture, true); listeners.set(name, fn) },
    removeEventListener(name, fn, capture) { assert.equal(capture, true); assert.equal(listeners.get(name), fn); listeners.delete(name) },
    requestAnimationFrame(fn) { frames.set(++seq, fn); return seq },
    cancelAnimationFrame(id) { frames.delete(id) },
  }
  const h = {
    active: true, connecting: true, canvas: { contains: item => item.inside },
    move: event => calls.push(['move', event.clientX]),
    end: () => calls.push(['end']),
    connect: (...args) => calls.push(['connect', args[0], args[2]]),
    background: () => calls.push(['background']),
    cancel() { calls.push(['cancel']); h.connecting = false; h.active = false },
    report: error => calls.push(['error', error.message]),
  }
  const dispose = bindCanvasPointerEvents(target, () => h)
  return {
    h, calls, frames, listeners, dispose,
    hit(nodeId, port, inside = true) {
      hit = { inside, closest: selector => selector === '[data-node-id]' ? (nodeId ? { dataset: { nodeId } } : null) : (port ? { dataset: { inputType: port } } : null) }
    },
    fire(name, fields = {}) {
      const event = { clientX: 12, clientY: 20, pointerType: 'mouse', buttons: 1, detail: 1, preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true }, ...fields }
      listeners.get(name)?.(event)
      return event
    },
    tick() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()) },
  }
}

test('capture-phase release on empty preview or media controls commits exactly once and clears the wire', () => {
  for (const id of ['empty-preview', 'video-controls', 'image-preview']) {
    const h = harness(); h.hit(id)
    const up = h.fire('pointerup')
    assert.equal(up.stopped, true)
    assert.deepEqual(h.calls, [['connect', id, 'default'], ['end'], ['cancel']])
    assert.equal(h.fire('mouseup').stopped, true)
    assert.equal(h.fire('click').stopped, true)
    assert.equal(h.calls.filter(call => call[0] === 'connect').length, 1)
    h.fire('pointerdown')
    assert.equal(h.fire('click').stopped, undefined, 'subsequent controls must remain usable')
  }
})

test('release resolves the actual hit node and preserves special input types', () => {
  for (const port of ['veo_start', 'veo_end', 'oref', 'sref']) {
    const h = harness(); h.hit('destination', port)
    h.fire('pointerup', { target: { dataset: { nodeId: 'captured-source' } } })
    assert.deepEqual(h.calls[0], ['connect', 'destination', port])
  }
})

test('blank canvas keeps the add-node menu, while releases outside the canvas only cancel', () => {
  for (const inside of [true, false]) {
    const h = harness(); h.hit(null, null, inside); h.fire('pointerup')
    assert.deepEqual(h.calls, inside ? [['background'], ['end'], ['cancel']] : [['end'], ['cancel']])
  }
})

test('a failed commit reports the error and always clears the gesture', () => {
  const h = harness(); h.hit('preview'); h.h.connect = () => { throw new Error('commit failed') }
  h.fire('pointerup')
  assert.deepEqual(h.calls, [['error', 'commit failed'], ['end'], ['cancel']])
})

test('Escape, pointer cancellation, window blur and missed mouse release cancel pending frames', () => {
  for (const name of ['keydown', 'pointercancel', 'blur', 'pointermove']) {
    const h = harness(); h.fire('pointermove'); assert.equal(h.frames.size, 1)
    h.fire(name, { key: 'Escape', buttons: 0 })
    h.tick()
    assert.deepEqual(h.calls, [['end'], ['cancel']])
  }
})

test('pointer bursts render once per frame using latest position and handlers', () => {
  const h = harness()
  for (let x = 0; x < 100; x++) h.fire('pointermove', { clientX: x })
  assert.equal(h.frames.size, 1); assert.equal(h.calls.length, 0)
  h.h.move = event => h.calls.push(['latest', event.clientX])
  h.tick(); assert.deepEqual(h.calls, [['latest', 99]])
  h.fire('pointermove'); h.dispose(); h.tick()
  assert.equal(h.listeners.size, 0); assert.equal(h.calls.length, 1)
})

test('ordinary node dragging and native media clicks retain their existing events', () => {
  const h = harness(); h.h.connecting = false
  h.fire('pointermove'); const event = h.fire('pointerup')
  assert.deepEqual(h.calls, [['move', 12], ['end']])
  assert.equal(event.prevented, undefined)
  assert.equal(h.fire('click').stopped, undefined)
  h.h.active = false; h.fire('pointermove'); h.fire('pointerup'); h.fire('keydown', { key: 'Escape' })
  assert.equal(h.calls.length, 2)
})
