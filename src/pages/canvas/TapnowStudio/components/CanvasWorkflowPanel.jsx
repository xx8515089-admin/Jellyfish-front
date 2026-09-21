import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Empty, InputNumber, Modal, Select, Space, Tag } from 'antd'
import { CanvasAnalysis } from '../../../../services/studioCanvasAnalysis'
import { CanvasAnalysisResult, CanvasAnalysisStoryboardActions } from '../useCanvasAnalysis'
import { analysisOperations } from '../canvasAnalysis'
import { billingLabels, canvasBillingError } from '../canvasActualBilling'
import { StudioCanvases, canvasPollDelay } from '../../../../services/studioCanvases'
import { textOperations } from '../canvasTextTasks'
import { applyWorkflowTextResult, credits, createV4Body, nodeOperations, quoteBudget, submitCanvasV4, workflowPlan, workflowPolling, workflowStatus } from '../canvasExecution'

/** Plan explicit text operations, track dependency runs and apply results only on user request. */
export default function CanvasWorkflowPanel({ session, enabled, models, snapshotRef, setNodes, save, assertReady, confirm, analysis, saveToUndoStack }) {
  useUiLanguage()

  const canvasId = session.document.canvasId
  const [capabilities, setCapabilities] = useState(null)
  const [targets, setTargets] = useState([])
  const [choices, setChoices] = useState({})
  const [failurePolicy, setFailurePolicy] = useState('stop')
  const [budget, setBudget] = useState(null)
  const [runs, setRuns] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const lock = useRef(false), mounted = useRef(true), request = useRef(0), active = useRef(new Map())
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++ } }, [])
  const run = async fn => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { session.assertWritable(); await fn() } catch (reason) { if (mounted.current) setError(canvasBillingError(reason)) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  const put = useCallback(workflow => {
    if (!mounted.current || !workflow) return
    if (workflowPolling(workflow)) active.current.set(String(workflow.workflowId), workflow)
    else active.current.delete(String(workflow.workflowId))
    setRuns(previous => previous.map(item => String(item.workflowId) === String(workflow.workflowId) ? workflow : item))
  }, [])
  // Read full details even for terminal runs so late billing evidence can be displayed.
  const refresh = useCallback(async () => {
    if (!enabled || session.isDeleted()) return
    const sequence = ++request.current
    const caps = await StudioCanvases.workflowCapabilities()
    if (!mounted.current || sequence !== request.current) return
    setCapabilities(caps)
    if (caps.storageReady === false || caps.workflowReady === false) return
    const list = await StudioCanvases.workflows(canvasId, page)
    const details = await Promise.all(list.items.map(item => StudioCanvases.workflowDetail(canvasId, item.workflowId)))
    if (!mounted.current || sequence !== request.current) return
    setRuns(details); setTotal(list.total)
    details.forEach(item => { if (workflowPolling(item)) active.current.set(String(item.workflowId), item); else active.current.delete(String(item.workflowId)) })
  }, [enabled, session, canvasId, page])
  useEffect(() => { void refresh().catch(reason => { if (mounted.current) setError(canvasBillingError(reason)) }) }, [refresh])
  useEffect(() => {
    if (!enabled) return
    let stopped = false, timer
    const poll = async () => {
      if (session.isDeleted()) return
      let delay = canvasPollDelay(...active.current.values())
      for (const item of active.current.values()) {
        if (stopped) return
        try { const detail = await StudioCanvases.workflowDetail(canvasId, item.workflowId); if (!stopped) { put(detail); delay = Math.max(delay, canvasPollDelay(detail)) } }
        catch (reason) { delay = Math.max(delay, canvasPollDelay(reason)); if (!stopped) setError(reason.message); break }
      }
      if (!stopped) timer = setTimeout(poll, Math.max(delay, canvasPollDelay(capabilities)))
    }
    timer = setTimeout(poll, 3000)
    return () => { stopped = true; clearTimeout(timer) }
  }, [enabled, session, canvasId, capabilities, put])
  const ready = enabled && capabilities && capabilities.storageReady !== false && capabilities.workflowReady !== false
  const pending = session.read('v4:workflow')
  // Freeze the graph before quoting; consent applies only to that saved plan and budget.
  const start = () => run(async () => {
    assertReady()
    if (!ready) throw new Error('工作流能力尚未就绪')
    if (pending) throw new Error('请先找回原工作流提交')
    if (!Number.isFinite(budget) || budget < 0) throw new Error('请填写累计预留积分上限')
    for (const node of snapshotRef.current.nodes.filter(item => item.type === 'video-analyze' && choices[item.id] === 'framePromptGenerate')) snapshotRef.current = analysis.normalizeFrames(snapshotRef.current, node.id)
    setNodes(snapshotRef.current.nodes)
    const saved = await save()
    const plan = workflowPlan(saved, targets, choices, capabilities, models, failurePolicy, analysis)
    if (plan.steps.some(step => ['videoAnalyze', 'imageGenerate', 'videoGenerate'].includes(step.operation))) session.assertMediaWritable()
    const quote = await StudioCanvases.workflowEstimate(plan)
    const estimated = quoteBudget(quote, canvasId, saved.revisionNo)
    if (budget < estimated) throw new Error(`累计预留上限低于本次报价 ${estimated} 积分`)
    if (!await confirm(uiText('确认依赖工作流'), <div><p>{uiText("使用版本 v")}{saved.revisionNo}{uiText("，共") + " "}{plan.steps.length} {uiText("步。预计预留") + " "}{estimated} {uiText("积分，累计预留上限") + " "}{budget} {uiText("积分。")}</p><p>{uiText("分析步骤不预留积分，执行时检查余额并按实际用量结算；其他步骤沿用预留规则。输出保存在本次运行中，由你选择应用到画布。")}</p><p>{plan.steps.map(step => `${step.nodeId}：${uiText(textOperations[step.operation] || analysisOperations[step.operation])}`).join(' → ')}</p></div>)) return
    quoteBudget(quote, canvasId, saved.revisionNo)
    const created = await submitCanvasV4(session, 'workflow', createV4Body(canvasId, quote.quoteId, budget, 'workflow'))
    put(created); setRuns(previous => [created, ...previous.filter(item => String(item.workflowId) !== String(created.workflowId))]); await refresh()
  })
  const inspect = (workflow, node) => run(async () => {
    if (!['text', 'analysis'].includes(node.taskFamily)) throw new Error('此任务族请在对应任务历史中查看和处理')
    const task = await (node.taskFamily === 'analysis' ? CanvasAnalysis.detail : StudioCanvases.textDetail)(canvasId, node.taskId)
    if (String(task.canvasId) !== String(canvasId) || task.nodeId !== node.nodeId || String(task.taskId) !== String(node.taskId) || (node.operation && task.operation !== node.operation)) throw new Error('子任务与工作流节点不一致')
    setPreview({ workflow, node, task })
  })
  // A workflow owns a private graph; applying an output is a separate guarded document edit.
  const apply = () => run(async () => {
    assertReady()
    const task = preview.task
    if (preview.node?.taskFamily === 'analysis') { if (await analysis.apply(task)) setPreview(null); return }
    const node = snapshotRef.current.nodes.find(item => item.id === task.nodeId)
    if (!node) throw new Error('原节点已删除，结果仍保留在运行历史中')
    const expected = JSON.stringify(snapshotRef.current), revision = session.document.revisionNo
    const document = await session.hydrate(await StudioCanvases.detail(canvasId, preview.workflow.revisionNo))
    const current = await StudioCanvases.textDetail(canvasId, task.taskId)
    const next = await applyWorkflowTextResult(node, current, document, preview.workflow, StudioCanvases.textDetail)
    if (!await confirm('应用工作流结果', `将运行 ${preview.workflow.workflowId} 的这份结果应用到节点 ${node.title || node.id}，替换对应文本或结构化结果。当前画布可能已不同于运行版本 v${preview.workflow.revisionNo}；分镜汇总会使用本次上游的完整镜头。`)) return
    assertReady()
    if (JSON.stringify(snapshotRef.current) !== expected || session.document.revisionNo !== revision) throw new Error('检查或确认期间节点已变化，请重新查看结果')
    saveToUndoStack?.()
    snapshotRef.current = { ...snapshotRef.current, nodes: snapshotRef.current.nodes.map(item => item.id === task.nodeId ? next : item) }
    setNodes(snapshotRef.current.nodes); await save(); setPreview(null)
  })
  if (!enabled) return <Alert type="info" message={uiText("服务端尚未开放依赖工作流")} />
  return <div className="canvas-history-panel canvas-v4-workflow">
    {error && <Alert type="error" showIcon message={error} closable onClose={() => setError('')} />}
    <Space wrap><Button disabled={busy} onClick={() => run(refresh)}>{uiText("刷新工作流")}</Button><span>{uiText("共") + " "}{total} {uiText("次运行")}</span></Space>
    {pending && <Alert type="warning" message={uiText("存在待确认的工作流提交")} action={<Button disabled={busy} onClick={() => run(async () => { const found = await submitCanvasV4(session, 'workflow', null, true); put(found); await refresh() })}>{uiText("找回提交")}</Button>} />}
    <details open className="canvas-v4-workflow__plan"><summary>{uiText("创建依赖工作流")}</summary>
      <p>{uiText("选择目标并指定操作。小说、文本、角色/场景描述节点不选操作时只读取已保存正文；选择“提取角色和场景”后输出数组，需要先转换才能继续文字处理。文字步骤只使用默认端口，分镜汇总只能连接一个执行拆分或汇总的分镜节点。")}</p>
      {!ready && <Alert type="info" message={uiText("工作流能力尚未就绪")} />}
      {snapshotRef.current.nodes.filter(node => nodeOperations(node).length).map(node => <div className="canvas-v4-workflow__node" key={node.id}>
        <Checkbox disabled={busy || !ready} checked={targets.includes(node.id)} onChange={event => setTargets(previous => event.target.checked ? [...previous, node.id] : previous.filter(id => id !== node.id))}>{node.title || node.id}</Checkbox>
        <Select aria-label={uiText("节点 {0} 的工作流操作", node.title || node.id)} placeholder={['novel-input', 'character-description', 'scene-description'].includes(node.type) ? uiText("不执行，读取已保存正文") : uiText("请选择执行操作")} disabled={busy || !ready} value={choices[node.id]} allowClear options={nodeOperations(node).filter(operation => capabilities?.operations?.includes(operation)).map(operation => ({ value: operation, label: uiText(textOperations[operation] || '') || uiText(analysisOperations[operation] || '') }))} onChange={operation => setChoices(previous => ({ ...previous, [node.id]: operation }))} />
      </div>)}
      {!snapshotRef.current.nodes.some(node => nodeOperations(node).length) && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={uiText("先添加描述、小说、提取或分镜节点，并选择文本模型")} />}
      <Select aria-label={uiText("工作流失败策略")} value={failurePolicy} disabled={busy} options={[{ value: 'stop', label: uiText("失败后停止派发") }, { value: 'continueIndependent', label: uiText("继续独立分支") }]} onChange={setFailurePolicy} />
      <label>{uiText("累计预留积分上限") + " "}<InputNumber aria-label={uiText("工作流累计预留积分上限")} min={0} value={budget} disabled={busy} onChange={setBudget} /></label>
      <Button type="primary" loading={busy} disabled={!ready || !!pending || !targets.length || budget == null} onClick={start}>{uiText("报价并运行")}</Button>
      <small>{uiText("普通图片/视频与逐镜头生成请使用生成或批次。支持后端已开放的文本与分析操作；分析模型请先在节点中选择。")}</small>
    </details>
    {runs.map(workflow => <section className="canvas-history-card" key={workflow.workflowId}>
      <strong>{uiText("运行") + " "}{workflow.workflowId}</strong> <Tag>{uiText(workflowStatus[workflow.status] || '') || workflow.status}</Tag><p>{uiText("版本 v")}{workflow.revisionNo} {uiText("· 累计提交预留") + " "}{credits(workflow.submittedReservedCredits)} {uiText("· 实际") + " "}{credits(workflow.actualCredits)} {uiText("积分")}</p>
      {(workflow.error || workflow.errorCode) && <Alert type="warning" message={canvasBillingError(workflow)} />}
      {workflow.status === 'waitingReview' && <Alert type="warning" message={uiText("请先核查子任务，再恢复运行；恢复不会重新购买")} />}
      <Space wrap><Button size="small" disabled={busy} onClick={() => run(async () => put(await StudioCanvases.workflowDetail(canvasId, workflow.workflowId)))}>{uiText("刷新详情与费用")}</Button>
        {['running', 'waitingReview'].includes(workflow.status) && <Button size="small" disabled={busy} onClick={() => run(async () => { if (await confirm('取消工作流', '停止新步骤，并向在途任务发送取消意愿；已调用的任务不能保证退款。')) put(await StudioCanvases.workflowCancel(canvasId, workflow.workflowId)) })}>{uiText("取消运行")}</Button>}
        {workflow.status === 'waitingReview' && <Button size="small" disabled={busy} onClick={() => run(async () => { assertReady(); put(await StudioCanvases.workflowResume(canvasId, workflow.workflowId)) })}>{uiText("核查后恢复")}</Button>}
      </Space>
      {(workflow.nodes || []).map(node => <div className="canvas-v4-workflow__result" key={node.nodeId}><span>{node.nodeId} · {uiText(textOperations[node.operation] || '') || uiText(analysisOperations[node.operation] || '') || node.operation} · {uiText(workflowStatus[node.status] || '') || node.status}</span>{node.error && <p>{node.error}</p>}{node.taskId != null && <small>{node.taskFamily} {uiText("任务") + " "}{node.taskId}</small>}{['text', 'analysis'].includes(node.taskFamily) && node.taskId != null && <Button size="small" disabled={busy} onClick={() => inspect(workflow, node)}>{uiText("查看子任务")}</Button>}</div>)}
    </section>)}
    {!runs.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={uiText("暂无工作流运行")} />}
    <Space><Button disabled={busy || page === 1} onClick={() => setPage(page - 1)}>{uiText("上一页")}</Button><span>{uiText("第") + " "}{page} {uiText("页")}</span><Button disabled={busy || page * 20 >= total} onClick={() => setPage(page + 1)}>{uiText("下一页")}</Button></Space>
    <Modal title={uiText("工作流子任务结果")} open={!!preview} onCancel={() => setPreview(null)} footer={null}>
      {preview && <>{preview.node.taskFamily === 'analysis' && analysis.error && <Alert type="warning" message={analysis.error} />}<p>{uiText("节点") + " "}{preview.node.nodeId} · {uiText(billingLabels[preview.task.billingState] || '') || preview.task.billingState}{preview.node.taskFamily !== 'analysis' && <> {uiText("· 预留") + " "}{credits(preview.task.reservedCredits)}</>} {uiText("· 实际") + " "}{credits(preview.task.actualCredits)} {uiText("积分")}</p>{preview.node.taskFamily === 'analysis' ? <CanvasAnalysisResult task={preview.task} session={session} /> : <pre className="canvas-v4-result-json">{JSON.stringify(preview.task.result || { status: preview.task.status, error: preview.task.error }, null, 2)}</pre>}<Space wrap>
        {preview.node.taskFamily === 'analysis' && <CanvasAnalysisStoryboardActions task={preview.task} analysis={analysis} snapshotRef={snapshotRef} disabled={busy} />}
        {preview.task.status === 3 && preview.task.result && <Button type="primary" disabled={busy} onClick={apply}>{uiText("将此结果应用并保存")}</Button>}
        {preview.task.actions?.retrySettlement && <Button disabled={busy} onClick={() => run(async () => { const task = await (preview.node.taskFamily === 'analysis' ? CanvasAnalysis.retrySettlement : StudioCanvases.textRetrySettlement)(canvasId, preview.task.taskId); setPreview(previous => previous ? { ...previous, task } : null) })}>{uiText("重试结算")}</Button>}
      </Space></>}
    </Modal>
  </div>
}
