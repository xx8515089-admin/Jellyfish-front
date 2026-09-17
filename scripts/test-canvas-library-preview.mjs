import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const ast = ts.createSourceFile('publish.jsx', readFileSync(new URL('../src/pages/canvas/TapnowStudio/useCanvasLibraryPublish.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
let effect
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effect = node.arguments[0].getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
const flush = () => new Promise(resolve => setImmediate(resolve))
function load(assetId, output, cache = new Map(), open = true) {
  const state = {}
  const cleanup = vm.runInNewContext('(' + effect + ')', {
    open, selected: assetId == null ? null : { assetId }, session: { output }, previewCache: cache,
    setPreview: value => { state.preview = value }, setPreviewError: value => { state.error = value }, setPreviewLoading: value => { state.loading = value },
  })()
  return { state, cleanup, cache }
}
test('selecting an image automatically loads it and reuses the cached asset on another selection', async () => {
  let calls = 0
  const output = async ({ assetId }) => { calls++; return `blob:${assetId}` }
  const first = load(1, output)
  assert.equal(first.state.loading, true)
  await flush()
  assert.equal(first.state.preview, 'blob:1')
  assert.equal(first.state.loading, false)
  first.cleanup()
  const again = load(1, output, first.cache)
  await flush()
  assert.equal(again.state.preview, 'blob:1')
  assert.equal(calls, 1)
})
test('rapid image changes cannot be overwritten by a late response for the previous selection', async () => {
  let resolveFirst
  const first = load(1, () => new Promise(resolve => { resolveFirst = resolve }))
  await flush()
  first.cleanup()
  const next = load(2, async () => 'blob:2', first.cache)
  await flush()
  resolveFirst('blob:1')
  await flush()
  assert.equal(next.state.preview, 'blob:2')
  assert.equal(first.state.preview, '')
})
test('failed image loading clears cache and can recover on retry without changing form data', async () => {
  const first = load(1, async () => { throw Error('图片暂不可用') })
  await flush()
  assert.equal(first.state.error, '图片暂不可用')
  assert.equal(first.cache.has(1), false)
  assert.equal(first.state.loading, false)
  const retry = load(1, async () => 'blob:retry', first.cache)
  await flush()
  assert.equal(retry.state.preview, 'blob:retry')
})
test('closed dialog or empty selection does not request media', () => {
  for (const [id, open] of [[null, true], [1, false]]) {
    const result = load(id, () => assert.fail('unexpected media request'), new Map(), open)
    assert.equal(result.state.loading, false)
    assert.equal(result.state.preview, '')
  }
})
