import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Empty, Modal, Spin, message } from 'antd'
import {
  CaretRightFilled,
  CheckOutlined,
  PauseOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { getApiErrorMessage } from '../../../services/apiErrors'
import { StudioVoicesApi } from '../../../services/systemVoices'
import type {
  SystemVoiceAgeGroup,
  SystemVoiceGender,
  SystemVoiceRead,
} from '../../../services/systemVoices'
import StudioSelect from './StudioSelect'
import './VoiceLibraryModal.css'

type VoiceLibraryModalProps = {
  open: boolean
  onCancel: () => void
  /** 第三步挂载时预加载；其他调用方仍保持打开弹窗后再加载。 */
  preload?: boolean
  currentVoiceId?: number
  onApply?: (voice: SystemVoiceRead) => Promise<void> | void
}

type NumericFilter<T extends number> = 'all' | T
type LanguageFilter = 'all' | 'cn' | 'en'

const getPrimaryLanguageName = (voice: SystemVoiceRead) => (
  voice.languages.find((language) => language.primaryLanguage)?.name
  ?? voice.languages[0]?.name
  ?? ''
)

export default function VoiceLibraryModal({
  open,
  onCancel,
  preload = false,
  currentVoiceId,
  onApply,
}: VoiceLibraryModalProps) {
  const l = useBilingualText()
  const [gender, setGender] = useState<NumericFilter<SystemVoiceGender>>('all')
  const [ageGroup, setAgeGroup] = useState<NumericFilter<SystemVoiceAgeGroup>>('all')
  const [languageCode, setLanguageCode] = useState<LanguageFilter>('all')
  const [voices, setVoices] = useState<SystemVoiceRead[]>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [voicesError, setVoicesError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const [selectedVoiceId, setSelectedVoiceId] = useState<number>()
  const [applying, setApplying] = useState(false)
  const [playingVoiceId, setPlayingVoiceId] = useState<number>()
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const modalSessionRef = useRef(0)
  const applyRequestRef = useRef(0)
  const shouldLoad = preload || open

  const stopPreview = useCallback(() => {
    const audio = voicePreviewAudioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    voicePreviewAudioRef.current = null
    setPlayingVoiceId(undefined)
  }, [])

  useEffect(() => () => {
    const audio = voicePreviewAudioRef.current
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    voicePreviewAudioRef.current = null
  }, [])

  useEffect(() => {
    modalSessionRef.current += 1
    if (!open) {
      stopPreview()
      return
    }
    setApplying(false)
  }, [open, stopPreview])

  useEffect(() => {
    if (open) setSelectedVoiceId(currentVoiceId)
  }, [currentVoiceId, open])

  useEffect(() => {
    if (!shouldLoad) return

    let active = true
    setVoicesLoading(true)
    setVoicesError('')
    const request = StudioVoicesApi.requestAvailable({
      gender: gender === 'all' ? undefined : gender,
      ageGroup: ageGroup === 'all' ? undefined : ageGroup,
      languageCode: languageCode === 'all' ? undefined : languageCode,
    })

    void request.promise
      .then((nextVoices) => {
        if (!active) return
        setVoices(nextVoices)
      })
      .catch((error: unknown) => {
        if (!active) return
        setVoices([])
        setVoicesError(getApiErrorMessage(error, l('音色库加载失败', 'Failed to load voices')))
      })
      .finally(() => {
        if (active) setVoicesLoading(false)
      })

    return () => {
      active = false
      request.cancel()
    }
  }, [ageGroup, gender, l, languageCode, retryToken, shouldLoad])

  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId)

  const togglePreview = (voice: SystemVoiceRead) => {
    if (!voice.previewUrl) {
      message.info(l('该音色暂无试听音频', 'No preview is available for this voice'))
      return
    }
    if (playingVoiceId === voice.id) {
      stopPreview()
      return
    }

    stopPreview()
    const audio = new Audio(voice.previewUrl)
    audio.preload = 'none'
    voicePreviewAudioRef.current = audio
    setPlayingVoiceId(voice.id)
    const clearCurrentAudio = () => {
      if (voicePreviewAudioRef.current !== audio) return
      voicePreviewAudioRef.current = null
      setPlayingVoiceId(undefined)
    }
    audio.addEventListener('ended', clearCurrentAudio, { once: true })
    audio.addEventListener('error', clearCurrentAudio, { once: true })
    void audio.play().catch(() => {
      if (voicePreviewAudioRef.current !== audio) return
      clearCurrentAudio()
      message.error(l('音色试听失败', 'Failed to play the voice preview'))
    })
  }

  const applySelectedVoice = async () => {
    if (!selectedVoice || !onApply || applying) return
    const modalSession = modalSessionRef.current
    const requestId = applyRequestRef.current + 1
    applyRequestRef.current = requestId
    setApplying(true)
    try {
      await onApply(selectedVoice)
      if (modalSessionRef.current === modalSession) onCancel()
    } catch (error) {
      if (modalSessionRef.current === modalSession) {
        message.error(getApiErrorMessage(error, l('应用音色失败', 'Failed to apply voice')))
      }
    } finally {
      if (
        applyRequestRef.current === requestId
        && modalSessionRef.current === modalSession
      ) {
        setApplying(false)
      }
    }
  }

  return (
    <Modal
      open={open}
      centered
      width={960}
      title={l('音色库', 'Voice library')}
      footer={null}
      rootClassName="voice-library-modal"
      closable={!applying}
      keyboard={!applying}
      maskClosable={!applying}
      onCancel={() => {
        if (!applying) onCancel()
      }}
    >
      <div className="voice-library-modal__toolbar">
        <strong className="voice-library-modal__category">
          <span>{l('可用音色', 'Available voices')}</span>
          <span className="voice-library-modal__count">{voices.length}</span>
        </strong>
        <div className="voice-library-modal__filters">
          <StudioSelect
            value={gender}
            aria-label={l('性别', 'Gender')}
            options={[
              { value: 'all', label: l('全部性别', 'All genders') },
              { value: 1, label: l('男性', 'Male') },
              { value: 2, label: l('女性', 'Female') },
            ]}
            onChange={(value) => setGender(value as NumericFilter<SystemVoiceGender>)}
          />
          <StudioSelect
            value={ageGroup}
            aria-label={l('声音年龄', 'Voice age')}
            options={[
              { value: 'all', label: l('全部年龄', 'All ages') },
              { value: 1, label: l('儿童', 'Child') },
              { value: 2, label: l('少年', 'Teen') },
              { value: 3, label: l('青年', 'Young adult') },
              { value: 4, label: l('中年', 'Middle-aged') },
              { value: 5, label: l('老年', 'Senior') },
            ]}
            onChange={(value) => setAgeGroup(value as NumericFilter<SystemVoiceAgeGroup>)}
          />
          <StudioSelect
            value={languageCode}
            aria-label={l('语言', 'Language')}
            options={[
              { value: 'all', label: l('全部语言', 'All languages') },
              { value: 'cn', label: l('中文', 'Chinese') },
              { value: 'en', label: l('英文', 'English') },
            ]}
            onChange={(value) => setLanguageCode(value as LanguageFilter)}
          />
        </div>
      </div>

      <div className="voice-library-modal__list" aria-busy={voicesLoading}>
        {voicesLoading ? (
          <div className="voice-library-modal__state" role="status" aria-live="polite">
            <Spin />
            <span>{l('正在加载音色…', 'Loading voices…')}</span>
          </div>
        ) : voicesError ? (
          <div className="voice-library-modal__state is-error" role="alert">
            <span>{voicesError}</span>
            <Button icon={<ReloadOutlined />} onClick={() => setRetryToken((value) => value + 1)}>
              {l('重新加载', 'Retry')}
            </Button>
          </div>
        ) : voices.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={l('没有符合筛选条件的音色', 'No voices match these filters')}
          />
        ) : voices.map((voice) => {
          const languageName = getPrimaryLanguageName(voice)
          const metadata = [voice.genderName, voice.ageGroupName, languageName].filter(Boolean).join(' · ')
          const previewPlaying = playingVoiceId === voice.id
          return (
            <div
              key={voice.id}
              className={`voice-library-modal__voice${selectedVoiceId === voice.id ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={selectedVoiceId === voice.id}
              onClick={() => setSelectedVoiceId(voice.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                setSelectedVoiceId(voice.id)
              }}
            >
              <button
                type="button"
                className="voice-library-modal__preview-icon"
                aria-label={previewPlaying
                  ? l(`暂停试听${voice.name}`, `Pause ${voice.name}`)
                  : l(`试听${voice.name}`, `Preview ${voice.name}`)}
                disabled={!voice.previewUrl}
                onClick={(event) => {
                  event.stopPropagation()
                  togglePreview(voice)
                }}
              >
                {previewPlaying ? <PauseOutlined /> : <CaretRightFilled />}
              </button>
              <span className="voice-library-modal__voice-copy">
                <span className="voice-library-modal__voice-heading">
                  <strong title={voice.name}>{voice.name}</strong>
                  {voice.emotionAdjustable && <small>{l('可调情绪', 'Adjustable')}</small>}
                </span>
                {metadata && <span className="voice-library-modal__voice-meta">{metadata}</span>}
              </span>
              {selectedVoiceId === voice.id && <CheckOutlined className="voice-library-modal__selected-mark" />}
            </div>
          )
        })}
      </div>

      <footer className="voice-library-modal__footer">
        <span className="voice-library-modal__selection-status" aria-live="polite">
          {selectedVoice
            ? l(`已选择：${selectedVoice.name}`, `Selected: ${selectedVoice.name}`)
            : l('请选择一个音色', 'Select a voice')}
        </span>
        <Button
          type="primary"
          loading={applying}
          disabled={!selectedVoice || !onApply || voicesLoading || Boolean(voicesError)}
          onClick={() => void applySelectedVoice()}
        >
          {l('应用', 'Apply')}
        </Button>
      </footer>
    </Modal>
  )
}
