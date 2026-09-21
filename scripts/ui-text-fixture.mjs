import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise production formatting/catalogue while the component harness owns React state.
export function createUiTextFixture() {
  const language = { language: 'zh-CN', resolvedLanguage: 'zh-CN', on() {}, off() {} }
  const exports = {}
  const catalogue = JSON.parse(readFileSync(new URL('../src/locales/en-US/ui.json', import.meta.url), 'utf8'))
  const source = readFileSync(new URL('../src/i18n/uiText.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: name => {
      if (name === '../i18n') return { default: language }
      if (name === 'react') return { useSyncExternalStore: (_, snapshot) => snapshot() }
      if (name.endsWith('ui.json')) return { default: catalogue }
      throw new Error(name)
    },
  })
  return { ...exports, setLanguage(value) { language.language = language.resolvedLanguage = value } }
}
