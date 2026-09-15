import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Input, InputNumber, Modal, Slider, Space, Spin, Tag, message } from 'antd'
import { StudioDubbingApi as api, type DubbingCharacter, type DubbingGeneration, type DubbingId, type DubbingLine, type DubbingLineFields, type DubbingPanel } from '../../../services/studioDubbing'
import { StudioModelsApi, type StudioGenerationModel } from '../../../services/studioModels'
import { getApiErrorMessage } from '../../../services/apiErrors'
import { resolveAssetUrl } from '../assets/utils'
import VoiceLibraryModal from './VoiceLibraryModal'
import { CloseOutlined, DownOutlined, InfoCircleOutlined, SettingOutlined, DeleteOutlined, PlayCircleFilled, DownloadOutlined, ClockCircleOutlined, MessageOutlined, PlusCircleOutlined } from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import StudioSelect from './StudioSelect'
import VoiceTextEditor, { type VoiceTextEditorHandle } from './VoiceTextEditor'

const VOICE_PAUSE_OPTIONS = [
  { label: '0.25s', token: '<#0.25#>' },
  { label: '0.5s', token: '<#0.5#>' },
  { label: '1s', token: '<#1#>' },
  { label: '1.5s', token: '<#1.5#>' },
]

const VOICE_INTERJECTION_OPTIONS = [
  ['笑声', 'Laughter'], ['轻笑', 'Chuckling'], ['咳嗽', 'Cough'], ['清嗓子', 'Clear throat'], ['呻吟', 'Groan'],
  ['换气', 'Breath'], ['喘气', 'Panting'], ['吸气', 'Inhale'], ['呼气', 'Exhale'], ['倒吸气', 'Gasp'],
  ['吸鼻子', 'Sniff'], ['叹气', 'Sigh'], ['喷鼻息', 'Snort'], ['打嗝', 'Hiccup'], ['咀嚼', 'Chewing'],
  ['哼唱', 'Humming'], ['嘶吼声', 'Roar'], ['嗯', 'Hmm'], ['喷嚏', 'Sneeze'],
] as const

const VOICE_EMOTIONS = [
  ['自动', 'Auto'], ['高兴', 'Happy'], ['悲伤', 'Sad'], ['愤怒', 'Angry'],
  ['害怕', 'Fearful'], ['厌恶', 'Disgusted'], ['惊讶', 'Surprised'], ['中性', 'Neutral'],
] as const


const formatVoiceRate = (value: number) => `${value.toFixed(2)}x`
const pending = (generation?: DubbingGeneration | null) => generation?.status === 1 || generation?.status === 2
const statusNames: Record<number, string> = { 1: '待提交', 2: '生成中', 3: '生成成功', 4: '生成失败', 5: '已取消' }
const fieldsOf = (line: DubbingLineFields): DubbingLineFields => ({ characterAssetId: line.characterAssetId, dialogueText: line.dialogueText, emotionPrompt: line.emotionPrompt, volume: line.volume, speechRate: line.speechRate })
const emptyFields = (): DubbingLineFields => ({ characterAssetId: null, dialogueText: '', emotionPrompt: '', volume: null, speechRate: null })

function AudioResult({ generation }: { generation: DubbingGeneration }) {
  const [downloading, setDownloading] = useState(false)
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Space><Tag color={generation.status === 4 ? 'error' : generation.status === 3 ? 'success' : 'processing'}>{statusNames[generation.status] ?? '未知状态'}</Tag>{generation.createdAt}</Space>
    {generation.errorMessage && <Alert type="error" message={generation.errorMessage} />}
    {generation.status === 3 && generation.outputUrl && <Space wrap>
      <audio controls preload="none" src={resolveAssetUrl(generation.outputUrl)} onError={() => message.error('配音文件加载失败，请重试或下载音频')} />
      <Button loading={downloading} onClick={async () => {
        setDownloading(true)
        try { const response = await fetch(resolveAssetUrl(generation.outputUrl!)!)
          if (!response.ok) throw new Error('音频下载失败')
          const url = URL.createObjectURL(await response.blob())
          const link = document.createElement('a')
          link.href = url
          link.download = `dubbing-${generation.id}.${generation.outputUrl!.split('?')[0].split('.').pop() || 'mp3'}`
          document.body.appendChild(link)
          link.click(); link.remove()
          window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
        catch (error) { message.error(getApiErrorMessage(error, '音频下载失败')) }
        finally { setDownloading(false) }
      }}>下载音频</Button>
    </Space>}
  </Space>
}

export default function StoryboardDubbingPanel({ segmentId }: { segmentId: DubbingId }) {
  const [panel, setPanel] = useState<DubbingPanel>()
  const [models, setModels] = useState<StudioGenerationModel[]>([])
  const [modelId, setModelId] = useState<number>()
  const [format, setFormat] = useState('mp3')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modelError, setModelError] = useState('')
  const [pollError, setPollError] = useState('')
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const alive = useRef(false)
  const [voiceCharacter, setVoiceCharacter] = useState<DubbingCharacter>()
  const [editing, setEditing] = useState<{ id?: DubbingId; fields: DubbingLineFields }>()
  const [history, setHistory] = useState<{ lineId: DubbingId; items: DubbingGeneration[]; loading: boolean; error?: string }>()
  const model = models.find((item) => item.id === modelId)
  const capabilities = model?.speechCapabilities
  const formats = capabilities?.formats?.length ? capabilities.formats : [capabilities?.defaultFormat || 'mp3']

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    void api.panel(segmentId).then((data) => { if (active) setPanel(data) })
      .catch((reason) => { if (active) setError(getApiErrorMessage(reason, '配音面板加载失败')) })
      .finally(() => { if (active) setLoading(false) })
    void StudioModelsApi.getSpeechModels(true).then((data) => {
      if (!active) return
      setModels(data); setModelError('')
      setModelId(undefined)
      setFormat('mp3')
    }).catch((reason) => { if (active) setModelError(getApiErrorMessage(reason, '语音模型加载失败')) })
    return () => { active = false }
  }, [segmentId, retry])

  const jobsKey = JSON.stringify(panel?.lines.filter((line) => pending(line.latestGeneration)).map((line) => ({ lineId: line.id, id: line.latestGeneration!.id })) ?? [])
  useEffect(() => {
    const jobs = JSON.parse(jobsKey) as { lineId: DubbingId; id: DubbingId }[]
    if (!jobs.length) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      if (!active) return
      if (document.visibilityState === 'hidden') { timer = setTimeout(poll, 3000); return }
      const results = await Promise.allSettled(jobs.map(async (job) => ({ ...job, generation: await api.detail(job.id) })))
      if (!active) return
      const failed = results.find((result) => result.status === 'rejected')
      setPollError(failed ? '生成状态暂时获取失败，正在自动重试。' : '')
      setPanel((current) => current && ({ ...current, lines: current.lines.map((line) => {
        const result = results.find((item) => item.status === 'fulfilled' && String(item.value.lineId) === String(line.id))
        return result?.status === 'fulfilled' && String(line.latestGeneration?.id) === String(result.value.id) ? { ...line, latestGeneration: result.value.generation } : line
      }) }))
      timer = setTimeout(poll, 3000)
    }
    timer = setTimeout(poll, 2000)
    return () => { active = false; clearTimeout(timer) }
  }, [jobsKey])

  async function act(action: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true)
    try { await action() }
    catch (reason) { if (alive.current) message.error(getApiErrorMessage(reason, '配音操作失败')) }
    finally { busyRef.current = false; if (alive.current) setBusy(false) }
  }
  async function saveVoice(voiceId: number | null, character = voiceCharacter) {
    if (!character) return
    const updated = await api.updateVoice(segmentId, character.assetId, voiceId)
    if (!alive.current) return
    setPanel((current) => current && ({ ...current, characters: current.characters.map((item) => String(item.assetId) === String(updated.assetId) ? updated : item) }))
    setVoiceCharacter(undefined)
  }
  async function loadHistory(lineId: DubbingId) {
    setHistory({ lineId, items: [], loading: true })
    try {
      const items = await api.history(lineId)
      if (alive.current) setHistory((current) => current && String(current.lineId) === String(lineId) ? { lineId, items, loading: false } : current)
    } catch (reason) {
      if (alive.current) setHistory((current) => current && String(current.lineId) === String(lineId) ? { ...current, loading: false, error: getApiErrorMessage(reason, '历史加载失败') } : current)
    }
  }
  function generationError(line: DubbingLine) {
    if (modelId !== undefined && !model) return '所选语音模型不可用，请重新选择'
    if (!line.dialogueText.trim()) return '请先填写台词'
    const character = panel?.characters.find((item) => String(item.assetId) === String(line.characterAssetId))
    if (!character) return '请先为台词选择本集角色'
    if (!character.voiceConfigured || !character.voiceConfig) return '请先配置角色音色'
    const cap = model?.speechCapabilities
    if (cap?.maxInputCharacters && Array.from(line.dialogueText).length > cap.maxInputCharacters) return `台词超过模型字数上限 ${cap.maxInputCharacters}`
    const voice = character.voiceConfig.voice
    if (cap?.voiceProviderCode && voice.providerCode && cap.voiceProviderCode !== voice.providerCode) return '当前音色供应商与模型不兼容'
    const language = voice.languages?.find((item) => item.primaryLanguage)?.code ?? voice.languages?.[0]?.code
    if (language && cap?.languages?.length && !cap.languages.includes(language)) return '模型不支持当前音色语言'
    const volume = line.volume ?? panel!.settings.volume
    const rate = line.speechRate ?? panel!.settings.speechRate
    if (volume < (cap?.minVolume ?? 0.5) || volume > (cap?.maxVolume ?? 2)) return '音量超出模型支持范围'
    if (rate < (cap?.minSpeechRate ?? 0.5) || rate > (cap?.maxSpeechRate ?? 2)) return '语速超出模型支持范围'
    if (!formats.includes(format)) return '请选择模型支持的输出格式'
    return ''
  }


  const l = useBilingualText()
  const [voiceInfoVisible, setVoiceInfoVisible] = useState(true)
  const [voiceConfigExpanded, setVoiceConfigExpanded] = useState(true)
  const [voiceBasicsExpanded, setVoiceBasicsExpanded] = useState(true)
  const [expandedVoiceLineId, setExpandedVoiceLineId] = useState<string | null>(null)
  const [playingVoiceLineId, setPlayingVoiceLineId] = useState<string | null>(null)
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const voiceEditorRefs = useRef(new Map<string, VoiceTextEditorHandle>())
  const [lineUi, setLineUi] = useState<Record<string, { expressionPanel?: 'pause' | 'interjection' | null; customPauseExpanded?: boolean; customPauseSeconds?: string; emotionExpanded?: boolean }>>({})
  const voiceLines = (panel?.lines ?? []).map((line) => {
    const character = panel?.characters.find((item) => String(item.assetId) === String(line.characterAssetId))
    return { ...line, ...lineUi[String(line.id)], id: String(line.id), character: character?.characterName || line.characterName || '待选择角色', voice: character?.voiceConfig?.voice.name || '未配置音色', text: line.dialogueText, volume: line.volume ?? panel!.settings.volume, speed: line.speechRate ?? panel!.settings.speechRate, emotion: line.emotionPrompt || '自动', customPauseSeconds: lineUi[String(line.id)]?.customPauseSeconds || '', audioUrl: line.latestGeneration?.status === 3 ? line.latestGeneration.outputUrl : null }
  })
  type VoiceLineDraft = typeof voiceLines[number]
  const voiceRoleOptions = (panel?.characters ?? []).map((character) => ({ value: String(character.assetId), label: <span className="project-clip-editor__voice-option-label"><span><strong>{character.characterName}</strong><i />{l('音色', 'Voice')}：{character.voiceConfig?.voice.name || '未配置音色'}</span></span> }))
  const updateVoiceLine = (id: string, patch: Partial<VoiceLineDraft>) => {
    setLineUi((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
    setPanel((current) => current && ({ ...current, lines: current.lines.map((line) => String(line.id) !== id ? line : { ...line,
      ...(patch.text !== undefined ? { dialogueText: patch.text } : {}),
      ...(patch.characterAssetId !== undefined ? { characterAssetId: patch.characterAssetId } : {}),
      ...(patch.volume !== undefined ? { volume: patch.volume } : {}),
      ...(patch.speed !== undefined ? { speechRate: patch.speed } : {}),
      ...(patch.emotion !== undefined ? { emotionPrompt: patch.emotion === '自动' ? null : patch.emotion } : {}),
    }) }))
  }
  const stopVoicePreview = () => { voicePreviewAudioRef.current?.pause(); voicePreviewAudioRef.current = null; setPlayingVoiceLineId(null) }
  useEffect(() => () => { voicePreviewAudioRef.current?.pause() }, [])
  const previewVoiceLine = (line: VoiceLineDraft) => {
    if (playingVoiceLineId === line.id) { stopVoicePreview(); return }
    if (!line.audioUrl) { message.warning('当前台词还没有可试听的配音文件'); return }
    stopVoicePreview()
    const audio = new Audio(resolveAssetUrl(line.audioUrl)); voicePreviewAudioRef.current = audio; setPlayingVoiceLineId(line.id)
    audio.onended = stopVoicePreview
    audio.onerror = () => { stopVoicePreview(); message.error('配音文件加载失败') }
    void audio.play().catch(() => { stopVoicePreview(); message.error('配音文件播放失败') })
  }
  const downloadVoiceLine = (line: VoiceLineDraft, index: number) => void act(async () => {
    if (!line.audioUrl) throw new Error('当前台词还没有可下载的配音文件')
    const response = await fetch(resolveAssetUrl(line.audioUrl)!)
    if (!response.ok) throw new Error('音频下载失败')
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a')
    link.href = url; link.download = 'dubbing-' + (index + 1) + '.' + (line.audioUrl.split('?')[0].split('.').pop() || 'mp3')
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  const appendVoiceToken = (line: VoiceLineDraft, token: string) => {
    const editor = voiceEditorRefs.current.get(line.id)
    if (editor) editor.insertToken(token)
    else updateVoiceLine(line.id, { text: line.text + token })
  }
  const confirmCustomPause = (line: VoiceLineDraft) => {
    const seconds = Number(line.customPauseSeconds)
    if (!Number.isFinite(seconds) || seconds <= 0) return
    appendVoiceToken(line, '<#' + Number(seconds.toFixed(2)) + '#>')
    updateVoiceLine(line.id, { customPauseExpanded: false, customPauseSeconds: '' })
  }
  const addVoiceLine = () => setEditing({ fields: emptyFields() })
  const removeVoiceLine = (id: string) => void act(async () => { await api.deleteLine(id); if (alive.current) { if (playingVoiceLineId === id) stopVoicePreview(); setPanel((current) => current && ({ ...current, lines: current.lines.filter((line) => String(line.id) !== id) })) } })
  const setVoiceVolume = (volume: number) => setPanel((current) => current && ({ ...current, settings: { ...current.settings, volume } }))
  const setVoiceSpeed = (speechRate: number) => setPanel((current) => current && ({ ...current, settings: { ...current.settings, speechRate } }))
  const voiceVolume = panel?.settings.volume ?? 1
  const voiceSpeed = panel?.settings.speechRate ?? 1

  if (loading) return <Spin style={{ padding: 40 }} />
  if (error || !panel) return <Alert type="error" message={error || '配音数据为空'} action={<Button onClick={() => setRetry((value) => value + 1)}>重试</Button>} />
  const settings = panel.settings
  return <>
          <div className="project-clip-editor__voice-panel">
            {voiceInfoVisible && (
              <section className="project-clip-editor__voice-notice" role="status">
                <InfoCircleOutlined />
                <div>
                  <strong>{l('配音导出说明', 'Voiceover export')}</strong>
                  <span>{l('生成的配音为 AI 合成音频，导出后将作为独立音频文件，用于导入剪映等工具进行剪辑。此功能与视频生成相互独立。', 'Generated voiceover is exported as a separate AI audio file for editing and remains independent from video generation.')}</span>
                </div>
                <button type="button" aria-label={l('关闭说明', 'Dismiss notice')} onClick={() => setVoiceInfoVisible(false)}>
                  <CloseOutlined />
                </button>
              </section>
            )}

            <section className="project-clip-editor__voice-accordion">
              <button
                type="button"
                className="project-clip-editor__voice-accordion-trigger"
                aria-expanded={voiceConfigExpanded}
                onClick={() => setVoiceConfigExpanded((current) => !current)}
              >
                <span>
                  <strong>{l('音色配置', 'Voice assignment')}</strong>
                  <small>{l('绑定专属音色，全剧同步变更', 'Bind character voices and sync them across the project')}</small>
                </span>
                <DownOutlined />
              </button>
              {voiceConfigExpanded && (
                <div className="project-clip-editor__voice-binding-list">
                  {!panel.characters.length && <Empty description="本集暂无角色" />}
                  {panel.characters.map((character) => (
                    <button key={character.assetId} type="button" onClick={() => setVoiceCharacter(character)}>
                      <span>{character.characterName}：</span>
                      <strong>{character.voiceConfig?.voice.name || '未配置音色'}</strong>
                      <DownOutlined />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="project-clip-editor__voice-accordion">
              <button
                type="button"
                className="project-clip-editor__voice-accordion-trigger"
                aria-expanded={voiceBasicsExpanded}
                onClick={() => setVoiceBasicsExpanded((current) => !current)}
              >
                <span><strong>{l('基础设置', 'Basic settings')}</strong></span>
                <DownOutlined />
              </button>
              {voiceBasicsExpanded && (
                <div className="project-clip-editor__voice-basics">
                  <label>
                    <span>{l('音量', 'Volume')}</span>
                    <div className="project-clip-editor__voice-slider-control">
                      <Slider min={0.5} max={2} step={0.1} value={voiceVolume} tooltip={{ open: false }} onChange={setVoiceVolume} />
                      <output>{formatVoiceRate(voiceVolume)}</output>
                    </div>
                  </label>
                  <label>
                    <span>{l('音速', 'Speed')}</span>
                    <div className="project-clip-editor__voice-slider-control">
                      <Slider min={0.5} max={2} step={0.1} value={voiceSpeed} tooltip={{ open: false }} onChange={setVoiceSpeed} />
                      <output>{formatVoiceRate(voiceSpeed)}</output>
                    </div>
                  </label>
            <div className="project-clip-editor__voice-model-controls">
              <div className="project-clip-editor__voice-model-field"><span>语音模型</span><StudioSelect aria-label="语音模型" appearance="dark" value={modelId} allowClear placeholder="默认语音模型" options={models.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => { const id = value === undefined ? undefined : Number(value); setModelId(id); const cap = models.find((item) => item.id === id)?.speechCapabilities; setFormat(cap?.defaultFormat || cap?.formats?.[0] || 'mp3') }} /></div>
              <div className="project-clip-editor__voice-model-field"><span>输出格式</span><StudioSelect aria-label="输出格式" appearance="dark" value={format} options={formats.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => setFormat(String(value))} /></div>
              <div className="project-clip-editor__voice-settings-footer"><Button loading={busy} onClick={() => void act(async () => { await api.updateSettings(settings); if (alive.current) message.success('本集设置已保存') })}>保存设置</Button></div>
              {modelError && <Alert type="error" message={modelError} action={<Button onClick={() => setRetry((value) => value + 1)}>重试</Button>} />}
            </div>
                </div>
              )}
            </section>

            <section className="project-clip-editor__voice-lines">
              <div className="project-clip-editor__voice-lines-title">
                <strong>{l('台词配音', 'Dialogue voiceover')}</strong>
                <span>{voiceLines.length} {l('条', 'lines')}</span>
              </div>
              {pollError && <Alert type="warning" message={pollError} />}
              {!voiceLines.length && <Empty description="当前片段暂无台词" />}
              <div className="project-clip-editor__voice-line-list">
                {voiceLines.map((line, index) => {
                  const adjustableVoice = panel.characters.some((character) => String(character.assetId) === String(line.characterAssetId) && character.voiceConfig?.voice.emotionAdjustable)
                  return (
                    <article key={line.id} className={`project-clip-editor__voice-line-card${adjustableVoice ? ' has-adjustable-voice' : ''}`}>
                    <header>
                      <strong>{l('分镜台词', 'Storyboard line')}{index + 1}</strong>
                      <span>
                        <button
                          type="button"
                          className={expandedVoiceLineId === line.id ? 'is-active' : ''}
                          aria-label={expandedVoiceLineId === line.id ? l('收起台词设置', 'Collapse line settings') : l('展开台词设置', 'Expand line settings')}
                          aria-expanded={expandedVoiceLineId === line.id}
                          onClick={() => setExpandedVoiceLineId((current) => (current === line.id ? null : line.id))}
                        >
                          <SettingOutlined />
                        </button>
                        <button type="button" aria-label={l('删除台词', 'Delete line')} disabled={busy} onClick={() => removeVoiceLine(line.id)}><DeleteOutlined /></button>
                      </span>
                    </header>
                    <label>
                      <span>{l('角色', 'Character')}</span>
                      <StudioSelect appearance="dark"
                        value={line.characterAssetId === null ? undefined : String(line.characterAssetId)}
                        options={voiceRoleOptions}
                        aria-label={l('选择角色与音色', 'Select character and voice')}
                        onChange={(value) => {
                          updateVoiceLine(line.id, { characterAssetId: panel.characters.find((item) => String(item.assetId) === String(value))!.assetId })
                        }}
                      />
                    </label>
                    <div className="project-clip-editor__voice-copy-field">
                      <span className="project-clip-editor__voice-copy-label">
                        <span>{l('台词', 'Dialogue')}</span>
                        <span>
                          <button
                            type="button"
                            className={playingVoiceLineId === line.id ? 'is-playing' : ''}
                            aria-label={playingVoiceLineId === line.id ? l('停止试听', 'Stop preview') : l('试听台词', 'Preview line')}
                            title={playingVoiceLineId === line.id ? l('停止试听', 'Stop preview') : l('预览此条配音', 'Preview this voice line')}
                            onClick={() => previewVoiceLine(line)}
                          >
                            <PlayCircleFilled />
                          </button>
                          <button
                            type="button"
                            aria-label={l('下载此条配音', 'Download this voice line')}
                            title={l('下载此条配音', 'Download this voice line')}
                            onClick={() => downloadVoiceLine(line, index)}
                          >
                            <DownloadOutlined />
                          </button>
                        </span>
                      </span>
                      <span className="project-clip-editor__voice-copy-editor">
                        <VoiceTextEditor
                          ref={(editor) => {
                            if (editor) voiceEditorRefs.current.set(line.id, editor)
                            else voiceEditorRefs.current.delete(line.id)
                          }}
                          value={line.text}
                          maxLength={capabilities?.maxInputCharacters || 10000}
                          placeholder={l('输入文字描述你想创作的内容', 'Enter dialogue to synthesize')}
                          onChange={(text) => updateVoiceLine(line.id, { text })}
                        />
                      </span>
                    </div>
                    {adjustableVoice && (
                      <div className="project-clip-editor__voice-expression">
                        <div className="project-clip-editor__voice-expression-toolbar">
                          <button
                            type="button"
                            className={line.expressionPanel === 'pause' ? 'is-active' : ''}
                            aria-expanded={line.expressionPanel === 'pause'}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => updateVoiceLine(line.id, {
                              expressionPanel: line.expressionPanel === 'pause' ? null : 'pause',
                              customPauseExpanded: line.expressionPanel === 'pause' ? false : line.customPauseExpanded,
                              customPauseSeconds: line.expressionPanel === 'pause' ? '' : line.customPauseSeconds,
                            })}
                          >
                            <ClockCircleOutlined />
                            <span>{l('添加停顿', 'Add pause')}</span>
                          </button>
                          <button
                            type="button"
                            className={line.expressionPanel === 'interjection' ? 'is-active' : ''}
                            aria-expanded={line.expressionPanel === 'interjection'}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => updateVoiceLine(line.id, {
                              expressionPanel: line.expressionPanel === 'interjection' ? null : 'interjection',
                              customPauseExpanded: false,
                              customPauseSeconds: '',
                            })}
                          >
                            <MessageOutlined />
                            <span>{l('添加语气词', 'Add expression')}</span>
                          </button>
                        </div>
                        {line.expressionPanel === 'pause' && (
                          <div className="project-clip-editor__voice-token-grid is-pauses">
                            {VOICE_PAUSE_OPTIONS.map(({ label, token }) => (
                              <button
                                key={label}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => appendVoiceToken(line, token)}
                              >
                                {label}
                              </button>
                            ))}
                            <button
                              type="button"
                              className={line.customPauseExpanded ? 'is-active' : ''}
                              aria-expanded={line.customPauseExpanded}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => updateVoiceLine(line.id, {
                                customPauseExpanded: !line.customPauseExpanded,
                                customPauseSeconds: line.customPauseExpanded ? '' : line.customPauseSeconds,
                              })}
                            >
                              {l('自定义', 'Custom')}
                            </button>
                            {line.customPauseExpanded && (
                              <div className="project-clip-editor__voice-custom-pause">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoFocus
                                  value={line.customPauseSeconds}
                                  aria-label={l('自定义停顿时长', 'Custom pause duration')}
                                  placeholder={l('请输入停顿时长（秒）', 'Enter pause duration in seconds')}
                                  onChange={(event) => {
                                    const value = event.target.value.trim()
                                    if (/^\d*(?:\.\d{0,2})?$/.test(value)) {
                                      updateVoiceLine(line.id, { customPauseSeconds: value })
                                    }
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      confirmCustomPause(line)
                                    }
                                    if (event.key === 'Escape') {
                                      updateVoiceLine(line.id, {
                                        customPauseExpanded: false,
                                        customPauseSeconds: '',
                                      })
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className="project-clip-editor__voice-custom-pause-confirm"
                                  disabled={!Number.isFinite(Number(line.customPauseSeconds)) || Number(line.customPauseSeconds) <= 0}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => confirmCustomPause(line)}
                                >
                                  {l('确认', 'Confirm')}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {line.expressionPanel === 'interjection' && (
                          <div className="project-clip-editor__voice-token-grid is-interjections">
                            {VOICE_INTERJECTION_OPTIONS.map(([zhLabel, enLabel]) => (
                              <button
                                key={zhLabel}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => appendVoiceToken(line, `<${zhLabel}>`)}
                              >
                                {l(zhLabel, enLabel)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {adjustableVoice && (
                      <div className={`project-clip-editor__voice-emotion${line.emotionExpanded ? ' is-expanded' : ''}`}>
                        <button
                          type="button"
                          className="project-clip-editor__voice-emotion-trigger"
                          aria-expanded={line.emotionExpanded}
                          onClick={() => updateVoiceLine(line.id, { emotionExpanded: !line.emotionExpanded })}
                        >
                          <span><InfoCircleOutlined />{l(line.emotion, VOICE_EMOTIONS.find(([zhLabel]) => zhLabel === line.emotion)?.[1] ?? line.emotion)}</span>
                          <DownOutlined />
                        </button>
                        {line.emotionExpanded && (
                          <div className="project-clip-editor__voice-emotion-options">
                            {VOICE_EMOTIONS.map(([zhLabel, enLabel]) => (
                              <button
                                key={zhLabel}
                                type="button"
                                className={line.emotion === zhLabel ? 'is-selected' : ''}
                                aria-pressed={line.emotion === zhLabel}
                                onClick={() => updateVoiceLine(line.id, { emotion: zhLabel })}
                              >
                                {l(zhLabel, enLabel)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {expandedVoiceLineId === line.id && (
                      <div className="project-clip-editor__voice-line-settings">
                        <Input aria-label="演绎提示" placeholder="演绎提示" value={line.emotionPrompt || ''} onChange={(event) => updateVoiceLine(line.id, { emotion: event.target.value })} />
                        <Button size="small" type="text" onClick={() => setPanel((current) => current && ({ ...current, lines: current.lines.map((item) => String(item.id) === line.id ? { ...item, volume: null, speechRate: null } : item) }))}>恢复继承本集设置</Button>
                        <label>
                          <span>{l('音量', 'Volume')}</span>
                          <div className="project-clip-editor__voice-slider-control">
                            <Slider
                              min={0.5}
                              max={2}
                              step={0.1}
                              value={line.volume}
                              tooltip={{ open: false }}
                              onChange={(value) => updateVoiceLine(line.id, { volume: value })}
                            />
                            <output>{formatVoiceRate(line.volume)}</output>
                          </div>
                        </label>
                        <label>
                          <span>{l('音速', 'Speed')}</span>
                          <div className="project-clip-editor__voice-slider-control">
                            <Slider
                              min={0.5}
                              max={2}
                              step={0.1}
                              value={line.speed}
                              tooltip={{ open: false }}
                              onChange={(value) => updateVoiceLine(line.id, { speed: value })}
                            />
                            <output>{formatVoiceRate(line.speed)}</output>
                          </div>
                        </label>
                      </div>
                    )}
                    <div className="project-clip-editor__voice-actions">
                      <div className="project-clip-editor__voice-actions-row">
                        <div className="project-clip-editor__voice-secondary-actions">
                        <Button disabled={busy} onClick={() => void act(async () => { const source = panel.lines.find((item) => String(item.id) === line.id)!; await api.updateLine(source.id, fieldsOf(source)); if (alive.current) message.success('台词已保存') })}>保存</Button>
                        <Button onClick={() => void loadHistory(line.id)}>历史</Button>
                        </div>
                        <Button className="project-clip-editor__voice-generate" type="primary" loading={pending(line.latestGeneration)} disabled={busy || !!generationError(line) || pending(line.latestGeneration)} title={generationError(line) || undefined} onClick={() => void act(async () => {
                          const source = panel.lines.find((item) => String(item.id) === line.id)!
                          await api.updateLine(source.id, fieldsOf(source)); await api.updateSettings(settings)
                          const generation = await api.generate(source.id, format, modelId)
                          if (alive.current) setPanel((current) => current && ({ ...current, lines: current.lines.map((item) => String(item.id) === line.id ? { ...item, latestGeneration: { ...generation, status: generation.status ?? 1 } } : item) }))
                        })}>{line.latestGeneration ? '重新生成' : '生成配音'}</Button>
                      </div>
                      {line.latestGeneration && <small className="project-clip-editor__voice-generation-status">{statusNames[line.latestGeneration.status]} {line.latestGeneration.errorMessage}</small>}
                    </div>
                    </article>
                  )
                })}
              </div>
              <button type="button" className="project-clip-editor__add-voice-line" disabled={busy || !panel.characters.length} onClick={addVoiceLine}>
                <PlusCircleOutlined />
                {l('添加出镜角色', 'Add on-screen character')}
              </button>
            </section>
          </div>
    <VoiceLibraryModal open={!!voiceCharacter} currentVoiceId={voiceCharacter?.voiceConfig?.voice.id ?? voiceCharacter?.voiceConfig?.voiceId} onCancel={() => setVoiceCharacter(undefined)} onApply={(voice) => saveVoice(voice.id)} onUnbind={voiceCharacter?.voiceConfigured ? () => saveVoice(null) : undefined} />
    <Modal title={editing?.id === undefined ? '添加台词' : '编辑台词'} open={!!editing} onCancel={() => !busy && setEditing(undefined)} confirmLoading={busy} onOk={() => void act(async () => {
      if (!editing) return
      if ((editing.id === undefined && !editing.fields.characterAssetId) || !editing.fields.dialogueText.trim()) throw new Error('请选择本集角色并填写台词')
      const saved = editing.id === undefined ? await api.addLine(segmentId, editing.fields) : await api.updateLine(editing.id, editing.fields)
      if (!alive.current) return
      setPanel((current) => current && ({ ...current, lines: editing.id === undefined ? [...current.lines, saved] : current.lines.map((item) => item.id === editing.id ? saved : item) }))
      setEditing(undefined)
    })}>
      {editing && <Space direction="vertical" style={{ width: '100%' }}>
        <StudioSelect appearance="dark" aria-label="台词角色" placeholder="选择本集角色" style={{ width: '100%' }} value={editing.fields.characterAssetId === null ? undefined : String(editing.fields.characterAssetId)} options={panel.characters.map((item) => ({ value: String(item.assetId), label: item.characterName }))} onChange={(value) => setEditing({ ...editing, fields: { ...editing.fields, characterAssetId: panel.characters.find((item) => String(item.assetId) === value)!.assetId } })} />
        <Input.TextArea aria-label="台词文本" placeholder="输入台词" rows={4} value={editing.fields.dialogueText} onChange={(event) => setEditing({ ...editing, fields: { ...editing.fields, dialogueText: event.target.value } })} />
        <Input.TextArea aria-label="演绎提示" placeholder="演绎提示，如：克制、低声、短暂停顿" value={editing.fields.emotionPrompt ?? ''} onChange={(event) => setEditing({ ...editing, fields: { ...editing.fields, emotionPrompt: event.target.value } })} />
        <Space wrap>{(['volume', 'speechRate'] as const).map((key) => <label key={key}>{key === 'volume' ? '音量' : '语速'} <InputNumber aria-label={key === 'volume' ? '台词音量' : '台词语速'} placeholder="继承本集" min={0.5} max={2} step={0.05} precision={2} value={editing.fields[key]} onChange={(value) => setEditing({ ...editing, fields: { ...editing.fields, [key]: value } })} /><Button type="link" onClick={() => setEditing({ ...editing, fields: { ...editing.fields, [key]: null } })}>继承本集</Button></label>)}</Space>
      </Space>}
    </Modal>
    <Modal title="台词生成历史" open={!!history} footer={null} onCancel={() => setHistory(undefined)}>
      {history?.loading ? <Spin /> : history?.error ? <Alert type="error" message={history.error} action={<Button onClick={() => void loadHistory(history.lineId)}>重试</Button>} /> : history?.items.length ? history.items.map((item) => <div style={{ padding: '12px 0' }} key={item.id}><AudioResult generation={item} /></div>) : <Empty description="暂无生成历史" />}
    </Modal>
  </>
}
