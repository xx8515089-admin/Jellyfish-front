import { canvasPrompt } from '../canvasDialogs';
import CanvasBatchHistoryV3 from './CanvasBatchHistoryV3'
import React, { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, InputNumber, Modal, Space, Tag } from 'antd'
import { StudioCanvases, canvasRequestId } from '../../../../services/studioCanvases'

export default function CanvasBatchPanel({ session, candidates, save, onClose, onBatch }) {
  const [selected, setSelected] = useState(candidates.map(item => item.clientItemId))
  const [count, setCount] = useState(Math.min(10, candidates[0]?.count || 1))
  const [budget, setBudget] = useState(null)
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async fn => { if (busy) return; setBusy(true); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const invalidate = () => { setQuote(null); setBudget(null) }
  return <Modal open title="批量生成" onCancel={busy ? undefined : onClose} footer={null} width={650}>
    <p>选择同一版本的独立任务。结果保留在历史中，确认应用后才改变画布。</p>
    <div style={{ maxHeight: '40vh', overflow: 'auto' }}><Checkbox.Group value={selected} onChange={value => { setSelected(value); invalidate() }} disabled={busy}>{candidates.map(item => <div key={item.clientItemId} style={{ padding: 8 }}><Checkbox value={item.clientItemId}>{item.label}</Checkbox></div>)}</Checkbox.Group></div>
    <Space wrap><span>每项数量</span><InputNumber min={1} max={10} precision={0} disabled={busy} value={count} onChange={value => { setCount(value || 1); invalidate() }} /><span>共 {selected.length * count} 个任务（最多 50）</span></Space>
    {error && <Alert type="error" message={error} />}
    {quote && <Alert type="info" message={`已预估版本 v${quote.body.revisionNo} · ${quote.total == null ? '请填写允许预留的积分上限' : `预留积分 ${quote.total}`}`} description="预留上限只限制提交时预留积分，不是供应商实际费用的最终结算封顶。" />}
    {quote?.estimate.items?.length > 0 && <div style={{ maxHeight: 150, overflow: 'auto', marginTop: 10 }}>{quote.estimate.items.map((item, index) => <p key={item.clientItemId || index}>{candidates.find(candidate => candidate.clientItemId === item.clientItemId)?.label || `任务 ${index + 1}`}：{item.unitCredits ?? item.unitCreditCost ?? item.creditCost ?? '—'} 积分/项 · 数量 {item.count ?? count} · 小计预留 {item.subtotalCredits ?? (item.unitCredits ?? item.estimate?.creditCost ?? 0) * (item.count ?? count)} 积分</p>)}</div>}
    {quote && <Space style={{ marginTop: 12 }}><span>预留积分上限</span><InputNumber min={0} value={budget} disabled={busy} onChange={setBudget} /></Space>}
    <Space style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}><Button disabled={busy} onClick={onClose}>关闭</Button><Button loading={busy} disabled={!selected.length || selected.length * count > 50} onClick={() => run(async () => {
      if (session.pendingGeneration) throw new Error('请先找回上次生成提交')
      if (session.pendingBatch) throw new Error('请先在批次历史找回上次提交')
      const saved = await save()
      const body = { canvasId: session.document.canvasId, revisionNo: saved.revisionNo, clientRequestId: canvasRequestId('batch'), items: candidates.filter(item => selected.includes(item.clientItemId)).map(({label, ...item}) => ({ ...item, count })) }
      const estimate = await StudioCanvases.batchEstimate(body)
      const total = estimate.totalCredits ?? estimate.totalEstimatedCredits ?? estimate.totalCreditCost ?? estimate.creditCost
      if (estimate.sufficient === false) throw new Error('积分不足，请减少任务数量')
      setQuote({ body, total, estimate }); setBudget(Number.isFinite(total) ? total : null)
    })}>预估费用</Button><Button type="primary" disabled={busy || !quote || budget == null || budget < 0} onClick={() => run(async () => { onBatch(await session.submitBatch({ ...quote.body, maxTotalCredits: budget })); onClose() })}>确认提交</Button></Space>
  </Modal>
}

export function CanvasBatchHistory(props) {
  return Number(props.session.capabilities?.apiVersion) >= 3 ? <CanvasBatchHistoryV3 {...props} /> : <LegacyCanvasBatchHistory {...props} />
}
function LegacyCanvasBatchHistory({ session, onTask, report, revision }) {
  const [ids, setIds] = useState(() => session.read('batchIds') || [])
  const [batches, setBatches] = useState([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { setIds(session.read('batchIds') || []) }, [session, revision])
  useEffect(() => {
    let stopped = false, timer
    const load = async () => {
      try {
        const results = await Promise.all(ids.map(id => StudioCanvases.batchDetail(session.document.canvasId, id)))
        if (stopped) return
        setBatches(results)
        if (results.some(batch => batch.shouldPoll)) timer = setTimeout(load, 2500)
      } catch (e) { if (!stopped) report(e) }
    }
    void load()
    return () => { stopped = true; clearTimeout(timer) }
  }, [session, ids, report])
  const remember = batch => { const next = [...new Set([batch.batchId, ...ids])]; session.write('batchIds', next); setIds(next); batch.items?.forEach(item => onTask(item.generation)) }
  const run = async fn => { if (busy) return; setBusy(true); try { await fn() } catch(e) { report(e) } finally { setBusy(false) } }
  const labels = {queued:'等待执行',running:'执行中',succeeded:'全部成功',partialFailed:'部分失败',failed:'失败',cancelled:'已取消',needsReview:'待核查'}
  return <div className="canvas-history-list"><Space><Button disabled={busy} onClick={() => setIds([...ids])}>刷新批次</Button>{session.pendingBatch && <Button disabled={busy} onClick={() => run(async () => remember(await session.recoverBatch()))}>找回批次</Button>}</Space>{batches.map(batch => <section className="canvas-history-card" key={batch.batchId}><strong>批次 {batch.batchId}</strong> <Tag>{labels[batch.status] || batch.status}</Tag><p>首次预留：{batch.reservedCredits ?? '未知'} 积分 · {batch.items?.length || 0} 个任务</p><Space wrap>{batch.shouldPoll && <Button disabled={busy} onClick={() => run(async () => { await StudioCanvases.batchCancel(session.document.canvasId, batch.batchId); setIds([...ids]) })}>请求取消</Button>}{batch.items?.some(item => item.generation?.actions?.retry) && <Button disabled={busy} onClick={() => run(async () => {
    const entered = await canvasPrompt('重试已释放费用的失败项：请输入本次允许预留的积分上限（不代表最终结算封顶）')
    if (entered == null) return
    const maxTotalCredits = Number(entered)
    if (!entered.trim() || !Number.isFinite(maxTotalCredits) || maxTotalCredits < 0) throw new Error('请输入有效的积分上限')
    remember(await session.submitBatch({ canvasId: session.document.canvasId, batchId: batch.batchId, clientRequestId: canvasRequestId('batch-retry'), maxTotalCredits }, 'retry'))
  })}>重试失败项</Button>}</Space>{batch.items?.map(item => <p key={`${item.clientItemId}:${item.outputIndex}`}>{item.generation?.nodeId}{item.generation?.shotId != null ? ` / 镜头 ${item.generation.shotId}` : ''} · 输出 {item.outputIndex + 1} · 任务 {item.generation?.generationId} · {item.generation?.billingState}</p>)}</section>)}{!batches.length && <p>暂无本机记录的批次。其他设备的任务可在生成历史中查看。</p>}</div>
}
