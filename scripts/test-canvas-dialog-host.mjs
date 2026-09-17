import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { createCanvasDialogStore } from '../src/pages/canvas/TapnowStudio/canvasDialogs.js'

function hostHarness() {
  const store = createCanvasDialogStore()
  const unmount = store.mount()
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) }
  const source = readFileSync(new URL('../src/pages/canvas/TapnowStudio/components/CanvasDialogHost.jsx', import.meta.url), 'utf8')
    .replace('function CanvasDialog(', 'export function CanvasDialog(')
  const code = ts.transpileModule(source, { fileName: 'CanvasDialogHost.jsx', compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  let currentValue
  const exports = {}
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === 'react') return { default: React, useState: initial => [currentValue ?? initial, value => { currentValue = value }] }
      if (name === 'antd') return { Button: 'Button', Input: Object.assign('Input', { TextArea: 'TextArea' }), Modal: 'Modal' }
      if (name === '../canvasDialogs') return { canvasDialogStore: store }
      if (name === '../i18n') return { default: { t: value => value } }
      throw new Error(name)
    },
  })
  return { store, unmount, render: () => exports.CanvasDialog({ item: store.getSnapshot(), language: 'zh' }) }
}

function event(key, isComposing = false) {
  return { key, nativeEvent: { isComposing }, stopped: false, prevented: false,
    stopPropagation() { this.stopped = true }, preventDefault() { this.prevented = true } }
}

test('dialog keys and clipboard stay inside the dialog without blocking text editing', async () => {
  const h = hostHarness()
  const pending = h.store.request('prompt', 'Name')
  const modal = h.render()
  const boundary = modal.props.modalRender('content')
  for (const key of ['z', 'v', 'Delete']) {
    const e = event(key)
    boundary.props.onKeyDown(e)
    assert.equal(e.stopped, true)
    assert.equal(e.prevented, false)
    assert.ok(h.store.getSnapshot())
  }
  for (const handler of ['onKeyUp', 'onCopy', 'onCut', 'onPaste', 'onWheel']) {
    const e = event('')
    boundary.props[handler](e)
    assert.equal(e.stopped, true)
    assert.equal(e.prevented, false)
  }
  const tab = event('Tab')
  boundary.props.onKeyDown(tab)
  assert.equal(tab.stopped, false) // Modal receives Tab to maintain its focus trap.
  assert.equal(tab.prevented, false)
  const composition = event('Escape', true)
  boundary.props.onKeyDown(composition)
  assert.ok(h.store.getSnapshot())
  const escape = event('Escape')
  boundary.props.onKeyDown(escape)
  assert.equal(escape.stopped, true)
  assert.equal(await pending, null)
  h.unmount()
})

test('dialog confirmation and cancellation buttons preserve boolean results and close can abort alternate actions', async () => {
  const h = hostHarness()
  for (const [action, expected] of [['cancel', false], ['submit', true], ['close', null]]) {
    const pending = h.store.request('confirm', 'Replace or append?', { dismissValue: null })
    const modal = h.render()
    const [cancel, submit] = modal.props.footer.props.children
    if (action === 'close') modal.props.onCancel()
    else (action === 'cancel' ? cancel : submit).props.onClick()
    assert.equal(await pending, expected)
  }
  h.unmount()
})

test('single-line prompt accepts edited text on Enter but not an IME composition Enter', async () => {
  const h = hostHarness()
  const pending = h.store.request('prompt', 'Canvas name', { defaultValue: 'Original' })
  let input = h.render().props.children[1].props.children[0]
  input.props.onChange({ target: { value: 'Updated name' } })
  input = h.render().props.children[1].props.children[0]
  input.props.onPressEnter(event('Enter', true))
  assert.ok(h.store.getSnapshot())
  input.props.onPressEnter(event('Enter'))
  assert.equal(await pending, 'Updated name')
  h.unmount()
})
