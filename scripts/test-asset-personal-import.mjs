import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/aiStudio/project/ProjectAssetsStep.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('ProjectAssetsStep.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

const declarations = new Map()
let personalAssetsEffect

const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    declarations.set(node.name.text, node)
  }
  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect') {
    const text = node.getText(tree)
    if (text.includes('StudioAssetLibraryApi.listItems')) {
      personalAssetsEffect = node
    }
  }
  ts.forEachChild(node, visit)
}
visit(tree)

const declarationText = (name) => {
  const declaration = declarations.get(name)
  assert.ok(declaration?.initializer, `Missing declaration: ${name}`)
  return declaration.initializer.getText(tree)
}

test('personal asset import opens with a fresh selection and episode import defaults', () => {
  const handler = declarationText('openPersonalImport')
  assert.match(handler, /assetImageOperationLocked\(targetAssetId\)/)
  assert.match(handler, /setPersonalImportOpen\(true\)/)
  assert.match(handler, /setPersonalImportSettingsOpen\(false\)/)
  assert.match(handler, /setPersonalAssetId\(''\)/)
  assert.match(handler, /setPersonalAssetSearch\(''\)/)
  assert.match(handler, /setPersonalAssets\(\[\]\)/)
  assert.match(handler, /setPersonalAssetsPage\(1\)/)
  assert.match(handler, /setPersonalAssetsTotal\(0\)/)
  assert.match(handler, /setPersonalAssetsError\(undefined\)/)
  assert.match(handler, /setPersonalAssetImageFailures\(new Set\(\)\)/)
  assert.match(handler, /setPersonalImportEpisodeMode\(episodeIndex === null \? 'all' : 'selected'\)/)
  assert.match(handler, /setPersonalImportEpisodeIndexes\(episodeIndex === null \? \[\] : \[episodeIndex\]\)/)
  assert.match(handler, /personalImportEpisodesRequestRevisionRef\.current \+= 1/)
  assert.match(handler, /personalImportEpisodesRequestRef\.current\?\.cancel\(\)/)
  assert.match(handler, /refreshPersonalImportEpisodes\(\)/)
})

test('personal asset import loads enabled items from the asset library with stale response guards', () => {
  assert.ok(personalAssetsEffect, 'Missing personal asset library loading effect')
  const effect = personalAssetsEffect.getText(tree)
  assert.match(effect, /if\s*\(!personalImportOpen\)\s*return/)
  assert.match(effect, /const requestRevision = \+\+personalAssetsRequestRevisionRef\.current/)
  assert.match(effect, /let active = true/)
  assert.match(effect, /window\.setTimeout\(\(\) => \{/)
  assert.match(effect, /StudioAssetLibraryApi\.listItems\(\{/)
  assert.match(effect, /assetType:\s*ASSET_LIBRARY_TYPE_BY_KIND\[kind\]/)
  assert.match(effect, /status:\s*1/)
  assert.match(effect, /keyword:\s*personalAssetSearch\.trim\(\) \|\| undefined/)
  assert.match(effect, /page:\s*personalAssetsPage/)
  assert.match(effect, /pageSize:\s*PERSONAL_ASSET_PAGE_SIZE/)
  assert.match(effect, /if\s*\(!active \|\| requestRevision !== personalAssetsRequestRevisionRef\.current\)\s*return/)
  assert.match(effect, /item\.assetType === expectedAssetType && item\.status === 1/)
  assert.match(effect, /imageUrl:\s*item\.coverUrl \?\? undefined/)
  assert.match(effect, /setPersonalAssets\(nextAssets\)/)
  assert.match(effect, /setPersonalAssetsPage\(response\.page\)/)
  assert.match(effect, /setPersonalAssetsTotal\(response\.total\)/)
  assert.match(effect, /setPersonalAssetImageFailures\(new Set\(\)\)/)
})

test('personal asset import keeps late failures from replacing newer modal state', () => {
  const effect = personalAssetsEffect.getText(tree)
  assert.match(effect, /\.catch\(\(error\) => \{\s*if\s*\(!active \|\| requestRevision !== personalAssetsRequestRevisionRef\.current\)\s*return/)
  assert.match(effect, /setPersonalAssets\(\[\]\)/)
  assert.match(effect, /setPersonalAssetsError\(error\)/)
  assert.match(effect, /\.finally\(\(\) => \{\s*if\s*\(active && requestRevision === personalAssetsRequestRevisionRef\.current\)\s*\{\s*setPersonalAssetsLoading\(false\)/)
  assert.match(effect, /return \(\) => \{\s*active = false\s*window\.clearTimeout\(timer\)/)
  assert.match(effect, /if\s*\(requestRevision === personalAssetsRequestRevisionRef\.current\)\s*\{\s*personalAssetsRequestRevisionRef\.current \+= 1/)
})
