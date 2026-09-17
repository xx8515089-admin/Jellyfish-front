import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import { createCanvasDialogStore } from '../src/pages/canvas/TapnowStudio/canvasDialogs.js'

function mounted() {
  const store = createCanvasDialogStore()
  return { store, unmount: store.mount() }
}

test('confirm stays pending until the user chooses and queued dialogs appear in order', async () => {
  const { store, unmount } = mounted()
  let answered = false
  const first = store.request('confirm', 'Delete?').then(value => { answered = true; return value })
  const second = store.request('prompt', 'Name', { defaultValue: 'Canvas' })
  const firstId = store.getSnapshot().id
  await Promise.resolve()
  assert.equal(answered, false)
  assert.equal(store.getSnapshot().content, 'Delete?')
  store.complete(firstId, true)
  assert.equal(await first, true)
  assert.equal(store.getSnapshot().content, 'Name')
  store.complete(firstId, false) // A double click must not dismiss the next question.
  assert.equal(store.getSnapshot().content, 'Name')
  store.complete(store.getSnapshot().id, 'Renamed')
  assert.equal(await second, 'Renamed')
  assert.equal(store.getSnapshot(), null)
  unmount()
})

test('repeated alerts share one dialog, while distinct warnings and confirmations are retained', async () => {
  const { store, unmount } = mounted()
  const warning = store.request('alert', 'Failed')
  assert.equal(store.request('alert', 'Failed'), warning)
  const differentTitle = store.request('alert', 'Failed', { title: 'Import' })
  const confirm1 = store.request('confirm', 'Proceed?')
  const confirm2 = store.request('confirm', 'Proceed?')
  assert.notEqual(confirm1, confirm2)
  store.complete(store.getSnapshot().id)
  assert.equal(store.getSnapshot().options.title, 'Import')
  store.dismissAll()
  assert.deepEqual(await Promise.all([warning, differentTitle, confirm1, confirm2]), [undefined, undefined, false, false])
  unmount()
})

test('closing a dialog cancels; alternate-action confirmation can distinguish close from its second button', async () => {
  const { store, unmount } = mounted()
  for (const [type, options, expected] of [
    ['confirm', {}, false], ['prompt', {}, null], ['alert', {}, undefined],
    ['confirm', { dismissValue: null }, null],
  ]) {
    const pending = store.request(type, 'Message', options)
    store.dismiss(store.getSnapshot().id)
    assert.equal(await pending, expected)
  }
  const alternate = store.request('confirm', 'Replace or append?', { dismissValue: null })
  store.complete(store.getSnapshot().id, false)
  assert.equal(await alternate, false)
  unmount()
})

test('leaving the canvas dismisses pending work and discards late dialogs', async () => {
  const { store, unmount } = mounted()
  const pending = [store.request('confirm', 'Delete?'), store.request('prompt', 'Name'), store.request('confirm', 'Replace?', { dismissValue: null })]
  unmount()
  assert.deepEqual(await Promise.all(pending), [false, null, null])
  assert.equal(await store.request('confirm', 'Late completion'), false)
  assert.equal(store.getSnapshot(), null)
  const nextUnmount = store.mount()
  assert.equal(store.getSnapshot(), null)
  const next = store.request('alert', 'New canvas')
  assert.equal(store.getSnapshot().content, 'New canvas')
  nextUnmount()
  await next
})

test('cleanup of one mounted host leaves another active host intact', async () => {
  const store = createCanvasDialogStore()
  const firstUnmount = store.mount(), secondUnmount = store.mount()
  const pending = store.request('confirm', 'Continue?')
  firstUnmount()
  assert.equal(store.getSnapshot().content, 'Continue?')
  store.complete(store.getSnapshot().id, true)
  assert.equal(await pending, true)
  secondUnmount()
})

test('dialog snapshots are stable and subscribers can unsubscribe', async () => {
  const { store, unmount } = mounted()
  let notifications = 0
  const unsubscribe = store.subscribe(() => { notifications++ })
  const pending = store.request('alert', 'Message')
  assert.equal(notifications, 1)
  assert.equal(store.getSnapshot(), store.getSnapshot())
  unsubscribe()
  store.complete(store.getSnapshot().id)
  assert.equal(notifications, 1)
  await pending
  unmount()
})

test('canvas source contains no calls to browser alert, confirm or prompt', () => {
  const root = fileURLToPath(new URL('../src/pages/canvas', import.meta.url))
  const files = []
  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, item.name)
      if (item.isDirectory()) walk(filename)
      else if (/\.[jt]sx?$/.test(filename) && !filename.endsWith('.d.ts')) files.push(filename)
    }
  }
  walk(root)
  const program = ts.createProgram(files, { allowJs: true, noResolve: true, noLib: true, jsx: ts.JsxEmit.React })
  const checker = program.getTypeChecker()
  const violations = []
  for (const filename of files) {
    const source = program.getSourceFile(filename)
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const callee = node.expression
        const nativeName = ts.isIdentifier(callee) && /^(alert|confirm|prompt)$/.test(callee.text) && !checker.getSymbolAtLocation(callee)
        const nativeMember = ts.isPropertyAccessExpression(callee) && /^(alert|confirm|prompt)$/.test(callee.name.text) && /^(window|globalThis|self)$/.test(callee.expression.getText(source))
        const nativeElement = ts.isElementAccessExpression(callee) && /^(window|globalThis|self)$/.test(callee.expression.getText(source)) && ts.isStringLiteral(callee.argumentExpression) && /^(alert|confirm|prompt)$/.test(callee.argumentExpression.text)
        if (nativeName || nativeMember || nativeElement) violations.push(`${path.relative(root, filename)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual(violations, [])
})
