import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Image, Input, InputNumber, List, Modal, Pagination, Popconfirm, Select, Space, Tag, Typography, message } from 'antd'
import { StudioDirectorDesks as api, type DirectorBinding, type DirectorCapture, type DirectorDesk, type DirectorDeskSummary, type DirectorReference, type DirectorReferenceSelection } from '../../services/studioDirectorDesks'
import { StudioAssetGenerationApi, type StudioStoryboardVideoReferenceOption } from '../../services/studioAssetGeneration'
import { getApiErrorMessage } from '../../services/apiErrors'
import { useDirectorStore } from './runtime/editor/store/directorStore'
import { captureDirectorSnapshot, readDirectorSnapshot } from './directorCloudSnapshot'
import { parseDirectorProjectDocument } from './runtime/editor/io/projectDocument'
import { StudioModelsApi, type StudioGenerationModel } from '../../services/studioModels'
import DirectorCaptureImageForm from './DirectorCaptureImageForm'
import { saveAndUploadDirectorFrame } from './directorCloudUpload'

interface Props {
  editorRoot: React.RefObject<HTMLDivElement>
  initialSegmentId?: string
  onOpen: (desk: DirectorDesk) => void
  cloudReady: number
  onDirtyChange: (value: boolean) => void
}
const fingerprint = (bindings: DirectorBinding[]) => JSON.stringify({ ...readDirectorSnapshot(), characterBindings: bindings })

export default function DirectorDeskCloudPanel({ editorRoot, initialSegmentId, onOpen, cloudReady, onDirtyChange }: Props) {
  const [desk, setDesk] = useState<DirectorDesk | null>(null)
  const [bindings, setBindings] = useState<DirectorBinding[]>([])
  const [dirty, setDirty] = useState(false)
  const baseline = useRef('')
  const lock = useRef(false)
  const mounted = useRef(true)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<DirectorDeskSummary[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [name, setName] = useState('新导演台工程')
  const [segmentId, setSegmentId] = useState(initialSegmentId || '')
  const [captures, setCaptures] = useState<DirectorCapture[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [revision, setRevision] = useState<number | null>(null)
  const [reference, setReference] = useState<DirectorReference | null>(null)
  const [referenceSegment, setReferenceSegment] = useState('')
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [referenceBindings, setReferenceBindings] = useState<DirectorBinding[]>([])
  const [referenceAspectRatio, setReferenceAspectRatio] = useState('16:9')
  const [videoModels, setVideoModels] = useState<StudioGenerationModel[]>([])
  const [modelId, setModelId] = useState<number | null>(null)
  const [selection, setSelection] = useState<DirectorReferenceSelection | null>(null)
  const [options, setOptions] = useState<StudioStoryboardVideoReferenceOption[]>([])
  const [bindingOpen, setBindingOpen] = useState(false)
  const objects = useDirectorStore((state) => state.project.objects)

  async function run(work: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    // Also block editor actions and its local project switcher while a cloud operation owns the scene.
    const root = editorRoot.current
    const wasInert = root?.inert ?? false
    if (root) root.inert = true
    try { await work() } catch (error) { message.error(getApiErrorMessage(error)) }
    finally {
      if (root) root.inert = wasInert
      lock.current = false
      setBusy(false)
    }
  }

  const refresh = async (nextPage = page, search = keyword) => {
    const result = await api.list({ page: nextPage, pageSize: 12, keyword: search.trim() || undefined })
    setItems(result.items)
    setTotal(result.total)
    setPage(result.page)
  }

  function activate(value: DirectorDesk) {
    if (!mounted.current) return
    parseDirectorProjectDocument({ format: '3d-director-desk-project', schemaVersion: value.projectSchemaVersion, project: value.project })
    baseline.current = JSON.stringify({ projectSchemaVersion: value.projectSchemaVersion, project: value.project, viewSettings: value.viewSettings, characterBindings: value.characterBindings })
    setDesk(value)
    setName(value.name)
    setBindings(value.characterBindings)
    setSegmentId(value.segmentId == null ? initialSegmentId || '' : String(value.segmentId))
    setDirty(false)
    setOpen(false)
    setHistoryOpen(false)
    setReference(null)
    setSelection(null)
    setOptions([])
    const url = new URL(window.location.href)
    url.searchParams.set('cloudDeskId', String(value.id))
    url.searchParams.set('instanceId', value.instanceId)
    window.history.replaceState(window.history.state, '', url)
    onOpen(value)
  }

  function confirmDiscard(work: () => Promise<void>) {
    if (!dirty) { void run(work); return }
    Modal.confirm({ title: '当前工程有未保存修改', content: '继续将放弃当前未保存的云工程修改。', okText: '继续', cancelText: '取消', onOk: () => run(work) })
  }

  useEffect(() => {
    mounted.current = true
    const id = new URLSearchParams(window.location.search).get('cloudDeskId')
    if (id) void run(async () => activate(await api.detail(id)))
    // Initial cloud restoration is requested once, never as a retry after a failed save.
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (!desk) return
    const update = () => setDirty(fingerprint(bindings) !== baseline.current || name !== desk.name)
    update()
    return useDirectorStore.subscribe((next, previous) => {
      if (next.project !== previous.project || next.viewportAspectRatio !== previous.viewportAspectRatio || next.finishedShotFov !== previous.finishedShotFov || next.cameraMotionProgress !== previous.cameraMotionProgress) update()
    })
  }, [desk, bindings, name])

  useEffect(() => {
    if (!cloudReady) return
    baseline.current = fingerprint(bindings)
    setDirty(false)
  }, [cloudReady])

  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function save(snapshot = readDirectorSnapshot(), coverFileId?: string | number) {
    if (!desk) throw new Error('请先创建或打开云工程')
    if (desk.deleted) throw new Error('该工程已删除，只能查看历史来源')
    const validBindings = bindings.filter((binding) => snapshot.project.objects.some((object) => object.id === binding.objectId && object.kind === 'character'))
    const saved = await api.save({ ...snapshot, id: desk.id, expectedRevisionNo: desk.revisionNo, characterBindings: validBindings, name: name.trim(), coverFileId })
    baseline.current = JSON.stringify({ ...snapshot, characterBindings: validBindings })
    setDesk(saved)
    setBindings(validBindings)
    setDirty(fingerprint(validBindings) !== baseline.current)
    return saved
  }

  async function capture() {
    if (!desk || !editorRoot.current) throw new Error('请先打开云工程')
    const target = desk.segmentId == null ? segmentId.trim() : String(desk.segmentId)
    if (!target) throw new Error('独立工程需填写目标片段 ID，才能上传垫图')
    const { snapshot, file } = await captureDirectorSnapshot(editorRoot.current)
    const { saved, reference: uploaded } = await saveAndUploadDirectorFrame({ snapshot, file }, target, save)
    setReference(uploaded)
    setReferenceBindings(saved.characterBindings)
    setReferenceAspectRatio(snapshot.viewSettings.viewportAspectRatio)
    setReferenceSegment(target)
    setSelection(null)
    setReferenceOpen(true)
    message.success(`垫图已上传，来源：工程 ${saved.id} / 修订 ${saved.revisionNo}`)
  }

  return <>
    <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#141414', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button disabled={busy} onClick={() => { setOpen(true); void run(() => refresh()) }}>云工程</Button>
      {desk ? <>
        <Typography.Text>{desk.name}</Typography.Text>
        <Tag color={dirty ? 'orange' : 'green'}>{dirty ? '未保存' : '已保存'} · v{desk.revisionNo}</Tag>
        <Button disabled={busy || desk.deleted} onClick={() => void run(async () => { await save(); message.success('云工程已保存') })}>保存云工程</Button>
        <Button disabled={busy || desk.deleted} onClick={() => { setBindingOpen(true); setOptions([]) }}>角色绑定</Button>
        <Input aria-label="目标片段 ID" style={{ width: 150 }} placeholder="目标片段 ID" disabled={busy || desk.segmentId != null} value={segmentId} onChange={(event) => { setSegmentId(event.target.value); setOptions([]) }} />
        <Button type="primary" loading={busy} disabled={desk.deleted} onClick={() => void run(capture)}>导出垫图并上传</Button>
        <Button disabled={busy} onClick={() => void run(async () => { setCaptures(await api.captures(desk.id)); setHistoryOpen(true) })}>产物与历史</Button>
        {reference && <Button disabled={busy} onClick={() => setReferenceOpen(true)}>使用已上传垫图</Button>}
      </> : <Typography.Text type="secondary">本地工程 · 打开云工程后可保存、绑定角色和上传垫图</Typography.Text>}
    </div>
    {desk?.portability?.portable === false && <Alert type="warning" showIcon message="此工程包含浏览器本地素材，换设备后可能缺失" description={`${desk.portability.note || ''} ${desk.portability.browserLocalAssetIds.join('、')}`} />}
    {desk && desk.revisionNo !== desk.latestRevisionNo && <Alert type="warning" message={`正在查看历史修订 ${desk.revisionNo}，最新为 ${desk.latestRevisionNo}。请先核对最新版本；保存不会自动覆盖。`} />}
    <Modal title="云工程" open={open} onCancel={() => !busy && setOpen(false)} footer={null} width={800}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search placeholder="搜索工程" value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => void run(() => refresh(1))} disabled={busy} />
        <Input aria-label="工程名称" placeholder="工程名称" maxLength={128} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} />
        <Button disabled={busy || !name.trim()} onClick={() => confirmDiscard(async () => { activate(await api.create(name.trim(), initialSegmentId || undefined)) })}>新建云工程</Button>
        <Button disabled={busy || !name.trim()} onClick={() => void run(async () => {
          const snapshot = readDirectorSnapshot()
          const created = await api.create(name.trim(), initialSegmentId || undefined)
          // Preserve the newly created ID even if the following snapshot save fails.
          try { activate(await api.save({ ...snapshot, id: created.id, expectedRevisionNo: created.revisionNo, characterBindings: bindings })) }
          catch (error) { await refresh(1); throw error }
        })}>当前场景另存为云工程</Button>
      </Space>
      <List loading={busy} dataSource={items} locale={{ emptyText: '暂无云工程' }} renderItem={(item) => <List.Item actions={[
        <Button key="open" disabled={busy} onClick={() => confirmDiscard(async () => activate(await api.detail(item.id)))}>打开</Button>,
        <Popconfirm key="delete" title="删除云工程？历史产物会保留。" onConfirm={() => run(async () => { await api.delete(item.id); if (desk && String(desk.id) === String(item.id)) setDesk({ ...desk, deleted: true }); await refresh() })}><Button danger disabled={busy}>删除</Button></Popconfirm>,
      ]}><List.Item.Meta avatar={item.coverUrl ? <Image width={72} src={item.coverUrl} /> : undefined} title={item.name} description={`修订 ${item.revisionNo} · ${item.segmentId == null ? '独立工程' : `片段 ${item.segmentId}`} · ${item.updatedAt}`} /></List.Item>} />
      <Pagination current={page} total={total} pageSize={12} showSizeChanger={false} disabled={busy} onChange={(value) => void run(() => refresh(value))} />
    </Modal>
    <Modal title="角色与造型绑定" open={bindingOpen} onCancel={() => !busy && setBindingOpen(false)} footer={null}>
      <Alert type="info" message="按场景人物绑定角色图；生成时仍需描述画面位置与参考图的对应关系。" />
      <Button style={{ margin: '12px 0' }} loading={busy} disabled={!segmentId.trim()} onClick={() => void run(async () => {
        const request = StudioAssetGenerationApi.requestStoryboardVideoReferenceOptions({ segmentId: segmentId.trim(), source: 'character' })
        setOptions(await request.promise)
      })}>加载目标片段的角色候选</Button>
      {objects.filter((object) => object.kind === 'character').map((object) => {
        const binding = bindings.find((item) => item.objectId === object.id)
        return <div key={object.id} style={{ marginBottom: 12 }}><Typography.Text>{object.name || object.id}</Typography.Text>
          {binding && <div><Typography.Text type="secondary">已绑定角色 {binding.assetId} / 图片 {binding.referenceFileId ?? '未指定'}</Typography.Text></div>}
          <Select style={{ width: '100%' }} allowClear disabled={busy} placeholder="选择角色造型参考图" value={binding ? options.findIndex((option) => String(option.assetId) === String(binding.assetId) && String(option.fileId) === String(binding.referenceFileId)) >= 0 ? options.findIndex((option) => String(option.assetId) === String(binding.assetId) && String(option.fileId) === String(binding.referenceFileId)) : undefined : undefined}
            options={options.map((option, index) => ({ value: index, label: option.displayName, disabled: !option.selectable || option.assetId == null || option.fileId == null }))}
            onChange={(index: number | undefined) => {
              const option = index == null ? undefined : options[index]
              setBindings((current) => [...current.filter((item) => item.objectId !== object.id), ...(option?.assetId != null ? [{ objectId: object.id, assetId: option.assetId, characterLookId: option.characterLookId, referenceFileId: option.fileId }] : [])])
            }} />
          {binding && <Button type="link" disabled={busy} onClick={() => setBindings((current) => current.filter((item) => item.objectId !== object.id))}>解除绑定</Button>}
        </div>
      })}
      <Typography.Text type="secondary">绑定修改需点击“保存云工程”保存。</Typography.Text>
    </Modal>
    <Modal title="垫图参考" open={referenceOpen} onCancel={() => !busy && setReferenceOpen(false)} footer={null}>
      {reference?.fileUrl && <Image src={reference.fileUrl} width="100%" />}
      <Alert type="info" message="上传仅新增候选素材。视频需追加到参考区，再回到片段生成面板；图片可在下方直接生成。" />
      <Space wrap style={{ marginTop: 12 }}>
        <Button disabled={busy} onClick={() => void run(async () => setVideoModels(await StudioModelsApi.getVideoModels()))}>加载视频模型</Button>
        <Select aria-label="视频模型" style={{ minWidth: 180 }} placeholder="选择视频模型" value={modelId ?? undefined} options={videoModels.map((item) => ({ label: item.name, value: item.id }))} disabled={busy} onChange={(value) => { setModelId(value); setSelection(null) }} />
        <Button disabled={busy || !modelId || !reference} onClick={() => void run(async () => {
          if (!modelId || !reference) return
          const current = await api.references(referenceSegment, modelId)
          setSelection(current)
        })}>读取参考区</Button>
        <Button disabled={busy || !selection || !reference} onClick={() => void run(async () => {
          if (!selection || !reference) return
          const additions = [reference, ...referenceBindings.filter((binding) => binding.referenceFileId != null).map((binding) => ({ referenceType: 1, fileId: binding.referenceFileId!, displayName: `角色 ${binding.assetId}` }))]
          const unique = additions.filter((item, index) => additions.findIndex((other) => other.referenceType === item.referenceType && String(other.fileId) === String(item.fileId)) === index && !selection.references.some((other) => other.referenceType === item.referenceType && String(other.fileId) === String(item.fileId)))
          if (!unique.length) { message.info('参考区已包含这些素材'); return }
          try { setSelection(await api.addReferences(referenceSegment, selection.revisionNo, unique)); message.success('已追加垫图与绑定角色图，原有参考保留') }
          catch (error) { setSelection(null); throw error }
        })}>追加垫图与角色参考</Button>
      </Space>
      {selection && <List dataSource={selection.references} renderItem={(item) => <List.Item>{item.referenceToken || `参考 ${item.referenceIndex ?? ''}`} · {item.displayName}</List.Item>} />}
      {referenceOpen && reference?.referenceType === 5 && <DirectorCaptureImageForm key={String(reference.fileId)} reference={reference} bindings={referenceBindings} segmentId={referenceSegment} aspectRatio={referenceAspectRatio} />}
    </Modal>
    <Modal title="产物与历史追溯" open={historyOpen} onCancel={() => !busy && setHistoryOpen(false)} footer={null} width={800}>
      <Space><InputNumber min={1} precision={0} value={revision} onChange={setRevision} placeholder="历史修订号" /><Button disabled={busy || !revision} onClick={() => confirmDiscard(async () => { if (desk && revision) activate(await api.detail(desk.id, revision)) })}>读取历史修订</Button><Button disabled={busy} onClick={() => confirmDiscard(async () => { if (desk) activate(await api.detail(desk.id)) })}>读取最新版本</Button></Space>
      <List dataSource={captures} renderItem={(item) => <List.Item actions={[
        <Button key="revision" disabled={busy} onClick={() => confirmDiscard(async () => activate(await api.detail(item.directorDeskId, item.directorRevisionNo)))}>查看来源修订</Button>,
        ...(item.fileType === 'image' ? [
          <Button key="reference" disabled={busy} onClick={() => void run(async () => {
            const source = await api.detail(item.directorDeskId, item.directorRevisionNo)
            setReference({ referenceType: 5, fileId: item.fileId, fileUrl: item.fileUrl, displayName: item.fileName })
            setReferenceSegment(String(item.segmentId)); setReferenceBindings(source.characterBindings); setReferenceAspectRatio(source.viewSettings.viewportAspectRatio)
            setSelection(null); setHistoryOpen(false); setReferenceOpen(true)
          })}>使用垫图</Button>,
          <Button key="cover" disabled={busy || desk?.deleted} onClick={() => void run(async () => { await save(readDirectorSnapshot(), item.fileId); message.success('已保存工程并更新封面') })}>设为封面</Button>,
        ] : []),
      ]}><List.Item.Meta title={<a href={item.fileUrl} target="_blank" rel="noreferrer">{item.fileName}</a>} description={`修订 ${item.directorRevisionNo} · 文件 ${item.fileId} · 片段 ${item.segmentId} · ${item.fileType}`} /></List.Item>} />
    </Modal>
  </>
}
