import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import { canvasPrompt } from '../canvasDialogs';
import React, { useEffect, useRef, useState } from 'react'
import { Button, Empty, Select, Space, Tag } from 'antd'
import { StudioCanvases, canvasPollDelay, canvasRequestId } from '../../../../services/studioCanvases'

const labels = { get queued() { return uiText("等待执行") }, get running() { return uiText("执行中") }, get succeeded() { return uiText("全部成功") }, get partialFailed() { return uiText("部分失败") }, failed: '失败', get cancelled() { return uiText("已取消") }, get needsReview() { return uiText("待核查") } }
export default function CanvasBatchHistoryV3({ session, onTask, report, revision }) {
  useUiLanguage()

  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState()
  const [total, setTotal] = useState(0)
  const [tick, setTick] = useState(0)
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  useEffect(() => {
    let stopped = false, timer
    const load = async () => {
      if (session.isDeleted()) return
      try {
        const result = await StudioCanvases.batches(session.document.canvasId, page, status)
        if (stopped) return
        setItems(result.items); setTotal(result.total)
        if (result.items.some(item => item.shouldPoll ?? ['queued', 'running'].includes(item.status))) timer = setTimeout(load, canvasPollDelay(...result.items))
      } catch (error) { if (!stopped) { report(error); if (![401, 403, 410].includes(error.status)) timer = setTimeout(load, canvasPollDelay(error)) } }
    }
    void load()
    return () => { stopped = true; clearTimeout(timer) }
  }, [session, page, status, tick, revision, report])
  useEffect(() => {
    if (!detail?.shouldPoll || session.isDeleted()) return
    let stopped = false
    const timer = setTimeout(async () => {
      try { const result = await StudioCanvases.batchDetail(session.document.canvasId, detail.batchId); if (!stopped) { setDetail(result); result.items?.forEach(item => onTask(item.generation)) } }
      catch (error) { if (!stopped) report(error) }
    }, canvasPollDelay(detail))
    return () => { stopped = true; clearTimeout(timer) }
  }, [session, detail, onTask, report])
  const run = async fn => { if (lock.current) return; lock.current = true; setBusy(true); try { session.assertWritable(); await fn() } catch (error) { report(error) } finally { lock.current = false; setBusy(false) } }
  const show = batch => { setDetail(batch); batch.items?.forEach(item => onTask(item.generation)); setTick(value => value + 1) }
  return <div className="canvas-history-panel">
    <Space wrap><Select aria-label={uiText("批次状态")} placeholder={uiText("全部状态")} allowClear value={status} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} onChange={value => { setStatus(value); setPage(1) }} /><Button disabled={busy} onClick={() => setTick(value => value + 1)}>{uiText("刷新批次")}</Button>{session.pendingBatch && <Button disabled={busy} onClick={() => run(async () => show(await session.recoverBatch()))}>{uiText("找回批次提交")}</Button>}</Space>
    {items.map(batch => <section className="canvas-history-card" key={batch.batchId}><strong>{uiText("批次") + " "}{batch.batchId}</strong> <Tag>{labels[batch.status] || batch.status}</Tag><p>v{batch.revisionNo} {uiText("· 共") + " "}{batch.total} {uiText("项 · 成功") + " "}{batch.succeeded} {uiText("项")}</p><p>{uiText("预留积分") + " "}{batch.reservedCredits ?? uiText("未知")} {uiText("· 实际费用待各任务结算")}</p><Button disabled={busy} onClick={() => run(async () => show(await StudioCanvases.batchDetail(session.document.canvasId, batch.batchId)))}>{uiText("查看详情")}</Button></section>)}
    {!items.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={uiText("暂无批次")} />}
    <Space><Button disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>{uiText("上一页")}</Button><span>{uiText("共") + " "}{total} {uiText("个批次 · 第") + " "}{page} {uiText("页")}</span><Button disabled={busy || page * 20 >= total} onClick={() => setPage(page + 1)}>{uiText("下一页")}</Button></Space>
    {detail && <section className="canvas-history-card"><strong>{uiText("批次") + " "}{detail.batchId} {uiText("详情")}</strong><Space wrap>
      {detail.items?.some(item => item.generation?.actions?.cancel) && <Button disabled={busy} onClick={() => run(async () => show(await StudioCanvases.batchCancel(session.document.canvasId, detail.batchId)))}>{uiText("请求取消")}</Button>}
      {detail.items?.some(item => item.generation?.actions?.retry) && <Button disabled={busy} onClick={() => run(async () => {
        const value = await canvasPrompt(uiText("重试可重试项：填写本次允许预留的积分上限（实际费用待核算）"))
        if (value == null) return
        const budget = Number(value)
        if (!value.trim() || !Number.isFinite(budget) || budget < 0) throw new Error('请输入有效的预留积分上限')
        show(await session.submitBatch({ canvasId: session.document.canvasId, batchId: detail.batchId, clientRequestId: canvasRequestId('batch-retry'), maxTotalCredits: budget }, 'retry'))
      })}>{uiText("重试失败项")}</Button>}
    </Space>{detail.items?.map(item => <p key={`${item.clientItemId}:${item.outputIndex}`}>{item.generation?.nodeId}{item.generation?.shotId != null ? uiText(" / 镜头 {0}", item.generation.shotId) : ''} {uiText("· 输出") + " "}{item.outputIndex + 1} {uiText("· 任务") + " "}{item.generation?.generationId} · {item.generation?.billingState}</p>)}</section>}
  </div>
}
