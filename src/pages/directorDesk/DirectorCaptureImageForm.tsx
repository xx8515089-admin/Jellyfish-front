import { useEffect, useState } from 'react'
import { Alert, Button, Input, Select, Space, Typography, message } from 'antd'
import { StudioModelsApi, type StudioGenerationModel } from '../../services/studioModels'
import { StudioDirectorDesks, buildDirectorImageReferences, type DirectorImageReference, type DirectorBinding, type DirectorReference } from '../../services/studioDirectorDesks'
import { StudioStylesApi, type StudioStyleOption } from '../../services/studioStyles'
import { getApiErrorMessage } from '../../services/apiErrors'

export default function DirectorCaptureImageForm({ reference, bindings, segmentId, aspectRatio, includeCharacters, savedReferences, visualStyleId = null }: {
  reference: DirectorReference; bindings: DirectorBinding[]; segmentId: string; aspectRatio: string; includeCharacters: boolean; savedReferences?: DirectorImageReference[]; visualStyleId?: number | null
}) {
  const [selectedVisualStyleId, setSelectedVisualStyleId] = useState<number | null>(visualStyleId)
  const [styles, setStyles] = useState<StudioStyleOption[]>([])
  const [stylesLoading, setStylesLoading] = useState(false)
  const [stylesError, setStylesError] = useState('')
  const [styleRetry, setStyleRetry] = useState(0)
  useEffect(() => { setSelectedVisualStyleId(visualStyleId) }, [visualStyleId, segmentId])
  useEffect(() => {
    let active = true
    setStylesLoading(true)
    setStylesError('')
    void StudioStylesApi.getOptions(1).then((items) => { if (active) setStyles(items) })
      .catch((reason) => { if (active) setStylesError(getApiErrorMessage(reason)) })
      .finally(() => { if (active) setStylesLoading(false) })
    return () => { active = false }
  }, [styleRetry])
  const [appliedReferences, setAppliedReferences] = useState<DirectorImageReference[] | null>(null)
  const [models, setModels] = useState<StudioGenerationModel[]>([])
  const [modelId, setModelId] = useState<number>()
  const [resolution, setResolution] = useState<number>()
  const [quality, setQuality] = useState<number>()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const model = models.find((item) => item.id === modelId)
  const capabilities = model?.imageCapabilities
  const references = appliedReferences ?? buildDirectorImageReferences(reference, bindings)
  useEffect(() => { setAppliedReferences(savedReferences ?? null) }, [includeCharacters, modelId, savedReferences])
  useEffect(() => {
    let active = true
    setError('')
    void StudioModelsApi.getImageModels(retry > 0).then((items) => {
      if (!active) return
      setModels(items)
      const selected = items.find((item) => item.defaultModel) ?? items[0]
      setModelId(selected?.id)
      setResolution(selected?.imageCapabilities?.resolutions[0])
      setQuality(selected?.imageCapabilities?.qualities[0])
    }).catch((reason) => { if (active) setError(getApiErrorMessage(reason)) })
    return () => { active = false }
  }, [retry])
  const supported = !!capabilities && capabilities.aspectRatios.includes(aspectRatio) && references.length <= capabilities.maxReferenceImages
  return <section className="director-capture-image-form">
    <div className="director-reference-section-heading">使用垫图生成图片</div>
    {error && <Alert type="error" message={error} action={<Button onClick={() => setRetry((value) => value + 1)}>重试加载</Button>} />}
    <Select aria-label="图片模型" style={{ width: '100%' }} placeholder="选择图片模型" value={modelId} disabled={busy || submitted} options={models.map((item) => ({ label: item.name, value: item.id }))} onChange={(id) => {
      const next = models.find((item) => item.id === id)
      setModelId(id); setResolution(next?.imageCapabilities?.resolutions[0]); setQuality(next?.imageCapabilities?.qualities[0])
    }} />
    <label htmlFor="director-image-visual-style">视觉风格</label>
    <Select id="director-image-visual-style" aria-label="视觉风格" style={{ width: '100%' }} loading={stylesLoading} disabled={busy || submitted} value={selectedVisualStyleId ?? 'none'} options={[
      { value: 'none', label: '无风格' },
      ...styles.filter((item) => Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0).map((item) => ({ value: Number(item.id), label: item.name })),
      ...(selectedVisualStyleId != null && !styles.some((item) => Number(item.id) === selectedVisualStyleId) ? [{ value: selectedVisualStyleId, label: `片段所选风格（${selectedVisualStyleId}）` }] : []),
    ]} onChange={(value) => setSelectedVisualStyleId(value === 'none' ? null : Number(value))} />
    {stylesError && <Alert type="warning" message={`风格列表加载失败：${stylesError}`} action={<Button onClick={() => setStyleRetry((value) => value + 1)}>重试</Button>} />}
    <Space>
      <Typography.Text>画幅 {aspectRatio}</Typography.Text>
      <Select aria-label="图片分辨率" style={{ minWidth: 100 }} placeholder="分辨率" value={resolution} disabled={busy || submitted} options={capabilities?.resolutions.map((value) => ({ label: `${value}K`, value }))} onChange={setResolution} />
      {!!capabilities?.qualities.length && <Select aria-label="图片质量" style={{ minWidth: 100 }} placeholder="质量" value={quality} disabled={busy || submitted} options={capabilities.qualities.map((value) => ({ label: String(value), value }))} onChange={setQuality} />}
    </Space>
    {!supported && model && <Alert type="warning" message="此模型不支持当前垫图画幅、参考数量，或未提供图片能力配置。请选择其他模型。" />}
    <div className="director-capture-references">{references.map((item, index) => <div key={`${item.referenceType}-${item.fileId}`}><span>{index + 1}</span><div><strong>{item.displayName}</strong><small>仅用于{item.useOnly}</small></div></div>)}</div>
    <Input.TextArea aria-label="生成图片提示词" rows={4} value={prompt} disabled={busy || submitted} maxLength={capabilities?.maxPromptCharacters || undefined} placeholder="描述最终画面，并确认对应关系，例如：画面左侧人物使用第 1 张角色图，右侧人物使用第 2 张角色图……" onChange={(event) => setPrompt(event.target.value)} />
    <div className="director-capture-actions">
    <Button loading={busy} disabled={busy || !modelId || submitted} onClick={async () => {
      setBusy(true)
      try {
        const current = await StudioDirectorDesks.segmentApplications(segmentId)
        const applied = await StudioDirectorDesks.applyCapture({ segmentId, fileId: reference.fileId, target: 'image', modelId, includeCharacters, expectedApplicationRevisionNo: current.image.applicationRevisionNo })
        setAppliedReferences(applied.imageReferences)
        message.success('已应用到片段图片，尚未发起生成')
      } catch (reason) { message.error(getApiErrorMessage(reason)) }
      finally { setBusy(false) }
    }}>应用到片段图片</Button>
    <Button type="primary" loading={busy} disabled={!appliedReferences || submitted || !supported || !modelId || resolution == null || !prompt.trim()} onClick={async () => {
      if (!appliedReferences || busy || submitted || !modelId || resolution == null || !supported) return
      setBusy(true)
      try {
        await StudioDirectorDesks.generateImage({ segmentId, modelId, resolution, quality, prompt: prompt.trim(), aspectRatio, visualStyleId: selectedVisualStyleId, references })
        setSubmitted(true)
        message.success('图片生成任务已提交，可在目标片段的生成历史中查看结果')
      } catch (reason) { message.error(getApiErrorMessage(reason)) }
      finally { setBusy(false) }
    }}>{submitted ? '图片生成任务已提交' : '生成图片'}</Button>
    </div>
  </section>
}
