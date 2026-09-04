import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/aiStudio/project/ProjectAssetsStep.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('ProjectAssetsStep.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let openHandler
let closeHandler
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'openPersonalImport') {
    openHandler = node.initializer
  }
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === 'Modal') {
    const props = node.attributes.properties.filter(ts.isJsxAttribute)
    const rootClass = props.find((prop) => prop.name.getText(tree) === 'rootClassName')
    if (rootClass?.initializer && ts.isStringLiteral(rootClass.initializer)
      && rootClass.initializer.text === 'project-assets-space-import') {
      closeHandler = props.find((prop) => prop.name.getText(tree) === 'onCancel')?.initializer?.expression
    }
  }
  ts.forEachChild(node, visit)
}
visit(tree)
assert.ok(openHandler, 'Missing personal import open handler')
assert.ok(closeHandler, 'Missing personal import modal close handler')
const compiled = ts.transpileModule(`export const open = ${openHandler.getText(tree)}\nexport const close = ${closeHandler.getText(tree)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText

function harness() {
  const state = { open: false, assets: [], loading: false }
  const writes = []
  const errors = []
  const warnings = []
  const requests = []
  const mounted = { current: true }
  const latestSource = { current: 'script-A' }
  const revision = { current: 0 }
  const patch = (key, value) => { state[key] = value; writes.push(key) }
  const shared = {
    componentMountedRef: mounted,
    latestSourceSignatureRef: latestSource,
    personalAssetsRequestRevisionRef: revision,
    assetImageOperationLocked: () => false,
    scopedAssets: [],
    EMPTY_PERSONAL_FILTERS: {},
    setPersonalImportTargetId: (value) => patch('targetId', value),
    setPersonalImportTargetSnapshot: (value) => patch('targetSnapshot', value),
    setPersonalImportOpen: (value) => patch('open', value),
    setPersonalAssetId: (value) => patch('selectedId', value),
    setPersonalAssetFilters: (value) => patch('filters', value),
    setPersonalAssets: (value) => patch('assets', value),
    setPersonalAssetsLoading: (value) => patch('loading', value),
    l: (_zh, en) => en,
    message: { error: (value) => errors.push(value), warning: (value) => warnings.push(value) },
    StudioEntitiesApi: {
      list: (entityType, params) => {
        let resolve
        let reject
        const promise = new Promise((yes, no) => { resolve = yes; reject = no })
        requests.push({ entityType, params: { ...params }, resolve, reject })
        return promise
      },
    },
  }
  return {
    state, writes, errors, warnings, requests, mounted, latestSource,
    // Each render captures its own kind/source, like separate React render closures;
    // all renders retain the same refs and state setters.
    render: (kind, sourceSignature = latestSource.current) => {
      const exports = {}
      vm.runInNewContext(compiled, { exports, ...shared, kind, sourceSignature })
      return exports
    },
  }
}
const result = (id, name) => ({ data: { items: [{ id, name, thumbnail: `/image-${id}.png` }] } })

test('a late character response cannot overwrite the scene list from a newer render', async () => {
  const env = harness()
  const character = env.render('role')
  const scene = env.render('scene')
  const oldLoad = character.open()
  character.close()
  const newLoad = scene.open()
  assert.deepEqual(env.requests.map((request) => request.entityType), ['character', 'scene'])
  env.requests[1].resolve(result(2, 'Street'))
  await newLoad
  assert.equal(env.state.assets[0].name, 'Street')
  const currentAssets = env.state.assets
  const writesBeforeOldResponse = env.writes.length
  env.requests[0].resolve(result(1, 'Character A'))
  await oldLoad
  assert.equal(env.state.assets, currentAssets)
  assert.equal(env.writes.length, writesBeforeOldResponse)
  assert.equal(env.state.loading, false)
  assert.equal(env.errors.length, 0)
})

test('an older failed request cannot clear the newer loading state or show an error', async () => {
  const env = harness()
  const oldLoad = env.render('role').open()
  const newLoad = env.render('scene').open()
  env.requests[0].reject(new Error('Old request failed'))
  await oldLoad
  assert.equal(env.state.loading, true)
  assert.equal(env.errors.length, 0)
  env.requests[1].resolve(result(2, 'Street'))
  await newLoad
  assert.equal(env.state.assets[0].name, 'Street')
  assert.equal(env.state.loading, false)
})

test('closing the real modal invalidates late successful and failed responses', async () => {
  for (const succeeds of [true, false]) {
    const env = harness()
    const controller = env.render('role')
    const pending = controller.open()
    controller.close()
    assert.equal(env.state.open, false)
    const writesAfterClose = env.writes.length
    if (succeeds) env.requests[0].resolve(result(1, 'Character A'))
    else env.requests[0].reject(new Error('Closed request failed'))
    await pending
    assert.equal(env.writes.length, writesAfterClose)
    assert.equal(env.state.assets.length, 0)
    assert.equal(env.errors.length, 0)
  }
})

test('unmounting or switching the source ignores late request results', async () => {
  for (const invalidation of ['unmount', 'source']) {
    const env = harness()
    const pending = env.render('role').open()
    if (invalidation === 'unmount') env.mounted.current = false
    else env.latestSource.current = 'script-B'
    const writesBeforeResponse = env.writes.length
    env.requests[0].resolve(result(1, 'Character A'))
    await pending
    assert.equal(env.writes.length, writesBeforeResponse)
    assert.equal(env.state.assets.length, 0)
    assert.equal(env.errors.length, 0)
  }
})

test('the current request still loads asset data and reports actual errors', async () => {
  const success = harness()
  const load = success.render('prop').open()
  success.requests[0].resolve(result(3, 'Helmet'))
  await load
  assert.equal(success.state.assets[0].id, '3')
  assert.equal(success.state.assets[0].name, 'Helmet')
  assert.equal(success.state.assets[0].imageUrl, '/image-3.png')
  assert.equal(success.state.loading, false)
  const failure = harness()
  const failedLoad = failure.render('scene').open()
  failure.requests[0].reject(new Error('Network offline'))
  await failedLoad
  assert.equal(failure.errors.length, 1)
  assert.equal(failure.state.loading, false)
})
