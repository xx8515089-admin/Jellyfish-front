import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function clickHandler(file, marker, globals) {
  const source = readFileSync(new URL(`../src/pages/canvas/TapnowStudio/${file}`, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
  const matches = []
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === 'onClick') {
      const expression = node.initializer?.expression
      if (expression && expression.getText(ast).includes(marker)) matches.push(expression)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.equal(matches.length, 1, `unique handler for ${marker}`)
  return vm.runInNewContext(`(${matches[0].getText(ast)})`, { Set, Map, console, t: value => value, ...globals })
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

for (const accepted of [false, true]) {
  test(`history deletion ${accepted ? 'keeps newly selected and added items' : 'does nothing on cancel'}`, async () => {
    const confirmation = deferred()
    let history = [{ id: 'old' }, { id: 'keep' }]
    let selection = new Set(['old'])
    const saved = []
    const onClick = clickHandler('views/TapnowAppView.jsx', '确定要删除选中的', {
      batchSelectedIds: selection,
      canvasConfirm: () => confirmation.promise,
      setHistory: update => { history = update(history) },
      setBatchSelectedIds: update => { selection = update(selection) },
      localStorage: { setItem: (...args) => saved.push(args) },
    })
    const pending = onClick()
    assert.deepEqual(history.map(item => item.id), ['old', 'keep'])
    assert.equal(saved.length, 0)
    history = [...history, { id: 'new' }]
    selection = new Set(['old', 'new'])
    confirmation.resolve(accepted)
    await pending
    assert.deepEqual(history.map(item => item.id), accepted ? ['keep', 'new'] : ['old', 'keep', 'new'])
    assert.deepEqual([...selection], accepted ? ['new'] : ['old', 'new'])
    assert.equal(saved.length, accepted ? 1 : 0)
  })
}

for (const accepted of [false, true]) {
  test(`clearing storyboard shots ${accepted ? 'preserves shots added during confirmation' : 'is cancelled without changing shots'}`, async () => {
    const confirmation = deferred()
    const original = { id: 'board', settings: { shots: [{ id: 'old' }], title: 'Keep title' } }
    let nodes = [original]
    let stopped = false
    const onClick = clickHandler('components/StoryboardNodeContent.jsx', '确定要清空所有镜头吗', {
      node: original,
      canvasConfirm: () => confirmation.promise,
      setNodes: update => { nodes = update(nodes) },
    })
    const pending = onClick({ stopPropagation() { stopped = true } })
    assert.equal(stopped, true)
    assert.equal(nodes[0], original)
    nodes = [{ ...original, settings: { ...original.settings, shots: [...original.settings.shots, { id: 'new' }] } }]
    confirmation.resolve(accepted)
    await pending
    assert.deepEqual(nodes[0].settings.shots.map(shot => shot.id), accepted ? ['new'] : ['old', 'new'])
    assert.equal(nodes[0].settings.title, 'Keep title')
  })
}

for (const accepted of [false, true]) {
  test(`clearing keyframes ${accepted ? 'preserves new extraction results and selections' : 'does nothing on cancel'}`, async () => {
    const confirmation = deferred()
    const oldFrame = { url: 'old.png', time: 0 }, newFrame = { url: 'new.png', time: 1 }
    const oldSelection = { url: 'old.png', time: 0 }, newSelection = { url: 'new.png', time: 1 }
    const original = { id: 'video', frames: [oldFrame], selectedKeyframes: [oldSelection] }
    let nodes = [original]
    const onClick = clickHandler('views/renderCanvasNode.jsx', '确定要清空所有抽帧缩略图吗', {
      node: original,
      canvasConfirm: () => confirmation.promise,
      setNodes: update => { nodes = update(nodes) },
    })
    const pending = onClick()
    assert.equal(nodes[0], original)
    nodes = [{ ...original, frames: [oldFrame, newFrame], selectedKeyframes: [oldSelection, newSelection] }]
    confirmation.resolve(accepted)
    await pending
    assert.deepEqual(nodes[0].frames, accepted ? [newFrame] : [oldFrame, newFrame])
    assert.deepEqual(nodes[0].selectedKeyframes, accepted ? [newSelection] : [oldSelection, newSelection])
  })
}

function globalHandler(file, name, index, globals) {
  const source = readFileSync(new URL(`../src/pages/canvas/TapnowStudio/${file}`, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
  const matches = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      let fn = node.initializer
      if (ts.isCallExpression(fn)) fn = fn.arguments[0]
      if (ts.isArrowFunction(fn)) matches.push(fn)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(matches[index], `${file} contains ${name} handler ${index}`)
  return vm.runInNewContext(`(${matches[index].getText(ast)})`, globals)
}

for (const open of [true, false]) {
  test(`global undo and Delete ${open ? 'leave the canvas unchanged while a dialog is open' : 'still work after the dialog closes'}`, () => {
    const actions = []
    const globals = {
      canvasDialogStore: { getSnapshot: () => open ? { id: 1 } : null },
      undo: () => actions.push('undo'), redo: () => actions.push('redo'),
      isCanvasInteractiveTarget: () => false,
      selectedNodeIdRef: { current: 'selected-node' }, selectedNodeIdsRef: { current: new Set() },
      deleteNode: id => actions.push(`delete:${id}`), setSelectedNodeId: id => actions.push(`select:${id}`),
    }
    const event = key => ({ key, ctrlKey: true, target: { tagName: 'DIV' }, preventDefault() { actions.push(`prevent:${key}`) }, stopPropagation() {} })
    globalHandler('App.jsx', 'handleKeyDown', 0, globals)(event('z'))
    globalHandler('App.jsx', 'handleDeleteKey', 0, globals)(event('Delete'))
    assert.deepEqual(actions, open ? [] : ['prevent:z', 'undo', 'prevent:Delete', 'delete:selected-node', 'select:null'])
  })
}

test('dialogs isolate global clipboard, navigation, wheel and movement without cancelling input defaults', async () => {
  const event = {
    key: 'Escape', ctrlKey: true, target: { tagName: 'DIV' },
    preventDefault() { assert.fail('dialog defaults should remain available') },
    stopPropagation() { assert.fail('canvas handler should not process a dialog event') },
  }
  const globals = { canvasDialogStore: { getSnapshot: () => ({ id: 1 }) } }
  for (const [name, index] of [
    ['handleCopy', 0], ['handlePaste', 0], ['handleKeyDown', 1], ['handleHistoryKeyDown', 0],
    ['handleEsc', 0], ['preventCtrlZoom', 0], ['handleMouseDown', 0], ['handleMouseMove', 0], ['handleChatResizeMove', 0],
  ]) {
    await globalHandler('App.jsx', name, index, globals)(event)
  }
})

test('dialogs isolate background mask undo and lightbox navigation', () => {
  const event = { key: 'z', ctrlKey: true, preventDefault() { assert.fail('mask must not consume dialog input') } }
  const globals = { canvasDialogStore: { getSnapshot: () => ({ id: 1 }) }, handleUndo() { assert.fail('mask must not undo') } }
  globalHandler('freeCanvasShared.jsx', 'handleKeyDown', 0, globals)(event)
  globalHandler('freeCanvasShared.jsx', 'handleKeyDown', 1, globals)({ key: 'Escape' })
  globalHandler('freeCanvasShared.jsx', 'handleKeyUp', 0, globals)({ key: 'ArrowRight' })
})
