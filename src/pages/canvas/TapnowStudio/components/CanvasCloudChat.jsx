import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Dropdown, Input, Select, Space, Tooltip } from 'antd'
import { Archive, ArchiveRestore, ArrowUp, Check, ChevronDown, Images, Info, MessageSquare, MoreHorizontal, Paperclip, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import CanvasChatAttachment from './CanvasChatAttachment'
import CanvasChatReply from './CanvasChatReply'
import { StudioCanvases, canvasRequestId } from '../../../../services/studioCanvases'
import { actualBillingQuote, canvasBillingError } from '../canvasActualBilling'
import { chatBlocked, createV4Body, submitCanvasV4, validateChat } from '../canvasExecution'

/** Page through persistent sessions so older conversations retain their current version. */
async function listSessions(canvasId) {
  const items = []
  for (let page = 1; ; page++) {
    const result = await StudioCanvases.chatSessions(canvasId, page)
    items.push(...result.items)
    if (!result.items.length || items.length >= result.total) return items
  }
}

/** Check actual local media metadata before uploading a billable chat attachment. */
async function fileDuration(file) {
  if (!/^(audio|video)\//.test(file.type)) return undefined
  const url = URL.createObjectURL(file)
  const media = document.createElement(file.type.startsWith('video') ? 'video' : 'audio')
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('无法读取音视频时长，请重新选择文件')), 15000)
      media.onloadedmetadata = () => { clearTimeout(timer); Number.isFinite(media.duration) && media.duration > 0 && media.duration <= 300 ? resolve(media.duration) : reject(new Error('音视频附件时长必须在 300 秒以内')) }
      media.onerror = () => { clearTimeout(timer); reject(new Error('无法读取音视频文件')) }
      media.preload = 'metadata'; media.src = url
    })
  } finally { media.removeAttribute('src'); media.load(); URL.revokeObjectURL(url) }
}

/** Cloud-only chat UI: server sessions, quotes, full-result polling and receipt recovery. */
export default function CanvasCloudChat({ theme = 'dark', session, enabled, active, save, assertReady, confirm, onClose, queuedFiles = [], removeQueuedFile }) {
  const canvasId = session.document.canvasId
  const [capabilities, setCapabilities] = useState(null)
  const [models, setModels] = useState([])
  const [modelId, setModelId] = useState()
  const [sessions, setSessions] = useState([])
  const [sessionId, setSessionId] = useState()
  const [messages, setMessages] = useState([])
  const [details, setDetails] = useState({})
  const [prompt, setPrompt] = useState('')
  const [assets, setAssets] = useState([])
  const [selected, setSelected] = useState([])
  const [assetPage, setAssetPage] = useState(1)
  const [assetTotal, setAssetTotal] = useState(0)
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [billingQuote, setBillingQuote] = useState(null)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const uploadRef = useRef(null)
  const lock = useRef(false), mounted = useRef(true), selectedSession = useRef(sessionId), request = useRef(0)
  selectedSession.current = sessionId
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++ } }, [])
  const run = async fn => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { session.assertWritable(); await fn() } catch (reason) { if (mounted.current) setError(canvasBillingError(reason)) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  const loadCatalog = useCallback(async () => {
    const caps = await StudioCanvases.executionCapabilities()
    if (!mounted.current) return
    setCapabilities(caps)
    if (!caps.storageReady || !caps.operations?.includes('chat')) { setModels([]); return }
    const catalog = await StudioCanvases.executionModels('chat')
    if (!mounted.current) return
    setModels(catalog)
    setModelId(previous => catalog.some(model => model.modelId === previous && model.available === true) ? previous : catalog.find(model => model.available === true && model.defaultModel)?.modelId ?? catalog.find(model => model.available === true)?.modelId)
  }, [])
  const refresh = useCallback(async (id = selectedSession.current) => {
    const sequence = ++request.current
    const selectionAtStart = selectedSession.current
    const list = await listSessions(canvasId)
    const nextId = id ?? list.find(item => !item.archived)?.sessionId
    const history = nextId == null ? [] : await StudioCanvases.chatMessages(canvasId, nextId)
    // Always read full details on refresh; list/messages only carry summaries.
    const tasks = await Promise.all(history.map(item => StudioCanvases.executionDetail(canvasId, item.taskId)))
    if (!mounted.current || sequence !== request.current || String(selectionAtStart) !== String(selectedSession.current)) return
    setSessions(list); setSessionId(nextId); setMessages(history)
    setDetails(Object.fromEntries(tasks.map(task => [task.taskId, task])))
  }, [canvasId])
  useEffect(() => {
    if (!enabled || !active || session.isDeleted()) return
    let stopped = false
    loadCatalog().then(() => { if (!stopped) return refresh() }).catch(reason => { if (!stopped) setError(canvasBillingError(reason)) })
    return () => { stopped = true }
  }, [enabled, active, session, loadCatalog, refresh])
  useEffect(() => {
    if (!active || !enabled || !capabilities?.storageReady || !capabilities.operations?.includes('chat') || sessionId == null) return
    let stopped = false, timer
    const poll = async () => {
      if (stopped || session.isDeleted()) return
      try {
        const history = await StudioCanvases.chatMessages(canvasId, sessionId)
        const tasks = await Promise.all(history.filter(item => !details[item.taskId] || details[item.taskId].shouldPoll || details[item.taskId].status !== item.status).map(item => StudioCanvases.executionDetail(canvasId, item.taskId)))
        if (stopped) return
        setMessages(history)
        if (tasks.length) setDetails(previous => ({ ...previous, ...Object.fromEntries(tasks.map(task => [task.taskId, task])) }))
      } catch (reason) { if (!stopped) setError(canvasBillingError(reason)) }
      if (!stopped) timer = setTimeout(poll, Math.max(1500, capabilities.retryAfterMs || 3000))
    }
    timer = setTimeout(poll, Math.max(1500, capabilities.retryAfterMs || 3000))
    return () => { stopped = true; clearTimeout(timer) }
  }, [active, enabled, canvasId, sessionId, session, capabilities, details])
  const current = sessions.find(item => String(item.sessionId) === String(sessionId))
  const model = models.find(item => item.modelId === modelId)
  const ready = enabled && capabilities?.storageReady && capabilities.operations?.includes('chat') && model?.available === true
  const pending = session.read('v4:execution')
  const attachments = selected.map(id => assets.find(asset => String(asset.assetId) === String(id))).filter(Boolean)
  // Session creation is idempotent too: a lost response must not create another conversation.
  const createSession = async () => {
    assertReady()
    let body = session.read('v4:chatSession')
    if (!body) { body = { canvasId, title: '新对话', clientRequestId: canvasRequestId('chat-session') }; session.write('v4:chatSession', body) }
    const created = await StudioCanvases.chatSessionCreate(body)
    if (String(created.canvasId) !== String(canvasId) || created.sessionId == null) throw new Error('会话回执不完整')
    session.write('v4:chatSession', null)
    selectedSession.current = created.sessionId; setSessionId(created.sessionId); setMessages([]); setDetails({})
    await refresh(created.sessionId)
    return created
  }
  const loadAssets = async (page = 1) => {
    const result = await StudioCanvases.assets(canvasId, page)
    setAssets(previous => [...previous.filter(asset => !result.items.some(item => String(item.assetId) === String(asset.assetId))), ...result.items])
    setAssetPage(page); setAssetTotal(result.total)
    return result.items
  }
  // Re-read version and busy state immediately before freezing and quoting this message.
  const send = () => run(async () => {
    assertReady()
    if (pending) throw new Error('请先找回上次消息提交')
    if (!ready) throw new Error('云端聊天尚未就绪，请刷新能力与模型')
    const references = validateChat(prompt, model, attachments, canvasId)
    if (queuedFiles.length) throw new Error('请先关联或移除画布送入的附件')
    const target = current || await createSession()
    const latest = (await listSessions(canvasId)).find(item => String(item.sessionId) === String(target.sessionId))
    if (!latest || latest.archived) throw new Error('会话已归档或不存在，请刷新会话')
    const history = await StudioCanvases.chatMessages(canvasId, latest.sessionId)
    setMessages(history)
    if (chatBlocked(history)) throw new Error('会话中仍有执行中或待核查消息，请先处理原任务')
    if (latest.version >= 30) throw new Error('会话已达到 30 次受理上限，请新建会话')
    const document = await save()
    const estimate = { canvasId, revisionNo: document.revisionNo, nodeId: `sidebar:${latest.sessionId}`, operation: 'chat', modelId, sessionId: latest.sessionId, expectedSessionVersion: latest.version, selection: { references }, parameters: { prompt } }
    try {
      const quote = await StudioCanvases.executionEstimate(estimate)
      actualBillingQuote(quote, canvasId, document.revisionNo)
      if (quote.operation !== 'chat' || quote.nodeId !== estimate.nodeId || quote.modelId !== modelId) throw new Error('聊天报价与消息不一致')
      // Sending authorizes billing; validate the quote and submit without a second confirmation.
      setBillingQuote(quote)
      await submitCanvasV4(session, 'execution', createV4Body(canvasId, quote.quoteId, undefined, 'chat'))
      setPrompt(''); setSelected([])
      await refresh(latest.sessionId)
    } catch (reason) {
      if (['CHAT_VERSION_CONFLICT', 'CHAT_SESSION_BUSY'].includes(reason.errorCode)) await refresh(latest.sessionId)
      if (['MODEL_OPERATION_UNSUPPORTED', 'INPUT_MODALITY_UNSUPPORTED'].includes(reason.errorCode)) await loadCatalog()
      throw reason
    }
  })
  // Keep the native file picker accessible through a compact toolbar action.
  const uploadAttachment = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void run(async () => {
      assertReady()
      const durationSeconds = await fileDuration(file)
      validateChat('附件校验', model, [...attachments, { assetId: 'upload', canvasId, mimeType: file.type, sizeBytes: file.size, durationSeconds }], canvasId)
      const asset = await StudioCanvases.upload(canvasId, file, canvasRequestId('chat-upload'))
      setAssets(previous => [...previous.filter(item => String(item.assetId) !== String(asset.assetId)), { ...asset, durationSeconds, previewFile: file }])
      setSelected(previous => [...previous, String(asset.assetId)])
    })
  }
  // Resolve queued canvas media to an owned asset before adding it to the composer.
  const attachQueued = (file, index) => run(async () => {
    const known = session.media.get(file.content)
    if (!known) throw new Error('请先保存画布素材；本地截图可下载后通过上传附件加入')
    let found = assets.find(asset => String(asset.assetId) === String(known.assetId))
    for (let page = 1; !found; page++) {
      const result = await StudioCanvases.assets(canvasId, page)
      found = result.items.find(asset => String(asset.assetId) === String(known.assetId))
      if (!result.items.length || page * 100 >= result.total) break
    }
    if (!found) throw new Error('当前画布素材中未找到此附件')
    validateChat('附件校验', model, [...attachments, found], canvasId)
    setAssets(previous => [...previous.filter(asset => String(asset.assetId) !== String(found.assetId)), found])
    setSelected(previous => [...new Set([...previous, String(found.assetId)])])
    removeQueuedFile?.(index)
  })
  const sessionMenu = [
    { key: 'refresh', icon: <RefreshCw size={14} />, label: '刷新会话与模型', disabled: busy },
    { key: 'showArchived', icon: showArchived ? <Check size={14} /> : <Archive size={14} />, label: showArchived ? '隐藏已归档会话' : '显示已归档会话', disabled: busy },
    ...(current ? [{ type: 'divider' }, { key: 'archive', icon: current.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />, label: current.archived ? '取消归档当前会话' : '归档当前会话', disabled: busy || !!pending }] : []),
  ]
  const composerDisabled = busy || !!pending || current?.archived
  return <section className="canvas-v4-chat" data-theme={theme} aria-label="云端聊天">
    <header className="canvas-v4-chat__header">
      <div className="canvas-v4-chat__identity"><span className="canvas-v4-chat__brand"><MessageSquare size={17} /></span><div><strong>云端聊天</strong><span>灵感与对话，都留在画布里</span></div></div>
      <Tooltip title="关闭聊天"><Button type="text" className="canvas-v4-chat__icon-button" aria-label="关闭聊天" icon={<X size={17} />} onClick={onClose} /></Tooltip>
    </header>
    {enabled && <div className="canvas-v4-chat__sessionbar">
      <Select className="canvas-v4-chat__session-select" aria-label="云端聊天会话" placeholder="新建或选择会话" value={sessionId} disabled={busy || !!pending} suffixIcon={<ChevronDown size={13} />} options={sessions.filter(item => showArchived || !item.archived || String(item.sessionId) === String(sessionId)).map(item => ({ value: item.sessionId, label: `${item.title}${item.archived ? '（已归档）' : ''}` }))} onChange={id => { selectedSession.current = id; setSessionId(id); setMessages([]); setDetails({}); void run(() => refresh(id)) }} />
      <Tooltip title={session.read('v4:chatSession') ? '找回新会话' : '新建对话'}><Button className="canvas-v4-chat__new" icon={<Plus size={15} />} disabled={busy || !ready || !!pending} onClick={() => run(createSession)}>{session.read('v4:chatSession') ? '找回' : '新对话'}</Button></Tooltip>
      <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: sessionMenu, onClick: ({ key }) => {
        if (key === 'showArchived') setShowArchived(value => !value)
        if (key === 'refresh') void run(async () => { await loadCatalog(); await refresh() })
        if (key === 'archive') void run(async () => { await StudioCanvases.chatArchive(canvasId, current.sessionId, !current.archived); await refresh() })
      } }}><Button type="text" className="canvas-v4-chat__icon-button" aria-label="会话选项" icon={<MoreHorizontal size={18} />} /></Dropdown>
    </div>}
    <div className="canvas-v4-chat__notices">
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError('')} />}
      {!enabled && <Alert type="info" message="服务端尚未开放云端聊天" />}
      {enabled && !ready && <Alert type="info" message="暂无可用聊天能力或模型，可在会话选项中刷新" />}
      {enabled && pending && <Alert type="warning" message="上次提交结果尚未确认，请先找回原消息" action={<Button disabled={busy} onClick={() => run(async () => { const task = await submitCanvasV4(session, 'execution', null, true); if (task?.sessionId != null) { selectedSession.current = task.sessionId; setSessionId(task.sessionId) }; setPrompt(''); setSelected([]); await refresh(task?.sessionId) })}>找回提交</Button>} />}
    </div>
    {enabled && <>
      <div className="canvas-v4-chat__messages" aria-live="polite">
        {!messages.length && <div className="canvas-v4-chat__empty">
          <span className="canvas-v4-chat__empty-icon"><Sparkles size={26} strokeWidth={1.5} /></span>
          <h3>从一个想法开始</h3>
          <p>聊聊故事、镜头或画面，<br />也可以添加画布素材，一起完善创意。</p>
          <div className="canvas-v4-chat__starters">
            {[['梳理故事思路', '帮我梳理这个故事的核心冲突和情节发展。'], ['优化镜头表达', '帮我优化这段场景的镜头安排和画面表达。'], ['比较创意方案', '帮我比较这两种创意方案的优缺点。']].map(([label, text]) => <Button key={label} disabled={composerDisabled || !ready} onClick={() => setPrompt(text)}>{label}<span aria-hidden="true">↗</span></Button>)}
          </div>
          <small>消息与回复自动保存在当前画布</small>
        </div>}
        {messages.map(item => { const task = details[item.taskId]; return <article className="canvas-v4-message" key={item.taskId}>
          <section className="canvas-v4-message__user" aria-label="你的消息">
            <span className="canvas-v4-message__user-label">你</span>
            <div className="canvas-v4-message__prompt">{item.text}</div>
            {!!item.attachmentAssetIds?.length && <div className="canvas-v4-chat__message-attachments">{item.attachmentAssetIds.map(id => <CanvasChatAttachment key={id} session={session} asset={assets.find(asset => String(asset.assetId) === String(id)) || { assetId: id, canvasId }} />)}</div>}
          </section>
          <CanvasChatReply text={task?.result?.text || item.reply || ''} task={task} status={item.status} />
          {(task?.error || task?.errorCode) && <Alert type="warning" message={canvasBillingError(task)} />}
          {(task?.status ?? item.status) === 6 && <p className="canvas-v4-message__review-note">已停止自动重发。核查原请求后再继续。</p>}
          <Space wrap className="canvas-v4-message__actions">{task?.actions?.cancel && <Button size="small" disabled={busy || task.cancelRequested} onClick={() => run(async () => { if (await confirm('取消消息', '调用后只能记录取消意愿，不能保证撤单或退款。')) { await StudioCanvases.executionCancel(canvasId, item.taskId); await refresh() } })}>取消</Button>}{task?.actions?.retrySettlement && <Button size="small" disabled={busy} onClick={() => run(async () => { await StudioCanvases.executionRetrySettlement(canvasId, item.taskId); await refresh() })}>重试结算</Button>}</Space>
        </article> })}
      </div>
      <div className="canvas-v4-chat__composer">
        {assetPickerOpen && <div className="canvas-v4-chat__asset-picker">
          <div className="canvas-v4-chat__picker-heading"><span>画布素材</span><Button type="text" size="small" aria-label="收起素材选择" icon={<X size={14} />} onClick={() => setAssetPickerOpen(false)} /></div>
          <Select mode="multiple" aria-label="聊天素材附件" placeholder="选择素材，最多 8 份" value={selected} disabled={composerDisabled} options={assets.filter(asset => !asset.removed && /^(image|video|audio)\//.test(asset.mimeType)).map(asset => ({ value: String(asset.assetId), label: asset.name || `素材 ${asset.assetId}` }))} onChange={setSelected} />
          {assetPage * 100 < assetTotal && <Button type="link" size="small" disabled={busy} onClick={() => run(() => loadAssets(assetPage + 1))}>加载更多素材</Button>}
        </div>}
        <div className="canvas-v4-chat__input-card">
          {(attachments.length > 0 || queuedFiles.length > 0) && <div className="canvas-v4-chat__attachments">
            {attachments.map(asset => <CanvasChatAttachment key={asset.assetId} session={session} asset={asset} disabled={composerDisabled} onRemove={() => setSelected(previous => previous.filter(id => String(id) !== String(asset.assetId)))} />)}
            {queuedFiles.map((file, index) => <CanvasChatAttachment key={`queued-${index}-${file.name}`} session={session} file={file} queued disabled={composerDisabled} onAttach={() => attachQueued(file, index)} onRemove={() => removeQueuedFile?.(index)} />)}
          </div>}
          <Input.TextArea className="canvas-v4-chat__input" aria-label="云端聊天消息" placeholder={current?.archived ? '此会话已归档，可在会话选项中恢复' : '输入想法，或聊聊这张画布…'} value={prompt} maxLength={60000} autoSize={{ minRows: 3, maxRows: 6 }} disabled={composerDisabled} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); send() } }} />
          <div className="canvas-v4-chat__model-row"><span>模型</span><Select className="canvas-v4-chat__model-select" aria-label="云端聊天模型" placeholder="选择可用模型" value={modelId} disabled={composerDisabled} suffixIcon={<ChevronDown size={12} />} options={models.map(item => ({ value: item.modelId, disabled: item.available !== true, label: item.name + (item.available === true ? '' : `（${item.unavailableReason || '不可用'}）`) }))} onChange={setModelId} /></div>
          <div className="canvas-v4-chat__input-toolbar">
            <div className="canvas-v4-chat__attachment-tools">
              <Tooltip title="上传图片、音频或视频"><Button type="text" className="canvas-v4-chat__tool" aria-label="上传聊天附件" icon={<Paperclip size={16} />} disabled={composerDisabled || !ready} onClick={() => uploadRef.current?.click()}>附件</Button></Tooltip>
              <Tooltip title="从当前画布选择素材"><Button type="text" className="canvas-v4-chat__tool" aria-label="选择画布素材" icon={<Images size={16} />} disabled={composerDisabled} onClick={() => { setAssetPickerOpen(value => !value); if (!assetPickerOpen) void run(() => loadAssets()) }}>素材</Button></Tooltip>
            </div>
            <input ref={uploadRef} className="canvas-v4-chat__file-input" aria-label="选择上传文件" type="file" accept="image/png,image/jpeg,video/*,audio/*" disabled={composerDisabled || !ready} onChange={uploadAttachment} />
            <Tooltip title="发送后按实际用量扣费"><Button className="canvas-v4-chat__send" type="primary" aria-label="发送消息" icon={<ArrowUp size={17} />} loading={busy} disabled={!ready || !!pending || !prompt.trim() || current?.archived || chatBlocked(messages)} onClick={send}>发送</Button></Tooltip>
          </div>
        </div>
        <div className="canvas-v4-chat__composer-hint">{billingQuote?.unlimited === true && <span>上次检查：不限额</span>}<span>Ctrl / ⌘ + Enter 发送</span><Tooltip title="最多 8 份附件，合计 ≤50MiB。图片仅 PNG/JPEG，每份 ≤10MiB；音视频每份 ≤50MiB、≤300 秒。视频仅提供视觉内容，理解音轨请添加音频。"><button type="button" className="canvas-v4-chat__limits" aria-label="查看附件限制"><Info size={12} />附件说明</button></Tooltip></div>
      </div>
    </>}
  </section>
}
