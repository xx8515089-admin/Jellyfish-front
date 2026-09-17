import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import JSZip from 'jszip'

const source = ts.createSourceFile('App.jsx', readFileSync(new URL('../src/pages/canvas/TapnowStudio/App.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
const functions = new Map()
const visit = (node) => { if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) functions.set(node.name.text, node.initializer.getText(source)); ts.forEachChild(node, visit) }
visit(source)
function context(extra = {}) {
  const saved = []
  const scope = vm.createContext({ JSZip, Blob, console, Map, Set, history: [], nodes: [], characterLibrary: [], chatSessions: [], projectName: 'test',
    LocalImageManager: { isImageId: (value) => value.startsWith('img_') },
    getUrlExt: () => '.png', getDataUrlExt: () => '.png', sanitizeCacheId: () => 'same', getCacheIdFromUrl: () => 'same', isVideoUrl: () => false,
    getCSTFilenameTimestamp: () => 'stamp', saveAs: (blob, name) => saved.push({ blob, name }), ...extra })
  for (const name of ['isLikelyAssetUrl', 'collectAssetUrlsFromObject', 'replaceAssetUrlsInObject', 'saveProjectAsBundle']) vm.runInContext(`var ${name} = ${functions.get(name)};`, scope)
  return { scope, saved }
}
const project = () => ({ nodes: [{ id: 'a', content: 'blob:a' }, { id: 'b', content: 'blob:b' }], connections: [], history: [], characterLibrary: [], chatSessions: [] })

test('local ZIP exports the captured nodes and gives colliding media names distinct paths', async () => {
  const { scope, saved } = context({ fetchCacheSource: async (url) => ({ blob: Object.assign(Buffer.from(url), { size: url.length, type: 'image/png' }) }) })
  await scope.saveProjectAsBundle(project(), { historyItems: [] })
  const zip = await JSZip.loadAsync(await saved[0].blob.arrayBuffer())
  const decoded = JSON.parse(await zip.file('project.json').async('string'))
  assert.notEqual(decoded.nodes[0].content, decoded.nodes[1].content)
  assert.equal(await zip.file(decoded.nodes[0].content.replace('asset://', '')).async('string'), 'blob:a')
  assert.equal(await zip.file(decoded.nodes[1].content.replace('asset://', '')).async('string'), 'blob:b')
})

test('local ZIP fails visibly when a media file is unreadable instead of exporting a broken project', async () => {
  const { scope, saved } = context({ fetchCacheSource: async () => { throw new Error('expired blob') } })
  await assert.rejects(scope.saveProjectAsBundle(project(), { historyItems: [] }), /素材打包失败/)
  assert.equal(saved.length, 0)
})

test('loading an empty project replaces existing nodes, connections and history', () => {
  const values = {}
  const setters = Object.fromEntries(['ProjectName', 'View', 'Connections', 'ChatSessions', 'CharacterLibrary', 'ModelLibrary', 'Theme', 'Nodes', 'History'].map((name) => [`set${name}`, (value) => { values[name] = value }]))
  const scope = vm.createContext({ ...setters, normalizeViewState: (value) => value, normalizeModelLibraryEntry: (value) => value })
  const apply = vm.runInContext(`(${functions.get('applyLoadedProjectState')})`, scope)
  apply({ nodes: [], connections: [], history: [], characterLibrary: [], chatSessions: [], view: { x: 0, y: 0, zoom: 1 } })
  assert.equal(values.Nodes.length, 0)
  assert.equal(values.Connections.length, 0)
  assert.equal(values.History.length, 0)
})
