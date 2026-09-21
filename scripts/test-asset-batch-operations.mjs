import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

/** 执行真实组件处理函数，服务以内存替身提供；不启动服务、不提交真实生成任务。 */
function harness(filename, exportName, services, props = {}) {
  const source = readFileSync(new URL(`../src/pages/aiStudio/assets/components/${filename}.tsx`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const slots = [], effects = [], notifications = [], confirmations = []
  let cursor = 0, dirty = true, tree
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; dirty = true }]
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial } },
    useMemo(fn) { return fn() },
    useEffect(fn, deps) {
      const index = cursor++
      if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) { slots[index] = deps; effects.push(fn) }
    },
  }
  const antd = Object.fromEntries(['Alert', 'Button', 'Checkbox', 'Drawer', 'Space', 'Table', 'Tag', 'Statistic', 'Popover', 'Progress', 'Select'].map((name) => [name, name]))
  antd.Input = { Search: 'Search', TextArea: 'TextArea' }
  antd.Upload = { Dragger: 'Dragger', LIST_IGNORE: 'ignore' }
  antd.Typography = { Text: 'Text', Paragraph: 'Paragraph' }
  antd.Modal = Object.assign(function Modal() {}, { confirm: (options) => confirmations.push(options) })
  antd.message = Object.fromEntries(['success', 'warning', 'error'].map((level) => [level, (text) => notifications.push({ level, text })]))
  const exports = {}
  const require = (name) => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (name === 'antd') return antd
    if (name.endsWith('useBilingualText')) return { bilingualText: (zh) => zh, useBilingualText: () => (zh) => zh }
    if (name.endsWith('useProjectStyleOptions')) return { useProjectStyleOptions: () => ({ defaultVisualStyle: '现实', getDefaultStyle: () => '真人都市' }) }
    if (name.endsWith('generatedResponse')) return { unwrapApiData: (response, fallback) => {
      if ((response.code ?? 200) >= 400 || response.data == null) throw new Error(response.message || fallback)
      return response.data
    } }
    if (name.endsWith('assetImportSession')) {
      const source = readFileSync(new URL('../src/pages/aiStudio/assets/components/assetImportSession.ts', import.meta.url), 'utf8')
      const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
      const sessionExports = {}
      new Function('require', 'exports', compiled)(require, sessionExports)
      return sessionExports
    }
    return services[name.split('/').pop()] ?? {}
  }
  new Function('require', 'exports', compiled)(require, exports)
  /** 模拟 React 提交阶段，在异步服务结果之后重新渲染。 */
  function render() {
    cursor = 0; dirty = false
    tree = exports[exportName]({ open: true, defaultType: 'actor', onCancel() {}, onImported() {}, ...props })
    for (const effect of effects.splice(0)) effect()
  }
  /** 遍历 JSX 的子元素、弹窗 footer 与 drawer extra。 */
  function nodes(value = tree, found = []) {
    if (Array.isArray(value)) value.forEach((item) => nodes(item, found))
    else if (value && typeof value === 'object' && value.props) {
      found.push(value)
      for (const key of ['children', 'footer', 'extra']) if (value.props[key] !== undefined) nodes(value.props[key], found)
    }
    return found
  }
  /** 提取按钮中的可见文案用于定位操作。 */
  function text(value) {
    if (Array.isArray(value)) return value.map(text).join('')
    if (value && typeof value === 'object') return text(value.props?.children)
    return value == null ? '' : String(value)
  }
  render()
  return {
    notifications, confirmations, nodes,
    node: (type) => nodes().find((item) => item.type === type),
    button: (label) => nodes().find((item) => item.type === 'Button' && text(item.props.children).startsWith(label)),
    async flush() { for (let i = 0; i < 20; i++) { await new Promise((resolve) => setTimeout(resolve, 1)); if (dirty) render() } },
  }
}
const ok = data => ({ code: 200, message: 'success', data })
const row = { itemId: 'item-1', rowNumber: 2, assetType: 1, name: '演员', status: 'valid', action: 'create', errors: [] }

/** A new-protocol server fixture: legacy modules have no implementation and cannot be called. */
function server(options = {}) {
  const calls = { create: [], upload: [], preview: [], commit: [], retry: [], read: 0 }
  let committed = false, retried = false, input
  const getRows = () => (committed ? options.results ?? [{ ...row, status: 'succeeded', action: 'created' }] : options.previewRows ?? [row]).map(item => ({ ...item, ...(input?.source === 'images' ? { clientItemId: input.items[0].clientItemId } : {}), ...(retried ? { status: 'succeeded', action: 'created', errors: [] } : {}) }))
  const api = {
    createImportBatch: async request => { calls.create.push(request); input = request.requestBody; if (options.unavailable) throw Object.assign(Error('Not found'), { status: 404, body: { message: '新导入接口尚未实现' } }); if (options.createLost && calls.create.length === 1) throw Error('lost create response'); return { ...ok({ batchId: 'b1', revision: 1, status: 'draft' }), code: 201 } },
    uploadImportFile: async request => { calls.upload.push(request); if (options.uploadLost && calls.upload.length === 1) throw Error('lost upload response'); return ok({ revision: 2, fileId: 77 }) },
    previewImportBatch: async request => { calls.preview.push(request); if (options.previewFail && calls.preview.length > 1) throw Error('断网'); const rows = getRows(); return ok({ batchId: 'b1', revision: 2, status: 'ready', previewToken: 'token-1', totalCount: rows.length, validCount: rows.filter(r => r.status === 'valid').length, invalidCount: 0, createCount: rows.filter(r => r.action === 'create' && r.status === 'valid').length, updateCount: 0, skipCount: 0, items: rows, page: 1, pageSize: 100 }) },
    commitImportBatch: async request => { calls.commit.push(request); committed = true; if (options.commitLost && calls.commit.length === 1) throw Error('lost commit response'); return { ...ok({ batchId: 'b1', revision: 2, status: 'queued' }), code: 202 } },
    getImportBatch: async () => { calls.read++; return ok({ batchId: 'b1', revision: 2, status: options.results ? 'partial_success' : 'succeeded' }) },
    listImportItems: async request => { const items = getRows(); return ok({ items: options.paged ? items.slice(request.page - 1, request.page) : items, total: items.length, page: request.page, pageSize: options.paged ? 1 : 100 }) },
    retryImportBatch: async request => { calls.retry.push(request); retried = true; return { ...ok({ batchId: 'b1', revision: 2, status: 'queued' }), code: 202 } },
    getImportTemplate: async () => ok({ filename: 'template.csv', content: 'asset_type,asset_name,visual_prompt', limits: { maxTextBytes: 2097152, maxRows: 1000, maxFileBytes: 20971520, maxFiles: 100, maxBatchBytes: 524288000 } }),
  }
  return { calls, services: { assetImportGenerated: { AssetImportsService: api } } }
}

/** Render the real handlers against the generated client's contract-shaped fixture. */
function csv(options = {}, props = {}) {
  const fixture = server(options)
  return { ...fixture, h: harness('AssetBibleImportModal', 'AssetBibleImportModal', fixture.services, props) }
}

/** Add one supported local file without invoking old entity or image-slot endpoints. */
async function imageFixture(options = {}) {
  const fixture = server(options)
  const h = harness('BatchAssetUploadModal', 'BatchAssetUploadModal', fixture.services)
  const file = new File(['data'], 'actor_测试.png', { type: 'image/png', lastModified: 1 })
  h.node('Dragger').props.beforeUpload(file, [file]); await h.flush()
  return { ...fixture, h, file }
}

test('CSV invalid-only preview cannot commit', async () => {
  const { h, calls } = csv({ previewRows: [{ ...row, status: 'invalid', action: 'none' }] })
  h.button('预览导入').props.onClick(); await h.flush()
  assert.equal(h.button('确认导入').props.disabled, true)
  h.button('确认导入').props.onClick(); await h.flush()
  assert.equal(calls.commit.length, 0)
})

test('CSV partial success shows actual row outcomes and refreshes the list', async () => {
  let refresh = 0
  const { h, calls } = csv({ results: [{ ...row, action: 'created', status: 'succeeded' }, { ...row, itemId: 'item-2', rowNumber: 3, action: 'none', status: 'failed', errors: [{ field: 'name', code: 'INVALID', message: '写入失败' }] }] }, { onImported: () => refresh++ })
  h.button('预览导入').props.onClick(); await h.flush()
  h.button('确认导入').props.onClick(); await h.flush()
  assert.equal(refresh, 1)
  assert.equal(calls.commit[0].requestBody.previewToken, 'token-1')
  assert.equal(calls.commit[0].requestBody.revision, 2)
  assert.equal(h.notifications.at(-1).level, 'warning')
  assert.equal(h.nodes().find(n => n.type === 'Statistic' && n.props.title === '已创建').props.value, 1)
})

test('CSV file and preview failures do not preserve stale submission eligibility', async () => {
  const { h } = csv({ previewFail: true })
  const original = h.node('TextArea').props.value
  h.node('Dragger').props.beforeUpload({ name: 'empty.csv', text: async () => '' }); await h.flush()
  assert.equal(h.node('TextArea').props.value, original)
  h.button('预览导入').props.onClick(); await h.flush()
  assert.equal(h.button('确认导入').props.disabled, false)
  h.button('预览导入').props.onClick(); await h.flush()
  assert.equal(h.button('确认导入').props.disabled, true)
})

test('lost creation response reuses the same key and input changes create a new draft', async () => {
  const { h, calls } = csv({ createLost: true })
  h.button('预览导入').props.onClick(); await h.flush()
  h.button('预览导入').props.onClick(); await h.flush()
  assert.equal(calls.create[0].idempotencyKey, calls.create[1].idempotencyKey)
  h.node('TextArea').props.onChange({ target: { value: 'asset_type,asset_name,visual_prompt\nactor,新演员,portrait' } }); await h.flush()
  h.button('预览导入').props.onClick(); await h.flush()
  assert.notEqual(calls.create[1].idempotencyKey, calls.create[2].idempotencyKey)
})

test('lost commit response exposes recovery and replays only the original command', async () => {
  const { h, calls } = csv({ commitLost: true })
  h.button('预览导入').props.onClick(); await h.flush()
  h.button('确认导入').props.onClick(); await h.flush()
  assert.equal(h.node('TextArea').props.disabled, true)
  h.button('查询结果').props.onClick(); await h.flush()
  assert.equal(calls.create.length, 1)
  assert.deepEqual(calls.commit[0], calls.commit[1])
  assert.ok(h.button('去资产列表查看'))
})

test('image queue deduplicates and rejects unsupported or empty files', async () => {
  const { h, file } = await imageFixture()
  h.node('Dragger').props.beforeUpload(file, [file, new File(['svg'], 'bad.svg', { type: 'image/svg+xml' }), new File([], 'empty.png')]); await h.flush()
  assert.equal(h.node('Table').props.dataSource.length, 1)
  assert.equal(h.notifications.at(-1).level, 'warning')
})

test('image batch sends a binary file and server retry reuses its original batch', async () => {
  const { h, calls, file } = await imageFixture({ results: [{ ...row, action: 'none', status: 'failed', retryable: true, errors: [{ field: '', code: 'TEMPORARY', message: '绑定失败' }] }] })
  h.button('开始导入').props.onClick(); h.button('开始导入').props.onClick(); await h.flush()
  assert.equal(calls.create.length, 1)
  assert.equal(calls.upload[0].formData.file, file)
  assert.equal(h.node('Table').props.dataSource[0].status, 'failed')
  h.button('重试失败项').props.onClick(); await h.flush()
  assert.equal(calls.create.length, 1)
  assert.equal(calls.upload.length, 1)
  assert.deepEqual(calls.retry[0].requestBody.itemIds, ['item-1'])
  assert.equal(calls.retry[0].requestBody.batchId, 'b1')
  assert.equal(h.node('Table').props.dataSource[0].status, 'done')
})

test('nonretryable invalid images require corrected input, and skipped rows never commit', async () => {
  const { h, calls } = await imageFixture({ previewRows: [{ ...row, status: 'valid', action: 'skip' }] })
  h.button('开始导入').props.onClick(); await h.flush()
  assert.equal(calls.commit.length, 0)
  assert.equal(h.node('Table').props.dataSource[0].status, 'skipped')
  assert.equal(h.button('重试失败项'), undefined)
})

test('contract and both modals contain no legacy import transport', () => {
  const spec = JSON.parse(readFileSync(new URL('../docs/contracts/asset-import.openapi.json', import.meta.url)))
  assert.equal(Object.keys(spec.paths).length, 8)
  for (const path of Object.keys(spec.paths)) assert.ok(path.startsWith('/api/v1/studio/assetLibrary/'))
  for (const filename of ['AssetBibleImportModal', 'BatchAssetUploadModal', 'assetImportSession']) {
    const source = readFileSync(new URL(`../src/pages/aiStudio/assets/components/${filename}.${filename === 'assetImportSession' ? 'ts' : 'tsx'}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /StudioEntitiesApi|StudioFilesService|AssetBibleImportApi|import-bible|\/entities\//)
  }
})

test('all preview pages are loaded before commit eligibility is exposed', async () => {
  const { h } = csv({ paged: true, previewRows: [row, { ...row, itemId: 'item-2', rowNumber: 3, name: '第二行' }] })
  h.button('预览导入').props.onClick(); await h.flush()
  assert.equal(h.node('Table').props.dataSource.length, 2)
  assert.equal(h.node('Table').props.dataSource[1].asset_name, '第二行')
})

test('an unavailable new backend surfaces its error and never creates a local success', async () => {
  const { h, calls } = csv({ unavailable: true })
  h.button('预览导入').props.onClick(); await h.flush()
  assert.equal(calls.commit.length, 0)
  assert.equal(h.button('确认导入').props.disabled, true)
  assert.equal(h.notifications.at(-1).text, '新导入接口尚未实现')
})

test('lost upload response reuses the file command key without recreating the batch', async () => {
  const { h, calls } = await imageFixture({ uploadLost: true })
  h.button('开始导入').props.onClick(); await h.flush()
  assert.equal(h.node('Table').props.dataSource[0].status, 'pending')
  h.button('开始导入').props.onClick(); await h.flush()
  assert.equal(calls.create.length, 1)
  assert.equal(calls.upload[0].idempotencyKey, calls.upload[1].idempotencyKey)
  assert.equal(h.node('Table').props.dataSource[0].status, 'done')
})
