import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { buildConnectedNodeIOEnvelopeCache } from '../src/pages/canvas/TapnowStudio/canvasNodeIOCache.js'

const nativeRequire = createRequire(import.meta.url)
const source = fs.readFileSync(new URL('../src/pages/canvas/TapnowStudio/components/GenerationNodeContent.jsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { fileName: 'GenerationNodeContent.jsx', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
const exports = {}
const shared = { t: value => value, LazyBase64Image: () => null, MJ_VERSIONS: [], getValueLabelWithNotes: value => value, isImageModelType: type => type === 'Image', normalizeImageConcurrency: value => Number(value) || 1, normalizeImageResolution: value => value || '2K', normalizeVideoResolution: value => value || '720p' }
vm.runInNewContext(compiled, { exports, setTimeout, require: name => name === '../freeCanvasShared' ? shared : name === './CanvasModelMenu' ? { default: () => null } : nativeRequire(name) })
const GenerationNodeContent = exports.default
const elements = tree => React.Children.toArray(tree).flatMap(element => React.isValidElement(element) ? [element, ...elements(element.props.children)] : [])

function fixture(type = 'gen-image') {
  const target = { id: 'target', type, settings: { prompt: '保留我的补充', videoPrompt: '保留我的视频补充', model: 'test', resolution: '2K', duration: '5s', imageConcurrency: 1 } }
  const source = { id: 'text', type: 'text-node', settings: { text: '雨夜街道' } }
  const state = { nodes: [source, target], connections: [] }
  const updates = [], generations = []
  const context = {
    history: [], nodeTimers: {}, theme: 'dark', connectedImages: [], characterLibrary: [], promptLibrary: [], promptLibraryCollapsed: true, promptLibraryForm: {},
    getApiConfigByKey: () => ({ id: 'test', provider: 'test', type: type === 'gen-image' ? 'Image' : 'Video' }),
    resolveModelKey: value => value, renderCustomParamInputs: () => null, getModelLabelWithProvider: () => 'Test model', getStatusColor: () => '', getResolutionsForModel: () => ['2K'], getVideoResolutionsForModel: () => ['720p'], getDefaultDurationsForModel: () => ['5s'], getRatiosForModel: () => ['16:9'],
    getConnectedImageForInput: () => null, updateNodeSettings: (id, patch) => updates.push({ id, patch }),
    startGeneration: (...args) => generations.push(args),
  }
  const render = () => {
    context.nodesMap = new Map(state.nodes.map(node => [node.id, node]))
    context.connections = state.connections
    const cache = buildConnectedNodeIOEnvelopeCache({ connections: state.connections, nodesMap: context.nodesMap, readMedia: () => [], readText: node => node.type === 'text-node' ? [node.settings.text].filter(Boolean) : [], version: 1, isValid: () => true })
    context.getConnectedTextNodes = id => (cache.get(id)?.get('default') || []).flatMap(item => item.text)
    const tree = GenerationNodeContent({ node: target, context })
    const all = elements(tree)
    return { tree, html: renderToStaticMarkup(tree), textarea: all.find(element => element.type === 'textarea'), generate: all.find(element => element.type === 'button' && element.props.title === '生成') }
  }
  return { state, target, source, updates, generations, render, connect() { state.connections = [{ id: 'edge', from: source.id, to: target.id }] } }
}

for (const type of ['gen-image', 'gen-video']) test(type + ' shows linked text immediately, follows edits, and clears on disconnect without writing settings', () => {
  const h = fixture(type)
  const localPrompt = type === 'gen-image' ? h.target.settings.prompt : h.target.settings.videoPrompt
  assert.doesNotMatch(h.render().html, /已连接文字/)
  h.connect()
  let rendered = h.render()
  assert.match(rendered.html, /已连接文字/)
  assert.match(rendered.html, /雨夜街道/)
  assert.equal(rendered.textarea.props.value, localPrompt)
  rendered.generate.props.onClick()
  assert.equal(h.generations.at(-1)[0], '雨夜街道 ' + localPrompt)
  h.state.nodes = [{ ...h.source, settings: { text: '改成清晨街道' } }, h.target]
  rendered = h.render()
  assert.match(rendered.html, /改成清晨街道/)
  assert.doesNotMatch(rendered.html, /雨夜街道/)
  rendered.generate.props.onClick()
  assert.equal(h.generations.at(-1)[0], '改成清晨街道 ' + localPrompt)
  h.state.connections = []
  rendered = h.render()
  assert.doesNotMatch(rendered.html, /已连接文字|改成清晨街道/)
  rendered.generate.props.onClick()
  assert.equal(h.generations.at(-1)[0], localPrompt)
  assert.equal(h.updates.length, 0, 'rendering and reconnecting must never copy inherited text into local settings')
})

test('multiple sources are visible and generation uses the same ordered text exactly once', () => {
  const h = fixture()
  const second = { id: 'second', type: 'text-node', settings: { text: '35mm镜头' } }
  h.state.nodes.push(second)
  h.connect()
  h.state.connections.push({ id: 'second-edge', from: second.id, to: h.target.id })
  const rendered = h.render()
  assert.match(rendered.html, /雨夜街道/)
  assert.match(rendered.html, /35mm镜头/)
  rendered.generate.props.onClick()
  assert.equal(h.generations[0][0], '雨夜街道 35mm镜头 保留我的补充')
  rendered.textarea.props.onChange({ target: { value: '新的补充' } })
  assert.deepEqual(h.updates.map(value => JSON.parse(JSON.stringify(value))), [{ id: 'target', patch: { prompt: '新的补充' } }])
  assert.equal(h.source.settings.text, '雨夜街道')
})
