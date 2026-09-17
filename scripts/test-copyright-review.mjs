import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/aiStudio/project/copyrightReviewFindings.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } })
const { parseCopyrightFindings } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const finding = {
  code: 'NO_VISUAL_RISK_FOUND', message: '图片初筛未发现明显侵权风险线索',
  evidence: '未见可辨识的品牌标识或水印', location: '整张图片', severity: 'low',
  suggestion: '发布前结合素材来源、授权范围及用途确认使用条件',
}

test('parses all result details from the API JSON array string', () => {
  assert.deepEqual(parseCopyrightFindings(JSON.stringify([finding])), { items: [finding] })
})
test('supports a second JSON string encoding', () => {
  assert.deepEqual(parseCopyrightFindings(JSON.stringify(JSON.stringify([finding]))), { items: [finding] })
})
test('empty findings do not fabricate a risk finding', () => {
  for (const value of [null, undefined, '', '  ', '[]']) {
    assert.deepEqual(parseCopyrightFindings(value), { items: [] })
  }
})
test('retains malformed or unexpected findings so evidence is not silently lost', () => {
  for (const value of ['invalid JSON', '{"evidence":"detail"}', '[null]', '[{"evidence":{"text":"detail"}}]', JSON.stringify([finding, 'detail'])]) {
    assert.deepEqual(parseCopyrightFindings(value), { items: [], raw: value })
  }
})