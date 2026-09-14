import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

const modelManagementSource = readSource('../src/pages/aiStudio/models/ModelManagement.tsx')
const providersTabSource = readSource('../src/pages/aiStudio/models/ProvidersTab.tsx')
const systemSuppliersSource = readSource('../src/services/systemSuppliers.ts')

const parseTsx = (fileName, source) =>
  ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

const parseTs = (fileName, source) =>
  ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const modelManagementAst = parseTsx('ModelManagement.tsx', modelManagementSource)
const providersTabAst = parseTsx('ProvidersTab.tsx', providersTabSource)
const systemSuppliersAst = parseTs('systemSuppliers.ts', systemSuppliersSource)

function collect(root, predicate) {
  const matches = []
  const visit = (node) => {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function findVariableInitializer(ast, name) {
  const declaration = collect(
    ast,
    (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name,
  )[0]
  assert.ok(declaration?.initializer, `Expected ${name} to be declared with an initializer`)
  return declaration.initializer
}

function findFunctionDeclaration(ast, name) {
  const declaration = collect(
    ast,
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )[0]
  assert.ok(declaration, `Expected function ${name} to be declared`)
  return declaration
}

function jsxTagName(opening) {
  return opening.tagName.getText()
}

function jsxAttributes(opening) {
  return new Map(
    opening.attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attribute) => [attribute.name.text, attribute]),
  )
}

function jsxAttributeExpressionText(attribute) {
  const initializer = attribute?.initializer
  if (!initializer) return ''
  if (ts.isJsxExpression(initializer)) return initializer.expression?.getText() ?? ''
  return initializer.getText()
}

function findOpeningElement(ast, tagName, identifyingAttribute, identifyingExpression) {
  const openings = collect(
    ast,
    (node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node),
  )
  return openings.find((opening) => {
    if (jsxTagName(opening) !== tagName) return false
    const attributes = jsxAttributes(opening)
    return jsxAttributeExpressionText(attributes.get(identifyingAttribute)) === identifyingExpression
  })
}

function callbackSource(ast, expressionText) {
  if (!/^[$A-Z_a-z][$\w]*$/.test(expressionText)) return expressionText

  const variable = collect(
    ast,
    (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === expressionText,
  )[0]
  if (variable?.initializer) return variable.initializer.getText()

  const declaration = collect(
    ast,
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === expressionText,
  )[0]
  return declaration?.getText() ?? expressionText
}

function calledSupplierMethods(root) {
  return collect(root, ts.isCallExpression)
    .map((call) => call.expression.getText())
    .filter((name) => name.startsWith('SystemSuppliersApi.'))
}

test('the model-management route renders ProvidersTab, which owns the live model editor', () => {
  const providerImport = modelManagementAst.statements.find(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      statement.importClause?.name?.text === 'ProvidersTab' &&
      statement.moduleSpecifier.getText().replaceAll("'", '').replaceAll('"', '') === './ProvidersTab',
  )
  assert.ok(providerImport, 'ModelManagement must import the live ProvidersTab implementation')

  const renderedProvidersTab = collect(
    modelManagementAst,
    (node) => ts.isJsxSelfClosingElement(node) && jsxTagName(node) === 'ProvidersTab',
  )
  assert.equal(renderedProvidersTab.length, 1, 'ModelManagement must render exactly one ProvidersTab')
})

test('the model modal submits its Form and exposes validation failures to the user', () => {
  const modal = findOpeningElement(providersTabAst, 'Modal', 'open', 'modelModalOpen')
  assert.ok(modal, 'Expected to find the model editor Modal')
  const modalAttributes = jsxAttributes(modal)
  assert.match(
    jsxAttributeExpressionText(modalAttributes.get('onOk')),
    /\bmodelForm\.submit\s*\(/,
    'The Modal OK action must submit the Ant Design form',
  )

  const form = findOpeningElement(providersTabAst, 'Form', 'form', 'modelForm')
  assert.ok(form, 'Expected to find the model editor Form')
  const formAttributes = jsxAttributes(form)
  const onFinish = jsxAttributeExpressionText(formAttributes.get('onFinish'))
  assert.ok(
    onFinish === 'handleSaveModel' || /\bhandleSaveModel\s*\(/.test(onFinish),
    'Successful validation must enter handleSaveModel through Form.onFinish',
  )
  assert.ok(formAttributes.has('scrollToFirstError'), 'The model form must scroll to its first invalid field')

  const onFinishFailed = jsxAttributeExpressionText(formAttributes.get('onFinishFailed'))
  assert.ok(onFinishFailed, 'The model form must configure onFinishFailed')
  assert.match(
    callbackSource(providersTabAst, onFinishFailed),
    /\bmessage\.(?:error|warning|info)\s*\(/,
    'onFinishFailed must show a visible validation message',
  )
})

test('handleSaveModel dispatches create and update through separate editing branches', () => {
  const handler = findVariableInitializer(providersTabAst, 'handleSaveModel')
  const editingBranch = collect(
    handler,
    (node) => ts.isIfStatement(node) && /^modelEditing$/.test(node.expression.getText()),
  )[0]
  assert.ok(editingBranch?.elseStatement, 'handleSaveModel must have modelEditing create/update branches')

  const updateMethods = calledSupplierMethods(editingBranch.thenStatement)
  const createMethods = calledSupplierMethods(editingBranch.elseStatement)
  assert.ok(
    updateMethods.includes('SystemSuppliersApi.updateModel'),
    'Editing a model must call SystemSuppliersApi.updateModel',
  )
  assert.ok(
    createMethods.includes('SystemSuppliersApi.createModel'),
    'Creating a model must call SystemSuppliersApi.createModel',
  )
  assert.ok(
    !updateMethods.includes('SystemSuppliersApi.createModel'),
    'The edit branch must not call the create endpoint',
  )
  assert.ok(
    !createMethods.includes('SystemSuppliersApi.updateModel'),
    'The create branch must not call the update endpoint',
  )
})

test('supplier model services POST to the exact createModel and updateModel URLs', () => {
  const createModel = findFunctionDeclaration(systemSuppliersAst, 'createSystemSupplierModel').getText()
  assert.match(createModel, /method:\s*['"]POST['"]/)
  assert.match(createModel, /url:\s*['"]\/api\/v1\/system\/suppliers\/createModel['"]/)

  const updateModel = findFunctionDeclaration(systemSuppliersAst, 'updateSystemSupplierModel').getText()
  assert.match(updateModel, /method:\s*['"]POST['"]/)
  assert.match(updateModel, /url:\s*['"]\/api\/v1\/system\/suppliers\/updateModel['"]/)
})
