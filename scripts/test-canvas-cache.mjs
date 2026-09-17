import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(path, imports, globals) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, { exports, ...globals, require: name => { assert.ok(name in imports, name); return imports[name] } })
  return exports
}
function harness(api = {}) {
  const values = new Map(), deletedDatabases = []
  const localStorage = { get length() { return values.size }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const window = { localStorage, indexedDB: { deleteDatabase: name => { deletedDatabases.push(name); const request = {}; queueMicrotask(() => request.onsuccess()); return request } } }
  const cache = load('../src/pages/canvas/canvasCache.ts', {'../../auth':{getStoredAuthUser:()=>({id:42})}}, {window})
  const workspaces = load('../src/pages/canvas/canvasWorkspaces.ts', {'./canvasCache':cache,'../../services/studioCanvases':{StudioCanvases:api,canvasRequestId:()=> 'create-test'}}, {window})
  return { cache, workspaces, values, deletedDatabases }
}
const prefix = scope => `jellyfish_canvas:${encodeURIComponent(scope)}:`
const record = id => ({canvasId:id,name:'new',revisionNo:1,currentRevisionNo:1,project:{nodes:[]}})

test('delete clears only target canvas caches, including drafts, request receipts and both databases', async () => {
  const {cache,values,deletedDatabases} = harness()
  const a = prefix(cache.canvasEditorScope('7'))
  for (const key of [a+'tapnow_autosave',a+'tapnow_asset_bundle_meta','jellyfish_canvas:7:tapnow_nodes','canvas-cloud:42:7:draft','canvas-cloud:42:7:save','canvas-cloud:42:7:upload:x']) values.set(key,'old')
  for (const key of ['token',prefix(cache.canvasEditorScope('8'))+'tapnow_autosave','canvas-cloud:43:7:draft','canvas-cloud:42:70:draft']) values.set(key,'keep')
  await cache.clearCanvasCache('7')
  assert.equal(values.size,4)
  assert.equal(values.get('token'),'keep')
  assert.equal(deletedDatabases.length,4)
  assert.ok(deletedDatabases.every(name=>name.startsWith(a)||name.startsWith('jellyfish_canvas:7:')))
})

test('failed remote delete never discards recoverable local edits', async () => {
  const {workspaces,values,deletedDatabases} = harness({capabilities:async()=>({storageReady:true}),list:async()=>({items:[record(7)],total:1}),delete:async()=>{throw new Error('offline')}})
  await workspaces.listCanvasWorkspaces()
  values.set('canvas-cloud:42:7:draft','unsaved')
  await assert.rejects(workspaces.deleteCanvasWorkspace('7'),/offline/)
  assert.equal(values.get('canvas-cloud:42:7:draft'),'unsaved')
  assert.equal(deletedDatabases.length,0)
})

test('successful remote delete writes a tombstone and clears pending cloud replay', async () => {
  const {workspaces,values} = harness({capabilities:async()=>({storageReady:true}),list:async()=>({items:[record(7)],total:1}),delete:async()=>null})
  await workspaces.listCanvasWorkspaces()
  values.set('canvas-cloud:42:7:save','pending')
  await workspaces.deleteCanvasWorkspace('7')
  assert.ok(values.get('canvas-deleted:42:7'))
  assert.equal(values.has('canvas-cloud:42:7:save'),false)
})

test('creating a pristine canvas clears obsolete local content but leaves other canvases intact', async () => {
  const {workspaces,values} = harness({create:async()=>record(7)})
  values.set('canvas-cloud:42:7:draft','obsolete')
  values.set('jellyfish_canvas:7:tapnow_autosave','obsolete')
  values.set('canvas-cloud:42:8:draft','keep')
  await workspaces.createCanvasWorkspace('new')
  assert.deepEqual([...values.keys()],['canvas-cloud:42:8:draft'])
})

test('replayed create for a newer revision does not delete its current draft', async () => {
  const {workspaces,values} = harness({create:async()=>({...record(7),currentRevisionNo:3})})
  values.set('canvas-cloud:42:7:draft','current edits')
  await workspaces.createCanvasWorkspace('new')
  assert.equal(values.get('canvas-cloud:42:7:draft'),'current edits')
})

test('asset bundle metadata follows workspace switches instead of reusing a module cache', () => {
  const source = ts.createSourceFile('shared.jsx',readFileSync(new URL('../src/pages/canvas/TapnowStudio/freeCanvasShared.jsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX)
  let expression
  const visit = node => { if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='readAssetBundleMeta') expression=node.initializer.getText(source); ts.forEachChild(node,visit) }
  visit(source)
  let current = '{"idToOriginal":{"old":"blob:old"}}'
  const context = vm.createContext({localStorage:{getItem:()=>current},ASSET_BUNDLE_META_KEY:'bundle',assetBundleMetaCache:null})
  const read = vm.runInContext(`(${expression})`,context)
  assert.equal(read().idToOriginal.old,'blob:old')
  current = null
  assert.equal(read(),null)
})
