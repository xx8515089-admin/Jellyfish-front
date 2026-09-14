import { useEffect, useState } from 'react'
import { Alert, Button, Input, Select, Space, Typography, message } from 'antd'
import { StudioModelsApi, type StudioGenerationModel } from '../../services/studioModels'
import { StudioDirectorDesks, buildDirectorImageReferences, type DirectorBinding, type DirectorReference } from '../../services/studioDirectorDesks'
import { getApiErrorMessage } from '../../services/apiErrors'

export default function DirectorCaptureImageForm({ reference, bindings, segmentId, aspectRatio }: {
  reference: DirectorReference; bindings: DirectorBinding[]; segmentId: string; aspectRatio: string
}) {
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
  const references = buildDirectorImageReferences(reference, bindings)
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
  return <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
    <Typography.Title level={5}>使用垫图生成图片</Typography.Title>
    {error && <Alert type="error" message={error} action={<Button onClick={() => setRetry((value) => value + 1)}>重试加载</Button>} />}
    <Select aria-label="图片模型" style={{ width: '100%' }} placeholder="选择图片模型" value={modelId} disabled={busy || submitted} options={models.map((item) => ({ label: item.name, value: item.id }))} onChange={(id) => {
      const next = models.find((item) => item.id === id)
      setModelId(id); setResolution(next?.imageCapabilities?.resolutions[0]); setQuality(next?.imageCapabilities?.qualities[0])
    }} />
    <Space>
      <Typography.Text>画幅 {aspectRatio}</Typography.Text>
      <Select aria-label="图片分辨率" style={{ minWidth: 100 }} placeholder="分辨率" value={resolution} disabled={busy || submitted} options={capabilities?.resolutions.map((value) => ({ label: `${value}K`, value }))} onChange={setResolution} />
      {!!capabilities?.qualities.length && <Select aria-label="图片质量" style={{ minWidth: 100 }} placeholder="质量" value={quality} disabled={busy || submitted} options={capabilities.qualities.map((value) => ({ label: String(value), value }))} onChange={setQuality} />}
    </Space>
    {!supported && model && <Alert type="warning" message="此模型不支持当前垫图画幅、参考数量，或未提供图片能力配置。请选择其他模型。" />}
    {references.map((item, index) => <Typography.Text key={`${item.referenceType}-${item.fileId}`}>第 {index + 1} 张：{item.displayName}；仅用于{item.useOnly}</Typography.Text>)}
    <Input.TextArea aria-label="生成图片提示词" rows={4} value={prompt} disabled={busy || submitted} maxLength={capabilities?.maxPromptCharacters || undefined} placeholder="描述最终画面，并确认对应关系，例如：画面左侧人物使用第 1 张角色图，右侧人物使用第 2 张角色图……" onChange={(event) => setPrompt(event.target.value)} />
    <Button type="primary" loading={busy} disabled={submitted || !supported || !modelId || resolution == null || !prompt.trim()} onClick={async () => {
      if (busy || submitted || !modelId || resolution == null || !supported) return
      setBusy(true)
      try {
        await StudioDirectorDesks.generateImage({ segmentId, modelId, resolution, quality, prompt: prompt.trim(), aspectRatio, visualStyleId: 5, references })
        setSubmitted(true)
        message.success('图片生成任务已提交，可在目标片段的生成历史中查看结果')
      } catch (reason) { message.error(getApiErrorMessage(reason)) }
      finally { setBusy(false) }
    }}>{submitted ? '图片生成任务已提交' : '生成图片'}</Button>
  </Space>
}
