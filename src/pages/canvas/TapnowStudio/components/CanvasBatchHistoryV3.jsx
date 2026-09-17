import { canvasPrompt } from '../canvasDialogs';
import React, { useEffect, useRef, useState } from 'react'
import { Button, Empty, Select, Space, Tag } from 'antd'
import { StudioCanvases, canvasRequestId } from '../../../../services/studioCanvases'

const labels = { queued: '等待执行', running: '执行中', succeeded: '全部成功', partialFailed: '部分失败', failed: '失败', cancelled: '已取消', needsReview: '待核查' }
export default function CanvasBatchHistoryV3({ session, onTask, report, revision }) {
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
        if (result.items.some(item => ['queued', 'running'].includes(item.status))) timer = setTimeout(load, 3000)
      } catch (error) { if (!stopped) report(error) }
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
    }, 2500)
    return () => { stopped = true; clearTimeout(timer) }
  }, [session, detail, onTask, report])
  const run = async fn => { if (lock.current) return; lock.current = true; setBusy(true); try { session.assertWritable(); await fn() } catch (error) { report(error) } finally { lock.current = false; setBusy(false) } }
  const show = batch => { setDetail(batch); batch.items?.forEach(item => onTask(item.generation)); setTick(value => value + 1) }
  return <div className="canvas-history-panel">
    <Space wrap><Select aria-label="批次状态" placeholder="全部状态" allowClear value={status} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} onChange={value => { setStatus(value); setPage(1) }} /><Button disabled={busy} onClick={() => setTick(value => value + 1)}>刷新批次</Button>{session.pendingBatch && <Button disabled={busy} onClick={() => run(async () => show(await session.recoverBatch()))}>找回批次提交</Button>}</Space>
    {items.map(batch => <section className="canvas-history-card" key={batch.batchId}><strong>批次 {batch.batchId}</strong> <Tag>{labels[batch.status] || batch.status}</Tag><p>v{batch.revisionNo} · 共 {batch.total} 项 · 成功 {batch.succeeded} 项</p><p>预留积分 {batch.reservedCredits ?? '未知'} · 实际费用待各任务结算</p><Button disabled={busy} onClick={() => run(async () => show(await StudioCanvases.batchDetail(session.document.canvasId, batch.batchId)))}>查看详情</Button></section>)}
    {!items.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无批次" />}
    <Space><Button disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><span>共 {total} 个批次 · 第 {page} 页</span><Button disabled={busy || page * 20 >= total} onClick={() => setPage(page + 1)}>下一页</Button></Space>
    {detail && <section className="canvas-history-card"><strong>批次 {detail.batchId} 详情</strong><Space wrap>
      {detail.items?.some(item => item.generation?.actions?.cancel) && <Button disabled={busy} onClick={() => run(async () => show(await StudioCanvases.batchCancel(session.document.canvasId, detail.batchId)))}>请求取消</Button>}
      {detail.items?.some(item => item.generation?.actions?.retry) && <Button disabled={busy} onClick={() => run(async () => {
        const value = await canvasPrompt('重试可重试项：填写本次允许预留的积分上限（实际费用待核算）')
        if (value == null) return
        const budget = Number(value)
        if (!value.trim() || !Number.isFinite(budget) || budget < 0) throw new Error('请输入有效的预留积分上限')
        show(await session.submitBatch({ canvasId: session.document.canvasId, batchId: detail.batchId, clientRequestId: canvasRequestId('batch-retry'), maxTotalCredits: budget }, 'retry'))
      })}>重试失败项</Button>}
    </Space>{detail.items?.map(item => <p key={`${item.clientItemId}:${item.outputIndex}`}>{item.generation?.nodeId}{item.generation?.shotId != null ? ` / 镜头 ${item.generation.shotId}` : ''} · 输出 {item.outputIndex + 1} · 任务 {item.generation?.generationId} · {item.generation?.billingState}</p>)}</section>}
  </div>
}
