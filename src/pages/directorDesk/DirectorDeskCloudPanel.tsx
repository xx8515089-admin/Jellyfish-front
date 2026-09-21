import { uiText, uiStatusText, useUiLanguage } from '../../i18n/uiText'
import { hasPendingDirectorPublication, publishDirectorDraft, recoverDirectorPublication } from './directorPublication'
import { directorErrorMessage } from '../../services/studioDirectorDesks'
import { observeDirectorChanges } from './directorDirtyObserver'
import LazyDirectorVideo from './LazyDirectorVideo'
import { directorReferenceMediaType } from './directorImageSource'
import LazyDirectorImage from './LazyDirectorImage'
import { BookOutlined, PlusOutlined, CopyOutlined, CloudOutlined, SaveOutlined, TeamOutlined, FolderOpenOutlined, UploadOutlined, HistoryOutlined, DownOutlined, FileOutlined, DeleteOutlined } from '@ant-design/icons'
import './directorCloudPanel.css'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Dropdown, Input, InputNumber, List, Modal, Pagination, Popconfirm, Select, Space, Typography, message } from 'antd'
import { StudioDirectorDesks as api, type DirectorDraft, type DirectorBinding, type DirectorCapture, type DirectorDesk, type DirectorDeskSummary, type DirectorReference, type DirectorReferenceSelection } from '../../services/studioDirectorDesks'
import { useDirectorCharacterOptions } from './useDirectorCharacterOptions'
import { getApiErrorMessage } from '../../services/apiErrors'
import { useDirectorStore } from './runtime/editor/store/directorStore'
import { captureDirectorSnapshot, captureDirectorVideoSnapshot, readDirectorSnapshot, fingerprintDirectorSnapshot } from './directorCloudSnapshot'
import { parseDirectorProjectDocument } from './runtime/editor/io/projectDocument'
import { StudioModelsApi, type StudioGenerationModel } from '../../services/studioModels'
import DirectorCaptureImageForm from './DirectorCaptureImageForm'
import { restoreCloudAssets, uploadProjectAssets, copyCloudAssets } from './directorCloudAssets'
import { clearCloudPackages } from './runtime/editor/loaders/cloudAssetRuntime'
import { saveAndUploadDirectorFrame } from './directorCloudUpload'

interface Props {
  editorRoot: React.RefObject<HTMLDivElement>
  initialVisualStyleId?: number | null
  initialSegmentLabel?: string
  initialSegmentId?: string
  onOpen: (desk: DirectorDesk) => void
  onInitialLoadSettled: () => void
  cloudReady: number
  onDirtyChange: (value: boolean) => void
}
/** Compare binding identities independently of API number/string ID serialization. */
const bindingIdentity = (binding?: DirectorBinding) => binding
  ? JSON.stringify([String(binding.assetId), String(binding.characterLookId ?? ''), String(binding.referenceFileId ?? '')])
  : ''
const fingerprint = fingerprintDirectorSnapshot
const EMPTY_OBJECTS: ReturnType<typeof useDirectorStore.getState>['project']['objects'] = []

export default function DirectorDeskCloudPanel({ editorRoot, initialSegmentId, initialSegmentLabel, initialVisualStyleId, onOpen, cloudReady, onDirtyChange, onInitialLoadSettled }: Props) {
  useUiLanguage()

  const draft = useRef<DirectorDraft | null>(null)
  const draftFingerprint = useRef('')
  const [draftStatus, setDraftStatus] = useState('')
  const [pendingDraft, setPendingDraft] = useState<{ desk: DirectorDesk; draft: DirectorDraft } | null>(null)
  const [changeNo, setChangeNo] = useState(0)
  const [chooseSegment, setChooseSegment] = useState(false)
  const [includeCharacters, setIncludeCharacters] = useState(true)
  const [bindingStatusVersion, setBindingStatusVersion] = useState('')
  const [bindingStatuses, setBindingStatuses] = useState<{ objectId: string; status: string; message: string }[]>([])
  const [revisionItems, setRevisionItems] = useState<{ revisionNo: number; createdAt: string }[]>([])
  const [revisionPage, setRevisionPage] = useState(1)
  const [revisionTotal, setRevisionTotal] = useState(0)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const filesInput = useRef<HTMLInputElement | null>(null)
  const folderInput = useRef<HTMLInputElement | null>(null)
  const [dependencyFiles, setDependencyFiles] = useState<File[]>([])
  const [desk, setDesk] = useState<DirectorDesk | null>(null)
  // Only reuse the entry label while the open desk belongs to that same segment.
  const segmentLabel = initialSegmentLabel?.trim() && (!desk || String(desk.segmentId) === initialSegmentId)
    ? initialSegmentLabel.trim()
    : undefined
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
  const [newProjectName, setNewProjectName] = useState('')
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
  const { options, loading: optionsLoading, error: optionsError, validTarget, refresh: refreshCharacterOptions } = useDirectorCharacterOptions(segmentId)
  const [bindingStatusError, setBindingStatusError] = useState('')
  const [bindingOpen, setBindingOpen] = useState(false)
  const objects = useDirectorStore((state) => bindingOpen ? state.project.objects : EMPTY_OBJECTS)
  const playing = useDirectorStore((state) => state.cameraMotionPlaying)

  useEffect(() => {
    if (!bindingOpen || !desk) return
    let active = true
    setBindingStatuses([])
    setBindingStatusError('')
    void api.bindingStatus(desk.id, desk.revisionNo).then((result) => {
      if (active) { setBindingStatuses(result.items); setBindingStatusVersion(`${desk.id}:${desk.revisionNo}`) }
    }).catch((error) => {
      if (active) setBindingStatusError(getApiErrorMessage(error))
    })
    return () => { active = false }
  }, [bindingOpen, desk?.id, desk?.revisionNo])

  function addDependencyFiles(files: File[]) {
    setDependencyFiles((current) => {
      const unique = new Map(current.map((file) => [file.webkitRelativePath || file.name, file]))
      files.forEach((file) => unique.set(file.webkitRelativePath || file.name, file))
      return [...unique.values()]
    })
  }

  async function run(work: () => Promise<unknown>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    // Also block editor actions and its local project switcher while a cloud operation owns the scene.
    const root = editorRoot.current
    const wasInert = root?.inert ?? false
    if (root) root.inert = true
    try { await work() } catch (error) { message.error(directorErrorMessage(error)) }
    finally {
      if (root) root.inert = wasInert
      lock.current = false
      setBusy(false)
    }
  }

  const refresh = async (nextPage = page, search = keyword) => {
    const result = await api.list({ page: nextPage, pageSize: 12, keyword: search.trim() || undefined, segmentId: chooseSegment ? initialSegmentId : undefined })
    setItems(result.items)
    setTotal(result.total)
    setPage(result.page)
  }

  async function activate(value: DirectorDesk, history = false) {
    if (!history && !value.deleted && value.revisionNo === value.latestRevisionNo) {
      const stored = await api.draft(value.id)
      if (stored.hasDraft) { setPendingDraft({ desk: value, draft: stored }); return false }
      await restoreCloudAssets(value)
      draft.current = stored
    } else { await restoreCloudAssets(value); draft.current = null }
    loadDesk(value)
    return true
  }

  function loadDesk(value: DirectorDesk) {
    setDraftStatus('')
    draftFingerprint.current = ''

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
    const url = new URL(window.location.href)
    url.searchParams.set('cloudDeskId', String(value.id))
    url.searchParams.set('instanceId', value.instanceId)
    if (!draft.current) url.searchParams.set('revisionNo', String(value.revisionNo))
    else url.searchParams.delete('revisionNo')
    window.history.replaceState(window.history.state, '', url)
    if ('jellyfishDetachedBindings' in value.project) message.warning(uiText("此副本包含已解除的失效绑定，请重新绑定角色"))
    onOpen(value)
  }

  function confirmDiscard(work: () => Promise<unknown>) {
    if (!dirty) { void run(work); return }
    Modal.confirm({ title: uiText("当前工程有未保存修改"), content: '继续将放弃当前未保存的云工程修改。', okText: uiText("继续"), cancelText: uiText("取消"), onOk: () => run(work) })
  }

  useEffect(() => {
    mounted.current = true
    const id = new URLSearchParams(window.location.search).get('cloudDeskId')
    const revisionNo = Number(new URLSearchParams(window.location.search).get('revisionNo')) || undefined
    if (id || initialSegmentId) void run(async () => {
      try {
        if (id) {
          if (!await activate(await api.detail(id, revisionNo), !!revisionNo)) return
        } else {
          const result = await api.openForSegment(initialSegmentId!)
          if (result.desk) {
            if (!await activate(result.desk)) return
          } else { setChooseSegment(true); setItems(result.candidates.slice(0, 12)); setTotal(result.total); setOpen(true) }
        }
      } catch (error) {
        if (mounted.current) onInitialLoadSettled()
        throw error
      }
      if (mounted.current) onInitialLoadSettled()
    })
    else onInitialLoadSettled()
    // Initial cloud restoration is requested once, never as a retry after a failed save.
    return () => { mounted.current = false; clearCloudPackages() }
  }, [])

  useEffect(() => {
    if (!desk) return
    const update = () => { setDirty(fingerprint(bindings) !== baseline.current || name !== desk.name); setChangeNo((value) => value + 1) }
    update()
    return observeDirectorChanges(useDirectorStore.subscribe, () => {
      setDirty(true)
      onDirtyChange(true)
    }, update)
  }, [desk, bindings, name, onDirtyChange])

  useEffect(() => {
    if (!cloudReady) return
    baseline.current = fingerprint(bindings)
    setDirty(!!draft.current?.hasDraft)
  }, [cloudReady])

  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function saveCloudDraft(snapshot = readDirectorSnapshot()) {
    if (!desk || !draft.current) throw new Error('请先打开最新工程并处理待恢复草稿')
    const validBindings = bindings.filter((binding) => snapshot.project.objects.some((object) => object.id === binding.objectId && object.kind === 'character'))
    setDraftStatus('草稿保存中')
    try {
      const result = await api.saveDraft({ ...snapshot, id: desk.id, baseRevisionNo: desk.revisionNo, expectedDraftRevisionNo: draft.current.draftRevisionNo, characterBindings: validBindings })
      draft.current = result
      if (validBindings.length !== bindings.length) setBindings(validBindings)
      draftFingerprint.current = JSON.stringify({ ...snapshot, characterBindings: validBindings })
      setDraftStatus(result.conflict ? '草稿基础版本冲突，请另存副本或核对云端版本' : '草稿已保存，尚未发布')
      return result
    } catch (error) { setDraftStatus('草稿保存失败，内容已保留；请核对云端草稿'); throw error }
  }

  useEffect(() => {
    if ((desk && hasPendingDirectorPublication(desk.id)) || playing || !dirty || !desk || desk.deleted || !draft.current || pendingDraft || busy || draftStatus.includes('失败') || draftStatus.includes('冲突')) return
    const timer = window.setTimeout(() => {
      if (fingerprint(bindings) !== draftFingerprint.current) void run(async () => { await saveCloudDraft() })
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [changeNo, dirty, busy, pendingDraft, desk, draftStatus, playing])

  async function recoverPublication(retry: boolean) {
    if (!desk) return
    const result = await recoverDirectorPublication(desk.id, retry)
    // Historical receipts are evidence only: retain the current scene and later draft.
    setDraftStatus('已确认发布 v' + result.desk.revisionNo + '，当前编辑已保留；请核对云端版本冲突')
    message.success(uiText("已找回原发布记录，未替换当前场景或新草稿"))
  }

  async function save(snapshot = readDirectorSnapshot(), coverFileId?: string | number) {
    if (!desk || desk.deleted) throw new Error('请先打开可编辑云工程')
    if (hasPendingDirectorPublication(desk.id)) throw new Error('请先查询或原样重试上次发布，当前编辑已保留')
    const publishingFingerprint = fingerprint(bindings)
    const stored = await saveCloudDraft(snapshot)
    if (stored.conflict) throw new Error('正式版本已变化，草稿已保留，请核对或另存副本')
    let result
    try { result = await publishDirectorDraft(desk.id, stored.draftRevisionNo, desk.revisionNo) }
    catch (error) { setDraftStatus('正式发布失败，草稿已保留；请核对云端版本'); throw error }
    if (result.desk.deleted || result.desk.latestRevisionNo > result.desk.revisionNo || result.draft.hasDraft || fingerprint(bindings) !== publishingFingerprint) {
      setDraftStatus('原发布已确认，当前编辑已保留；请核对云端版本冲突')
      throw new Error('发布已成功，但已有新编辑、草稿或正式版本；已停止后续上传，请核对云端版本')
    }
    draft.current = result.draft
    let saved = result.desk
    baseline.current = JSON.stringify({ ...snapshot, characterBindings: saved.characterBindings })
    setDesk(saved)
    setBindings(saved.characterBindings)
    setDirty(fingerprint(saved.characterBindings) !== baseline.current)
    setDraftStatus('正式版本已发布')
    if (name.trim() !== saved.name || coverFileId != null) {
      saved = await api.save({ ...snapshot, id: saved.id, expectedRevisionNo: saved.revisionNo, characterBindings: saved.characterBindings, name: name.trim(), coverFileId })
      setDesk(saved)
    }
    return saved
  }

  async function capture(video = false) {
    if (!desk || !editorRoot.current) throw new Error('请先打开云工程')
    const target = desk.segmentId == null ? segmentId.trim() : String(desk.segmentId)
    if (!target) throw new Error('独立工程需填写目标片段 ID，才能上传垫图')
    const { snapshot, file } = await (video ? captureDirectorVideoSnapshot(editorRoot.current) : captureDirectorSnapshot(editorRoot.current))
    const { saved, reference: uploaded } = await saveAndUploadDirectorFrame({ snapshot, file }, target, save)
    setReference(uploaded)
    setReferenceBindings(saved.characterBindings)
    setReferenceAspectRatio(snapshot.viewSettings.viewportAspectRatio)
    setReferenceSegment(target)
    setSelection(null)
    setReferenceOpen(true)
    message.success(uiText("{0}已上传，来源：工程 {1} / 修订 {2}", video ? uiText("参考视频") : uiText("垫图"), saved.id, saved.revisionNo))
  }

  return <>
    <div className="director-cloud-toolbar" role="toolbar" aria-label={uiText("导演台云工程工具栏")}>
      <div className="director-cloud-toolbar__project">
        <Button icon={<CloudOutlined />} disabled={busy} onClick={() => { setChooseSegment(false); setOpen(true); void run(() => refresh()) }}>{uiText("云工程")}</Button>
        <div className="director-cloud-toolbar__identity">
          <Typography.Text className="director-cloud-toolbar__name" title={desk?.name}>{segmentLabel || desk?.name || uiText("本地工程")}</Typography.Text>
          <span className={`director-cloud-toolbar__status${dirty ? ' is-dirty' : ''}`} title={uiStatusText(draftStatus) || undefined}>
            {desk ? <><span className="director-cloud-toolbar__dot" />{uiStatusText(draftStatus) || (dirty ? uiText("未保存") : uiText("正式版本已保存"))} · v{desk.revisionNo}</> : uiText("打开云工程以保存和应用产物")}
          </span>
        </div>
      </div>
      <div className="director-cloud-toolbar__actions">
        <Button icon={<BookOutlined />} href="/director-desk/manual" target="_blank" rel="noopener noreferrer" title={uiText("预览用户手册")}>{uiText("用户手册")}</Button>
      {desk && <>
        {hasPendingDirectorPublication(desk.id) && <Space>
          <Button disabled={busy} onClick={() => void run(() => recoverPublication(false))}>{uiText("查询上次发布")}</Button>
          <Button disabled={busy || desk.deleted} onClick={() => void run(() => recoverPublication(true))}>{uiText("原样重试发布")}</Button>
        </Space>}
        <div className="director-cloud-toolbar__group">
          {desk.segmentId != null ? <span className="director-cloud-toolbar__segment" title={uiText("目标片段 ID：{0}", desk.segmentId)}>{segmentLabel || uiText("片段 ID：{0}", desk.segmentId)}</span> : <Input aria-label={uiText("目标片段 ID")} className="director-cloud-toolbar__target" prefix={<span>{uiText("片段 ID")}</span>} placeholder={uiText("目标 ID")} disabled={busy} value={segmentId} onChange={(event) => setSegmentId(event.target.value)} />}
          <Button icon={<SaveOutlined />} disabled={busy || desk.deleted} onClick={() => void run(async () => { await save(); message.success(uiText("云工程已保存")) })}>{uiText("保存")}</Button>
          <Button icon={<TeamOutlined />} disabled={busy || desk.deleted} onClick={() => setBindingOpen(true)}>{uiText("角色绑定")}</Button>
        </div>
        <div className="director-cloud-toolbar__group">
          <Button icon={<FolderOpenOutlined />} disabled={busy || desk.deleted} onClick={() => setAssetsOpen(true)}>{uiText("云素材")}{dependencyFiles.length > 0 ? ` · ${dependencyFiles.length}` : ''}</Button>
          <Button icon={<HistoryOutlined />} disabled={busy} onClick={() => void run(async () => { setCaptures(await api.captures(desk.id)); const revisions = await api.revisions(desk.id); setRevisionItems(revisions.items); setRevisionTotal(revisions.total); setRevisionPage(1); setHistoryOpen(true) })}>{uiText("产物与历史")}</Button>
          {reference && <Button disabled={busy} onClick={() => setReferenceOpen(true)}>{uiText("应用产物")}</Button>}
        </div>
        <Dropdown trigger={['click']} disabled={busy || desk.deleted} menu={{ items: [
          { key: 'image', label: uiText("导出垫图并上传") },
          { key: 'video', label: uiText("导出参考视频并上传") },
        ], onClick: ({ key }) => void run(() => capture(key === 'video')) }}>
          <Button type="primary" icon={<UploadOutlined />} loading={busy} disabled={busy || desk.deleted}>{uiText("导出并上传") + " "}<DownOutlined /></Button>
        </Dropdown>
      </>}
      </div>
    </div>
    <Modal title={uiText("云素材")} open={assetsOpen} onCancel={() => !busy && setAssetsOpen(false)} width={620} footer={[
      <Button key="cancel" disabled={busy} onClick={() => setAssetsOpen(false)}>{uiText("关闭")}</Button>,
      <Button key="upload" type="primary" icon={<CloudOutlined />} loading={busy} disabled={!desk || desk.deleted || !draft.current} onClick={() => void run(async () => {
        if (!desk) return
        const original = readDirectorSnapshot().project
        const expected = JSON.stringify(original)
        const project = await uploadProjectAssets(desk.id, original, dependencyFiles)
        await restoreCloudAssets({ ...desk, project })
        if (JSON.stringify(readDirectorSnapshot().project) !== expected) throw new Error('上传期间场景已变化，当前编辑已保留；请重新上传以合并素材引用')
        useDirectorStore.getState().replaceProject(project)
        await saveCloudDraft(readDirectorSnapshot())
        setDependencyFiles([])
        message.success(uiText("模型与依赖已上传并保存云草稿，请发布正式版本"))
      })}>{uiText("上传模型及依赖")}</Button>,
    ]}>
      <Typography.Paragraph type="secondary">{uiText("将场景中已导入的本地模型和动作保存到云端。模型用到的纹理等依赖，可在下方补充选择。")}</Typography.Paragraph>
      <input ref={filesInput} type="file" multiple hidden disabled={busy} onChange={(event) => { addDependencyFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
      <input ref={(node) => { folderInput.current = node; node?.setAttribute('webkitdirectory', '') }} type="file" multiple hidden disabled={busy} onChange={(event) => { addDependencyFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
      <div className="director-cloud-assets__pickers">
        <button type="button" className="director-cloud-assets__picker" disabled={busy} onClick={() => filesInput.current?.click()}><FileOutlined /><strong>{uiText("选择依赖文件")}</strong><span>{uiText("补充纹理、材质等文件")}</span></button>
        <button type="button" className="director-cloud-assets__picker" disabled={busy} onClick={() => folderInput.current?.click()}><FolderOpenOutlined /><strong>{uiText("选择依赖文件夹")}</strong><span>{uiText("保留文件夹内的相对路径")}</span></button>
      </div>
      <div className="director-cloud-assets__list-heading"><Typography.Text>{uiText("已选依赖 ·") + " "}{dependencyFiles.length}</Typography.Text>{dependencyFiles.length > 0 && <Button type="text" size="small" disabled={busy} onClick={() => setDependencyFiles([])}>{uiText("清空")}</Button>}</div>
      <List className="director-cloud-assets__list" size="small" dataSource={dependencyFiles} locale={{ emptyText: uiText("未添加额外依赖，可直接上传场景中的本地模型") }} renderItem={(file, index) => <List.Item actions={[<Button key="remove" type="text" icon={<DeleteOutlined />} aria-label={uiText("移除 {0}", file.webkitRelativePath || file.name)} disabled={busy} onClick={() => setDependencyFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} />]}><List.Item.Meta avatar={<FileOutlined />} title={<span title={file.webkitRelativePath || file.name}>{file.webkitRelativePath || file.name}</span>} description={file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`} /></List.Item>} />
    </Modal>
    {desk?.portability?.portable === false && <Alert type="warning" showIcon message={uiText("此工程包含浏览器本地素材，换设备后可能缺失")} description={`${desk.portability.note || ''} ${desk.portability.browserLocalAssetIds.join('、')}`} />}
    {desk && desk.revisionNo !== desk.latestRevisionNo && <Alert type="warning" message={uiText("正在查看历史修订 {0}，最新为 {1}。请先核对最新版本；保存不会自动覆盖。", desk.revisionNo, desk.latestRevisionNo)} />}
    <Modal title={uiText("发现云草稿")} open={!!pendingDraft} closable={false} footer={null}>
      <Alert type={pendingDraft?.draft.conflict ? 'warning' : 'info'} message={pendingDraft?.draft.conflict ? uiText("草稿基于旧版本，恢复后不能直接覆盖最新正式版本。可另存为新工程。") : uiText("恢复上次未发布的编辑，或明确丢弃云草稿。")} />
      <Space style={{ marginTop: 12 }}>
        <Button disabled={busy} onClick={() => void run(async () => { if (!pendingDraft) return; const { desk: original, draft: stored } = pendingDraft; if (!stored.project || !stored.viewSettings || !stored.characterBindings) return; const recovered = { ...original, revisionNo: stored.baseRevisionNo, project: stored.project, viewSettings: stored.viewSettings, characterBindings: stored.characterBindings }; await restoreCloudAssets(recovered); draft.current = stored; loadDesk(recovered); draftFingerprint.current = JSON.stringify({ projectSchemaVersion: 1, project: stored.project, viewSettings: stored.viewSettings, characterBindings: stored.characterBindings }); setDraftStatus(stored.conflict ? '草稿基础版本冲突，请另存副本' : '草稿已恢复，尚未发布'); setPendingDraft(null) })}>{uiText("恢复草稿")}</Button>
        <Button danger disabled={busy} onClick={() => void run(async () => { if (!pendingDraft) return; draft.current = await api.discardDraft(pendingDraft.desk.id, pendingDraft.draft.draftRevisionNo); await restoreCloudAssets(pendingDraft.desk); loadDesk(pendingDraft.desk); setPendingDraft(null) })}>{uiText("丢弃草稿并打开正式版")}</Button>
        <Button disabled={busy} onClick={() => { setPendingDraft(null); onInitialLoadSettled() }}>{uiText("取消")}</Button>
      </Space>
    </Modal>
    {(draftStatus.includes('失败') || draftStatus.includes('核对')) && desk && <Button disabled={busy} onClick={() => confirmDiscard(async () => { await activate(await api.detail(desk.id)) })}>{uiText("核对云端草稿（保留当前场景请先另存）")}</Button>}
    <Modal title={<div className="director-cloud-library__title"><CloudOutlined /><span>{chooseSegment ? uiText("选择片段云工程") : uiText("云工程")}</span></div>} open={open} destroyOnClose onCancel={() => !busy && setOpen(false)} footer={null} width={920} className="director-cloud-library">
      <Typography.Paragraph type="secondary" className="director-cloud-library__intro">{uiText("管理云端场景，或将当前布局保存为新的工程。")}</Typography.Paragraph>
      <div className="director-cloud-library__layout">
        <section className="director-cloud-library__browser" aria-label={uiText("云工程列表")}>
          <div className="director-cloud-library__search">
            <Input.Search aria-label={uiText("搜索云工程")} placeholder={uiText("搜索工程名称")} allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => void run(() => refresh(1))} disabled={busy} />
            <span className="director-cloud-library__count">{total} {uiText("个工程")}</span>
          </div>
          <List className="director-cloud-library__list" loading={busy} dataSource={items} locale={{ emptyText: keyword.trim() ? uiText("没有找到匹配的工程，试试其他名称") : uiText("还没有云工程，可在右侧新建或保存当前场景") }} renderItem={(item) => {
            const isCurrent = !!desk && String(desk.id) === String(item.id)
            return <List.Item className={`director-cloud-library__item${isCurrent ? ' is-current' : ''}`}>
              <div className="director-cloud-library__cover">{item.coverUrl ? <LazyDirectorImage width={64} height={64} style={{ objectFit: 'cover' }} src={item.coverUrl} alt={item.name} /> : <FolderOpenOutlined />}</div>
              <div className="director-cloud-library__details">
                <div className="director-cloud-library__item-title"><Typography.Text ellipsis title={item.name}>{item.name}</Typography.Text>{isCurrent && <span className="director-cloud-library__current">{uiText("当前")}</span>}</div>
                <div className="director-cloud-library__metadata"><span>{uiText("修订") + " "}{item.revisionNo}</span><span>{item.segmentId == null ? uiText("独立工程") : uiText("片段 ID：{0}", item.segmentId)}</span></div>
                <div className="director-cloud-library__updated">{uiText("更新于") + " "}{item.updatedAt}</div>
              </div>
              <div className="director-cloud-library__item-actions">
                <Button disabled={busy} onClick={() => confirmDiscard(async () => initialSegmentId && chooseSegment ? activate((await api.openForSegment(initialSegmentId, item.id)).desk!) : activate(await api.detail(item.id)))}>{uiText("打开")}</Button>
                <Popconfirm title={uiText("删除云工程？")} description={uiText("历史产物会保留。")} okText={uiText("删除")} cancelText={uiText("取消")} okButtonProps={{ danger: true }} onConfirm={() => run(async () => { await api.delete(item.id); if (desk && String(desk.id) === String(item.id)) setDesk({ ...desk, deleted: true }); await refresh() })}><Button type="text" icon={<DeleteOutlined />} aria-label={uiText("删除工程 {0}", item.name)} title={uiText("删除工程")} disabled={busy} /></Popconfirm>
              </div>
            </List.Item>
          }} />
          <div className="director-cloud-library__pagination"><Pagination current={page} total={total} pageSize={12} showSizeChanger={false} hideOnSinglePage size="small" disabled={busy} onChange={(value) => void run(() => refresh(value))} /></div>
        </section>
        <aside className="director-cloud-library__create" aria-label={uiText("创建云工程")}>
          <span className="director-cloud-library__create-icon"><PlusOutlined /></span>
          <Typography.Title level={5}>{uiText("创建新工程")}</Typography.Title>
          <Typography.Paragraph type="secondary">{uiText("从空场景开始，或保留当前人物站位与镜头布局。")}</Typography.Paragraph>
          <label htmlFor="director-new-project-name">{uiText("工程名称")}</label>
          <Input id="director-new-project-name" placeholder={uiText("例如：餐厅双人对话")} maxLength={128} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} disabled={busy} />
          <Button block type="primary" icon={<PlusOutlined />} disabled={busy || !newProjectName.trim()} onClick={() => confirmDiscard(async () => { await activate(await api.create(newProjectName.trim(), initialSegmentId || undefined)); setNewProjectName('') })}>{uiText("新建空工程")}</Button>
          <Button block icon={<CopyOutlined />} disabled={busy || !newProjectName.trim()} onClick={() => void run(async () => {
            const snapshot = readDirectorSnapshot()
            const created = await api.create(newProjectName.trim(), initialSegmentId || undefined)
            // Preserve the newly created ID even if the following snapshot save fails.
            try { snapshot.project = await copyCloudAssets(created.id, snapshot.project); await activate(await api.save({ ...snapshot, id: created.id, expectedRevisionNo: created.revisionNo, characterBindings: bindings })); setNewProjectName('') }
            catch (error) { await refresh(1); throw error }
          })}>{uiText("当前场景另存为")}</Button>
          <span className="director-cloud-library__create-note">{initialSegmentId ? uiText("新工程将关联片段 ID：{0}", initialSegmentId) : uiText("新工程将保存为独立工程")}</span>
        </aside>
      </div>
    </Modal>
    <Modal title={uiText("角色与造型绑定")} open={bindingOpen} onCancel={() => !busy && setBindingOpen(false)} footer={null}>
      <Alert type="info" message={uiText("绑定角色图用于后续图片或视频生成，不会替换当前 3D 模型外观。生成时仍需描述画面位置与参考图的对应关系。")} />
      <Button style={{ margin: '12px 0' }} loading={optionsLoading} disabled={!validTarget || optionsLoading} onClick={refreshCharacterOptions}>{uiText("刷新角色候选")}</Button>
      {optionsError && <Alert type="error" showIcon message={uiText("角色候选加载失败：{0}", optionsError)} description={uiText("可点击刷新角色候选重试。")} />}
      {bindingStatusError && <Alert type="warning" message={uiText("绑定状态检查失败：{0}", bindingStatusError)} />}
      {bindingStatusVersion === `${desk?.id}:${desk?.revisionNo}` && bindingStatuses.filter((item) =>
        item.status !== 'valid'
        && objects.some((object) => object.kind === 'character' && object.id === item.objectId)
        && bindingIdentity(bindings.find((binding) => binding.objectId === item.objectId)) === bindingIdentity(desk?.characterBindings.find((binding) => binding.objectId === item.objectId))
      ).map((item) => <Alert key={item.objectId} type="warning" message={`${objects.find((object) => object.id === item.objectId)?.name || item.objectId}：${item.message}`} />)}
      {objects.filter((object) => object.kind === 'character').map((object) => {
        const binding = bindings.find((item) => item.objectId === object.id)
        const bindingChanged = bindingIdentity(binding) !== bindingIdentity(desk?.characterBindings.find((item) => item.objectId === object.id))
        return <div key={object.id} style={{ marginBottom: 12 }}><Typography.Text>{object.name || object.id}</Typography.Text>
          {binding && <div><Typography.Text type="secondary">{bindingChanged ? uiText("已选择角色") : uiText("已绑定角色")} {binding.assetId} {uiText("/ 图片") + " "}{binding.referenceFileId ?? uiText("未指定")}{bindingChanged ? uiText(" · 待发布") : ''}</Typography.Text></div>}
          <Select style={{ width: '100%' }} allowClear loading={optionsLoading} disabled={busy || optionsLoading || !validTarget} placeholder={optionsLoading ? uiText("角色候选加载中…") : uiText("选择角色造型参考图")} value={binding ? options.findIndex((option) => String(option.assetId) === String(binding.assetId) && String(option.fileId) === String(binding.referenceFileId)) >= 0 ? options.findIndex((option) => String(option.assetId) === String(binding.assetId) && String(option.fileId) === String(binding.referenceFileId)) : undefined : undefined}
            options={options.map((option, index) => ({ value: index, label: option.displayName, disabled: !option.selectable || option.assetId == null || option.fileId == null }))}
            onChange={(index: number | undefined) => {
              const option = index == null ? undefined : options[index]
              setBindings((current) => [...current.filter((item) => item.objectId !== object.id), ...(option?.assetId != null ? [{ objectId: object.id, assetId: option.assetId, characterLookId: option.characterLookId, referenceFileId: option.fileId }] : [])])
              const characterName = option?.characterName?.trim() || option?.assetName?.trim()
              if (option?.assetId != null && characterName) {
                useDirectorStore.getState().updateObjectName(object.id, characterName)
              }
            }} />
          {binding && <Button type="link" disabled={busy} onClick={() => setBindings((current) => current.filter((item) => item.objectId !== object.id))}>{uiText("解除绑定")}</Button>}
        </div>
      })}
      <Typography.Text type="secondary">{uiText("绑定修改需点击“保存”发布，发布后重新检查绑定状态。")}</Typography.Text>
      <Button type="primary" style={{ marginLeft: 12 }} loading={busy} disabled={!desk || desk.deleted || !dirty} onClick={() => void run(async () => { await save(); message.success(uiText("角色绑定已保存并发布")) })}>{uiText("保存")}</Button>
    </Modal>
    <Modal title={uiText("参考素材")} width={960} centered className="director-reference-modal" destroyOnClose open={referenceOpen} onCancel={() => !busy && setReferenceOpen(false)} footer={null}>
      <div className="director-reference-layout">
      <section className="director-reference-preview">
        <div className="director-reference-section-heading">{uiText("参考预览")}</div>
        <div className="director-reference-preview-media">{referenceOpen && reference?.fileUrl && (reference.referenceType === 5 ? <LazyDirectorImage src={reference.fileUrl} width="100%" /> : <LazyDirectorVideo key={reference.fileUrl} src={reference.fileUrl} alt={reference.displayName} width="100%" height={180} mediaType={directorReferenceMediaType(reference) === 'audio' ? 'audio' : 'video'} />)}</div>
        <p>{uiText("应用后保存参考与来源，不会立即生成。失败时可重试，无需重新上传。")}</p>
        <Checkbox checked={includeCharacters} disabled={busy} onChange={(event) => setIncludeCharacters(event.target.checked)}>{uiText("附带角色参考图")}</Checkbox>
      </section>
      <div className="director-reference-settings">
      <section className="director-reference-video">
      <div className="director-reference-section-heading">{uiText("应用到视频")}</div>
      <div className="director-reference-video-controls">
        <Button disabled={busy} onClick={() => void run(async () => setVideoModels(await StudioModelsApi.getVideoModels()))}>{uiText("加载视频模型")}</Button>
        <Select aria-label={uiText("视频模型")} style={{ minWidth: 180 }} placeholder={uiText("选择视频模型")} value={modelId ?? undefined} options={videoModels.map((item) => ({ label: item.name, value: item.id }))} disabled={busy} onChange={(value) => { setModelId(value); setSelection(null) }} />
        <Button disabled={busy || !modelId || !reference} onClick={() => void run(async () => {
          if (!modelId || !reference) return
          const current = await api.references(referenceSegment, modelId)
          setSelection(current)
        })}>{uiText("读取参考区")}</Button>
        <Button disabled={busy || !modelId || !reference} onClick={() => void run(async () => {
          if (!modelId || !reference) return
          const applications = await api.segmentApplications(referenceSegment)
          const current = await api.references(referenceSegment, modelId)
          const applied = await api.applyCapture({ segmentId: referenceSegment, fileId: reference.fileId, target: 'video', modelId, includeCharacters, expectedApplicationRevisionNo: applications.video.applicationRevisionNo, expectedReferenceRevisionNo: current.revisionNo })
          setSelection(applied.videoReferenceSelection)
          message.success(uiText("已应用到片段视频，原有参考保留；可返回片段发起生成"))
        })}>{uiText("应用到片段视频")}</Button>
      </div>
      {selection && <List dataSource={selection.references} renderItem={(item) => <List.Item>{directorReferenceMediaType(item) === 'image'
        ? <LazyDirectorImage src={item.fileUrl} alt={item.displayName} width={96} height={72} style={{ objectFit: 'contain' }} />
        : <LazyDirectorVideo key={`${item.fileId}-${item.fileUrl}`} src={item.fileUrl} alt={item.displayName} mediaType={directorReferenceMediaType(item) === 'audio' ? 'audio' : 'video'} />}
        <span style={{ flex: 1, marginLeft: 12 }}>{item.referenceToken || uiText("参考 {0}", item.referenceIndex ?? '')} · {item.displayName}</span></List.Item>} />}
      </section>
      {referenceOpen && reference?.referenceType === 5 && <DirectorCaptureImageForm key={String(reference.fileId)} reference={reference} bindings={includeCharacters ? referenceBindings : []} characterOptions={referenceSegment === segmentId.trim() ? options : []} includeCharacters={includeCharacters} visualStyleId={referenceSegment === initialSegmentId ? initialVisualStyleId : null} segmentId={referenceSegment} aspectRatio={referenceAspectRatio} />}
      </div>
      </div>
    </Modal>
    <Modal title={uiText("产物与历史追溯")} open={historyOpen} onCancel={() => !busy && setHistoryOpen(false)} footer={null} width={800}>
      <Space><InputNumber min={1} precision={0} value={revision} onChange={setRevision} placeholder={uiText("历史修订号")} /><Button disabled={busy || !revision} onClick={() => confirmDiscard(async () => { if (desk && revision) await activate(await api.detail(desk.id, revision), true) })}>{uiText("读取历史修订")}</Button><Button disabled={busy} onClick={() => confirmDiscard(async () => { if (desk) await activate(await api.detail(desk.id)) })}>{uiText("读取最新版本")}</Button></Space>
      <Button disabled={busy || !desk} onClick={() => confirmDiscard(async () => { if (desk) await activate(await api.forkRevision(desk.id, desk.revisionNo, initialSegmentId)) })}>{uiText("复制当前修订继续编辑")}</Button>
      <List dataSource={revisionItems} renderItem={(item) => <List.Item><Button disabled={busy} onClick={() => confirmDiscard(async () => { if (desk) await activate(await api.detail(desk.id, item.revisionNo), true) })}>{uiText("查看修订") + " "}{item.revisionNo}</Button>{item.createdAt}</List.Item>} />
      <Pagination current={revisionPage} pageSize={20} total={revisionTotal} showSizeChanger={false} onChange={(value) => void run(async () => { if (!desk) return; const result = await api.revisions(desk.id, value); setRevisionItems(result.items); setRevisionPage(value) })} />
      <List dataSource={captures} renderItem={(item) => <List.Item actions={[
        <Button key="revision" disabled={busy} onClick={() => confirmDiscard(async () => activate(await api.detail(item.directorDeskId, item.directorRevisionNo), true))}>{uiText("查看来源修订")}</Button>,
        ...([
          <Button key="reference" disabled={busy} onClick={() => void run(async () => {
            const source = await api.detail(item.directorDeskId, item.directorRevisionNo)
            setReference({ referenceType: item.fileType === 'image' ? 5 : 7, fileId: item.fileId, fileUrl: item.fileUrl, displayName: item.fileName })
            setReferenceSegment(String(item.segmentId)); setReferenceBindings(source.characterBindings); setReferenceAspectRatio(source.viewSettings.viewportAspectRatio)
            setSelection(null); setHistoryOpen(false); setReferenceOpen(true)
          })}>{item.fileType === 'image' ? uiText("使用垫图") : uiText("使用参考视频")}</Button>,
          <Button key="cover" disabled={busy || desk?.deleted || item.fileType !== 'image'} onClick={() => void run(async () => { await save(readDirectorSnapshot(), item.fileId); message.success(uiText("已保存工程并更新封面")) })}>{uiText("设为封面")}</Button>,
        ]),
      ]}><List.Item.Meta title={<a href={item.fileUrl} target="_blank" rel="noreferrer">{item.fileName}</a>} description={uiText("修订 {0} · 文件 {1} · 片段 ID：{2} · {3}", item.directorRevisionNo, item.fileId, item.segmentId, item.fileType)} /></List.Item>} />
    </Modal>
  </>
}
