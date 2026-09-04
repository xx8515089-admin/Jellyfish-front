import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const componentSource = readFileSync(new URL('../src/pages/aiStudio/project/AssetGenerationProgress.tsx', import.meta.url), 'utf8')
const progressCss = readFileSync(new URL('../src/pages/aiStudio/project/AssetGenerationProgress.css', import.meta.url), 'utf8')
const cardCss = readFileSync(new URL('../src/pages/aiStudio/project/ProjectAssetsStep.css', import.meta.url), 'utf8')
const workspaceCss = readFileSync(new URL('../src/pages/aiStudio/project/AssetGenerationWorkspace.css', import.meta.url), 'utf8')

test('100 percent result-loading state does not render visual progress percentage or track', () => {
  assert.match(componentSource, /const resultLoading = state\.phase === 'refreshing' && progress >= 100/)
  assert.match(componentSource, /const statusText = resultLoading \? label :/)
  assert.match(componentSource, /aria-valuetext=\{resultLoading \? label : `\$\{label\} \$\{progress\}%`\}/)
  assert.doesNotMatch(componentSource, /asset-generation-progress__track/)
  assert.doesNotMatch(componentSource, /asset-generation-progress__fill/)
  assert.doesNotMatch(progressCss, /asset-generation-progress__track/)
  assert.doesNotMatch(progressCss, /asset-generation-progress__fill/)
})

test('progress overlay uses animated sparkle layout instead of a horizontal bar card', () => {
  assert.match(componentSource, /asset-generation-progress__sparkle/)
  assert.match(componentSource, /asset-generation-progress__status/)
  assert.match(progressCss, /@keyframes asset-generation-sparkle-breathe/)
  assert.match(progressCss, /@keyframes asset-generation-sparkle-halo/)
  assert.match(progressCss, /@keyframes asset-generation-sparkle-turn/)
  assert.match(cardCss, /\.project-assets-step__card-generation \{[\s\S]*justify-content: center;[\s\S]*radial-gradient/)
  assert.match(workspaceCss, /\.asset-generation-workspace__generation-state \{[\s\S]*flex-direction: column;[\s\S]*radial-gradient/)
  assert.match(workspaceCss, /\.asset-generation-workspace__look-progress \{[\s\S]*radial-gradient/)
})
