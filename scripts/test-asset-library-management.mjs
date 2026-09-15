import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/aiStudio/assets/tabs/AssetLibraryTab.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function harness() {
  const states = []
  const requests = []
  let effect
  const react = {
    useState(initial) {
      const slot = states.length
      states.push(initial)
      return [initial, (value) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value }]
    },
    useEffect(callback) { effect = callback },
  }
  const exports = {}
  const require = (name) => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
    if (name.endsWith('studioAssetLibrary')) return {
      StudioAssetLibraryApi: {
        listItems(query) {
          return new Promise((resolve, reject) => requests.push({ query, resolve, reject }))
        },
      },
    }
    if (name.endsWith('useBilingualText')) return { useBilingualText: () => (zh) => zh }
    if (name === 'antd') return { Input: { Search: () => null } }
    return {}
  }
  new Function('require', 'exports', compiled)(require, exports)
  exports.AssetLibraryTab({ assetType: 2 })
  return { states, requests, runEffect: () => effect() }
}

const flush = async () => { await new Promise((resolve) => setImmediate(resolve)) }

test('asset management queries the library with type, enabled status and 20-item pagination', async () => {
  const h = harness()
  h.runEffect()
  assert.deepEqual(h.requests[0].query, { assetType: 2, keyword: '', status: 1, page: 1, pageSize: 20 })
  const item = { id: 1, assetType: 2, name: '场景', coverUrl: 'https://example.com/cover.png' }
  h.requests[0].resolve({ page: 1, pageSize: 20, total: 41, items: [item] })
  await flush()
  assert.deepEqual(h.states[6], [item])
  assert.equal(h.states[7], 41)
  assert.equal(h.states[8], false)
})

test('a stale list response cannot overwrite a newer result or its loading state', async () => {
  const h = harness()
  const cleanup = h.runEffect()
  cleanup()
  h.runEffect()
  h.requests[0].resolve({ total: 100, items: [{ id: 99 }] })
  await flush()
  assert.deepEqual(h.states[6], [])
  assert.equal(h.states[8], true)
  h.requests[1].resolve({ total: 0, items: [] })
  await flush()
  assert.equal(h.states[7], 0)
  assert.equal(h.states[8], false)
})

test('request failure displays an error and retry clears it', async () => {
  const h = harness()
  const cleanup = h.runEffect()
  h.requests[0].reject(new Error('接口异常'))
  await flush()
  assert.equal(h.states[9], '接口异常')
  assert.equal(h.states[8], false)
  cleanup()
  h.runEffect()
  assert.equal(h.states[9], undefined)
  assert.equal(h.states[8], true)
  h.requests[1].resolve({ total: 0, items: [] })
  await flush()
  assert.deepEqual(h.states[6], [])
  assert.equal(h.states[8], false)
})