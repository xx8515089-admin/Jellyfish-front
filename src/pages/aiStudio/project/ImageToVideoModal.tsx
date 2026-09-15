import CreditIcon from '../../../components/CreditIcon'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Input, Modal, Progress } from 'antd'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { ImageToVideoService as api } from '../../../services/generated/services/ImageToVideoService'
import type { ImageToVideoModel } from '../../../services/generated/models/ImageToVideoModel'
import type { ImageToVideoDetail } from '../../../services/generated/models/ImageToVideoDetail'
import type { ImageToVideoEstimate } from '../../../services/generated/models/ImageToVideoEstimate'
import type { StoryboardPanelImage } from '../../../services/generated/models/StoryboardPanelImage'
import type { PanelVideoPrompt } from '../../../services/generated/models/PanelVideoPrompt'
import { getApiErrorMessage } from '../../../services/apiErrors'
import { schedulePollWhenVisible } from './assetBatchGenerationPolling'
import StudioSelect from './StudioSelect'
import { buildImageToVideoRequest, canGenerateImageVideoPrompt, imageToVideoPromptLength, validPanelBounds } from './imageToVideoContract'
import './ImageToVideoModal.css'

type StyleOption = { id?: string | number | null; name: string }
type Props = { imageGenerationId: string; imageUrl: string; visualStyles: StyleOption[]; toneStyles: StyleOption[]; onClose: () => void; onCompleted: (segmentId: number) => void }
/** Validate the business envelope independently of HTTP status. */
function unwrap<T>(value: { code: number; message?: string; data?: T }): T {
  if (value.code !== 200 || value.data == null) throw new Error(value.message || '请求失败')
  return value.data
}
/** Treat LocalDateTime as local, without inventing a UTC suffix. */
function expired(value: ImageToVideoEstimate) {
  if (!value.priceValidUntil) return false
  const time = Date.parse(value.priceValidUntil.replace(' ', 'T'))
  return !Number.isFinite(time) || time <= Date.now()
}
/** Independent first-frame generation; never modifies multi-reference selections. */
export default function ImageToVideoModal(props: Props) {
  const l = useBilingualText()
  const [prompt, setPrompt] = useState('')
  const [panelImage, setPanelImage] = useState<StoryboardPanelImage>()
  const [sourceRatio, setSourceRatio] = useState(1)
  const [panelError, setPanelError] = useState('')
  const [panelReload, setPanelReload] = useState(0)
  const [scope, setScope] = useState<'whole_image' | 'single_panel' | 'all_panels'>('whole_image')
  const [panelId, setPanelId] = useState<string>()
  const [snapshot, setSnapshot] = useState<{ key: string; value: PanelVideoPrompt }>()
  const [promptBusy, setPromptBusy] = useState(false)
  const promptRequest = useRef<ReturnType<typeof api.generatePanelPrompt>>()
  const selectionEpoch = useRef(0)
  const [models, setModels] = useState<ImageToVideoModel[]>([])
  const [modelId, setModelId] = useState<number>()
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('')
  const [visualStyleId, setVisualStyleId] = useState<number | null>(null)
  const [toneStyleId, setToneStyleId] = useState<number | null>(null)
  const [quote, setQuote] = useState<{ key: string; value: ImageToVideoEstimate }>()
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [record, setRecord] = useState<ImageToVideoDetail>()
  const [retry, setRetry] = useState(0)
  const [pollRetry, setPollRetry] = useState(0)
  const [pollError, setPollError] = useState('')
  const lock = useRef(false)
  const alive = useRef(true)
  const completed = useRef<number>()
  const onCompleted = useRef(props.onCompleted)
  onCompleted.current = props.onCompleted
  const model = models.find((item) => item.id === modelId)
  const maxPrompt = Math.min(5000, model?.maxPromptCharacters || 5000)
  const promptLength = imageToVideoPromptLength(prompt, model?.modelCode)
  const quoteKey = `${modelId}:${resolution}:${duration}`
  const validQuote = quote?.key === quoteKey && !expired(quote.value) ? quote.value : undefined
  const locked = busy || Boolean(record) || uncertain
  const selectionKey = JSON.stringify([props.imageGenerationId, scope, panelId, panelImage?.panelRevision, modelId, resolution, duration])
  const selectionKeyRef = useRef(selectionKey)
  selectionKeyRef.current = selectionKey
  const currentSnapshot = snapshot?.key === selectionKey ? snapshot.value : undefined
  const imageReady = panelImage?.status === 3
  const orderedPanels = [...(panelImage?.panels ?? [])].sort((a, b) => a.panelIndex - b.panelIndex)
  const canGeneratePrompt = canGenerateImageVideoPrompt(panelImage, scope, panelId, duration)
  const frameBounds = currentSnapshot?.firstFramePanel?.bounds
  const cropBounds = validPanelBounds(frameBounds) ? frameBounds : undefined
  const canSubmitFrame = Boolean(currentSnapshot && (currentSnapshot.scope === 'whole_image' || cropBounds))
  // Changing a selection invalidates the entire prompt snapshot, including late responses.
  useEffect(() => {
    selectionEpoch.current += 1; promptRequest.current?.cancel(); setPromptBusy(false)
    if (snapshot?.key !== selectionKey) { setSnapshot(undefined); setPrompt('') }
  }, [selectionKey])
  useEffect(() => {
    let active = true
    setPanelImage(undefined); setPanelId(undefined); setSnapshot(undefined); setPrompt(''); setQuote(undefined)
    const request = api.getPanelImage({ id: Number(props.imageGenerationId) })
    void request.then(unwrap).then((value) => { if (active) { setPanelImage(value); setScope(value.panels?.length ? 'single_panel' : 'whole_image'); setPanelError('') } })
      .catch((reason) => { if (active) setPanelError(getApiErrorMessage(reason)) })
    return () => { active = false; request.cancel(); promptRequest.current?.cancel() }
  }, [props.imageGenerationId, panelReload])
  /** Generate a prompt tied to the exact image, panel revision and video settings. */
  const generatePrompt = async () => {
    if (!canGeneratePrompt || !modelId || !resolution || locked || promptBusy || (scope === 'single_panel' && !panelId)) return
    const epoch = ++selectionEpoch.current
    const key = selectionKey
    setPromptBusy(true); setSnapshot(undefined); setPrompt(''); setPanelError('')
    try {
      const request = api.generatePanelPrompt({ requestBody: { imageGenerationId: Number(props.imageGenerationId), scope, ...(scope === 'single_panel' ? { panelId } : {}), ...(scope === 'whole_image' ? {} : { panelRevision: panelImage!.panelRevision! }), modelId, resolution, durationSeconds: duration } })
      promptRequest.current = request
      const value = unwrap(await request)
      if (!alive.current || epoch !== selectionEpoch.current || key !== selectionKeyRef.current) return
      if (value.imageGenerationId !== Number(props.imageGenerationId) || value.scope !== scope || (scope !== 'whole_image' && value.panelRevision !== panelImage?.panelRevision) || value.resolution !== resolution || value.durationSeconds !== duration || (scope === 'single_panel' && value.panelId !== panelId)) throw new Error('分镜或模型参数已变化，请刷新后重新生成提示词')
      if (!models.some((item) => item.id === value.modelId && item.resolutions.includes(value.resolution) && item.durationSeconds.includes(value.durationSeconds))) throw new Error('返回的视频模型不可用，请重新加载模型')
      const resolvedKey = JSON.stringify([props.imageGenerationId, scope, panelId, panelImage?.panelRevision, value.modelId, value.resolution, value.durationSeconds])
      setModelId(value.modelId)
      setSnapshot({ key: resolvedKey, value }); setPrompt(value.prompt)
    } catch (reason) {
      if (alive.current && epoch === selectionEpoch.current) {
        const text = getApiErrorMessage(reason)
        setPanelError(text)
        if (/revision|修订|版本|标注/i.test(text)) setPanelReload((n) => n + 1)
      }
    }
    finally { if (alive.current && epoch === selectionEpoch.current) setPromptBusy(false) }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let active = true
    const request = api.getModels()
    void request.then(unwrap).then((items) => {
      if (!active) return
      setModels(items)
      setModelId((current) => items.some((item) => item.id === current) ? current : (items.find((item) => item.defaultModel) ?? items[0])?.id)
      setError(items.length ? '' : l('暂无可用图生视频模型', 'No image-to-video models available'))
    }).catch((reason) => { if (active) setError(getApiErrorMessage(reason)) })
    return () => { active = false; request.cancel() }
  }, [retry, l])
  useEffect(() => {
    setResolution((current) => model?.resolutions.includes(current) ? current : model?.resolutions[0] ?? '')
    setDuration((current) => model?.durationSeconds.includes(current) ? current : model?.durationSeconds[0] ?? 5)
  }, [model])
  useEffect(() => {
    setQuote(undefined)
    if (locked || !modelId || !model?.resolutions.includes(resolution) || !model.durationSeconds.includes(duration)) return
    let active = true
    let request: ReturnType<typeof api.getEstimate> | undefined
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      request = api.getEstimate({ modelId, resolution, durationSeconds: duration })
      void request.then(unwrap).then((value) => {
        if (!active) return
        if (value.modelId !== modelId) {
          if (models.some((item) => item.id === value.modelId)) setModelId(value.modelId)
          else setError(l('后台模型已变化，请重新加载模型', 'Server model changed; reload models'))
          return
        }
        if (!Number.isFinite(value.creditCost) || value.creditCost < 0 || expired(value)) throw new Error(l('报价无效或已过期，请重新报价', 'Invalid or expired estimate'))
        setQuote({ key: quoteKey, value }); setError('')
        if (value.priceValidUntil) expiryTimer = setTimeout(() => setRetry((n) => n + 1), Math.min(2147483647, Math.max(1, Date.parse(value.priceValidUntil.replace(' ', 'T')) - Date.now())))
      }).catch((reason) => { if (active) setError(getApiErrorMessage(reason)) })
    }, 300)
    return () => { active = false; clearTimeout(timer); clearTimeout(expiryTimer); request?.cancel() }
  }, [modelId, model, models, resolution, duration, quoteKey, retry, locked, l])
  useEffect(() => {
    if (!record || busy) return
    if (record.status === 3) {
      if (completed.current !== record.id) { completed.current = record.id; onCompleted.current(record.segmentId) }
      return
    }
    if (record.status !== 1 && record.status !== 2) return
    let active = true
    let request: ReturnType<typeof api.getDetail> | undefined
    const cancel = schedulePollWhenVisible(() => {
      request = api.getDetail({ id: record.id })
      void request.then(unwrap).then((value) => { if (active) { setRecord(value); setPollError('') } })
        .catch((reason) => { if (active) setPollError(getApiErrorMessage(reason)) })
    }, 3000)
    return () => { active = false; cancel(); request?.cancel() }
  }, [record, pollRetry, busy])
  /** A single POST per action; ambiguous failures require task-center verification. */
  const submit = async () => {
    if (lock.current || locked || !canSubmitFrame || !currentSnapshot || !validQuote || promptLength < 2 || promptLength > maxPrompt) return
    let requestBody
    try { requestBody = buildImageToVideoRequest({ imageGenerationId: String(currentSnapshot.imageGenerationId), modelId: currentSnapshot.modelId, resolution: currentSnapshot.resolution, duration: currentSnapshot.durationSeconds, scope: currentSnapshot.scope, panelId: currentSnapshot.panelId, panelRevision: currentSnapshot.panelRevision, prompt, visualStyleId, toneStyleId }) }
    catch (reason) { setSubmitError(getApiErrorMessage(reason)); return }
    lock.current = true; setBusy(true); setSubmitError('')
    try {
      const response = await api.generate({ requestBody })
      if (response.code !== 200) { if (alive.current) { setSubmitError(response.message || '生成失败'); setPanelReload((n) => n + 1) } return }
      const detail = unwrap(response)
      if (alive.current) setRecord(detail)
    } catch (reason) {
      const body = (reason as { body?: { code?: number } })?.body
      if (alive.current) {
        if (body?.code && body.code !== 200 && (reason as { status?: number }).status !== 500) { setSubmitError(getApiErrorMessage(reason)); setPanelReload((n) => n + 1) }
        else { setUncertain(true); setSubmitError(`${getApiErrorMessage(reason)}。${l('提交状态待确认，请到任务中心或联系后台核查，请勿重复生成。', 'Submission uncertain. Verify in the task center before generating again.')}`) }
      }
    } finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  /** Reconcile an existing provider task without generating a new version. */
  const sync = async () => {
    if (!record || lock.current) return
    lock.current = true; setBusy(true)
    try { const value = unwrap(await api.sync({ requestBody: { id: record.id } })); if (alive.current) { setRecord(value); setPollError('') } }
    catch (reason) { if (alive.current) setPollError(getApiErrorMessage(reason)) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  const styleOptions = (items: StyleOption[]) => [{ value: '', label: l('无风格', 'No style') }, ...items.filter((item) => item.id != null).map((item) => ({ value: String(item.id), label: item.name }))]
  return <Modal open centered width={560} title={l('图生视频', 'Image to video')} footer={null} className="image-to-video-modal"
    maskClosable={!busy} closable={!busy} keyboard={!busy} onCancel={() => !busy && props.onClose()}>
    <div className="image-to-video-modal__body">
      {error && <Alert type="error" showIcon message={error} action={!locked && <Button onClick={() => setRetry((n) => n + 1)}>{l('重新加载', 'Reload')}</Button>} />}
      {submitError && <Alert type="error" showIcon message={submitError} />}
      {panelError && <Alert type="error" message={panelError} />}
      {orderedPanels.length > 0 && <div className="image-to-video-modal__panel-controls">
        <StudioSelect appearance="dark" aria-label="分镜范围" value={scope} disabled={locked} options={[{ value: 'whole_image', label: '整张图片' }, { value: 'single_panel', label: '单个分镜' }, { value: 'all_panels', label: '全部分镜 · 一个视频' }]} onChange={(value) => { setScope(value); setPanelId(undefined) }} />
        <Button disabled={locked} onClick={() => setPanelReload((n) => n + 1)}>刷新标注</Button>
      </div>}
      {!imageReady && <Alert type="info" message={!panelImage ? '正在读取图片信息…' : '图片尚未生成成功，请稍后重试'} />}
      {panelError && !panelImage && <Button onClick={() => setPanelReload((n) => n + 1)}>重新读取图片</Button>}
      {scope !== 'whole_image' && <div className="image-to-video-modal__panels">
        {orderedPanels.map((panel) => <button type="button" key={panel.panelId} disabled={locked || !imageReady || scope === 'all_panels'} className={scope === 'all_panels' || panelId === panel.panelId ? 'is-selected' : ''} onClick={() => setPanelId(panel.panelId)}><strong>镜头 {panel.sourceShotNumber ?? panel.panelIndex}</strong><span>{panel.description}</span></button>)}
      </div>}
      {scope === 'all_panels' && <small>以第一格作为首帧，按全部分镜描述生成一个视频，不保证逐格精确复现。</small>}
      <Button loading={promptBusy} disabled={locked || promptBusy || !canGeneratePrompt || !modelId || !resolution} onClick={() => void generatePrompt()}>生成视频提示词</Button>
      <small>{scope === 'whole_image' ? '识图生成提示词，按文本模型用量计费；生成后可编辑正文。' : currentSnapshot?.generationMethod === 'panel_template' ? '模板编排，不额外扣积分；生成后可编辑正文。' : '根据已保存的分镜描述生成提示词。'}</small>
      {promptBusy && scope === 'whole_image' && <small>正在识别图片，请耐心等待。网络中断后请先核查任务，避免重复计费。</small>}
      {currentSnapshot && !canSubmitFrame && <Alert type="warning" message="首帧坐标缺失或无效，请先校准对应分镜，再刷新并重新生成提示词。" />}
      {scope === 'all_panels' && orderedPanels.length > duration && <small>视频秒数不能少于分镜数量，请增加时长。</small>}
      <label htmlFor="image-to-video-prompt">{l('提示词', 'Prompt')}</label>
      <div className="image-to-video-modal__editor">
        <div className="image-to-video-modal__reference">
          {scope === 'whole_image' ? <img src={props.imageUrl} alt="整张图片首帧" style={{ width: 72, height: 72, objectFit: 'contain' }} /> : cropBounds && <div className="image-to-video-modal__crop" style={{ aspectRatio: sourceRatio * cropBounds.width / cropBounds.height }}><img src={props.imageUrl} alt="首帧裁剪预览" onLoad={(event) => { const image = event.currentTarget; if (image.naturalHeight) setSourceRatio(image.naturalWidth / image.naturalHeight) }} style={{ width: `${100 / cropBounds.width}%`, height: `${100 / cropBounds.height}%`, maxWidth: 'none', position: 'absolute', left: `${-100 * cropBounds.x / cropBounds.width}%`, top: `${-100 * cropBounds.y / cropBounds.height}%` }} /></div>}
          <span>{scope === 'whole_image' ? '首帧 · 整张图片' : currentSnapshot?.firstFramePanel ? `首帧 · 镜头 ${currentSnapshot.firstFramePanel.panelIndex}` : '选择分镜后生成提示词'}</span>
        </div>
        <Input.TextArea id="image-to-video-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={locked || !currentSnapshot} placeholder={l('先生成视频提示词，再编辑动作和镜头运动…', 'Generate a prompt first, then edit the action and camera movement…')} />
        <div className="image-to-video-modal__styles">
          <StudioSelect appearance="dark" aria-label={l('画面风格', 'Visual style')} value={visualStyleId == null ? '' : String(visualStyleId)} options={styleOptions(props.visualStyles)} disabled={locked} onChange={(value) => setVisualStyleId(value ? Number(value) : null)} />
          <StudioSelect appearance="dark" aria-label={l('影调风格', 'Tone style')} value={toneStyleId == null ? '' : String(toneStyleId)} options={styleOptions(props.toneStyles)} disabled={locked} onChange={(value) => setToneStyleId(value ? Number(value) : null)} />
          <small>{promptLength}/{maxPrompt}</small>
        </div>
      </div>
      {model?.modelCode === 'happyhorse/image-to-video' && <small>{l('汉字计双份，最多2500汉字或5000非中文字符；风格合成后以服务端校验为准。', 'Chinese characters count double; styled prompts are validated by the server.')}</small>}
      <div className="image-to-video-modal__settings">
        <StudioSelect appearance="dark" aria-label={l('视频模型', 'Video model')} placeholder={l('选择模型', 'Select model')} value={modelId} options={models.map((item) => ({ value: item.id, label: item.name }))} disabled={locked} onChange={setModelId} />
        <StudioSelect appearance="dark" aria-label={l('分辨率', 'Resolution')} value={resolution || undefined} options={(model?.resolutions ?? []).map((value) => ({ value, label: value.toUpperCase() }))} disabled={locked} onChange={setResolution} />
        <StudioSelect appearance="dark" aria-label={l('时长', 'Duration')} value={duration} options={(model?.durationSeconds ?? []).map((value) => ({ value, label: `${value}s` }))} disabled={locked} onChange={setDuration} />
      </div>
      {!record && <Button block type="primary" size="large" loading={busy} disabled={locked || !canSubmitFrame || !currentSnapshot || !validQuote || promptLength < 2 || promptLength > maxPrompt} onClick={() => void submit()}>{l('生成视频', 'Generate video')} <CreditIcon /> {validQuote?.creditCost ?? '--'}</Button>}
      {record && <>
        <div>{l('视频记录', 'Video record')} #{record.id} · {record.statusName || record.status}</div>
        <Progress percent={record.progress ?? 0} status={record.status === 4 ? 'exception' : record.status === 3 ? 'success' : 'active'} />
        {record.status === 3 && record.outputUrl && <video src={record.outputUrl} controls playsInline style={{ width: '100%', maxHeight: 260 }} />}
        {record.status === 4 && <Alert type="error" message={record.error || l('生成失败', 'Generation failed')} />}
        {record.providerTaskId && <Button loading={busy} onClick={() => void sync()}>{l('同步结果', 'Sync result')}</Button>}
        <small>{l('关闭窗口不会取消后台任务。', 'Closing this dialog does not cancel the task.')}</small>
      </>}
      {pollError && <Alert type="error" message={pollError} action={<Button onClick={() => { setPollError(''); setPollRetry((n) => n + 1) }}>{l('重试查询', 'Retry query')}</Button>} />}
    </div>
  </Modal>
}
