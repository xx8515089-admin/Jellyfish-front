import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/aiStudio/project/AssetGenerationWorkspace.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const functions = new Map()
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['applyLookInEpisode', 'handleLocalLookImport'].includes(node.name.getText(ast))) {
    functions.set(node.name.getText(ast), node.initializer.getText(ast))
  }
  ts.forEachChild(node, visit)
}
visit(ast)
const deferred = () => {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { resolve, promise }
}
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve() }

function harness(name) {
  const post = deferred()
  const refresh = deferred()
  const mounted = { current: true }
  const calls = { refresh: 0, active: [], success: 0 }
  const exports = {}
  vm.runInNewContext(ts.transpileModule(`exports.action = ${functions.get(name)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports, assetId: 12, episodeId: 9, activeLookId: 'main', looks: [{ id: 'main' }],
    imageOptionsMountedRef: mounted, localLookUploadPending: false, lookEpisodeSelectionPending: false,
    setLocalLookUploadPending() {}, setLookEpisodeSelectionPending() {},
    setLooks() {}, setActiveLookId() {}, setLookEpisodeConfirmId() {},
    rememberSavedLookNames() {}, applyLookDraftToEditor() {},
    captureLookEditorOptions: (looks) => looks,
    onActiveLookChange: (id) => { calls.active.push(id) },
    createLookDraftFromRemote: (item) => ({ ...item, id: `look-${item.id}`, backendId: item.id }),
    savedLookNamesRef: { current: new Map() },
    l: (_zh, en) => en,
    message: { error() {}, success() { calls.success += 1 } },
    getApiErrorMessage: (error) => error.message,
    StudioAssetGenerationApi: {
      requestLookEpisodeSelection: () => ({ promise: post.promise }),
      requestLookUpload: () => ({ promise: post.promise }),
      requestLooks: () => { calls.refresh += 1; return { promise: refresh.promise } },
    },
  })
  return { post, refresh, mounted, calls, action: exports.action }
}

for (const name of ['applyLookInEpisode', 'handleLocalLookImport']) {
  const argument = name === 'applyLookInEpisode'
    ? { id: 'look-20', backendId: 20, status: 0 }
    : { target: { files: [{ type: 'image/png' }], value: 'file' } }

  test(`${name}: closing before the mutation returns prevents follow-up GET and parent callbacks`, async () => {
    const env = harness(name)
    const pending = env.action(argument)
    env.mounted.current = false
    env.post.resolve(undefined)
    await pending
    assert.equal(env.calls.refresh, 0)
    assert.deepEqual(env.calls.active, [])
    assert.equal(env.calls.success, 0)
  })

  test(`${name}: a late refresh cannot change the newly opened asset's active look`, async () => {
    const env = harness(name)
    const pending = env.action(argument)
    env.post.resolve(undefined)
    await flush()
    assert.equal(env.calls.refresh, 1)
    env.mounted.current = false
    env.refresh.resolve([{ id: 20 }])
    await pending
    assert.deepEqual(env.calls.active, [])
    assert.equal(env.calls.success, 0)
  })
}

test('local look upload returning the complete look cannot update a closed editor', async () => {
  const env = harness('handleLocalLookImport')
  const pending = env.action({ target: { files: [{ type: 'image/png' }], value: 'file' } })
  env.mounted.current = false
  env.post.resolve({ id: 20 })
  await pending
  assert.equal(env.calls.refresh, 0)
  assert.deepEqual(env.calls.active, [])
})
