import { useEffect, useState } from 'react'
import { Button, Modal } from 'antd'
import { CaretRightFilled, CheckOutlined } from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import StudioSelect from './StudioSelect'
import './VoiceLibraryModal.css'

type VoiceLibraryModalProps = {
  open: boolean
  onCancel: () => void
}

type VoicePreset = {
  id: string
  name: string
  adjustable?: boolean
}

const VOICE_PRESETS: VoicePreset[] = [
  { id: 'narrator-young', name: '解说小帅' },
  { id: 'narrator-female', name: '解说小美' },
  { id: 'sweet-girl', name: '元气甜妹' },
  { id: 'experienced-sister', name: '阅历姐姐', adjustable: true },
  { id: 'intellectual-girl', name: '智性少女' },
  { id: 'sweet-beauty', name: '甜心小美' },
  { id: 'warm-male', name: '温润男声', adjustable: true },
  { id: 'boss', name: '傲娇霸总' },
  { id: 'cherry', name: '樱桃丸子' },
  { id: 'soft-girl', name: '娇弱萝莉' },
  { id: 'playful-princess', name: '调皮公主' },
  { id: 'caring-sister', name: '知心姐姐' },
  { id: 'kind-sister', name: '贴心妹妹' },
  { id: 'elegant', name: '清冷高雅' },
  { id: 'lively', name: '甜美活泼' },
  { id: 'bestie', name: '贴心闺蜜' },
  { id: 'elf-guide', name: '精灵向导' },
  { id: 'charming', name: '妩媚可人' },
  { id: 'attractive-girl', name: '倾心少女' },
  { id: 'girlfriend', name: '魅力女友' },
  { id: 'queen', name: '高冷御姐' },
  { id: 'gentle-lady', name: '温柔淑女' },
  { id: 'direct-girl', name: '直率英子' },
  { id: 'neighbor', name: '邻居阿姨' },
  { id: 'warrior', name: '武则天' },
  { id: 'grandmother', name: '婆婆' },
  { id: 'warm-youth', name: '温润青年', adjustable: true },
]

export default function VoiceLibraryModal({ open, onCancel }: VoiceLibraryModalProps) {
  const l = useBilingualText()
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>()
  const selectedVoice = VOICE_PRESETS.find((voice) => voice.id === selectedVoiceId)

  useEffect(() => {
    if (open) setSelectedVoiceId(undefined)
  }, [open])

  return (
    <Modal
      open={open}
      centered
      width={820}
      title={l('音色库', 'Voice library')}
      footer={null}
      rootClassName="voice-library-modal"
      onCancel={onCancel}
    >
      <div className="voice-library-modal__toolbar">
        <strong className="voice-library-modal__category">
          <span>{l('系统音色', 'System voices')}</span>
          <span className="voice-library-modal__count">{VOICE_PRESETS.length}</span>
        </strong>
        <div className="voice-library-modal__filters">
          <StudioSelect
            defaultValue="all"
            aria-label={l('性别', 'Gender')}
            options={[
              { value: 'all', label: l('性别', 'Gender') },
              { value: 'female', label: l('女声', 'Female') },
              { value: 'male', label: l('男声', 'Male') },
            ]}
          />
          <StudioSelect
            defaultValue="all"
            aria-label={l('声音年龄', 'Voice age')}
            options={[
              { value: 'all', label: l('声音年龄', 'Voice age') },
              { value: 'child', label: l('儿童', 'Child') },
              { value: 'young', label: l('青年', 'Young') },
              { value: 'adult', label: l('成年', 'Adult') },
              { value: 'senior', label: l('老年', 'Senior') },
            ]}
          />
          <StudioSelect
            defaultValue="all"
            aria-label={l('语言', 'Language')}
            options={[
              { value: 'all', label: l('语言', 'Language') },
              { value: 'zh-CN', label: l('中文', 'Chinese') },
              { value: 'en-US', label: l('英文', 'English') },
            ]}
          />
        </div>
      </div>

      <div className="voice-library-modal__list">
        {VOICE_PRESETS.map((voice) => (
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
            <span className="voice-library-modal__preview-icon" aria-hidden="true">
              <CaretRightFilled />
            </span>
            <span className="voice-library-modal__voice-copy">
              <strong title={voice.name}>{voice.name}</strong>
              {voice.adjustable && <small>{l('可调情绪', 'Adjustable')}</small>}
            </span>
            {selectedVoiceId === voice.id && <CheckOutlined className="voice-library-modal__selected-mark" />}
          </div>
        ))}
      </div>

      <footer className="voice-library-modal__footer">
        <span className="voice-library-modal__selection-status" aria-live="polite">
          {selectedVoice
            ? l(`已选择：${selectedVoice.name}`, `Selected: ${selectedVoice.name}`)
            : l('请选择一个音色', 'Select a voice')}
        </span>
        <Button type="primary" disabled={!selectedVoiceId}>{l('应用', 'Apply')}</Button>
      </footer>
    </Modal>
  )
}
