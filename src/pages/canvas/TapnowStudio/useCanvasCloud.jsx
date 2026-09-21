import { uiText, uiStatusText, useUiLanguage } from '../../../i18n/uiText'
import { canvasConfirm, canvasPrompt } from './canvasDialogs'
import { previewLink } from './canvasPreviewActions'
import { applyNodeMediaResult } from './canvasNodeOutputs'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Drawer, Empty, Modal, Progress, Space, Tabs, Tag, message } from 'antd'
import './canvasCloud.css'
import './canvasV4.css'
import CanvasCloudChat from './components/CanvasCloudChat'
import CanvasWorkflowPanel from './components/CanvasWorkflowPanel'
import { StudioCanvases, canvasPollDelay, canvasRequestId, hydrateCanvasDocument } from '../../../services/studioCanvases'
import CanvasBatchPanel, { CanvasBatchHistory } from './components/CanvasBatchPanel'
import { CanvasCloudSession, shouldPollTask, taskAction, bindingTarget, mediaOperation } from './canvasCloud'
import { useCanvasAnalysis } from './useCanvasAnalysis'
import { useCanvasTextTasks } from './useCanvasTextTasks'
import { useCanvasMediaPreviews } from './useCanvasMediaPreviews'
import { scheduleCanvasSnapshotSync } from './canvasSnapshotSync'
import { useCanvasLibraryPublish } from './useCanvasLibraryPublish'
import { getStoredAuthUser } from '../../../auth'

const statuses = { get 1() { return uiText("等待执行") }, get 2() { return uiText("执行中") }, get 3() { return uiText("成功") }, get 4() { return uiText("提交失败") }, get 5() { return uiText("调用前取消") }, get 6() { return uiText("结果待核查") } }
const billings = { get reserved() { return uiText("积分已预留") }, get settled() { return uiText("已结算") }, get released() { return uiText("已释放") }, get pendingReview() { return uiText("待核算") } }
const confirm = (title, content) => canvasConfirm(typeof content === 'string' ? uiText(content) : content, { title: uiText(title) })
const clone = (value) => JSON.parse(JSON.stringify(value))
const formatHistoryTime = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
const errorText = (error) => [error?.message || '画布请求失败', error?.location?.nodeId && `节点 ${error.location.nodeId}`, error?.location?.shotId != null && `镜头 ${error.location.shotId}`, error?.location?.fieldPath].filter(Boolean).join(' · ')

export function useCanvasCloud({ theme = 'dark', document, workspaceId, historyVisible = false, models, capabilities = {}, textModels = [], onRefreshCloudModels, nodes, connections, view, projectName, setNodes, setConnections, setView, setProjectName, resolveMedia, onExportLocal, onCloudDocumentApplied, saveToUndoStack }) {
  useUiLanguage()

  const migrationRef = useRef(null)
  const sessionRef = useRef(null)
  if (document && !sessionRef.current) sessionRef.current = new CanvasCloudSession(document, models, resolveMedia, { capabilities, textModels })
  const session = sessionRef.current
  if (session) { session.models = models; session.capabilities = capabilities; session.textModels = textModels }
  const snapshot = useMemo(() => ({ nodes, connections, view, projectName }), [nodes, connections, view, projectName])
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const saved = useRef(null)
  if (session && saved.current === null) saved.current = JSON.stringify(snapshot)
  const snapshotSyncRef = useRef(null)
  const [status, setStatus] = useState('已加载云端版本')
  const [error, setError] = useState('')
  const [deleted, setDeleted] = useState(() => !!session?.isDeleted())
  const [paused, setPaused] = useState(!!session?.pendingSave)
  const [busy, setBusy] = useState(false)
  const generating = useRef(false)
  const [batchCandidates, setBatchCandidates] = useState(null)
  const [batchRevision, setBatchRevision] = useState(0)
  const [filter, setFilter] = useState({})
  const [open, setOpen] = useState(false)
  const [historyTab, setHistoryTab] = useState('tasks')
  const [tasks, setTasks] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [revisions, setRevisions] = useState([])
  const [revisionPage, setRevisionPage] = useState(1)
  const [revisionTotal, setRevisionTotal] = useState(0)
  const activeTasks = useRef(new Map())
  const [recovery, setRecovery] = useState(() => session?.read('draft') || null)
  const [backup, setBackup] = useState(() => session?.read('conflict-backup') || null)
  const mounted = useRef(true)

  useEffect(() => {
    if (!session) return
    const checkDeleted = () => {
      if (!session.isDeleted()) return
      setDeleted(true); setPaused(true); setRecovery(null); setBackup(null)
      setStatus('画布已删除，已停止同步')
      activeTasks.current.clear()
    }
    checkDeleted()
    window.addEventListener('storage', checkDeleted)
    return () => window.removeEventListener('storage', checkDeleted)
  }, [session])

  const historyRequest = useRef(0)
  const putTask = useCallback((task, insert = true) => {
    if (!task || !mounted.current) return
    if (shouldPollTask(task)) activeTasks.current.set(String(task.generationId), task)
    else activeTasks.current.delete(String(task.generationId))
    setTasks((previous) => insert ? [task, ...previous.filter((item) => String(item.generationId) !== String(task.generationId))] : previous.map((item) => String(item.generationId) === String(task.generationId) ? task : item))
  }, [])
  const refresh = useCallback(async () => {
    if (!session) return
    const requestId = ++historyRequest.current
    const result = await StudioCanvases.generations(document.canvasId, page, filter.nodeId, filter)
    if (!mounted.current || requestId !== historyRequest.current) return
    setTasks(result.items)
    setTotal(result.total)
    const batchIds = [...new Set([...(session.read('batchIds') || []), ...result.items.map(task => task.batchId).filter(id => id != null)])]
    session.write('batchIds', batchIds)
    setBatchRevision(value => value + 1)
    result.items.forEach((task) => { if (shouldPollTask(task)) activeTasks.current.set(String(task.generationId), task); else activeTasks.current.delete(String(task.generationId)) })
  }, [session, document, page, filter])
  const report = useCallback((reason) => { if (mounted.current) setError(errorText(reason)) }, [])
  useCanvasMediaPreviews({
    session, enabled: !!session && !deleted && !recovery && !paused && !session.blocked && !session.pendingSave,
    nodes, connections, tasks, setNodes, report,
  })
  const save = useCallback(async () => {
    if (!session) return
    const current = clone(snapshotRef.current)
    setBusy(true)
    setStatus('正在保存…')
    try {
      const result = await session.save(current)
      saved.current = JSON.stringify(current)
      if (JSON.stringify(snapshotRef.current) === saved.current) { try { session.write('draft', null) } catch { session.storageWarning = '云端已保存，但浏览器草稿未能清理' } }
      if (mounted.current) { setStatus(`已保存 · v${result.revisionNo}`); setError(session.storageWarning || ''); setPaused(false) }
      return result
    } catch (reason) {
      if (mounted.current) { setStatus('尚未保存到云端'); setPaused(true) }
      report(reason)
      throw reason
    } finally { if (mounted.current) setBusy(false) }
  }, [session, report])

  useEffect(() => {
    mounted.current = true
    const flushDraft = () => snapshotSyncRef.current?.flush()
    window.addEventListener('pagehide', flushDraft)
    return () => {
      mounted.current = false
      window.removeEventListener('pagehide', flushDraft)
      const pendingDraft = flushDraft()
      // A draft may still be reading a local blob when the editor unmounts.
      // Revoke its URLs after that backup has finished.
      if (pendingDraft) void pendingDraft.finally(() => { if (!mounted.current) session?.dispose() })
      else session?.dispose()
    }
  }, [session])
  useEffect(() => { if (session) void refresh().catch(report) }, [session, refresh, report, historyVisible])
  useEffect(() => {
    if (!session) return
    let cancelled = false
    let timer
    const poll = async () => {
      let delay = canvasPollDelay(...activeTasks.current.values())
      for (const task of activeTasks.current.values()) {
        if (cancelled) return
        try {
          const result = await StudioCanvases.generation(document.canvasId, task.generationId)
          if (!cancelled) { putTask(result, false); delay = Math.max(delay, canvasPollDelay(result)) }
        } catch (reason) { delay = Math.max(delay, canvasPollDelay(reason)); if (!cancelled) report(reason); break }
      }
      if (!cancelled) timer = window.setTimeout(poll, delay)
    }
    timer = window.setTimeout(poll, 2500)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [session, document, putTask, report])
  useEffect(() => {
    snapshotSyncRef.current = null
    if (!session || deleted || session.isDeleted() || recovery) return
    const sync = scheduleCanvasSnapshotSync({
      snapshot, session, saved, save, getSnapshot: () => snapshotRef.current,
      autoSave: !paused && !busy && !session.blocked,
      onDirty: () => { if (mounted.current) setStatus('有未保存的更改') },
      onDraftError: () => { if (mounted.current) setError('本地草稿备份失败，请及时保存到云端或使用编辑器导出工程') },
    })
    snapshotSyncRef.current = sync
    return () => sync.cancel()
  }, [snapshot, session, deleted, recovery, paused, busy, save])

  const generate = async (nodeId, options = {}) => {
    if (!session || generating.current || busy) return
    generating.current = true
    try {
      if (recovery) throw new Error('请先处理待恢复的本地草稿')
      if (session.pendingSave) throw new Error('请先找回上次保存')
      if (session.pendingBatch) { setOpen(true); throw new Error('请先在批次任务中找回上次批次提交') }
      const node = snapshotRef.current.nodes.find((node) => node.id === nodeId)
      if (!node || !mediaOperation(node.type) && node.type !== 'storyboard-node') throw new Error('请选择图片、视频或分镜节点')
      if (node.type === 'storyboard-node' && !bindingTarget(node, options.shotId)) throw new Error('原镜头不存在')
      if (node.type === 'storyboard-node' && options.shotId == null) throw new Error('请指定镜头')
      if (node.maskContent || snapshotRef.current.connections.some(c => c.to === nodeId && snapshotRef.current.nodes.find(n => n.id === c.from)?.maskContent)) throw new Error('云端暂不支持遮罩编辑，请移除遮罩后执行普通生成')
      if (mediaOperation(node.type)) {
        const expectedType = mediaOperation(node.type) === 'imageGenerate' ? 2 : 3
        const defaultModel = models.find(model => model.type === expectedType && model.defaultModel && (!model.supportedNodeTypes?.length || model.supportedNodeTypes.includes(node.type))) || models.find(model => model.type === expectedType && (!model.supportedNodeTypes?.length || model.supportedNodeTypes.includes(node.type)))
        const patch = Object.fromEntries(['model', 'ratio', 'resolution', 'duration'].filter(key => options[key] !== undefined).map(key => [key, options[key]]))
        if (!patch.model && !node.settings?.model) patch.model = defaultModel ? 'studio-' + defaultModel.id : ''
        if (!patch.model && !node.settings?.model) throw new Error('请先选择可用的云端媒体模型')
        if (node.settings?.videoPrompt != null) patch.prompt = node.settings.videoPrompt
        const next = { ...snapshotRef.current, nodes: snapshotRef.current.nodes.map(item => item.id === nodeId ? { ...item, settings: { ...item.settings, ...patch } } : item) }
        snapshotRef.current = next; setNodes(next.nodes)
      }
      const count = Number(options.imageConcurrency || options.concurrentImages || node.settings?.imageConcurrency || node.settings?.concurrentImages || 1)
      if (count > 1) { openBatch(nodeId, options.shotId, count); return }
      if (session.pendingGeneration) { setOpen(true); throw new Error('存在待确认的提交，请先找回提交') }
      const result = await save()
      const body = { canvasId: document.canvasId, revisionNo: result.revisionNo, nodeId, ...(options.shotId != null ? { shotId: String(options.shotId) } : {}), operation: options.operation || (mediaOperation(node.type) || (node.settings?.mode === 'image' ? 'imageGenerate' : 'videoGenerate')), clientRequestId: canvasRequestId('generate') }
      session.assertMediaWritable()
      session.assertGenerationModel(body)
      const estimate = await StudioCanvases.estimate(body)
      if (!estimate.sufficient && !estimate.unlimited) throw new Error(`积分不足，预计需要 ${estimate.creditCost}，当前余额 ${estimate.currentBalance}`)
      if (!await confirm('确认生成', uiText("使用已保存版本 v{0}，本次预留 {1} 积分，实际费用待核算。{2}", result.revisionNo, estimate.creditCost, estimate.unlimited ? uiText("当前账户不限额。") : uiText("余额 {0}。", estimate.currentBalance)))) return
      const task = await session.submit(body)
      putTask(task)
      if (!historyVisible) setOpen(true)
    } catch (reason) { report(reason); message.error(errorText(reason)) }
    finally { generating.current = false }
  }
  const action = async (operation) => {
    if (busy) return
    setBusy(true)
    try { setError(''); await operation() } catch (reason) { report(reason) }
    finally { if (mounted.current) setBusy(false) }
  }
  const exportLocal = () => onExportLocal?.()
  const backupLocal = async () => {
    const draft = await session.draft(clone(snapshotRef.current))
    session.write('conflict-backup', draft)
    setBackup(draft)
  }
  const loadRevisions = async (nextPage = 1) => {
    const result = await StudioCanvases.revisions(document.canvasId, nextPage)
    setRevisions(result.items); setRevisionPage(nextPage); setRevisionTotal(result.total)
  }
  const applyCloudDocument = async (result, expected = JSON.stringify(snapshotRef.current)) => {
    if (result.deleted || result.currentRevisionNo > result.revisionNo) { session.blocked = true; session.document.deleted = result.deleted; throw new Error('回执已确认，但云端已更新或删除；当前编辑已保留，请读取最新版本处理冲突') }
    const hydrated = await hydrateCanvasDocument(result, session.urls)
    if (JSON.stringify(snapshotRef.current) !== expected) throw new Error('读取期间画布发生变化，已保留当前编辑，请再次确认同步')
    session.adopt(hydrated)
    const next = { nodes: hydrated.project.nodes || [], connections: hydrated.project.connections || [], view: hydrated.project.view, projectName: hydrated.project.projectName || hydrated.name }
    saved.current = JSON.stringify(next)
    snapshotRef.current = next
    setNodes(next.nodes); setConnections(next.connections); setView(next.view); setProjectName(next.projectName)
    onCloudDocumentApplied?.()
    setRecovery(null); setPaused(false); setError(''); setStatus(`已同步 · v${session.revision}`)
  }
  const reload = async () => {
    if (!await confirm('读取最新云端版本', '将用云端版本替换当前编辑。当前内容会先保留为本地冲突备份。继续？')) return
    const expected = JSON.stringify(snapshotRef.current)
    await backupLocal()
    await applyCloudDocument(await StudioCanvases.detail(document.canvasId), expected)
  }
  const recoverSave = async () => {
    const expected = JSON.stringify(snapshotRef.current)
    const local = recovery || (expected !== saved.current ? await session.draft(clone(snapshotRef.current)) : null)
    if (local) session.write('draft', local)
    const result = await session.exclusive('save', () => session.sendSave())
    if (JSON.stringify(snapshotRef.current) !== expected) { setPaused(true); setStatus(`已找回 v${result.revisionNo}，新编辑已保留，请保存云端`); return }
    if (local) {
      const updated = { ...local, baseRevisionNo: result.revisionNo }
      session.write('draft', updated)
      const next = await session.restoreDraft(updated)
      snapshotRef.current = next
      setNodes(next.nodes); setConnections(next.connections); setView(next.view); setProjectName(next.projectName)
      setRecovery(null); setPaused(true)
      setStatus(`已找回 v${result.revisionNo}，当前编辑可继续保存`)
    } else await applyCloudDocument(result)
  }
  const migrate = async () => {
    const user = getStoredAuthUser()
    const key = `canvas-migration:${user?.id ?? user?.username}:${workspaceId}`
    let pending = JSON.parse(window.localStorage.getItem(key) || 'null')
    if (!pending) {
      pending = { name: projectName, clientRequestId: canvasRequestId('migrate') }
      window.localStorage.setItem(key, JSON.stringify(pending))
    }
    if (!migrationRef.current) {
      const created = pending.canvasId ? await StudioCanvases.detail(pending.canvasId) : await StudioCanvases.create(pending.name, pending.clientRequestId)
      pending.canvasId = created.canvasId
      window.localStorage.setItem(key, JSON.stringify(pending))
      migrationRef.current = new CanvasCloudSession(created, models, resolveMedia)
    }
    const snapshot = clone(snapshotRef.current)
    snapshot.nodes = snapshot.nodes.map((node) => {
      if (!mediaOperation(node.type)) return node
      const expectedType = mediaOperation(node.type) === 'imageGenerate' ? 2 : 3
      const matches = models.filter((model) => model.type === expectedType && [`studio-${model.id}`, model.modelCode, model.name].includes(node.settings?.model))
      return { ...node, settings: { ...node.settings, model: matches.length === 1 ? `studio-${matches[0].id}` : '', legacyModel: node.settings?.model || '' } }
    })
    const result = await migrationRef.current.save(snapshot)
    window.localStorage.removeItem(key)
    window.location.assign(`/canvas/${result.canvasId}`)
  }
  const rememberBatch = batch => {
    const ids = session.read('batchIds') || []
    session.write('batchIds', [...new Set([batch.batchId, ...ids])])
    batch.items?.forEach(item => putTask(item.generation))
    setBatchRevision(value => value + 1); setOpen(true)
  }
  const openBatch = (nodeId, shotId, count = 1) => {
    if (busy || recovery || session.blocked || session.pendingSave) { message.warning(uiText("请先处理本地草稿或保存冲突，再创建批次")); return }
    const items = []
    for (const node of snapshotRef.current.nodes) {
      if (nodeId && node.id !== nodeId) continue
      if (mediaOperation(node.type)) items.push({ nodeId: node.id, operation: mediaOperation(node.type), label: node.title || node.id })
      if (node.type === 'storyboard-node') for (const shot of node.settings?.shots || []) {
        if (shotId != null && String(shot.id) !== String(shotId)) continue
        if (shot.outputEnabled) continue
        items.push({ nodeId: node.id, shotId: String(shot.id), operation: node.settings.mode === 'video' ? 'videoGenerate' : 'imageGenerate', label: uiText("{0} / 镜头 {1}", node.title || node.id, shot.id) })
      }
    }
    setBatchCandidates(items.map((item, index) => ({ ...item, clientItemId: `item-${index + 1}`, count })))
  }
  const attachLibrary = async item => {
    const { url, source } = await session.attachLibrary(item)
    const viewport = snapshotRef.current.view
    setNodes(previous => [...previous, { id: canvasRequestId('node'), type: 'input-image', title: source?.snapshot?.name || item.name, x: (120 - viewport.x) / viewport.zoom, y: (120 - viewport.y) / viewport.zoom, width: 360, height: 300, content: url, settings: {} }])
  }
  const assertReady = () => {
    if (!session) throw new Error('请先打开云端画布')
    session.assertWritable()
    if (recovery || session.blocked || session.pendingSave) throw new Error('请先处理本地草稿或保存冲突')
  }
  const analysis = useCanvasAnalysis({ session, snapshotRef, setNodes, save, assertReady, saveToUndoStack, confirm })
  const textTasks = useCanvasTextTasks({ session, enabled: !!capabilities.textTasksReady, unavailableReason: capabilities.textUnavailableReason, models: textModels, snapshotRef, setNodes, save, report, confirm, assertReady, onOpen: () => { setHistoryTab('text'); setOpen(true) } })
  const libraryPublish = useCanvasLibraryPublish({ theme, session, enabled: !!capabilities.libraryPublishReady, snapshotRef, save, report, assertReady })
  const historyTabs = session ? [
        { key: 'analysis', label: uiText("媒体分析"), children: analysis.panel },
        { key: 'workflows', label: uiText("依赖工作流"), children: <CanvasWorkflowPanel saveToUndoStack={saveToUndoStack} analysis={analysis} session={session} enabled={!!capabilities.workflowReady} models={textModels} snapshotRef={snapshotRef} setNodes={setNodes} save={save} assertReady={assertReady} confirm={confirm} /> },
        { key: 'text', label: uiText("文本任务"), children: textTasks.panel },
        { key: 'batches', label: uiText("批次任务"), forceRender: true, children: <CanvasBatchHistory session={session} onTask={putTask} report={report} revision={batchRevision} /> },
        { key: 'tasks', label: uiText("生成任务"), children: <div className="canvas-history-panel">
          <div className="canvas-history-toolbar"><span className="canvas-history-count">{uiText("共") + " "}{total} {uiText("个任务")}</span><Space size={8}>
            {session.pendingGeneration && <Button size="small" disabled={busy} onClick={() => void action(async () => putTask(await session.recover()))}>{uiText("找回提交")}</Button>}
            <Button size="small" disabled={busy} onClick={() => void action(refresh)}>{uiText("刷新")}</Button>
          </Space></div>
          <Space wrap style={{ marginBottom: 12 }}>
            <input aria-label={uiText("筛选节点 ID")} placeholder={uiText("节点 ID")} value={filter.nodeId || ''} onChange={e => { setFilter({...filter,nodeId:e.target.value || undefined}); setPage(1) }} />
            <input aria-label={uiText("筛选镜头 ID")} placeholder={uiText("镜头 ID")} value={filter.shotId || ''} onChange={e => { setFilter({...filter,shotId:e.target.value || undefined}); setPage(1) }} />
            <input aria-label={uiText("筛选批次 ID")} placeholder={uiText("批次 ID")} value={filter.batchId || ''} onChange={e => { setFilter({...filter,batchId:e.target.value || undefined}); setPage(1) }} />
            <select aria-label={uiText("任务状态")} value={filter.status || ''} onChange={e => { setFilter({...filter,status:e.target.value ? Number(e.target.value) : undefined}); setPage(1) }}><option value="">{uiText("全部状态")}</option>{Object.entries(statuses).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select>
          </Space>
          <div className="canvas-history-list">
      {tasks.map((task) => <section key={task.generationId} className="canvas-history-card">
        <div className="canvas-history-card__heading">
          <div className="canvas-history-card__identity"><h3>{snapshotRef.current.nodes.find((node) => node.id === task.nodeId)?.title || (task.operation === 'videoGenerate' ? uiText("视频生成") : uiText("图片生成"))}</h3><span title={task.nodeId}>{task.nodeId}{task.shotId != null ? uiText(" / 镜头 {0}", task.shotId) : ''}{task.batchId != null ? uiText(" / 批次 {0}", task.batchId) : ''}</span></div>
          <Tag className="canvas-history-version">v{task.revisionNo}</Tag>
        </div>
        <div className="canvas-history-card__status"><Tag color={task.status === 3 ? 'success' : [4, 6].includes(task.status) ? 'warning' : [1, 2].includes(task.status) ? 'processing' : 'default'}>{statuses[task.status] || task.status}</Tag><span>{billings[task.billingState] || task.billingState}</span></div>
        {[1, 2].includes(task.status) && <Progress percent={Math.min(100, Math.max(0, Number(task.progress) || 0))} size="small" status="active" strokeColor="#7495ff" />}
        {task.billing && <p>{uiText("预留") + " "}{task.billing.reservedCredits ?? uiText("未知")} {uiText("· 已结算") + " "}{task.billing.settledCredits ?? uiText("待结算")} {uiText("积分")}</p>}
        {task.createdAt && <time className="canvas-history-time">{formatHistoryTime(task.createdAt)}</time>}
        {task.cancelRequested && <p>{uiText("已请求取消；供应商已受理时仍会返回结果并按实际计费。")}</p>}
        {task.error && <p>{task.error}</p>}
        {task.status === 6 && <p>{uiText("结果不确定，已停止轮询。")}{task.canSync ? uiText("可补拉已有任务。") : uiText("请联系管理员核查。")}</p>}
        <Space wrap className="canvas-history-card__actions" size={[8, 8]}>
          {taskAction(task, 'cancel') && <Button disabled={busy || task.cancelRequested} onClick={() => void action(async () => putTask(await StudioCanvases.cancel(document.canvasId, task.generationId)))}>{uiText("取消任务")}</Button>}
          {taskAction(task, 'syncResult') && <Button disabled={busy} onClick={() => void action(async () => putTask(await StudioCanvases.sync(document.canvasId, task.generationId)))}>{uiText("补拉结果")}</Button>}
          {taskAction(task, 'retrySettlement') && <Button disabled={busy} onClick={() => void action(async () => putTask(await StudioCanvases.retrySettlement(document.canvasId, task.generationId)))}>{uiText("重试结算")}</Button>}
          {taskAction(task, 'retry') && <Button disabled={busy} onClick={() => void action(async () => {
            const body = { canvasId: document.canvasId, revisionNo: task.revisionNo, nodeId: task.nodeId, ...(task.shotId != null ? { shotId: task.shotId } : {}), operation: task.operation, clientRequestId: canvasRequestId('retry') }
            const estimate = await StudioCanvases.estimate(body)
            if (!estimate.sufficient && !estimate.unlimited) throw new Error('积分不足')
            if (await confirm('重试原版本任务', uiText("预计消耗 {0} 积分，将创建新提交。", estimate.creditCost))) putTask(await session.submit({ canvasId: document.canvasId, generationId: task.generationId, clientRequestId: body.clientRequestId }, 'retry'))
          })}>{uiText("重试")}</Button>}
          {task.status === 3 && (task.outputs || []).map((asset, index) => <React.Fragment key={asset.assetId || index}><CanvasAssetPreview session={session} asset={asset} report={report} /><Button key={asset.assetId || index} disabled={busy} onClick={() => void action(async () => {
            const target = snapshotRef.current.nodes.find((node) => node.id === task.nodeId)
            if (!target || !bindingTarget(target, task.shotId)) throw new Error('原节点已删除，结果仍保留在任务和素材历史中')
            if (!await confirm('应用生成结果', uiText("将替换节点 {0} 的当前内容。该结果来自 v{1}，请确认当前节点仍适合使用。", task.nodeId, task.revisionNo))) return
            const imageUrls = task.operation === 'imageGenerate' ? await Promise.all(task.outputs.map(output => session.output(output))) : null
            const url = imageUrls ? imageUrls[index] : await session.output(asset)
            const latest = snapshotRef.current.nodes.find((node) => node.id === task.nodeId)
            if (JSON.stringify(latest) !== JSON.stringify(target)) throw new Error('节点在素材加载期间发生变化，请重新确认应用')
            setNodes((previous) => previous.map((node) => node.id === target.id && JSON.stringify(node) === JSON.stringify(target) ? applyNodeMediaResult(node, task, url, imageUrls, index) : node))
          })}>{uiText("应用结果") + " "}{index + 1}</Button></React.Fragment>)}
        </Space>
      </section>)}

            {!tasks.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={uiText("暂无生成任务")} />}
          </div>
          <div className="canvas-history-pagination"><span>{uiText("第") + " "}{page} / {Math.max(1, Math.ceil(total / 20))} {uiText("页")}</span><Space size={8}><Button size="small" disabled={page === 1} onClick={() => setPage(page - 1)}>{uiText("上一页")}</Button><Button size="small" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>{uiText("下一页")}</Button></Space></div>
          <div className="canvas-history-note">{uiText("支持独立节点、镜头生成与批次任务。")}<details><summary>{uiText("查看当前支持范围")}</summary><p>{uiText("批次中的任务独立执行；已开放的文本依赖操作请使用「依赖工作流」。高级媒体、遮罩及首尾帧暂未开放。")}</p></details></div>
        </div> },
        { key: 'assets', label: uiText("素材库"), children: <div className="canvas-history-panel">
      <CanvasAssets session={session} report={report} onInsert={async (asset) => {
        const url = await session.output(asset)
        const kind = asset.mimeType?.split('/')[0] || asset.mediaType
        if (!['image', 'video'].includes(kind)) throw new Error('此素材可预览或下载，暂不支持插入节点')
        const viewport = snapshotRef.current.view
        setNodes((previous) => [...previous, { id: canvasRequestId('node'), type: kind === 'video' ? 'video-input' : 'input-image', x: (120 - viewport.x) / viewport.zoom, y: (120 - viewport.y) / viewport.zoom, width: 360, height: 300, content: url, settings: {} }])
      }} />

        </div> },
        { key: 'revisions', label: uiText("修订记录"), children: <div className="canvas-history-panel">
          <div className="canvas-history-toolbar"><span className="canvas-history-count">{uiText("当前版本 v")}{session.revision}</span></div>
          <div className="canvas-history-copy">        <Button disabled={busy} onClick={() => void action(async () => {
          const name = await canvasPrompt(uiText("复制已保存版本的画布名称"), `${projectName} 副本`)
          if (!name?.trim()) return
          const copied = await session.projectOperation('copy', { canvasId: document.canvasId, sourceRevisionNo: session.revision, name: name.trim() })
          window.open(`/canvas/${copied.canvasId}`, '_blank', 'noopener,noreferrer')
        })}>{uiText("复制已保存版本")}</Button>
</div>
          <div className="canvas-history-list">      {revisions.map((revision) => <div key={revision.revisionNo} className="canvas-history-revision">
        <div><strong>{uiText("版本") + " "}{revision.revisionNo}</strong><time className="canvas-history-time">{formatHistoryTime(revision.createdAt)}</time></div>
        <Button size="small" disabled={busy || session.blocked} onClick={() => void action(async () => {
          if (!await confirm('恢复历史版本', '将此历史恢复为新的云端版本。当前编辑会先备份到本地。')) return
          const expected = JSON.stringify(snapshotRef.current)
          await backupLocal()
          const result = await session.projectOperation('restore', { canvasId: document.canvasId, expectedRevisionNo: session.revision, sourceRevisionNo: revision.revisionNo })
          await applyCloudDocument(result, expected)
        })}>{uiText("恢复")}</Button>
      </div>)}

            {!revisions.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={uiText("暂无修订记录")} />}
          </div>      {!!revisionTotal && <Space className="canvas-history-pagination"><Button disabled={revisionPage <= 1 || busy} onClick={() => void action(() => loadRevisions(revisionPage - 1))}>{uiText("上一页修订")}</Button><Button disabled={revisionPage * 20 >= revisionTotal || busy} onClick={() => void action(() => loadRevisions(revisionPage + 1))}>{uiText("下一页修订")}</Button></Space>}

        </div> },
      ] : []
  const unavailable = deleted || error.includes('画布已删除')
  const syncTone = unavailable || error ? 'error' : busy ? 'busy' : paused || recovery || session?.blocked ? 'warning' : 'ready'
  const controls = !session ? <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 80 }}>
    <Button loading={busy} onClick={() => void action(migrate)}>{uiText("复制本地画布到云端")}</Button>
    {error && <Alert type="error" message={error} />}
  </div> : <>
    {libraryPublish.modal}
    {batchCandidates && <CanvasBatchPanel session={session} candidates={batchCandidates} save={save} onClose={() => setBatchCandidates(null)} onBatch={rememberBatch} />}
    <section className={`canvas-sync-panel canvas-sync-panel--${syncTone}`} aria-label={uiText("画布保存与同步")}>
      <div className="canvas-sync-panel__header">
        <div className="canvas-sync-panel__status"><span className="canvas-sync-panel__dot" aria-hidden="true" /><div><strong>{uiText("保存与同步")}</strong><span role="status">{unavailable ? uiText("画布已删除 · 同步已停止") : uiStatusText(status)}</span></div></div>
        <div className="canvas-sync-panel__primary-actions">
          {!unavailable && <Button type="primary" loading={busy} disabled={busy || !!recovery || session.blocked} onClick={() => void save().catch(() => {})}>{uiText("保存云端")}</Button>}
          <Button onClick={() => setOpen(true)}>{uiText("历史 / 素材")}</Button>
          {!unavailable && capabilities.libraryPublishReady && <Button disabled={busy} onClick={() => libraryPublish.show()}>{uiText("图片入库")}</Button>}
          {!unavailable && <Button disabled={busy || !!recovery || capabilities.mediaWriteReady === false} onClick={() => openBatch()}>{uiText("批量生成")}</Button>}
          {!unavailable && capabilities.workflowReady && <Button disabled={busy || !!recovery} onClick={() => { setHistoryTab('workflows'); setOpen(true) }}>{uiText("依赖工作流")}</Button>}
        </div>
      </div>
      {capabilities.mediaWriteReady === false && <Alert type="warning" message={uiText("媒体写入暂不可用；文字编辑、已有素材读取和历史任务仍可使用")} />}
      {(error || unavailable) && <div className="canvas-sync-panel__notice" role="alert"><span className="canvas-sync-panel__notice-icon" aria-hidden="true">!</span><div><strong>{unavailable ? uiText("当前画布无法继续同步") : uiText("云端同步未完成")}</strong><p>{unavailable ? uiText("当前内容仍在页面中，可先保存到本地，再返回画布列表。") : error}</p></div></div>}
      {(unavailable || session.blocked || (!unavailable && (session.pendingSave || backup))) && <div className="canvas-sync-panel__recovery-actions">
        {(unavailable || session.blocked) && <Button onClick={exportLocal}>{uiText("保存本地工程")}</Button>}
        {unavailable && <Button href="/canvases">{uiText("返回画布列表")}</Button>}
        {!unavailable && session.pendingSave && !session.blocked && <Button disabled={busy} onClick={() => void action(recoverSave)}>{uiText("找回上次保存")}</Button>}
        {!unavailable && session.blocked && <Button disabled={busy} onClick={() => void action(reload)}>{uiText("读取云端版本")}</Button>}
        {!unavailable && backup && <Button disabled={busy} onClick={() => setRecovery(backup)}>{uiText("恢复本地备份")}</Button>}
      </div>}
      {!unavailable && recovery && <div className="canvas-sync-panel__draft"><div><strong>{uiText("发现未保存的本地草稿")}</strong><p>{uiText("选择恢复草稿，或继续使用当前云端版本。")}</p></div><div className="canvas-sync-panel__recovery-actions">
        <Button disabled={busy} onClick={() => void action(async () => { const draft = await session.restoreDraft(recovery); setNodes(draft.nodes); setConnections(draft.connections); setView(draft.view); setProjectName(draft.projectName); setRecovery(null); if (session.blocked) setError('草稿来自其他修订，仅恢复到本地；请导出后处理版本冲突') })}>{uiText("恢复草稿")}</Button>
        <Button disabled={busy || !!session.pendingSave} onClick={() => { session.write('draft', null); setRecovery(null) }}>{uiText("使用云端版本")}</Button>
      </div></div>}
    </section>
    <Drawer closable={{ placement: 'end' }} rootClassName="canvas-history-drawer" title={<div className="canvas-history-title"><span>{uiText("云端画布历史")}</span><small title={projectName}>{projectName}</small></div>} open={open} onClose={() => setOpen(false)} width={560}>
      {error && <Alert className="canvas-history-alert" type="error" showIcon message={error} />}
      <Tabs activeKey={historyTab} onChange={(key) => { setHistoryTab(key); if (key === 'revisions') void action(() => loadRevisions()) }} items={historyTabs} />
    </Drawer>
  </>
  const retryNodeAssets = async node => {
    const { replacements, failure } = await session.retryNodeAssets(node)
    const replace = value => {
      if (typeof value === 'string') return replacements.get(value) || value
      if (Array.isArray(value)) return value.map(replace)
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key.startsWith('_canvas') ? item : replace(item)]))
      return value
    }
    if (mounted.current && replacements.size) setNodes(previous => previous.map(current => current.id === node.id ? replace(current) : current))
    if (failure) throw failure
  }
  return { retryNodeAssets, analysis, renderAnalysisNode: analysis.renderNode, analysisExecute: analysis.execute, renderChat: props => session ? <CanvasCloudChat session={session} enabled={!!capabilities.chatReady} save={save} assertReady={assertReady} confirm={confirm} {...props} /> : null, getPreviewLink: node => previewLink(node, session, window.location.href), unsupported: operation => message.warning(operation + uiText("尚未在云端开放")), generate, openBatch, attachLibrary, textExecute: textTasks.execute, textModels, textReady: !!capabilities.textTasksReady, publishReady: !!capabilities.libraryPublishReady, publishLibrary: libraryPublish.show, refreshModels: onRefreshCloudModels, controls, historyPanel: session ? <>{error && <Alert className="canvas-history-alert" type="error" showIcon message={error} />}{historyTabs.find(tab => tab.key === 'tasks').children}</> : null }
}

function CanvasAssets({ session, report, onInsert }) {
  useUiLanguage()

  const [assets, setAssets] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const load = async (nextPage = page) => {
    const result = await StudioCanvases.assets(session.document.canvasId, nextPage)
    setAssets(result.items); setPage(nextPage); setTotal(result.total)
  }
  const run = async (operation) => { setBusy(true); try { await operation() } catch (error) { report(error) } finally { setBusy(false) } }
  useEffect(() => {
    let active = true
    setBusy(true)
    StudioCanvases.assets(session.document.canvasId, 1).then((result) => {
      if (active) { setAssets(result.items); setPage(1); setTotal(result.total) }
    }).catch((error) => { if (active) report(error) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [session, report])
  return <section className="canvas-history-assets">
    <Space wrap className="canvas-history-toolbar"><Button disabled={busy} onClick={() => void run(() => load())}>{uiText("刷新素材")}</Button>
      <Button disabled={busy} onClick={() => void run(async () => {
        const id = await canvasPrompt(uiText("输入本人其他画布中的素材 assetId"))
        if (!id) return
        if (!/^[1-9]\d*$/.test(id)) throw new Error('请输入有效的素材 ID')
        await StudioCanvases.attach(session.document.canvasId, id); await load(1)
      })}>{uiText("关联其他画布素材")}</Button></Space>
    <div className="canvas-history-list">
    {!assets.length && !busy && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={uiText("暂无素材")} />}
    {assets.map((asset) => <div key={asset.assetId} className="canvas-history-card">
      <div className="canvas-history-asset-name" title={asset.name}>{asset.name}</div>
      <div className="canvas-history-time">{uiText("素材 #")}{asset.assetId} · {asset.mimeType || asset.mediaType}</div>
      {asset.availability === 'missing' && <Alert type="warning" message={uiText("素材缺失，名称与来源仍保留")} description={asset.unavailableCode} />}
      {(asset.sources || []).map(source => <details key={source.sourceLinkId}><summary>{uiText("来源：")}{source.snapshot?.name || source.libraryItemId}{source.snapshot?.lookName ? ` · ${source.snapshot.lookName}` : ''}</summary><p>{source.snapshot?.identityPrompt}</p><p>{source.snapshot?.lookPrompt}</p><Button size="small" disabled={busy} onClick={() => void run(() => onInsert({ ...asset, sourceLinkId: source.sourceLinkId }))}>{uiText("使用此来源添加参考图")}</Button></details>)}
      <Space wrap className="canvas-history-card__actions">
      <CanvasAssetPreview session={session} asset={asset} report={report} />
      <Button size="small" disabled={busy || asset.availability === 'missing'} onClick={() => void run(() => onInsert(asset))}>{uiText("插入画布")}</Button>

        <Button size="small" disabled={busy} onClick={() => void run(async () => {
          const blob = await StudioCanvases.content(session.document.canvasId, asset.assetId, true)
          const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a')
          anchor.href = url; anchor.download = asset.name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        })}>{uiText("下载")}</Button>
        <Button size="small" disabled={busy} onClick={() => void run(async () => {
          if (await confirm('移除素材', '只从素材列表移除，保留历史版本引用。')) { await StudioCanvases.removeAsset(session.document.canvasId, asset.assetId); await load() }
        })}>{uiText("移除")}</Button>
      </Space>
    </div>)}
    </div>
    <Space className="canvas-history-pagination"><Button disabled={busy || page <= 1} onClick={() => void run(() => load(page - 1))}>{uiText("上一页素材")}</Button><Button disabled={busy || page * 100 >= total} onClick={() => void run(() => load(page + 1))}>{uiText("下一页素材")}</Button></Space>
  </section>
}




function CanvasAssetPreview({ session, asset, report }) {
  useUiLanguage()

  const [url, setUrl] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const preview = async () => {
    setBusy(true)
    try { if (!url) setUrl(await session.output(asset)); setOpen(true) } catch (reason) { report(reason) } finally { setBusy(false) }
  }
  const kind = asset.mimeType?.split('/')[0] || asset.mediaType
  return <><Button size="small" loading={busy} onClick={() => void preview()}>{uiText("预览")}</Button>
    <Modal title={asset.name || uiText("生成结果")} open={open} footer={null} onCancel={() => setOpen(false)} destroyOnClose>
      {url && (kind === 'video' ? <video src={url} controls style={{ width: '100%' }} /> : kind === 'audio' ? <audio src={url} controls /> : <img src={url} alt={asset.name || uiText("生成结果")} style={{ width: '100%' }} />)}
    </Modal></>
}
