import { uiText, useUiLanguage } from '../../i18n/uiText'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Input, List, Modal, Select, Space, Tag } from 'antd'
import { StudioCanvases, canvasRequestId, type CanvasReviewFamily, type CanvasReviewItem, type CanvasReviewRecord, type CanvasReviewRecordRequest } from '../../services/studioCanvases'
import { canvasUserScope } from './canvasCache'
import { useAppStore } from '../../store/useAppStore'
import { withCanvasOperationLock } from './TapnowStudio/canvasOperationLock'

export default function CanvasReviewPanel({ ready }: { ready: boolean }) {
  useUiLanguage()

  const admin = useAppStore(state => state.user.isAdmin)
  const [open, setOpen] = useState(false)
  const [family, setFamily] = useState<CanvasReviewFamily>('generation')
  const [page, setPage] = useState(1), [total, setTotal] = useState(0)
  const [items, setItems] = useState<CanvasReviewItem[]>([])
  const [selected, setSelected] = useState<CanvasReviewItem>()
  const [history, setHistory] = useState<CanvasReviewRecord[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [state, setState] = useState<CanvasReviewRecordRequest['state']>('awaitingProvider')
  const [reason, setReason] = useState(''), [evidence, setEvidence] = useState(''), [provider, setProvider] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const owner = useRef(canvasUserScope()).current
  const key = 'canvas-review:' + owner
  const [pending, setPending] = useState<CanvasReviewRecordRequest | null>(() => { try { return JSON.parse(window.localStorage.getItem(key) || 'null') } catch { return null } })
  const sequence = useRef(0)
  const allowed = admin && ready
  const assertAdmin = () => {
    if (!useAppStore.getState().user.isAdmin || !ready || canvasUserScope() !== owner) throw new Error('管理员登录或核查能力已变化，原请求已保留')
  }
  async function refresh(nextPage = page) {
    assertAdmin()
    const request = ++sequence.current
    const result = await StudioCanvases.reviewPending(family, nextPage)
    assertAdmin()
    if (request !== sequence.current) return
    setItems(result.items); setTotal(result.total); setPage(result.page)
  }
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { assertAdmin(); await work() } catch (error) { setError(error instanceof Error ? error.message : '核查操作失败') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (open && allowed) { setSelected(undefined); setHistory([]); void run(() => refresh(1)) }
    return () => { sequence.current++ }
  }, [open, family, allowed])
  const readHistory = async (item: CanvasReviewItem, nextPage = 1) => {
    const request = ++sequence.current
    const rows = await StudioCanvases.reviewHistory(family, item.id, nextPage)
    if (request !== sequence.current) return
    setSelected(item); setHistory(rows); setHistoryPage(nextPage)
  }
  const submit = async (replay = false) => {
    await withCanvasOperationLock(key, async () => {
      assertAdmin()
      let body: CanvasReviewRecordRequest | null = JSON.parse(window.localStorage.getItem(key) || 'null')
      if (!replay) {
        if (body) throw new Error('请先恢复上次登记，不能更换原请求')
        if (!selected || !reason.trim() || !evidence.trim()) throw new Error('请选择任务并填写原因和证据编号')
        if (reason.trim().length > 2048 || evidence.trim().length > 512) throw new Error('原因或证据编号超出长度限制')
        body = { family, taskRef: selected.id, clientRequestId: canvasRequestId('review'), state, reason: reason.trim(), evidenceRef: evidence.trim(), ...(family === 'generation' && provider.trim() ? { providerTaskId: provider.trim() } : {}) }
        window.localStorage.setItem(key, JSON.stringify(body)); setPending(body)
      }
      if (!body) return
      try { await StudioCanvases.reviewRecord(body) }
      catch (error) {
        if ((error as { submissionState?: string }).submissionState === 'notAccepted') {
          window.localStorage.setItem(key + ':history:' + body.clientRequestId, JSON.stringify(body))
          window.localStorage.removeItem(key); setPending(null)
        }
        throw error
      }
      assertAdmin()
      window.localStorage.setItem(key + ':history:' + body.clientRequestId, JSON.stringify(body))
      window.localStorage.removeItem(key); setPending(null)
      await refresh()
      if (body.family === family) await readHistory({ id: body.taskRef })
    })
  }
  if (!allowed) return null
  return <>
    <Button onClick={() => setOpen(true)}>{uiText("管理员核查")}</Button>
    <Modal title={uiText("画布任务核查")} open={open} onCancel={() => setOpen(false)} footer={null} width={850}>
      <Space wrap>
        <Select aria-label={uiText("核查任务类型")} disabled={busy} value={family} onChange={setFamily} options={[{ value: 'generation', label: uiText("媒体生成") }, { value: 'text', label: uiText("文本") }, { value: 'analysis', label: uiText("分析") }, { value: 'execution', label: uiText("扩展执行 / 聊天") }]} />
        <Button disabled={busy} onClick={() => void run(() => refresh())}>{uiText("刷新")}</Button>
        {pending && <Button disabled={busy} onClick={() => void run(() => submit(true))}>{uiText("恢复上次登记")}</Button>}
      </Space>
      {error && <Alert type="error" showIcon message={error} />}
      <List loading={busy} dataSource={items} locale={{ emptyText: uiText("暂无待核查任务") }} renderItem={item => <List.Item actions={[<Button key="inspect" disabled={busy} onClick={() => void run(() => readHistory(item))}>{uiText("查看 / 登记")}</Button>]}>
        <Space><span>{uiText("业务任务 #")}{item.id}</span><span>{uiText("画布 #")}{item.canvasId}</span><Tag>{item.billingState || uiText("待核算")}</Tag></Space>
      </List.Item>} />
      <Space><Button disabled={busy || page <= 1} onClick={() => void run(() => refresh(page - 1))}>{uiText("上一页")}</Button><span>{page} {uiText("· 共") + " "}{total} {uiText("项")}</span><Button disabled={busy || page * 20 >= total} onClick={() => void run(() => refresh(page + 1))}>{uiText("下一页")}</Button></Space>
      {selected && <section style={{ marginTop: 20 }}>
        <strong>{uiText("业务任务 #")}{selected.id} {uiText("· 证据登记")}</strong>
        <Alert type="info" message={uiText("登记仅记录核查证据，不会自动完成任务、退款或结算。请勿填写密钥或完整凭据。")} />
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
          <Select aria-label={uiText("核查状态")} value={state} disabled={!!pending || busy} onChange={setState} options={[{ value: 'open', label: uiText("待核查") }, { value: 'awaitingProvider', label: uiText("等待供应商确认") }, { value: 'resolved', label: uiText("已核实终结") }]} />
          <Input.TextArea aria-label={uiText("核查原因")} placeholder={uiText("核查原因（必填）")} maxLength={2048} value={reason} onChange={e => setReason(e.target.value)} disabled={!!pending || busy} />
          <Input aria-label={uiText("证据编号")} placeholder={uiText("证据编号（必填）")} maxLength={512} value={evidence} onChange={e => setEvidence(e.target.value)} disabled={!!pending || busy} />
          {family === 'generation' && <Input aria-label={uiText("原供应商任务ID")} placeholder={uiText("已核实的原供应商任务 ID（可选）")} value={provider} onChange={e => setProvider(e.target.value)} disabled={!!pending || busy} />}
          <Button type="primary" disabled={!!pending || busy} onClick={() => void run(() => submit())}>{uiText("登记证据")}</Button>
        </Space>
        <List header="审计历史" dataSource={history} renderItem={record => <List.Item><div><Tag>{record.state}</Tag>{record.reason}<p>{uiText("证据：")}{record.evidenceRef} · {record.createdAt}</p></div></List.Item>} />
        <Space><Button disabled={busy || historyPage <= 1} onClick={() => void run(() => readHistory(selected, historyPage - 1))}>{uiText("上一页历史")}</Button><Button disabled={busy || history.length < 20} onClick={() => void run(() => readHistory(selected, historyPage + 1))}>{uiText("下一页历史")}</Button></Space>
      </section>}
    </Modal>
  </>
}
