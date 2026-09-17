import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/canvas/TapnowStudio/components/CanvasCharacterLibrary.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('library.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadPortrait')
assert.ok(fn)
const code = ts.transpileModule(fn.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
function setup(response) {
  const calls = []
  const context = vm.createContext({
    URL, Error, window: { location: { origin: 'https://app.example' } },
    buildFileContentUrl: id => id ? `https://api.example/api/v1/studio/files/content?id=${id}` : undefined,
    resolveAssetUrl: value => value,
    getAuthToken: () => 'private-token',
    fetch: async (url, options) => { calls.push({ url, options }); return response },
  })
  vm.runInContext(code, context)
  return { load: context.loadPortrait, calls }
}
const image = new Blob(['image'], { type: 'image/png' })
const ok = { ok: true, blob: async () => image }

test('character file uses authenticated file endpoint and returns reusable image bytes', async () => {
  const { load, calls } = setup(ok)
  const signal = new AbortController().signal
  assert.equal(await load({ coverFileId: 27, coverUrl: 'https://external.example/cover.png' }, signal), image)
  assert.equal(calls[0].url, 'https://api.example/api/v1/studio/files/content?id=27')
  assert.equal(calls[0].options.headers.Authorization, 'private-token')
  assert.equal(calls[0].options.signal, signal)
})
test('external covers never receive authorization headers', async () => {
  const { load, calls } = setup(ok)
  await load({ coverUrl: 'https://external.example/cover.png' }, new AbortController().signal)
  assert.equal(calls[0].options.headers.Authorization, undefined)
})
test('missing covers stay unavailable and API errors are not inserted as images', async () => {
  const { load, calls } = setup({ ok: true, blob: async () => new Blob(['{}'], { type: 'application/json' }) })
  assert.equal(await load({}, new AbortController().signal), null)
  assert.equal(calls.length, 0)
  await assert.rejects(load({ coverFileId: 27 }, new AbortController().signal), /没有可用的图片/)
})
