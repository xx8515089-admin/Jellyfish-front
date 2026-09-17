import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function loadActions(name, dialogs, shared = {}, globals = {}) {
  const filename = `../src/pages/canvas/TapnowStudio/actions/${name}.js`
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, {
    exports, console, Map, Set,
    require: name => name === '../canvasDialogs' ? dialogs : name === '../freeCanvasShared' ? { t: value => value, ...shared } : {},
    ...globals,
  })
  return exports
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function storyboardHarness() {
  const confirmation = deferred()
  const questions = [], updates = [], requests = []
  let undoCount = 0
  const actions = loadActions('storyboardActions', {
    canvasConfirm: (...args) => { questions.push(args); return confirmation.promise },
  }, {
    STORYBOARD_LLM_SPLIT_MODES: ['script'],
    normalizeStoryboardMode: () => 'image',
    parseJsonArrayFromText: JSON.parse,
  }, {
    fetch: async (...args) => {
      requests.push(args)
      return { json: async () => ({ choices: [{ message: { content: '[{"prompt":"new shot"}]' } }] }) }
    },
  })
  const context = {
    nodesMap: new Map([['board', { id: 'board', type: 'storyboard-node', settings: { scriptText: 'script', shots: [{ id: 'existing' }] } }]]),
    chatModel: 'chat',
    getApiCredentials: () => ({ key: 'test', url: 'https://example.test' }),
    getStoryboardPromptTemplate: () => 'template',
    getFirstEnabledModelKey: () => 'image',
    getPreferredModelRatio: () => '16:9',
    getPreferredImageResolutionForModel: () => '2K',
    getDefaultCustomParamsForModel: () => ({}),
    saveToUndoStack: () => { undoCount++ },
    updateNodeSettings: (id, patch) => updates.push({ id, patch }),
  }
  return { run: () => actions.runStoryboardLlmSplit(context, 'board'), confirmation, questions, updates, requests, undoCount: () => undoCount }
}

for (const overwrite of [true, false]) {
  test(`storyboard waits for ${overwrite ? 'overwrite' : 'append'} selection before modifying or requesting`, async () => {
    const h = storyboardHarness()
    const running = h.run()
    await Promise.resolve()
    assert.equal(h.questions.length, 1)
    assert.equal(h.questions[0][1].dismissValue, null)
    assert.equal(h.updates.length, 0)
    assert.equal(h.requests.length, 0)
    assert.equal(h.undoCount(), 0)
    h.confirmation.resolve(overwrite)
    await running
    const shots = h.updates.at(-1).patch.shots
    assert.equal(shots.length, overwrite ? 1 : 2)
    if (!overwrite) assert.equal(shots[0].id, 'existing')
    assert.equal(shots.at(-1).prompt, 'new shot')
    assert.equal(h.requests.length, 1)
  })
}

test('closing the storyboard decision does not append or overwrite any shots', async () => {
  const h = storyboardHarness()
  const running = h.run()
  h.confirmation.resolve(null)
  await running
  assert.equal(h.updates.length, 0)
  assert.equal(h.requests.length, 0)
  assert.equal(h.undoCount(), 0)
})

for (const result of [null, '{"script:memory1":"memory"}']) {
  test(`memory import waits for multiline input and ${result === null ? 'preserves state on cancel' : 'imports submitted JSON'}`, async () => {
    const input = deferred(), prompted = deferred()
    const prompts = [], updates = [], toasts = []
    const actions = loadActions('storyboardActions', {
      canvasPrompt: (...args) => { prompts.push(args); prompted.resolve(); return input.promise },
    }, {
      STORYBOARD_LLM_PROMPT_MODES: [],
    }, { navigator: { clipboard: { readText: async () => '' } } })
    const running = actions.importStoryboardPromptSlots({
      nodesMap: new Map([['board', { type: 'storyboard-node', settings: {} }]]),
      normalizeImportedStoryboardPromptSlots: value => value,
      updateNodeSettings: (id, patch) => updates.push(patch),
      showToast: (...args) => toasts.push(args),
    }, 'board')
    await prompted.promise
    assert.equal(prompts.length, 1)
    assert.equal(prompts[0][2].multiline, true)
    assert.equal(updates.length, 0)
    input.resolve(result)
    await running
    assert.equal(updates.length, result === null ? 0 : 1)
    assert.equal(toasts.length, result === null ? 0 : 1)
    if (result !== null) assert.equal(updates[0].llmPromptSlots['script:memory1'], 'memory')
  })
}

for (const proceed of [true, false]) {
  test(`workflow export waits for confirmation and ${proceed ? 'saves only when accepted' : 'does not save on cancel'}`, async () => {
    const confirmation = deferred()
    const questions = [], alerts = [], downloads = []
    const actions = loadActions('projectsActions', {
      canvasConfirm: text => { questions.push(text); return confirmation.promise },
      canvasAlert: text => alerts.push(text),
    }, {}, {
      window: {}, Blob,
      URL: { createObjectURL: () => 'blob:export', revokeObjectURL() {} },
      document: {
        body: { appendChild() {}, removeChild() {} },
        createElement: () => ({ click() { downloads.push(this.download) } }),
      },
    })
    const running = actions.handleSaveSelectedWorkflow({
      nodes: [{ id: 'chosen', type: 'input-text' }], connections: [],
      selectedNodeIds: new Set(['chosen']), setSelectionContextMenu() {},
      resolveSourceReferenceUrl: value => value,
      getCSTFilenameTimestamp: () => 'test', getCSTTimestamp: () => 'time',
    })
    await Promise.resolve()
    assert.equal(questions.length, 1)
    assert.equal(downloads.length, 0)
    confirmation.resolve(proceed)
    await running
    assert.equal(downloads.length, proceed ? 1 : 0)
    assert.equal(alerts.length, proceed ? 1 : 0)
    if (proceed) assert.equal(downloads[0], '工作流_test.json')
  })
}
