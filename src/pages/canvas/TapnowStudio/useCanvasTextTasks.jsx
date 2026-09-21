import { uiText, useUiLanguage } from '../../../i18n/uiText'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Space, Tag } from 'antd'
import { StudioCanvases, canvasPollDelay, canvasRequestId } from '../../../services/studioCanvases'
import { applyTextResult, prepareTextSnapshot, textInputFingerprint, textModelId, textOperations } from './canvasTextTasks'

export function useCanvasTextTasks({ session, enabled, unavailableReason, models, snapshotRef, setNodes, save, report, confirm, assertReady, onOpen }) {
  useUiLanguage()

  const [tasks, setTasks] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState({})
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const active = useRef(new Map())
  const mounted = useRef(true)
  const request = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const put = useCallback((task, insert = true) => {
    if (!task || !mounted.current) return
    if (task.shouldPoll && task.status !== 6) active.current.set(String(task.taskId), task)
    else active.current.delete(String(task.taskId))
    setTasks(previous => insert ? [task, ...previous.filter(item => String(item.taskId) !== String(task.taskId))] : previous.map(item => String(item.taskId) === String(task.taskId) ? task : item))
  }, [])
  const refresh = useCallback(async () => {
    if (!session || !enabled || session.isDeleted()) return
    const id = ++request.current
    const result = await StudioCanvases.textList(session.document.canvasId, page, filter)
    if (!mounted.current || id !== request.current) return
    setTasks(result.items); setTotal(result.total)
    result.items.forEach(task => { if (task.shouldPoll && task.status !== 6) active.current.set(String(task.taskId), task); else active.current.delete(String(task.taskId)) })
  }, [session, enabled, page, filter])
  useEffect(() => { void refresh().catch(report) }, [refresh, report])
  useEffect(() => {
    if (!session || !enabled) return
    let stopped = false, timer
    const poll = async () => {
      if (session.isDeleted()) return
      let delay = canvasPollDelay(...active.current.values())
      for (const task of active.current.values()) {
        if (stopped) return
        try { const updated = await StudioCanvases.textDetail(session.document.canvasId, task.taskId); if (!stopped) { put(updated, false); delay = Math.max(delay, canvasPollDelay(updated)) } }
        catch (error) { delay = Math.max(delay, canvasPollDelay(error)); if (!stopped) report(error); break }
      }
      if (!stopped) timer = setTimeout(poll, delay)
    }
    timer = setTimeout(poll, 2500)
    return () => { stopped = true; clearTimeout(timer) }
  }, [session, enabled, put, report])
  const run = async fn => {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { session?.assertWritable(); await fn() } catch (error) { report(error) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  const acceptQuote = async (quote, retryTask) => {
    if (String(quote.canvasId) !== String(session.document.canvasId)) throw new Error('报价不属于当前画布')
    if (retryTask && ['nodeId', 'revisionNo', 'operation', 'modelId', 'inputHash'].some(key => quote[key] !== retryTask[key])) throw new Error('重试报价与原任务不一致')
    if (!Number.isFinite(quote.reservedCredits) || quote.reservedCredits < 0 || !quote.quoteId || !quote.inputHash) throw new Error('文本报价不完整，请重新报价')
    if (!quote.sufficient && !quote.unlimited) throw new Error('积分不足，无法预留本次文本任务费用')
    if (!await confirm(uiText(retryTask ? '重试原输入的文本任务' : '确认文本任务'), <div><p>{uiText(textOperations[quote.operation] || '')} {uiText("· 已保存版本 v")}{quote.revisionNo}</p><p>{uiText("本次预留积分：")}<strong>{quote.reservedCredits}</strong>{uiText("；实际费用：待核算。")}</p><p>{uiText("预留上限不代表实际费用封顶。报价有效期至") + " "}{quote.expiresAt}{uiText("，过期或价格变化后需要重新报价。")}</p></div>)) return
    const body = { canvasId: quote.canvasId, quoteId: quote.quoteId, clientRequestId: canvasRequestId('text'), maxReservedCredits: quote.reservedCredits, ...(retryTask ? { taskId: retryTask.taskId } : {}) }
    const task = await session.submitText(body, quote, retryTask ? 'retry' : 'create')
    put(task); onOpen()
  }
  const execute = (nodeId, operation, settingsPatch = {}) => run(async () => {
    if (!enabled) throw new Error('服务端尚未开放文本任务，请检查 V3 文本能力')
    assertReady()
    if (session.pendingText) { onOpen(); throw new Error('请先找回上次文本提交') }
    const prepared = prepareTextSnapshot(snapshotRef.current, nodeId, operation, models, settingsPatch)
    snapshotRef.current = prepared.snapshot; setNodes(prepared.snapshot.nodes)
    const saved = await save()
    const quote = await StudioCanvases.textEstimate({ canvasId: saved.canvasId, revisionNo: saved.revisionNo, nodeId, operation, modelId: prepared.modelId })
    if (String(quote.canvasId) !== String(saved.canvasId) || quote.nodeId !== nodeId || quote.revisionNo !== saved.revisionNo || quote.operation !== operation || quote.modelId !== prepared.modelId) throw new Error('报价与保存版本不一致')
    await acceptQuote(quote)
  })
  const apply = task => run(async () => {
    assertReady()
    const current = await StudioCanvases.textDetail(session.document.canvasId, task.taskId)
    if (String(current.canvasId) !== String(session.document.canvasId) || current.nodeId !== task.nodeId || current.revisionNo !== task.revisionNo || current.inputHash !== task.inputHash) throw new Error('任务输入身份已改变，请刷新任务列表')
    const proof = session.read('text-proof:' + task.taskId)
    if (proof && (proof.inputHash !== current.inputHash || proof.revisionNo !== current.revisionNo || proof.nodeId !== current.nodeId)) throw new Error('结果与原报价不一致')
    const frozen = await StudioCanvases.detail(session.document.canvasId, current.revisionNo)
    if (frozen.revisionNo !== current.revisionNo || String(frozen.canvasId) !== String(current.canvasId)) throw new Error('无法确认任务的冻结版本')
    const frozenNode = frozen.project.nodes.find(n => n.id === current.nodeId)
    const binding = frozen.modelBindings?.find(b => b.nodeId === current.nodeId && ['/settings/textModelId', '/settings/chatModel'].includes(b.fieldPath))
    if (!frozenNode || Number(binding?.modelId || textModelId(frozenNode.settings?.textModelId ?? frozenNode.settings?.chatModel)) !== current.modelId) throw new Error('任务模型与冻结版本不一致')
    const node = snapshotRef.current.nodes.find(n => n.id === current.nodeId)
    if (!node) throw new Error('原节点已删除，结果仍保留在文本历史中')
    const expectedNode = JSON.stringify(node)
    const expectedInput = textInputFingerprint(snapshotRef.current, node.id, current.operation)
    const changed = expectedInput !== textInputFingerprint(frozen.project, node.id, current.operation)
    const mode = node.settings?.mode === 'video' ? 3 : 2
    const available = session.models.filter(model => model.type === mode && (!model.supportedNodeTypes?.length || model.supportedNodeTypes.includes('storyboard-node')))
    const model = available.find(item => item.defaultModel) || available[0]
    const shotDefaults = model ? { model: 'studio-' + model.id, ratio: model.imageCapabilities?.aspectRatios?.[0] || '16:9', duration: mode === 3 ? (model.videoCapabilities?.minDurationSeconds || 1) + 's' : undefined, resolution: mode === 2 ? (model.imageCapabilities?.resolutions?.[0] || 1) + 'K' : model.videoCapabilities?.resolutions?.[0] || '720p' } : {}
    const nextNode = applyTextResult(node, current, shotDefaults)
    if (!await confirm(changed ? '节点输入已修改，仍要应用旧结果？' : '应用文本结果', `结果来自 v${current.revisionNo}。${changed ? '当前输入与任务冻结输入不同，应用会替换对应的提示词或分析结果。' : '确认后将更新对应节点并保存新版本。'}`)) return
    const latest = snapshotRef.current.nodes.find(n => n.id === node.id)
    if (JSON.stringify(latest) !== expectedNode || textInputFingerprint(snapshotRef.current, node.id, current.operation) !== expectedInput) throw new Error('确认期间节点发生变化，请重新确认应用')
    const next = { ...snapshotRef.current, nodes: snapshotRef.current.nodes.map(n => n.id === node.id ? nextNode : n) }
    snapshotRef.current = next; setNodes(next.nodes)
    await save()
  })
  const labels = { get 1() { return uiText("排队") }, get 2() { return uiText("执行中") }, get 3() { return uiText("结果可用") }, 4: '失败', get 5() { return uiText("调用前取消") }, get 6() { return uiText("待核查") } }
  const panel = !enabled ? <Alert type="info" message={unavailableReason || uiText("服务端尚未开放文本任务")} /> : <div className="canvas-history-panel">
    <Space wrap><Button disabled={busy} onClick={() => run(refresh)}>{uiText("刷新文本任务")}</Button>{session?.pendingText && <Button disabled={busy} onClick={() => run(async () => put(await session.recoverText()))}>{uiText("找回文本提交")}</Button>}<span>{uiText("共") + " "}{total} {uiText("个任务")}</span></Space>
    <Space wrap style={{ margin: '12px 0' }}><input aria-label={uiText("文本任务节点 ID")} placeholder={uiText("节点 ID")} value={filter.nodeId || ''} onChange={e => { setFilter({ ...filter, nodeId: e.target.value || undefined }); setPage(1) }} /><select aria-label={uiText("文本任务状态")} value={filter.status || ''} onChange={e => { setFilter({ ...filter, status: Number(e.target.value) || undefined }); setPage(1) }}><option value="">{uiText("全部状态")}</option>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Space>
    {tasks.map(task => <section className="canvas-history-card" key={task.taskId}>
      <strong>{uiText(textOperations[task.operation] || '')}</strong> <Tag>{labels[task.status]}</Tag><p>{task.nodeId} · v{task.revisionNo} {uiText("· 任务") + " "}{task.taskId}</p>
      <p>{uiText("预留") + " "}{task.reservedCredits ?? uiText("未知")} {uiText("积分 · 实际") + " "}{task.actualCredits ?? uiText("待核算")}{task.billingState === 'pendingReview' ? uiText(" · 费用待核查") : ''}</p>
      {task.usage && <p>{uiText("输入") + " "}{task.usage.inputTokens ?? uiText("未知")} {uiText("/ 输出") + " "}{task.usage.outputTokens ?? uiText("未知")} {uiText("tokens · 请求") + " "}{task.usage.requestCount ?? uiText("未知")} {uiText("次")}</p>}
      {task.error && <Alert type="warning" message={task.error} />}
      {task.status === 6 && <p>{uiText("已停止自动重试，请等待核查。")}</p>}
      {task.result && <details><summary>{uiText("预览结构化结果")}</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto' }}>{JSON.stringify(task.result, null, 2)}</pre></details>}
      <Space wrap>
        {task.status === 3 && task.result && <Button disabled={busy} onClick={() => apply(task)}>{uiText("应用并保存")}</Button>}
        {task.actions?.cancel && <Button disabled={busy || task.cancelRequested} onClick={() => run(async () => put(await StudioCanvases.textCancel(session.document.canvasId, task.taskId)))}>{uiText("取消")}</Button>}
        {task.actions?.retrySettlement && <Button disabled={busy} onClick={() => run(async () => put(await StudioCanvases.textRetrySettlement(session.document.canvasId, task.taskId)))}>{uiText("重试结算")}</Button>}
        {task.actions?.retry && <Button disabled={busy} onClick={() => run(async () => {
          assertReady()
          if (session.pendingText) throw new Error('请先找回上次文本提交')
          const quote = await StudioCanvases.textEstimate({ canvasId: task.canvasId, revisionNo: task.revisionNo, nodeId: task.nodeId, operation: task.operation, modelId: task.modelId })
          if (quote.inputHash !== task.inputHash) throw new Error('重试报价输入与原任务不同，已停止提交')
          await acceptQuote(quote, task)
        })}>{uiText("重新报价重试")}</Button>}
      </Space>
    </section>)}
    {!tasks.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={uiText("暂无文本任务")} />}
    <Space><Button disabled={busy || page === 1} onClick={() => setPage(page - 1)}>{uiText("上一页")}</Button><span>{uiText("第") + " "}{page} {uiText("页")}</span><Button disabled={busy || page * 20 >= total} onClick={() => setPage(page + 1)}>{uiText("下一页")}</Button></Space>
  </div>
  return { execute, panel }
}
