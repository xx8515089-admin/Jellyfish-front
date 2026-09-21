import { uiText, useUiLanguage } from '../../../i18n/uiText'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Collapse, Empty, Input, InputNumber, Modal, Select, Space, Spin, Switch, Tag } from 'antd'
import { getAuthToken } from '../../../auth'
import { videoBatchErrorMessage as errorText, videoBatchItemError } from '../../../services/storyboardVideoBatchErrors'
import { StudioModelsApi, type StudioGenerationModel } from '../../../services/studioModels'
import { StoryboardVideoBatchApi as api, type BatchScope, type VideoBatchCandidates, type VideoBatchDetail, type VideoBatchPreview, type VideoBatchRequest, type VideoBatchSettings } from '../../../services/storyboardVideoBatch'
import { resolveAssetUrl } from '../assets/utils'
import { batchSelectableIds, buildVideoBatchRequest, canSubmitVideoBatch } from './storyboardVideoBatchPolicy'
import { createWorkflowRequestId } from './workflowMediaPolicy'
import { useStoryboardVideoBatches } from './useStoryboardVideoBatches'
import './StoryboardVideoBatchModal.css'

type StyleOption = { id?: string | number | null; name: string }
type Props = BatchScope & {
  open: boolean; onClose: () => void; ratio: string; promptDrafts: Record<string, string>
  onBatchChange: (batch: VideoBatchDetail) => void
  onPromptChange: (segmentId: string, prompt: string) => void
  visualStyleOptions: StyleOption[]; toneStyleOptions: StyleOption[]
}
const states: Record<string, string> = {
  get ungenerated() { return uiText("未生成") }, get waiting() { return uiText("等待中") }, get generating() { return uiText("生成中") }, get succeeded() { return uiText("已成功") }, failed: '失败',
  get needsReview() { return uiText("待核查") }, get queued() { return uiText("排队中") }, get running() { return uiText("处理中") }, get submitted() { return uiText("已提交") }, get blocked() { return uiText("已阻塞") }, get partialFailed() { return uiText("部分失败") },
}
export default function StoryboardVideoBatchModal(props: Props) {
  useUiLanguage()

  const { open, onClose, ratio, promptDrafts, visualStyleOptions, toneStyleOptions } = props
  const { scriptImportId, episodeId } = props
  const [candidates, setCandidates] = useState<VideoBatchCandidates>()
  const [models, setModels] = useState<StudioGenerationModel[]>([])
  const [loading, setLoading] = useState(false)
  const [loadVersion, setLoadVersion] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [durations, setDurations] = useState<Record<number, number | null>>({})
  const [referenceDurations, setReferenceDurations] = useState<Record<number, number | null>>({})
  const [settings, setSettings] = useState<VideoBatchSettings>({
    modelId: 0, aspectRatio: ratio, resolution: '', durationSeconds: null, generateAudio: false, inheritPreviousVideo: true,
  })
  const [quote, setQuote] = useState<{ key: string; request: VideoBatchRequest; preview: VideoBatchPreview }>()
  const [previewing, setPreviewing] = useState(false)
  const [previewVersion, setPreviewVersion] = useState(0)
  const [budget, setBudget] = useState<number | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [retryOf, setRetryOf] = useState<number | null>(null)
  const [retrySelections, setRetrySelections] = useState<Record<number, number[]>>({})
  const [retryAllowed, setRetryAllowed] = useState<number[] | null>(null)
  const [playback, setPlayback] = useState<string>()
  const [view, setView] = useState<'generate' | 'history'>('generate')
  const [expandedDescriptions, setExpandedDescriptions] = useState<number[]>([])
  const previewSequence = useRef(0)
  const submitLock = useRef(false)
  const submissionIdentity = useRef<{ key: string; id: string }>()
  const handleSubmissionAccepted = () => {
    submissionIdentity.current = undefined
    setSelected([]); setRetryOf(null); setRetryAllowed(null); setRetrySelections({})
    setQuote(undefined); setBudget(null); setConfirmed(false); setError('')
    setLoadVersion((value) => value + 1)
  }
  const batch = useStoryboardVideoBatches({ scriptImportId, episodeId }, (updated) => {
    props.onBatchChange(updated)
    // Changed task states affect eligibility and continuity pricing, not just history.
    setQuote(undefined); setConfirmed(false)
    setLoadVersion((value) => value + 1)
  }, handleSubmissionAccepted)
  const locked = batch.busy || Boolean(batch.pending)
  const activeModel = models.find((model) => model.id === settings.modelId)
  const maxItems = Math.min(candidates?.maxItems ?? 50, 50)
  const rows = (candidates?.items ?? []).filter((item) => retryAllowed === null || retryAllowed.includes(item.segmentId))
  const request = buildVideoBatchRequest({ scriptImportId, episodeId }, settings, rows, selected, promptDrafts, durations, referenceDurations)
  const requestKey = JSON.stringify(request)
  const currentKey = useRef(requestKey)
  currentKey.current = requestKey
  const freshQuote = quote?.key === requestKey ? quote : undefined
  const canSubmit = !locked && !loading && !previewing && !loadError && !!freshQuote
    && canSubmitVideoBatch(freshQuote.preview, budget, confirmed)

  useEffect(() => {
    if (!open) return
    let active = true
    const auth = getAuthToken()
    setLoading(true); setLoadError(''); setQuote(undefined); setConfirmed(false)
    const load = async () => {
      const results = await Promise.allSettled([api.candidates({ scriptImportId, episodeId }), StudioModelsApi.getVideoModels()])
      if (!active || auth !== getAuthToken()) return
      const [candidateResult, modelResult] = results
      if (candidateResult.status === 'fulfilled') {
        setCandidates(candidateResult.value)
        const eligible = candidateResult.value.items.filter((item) => item.selectable).map((item) => item.segmentId)
        setSelected((ids) => ids.filter((id) => eligible.includes(id)).slice(0, Math.min(50, candidateResult.value.maxItems)))
      } else { setCandidates(undefined); setLoadError(errorText(candidateResult.reason)) }
      if (modelResult.status === 'fulfilled') {
        const values = modelResult.value
        setModels(values)
        if (!values.length) setLoadError('暂无可用的视频模型，请配置模型后重新加载。')
        setSettings((previous) => {
          if (values.some((model) => model.id === previous.modelId)) return previous
          const model = values.find((value) => value.defaultModel) ?? values[0]
          return { ...previous, modelId: model?.id ?? 0, resolution: model?.videoCapabilities?.resolutions[0] ?? '', generateAudio: Boolean(model?.videoCapabilities?.nativeAudioSupported) }
        })
      } else setLoadError(errorText(modelResult.reason))
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [open, scriptImportId, episodeId, loadVersion])

  useEffect(() => {
    const sequence = ++previewSequence.current
    setQuote(undefined); setConfirmed(false); setError('')
    const frozen = JSON.parse(requestKey) as VideoBatchRequest
    if (!open || loading || loadError || locked || !frozen.items.length || !frozen.settings.modelId || !frozen.settings.resolution) {
      setPreviewing(false)
      return
    }
    const auth = getAuthToken()
    setPreviewing(true)
    const timer = window.setTimeout(async () => {
      try {
        const preview = await api.preview(frozen)
        if (sequence !== previewSequence.current || auth !== getAuthToken() || currentKey.current !== requestKey) return
        setQuote({ key: requestKey, request: frozen, preview })
        setBudget(preview.valid ? preview.estimatedCredits : null)
      } catch (reason) {
        if (sequence === previewSequence.current && auth === getAuthToken()) setError(errorText(reason))
      } finally {
        if (sequence === previewSequence.current && auth === getAuthToken()) setPreviewing(false)
      }
    }, 350)
    return () => { window.clearTimeout(timer); previewSequence.current += 1 }
  }, [requestKey, open, loading, loadError, locked, previewVersion])

  const updateSettings = (patch: Partial<VideoBatchSettings>) => { setConfirmed(false); setSettings((previous) => ({ ...previous, ...patch })) }
  const submit = async () => {
    if (submitLock.current || !canSubmit || !freshQuote || budget === null) return
    submitLock.current = true
    try {
      const identityKey = JSON.stringify([requestKey, budget, retryOf])
      if (submissionIdentity.current?.key !== identityKey) submissionIdentity.current = { key: identityKey, id: createWorkflowRequestId() }
      await batch.send({
        clientRequestId: submissionIdentity.current.id, previewFingerprint: freshQuote.preview.fingerprint!,
        maxTotalCredits: budget, request: freshQuote.request, retryOfBatchId: retryOf,
      })
    } catch (reason) {
      setError(errorText(reason)); setConfirmed(false); setQuote(undefined)
      // Refresh revisions and quotes after an explicit rejection. Unknown submissions remain locked.
      setLoadVersion((value) => value + 1)
    } finally { submitLock.current = false }
  }
  const beginRetry = (original: VideoBatchDetail) => {
    const ids = (retrySelections[original.id] ?? []).filter((id) => original.items.some((item) => item.segmentId === id && item.retryable))
    if (!ids.length || locked) return
    setView('generate')
    setRetryOf(original.id); setRetryAllowed(original.items.filter((item) => item.retryable).map((item) => item.segmentId))
    setSelected(ids); setConfirmed(false); setQuote(undefined); setLoadVersion((value) => value + 1)
  }
  const previewById = new Map(freshQuote?.preview.items.map((item) => [item.segmentId, item]))
  const styleOptions = (values: StyleOption[]) => values.filter((item) => item.id !== null && item.id !== undefined).map((item) => ({ value: item.id!, label: item.name }))

  return <>
    <Modal open={open} title={<div className="storyboard-video-batch__title"><span>{uiText("批量生成视频")}</span><span className="storyboard-video-batch__title-badge">{uiText("多参视频")}</span></div>} width={1180} centered className="storyboard-video-batch" onCancel={onClose} footer={
      <div className="storyboard-video-batch__footer">
        <div className="storyboard-video-batch__quote" aria-live="polite">
          {previewing ? <Space><Spin size="small" /><span>{uiText("正在预检并计算费用…")}</span></Space> : freshQuote ? <>
            <span className="storyboard-video-batch__muted">{freshQuote.preview.valid ? uiText("本批预估") : uiText("有效项小计 · 整批不可提交")}</span>
            <div><strong>{freshQuote.preview.estimatedCredits}</strong><span> {uiText("积分")}</span><small>{uiText("余额") + " "}{freshQuote.preview.unlimited ? uiText("不限额") : freshQuote.preview.currentBalance}</small></div>
            {!freshQuote.preview.sufficient && <span className="storyboard-video-batch__error">{uiText("余额不足，请补充额度或减少片段。")}</span>}
            {freshQuote.preview.hasPendingDependencies && <small>{uiText("前段费用按计划时长估算，超预算的片段会停止。")}</small>}
          </> : <><strong>{uiText("已选") + " "}{selected.length} {uiText("个片段")}</strong><small>{uiText("选择片段和模型后自动预检报价")}</small></>}
          <Button type="link" size="small" disabled={locked || loading || !selected.length} onClick={() => { setConfirmed(false); setQuote(undefined); setPreviewVersion((value) => value + 1) }}>{uiText("重新预检")}</Button>
        </div>
        <div className="storyboard-video-batch__budget">
          <label htmlFor="video-batch-budget">{uiText("预算上限") + " "}<span>{uiText("积分")}</span></label>
          <InputNumber id="video-batch-budget" min={0} precision={2} placeholder={uiText("预检后填写")} value={budget} disabled={locked || !freshQuote?.preview.valid || previewing} onChange={(value) => { setBudget(value); setConfirmed(false) }} />
          <Checkbox checked={confirmed} disabled={locked || !freshQuote?.preview.valid || !freshQuote.preview.sufficient || previewing} onChange={(event) => setConfirmed(event.target.checked)}>{uiText("确认本次报价及预算上限")}</Checkbox>
        </div>
        <div className="storyboard-video-batch__actions">
          {view === 'history' && <Button type="link" size="small" onClick={() => setView('generate')}>{uiText("返回选择片段")}</Button>}
          <Space><Button onClick={onClose}>{uiText("关闭")}</Button><Button type="primary" loading={batch.busy} disabled={!canSubmit || view === 'history'} onClick={() => void submit()}>
            {retryOf ? uiText("确认创建重试批次") : uiText("生成 {0} 个片段", selected.length)}
          </Button></Space>
          <small>{uiText("关闭弹窗后，后台任务仍会继续")}</small>
        </div>
      </div>
    }>
      <div className="storyboard-video-batch__intro">
        <p>{uiText("选择本集片段，统一设置生成参数。每个片段将新增一个视频历史版本。")}</p>
        <div className="storyboard-video-batch__tabs" role="tablist" aria-label={uiText("批量视频")} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 'generate' : event.key === 'End' ? 'history' : view === 'generate' ? 'history' : 'generate'
          setView(next)
          document.getElementById(`video-batch-${next}-tab`)?.focus()
        }}>
          <button type="button" id="video-batch-generate-tab" role="tab" tabIndex={view === 'generate' ? 0 : -1} aria-selected={view === 'generate'} aria-controls="video-batch-generate-panel" onClick={() => setView('generate')}>{uiText("选择与设置")}<span>{selected.length}</span></button>
          <button type="button" id="video-batch-history-tab" role="tab" tabIndex={view === 'history' ? 0 : -1} aria-selected={view === 'history'} aria-controls="video-batch-history-panel" onClick={() => setView('history')}>{uiText("批次记录")}<span>{batch.batches.length}</span>{batch.batches.some((item) => item.shouldPoll) && <i aria-label={uiText("有批次正在处理")} />}</button>
        </div>
      </div>
      <div className="storyboard-video-batch__notices">
        {batch.pending && <Alert type="warning" showIcon message={uiText("上一次提交结果尚未确认")} description={<>
          <p>{uiText("提交标识：")}{batch.pending.clientRequestId}{uiText("。请先查询状态，或用已保存的完整请求原样重发。")}</p>
          <Space><Button loading={batch.busy} onClick={() => void batch.recover()}>{uiText("查询提交状态")}</Button>
            <Button disabled={batch.busy} onClick={() => void batch.send().catch(() => {})}>{uiText("原样重发")}</Button></Space>
        </>} />}
        {loadError && <Alert type="error" message={loadError} action={<Button onClick={() => setLoadVersion((value) => value + 1)}>{uiText("重新加载")}</Button>} />}
        {(error || batch.error) && <Alert type="error" message={error || batch.error} />}
        {retryOf && <Alert type="info" message={uiText("正在重试批次 #{0}，将按当前参数重新报价，创建独立批次。", retryOf)} action={<Button disabled={locked} onClick={() => { setRetryOf(null); setRetryAllowed(null); setSelected([]); setConfirmed(false) }}>{uiText("取消重试")}</Button>} />}
      </div>
      <div id="video-batch-generate-panel" role="tabpanel" aria-labelledby="video-batch-generate-tab" hidden={view !== 'generate'} className="storyboard-video-batch__panel">
        <Spin spinning={loading}>
          <div className="storyboard-video-batch__layout">
            <section className="storyboard-video-batch__candidates" aria-label={uiText("选择片段")}>
              <div className="storyboard-video-batch__section-heading"><h3>{uiText("选择片段") + " "}<span>{rows.length}</span></h3><small>{uiText("已选") + " "}<b>{selected.length}</b> / {maxItems} {uiText("· 超出请分批")}</small></div>
              <div className="storyboard-video-batch__toolbar"><Space wrap size={6}>
                <Button size="small" disabled={locked || loading} onClick={() => setSelected(batchSelectableIds(rows, maxItems))}>{uiText("全选可选项")}</Button>
                <Button size="small" disabled={locked || loading} onClick={() => setSelected(batchSelectableIds(rows, maxItems, true))}>{uiText("选择未生成")}</Button>
                <Button type="text" size="small" disabled={locked || loading || !selected.length} onClick={() => setSelected([])}>{uiText("清空")}</Button>
              </Space><Button type="text" size="small" disabled={locked || loading} onClick={() => setLoadVersion((value) => value + 1)}>{uiText("刷新片段")}</Button></div>
              <div className="storyboard-video-batch__rows">
                {!rows.length && !loading && <Empty description={uiText("暂无可用片段")} />}
                {rows.map((item) => {
                  const checked = selected.includes(item.segmentId)
                  const expanded = expandedDescriptions.includes(item.segmentId)
                  const preview = previewById.get(item.segmentId)
                  const hasVideo = item.latestVideoGenerationId !== null && item.latestVideoGenerationId !== undefined
                  const customTitle = item.title && !/^片段[-\s]*\d+$/.test(item.title)
                  return <article key={item.segmentId} className={`storyboard-video-batch__row${checked ? ' is-selected' : ''}${!item.selectable ? ' is-unavailable' : ''}`}>
                    <div className="storyboard-video-batch__row-heading">
                      <Checkbox checked={checked} disabled={locked || loading || !item.selectable || (!checked && selected.length >= maxItems)} aria-label={uiText("选择片段 {0}", item.segmentIndex)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, item.segmentId] : ids.filter((id) => id !== item.segmentId))} />
                      <div className="storyboard-video-batch__cover">{item.coverUrl ? <img src={resolveAssetUrl(item.coverUrl)} alt="" loading="lazy" /> : <span>{String(item.segmentIndex).padStart(2, '0')}</span>}</div>
                      <div className="storyboard-video-batch__row-content">
                        <div className="storyboard-video-batch__row-title"><strong>{uiText("片段") + " "}{item.segmentIndex}{customTitle ? ` · ${item.title}` : ''}</strong><span className="storyboard-video-batch__status" data-state={item.videoState}>{states[item.videoState] ?? item.videoState}</span></div>
                        <p id={`video-batch-description-${item.segmentId}`} className={`storyboard-video-batch__description${expanded ? ' is-expanded' : ''}`}>{item.description || uiText("暂无片段摘要")}</p>
                        <div className="storyboard-video-batch__meta"><small>{item.suggestedDurationSeconds !== null && item.suggestedDurationSeconds !== undefined ? uiText("建议 {0} 秒", item.suggestedDurationSeconds) : uiText("时长待识别")}{hasVideo ? uiText(" · 已有成功版本") : ''}</small>
                          {item.description && <button type="button" aria-expanded={expanded} aria-controls={`video-batch-description-${item.segmentId}`} onClick={() => setExpandedDescriptions((ids) => expanded ? ids.filter((id) => id !== item.segmentId) : [...ids, item.segmentId])}>{expanded ? uiText("收起摘要") : uiText("展开摘要")}</button>}
                        </div>
                      </div>
                    </div>
                    {(item.reason || item.errorCode) && <p className="storyboard-video-batch__error storyboard-video-batch__row-notice">{videoBatchItemError(item.errorCode, item.reason)}</p>}
                    {checked && <div className="storyboard-video-batch__item-options">
                      <label>{uiText("本段时长（秒）")}<InputNumber aria-label={uiText("片段 {0} 时长", item.segmentIndex)} min={1} precision={0} placeholder={uiText("自动识别")} value={durations[item.segmentId]} disabled={locked || settings.durationSeconds !== null} onChange={(value) => setDurations((values) => ({ ...values, [item.segmentId]: value }))} /></label>
                      <label>{uiText("手动参考视频总秒数")}<InputNumber aria-label={uiText("片段 {0} 手动参考视频总秒数", item.segmentIndex)} min={0} value={referenceDurations[item.segmentId] ?? 0} disabled={locked} onChange={(value) => setReferenceDurations((values) => ({ ...values, [item.segmentId]: value }))} /></label>
                      {(!item.hasPrompt || promptDrafts[String(item.segmentId)] !== undefined) && <label className="storyboard-video-batch__prompt">{uiText("完整视频提示词")}<Input.TextArea rows={3} maxLength={50000} value={promptDrafts[String(item.segmentId)] ?? ''} disabled={locked} onChange={(event) => props.onPromptChange(String(item.segmentId), event.target.value)} /></label>}
                      {preview && <div className={preview.valid ? 'storyboard-video-batch__quote-line' : 'storyboard-video-batch__error'}>
                        {preview.valid ? uiText("{0} 秒 · {1} 积分{2}", preview.durationSeconds, preview.estimatedCredits, preview.dependencySegmentId ? uiText(" · 等待本批前段") : '') : videoBatchItemError(preview.errorCode, preview.reason)}
                      </div>}
                    </div>}
                  </article>
                })}
              </div>
            </section>
            <section className="storyboard-video-batch__settings" aria-label={uiText("生成设置")}>
              <div className="storyboard-video-batch__section-heading"><h3>{uiText("生成设置")}</h3><small>{uiText("应用于全部所选片段")}</small></div>
              <div className="storyboard-video-batch__setting-group">
                <label>{uiText("视频模型")}<Select value={settings.modelId || undefined} disabled={locked} placeholder={uiText("选择模型")} options={models.map((model) => ({ value: model.id, label: model.name }))} onChange={(modelId) => {
                  const model = models.find((value) => value.id === modelId)
                  updateSettings({ modelId, resolution: model?.videoCapabilities?.resolutions[0] ?? '', generateAudio: Boolean(model?.videoCapabilities?.nativeAudioSupported) })
                }} /></label>
                <div className="storyboard-video-batch__field-grid">
                  <label>{uiText("分辨率")}<Select value={settings.resolution || undefined} disabled={locked} options={(activeModel?.videoCapabilities?.resolutions ?? []).map((value) => ({ value, label: value }))} onChange={(resolution) => updateSettings({ resolution })} /></label>
                  <label>{uiText("画幅")}<Select value={settings.aspectRatio} disabled={locked} options={['9:16', '4:3', '16:9', '3:4', '1:1', '21:9'].map((value) => ({ value, label: value }))} onChange={(aspectRatio) => updateSettings({ aspectRatio })} /></label>
                </div>
                <label>{uiText("统一时长（秒）")}<InputNumber min={1} precision={0} placeholder={uiText("留空，按各片段自动识别")} value={settings.durationSeconds} disabled={locked} onChange={(durationSeconds) => updateSettings({ durationSeconds })} /></label>
              </div>
              <div className="storyboard-video-batch__setting-group">
                <div className="storyboard-video-batch__field-grid">
                  <label>{uiText("视觉风格")}<Select allowClear placeholder={uiText("沿用提示词")} value={settings.visualStyleId ?? undefined} disabled={locked} options={styleOptions(visualStyleOptions)} onChange={(visualStyleId) => updateSettings({ visualStyleId })} /></label>
                  <label>{uiText("情绪风格")}<Select allowClear placeholder={uiText("沿用提示词")} value={settings.toneStyleId ?? undefined} disabled={locked} options={styleOptions(toneStyleOptions)} onChange={(toneStyleId) => updateSettings({ toneStyleId })} /></label>
                </div>
                <div className="storyboard-video-batch__switch-field">
                  <label className="storyboard-video-batch__toggle">{uiText("生成原生音频")}<Switch checked={settings.generateAudio} disabled={locked || !activeModel?.videoCapabilities?.nativeAudioSupported} onChange={(generateAudio) => updateSettings({ generateAudio })} /></label>
                  <small>{uiText("关闭后不影响后续配音。")}</small>
                </div>
                <div className="storyboard-video-batch__switch-field">
                  <label className="storyboard-video-batch__toggle">{uiText("视频衔接")}<Switch checked={settings.inheritPreviousVideo} disabled={locked} onChange={(inheritPreviousVideo) => updateSettings({ inheritPreviousVideo })} /></label>
                  <small>{uiText("衔接紧邻上一片段，保持动作连续；关闭后独立生成。")}</small>
                </div>
              </div>
              <details className="storyboard-video-batch__help"><summary>{uiText("参考素材与计费说明")}</summary>
                <p>{uiText("使用已保存的参考区。未知本地参考视频需在片段中填写完整手动总时长，不含自动衔接的前段。")}</p>
                <p>{uiText("按子任务派发时预留额度。预算限制累计首次预留额，最终结算以实际用量为准，退款不恢复本批预算。")}</p>
              </details>
            </section>
          </div>
        </Spin>
      </div>
      <div id="video-batch-history-panel" role="tabpanel" aria-labelledby="video-batch-history-tab" hidden={view !== 'history'} className="storyboard-video-batch__history">
        <div className="storyboard-video-batch__section-heading"><h3>{uiText("本集批次历史")}</h3><Button size="small" onClick={() => void batch.refresh()}>{uiText("刷新进度")}</Button></div>
        <Collapse items={batch.batches.map((original) => ({ key: String(original.id), label: <Space wrap><span>{uiText("批次 #")}{original.id}</span><Tag>{states[original.status] ?? original.status}</Tag><span>{uiText("成功") + " "}{original.succeededCount}/{original.total} {uiText("· 失败") + " "}{original.failedCount} {uiText("· 阻塞") + " "}{original.blockedCount} {uiText("· 待核查") + " "}{original.needsReviewCount}</span></Space>, children: <>
          <p>{original.createdAt} {uiText("· 已累计预留") + " "}{original.committedCredits} {uiText("/ 预算") + " "}{original.maxTotalCredits} {uiText("积分")}</p>
          {original.items?.map((item) => <div className="storyboard-video-batch__history-item" key={item.id}>
            <Checkbox disabled={locked || !item.retryable} checked={(retrySelections[original.id] ?? []).includes(item.segmentId)} onChange={(event) => setRetrySelections((values) => ({ ...values, [original.id]: event.target.checked ? [...(values[original.id] ?? []), item.segmentId] : (values[original.id] ?? []).filter((id) => id !== item.segmentId) }))}>{uiText("片段") + " "}{item.segmentIndex}</Checkbox>
            <Tag>{states[item.status]}</Tag>
            {item.status === 'submitted' && <span>{uiText("阶段进度") + " "}{item.progress ?? 0}{uiText("%（非供应商精确进度）")}</span>}
            {item.dependencySegmentId && <small>{uiText("依赖片段 ID") + " "}{item.dependencySegmentId}</small>}
            <span>{uiText("预估") + " "}{item.estimatedCredits} {uiText("积分")}</span>
            {item.outputUrl && <Button size="small" onClick={() => setPlayback(resolveAssetUrl(item.outputUrl!))}>{uiText("查看成片")}</Button>}
            {(item.errorMessage || item.errorCode) && <span className="storyboard-video-batch__error">{videoBatchItemError(item.errorCode, item.errorMessage)}</span>}
            {item.status === 'needsReview' && <small>{uiText("请先在原视频历史核查／恢复，再刷新本批次；不可直接重试收费生成。")}</small>}
          </div>)}
          <Space wrap><Button size="small" disabled={locked} onClick={() => setRetrySelections((values) => ({ ...values, [original.id]: original.items.filter((item) => item.retryable).map((item) => item.segmentId) }))}>{uiText("选择全部可重试项")}</Button>
            <Button size="small" disabled={locked || !(retrySelections[original.id] ?? []).some((id) => original.items.some((item) => item.segmentId === id && item.retryable))} onClick={() => beginRetry(original)}>{uiText("重新预检所选失败／阻塞项")}</Button></Space>
        </> }))} />
        {!batch.batches.length && <Empty description={uiText("暂无批次记录")} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        {batch.hasMore && <Button onClick={() => void batch.loadMore()}>{uiText("加载更早批次")}</Button>}
      </div>
    </Modal>
    <Modal open={!!playback} title={uiText("批次成片")} footer={null} onCancel={() => setPlayback(undefined)} destroyOnClose>
      {playback && <video controls src={playback} style={{ width: '100%' }} />}
    </Modal>
  </>
}
