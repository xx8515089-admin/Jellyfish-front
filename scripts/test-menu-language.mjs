import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
function load(file, resolve) {
  const exports = {}
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: resolve })
  return exports
}
function harness() {
  let token = 'account-a'
  const stored = [], requests = []
  const state = { language: 'zh-CN', menus: [], setMenus: menus => { state.menus = menus } }
  const api = load('src/services/authMenus.ts', name => {
    if (name === '../auth') return { getAuthToken: () => token, updateStoredAuthMenus: menus => stored.push(menus) }
    if (name.includes('useAppStore')) return { useAppStore: { getState: () => state } }
    if (name.endsWith('/OpenAPI')) return { OpenAPI: {} }
    if (name.endsWith('/request')) return { request: (_, options) => new Promise((resolve, reject) => requests.push({ options, resolve, reject })) }
    throw Error(name)
  })
  return { api, state, stored, requests, setToken: value => { token = value } }
}
const menu = (name, extra = {}) => ({ id: 1, name, nameZh: '项目列表', nameEn: 'Projects', code: 'projects', active: true, menuType: 'menu', sortOrder: 1, children: [], ...extra })

test('menu requests send language, replace the complete server tree and retain both raw names', async () => {
  const h = harness()
  const pending = h.api.refreshAuthMenus()
  assert.equal(h.requests[0].options.url, '/api/v1/auth/menus')
  assert.equal(h.requests[0].options.method, 'GET')
  assert.equal(h.requests[0].options.headers.language, 'cn')
  const tree = [menu('项目列表', { children: [menu('自定义', { id: 2, nameEn: '' })] })]
  h.requests[0].resolve({ code: 200, data: tree }); await pending
  assert.equal(h.state.menus, tree)
  assert.equal(h.stored[0], tree)
  h.state.language = 'en-US'
  const english = h.api.refreshAuthMenus()
  assert.equal(h.requests[1].options.headers.language, 'en')
  const translated = [menu('Projects', { children: [menu('自定义', { id: 2, nameEn: '' })] })]
  h.requests[1].resolve({ code: 200, data: translated }); await english
  assert.equal(h.state.menus, translated)
  assert.equal(h.state.menus[0].children[0].name, '自定义')
})

test('late Chinese responses cannot overwrite newer English navigation or its cache', async () => {
  const h = harness(), chinese = h.api.refreshAuthMenus()
  h.state.language = 'en-US'
  const english = h.api.refreshAuthMenus()
  h.requests[1].resolve({ code: 200, data: [menu('Projects')] }); await english
  h.requests[0].resolve({ code: 200, data: [menu('项目列表')] }); await chinese
  assert.equal(h.state.menus[0].name, 'Projects')
  assert.equal(h.stored.length, 1)
})

test('responses after account changes or sign-out cannot update menu permissions', async () => {
  for (const token of ['account-b', null]) {
    const h = harness(), pending = h.api.refreshAuthMenus()
    h.setToken(token)
    h.requests[0].resolve({ code: 200, data: [menu('项目列表')] }); await pending
    assert.equal(h.stored.length, 0)
    assert.equal(h.state.menus.length, 0)
  }
})

test('current failure keeps last known menus; obsolete failure is ignored; an empty valid tree replaces permissions', async () => {
  const h = harness(); h.state.menus = [menu('Cached')]
  const failure = h.api.refreshAuthMenus()
  h.requests[0].resolve({ code: 500, message: 'Unavailable' })
  await assert.rejects(failure, /Unavailable/)
  assert.equal(h.state.menus[0].name, 'Cached')
  const old = h.api.refreshAuthMenus()
  h.state.language = 'en-US'
  const latest = h.api.refreshAuthMenus()
  h.requests[1].reject(Error('old network error')); await old
  h.requests[2].resolve({ code: 200, data: [] }); await latest
  assert.equal(h.state.menus.length, 0)
})

test('English menu editing preserves the Chinese source and distinguishes clear from preserve', () => {
  const fields = load('src/pages/system/menuLanguage.ts', () => { throw Error('Unexpected import') })
  assert.equal(fields.menuNameFields(menu('Projects')).name, '项目列表')
  assert.equal(fields.menuNameFields(menu('Projects')).nameEn, 'Projects')
  assert.equal(fields.menuNamePayload({ name: ' 项目列表 ', nameEn: ' Projects ' }).nameEn, 'Projects')
  assert.equal(fields.menuNamePayload({ name: ' 项目列表 ', nameEn: '  ' }).nameEn, '')
  assert.equal(fields.menuNamePayload({ name: '项目列表', nameEn: null }).nameEn, null)
  assert.equal(fields.menuNamePayload({ name: '项目列表' }).nameEn, undefined)
})

test('UI labels and parameterized messages switch both ways without translating user data', () => {
  const i18n = { language: 'zh-CN', resolvedLanguage: 'zh-CN' }
  const dictionary = JSON.parse(readFileSync(new URL('../src/locales/en-US/ui.json', import.meta.url), 'utf8'))
  const { uiText } = load('src/i18n/uiText.ts', name => name === '../i18n' ? { default: i18n } : name === 'react' ? require('react') : { default: dictionary })
  assert.equal(uiText('生成 {0} 个片段', 3), '生成 3 个片段')
  i18n.resolvedLanguage = i18n.language = 'en-US'
  assert.equal(uiText('生成 {0} 个片段', 3), 'Generate 3 segments')
  assert.equal(uiText('用户手册'), 'User manual')
  assert.equal(uiText('客户自定义项目甲'), '客户自定义项目甲')
  assert.equal(uiText('删除工程 {0}', '$& {1} 中文名'), 'Delete project $& {1} 中文名')
  i18n.resolvedLanguage = i18n.language = 'zh-CN'
  assert.equal(uiText('用户手册'), '用户手册')
})

test('both manuals preserve all 13 chapter anchors, including the director start chapter', () => {
  const manuals = ['docs/canvas-director-beginner-manual.md', 'docs/canvas-director-beginner-manual.en.md']
  for (const file of manuals) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    const headings = [...source.matchAll(/^## (\d+)\./gm)].map(match => Number(match[1]))
    assert.deepEqual(headings, Array.from({ length: 13 }, (_, index) => index + 1))
  }
})

test('menu cache is isolated by account and language, and ignores legacy unscoped trees', () => {
  const stored = new Map()
  const localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) }
  const exports = {}
  const source = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, window: { localStorage, navigator: { languages: ['en-US'], language: 'en-US' } } })
  localStorage.setItem('jellyfish_language', 'zh-CN')
  exports.createAuthSession('token-a', { id: 'a' }, [menu('项目列表')])
  assert.equal(exports.getStoredAuthMenus()[0].name, '项目列表')
  localStorage.setItem('jellyfish_language', 'en-US')
  assert.equal(exports.getStoredAuthMenus().length, 0)
  exports.updateStoredAuthMenus([menu('Projects')])
  assert.equal(exports.getStoredAuthMenus()[0].name, 'Projects')
  exports.updateStoredAuthUser({ id: 'b' })
  assert.equal(exports.getStoredAuthMenus().length, 0)
  localStorage.setItem('jellyfish_auth_menus', JSON.stringify([menu('Legacy')]))
  assert.equal(exports.getStoredAuthMenus().length, 0)
  exports.clearAuthSession()
  assert.equal(exports.getStoredAuthMenus().length, 0)
})

test('editing fetches detail with stable ID and explicit language, and rejects business failures', async () => {
  const requests = []
  let response = { code: 200, data: menu('Projects') }
  const detail = load('src/services/systemMenuDetail.ts', name => {
    if (name.endsWith('/OpenAPI')) return { OpenAPI: {} }
    if (name.endsWith('/request')) return { request: async (_, options) => { requests.push(options); return response } }
    throw Error(name)
  })
  assert.equal((await detail.getSystemMenuDetail(123, 'en-US')).nameZh, '项目列表')
  assert.equal(requests[0].url, '/api/v1/system/menus/detail')
  assert.equal(requests[0].query.id, 123)
  assert.equal(requests[0].headers.language, 'en')
  response = { code: 502, message: 'No permission' }
  await assert.rejects(detail.getSystemMenuDetail(123, 'zh-CN'), /No permission/)
  assert.equal(requests[1].headers.language, 'cn')
  const fields = load('src/pages/system/menuLanguage.ts', () => ({}))
  assert.throws(() => fields.menuNameFields({ name: 'Projects' }), /nameZh/)
  assert.equal(fields.menuNameFields(menu('项目列表', { nameEn: '' })).nameEn, '')
  for (const code of [0, 401, 502, undefined]) assert.throws(() => fields.assertMenuSuccess({ code }, 'failed'), /failed/)
})

test('actual menu form rules accept 120 characters, reject 121, and enforce Chinese name, code, type and route', async () => {
  const antdRequire = createRequire(require.resolve('antd/package.json'))
  const fieldRequire = createRequire(antdRequire.resolve('rc-field-form/package.json'))
  const Validator = fieldRequire('@rc-component/async-validator').default
  const source = readFileSync(new URL('../src/pages/system/MenuManagement.tsx', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('MenuManagement.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const rules = {}
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'Form.Item') {
      const attrs = node.attributes.properties
      const name = attrs.find(item => item.name?.text === 'name')?.initializer?.text
      const expression = attrs.find(item => item.name?.text === 'rules')?.initializer?.expression
      if (name && expression) rules[name] = vm.runInNewContext(`(${expression.getText(ast)})`, { text: (_, english) => english }).map(rule => rule.pattern ? { ...rule, pattern: new RegExp(rule.pattern.source, rule.pattern.flags) } : rule)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const validate = (name, value, values = {}) => new Validator({ [name]: rules[name].map(rule => typeof rule === 'function' ? rule({ getFieldValue: key => values[key] }) : rule) }).validate({ [name]: value })
  for (const name of ['name', 'nameEn']) {
    await validate(name, 'x'.repeat(120))
    await assert.rejects(validate(name, 'x'.repeat(121)))
  }
  await assert.rejects(validate('name', '  '))
  await validate('nameEn', '')
  await validate('code', 'projects_v2-main')
  for (const code of ['Bad-Code', '9bad', 'a'.repeat(65), 'has space']) await assert.rejects(validate('code', code))
  await validate('menuType', 'directory'); await validate('menuType', 'menu')
  await assert.rejects(validate('menuType', 'button'))
  await validate('path', '', { menuType: 'directory' })
  await assert.rejects(validate('path', '  ', { menuType: 'menu' }))
  await validate('path', '/projects', { menuType: 'menu' })
})

test('breadcrumbs use server menu names for nested and query-specific routes', () => {
  const source = readFileSync(new URL('../src/layouts/MainLayout.tsx', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('MainLayout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = ['findMenuDisplayName', 'getVisibleMenus', 'parseMenuPath', 'normalizePathname', 'requiredQueryMatches']
  const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(ast)).join('\n')
  const context = { URLSearchParams }
  vm.runInNewContext(ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context)
  const tree = [menu('Custom Projects', { path: '/projects', children: [menu('My characters', { id: 2, path: '/assets?type=character' })] })]
  assert.equal(context.findMenuDisplayName(tree, '/projects', ''), 'Custom Projects')
  assert.equal(context.findMenuDisplayName(tree, '/assets', '?type=character'), 'My characters')
  assert.equal(context.findMenuDisplayName(tree, '/assets', '?type=prop'), undefined)
})
