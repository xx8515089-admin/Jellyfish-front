import { uiText, useUiLanguage } from '../../../i18n/uiText'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, InputNumber, Pagination, Select, Space, Tag } from 'antd'
import { CanvasAnalysis } from '../../../services/studioCanvasAnalysis'
import { StudioCanvases, canvasRequestId } from '../../../services/studioCanvases'
import { analysisOperations, analysisSource, analysisSourceKind, loadAnalysisCatalogs, analysisEstimate, normalizeAnalysisFrames, submitAnalysis, analysisFingerprint, applyAnalysisResult } from './canvasAnalysis'
import { actualBillingQuote, canvasBillingError, billingLabels } from './canvasActualBilling'
import { executionStatus, credits } from './canvasExecution'
import CanvasChatAttachment from './components/CanvasChatAttachment'
import { analysisStoryboardShots } from './canvasAnalysisStoryboard'
import './canvasAnalysis.css'

/** Display owned keyframes and native media timestamps; no provider URLs or fabricated transcript. */
export function CanvasAnalysisResult({ task, session }) {
  useUiLanguage()

  const result = task.result
  if (!result) return null
  return <div className="canvas-analysis-results">
    {(result.warnings || []).map((warning, index) => <Alert key={index} type="info" message={warning === 'NO_AUDIO_TRACK' ? uiText("没有检测到音轨，本次未调用模型。") : warning === 'NO_SPEECH' ? uiText("音轨中没有识别到语音。") : String(warning)} />)}
    {result.hasAudio === false && !(result.warnings || []).includes('NO_AUDIO_TRACK') && <p>{uiText("没有检测到音轨。")}</p>}
    {result.language && <Tag>{uiText("语言：")}{result.language}</Tag>}
    {result.segments?.map((segment, index) => <div className="canvas-analysis-transcript" key={index}><small>{segment.startSeconds}–{segment.endSeconds}s{segment.speaker ? ` · ${segment.speaker}` : ''}</small><p>{segment.text}</p></div>)}
    {result.fullText && <details><summary>{uiText("完整转写")}</summary><p className="canvas-analysis-prose">{result.fullText}</p></details>}
    {result.scenes?.map(scene => <section className="canvas-analysis-scene" key={scene.sceneId}>
      <header><strong>{uiText("场景") + " "}{scene.sceneId}</strong><span>{scene.startSeconds}–{scene.endSeconds}s</span></header>
      <p>{scene.description}</p>
      {scene.cameraMovement && <p><b>{uiText("镜头运动")}{scene.cameraMovementInferred ? uiText("（推断）") : ''}：</b>{scene.cameraMovement}</p>}
      {scene.subjectDynamics && <p><b>{uiText("主体动态：")}</b>{scene.subjectDynamics}</p>}{scene.atmosphere && <p><b>{uiText("氛围：")}</b>{scene.atmosphere}</p>}
      <div className="canvas-analysis-frames">{scene.keyframes?.map(frame => <div key={frame.frameId}><CanvasChatAttachment session={session} asset={{ canvasId: task.canvasId, assetId: frame.assetId, mimeType: 'image/png', name: uiText("{0}s · {1}", frame.timeSeconds, frame.role || uiText("关键帧")) }} /><small>{frame.timeSeconds}s · {frame.description}</small></div>)}</div>
      <p className="canvas-analysis-prose">{scene.prompts?.zh}</p><details><summary>{uiText("英文提示词")}</summary><p className="canvas-analysis-prose">{scene.prompts?.en}</p></details>
      <Space wrap>{Object.values(scene.tags || {}).flat().map((tag, index) => <Tag key={index}>{tag}</Tag>)}</Space>
    </section>)}
  </div>
}

/** The same explicit conversion is available from node results, history and workflow results. */
export function CanvasAnalysisStoryboardActions({ task, analysis, snapshotRef, disabled = false }) {
  useUiLanguage()

  const [language, setLanguage] = useState('zh'), [target, setTarget] = useState()
  if (task.status !== 3 || !task.result?.scenes?.length || !['videoAnalyze', 'framePromptGenerate'].includes(task.operation)) return null
  const boards = snapshotRef.current.nodes.filter(node => node.type === 'storyboard-node')
  return <Space wrap>
    <Select aria-label={uiText("分镜提示词语言")} value={language} onChange={setLanguage} disabled={disabled || analysis.busy} options={[{ value: 'zh', label: uiText("中文提示词") }, { value: 'en', label: uiText("英文提示词") }]} />
    <Button disabled={disabled || analysis.busy} onClick={() => analysis.importStoryboard(task, null, language)}>{uiText("新建分镜")}</Button>
    <Select aria-label={uiText("导入目标分镜")} placeholder={uiText("选择已有分镜")} value={target} onChange={setTarget} disabled={disabled || analysis.busy} options={boards.map(node => ({ value: node.id, label: node.title || node.settings?.projectTitle || node.id }))} />
    <Button disabled={disabled || analysis.busy || !boards.some(node => node.id === target)} onClick={() => analysis.importStoryboard(task, target, language)}>{uiText("导入已有分镜")}</Button>
  </Space>
}

/** Independent analysis capability/catalog lifecycle and sequential persisted task polling. */
export function useCanvasAnalysis({ session, snapshotRef, setNodes, save, assertReady, saveToUndoStack, confirm }) {
  useUiLanguage()

  const [capabilities, setCapabilities] = useState(null), [catalogs, setCatalogs] = useState({}), [catalogErrors, setCatalogErrors] = useState({})
  const [quotes, setQuotes] = useState({})
  const [tasks, setTasks] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1), [total, setTotal] = useState(0)
  const mounted = useRef(true), lock = useRef(false), taskRef = useRef([]), polling = useRef(false), nextPoll = useRef(new Map())
  const detailRequests = useRef(new Map()), listSequence = useRef(0), catalogSequence = useRef(0)
  taskRef.current = tasks
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const put = useCallback(task => { if (task) nextPoll.current.set(String(task.taskId), Date.now() + Math.max(1500, task.retryAfterMs || 2500)); if (task && mounted.current) setTasks(previous => [task, ...previous.filter(item => String(item.taskId) !== String(task.taskId))]) }, [])
  const run = async action => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { session.assertWritable(); return await action() } catch (reason) { if (mounted.current) setError(canvasBillingError(reason)) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  /** Share in-flight detail reads between history, manual refresh and polling. */
  const detail = useCallback((canvasId, taskId) => {
    const key = `${canvasId}:${taskId}`
    if (!detailRequests.current.has(key)) {
      const request = CanvasAnalysis.detail(canvasId, taskId).then(task => {
        nextPoll.current.set(String(taskId), Date.now() + Math.max(1500, task.retryAfterMs || 2500))
        return task
      }).finally(() => detailRequests.current.delete(key))
      detailRequests.current.set(key, request)
    }
    return detailRequests.current.get(key)
  }, [])
  const refresh = useCallback(async () => {
    const sequence = ++listSequence.current
    const result = await CanvasAnalysis.list(session.document.canvasId, page)
    const details = await Promise.allSettled(result.items.map(item => detail(session.document.canvasId, item.taskId)))
    if (!mounted.current || sequence !== listSequence.current) return
    const items = details.map((value, index) => value.status === 'fulfilled' ? value.value : result.items[index])
    const failure = details.find(value => value.status === 'rejected')
    if (failure) setError(canvasBillingError(failure.reason))
    setTotal(result.total)
    setTasks(previous => [...items, ...previous.filter(task => (task.shouldPoll || task.status === 6) && !items.some(item => String(item.taskId) === String(task.taskId)))])
  }, [session, page, detail])
  const load = useCallback(async () => {
    const sequence = ++catalogSequence.current
    setCapabilities(null); setCatalogs({}); setCatalogErrors({})
    const next = await CanvasAnalysis.capabilities()
    const loaded = await loadAnalysisCatalogs(next)
    if (!mounted.current || sequence !== catalogSequence.current) return
    setCapabilities(next); setCatalogs(loaded.catalogs); setCatalogErrors(loaded.errors)
  }, [])
  useEffect(() => {
    if (!session || session.isDeleted()) return
    load().catch(reason => { if (mounted.current) setError(canvasBillingError(reason)) })
  }, [session, load])
  useEffect(() => {
    if (!session || session.isDeleted()) return
    refresh().catch(reason => { if (mounted.current) setError(canvasBillingError(reason)) })
  }, [session, refresh])
  useEffect(() => {
    if (!session) return
    let stopped = false, timer
    const poll = async () => {
      if (stopped || session.isDeleted()) return
      if (polling.current) { timer = setTimeout(poll, 1500); return }
      polling.current = true
      for (const task of taskRef.current.filter(item => item.shouldPoll === true && item.status !== 6 && Date.now() >= (nextPoll.current.get(String(item.taskId)) || 0))) {
        if (stopped) break
        try { const next = await detail(task.canvasId, task.taskId); if (!stopped) put(next) }
        catch (reason) { nextPoll.current.set(String(task.taskId), Date.now() + Math.max(globalThis.document?.hidden ? 15000 : 2500, reason.retryAfterMs || task.retryAfterMs || 0)); if (!stopped) setError(canvasBillingError(reason)) }
      }
      polling.current = false
      const due = taskRef.current.filter(task => task.shouldPoll && task.status !== 6).map(task => (nextPoll.current.get(String(task.taskId)) || Date.now()) - Date.now())
      const delay = Math.max(globalThis.document?.hidden ? 15000 : 1500, due.length ? Math.min(...due) : capabilities?.retryAfterMs || 2500)
      if (!stopped) timer = setTimeout(poll, delay)
    }
    timer = setTimeout(poll, Math.max(1500, capabilities?.retryAfterMs || 2500))
    return () => { stopped = true; clearTimeout(timer) }
  }, [session, capabilities, put, detail])
  /** Quote original immutable input again for retry; always omit reservation from create/retry. */
  const submit = async (estimate, original) => {
    if (estimate.operation === "videoAnalyze") session.assertMediaWritable()
    const quote = actualBillingQuote(await CanvasAnalysis.estimate(estimate), estimate.canvasId, estimate.revisionNo)
    if (!quote.inputHash || ['nodeId', 'sourceNodeId', 'operation', 'modelId'].some(field => quote[field] !== estimate[field]) || (original && quote.inputHash !== original.inputHash)) throw new Error('检查回执与分析输入不一致，请重新检查来源')
    setQuotes(previous => ({ ...previous, [estimate.nodeId]: quote }))
    const body = { canvasId: estimate.canvasId, quoteId: quote.quoteId, clientRequestId: canvasRequestId('analysis'), ...(original ? { taskId: original.taskId } : {}) }
    put(await submitAnalysis(session, { kind: original ? 'retry' : 'create', body, estimate, inputHash: quote.inputHash }))
  }
  const execute = (nodeId, operation) => run(async () => {
    assertReady()
    if (session.read('analysis:submission')) throw new Error('请先找回上次分析提交')
    if (taskRef.current.some(task => task.nodeId === nodeId && [1, 2, 6].includes(task.status))) throw new Error('此节点有执行中或待核查任务，请先查看原任务')
    if (operation === 'framePromptGenerate') {
      const normalized = normalizeAnalysisFrames(snapshotRef.current, nodeId)
      snapshotRef.current = normalized; setNodes(normalized.nodes)
    }
    const document = await save()
    await submit(analysisEstimate(document, nodeId, operation, capabilities, catalogs[operation] || []))
  })
  /** Apply explicitly, with historical-input consent and a second edit check after all awaits. */
  const apply = task => run(async () => {
    assertReady()
    if (String(task.canvasId) !== String(session.document.canvasId)) throw new Error('结果不属于当前画布')
    const before = snapshotRef.current, expected = JSON.stringify(before), revision = session.document.revisionNo
    const current = await detail(task.canvasId, task.taskId)
    if (String(current.canvasId) !== String(task.canvasId) || current.nodeId !== task.nodeId || current.sourceNodeId !== task.sourceNodeId || current.inputHash !== task.inputHash || String(current.taskId) !== String(task.taskId)) throw new Error('任务与原分析输入不一致')
    const nextNodes = applyAnalysisResult(before.nodes, current)
    const document = await StudioCanvases.detail(current.canvasId, current.revisionNo)
    const prepared = await session.prepare(before)
    const historical = revision !== current.revisionNo || analysisFingerprint(prepared, current) !== analysisFingerprint(document, current)
    if (historical && !await confirm('应用历史分析结果', `当前节点、来源、连线或画布版本已变化。这份结果来自版本 v${current.revisionNo}，应用后将替换当前节点对应的分析结果，保留当前来源素材。是否使用这份历史结果？`)) return false
    assertReady()
    if (JSON.stringify(snapshotRef.current) !== expected || session.document.revisionNo !== revision) throw new Error('检查期间画布已变化，请重新查看结果后应用')
    saveToUndoStack?.(); snapshotRef.current = { ...before, nodes: nextNodes }; setNodes(nextNodes)
    await save()
    return true
  })
  const importStoryboard = (task, targetId, language) => run(async () => {
    assertReady()
    if (String(task.canvasId) !== String(session.document.canvasId)) throw new Error('结果不属于当前画布')
    const before = snapshotRef.current, expected = JSON.stringify(before), revision = session.document.revisionNo
    const source = before.nodes.find(node => node.id === task.nodeId)
    if (source?.type !== 'video-analyze') throw new Error('原分析节点已删除')
    const target = targetId == null ? null : before.nodes.find(node => node.id === targetId)
    if (targetId != null && target?.type !== 'storyboard-node') throw new Error('目标分镜已删除')
    // Copied results are owned document data; their task ID is provenance, never a copy task lookup.
    const current = task.savedResult ? { ...task, result: source.settings?.analysisResultData } : await detail(task.canvasId, task.taskId)
    if (String(current.canvasId) !== String(task.canvasId) || String(current.taskId) !== String(task.taskId) || current.nodeId !== task.nodeId || current.operation !== task.operation) throw new Error('分析任务与结果不一致')
    const assets = new Map()
    for (const scene of current.result?.scenes || []) for (const frame of scene.keyframes || []) assets.set(String(frame.assetId), 'pending')
    analysisStoryboardShots(current, language, assets)
    if (!await confirm(target ? '导入分析结果到分镜' : '从分析结果新建分镜', target ? '将以这份分析结果替换目标分镜的全部镜头，保留关键帧来源；现有镜头编辑会被替换。' : '将使用这份分析结果创建分镜，按场景起止时间设置时长，并关联关键帧素材。')) return false
    for (const assetId of assets.keys()) assets.set(assetId, await session.output({ canvasId: current.canvasId, assetId }))
    const shots = analysisStoryboardShots(current, language, assets)
    const next = target
      ? { ...target, settings: { ...target.settings, shots, tableData: undefined, tableMarkdown: '', isGenerating: false, errorMsg: '' } }
      : { id: canvasRequestId('storyboard'), type: 'storyboard-node', title: uiText("分析结果分镜"), x: (source.x || 0) + (source.width || 360) + 100, y: source.y || 0, width: 600, height: 500, settings: { projectTitle: '分析结果分镜', shots, mode: 'image' } }
    assertReady()
    if (JSON.stringify(snapshotRef.current) !== expected || session.document.revisionNo !== revision) throw new Error('导入期间画布已变化，请重新选择分析结果')
    saveToUndoStack?.()
    const nodes = target ? before.nodes.map(node => node.id === target.id ? next : node) : [...before.nodes, next]
    snapshotRef.current = { ...before, nodes }; setNodes(nodes)
    await save()
    return true
  })
  const retry = task => run(async () => {
    assertReady()
    if (session.read('analysis:submission')) throw new Error('请先找回上次分析提交')
    const original = await detail(task.canvasId, task.taskId)
    if (!original.actions?.retry || original.status === 6) throw new Error('当前任务不可重试，请刷新状态')
    const document = await StudioCanvases.detail(original.canvasId, original.revisionNo)
    const estimate = analysisEstimate(document, original.nodeId, original.operation, capabilities, catalogs[original.operation] || [])
    await submit(estimate, original)
  })
  const taskCard = task => <article className="canvas-analysis-task" key={task.taskId}>
    <header><strong>{uiText(analysisOperations[task.operation] || '') || task.operation}</strong><Tag>{uiText(executionStatus[task.status] || '')}</Tag></header>
    <small>{uiText("节点") + " "}{task.nodeId} · v{task.revisionNo} · {uiText(billingLabels[task.billingState] || '') || task.billingState}{task.billingState === 'reserved' && <> {uiText("· 预留") + " "}{credits(task.reservedCredits)}</>} {uiText("· 实际") + " "}{credits(task.actualCredits)} {uiText("积分")}</small>
    {(task.error || task.errorCode) && <Alert type="warning" message={canvasBillingError(task)} />}
    {task.status === 6 && <Alert type="info" message={uiText("结果待核查，已停止自动重发。请查询原任务。")} />}
    {task.status === 3 && <CanvasAnalysisResult task={task} session={session} />}
    {task.actions?.cancel && <small>{uiText("取消后将停止后续处理；已经调用模型的费用仍按实际结算。")}</small>}
    <CanvasAnalysisStoryboardActions task={task} analysis={{ importStoryboard, busy }} snapshotRef={snapshotRef} />
    <Space wrap><Button size="small" disabled={busy} onClick={() => run(async () => put(await detail(task.canvasId, task.taskId)))}>{uiText("刷新状态")}</Button>
      {task.status === 3 && task.result && <Button type="primary" size="small" disabled={busy} onClick={() => apply(task)}>{uiText("应用到节点")}</Button>}
      {task.actions?.cancel && <Button size="small" disabled={busy || task.cancelRequested} onClick={() => run(async () => put(await CanvasAnalysis.cancel(task.canvasId, task.taskId)))}>{uiText("取消")}</Button>}
      {task.actions?.retry && task.status !== 6 && <Button size="small" disabled={busy} onClick={() => retry(task)}>{uiText("按原输入重试")}</Button>}
      {task.actions?.retrySettlement && <Button size="small" disabled={busy} onClick={() => run(async () => put(await CanvasAnalysis.retrySettlement(task.canvasId, task.taskId)))}>{uiText("重试结算")}</Button>}
    </Space>
  </article>
  const recovery = session?.read('analysis:submission') && <Button disabled={busy} onClick={() => run(async () => put(await submitAnalysis(session, null, true)))}>{uiText("找回上次提交")}</Button>
  const panel = <div className="canvas-analysis-panel"><Space wrap><Button disabled={busy} onClick={() => run(async () => { await load(); await refresh() })}>{uiText("刷新能力与任务")}</Button>{recovery}</Space>{error && <Alert type="warning" message={error} />}{!tasks.length && <Empty description={uiText("暂无分析任务")} />}{tasks.map(taskCard)}<Pagination current={page} pageSize={20} total={total} onChange={setPage} /></div>
  /** Controlled node settings are saved by the same snapshot coordinator as the rest of the canvas. */
  const renderNode = node => {
    const operation = node.settings?.analysisOperation || 'framePromptGenerate'
    const storedResult = node.settings?.analysisResultData
    const storedTask = { canvasId: session.document.canvasId, nodeId: node.id, taskId: node.settings?.analysisProvenance?.at(-1)?.taskId, operation: storedResult?.operation || operation, status: 3, result: storedResult, savedResult: true }
    const status = capabilities?.operationStatuses?.find(item => item.operation === operation)
    const models = (catalogs[operation] || []).filter(model => model.available === true && (!model.supportedOperations || model.supportedOperations.includes(operation)) && (!status?.modelIds?.length || status.modelIds.includes(model.modelId)))
    const validModel = models.some(model => model.modelId === node.settings?.analysisModelId)
    const update = patch => setNodes(previous => previous.map(item => item.id !== node.id ? item : { ...item, settings: { ...item.settings, ...patch } }))
    let source, sourceError
    try { source = analysisSource(snapshotRef.current, node.id) } catch (reason) { sourceError = reason.message }
    return <div className="canvas-analysis-node canvas-node__form pointer-events-auto nodrag nowheel" data-canvas-interactive onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      <header><strong>{uiText("云端媒体分析")}</strong><Button size="small" disabled={busy} onClick={() => run(load)}>{uiText("刷新能力")}</Button></header>
      <Select aria-label={uiText("分析操作")} value={operation} onChange={value => update({ analysisOperation: value, analysisModelId: undefined })} options={Object.entries(analysisOperations).map(([value, label]) => ({ value, label: uiText("{0}{1}", uiText(label), capabilities?.operationStatuses?.find(item => item.operation === value)?.available === false ? uiText("（暂不可用）") : '') }))} />
      <Select aria-label={uiText("分析模型")} placeholder={uiText("选择分析模型")} value={validModel ? node.settings.analysisModelId : undefined} onChange={value => update({ analysisModelId: value })} options={models.map(model => ({ value: model.modelId, label: `${model.name}${model.supplierName ? ` · ${model.supplierName}` : ''}` }))} />
      {status?.available !== true && <Alert type="info" message={status?.reason || capabilities?.analysisUnavailableReason || uiText("能力尚未加载，请刷新重试")} />}
      {catalogErrors[operation] && <Alert type="warning" message={catalogErrors[operation]} />}
      {status?.available === true && !models.length && !catalogErrors[operation] && <Alert type="info" message={uiText("当前操作没有可用分析模型，请刷新目录或联系管理员配置")} />}
      {sourceError ? <Alert type="info" message={sourceError} /> : <div className="canvas-analysis-source"><small>{uiText("来源：")}{source.title || source.id}</small>{source.content && (analysisSourceKind(source) === 'image' ? <img src={source.content} alt={uiText("分析来源")} /> : analysisSourceKind(source) === 'audio' ? <audio controls src={source.content} /> : <video controls preload="metadata" src={source.content} />)}<small>{uiText("已选关键帧") + " "}{source.type === 'input-image' ? 1 : source.selectedKeyframes?.length || 0} {uiText("个")}</small></div>}
      {operation === 'framePromptGenerate' ? <label>{uiText("场景分组（秒）")}<InputNumber min={0.1} value={node.settings?.analysisSegmentSeconds ?? 4} onChange={value => update({ analysisSegmentSeconds: value })} /><small>{uiText("使用来源节点已选关键帧；分组秒数不会自动抽帧。")}</small></label> : <Space wrap><label>{uiText("开始秒")}<InputNumber min={0} placeholder={uiText("完整媒体")} value={node.settings?.analysisStartSeconds} onChange={value => update({ analysisStartSeconds: value })} /></label><label>{uiText("结束秒")}<InputNumber min={0} placeholder={uiText("完整媒体")} value={node.settings?.analysisEndSeconds} onChange={value => update({ analysisEndSeconds: value })} /></label></Space>}
      <small>{operation === 'videoAnalyze' ? uiText("分析画面、镜头与氛围；需要语音文本时请单独使用音轨转写。") : uiText("完成后按实际用量结算，结果应用前可预览。")}</small>
      {quotes[node.id]?.unlimited === true && <small>{uiText("上次检查：不限额，实际用量照常记录。")}</small>}
      {error && <Alert type="warning" message={error} />}{recovery}
      <Button type="primary" loading={busy} disabled={status?.available !== true || !validModel || !!sourceError || !!session?.read('analysis:submission') || tasks.some(task => task.nodeId === node.id && [1, 2, 6].includes(task.status))} onClick={() => execute(node.id, operation)}>{uiText("开始")}{uiText(analysisOperations[operation] || '')}</Button>
      {tasks.filter(task => task.nodeId === node.id).slice(0, 1).map(taskCard)}
      {storedResult && <><details><summary>{uiText("已保存的分析结果")}</summary><CanvasAnalysisResult session={session} task={storedTask} /></details><CanvasAnalysisStoryboardActions task={storedTask} analysis={{ importStoryboard, busy }} snapshotRef={snapshotRef} /></>}
    </div>
  }
  return { execute, renderNode, panel, capabilities, catalogs, error, busy, apply, importStoryboard, put, build: analysisEstimate, normalizeFrames: normalizeAnalysisFrames }
}
