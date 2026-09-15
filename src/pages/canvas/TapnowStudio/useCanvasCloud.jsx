import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Drawer, Modal, Space, Tag, message } from 'antd'
import { StudioCanvases, canvasRequestId } from '../../../services/studioCanvases'
import { CanvasCloudSession } from './canvasCloud'
import { getStoredAuthUser } from '../../../auth'

const statuses = { 1: '等待执行', 2: '执行中', 3: '成功', 4: '提交失败', 5: '调用前取消', 6: '结果待核查' }
const billings = { reserved: '积分已预留', settled: '已结算', released: '已释放', pendingReview: '待核算' }
const confirm = (title, content) => new Promise((resolve) => Modal.confirm({ title, content, onOk: () => resolve(true), onCancel: () => resolve(false) }))
const clone = (value) => JSON.parse(JSON.stringify(value))
const errorText = (error) => error?.message || '画布请求失败'

export function useCanvasCloud({ document, workspaceId, models, nodes, connections, view, projectName, setNodes, setConnections, setView, setProjectName, resolveMedia }) {
  const migrationRef = useRef(null)
  const sessionRef = useRef(null)
  if (document && !sessionRef.current) sessionRef.current = new CanvasCloudSession(document, models, resolveMedia)
  const session = sessionRef.current
  const snapshot = { nodes, connections, view, projectName }
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const serialized = JSON.stringify(snapshot)
  const saved = useRef(serialized)
  const [status, setStatus] = useState('已加载云端版本')
  const [error, setError] = useState('')
  const [paused, setPaused] = useState(!!session?.pendingSave)
  const [busy, setBusy] = useState(false)
  const generating = useRef(false)
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [revisions, setRevisions] = useState([])
  const [revisionPage, setRevisionPage] = useState(1)
  const [revisionTotal, setRevisionTotal] = useState(0)
  const activeTasks = useRef(new Map())
  const [recovery, setRecovery] = useState(() => session?.read('draft') || null)
  const mounted = useRef(true)

  const historyRequest = useRef(0)
  const putTask = useCallback((task, insert = true) => {
    if (!task || !mounted.current) return
    if ([1, 2].includes(task.status)) activeTasks.current.set(String(task.generationId), task)
    else activeTasks.current.delete(String(task.generationId))
    setTasks((previous) => insert ? [task, ...previous.filter((item) => String(item.generationId) !== String(task.generationId))] : previous.map((item) => String(item.generationId) === String(task.generationId) ? task : item))
  }, [])
  const refresh = useCallback(async () => {
    if (!session) return
    const requestId = ++historyRequest.current
    const result = await StudioCanvases.generations(document.canvasId, page)
    if (!mounted.current || requestId !== historyRequest.current) return
    setTasks(result.items)
    setTotal(result.total)
    result.items.forEach((task) => { if ([1, 2].includes(task.status)) activeTasks.current.set(String(task.generationId), task); else activeTasks.current.delete(String(task.generationId)) })
  }, [session, document, page])
  const report = useCallback((reason) => { if (mounted.current) setError(errorText(reason)) }, [])
  const save = useCallback(async () => {
    if (!session) return
    const current = clone(snapshotRef.current)
    setBusy(true)
    setStatus('正在保存…')
    try {
      const result = await session.save(current)
      saved.current = JSON.stringify(current)
      if (JSON.stringify(snapshotRef.current) === saved.current) session.write('draft', null)
      if (mounted.current) { setStatus(`已保存 · v${result.revisionNo}`); setError(''); setPaused(false) }
      return result
    } catch (reason) {
      if (mounted.current) { setStatus('尚未保存到云端'); setPaused(true) }
      report(reason)
      throw reason
    } finally { if (mounted.current) setBusy(false) }
  }, [session, report])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; session?.dispose() }
  }, [session])
  useEffect(() => { if (session) void refresh().catch(report) }, [session, refresh, report])
  useEffect(() => {
    if (!session) return
    let cancelled = false
    let timer
    const poll = async () => {
      for (const task of activeTasks.current.values()) {
        if (cancelled) return
        try {
          const result = await StudioCanvases.generation(document.canvasId, task.generationId)
          if (!cancelled) putTask(result, false)
        } catch (reason) { if (!cancelled) report(reason); break }
      }
      if (!cancelled) timer = window.setTimeout(poll, 2500)
    }
    timer = window.setTimeout(poll, 2500)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [session, document, putTask, report])
  useEffect(() => {
    if (!session || recovery || serialized === saved.current) return
    let cancelled = false
    void session.draft(clone(snapshotRef.current)).then((draft) => {
      if (!cancelled && serialized !== saved.current) session.write('draft', draft)
    }).catch(() => { if (!cancelled) setError('本地草稿备份失败，请及时保存到云端或使用编辑器导出工程') })
    if (paused || busy || session.blocked) return () => { cancelled = true }
    setStatus('有未保存的更改')
    const timer = window.setTimeout(() => { void save().catch(() => {}) }, 1500)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [serialized, session, recovery, paused, busy, save])

  const generate = async (nodeId, options = {}) => {
    if (!session || generating.current || busy) return
    generating.current = true
    try {
      if (recovery) throw new Error('请先处理待恢复的本地草稿')
      if (session.pendingSave) throw new Error('请先找回上次保存')
      const node = snapshotRef.current.nodes.find((node) => node.id === nodeId)
      if (!node || !['gen-image', 'gen-video'].includes(node.type) || options.shotId != null) throw new Error('首版仅支持独立图片或视频节点，暂不支持分镜和其他生成入口')
      if (Number(options.imageConcurrency || 1) !== 1) throw new Error('首版仅支持单个输出，请将图片张数设为 1')
      if (session.pendingGeneration) { setOpen(true); throw new Error('存在待确认的提交，请先找回提交') }
      const result = await save()
      const body = { canvasId: document.canvasId, revisionNo: result.revisionNo, nodeId, operation: node.type === 'gen-image' ? 'imageGenerate' : 'videoGenerate', clientRequestId: canvasRequestId('generate') }
      const estimate = await StudioCanvases.estimate(body)
      if (!estimate.sufficient && !estimate.unlimited) throw new Error(`积分不足，预计需要 ${estimate.creditCost}，当前余额 ${estimate.currentBalance}`)
      if (!await confirm('确认生成', `使用已保存版本 v${result.revisionNo}，预计消耗 ${estimate.creditCost} 积分。${estimate.unlimited ? '当前账户不限额。' : `余额 ${estimate.currentBalance}。`}`)) return
      const task = await session.submit(body)
      putTask(task)
      setOpen(true)
    } catch (reason) { report(reason); message.error(errorText(reason)) }
    finally { generating.current = false }
  }
  const action = async (operation) => {
    if (busy) return
    setBusy(true)
    try { setError(''); await operation() } catch (reason) { report(reason) }
    finally { if (mounted.current) setBusy(false) }
  }
  const exportLocal = () => {
    const blob = new Blob([JSON.stringify(snapshotRef.current, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url; anchor.download = 'canvas-local-draft.json'; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const loadRevisions = async (nextPage = 1) => {
    const result = await StudioCanvases.revisions(document.canvasId, nextPage)
    setRevisions(result.items); setRevisionPage(nextPage); setRevisionTotal(result.total)
  }
  const reload = async () => {
    if (!await confirm('打开最新云端版本', '当前未保存的编辑将退出。建议先使用编辑器的工程导出保存素材及本地内容。继续？')) return
    session.write('draft', null); session.write('save', null)
    window.location.reload()
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
      if (!['gen-image', 'gen-video'].includes(node.type)) return node
      const expectedType = node.type === 'gen-image' ? 2 : 3
      const matches = models.filter((model) => model.type === expectedType && [`studio-${model.id}`, model.modelCode, model.name].includes(node.settings?.model))
      return { ...node, settings: { ...node.settings, model: matches.length === 1 ? `studio-${matches[0].id}` : '', legacyModel: node.settings?.model || '' } }
    })
    const result = await migrationRef.current.save(snapshot)
    window.localStorage.removeItem(key)
    window.location.assign(`/canvas/${result.canvasId}`)
  }
  const controls = !session ? <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 80 }}>
    <Button loading={busy} onClick={() => void action(migrate)}>复制本地画布到云端</Button>
    {error && <Alert type="error" message={error} />}
  </div> : <>
    <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 80, maxWidth: 'min(640px, 90%)', padding: 10, background: '#20232b', color: '#fff', borderRadius: 10 }}>
      <Space wrap>
        <span aria-live="polite">{status}</span>
        <Button size="small" loading={busy} disabled={!!recovery || session.blocked} onClick={() => void save().catch(() => {})}>保存云端</Button>
        <Button size="small" onClick={() => setOpen(true)}>云端历史 / 素材</Button>
      </Space>
      {error && <Alert style={{ marginTop: 8 }} type="error" showIcon message={error} />}
      {session.pendingSave && !session.blocked && <Button disabled={busy} onClick={() => void action(async () => {         const local = recovery || (serialized !== saved.current ? await session.draft(clone(snapshotRef.current)) : null)
        const result = await session.sendSave()
        if (local) session.write('draft', { ...local, baseRevisionNo: result.revisionNo })
        window.location.reload() })}>找回上次保存</Button>}
      {session.blocked && <Space><Button onClick={exportLocal}>导出本地快照</Button><Button onClick={() => void reload()}>打开最新云端版本</Button></Space>}
      {recovery && <Alert type="warning" message="发现尚未保存的本地草稿" action={<Space>
        <Button disabled={busy} onClick={() => void action(async () => { const draft = await session.restoreDraft(recovery); setNodes(draft.nodes); setConnections(draft.connections); setView(draft.view); setProjectName(draft.projectName); setRecovery(null); if (session.blocked) setError('草稿来自其他修订，仅恢复到本地；请导出后处理版本冲突') })}>恢复草稿</Button>
        <Button disabled={!!session.pendingSave} onClick={() => { session.write('draft', null); setRecovery(null) }}>使用云端版本</Button>
      </Space>} />}
    </div>
    <Drawer title="云端画布历史" open={open} onClose={() => setOpen(false)} width={520}>
      {error && <Alert type="error" message={error} />}
      <Space wrap style={{ marginBottom: 16 }}>
        <Button disabled={busy} onClick={() => void action(refresh)}>刷新任务</Button>
        <Button disabled={busy || !session.pendingGeneration} onClick={() => void action(async () => putTask(await session.recover()))}>找回提交</Button>
        <Button disabled={busy} onClick={() => void action(() => loadRevisions())}>修订历史</Button>
        <Button disabled={busy} onClick={() => void action(async () => {
          const name = window.prompt('复制已保存版本的画布名称', `${projectName} 副本`)
          if (!name?.trim()) return
          const copied = await StudioCanvases.copy(document.canvasId, session.revision, name.trim(), canvasRequestId('copy'))
          window.open(`/canvas/${copied.canvasId}`, '_blank', 'noopener,noreferrer')
        })}>复制已保存版本</Button>
      </Space>
      <CanvasAssets session={session} report={report} onInsert={async (asset) => {
        const url = await session.output(asset)
        const kind = asset.mimeType?.split('/')[0] || asset.mediaType
        if (!['image', 'video'].includes(kind)) throw new Error('此素材可预览或下载，暂不支持插入节点')
        const viewport = snapshotRef.current.view
        setNodes((previous) => [...previous, { id: canvasRequestId('node'), type: kind === 'video' ? 'video-input' : 'input-image', x: (120 - viewport.x) / viewport.zoom, y: (120 - viewport.y) / viewport.zoom, width: 360, height: 300, content: url, settings: {} }])
      }} />
      {revisions.map((revision) => <div key={revision.revisionNo} style={{ marginBottom: 8 }}>
        v{revision.revisionNo} · {revision.createdAt}
        <Button size="small" disabled={busy || session.blocked} onClick={() => void action(async () => {
          if (!await confirm('恢复历史版本', '将此历史恢复为新的云端版本，并重新打开页面。当前未保存内容请先导出。')) return
          await StudioCanvases.restore(document.canvasId, session.revision, revision.revisionNo, canvasRequestId('restore'))
          session.write('draft', null); session.write('save', null); window.location.reload()
        })}>恢复</Button>
      </div>)}
      {!!revisionTotal && <Space><Button disabled={revisionPage <= 1 || busy} onClick={() => void action(() => loadRevisions(revisionPage - 1))}>上一页修订</Button><Button disabled={revisionPage * 20 >= revisionTotal || busy} onClick={() => void action(() => loadRevisions(revisionPage + 1))}>下一页修订</Button></Space>}
      <h3>生成任务</h3>
      {tasks.map((task) => <section key={task.generationId} style={{ padding: '12px 0', borderBottom: '1px solid #ddd' }}>
        <div>{task.nodeId} · v{task.revisionNo}</div>
        <Tag>{statuses[task.status] || task.status} {task.status === 2 ? `${task.progress || 0}%` : ''}</Tag><Tag>{billings[task.billingState] || task.billingState}</Tag>
        {task.cancelRequested && <p>已请求取消；供应商已受理时仍会返回结果并按实际计费。</p>}
        {task.error && <p>{task.error}</p>}
        {task.status === 6 && <p>结果不确定，已停止轮询。{task.canSync ? '可补拉已有任务。' : '请联系管理员核查。'}</p>}
        <Space wrap>
          {[1, 2].includes(task.status) && <Button disabled={busy || task.cancelRequested} onClick={() => void action(async () => putTask(await StudioCanvases.cancel(document.canvasId, task.generationId)))}>请求取消</Button>}
          {task.canSync && <Button disabled={busy} onClick={() => void action(async () => putTask(await StudioCanvases.sync(document.canvasId, task.generationId)))}>补拉 / 核算</Button>}
          {[4, 5].includes(task.status) && task.billingState === 'released' && <Button disabled={busy} onClick={() => void action(async () => {
            const body = { canvasId: document.canvasId, revisionNo: task.revisionNo, nodeId: task.nodeId, operation: task.operation, clientRequestId: canvasRequestId('retry') }
            const estimate = await StudioCanvases.estimate(body)
            if (!estimate.sufficient && !estimate.unlimited) throw new Error('积分不足')
            if (await confirm('重试原版本任务', `预计消耗 ${estimate.creditCost} 积分，将创建新提交。`)) putTask(await session.submit({ canvasId: document.canvasId, generationId: task.generationId, clientRequestId: body.clientRequestId }, 'retry'))
          })}>重试</Button>}
          {task.status === 3 && (task.outputs || []).map((asset, index) => <React.Fragment key={asset.assetId || index}><CanvasAssetPreview session={session} asset={asset} report={report} /><Button key={asset.assetId || index} disabled={busy} onClick={() => void action(async () => {
            const target = snapshotRef.current.nodes.find((node) => node.id === task.nodeId)
            if (!target) throw new Error('原节点已删除，结果仍保留在任务和素材历史中')
            if (!await confirm('应用生成结果', `将替换节点 ${task.nodeId} 的当前内容。该结果来自 v${task.revisionNo}，请确认当前节点仍适合使用。`)) return
            const url = await session.output(asset)
            const latest = snapshotRef.current.nodes.find((node) => node.id === task.nodeId)
            if (JSON.stringify(latest) !== JSON.stringify(target)) throw new Error('节点在素材加载期间发生变化，请重新确认应用')
            setNodes((previous) => previous.map((node) => node.id === target.id ? { ...node, content: url } : node))
          })}>应用结果 {index + 1}</Button></React.Fragment>)}
        </Space>
      </section>)}
      {!tasks.length && <p>暂无生成任务</p>}
      <Space style={{ marginTop: 12 }}><Button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><span>{page}</span><Button disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>下一页</Button></Space>
      <p>首版支持独立图片、视频生成，每次一个输出。分镜、整图执行、遮罩、首尾帧及自定义供应商配置暂不支持。</p>
    </Drawer>
  </>
  return { generate, controls }
}

function CanvasAssets({ session, report, onInsert }) {
  const [assets, setAssets] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const load = async (nextPage = page) => {
    const result = await StudioCanvases.assets(session.document.canvasId, nextPage)
    setAssets(result.items); setPage(nextPage); setTotal(result.total)
  }
  const run = async (operation) => { setBusy(true); try { await operation() } catch (error) { report(error) } finally { setBusy(false) } }
  return <details onToggle={(event) => { if (event.currentTarget.open) void run(() => load()) }}>
    <summary>素材库</summary>
    <Space><Button disabled={busy} onClick={() => void run(() => load())}>刷新素材</Button>
      <Button disabled={busy} onClick={() => void run(async () => {
        const id = window.prompt('输入本人其他画布中的素材 assetId')
        if (!id) return
        if (!/^[1-9]\d*$/.test(id)) throw new Error('请输入有效的素材 ID')
        await StudioCanvases.attach(session.document.canvasId, id); await load(1)
      })}>关联其他画布素材</Button></Space>
    {assets.map((asset) => <div key={asset.assetId} style={{ padding: '8px 0' }}>
      <CanvasAssetPreview session={session} asset={asset} report={report} />
      <Button size="small" disabled={busy} onClick={() => void run(() => onInsert(asset))}>插入画布</Button>
      {asset.name} · #{asset.assetId}
      <Space>
        <Button size="small" disabled={busy} onClick={() => void run(async () => {
          const blob = await StudioCanvases.content(session.document.canvasId, asset.assetId, true)
          const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a')
          anchor.href = url; anchor.download = asset.name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        })}>下载</Button>
        <Button size="small" disabled={busy} onClick={() => void run(async () => {
          if (await confirm('移除素材', '只从素材列表移除，保留历史版本引用。')) { await StudioCanvases.removeAsset(session.document.canvasId, asset.assetId); await load() }
        })}>移除</Button>
      </Space>
    </div>)}
    <Space><Button disabled={busy || page <= 1} onClick={() => void run(() => load(page - 1))}>上一页素材</Button><Button disabled={busy || page * 100 >= total} onClick={() => void run(() => load(page + 1))}>下一页素材</Button></Space>
  </details>
}




function CanvasAssetPreview({ session, asset, report }) {
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const preview = async () => {
    setBusy(true)
    try { if (!url) setUrl(await session.output(asset)); setOpen(true) } catch (reason) { report(reason) } finally { setBusy(false) }
  }
  const kind = asset.mimeType?.split('/')[0] || asset.mediaType
  return <><Button size="small" loading={busy} onClick={() => void preview()}>预览</Button>
    <Modal title={asset.name || '生成结果'} open={open} footer={null} onCancel={() => setOpen(false)} destroyOnClose>
      {url && (kind === 'video' ? <video src={url} controls style={{ width: '100%' }} /> : kind === 'audio' ? <audio src={url} controls /> : <img src={url} alt={asset.name || '生成结果'} style={{ width: '100%' }} />)}
    </Modal></>
}
