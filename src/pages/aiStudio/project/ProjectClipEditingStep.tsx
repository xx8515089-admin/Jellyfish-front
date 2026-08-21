import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Button, Input, Modal, Popover, Slider, Tooltip, message } from 'antd'
import {
  AudioOutlined,
  BgColorsOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  MergeCellsOutlined,
  PictureOutlined,
  PlayCircleFilled,
  PlusOutlined,
  PlusCircleOutlined,
  QuestionCircleFilled,
  SettingOutlined,
  ThunderboltFilled,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import ImageViewer from './ImageViewer'
import { PROJECT_STYLE_OPTIONS_BY_VISUAL } from './ProjectVisualStyleAndStyleFields'
import StudioSelect from './StudioSelect'
import VoiceLibraryModal from './VoiceLibraryModal'
import {
  PROJECT_CREATION_DRAFT_KEYS,
  buildEpisodeSourceSignature,
  readProjectCreationDraft,
  useProjectCreationDraft,
} from './projectCreationDraft'
import './ProjectClipEditingStep.css'

type EpisodeDraft = {
  id: string
  title: string
  rawText: string
}

type ProjectClipEditingStepProps = {
  episodes: EpisodeDraft[]
  ratio: string
  styleName: string
}

type GenerationMode = 'video' | 'image' | 'voice'
type ClipEditorMode = 'edit' | 'insert-above' | 'insert-below'
type PromptMentionKind = 'character' | 'scene'

type PromptMentionAsset = {
  id: string
  name: string
  imageUrl: string
  kind: PromptMentionKind
}

const VIDEO_DURATION_MIN = 4
const VIDEO_DURATION_MAX = 30

type ClipDraft = {
  id: string
  title: string
  description: string
  prompt: string
  imageUrl: string
}

type VoiceLineDraft = {
  id: string
  character: string
  voice: string
  text: string
  audioUrl?: string
  volume: number
  speed: number
  expressionPanel: 'pause' | 'interjection' | null
  customPauseExpanded: boolean
  customPauseSeconds: string
  emotion: string
  emotionExpanded: boolean
}

type ClipEditingDraft = {
  sourceSignature: string
  clips: ClipDraft[]
  activeClipId: string
  mode: GenerationMode
  promptByClip: Record<string, string>
  model: string
  resolution: string
  videoModel: string
  videoResolution: '480P' | '720P'
  videoDuration: number
  selectedRatio: string
  selectedTone: string
  selectedStyle: string
  storyboardSkillEnabled: boolean
  historyIndexByClip: Record<string, number>
  voiceVolume: number
  voiceSpeed: number
  voiceLines: VoiceLineDraft[]
}

const isGenerationMode = (value: unknown): value is GenerationMode => (
  value === 'video' || value === 'image' || value === 'voice'
)

const isVideoResolution = (value: unknown): value is '480P' | '720P' => (
  value === '480P' || value === '720P'
)

const INITIAL_VOICE_LINES: VoiceLineDraft[] = [
  { id: 'voice-line-1', character: '楚青', voice: '温润男声', text: '拼个桌，不介意吧？', volume: 1, speed: 1, expressionPanel: 'interjection', customPauseExpanded: false, customPauseSeconds: '', emotion: '害怕', emotionExpanded: true },
  { id: 'voice-line-2', character: '姜萱', voice: '元气甜妹', text: '', volume: 1, speed: 1, expressionPanel: null, customPauseExpanded: false, customPauseSeconds: '', emotion: '自动', emotionExpanded: false },
  { id: 'voice-line-3', character: '旁白', voice: '解说小美', text: '1', volume: 1, speed: 1, expressionPanel: null, customPauseExpanded: false, customPauseSeconds: '', emotion: '自动', emotionExpanded: false },
]

const VOICE_BINDINGS = [
  { character: '旁白', voice: '解说小美', adjustable: false },
  { character: '姜萱', voice: '元气甜妹', adjustable: false },
  { character: '食客群体', voice: '油腻大叔', adjustable: false },
  { character: '楚青', voice: '温润男声', adjustable: true },
]

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

const PREVIEW_IMAGES = [
  '/assets/project-create/tone-suspense.jpg',
  '/assets/project-create/international-live-action.jpg',
  '/assets/project-create/tone-documentary.jpg',
  '/assets/project-create/tone-cyberpunk.jpg',
]

const NO_STYLE_VALUE = '__no_style__'
const NO_TONE_VALUE = '__no_tone__'
const formatVoiceRate = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}x`

const PROMPT_MENTION_SELECTOR = '[data-prompt-mention-id]'
const PROMPT_EDITOR_BLOCK_TAGS = new Set(['DIV', 'P', 'LI'])

const readPromptEditorNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.replace(/\u200b/g, '') ?? ''
  if (!(node instanceof HTMLElement)) return ''
  if (node.tagName === 'BR') return '\n'
  if (node.matches(PROMPT_MENTION_SELECTOR)) return `@${node.dataset.promptMentionName ?? ''}`

  let value = ''
  Array.from(node.childNodes).forEach((child, index, siblings) => {
    const isBlock = child instanceof HTMLElement && PROMPT_EDITOR_BLOCK_TAGS.has(child.tagName)
    if (isBlock && value && !value.endsWith('\n')) value += '\n'
    value += readPromptEditorNode(child)
    if (isBlock && index < siblings.length - 1 && !value.endsWith('\n')) value += '\n'
  })
  return value
}

const readPromptEditorValue = (editor: HTMLDivElement) => (
  readPromptEditorNode(editor).replace(/\r\n?/g, '\n')
)

const createPromptMentionElement = (asset: PromptMentionAsset) => {
  const mention = document.createElement('span')
  mention.className = 'project-clip-editor__prompt-mention'
  mention.contentEditable = 'false'
  mention.dataset.promptMentionId = asset.id
  mention.dataset.promptMentionName = asset.name

  const image = document.createElement('img')
  image.src = asset.imageUrl
  image.alt = ''
  image.draggable = false

  const label = document.createElement('strong')
  label.textContent = asset.name
  mention.append(image, label)
  return mention
}

const escapePromptMentionPattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const renderPromptEditorValue = (
  editor: HTMLDivElement,
  value: string,
  assets: PromptMentionAsset[],
) => {
  editor.replaceChildren()
  const assetsByName = new Map(assets.map((asset) => [asset.name, asset]))
  const names = assets.map((asset) => asset.name).sort((a, b) => b.length - a.length)
  const mentionPattern = names.length > 0
    ? new RegExp(`@(${names.map(escapePromptMentionPattern).join('|')})`, 'g')
    : null

  if (!mentionPattern) {
    if (value) editor.append(document.createTextNode(value))
    editor.dataset.value = value
    return
  }

  let cursor = 0
  let match = mentionPattern.exec(value)
  while (match) {
    const offset = match.index
    const name = match[1]
    if (offset > cursor) editor.append(document.createTextNode(value.slice(cursor, offset)))
    const asset = assetsByName.get(name)
    editor.append(asset ? createPromptMentionElement(asset) : document.createTextNode(match[0]))
    cursor = offset + match[0].length
    match = mentionPattern.exec(value)
  }
  if (cursor < value.length) editor.append(document.createTextNode(value.slice(cursor)))
  editor.dataset.value = value
}

const getPromptMentionFromNode = (node: Node | null) => {
  const element = node instanceof HTMLElement ? node : node?.parentElement
  return element?.closest<HTMLElement>(PROMPT_MENTION_SELECTOR) ?? null
}

const placePromptCaretAtMentionBoundary = (
  editor: HTMLDivElement,
  mention: HTMLElement,
  side: 'before' | 'after',
) => {
  const parent = mention.parentNode
  const selection = window.getSelection()
  if (!parent || !selection) return
  const mentionIndex = Array.prototype.indexOf.call(parent.childNodes, mention) as number
  const range = document.createRange()
  range.setStart(parent, mentionIndex + (side === 'after' ? 1 : 0))
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  editor.focus({ preventScroll: true })
}

const getAdjacentPromptMention = (
  editor: HTMLDivElement,
  direction: 'backward' | 'forward',
) => {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null

  const anchor = selection.anchorNode
  const offset = selection.anchorOffset
  let candidate: Node | null = null
  if (anchor.nodeType === Node.TEXT_NODE) {
    const textLength = anchor.textContent?.length ?? 0
    const atEdge = direction === 'backward' ? offset === 0 : offset === textLength
    if (!atEdge) return null
    candidate = direction === 'backward' ? anchor.previousSibling : anchor.nextSibling
  } else {
    candidate = direction === 'backward'
      ? anchor.childNodes[offset - 1] ?? null
      : anchor.childNodes[offset] ?? null
  }
  return candidate instanceof HTMLElement && candidate.matches(PROMPT_MENTION_SELECTOR) ? candidate : null
}

const getActivePromptMentionQuery = (editor: HTMLDivElement) => {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null

  let textNode: Text | null = null
  let offset = selection.anchorOffset
  if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
    textNode = selection.anchorNode as Text
  } else {
    if (offset === 0) return null
    const candidate = selection.anchorNode.childNodes[Math.max(0, offset - 1)]
    if (candidate?.nodeType === Node.TEXT_NODE) {
      textNode = candidate as Text
      offset = textNode.data.length
    }
  }
  if (!textNode) return null

  const match = textNode.data.slice(0, offset).match(/@([^\s@]*)$/)
  if (!match) return null
  const range = document.createRange()
  range.setStart(textNode, offset - match[0].length)
  range.setEnd(textNode, offset)
  return { query: match[1], range }
}

type PromptMentionEditorProps = {
  value: string
  assets: PromptMentionAsset[]
  maxLength: number
  placeholder: string
  characterGroupLabel: string
  sceneGroupLabel: string
  menuTitle: string
  emptyLabel: string
  onChange: (value: string) => void
}

function PromptMentionEditor({
  value,
  assets,
  maxLength,
  placeholder,
  characterGroupLabel,
  sceneGroupLabel,
  menuTitle,
  emptyLabel,
  onChange,
}: PromptMentionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const mentionRangeRef = useRef<Range | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [menuPosition, setMenuPosition] = useState({ left: 12, top: 44 })

  const matchingAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return normalizedQuery
      ? assets.filter((asset) => asset.name.toLocaleLowerCase().includes(normalizedQuery))
      : assets
  }, [assets, query])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (editor.dataset.value !== value) renderPromptEditorValue(editor, value, assets)
  }, [assets, value])

  const closeMenu = () => {
    setMenuOpen(false)
    mentionRangeRef.current = null
  }

  const syncValue = () => {
    const editor = editorRef.current
    if (!editor) return
    const nextValue = readPromptEditorValue(editor)
    if (nextValue.length > maxLength) {
      renderPromptEditorValue(editor, value, assets)
      return
    }
    editor.dataset.value = nextValue
    if (nextValue !== value) onChange(nextValue)
  }

  const updateMentionMenu = () => {
    const editor = editorRef.current
    if (!editor) return
    const mentionQuery = getActivePromptMentionQuery(editor)
    if (!mentionQuery) {
      closeMenu()
      return
    }

    const editorBounds = editor.getBoundingClientRect()
    const caretBounds = mentionQuery.range.getBoundingClientRect()
    const menuWidth = 248
    const left = Math.min(
      Math.max(10, caretBounds.left - editorBounds.left),
      Math.max(10, editor.clientWidth - menuWidth - 10),
    )
    const requestedTop = caretBounds.bottom > 0 ? caretBounds.bottom - editorBounds.top + 8 : 44
    const top = Math.min(Math.max(44, requestedTop), Math.max(44, editor.clientHeight - 300))
    mentionRangeRef.current = mentionQuery.range.cloneRange()
    setQuery(mentionQuery.query)
    setHighlightedIndex(0)
    setMenuPosition({ left, top })
    setMenuOpen(true)
  }

  const insertMention = (asset: PromptMentionAsset) => {
    const editor = editorRef.current
    const range = mentionRangeRef.current
    if (!editor || !range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return

    const mention = createPromptMentionElement(asset)
    range.deleteContents()
    range.insertNode(mention)

    const selection = window.getSelection()
    if (selection) {
      const caretRange = document.createRange()
      caretRange.setStartAfter(mention)
      caretRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(caretRange)
    }
    editor.focus({ preventScroll: true })
    closeMenu()
    syncValue()
  }

  const removeMention = (mention: HTMLElement) => {
    const editor = editorRef.current
    const parent = mention.parentNode
    if (!editor || !parent) return
    const mentionIndex = Array.prototype.indexOf.call(parent.childNodes, mention) as number
    mention.remove()
    const range = document.createRange()
    range.setStart(parent, Math.min(mentionIndex, parent.childNodes.length))
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    editor.focus({ preventScroll: true })
    syncValue()
    closeMenu()
  }

  const renderAssetGroup = (kind: PromptMentionKind, label: string) => {
    const groupAssets = matchingAssets.filter((asset) => asset.kind === kind)
    if (groupAssets.length === 0) return null
    return (
      <section className="project-clip-editor__mention-group" key={kind}>
        <strong>{label}</strong>
        {groupAssets.map((asset) => {
          const assetIndex = matchingAssets.findIndex((item) => item.id === asset.id)
          const highlighted = assetIndex === highlightedIndex
          return (
            <button
              key={asset.id}
              type="button"
              role="option"
              aria-selected={highlighted}
              className={highlighted ? 'is-highlighted' : ''}
              onMouseEnter={() => setHighlightedIndex(assetIndex)}
              onMouseDown={(event) => {
                event.preventDefault()
                insertMention(asset)
              }}
            >
              <img src={asset.imageUrl} alt="" />
              <span>{asset.name}</span>
              {highlighted && <CheckOutlined />}
            </button>
          )
        })}
      </section>
    )
  }

  return (
    <div className="project-clip-editor__prompt-editor">
      <div
        ref={editorRef}
        className="project-clip-editor__prompt-rich-input"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        tabIndex={0}
        spellCheck={false}
        data-placeholder={placeholder}
        onMouseDown={(event) => {
          const mention = getPromptMentionFromNode(event.target as Node)
          const editor = editorRef.current
          if (!mention || !editor?.contains(mention)) return
          event.preventDefault()
          const bounds = mention.getBoundingClientRect()
          placePromptCaretAtMentionBoundary(
            editor,
            mention,
            event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after',
          )
          closeMenu()
        }}
        onKeyDown={(event) => {
          const editor = editorRef.current
          if (!editor || event.nativeEvent.isComposing) return

          if (menuOpen) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (matchingAssets.length > 0) {
                const direction = event.key === 'ArrowDown' ? 1 : -1
                setHighlightedIndex((current) => (current + direction + matchingAssets.length) % matchingAssets.length)
              }
              return
            }
            if ((event.key === 'Enter' || event.key === 'Tab') && matchingAssets[highlightedIndex]) {
              event.preventDefault()
              insertMention(matchingAssets[highlightedIndex])
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              closeMenu()
              return
            }
          }

          if (!event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            const direction = event.key === 'ArrowLeft' ? 'backward' : 'forward'
            const adjacentMention = getAdjacentPromptMention(editor, direction)
            if (adjacentMention) {
              event.preventDefault()
              placePromptCaretAtMentionBoundary(
                editor,
                adjacentMention,
                direction === 'backward' ? 'before' : 'after',
              )
              return
            }
          }

          if (event.key !== 'Backspace' && event.key !== 'Delete') return
          const adjacentMention = getAdjacentPromptMention(
            editor,
            event.key === 'Backspace' ? 'backward' : 'forward',
          )
          if (!adjacentMention) return
          event.preventDefault()
          removeMention(adjacentMention)
        }}
        onInput={() => {
          syncValue()
          updateMentionMenu()
        }}
        onMouseUp={updateMentionMenu}
        onBlur={() => closeMenu()}
        onPaste={(event) => {
          event.preventDefault()
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
        }}
      />
      {menuOpen && (
        <div
          className="project-clip-editor__mention-menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          role="listbox"
          aria-label={menuTitle}
        >
          <header>{menuTitle}</header>
          {matchingAssets.length > 0 ? (
            <>
              {renderAssetGroup('character', characterGroupLabel)}
              {renderAssetGroup('scene', sceneGroupLabel)}
            </>
          ) : (
            <div className="project-clip-editor__mention-empty">{emptyLabel}</div>
          )}
        </div>
      )}
      <span className="project-clip-editor__prompt-count">{value.length}/{maxLength}</span>
    </div>
  )
}

const VOICE_INLINE_TOKEN_PATTERN = /(<#[^#\n]+#>|<[^<>\n]+>)/g
const VOICE_PAUSE_TOKEN_EXACT_PATTERN = /^<#[^#\n]+#>$/
const VOICE_INTERJECTION_TOKEN_EXACT_PATTERN = /^<[^#<>\n][^<>\n]*>$/
const VOICE_EDITOR_TOKEN_SELECTOR = '[data-voice-inline-token="true"]'

type VoiceTextEditorProps = {
  value: string
  maxLength: number
  placeholder: string
  onChange: (value: string) => void
}

type VoiceTextEditorHandle = {
  insertToken: (token: string) => void
}

const VOICE_EDITOR_BLOCK_TAGS = new Set(['DIV', 'P', 'LI'])

const readVoiceEditorNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof HTMLElement)) return ''
  if (node.tagName === 'BR') return '\n'
  if (node.matches(VOICE_EDITOR_TOKEN_SELECTOR)) return node.textContent ?? ''

  let value = ''
  Array.from(node.childNodes).forEach((child, index, siblings) => {
    const isBlock = child instanceof HTMLElement && VOICE_EDITOR_BLOCK_TAGS.has(child.tagName)
    if (isBlock && value && !value.endsWith('\n')) value += '\n'
    value += readVoiceEditorNode(child)
    if (isBlock && index < siblings.length - 1 && !value.endsWith('\n')) value += '\n'
  })
  return value
}

const readVoiceTextEditorValue = (editor: HTMLDivElement) => (
  readVoiceEditorNode(editor).replace(/\r\n?/g, '\n')
)

const isVoiceEditorToken = (node: Node | null): node is HTMLElement => (
  node instanceof HTMLElement && node.matches(VOICE_EDITOR_TOKEN_SELECTOR)
)

const getVoiceEditorTokenFromNode = (node: Node | null) => {
  const element = node instanceof HTMLElement ? node : node?.parentElement
  return element?.closest<HTMLElement>(VOICE_EDITOR_TOKEN_SELECTOR) ?? null
}

const placeVoiceEditorCaretAtTokenBoundary = (
  editor: HTMLDivElement,
  token: HTMLElement,
  side: 'before' | 'after',
) => {
  const parent = token.parentNode
  if (!parent) return
  const selection = window.getSelection()
  if (!selection) return
  const tokenIndex = Array.prototype.indexOf.call(parent.childNodes, token) as number
  const range = document.createRange()
  range.setStart(parent, tokenIndex + (side === 'after' ? 1 : 0))
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  editor.focus({ preventScroll: true })
}

const getSelectedVoiceEditorToken = (editor: HTMLDivElement) => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (range.startContainer !== range.endContainer || !editor.contains(range.startContainer)) return null
  if (range.endOffset - range.startOffset !== 1) return null
  const selectedNode = range.startContainer.childNodes[range.startOffset] ?? null
  return isVoiceEditorToken(selectedNode) ? selectedNode : null
}

const getAdjacentVoiceEditorToken = (
  editor: HTMLDivElement,
  direction: 'backward' | 'forward',
) => {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null

  const anchor = selection.anchorNode
  const offset = selection.anchorOffset
  let candidate: Node | null = null

  if (anchor.nodeType === Node.TEXT_NODE) {
    const textLength = anchor.textContent?.length ?? 0
    const isAtEdge = direction === 'backward' ? offset === 0 : offset === textLength
    if (!isAtEdge) return null
    candidate = direction === 'backward' ? anchor.previousSibling : anchor.nextSibling
  } else {
    candidate = direction === 'backward'
      ? anchor.childNodes[offset - 1] ?? null
      : anchor.childNodes[offset] ?? null
  }

  return isVoiceEditorToken(candidate) ? candidate : null
}

const getVoiceEditorTokenAtSelection = (editor: HTMLDivElement) => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const token = getVoiceEditorTokenFromNode(selection.anchorNode)
  return token && editor.contains(token) ? token : null
}

const removeVoiceEditorToken = (editor: HTMLDivElement, token: HTMLElement) => {
  const parent = token.parentNode
  if (!parent) return
  const tokenIndex = Array.prototype.indexOf.call(parent.childNodes, token) as number
  token.remove()

  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.setStart(parent, Math.min(tokenIndex, parent.childNodes.length))
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  editor.focus({ preventScroll: true })
}

const createVoiceEditorToken = (value: string) => {
  const isPauseToken = VOICE_PAUSE_TOKEN_EXACT_PATTERN.test(value)
  const isInterjectionToken = VOICE_INTERJECTION_TOKEN_EXACT_PATTERN.test(value)
  if (!isPauseToken && !isInterjectionToken) return null

  const token = document.createElement('span')
  token.className = `project-clip-editor__voice-inline-token ${isPauseToken ? 'is-pause' : 'is-interjection'}`
  token.contentEditable = 'false'
  token.dataset.voiceInlineToken = 'true'
  token.textContent = value
  return token
}

const renderVoiceTextEditorValue = (editor: HTMLDivElement, value: string) => {
  editor.replaceChildren()
  value.split(VOICE_INLINE_TOKEN_PATTERN).forEach((part) => {
    if (!part) return
    const token = createVoiceEditorToken(part)
    if (token) {
      editor.append(token)
      return
    }
    editor.append(document.createTextNode(part))
  })
  editor.dataset.value = value
}

const VoiceTextEditor = forwardRef<VoiceTextEditorHandle, VoiceTextEditorProps>(function VoiceTextEditor(
  { value, maxLength, placeholder, onChange },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef<HTMLElement>(null)
  const savedRangeRef = useRef<Range | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const hasEditableToken = Array.from(
      editor.querySelectorAll<HTMLElement>(VOICE_EDITOR_TOKEN_SELECTOR),
    ).some((token) => token.contentEditable !== 'false')
    if (editor.dataset.value !== value || hasEditableToken) {
      renderVoiceTextEditorValue(editor, value)
    }
    if (counterRef.current) counterRef.current.textContent = `${value.length}/${maxLength}`
  }, [maxLength, value])

  const syncValue = (publish = false) => {
    const editor = editorRef.current
    if (!editor) return
    const nextValue = readVoiceTextEditorValue(editor).slice(0, maxLength)
    editor.dataset.value = nextValue
    if (counterRef.current) counterRef.current.textContent = `${nextValue.length}/${maxLength}`
    if (!nextValue) editor.replaceChildren()
    if (publish && nextValue !== value) onChange(nextValue)
  }

  const rememberSelection = () => {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return
    savedRangeRef.current = range.cloneRange()
  }

  const insertToken = (tokenValue: string) => {
    const editor = editorRef.current
    const token = createVoiceEditorToken(tokenValue)
    if (!editor || !token) return

    const selection = window.getSelection()
    const liveRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    const range = liveRange
      && editor.contains(liveRange.startContainer)
      && editor.contains(liveRange.endContainer)
      ? liveRange.cloneRange()
      : savedRangeRef.current?.cloneRange()

    const insertionRange = range
      && editor.contains(range.startContainer)
      && editor.contains(range.endContainer)
      ? range
      : document.createRange()

    if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      insertionRange.selectNodeContents(editor)
      insertionRange.collapse(false)
    }

    const currentLength = readVoiceTextEditorValue(editor).length
    if (currentLength - insertionRange.toString().length + tokenValue.length > maxLength) return

    insertionRange.deleteContents()
    insertionRange.insertNode(token)
    placeVoiceEditorCaretAtTokenBoundary(editor, token, 'after')
    rememberSelection()
    syncValue()
  }

  useImperativeHandle(ref, () => ({ insertToken }))

  return (
    <>
      <div
        ref={editorRef}
        className="project-clip-editor__voice-rich-input"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        tabIndex={0}
        spellCheck={false}
        data-placeholder={placeholder}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement
          const token = target.closest<HTMLElement>(VOICE_EDITOR_TOKEN_SELECTOR)
          if (!token || !editorRef.current?.contains(token)) return
          event.preventDefault()
          const bounds = token.getBoundingClientRect()
          placeVoiceEditorCaretAtTokenBoundary(
            editorRef.current,
            token,
            event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after',
          )
          rememberSelection()
        }}
        onKeyDown={(event) => {
          const editor = editorRef.current
          if (!editor || event.nativeEvent.isComposing) return

          if (!event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            const tokenAtSelection = getVoiceEditorTokenAtSelection(editor)
            if (tokenAtSelection) {
              event.preventDefault()
              placeVoiceEditorCaretAtTokenBoundary(
                editor,
                tokenAtSelection,
                event.key === 'ArrowLeft' ? 'before' : 'after',
              )
              rememberSelection()
              return
            }

            const direction = event.key === 'ArrowLeft' ? 'backward' : 'forward'
            const adjacentToken = getAdjacentVoiceEditorToken(editor, direction)
            if (adjacentToken) {
              event.preventDefault()
              placeVoiceEditorCaretAtTokenBoundary(
                editor,
                adjacentToken,
                direction === 'backward' ? 'before' : 'after',
              )
              rememberSelection()
              return
            }
          }

          if (event.key !== 'Backspace' && event.key !== 'Delete') return
          const selectedToken = getSelectedVoiceEditorToken(editor)
          const adjacentToken = selectedToken ?? getVoiceEditorTokenAtSelection(editor) ?? getAdjacentVoiceEditorToken(
            editor,
            event.key === 'Backspace' ? 'backward' : 'forward',
          )
          if (!adjacentToken) return
          event.preventDefault()
          removeVoiceEditorToken(editor, adjacentToken)
          rememberSelection()
          syncValue()
        }}
        onInput={() => {
          syncValue()
          rememberSelection()
        }}
        onFocus={rememberSelection}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onBlur={() => {
          rememberSelection()
          syncValue(true)
        }}
        onPaste={(event) => {
          event.preventDefault()
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
        }}
      />
      <small ref={counterRef}>{value.length}/{maxLength}</small>
    </>
  )
})

const splitIntoClips = (episodes: EpisodeDraft[]): ClipDraft[] => {
  const source = episodes[0]?.rawText.trim() ?? ''
  const paragraphs = source
    .split(/\n+|(?<=[。！？!?])\s*/)
    .map((item) => item.trim())
    .filter(Boolean)

  const fallback = [
    '夜色中的街道被店铺灯光照亮，人物从画面远处走近。',
    '镜头切到人物近景，环境光在侧脸形成清晰轮廓。',
    '人物停下脚步环顾四周，背景人群缓慢经过。',
    '镜头向前推进，聚焦人物手中的关键物品。',
    '人物转身离开，画面保留街道与远处灯光。',
    '环境镜头交代空间关系，为下一段动作建立方向。',
  ]
  const descriptions = paragraphs.length > 0 ? paragraphs : fallback
  const sentencesPerClip = paragraphs.length > 0 ? 3 : 1
  const clipCount = Math.min(12, Math.max(6, Math.ceil(descriptions.length / sentencesPerClip)))

  return Array.from({ length: clipCount }, (_, index) => {
    const start = index * sentencesPerClip
    const groupedDescription = descriptions.slice(start, start + sentencesPerClip).join('\n')
    const description = groupedDescription || descriptions[index % descriptions.length]
    return {
      id: `clip-${index + 1}`,
      title: `片段-${index + 1}`,
      description,
      prompt: `${description} 保持人物造型和场景连续，电影感构图，光线自然，画面细节清晰。`,
      imageUrl: PREVIEW_IMAGES[index % PREVIEW_IMAGES.length],
    }
  })
}

export default function ProjectClipEditingStep({ episodes, ratio, styleName }: ProjectClipEditingStepProps) {
  const l = useBilingualText()
  const promptMentionAssets = useMemo<PromptMentionAsset[]>(() => [
    { id: 'character-jiang-xuan', name: l('姜萱', 'Jiang Xuan'), imageUrl: PREVIEW_IMAGES[1], kind: 'character' },
    { id: 'character-diners', name: l('食客群体', 'Diners'), imageUrl: PREVIEW_IMAGES[0], kind: 'character' },
    { id: 'character-chu-qing', name: l('楚青', 'Chu Qing'), imageUrl: PREVIEW_IMAGES[1], kind: 'character' },
    { id: 'scene-street-stall', name: l('街边店铺', 'Street stall'), imageUrl: PREVIEW_IMAGES[2], kind: 'scene' },
    { id: 'scene-night', name: l('夜景氛围', 'Night ambience'), imageUrl: PREVIEW_IMAGES[3], kind: 'scene' },
  ], [l])
  const styleOptions = useMemo(() => {
    const configuredOptions = Object.values(PROJECT_STYLE_OPTIONS_BY_VISUAL).flat()
    const options = [
      { value: NO_STYLE_VALUE, label: l('无风格', 'No style') },
      ...configuredOptions,
    ]

    if (styleName && !options.some((option) => option.value === styleName)) {
      options.splice(1, 0, { value: styleName, label: styleName })
    }

    return options
  }, [l, styleName])
  const initialClips = useMemo(() => splitIntoClips(episodes), [episodes])
  const sourceSignature = useMemo(() => buildEpisodeSourceSignature(episodes), [episodes])
  const [restoredDraft] = useState(() =>
    readProjectCreationDraft<ClipEditingDraft>(PROJECT_CREATION_DRAFT_KEYS.clips))
  const canRestoreDraft = restoredDraft?.sourceSignature === sourceSignature
  const restoredClips = canRestoreDraft
    && Array.isArray(restoredDraft.clips)
    && restoredDraft.clips.length > 0
    ? restoredDraft.clips
    : initialClips
  const restoredActiveClipId = canRestoreDraft
    && restoredClips.some((clip) => clip.id === restoredDraft.activeClipId)
    ? restoredDraft.activeClipId
    : restoredClips[0]?.id ?? ''
  const [clips, setClips] = useState(restoredClips)
  const [activeClipId, setActiveClipId] = useState(restoredActiveClipId)
  const [mode, setMode] = useState<GenerationMode>(
    canRestoreDraft && isGenerationMode(restoredDraft.mode) ? restoredDraft.mode : 'image',
  )
  const [promptByClip, setPromptByClip] = useState<Record<string, string>>(
    canRestoreDraft ? restoredDraft.promptByClip : {},
  )
  const [model, setModel] = useState(canRestoreDraft ? restoredDraft.model : 'gpt-image-2')
  const [resolution, setResolution] = useState(canRestoreDraft ? restoredDraft.resolution : '2k')
  const [videoModel, setVideoModel] = useState(canRestoreDraft ? restoredDraft.videoModel : 'seedance-2.5')
  const [videoResolution, setVideoResolution] = useState<'480P' | '720P'>(
    canRestoreDraft && isVideoResolution(restoredDraft.videoResolution)
      ? restoredDraft.videoResolution
      : '720P',
  )
  const [videoDuration, setVideoDuration] = useState(() => (
    canRestoreDraft
      ? Math.min(VIDEO_DURATION_MAX, Math.max(VIDEO_DURATION_MIN, restoredDraft.videoDuration))
      : 11
  ))
  const [videoSpecOpen, setVideoSpecOpen] = useState(false)
  const [videoVoiceTipVisible, setVideoVoiceTipVisible] = useState(true)
  const [selectedRatio, setSelectedRatio] = useState(
    canRestoreDraft ? restoredDraft.selectedRatio : ratio || '9:16',
  )
  const [selectedTone, setSelectedTone] = useState(
    canRestoreDraft ? restoredDraft.selectedTone : NO_TONE_VALUE,
  )
  const [selectedStyle, setSelectedStyle] = useState(
    canRestoreDraft ? restoredDraft.selectedStyle : styleName || NO_STYLE_VALUE,
  )
  const [storyboardSkillEnabled, setStoryboardSkillEnabled] = useState(
    canRestoreDraft ? restoredDraft.storyboardSkillEnabled : false,
  )
  const [editingClipId, setEditingClipId] = useState<string | null>(null)
  const [insertingAt, setInsertingAt] = useState<number | null>(null)
  const [clipEditorMode, setClipEditorMode] = useState<ClipEditorMode>('edit')
  const [editingDescription, setEditingDescription] = useState('')
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [historyIndexByClip, setHistoryIndexByClip] = useState<Record<string, number>>(
    canRestoreDraft ? restoredDraft.historyIndexByClip : {},
  )
  const [previewImageRatio, setPreviewImageRatio] = useState(1)
  const [voiceInfoVisible, setVoiceInfoVisible] = useState(true)
  const [voiceConfigExpanded, setVoiceConfigExpanded] = useState(true)
  const [voiceBasicsExpanded, setVoiceBasicsExpanded] = useState(true)
  const [voiceVolume, setVoiceVolume] = useState(canRestoreDraft ? restoredDraft.voiceVolume : 1)
  const [voiceSpeed, setVoiceSpeed] = useState(canRestoreDraft ? restoredDraft.voiceSpeed : 1)
  const initialVoiceLines = (
    canRestoreDraft && Array.isArray(restoredDraft.voiceLines)
      ? restoredDraft.voiceLines
      : INITIAL_VOICE_LINES
  )
  const [voiceLines, setVoiceLines] = useState<VoiceLineDraft[]>(initialVoiceLines)
  const voiceEditorRefs = useRef(new Map<string, VoiceTextEditorHandle>())
  const [expandedVoiceLineId, setExpandedVoiceLineId] = useState<string | null>(
    initialVoiceLines[0]?.id ?? null,
  )
  const [playingVoiceLineId, setPlayingVoiceLineId] = useState<string | null>(null)
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false)
  const sourceSignatureRef = useRef(sourceSignature)
  const ratioPropRef = useRef(ratio)
  const styleNamePropRef = useRef(styleName)
  const persistableVoiceLines = useMemo(() => voiceLines.map((line) => ({
    ...line,
    expressionPanel: null,
    customPauseExpanded: false,
    emotionExpanded: false,
  })), [voiceLines])

  useProjectCreationDraft(PROJECT_CREATION_DRAFT_KEYS.clips, {
    sourceSignature,
    clips,
    activeClipId,
    mode,
    promptByClip,
    model,
    resolution,
    videoModel,
    videoResolution,
    videoDuration,
    selectedRatio,
    selectedTone,
    selectedStyle,
    storyboardSkillEnabled,
    historyIndexByClip,
    voiceVolume,
    voiceSpeed,
    voiceLines: persistableVoiceLines,
  })
  const activeClip = clips.find((clip) => clip.id === activeClipId) ?? clips[0]
  const prompt = activeClip ? (promptByClip[activeClip.id] ?? activeClip.prompt) : ''
  const activeClipIndex = clips.indexOf(activeClip)
  const activeHistoryImages = [
    activeClip.imageUrl,
    PREVIEW_IMAGES[(activeClipIndex + 1) % PREVIEW_IMAGES.length],
  ]
  const activeHistoryIndex = historyIndexByClip[activeClip.id] ?? 0
  const activeImageUrl = activeHistoryImages[activeHistoryIndex] ?? activeClip.imageUrl
  const selectedStyleLabel = styleOptions.find((option) => option.value === selectedStyle)?.label ?? selectedStyle
  const voiceRoleOptions = VOICE_BINDINGS.map(({ character, voice, adjustable }) => ({
    value: `${character}|${voice}`,
    label: (
      <span className="project-clip-editor__voice-option-label">
        <span><strong>{character}</strong><i />{l('音色', 'Voice')}：{voice}</span>
        {adjustable && <em>{l('可调情绪', 'Adjustable')}</em>}
      </span>
    ),
  }))

  useEffect(() => {
    if (sourceSignatureRef.current === sourceSignature) return
    sourceSignatureRef.current = sourceSignature
    setClips(initialClips)
    setActiveClipId(initialClips[0]?.id ?? '')
    setPromptByClip({})
    setEditingClipId(null)
    setInsertingAt(null)
    setClipEditorMode('edit')
    setHistoryIndexByClip({})
  }, [initialClips, sourceSignature])

  useEffect(() => {
    if (ratioPropRef.current === ratio) return
    ratioPropRef.current = ratio
    setSelectedRatio(ratio || '9:16')
  }, [ratio])

  useEffect(() => {
    if (styleNamePropRef.current === styleName) return
    styleNamePropRef.current = styleName
    setSelectedStyle(styleName || NO_STYLE_VALUE)
  }, [styleName])

  useEffect(() => () => {
    const audio = voicePreviewAudioRef.current
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    voicePreviewAudioRef.current = null
  }, [])

  const updatePrompt = (value: string) => {
    if (!activeClip) return
    setPromptByClip((current) => ({ ...current, [activeClip.id]: value }))
  }

  const downloadActiveImage = () => {
    const link = document.createElement('a')
    link.href = activeImageUrl
    link.download = `${activeClip.title}.jpg`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const openClipInsert = (position: number, direction: 'insert-above' | 'insert-below') => {
    setEditingClipId(null)
    setInsertingAt(position)
    setClipEditorMode(direction)
    setEditingDescription('')
  }

  const mergeClipUp = (clipId: string) => {
    setClips((current) => {
      const index = current.findIndex((clip) => clip.id === clipId)
      if (index <= 0) return current
      const previous = current[index - 1]
      const currentClip = current[index]
      const merged = {
        ...previous,
        description: `${previous.description}\n${currentClip.description}`,
        prompt: `${previous.prompt}\n${currentClip.prompt}`,
      }
      const result = [...current]
      result.splice(index - 1, 2, merged)
      setActiveClipId(merged.id)
      return result.map((clip, clipIndex) => ({
        ...clip,
        title: `片段-${clipIndex + 1}`,
      }))
    })
  }

  const openClipEditor = (clip: ClipDraft) => {
    setActiveClipId(clip.id)
    setEditingClipId(clip.id)
    setInsertingAt(null)
    setClipEditorMode('edit')
    setEditingDescription(clip.description)
  }

  const closeClipEditor = () => {
    setEditingClipId(null)
    setInsertingAt(null)
    setEditingDescription('')
  }

  const saveClipEditor = () => {
    const description = editingDescription.trim()
    if (!description) {
      message.warning(l('请输入片段描述', 'Enter a clip description'))
      return
    }
    if (insertingAt !== null) {
      const insertedId = `clip-${Date.now()}`
      setClips((current) => {
        const position = Math.max(0, Math.min(insertingAt, current.length))
        const inserted: ClipDraft = {
          id: insertedId,
          title: '',
          description,
          prompt: `${description} 保持人物造型和场景连续，电影感构图，光线自然，画面细节清晰。`,
          imageUrl: PREVIEW_IMAGES[position % PREVIEW_IMAGES.length],
        }
        const result = [...current]
        result.splice(position, 0, inserted)
        return result.map((clip, index) => ({ ...clip, title: `片段-${index + 1}` }))
      })
      setActiveClipId(insertedId)
    } else {
      setClips((current) => current.map((clip) => (
        clip.id === editingClipId ? { ...clip, description } : clip
      )))
    }
    closeClipEditor()
  }

  const editingClip = clips.find((clip) => clip.id === editingClipId)
  const editorOpen = editingClipId !== null || insertingAt !== null
  const editorClipTitle = editingClip?.title ?? (insertingAt !== null ? `片段-${insertingAt + 1}` : '')
  const editorTitle = clipEditorMode === 'insert-above'
    ? l('向上插入片段', 'Insert clip above')
    : clipEditorMode === 'insert-below'
      ? l('向下插入片段', 'Insert clip below')
      : l('编辑', 'Edit')

  const updateVoiceLine = (id: string, patch: Partial<VoiceLineDraft>) => {
    setVoiceLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  const stopVoicePreview = () => {
    const audio = voicePreviewAudioRef.current
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.currentTime = 0
      voicePreviewAudioRef.current = null
    }
    setPlayingVoiceLineId(null)
  }

  const previewVoiceLine = (line: VoiceLineDraft) => {
    if (playingVoiceLineId === line.id) {
      stopVoicePreview()
      return
    }

    if (!line.audioUrl) {
      message.warning(l('当前台词还没有可预览的配音文件', 'This line does not have preview audio yet'))
      return
    }

    stopVoicePreview()
    const audio = new Audio(line.audioUrl)
    voicePreviewAudioRef.current = audio
    setPlayingVoiceLineId(line.id)

    const resetPreview = () => {
      if (voicePreviewAudioRef.current !== audio) return
      voicePreviewAudioRef.current = null
      setPlayingVoiceLineId(null)
    }

    audio.onended = resetPreview
    audio.onerror = () => {
      resetPreview()
      message.error(l('配音文件加载失败', 'Failed to load the voice audio'))
    }
    void audio.play().catch(() => {
      resetPreview()
      message.error(l('配音文件播放失败', 'Failed to play the voice audio'))
    })
  }

  const downloadVoiceLine = (line: VoiceLineDraft, index: number) => {
    if (!line.audioUrl) {
      message.warning(l('当前台词还没有可下载的配音文件', 'This line does not have downloadable audio yet'))
      return
    }

    const path = line.audioUrl.split(/[?#]/, 1)[0]
    const sourceExtension = path.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase()
    const extension = sourceExtension && ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'webm'].includes(sourceExtension)
      ? sourceExtension
      : 'mp3'
    const safeCharacter = (line.character || l('配音', 'voice'))
      .replace(/[\\/:*?"<>|]/g, '-')
      .trim()
    const link = document.createElement('a')
    link.href = line.audioUrl
    link.download = `${safeCharacter || 'voice'}-${index + 1}.${extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const appendVoiceToken = (line: VoiceLineDraft, token: string) => {
    const editor = voiceEditorRefs.current.get(line.id)
    if (editor) {
      editor.insertToken(token)
      return
    }
    updateVoiceLine(line.id, { text: `${line.text}${token}` })
  }

  const confirmCustomPause = (line: VoiceLineDraft) => {
    const seconds = Number(line.customPauseSeconds)
    if (!Number.isFinite(seconds) || seconds <= 0) return

    const normalizedSeconds = Number(seconds.toFixed(2))
    appendVoiceToken(line, `<#${normalizedSeconds}#>`)
    updateVoiceLine(line.id, {
      customPauseExpanded: false,
      customPauseSeconds: '',
    })
  }

  const addVoiceLine = () => {
    setVoiceLines((current) => [
      ...current,
      {
        id: `voice-line-${Date.now()}`,
        character: '姜萱',
        voice: '元气甜妹',
        text: '',
        volume: 1,
        speed: 1,
        expressionPanel: null,
        customPauseExpanded: false,
        customPauseSeconds: '',
        emotion: '自动',
        emotionExpanded: false,
      },
    ])
  }

  const removeVoiceLine = (id: string) => {
    if (playingVoiceLineId === id) stopVoicePreview()
    setVoiceLines((current) => current.filter((line) => line.id !== id))
    setExpandedVoiceLineId((current) => (current === id ? null : current))
  }

  if (!activeClip) return null

  return (
    <>
    <main className="project-clip-editor">
      <aside className="project-clip-editor__rail" aria-label={l('片段列表', 'Clip list')}>
        <header>
          <div>
            <MenuUnfoldOutlined />
            <strong>{episodes[0]?.title || l('第1集', 'Episode 1')}</strong>
            <span>{l('本集已消耗', 'Episode cost')}</span>
            <QuestionCircleFilled className="project-clip-editor__help-icon" />
            <span className="project-clip-editor__episode-cost"><ThunderboltFilled />{clips.length * 6}</span>
          </div>
        </header>
        <div className="project-clip-editor__clip-list">
          {clips.map((clip, index) => (
            <div
              key={clip.id}
              className={`project-clip-editor__clip${clip.id === activeClip.id ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setActiveClipId(clip.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                setActiveClipId(clip.id)
              }}
            >
              <div className="project-clip-editor__clip-actions is-top">
                <button
                  type="button"
                  aria-label={l('在上方插入片段', 'Insert clip above')}
                  title={l('在上方插入片段', 'Insert clip above')}
                  onClick={(event) => {
                    event.stopPropagation()
                    openClipInsert(index, 'insert-above')
                  }}
                >
                  <PlusOutlined />
                </button>
                {index > 0 && (
                  <button
                    type="button"
                    className="is-merge"
                    onClick={(event) => {
                      event.stopPropagation()
                      mergeClipUp(clip.id)
                    }}
                  >
                    <MergeCellsOutlined />
                    <span>{l('向上合并片段', 'Merge upward')}</span>
                  </button>
                )}
              </div>
              <div className="project-clip-editor__clip-main">
                <img src={clip.imageUrl} alt="" />
                <span>
                  <span className="project-clip-editor__clip-heading">
                    <strong>{clip.title}</strong>
                    <button
                      type="button"
                      aria-label={l('编辑片段', 'Edit clip')}
                      title={l('编辑片段', 'Edit clip')}
                      onClick={(event) => {
                        event.stopPropagation()
                        openClipEditor(clip)
                      }}
                    >
                      <EditOutlined />
                    </button>
                  </span>
                  <small>{clip.description}</small>
                </span>
              </div>
              <div className="project-clip-editor__clip-actions is-bottom">
                <button
                  type="button"
                  aria-label={l('在下方插入片段', 'Insert clip below')}
                  title={l('在下方插入片段', 'Insert clip below')}
                  onClick={(event) => {
                    event.stopPropagation()
                    openClipInsert(index + 1, 'insert-below')
                  }}
                >
                  <PlusOutlined />
                </button>
              </div>
            </div>
          ))}
        </div>
        <footer className="project-clip-editor__batch-footer">
          <button type="button" onClick={() => message.info(l('批量生成功能待接入', 'Batch generation is not connected yet'))}>
            <ThunderboltFilled />
            <span>{l('批量生成', 'Batch generate')}</span>
          </button>
        </footer>
      </aside>

      <section className="project-clip-editor__preview-column">
        <div className="project-clip-editor__preview-header">
          <div className="project-clip-editor__preview-note">
            <InfoCircleOutlined />
            <span>{l('内容由AI生成，仅供参考', 'AI-generated content for reference only')}</span>
          </div>
          <div className="project-clip-editor__preview-context">
            <strong>{activeClip.title}</strong>
            <span>{selectedRatio}</span>
          </div>
        </div>
        <div className="project-clip-editor__preview-stage">
          <div
            className={`project-clip-editor__preview-content ${
              previewImageRatio < 0.85 ? 'is-portrait' : previewImageRatio > 1.2 ? 'is-landscape' : 'is-square'
            }`}
            style={{ width: `min(100%, calc((100vh - 200px) * ${previewImageRatio}), 980px)` }}
          >
            <div className="project-clip-editor__preview-frame" style={{ aspectRatio: previewImageRatio }}>
            <button
              type="button"
              className="project-clip-editor__preview-image"
              aria-label={l('预览当前图片', 'Preview current image')}
              onClick={() => setImageViewerOpen(true)}
            >
              <img
                src={activeImageUrl}
                alt={activeClip.title}
                draggable={false}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget
                  if (naturalWidth > 0 && naturalHeight > 0) {
                    setPreviewImageRatio(naturalWidth / naturalHeight)
                  }
                }}
              />
            </button>
            <div className="project-clip-editor__preview-toolbar">
              <button
                type="button"
                className="is-video"
                aria-label={l('图生视频', 'Image to video')}
                onClick={() => setMode('video')}
              >
                <VideoCameraOutlined />
                <span>{l('图生视频', 'Image to video')}</span>
              </button>
              <span className="project-clip-editor__preview-tool">
                <button
                  type="button"
                  aria-label={l('高清', 'HD')}
                  onClick={() => message.info(l('高清处理功能待接入', 'HD processing is not connected yet'))}
                >
                  <span className="project-clip-editor__hd-icon">HD</span>
                </button>
                <span className="project-clip-editor__preview-tooltip">{l('高清', 'HD')}</span>
              </span>
              <span className="project-clip-editor__preview-tool">
                <button
                  type="button"
                  aria-label={l('下载', 'Download')}
                  onClick={downloadActiveImage}
                >
                  <DownloadOutlined />
                </button>
                <span className="project-clip-editor__preview-tooltip">{l('下载', 'Download')}</span>
              </span>
              <span className="project-clip-editor__preview-tool is-details">
                <button type="button" aria-label={l('描述', 'Description')}>
                  <InfoCircleOutlined />
                </button>
                <span className="project-clip-editor__preview-tooltip">{l('描述', 'Description')}</span>
                <span className="project-clip-editor__image-details">
                  <strong>{l('图片详情', 'Image details')}</strong>
                  <span className="project-clip-editor__image-detail-tags">
                    <span>{mode === 'video' ? 'Seedance 2.5' : model === 'gpt-image-2' ? 'GPT Image 2' : 'Nano Banana 2'}</span>
                    <span>{mode === 'video' ? l('多参生视频', 'Multi-reference video') : l('多参生图', 'Multi-reference image')}</span>
                    <span>{l('风格', 'Style')} · {selectedStyleLabel}</span>
                    {mode === 'image' && storyboardSkillEnabled && <span>{l('技能', 'Skill')} · {l('分镜大师', 'Storyboard master')}</span>}
                  </span>
                  <span className="project-clip-editor__image-detail-description">
                    <b>{l('【描述词】', '[Description]')}</b>
                    {activeClip.description}
                  </span>
                </span>
              </span>
            </div>
            </div>
            <div className="project-clip-editor__history">
              <div className="project-clip-editor__history-title">
                <HistoryOutlined />
                <span>{l('历史记录', 'History')}</span>
                <small>2</small>
              </div>
              <div className="project-clip-editor__history-list">
                {activeHistoryImages.map((imageUrl, index) => (
                  <button
                    key={`${activeClip.id}-${imageUrl}`}
                    type="button"
                    className={activeHistoryIndex === index ? 'is-selected' : ''}
                    aria-label={l(`切换至历史版本 ${index + 1}`, `Switch to history version ${index + 1}`)}
                    aria-pressed={activeHistoryIndex === index}
                    onClick={() => setHistoryIndexByClip((current) => ({ ...current, [activeClip.id]: index }))}
                  >
                    <img src={imageUrl} alt="" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="project-clip-editor__controls" aria-label={l('生成设置', 'Generation settings')}>
        <div className="project-clip-editor__mode-tabs" role="tablist">
          {([
            ['video', <VideoCameraOutlined key="video-icon" />, l('多参生视频', 'Video')],
            ['image', <PictureOutlined key="image-icon" />, l('多参生图', 'Image')],
            ['voice', <AudioOutlined key="voice-icon" />, l('配音', 'Voice')],
          ] as const).map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              className={mode === key ? 'is-selected' : ''}
              onClick={() => setMode(key)}
            >
              {icon}<span>{label}</span>
            </button>
          ))}
        </div>

        {mode === 'voice' ? (
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
                  {VOICE_BINDINGS.map(({ character, voice }) => (
                    <button key={character} type="button" onClick={() => setVoiceLibraryOpen(true)}>
                      <span>{character}：</span>
                      <strong>{voice}</strong>
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
                      <Slider min={0} max={2} step={0.1} value={voiceVolume} tooltip={{ open: false }} onChange={setVoiceVolume} />
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
                </div>
              )}
            </section>

            <section className="project-clip-editor__voice-lines">
              <div className="project-clip-editor__voice-lines-title">
                <strong>{l('台词配音', 'Dialogue voiceover')}</strong>
                <span>{voiceLines.length} {l('条', 'lines')}</span>
              </div>
              <div className="project-clip-editor__voice-line-list">
                {voiceLines.map((line, index) => {
                  const adjustableVoice = VOICE_BINDINGS.some(({ character, voice, adjustable }) => (
                    adjustable && character === line.character && voice === line.voice
                  ))
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
                        <button type="button" aria-label={l('删除台词', 'Delete line')} disabled={voiceLines.length === 1} onClick={() => removeVoiceLine(line.id)}><DeleteOutlined /></button>
                      </span>
                    </header>
                    <label>
                      <span>{l('角色', 'Character')}</span>
                      <StudioSelect
                        value={`${line.character}|${line.voice}`}
                        options={voiceRoleOptions}
                        aria-label={l('选择角色与音色', 'Select character and voice')}
                        onChange={(value) => {
                          const [character, voice] = String(value).split('|')
                          updateVoiceLine(line.id, { character, voice })
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
                          maxLength={1000}
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
                        <label>
                          <span>{l('音量', 'Volume')}</span>
                          <div className="project-clip-editor__voice-slider-control">
                            <Slider
                              min={0}
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
                    </article>
                  )
                })}
              </div>
              <button type="button" className="project-clip-editor__add-voice-line" onClick={addVoiceLine}>
                <PlusCircleOutlined />
                {l('添加出镜角色', 'Add on-screen character')}
              </button>
            </section>
          </div>
        ) : (
          <>
        <section className="project-clip-editor__reference-section">
          <div className="project-clip-editor__section-title">
            <strong>{l('参考素材', 'References')}</strong>
            <span>{l('用于保持角色与场景一致', 'Keep visual continuity')}</span>
          </div>
          <div className="project-clip-editor__references">
            <button type="button" className="project-clip-editor__reference-add" aria-label={l('添加参考', 'Add reference')}>
              <PlusOutlined />
            </button>
            {[
              [PREVIEW_IMAGES[1], l('女主角', 'Lead')],
              [PREVIEW_IMAGES[2], l('街边店铺', 'Street')],
              [PREVIEW_IMAGES[3], l('夜景氛围', 'Night mood')],
            ].map(([imageUrl, label], index) => (
              <button key={label} type="button" className={`project-clip-editor__reference${index === 0 ? ' is-selected' : ''}`}>
                <img src={imageUrl} alt="" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        {mode === 'video' && videoVoiceTipVisible && (
          <div className="project-clip-editor__video-voice-tip" role="status">
            <InfoCircleOutlined />
            <span>{l('点击从配音添加，快速引用角色已绑定的音色', 'Add from voice to quickly reuse a character voice')}</span>
            <button
              type="button"
              aria-label={l('关闭提示', 'Dismiss tip')}
              onClick={() => setVideoVoiceTipVisible(false)}
            >
              <CloseOutlined />
            </button>
          </div>
        )}

        <section className="project-clip-editor__prompt-section">
          <div className="project-clip-editor__section-title">
            <strong>{l('提示词', 'Prompt')}</strong>
            <Tooltip
              title={l(
                '描述画面内容，可添加@调用参考',
                'Describe the visual content and use @ to add references',
              )}
              placement="top"
            >
              <QuestionCircleFilled
                className="project-clip-editor__prompt-help"
                aria-label={l(
                  '描述画面内容，可添加@调用参考',
                  'Describe the visual content and use @ to add references',
                )}
                tabIndex={0}
              />
            </Tooltip>
          </div>
          <PromptMentionEditor
            value={prompt}
            assets={promptMentionAssets}
            maxLength={10_000}
            placeholder={l('描述画面主体、环境、动作、镜头与光线，输入 @ 引用素材', 'Describe the subject, setting, action, camera and lighting. Type @ to mention an asset')}
            menuTitle={l('可能 @ 的内容', 'Mentionable assets')}
            characterGroupLabel={l('角色', 'Characters')}
            sceneGroupLabel={l('场景', 'Scenes')}
            emptyLabel={l('没有匹配的素材', 'No matching assets')}
            onChange={updatePrompt}
          />
        </section>

        <div className={`project-clip-editor__prompt-tools${mode === 'video' ? ' is-video' : ''}`}>
          <StudioSelect
            aria-label={l('影调风格', 'Tone style')}
            value={selectedTone}
            options={[
              { value: NO_TONE_VALUE, label: l('选择影调', 'Select tone') },
              { value: 'suspense', label: l('悬疑电影', 'Suspense film') },
              { value: 'documentary', label: l('纪实主义', 'Documentary') },
              { value: 'cyberpunk', label: l('赛博朋克', 'Cyberpunk') },
            ]}
            onChange={(value) => setSelectedTone(String(value))}
          />
          <StudioSelect
            aria-label={l('画面风格', 'Visual style')}
            value={selectedStyle}
            options={styleOptions}
            onChange={(value) => setSelectedStyle(String(value))}
          />
          {mode === 'image' && <Popover
            placement="topRight"
            trigger="click"
            arrow={false}
            overlayClassName="project-clip-editor__skill-popover"
            content={(
              <div className="project-clip-editor__skill-list">
                <button
                  type="button"
                  className={storyboardSkillEnabled ? 'is-selected' : ''}
                  aria-pressed={storyboardSkillEnabled}
                  onClick={() => setStoryboardSkillEnabled((current) => !current)}
                >
                  <span className="project-clip-editor__skill-title">
                    <strong>{l('分镜大师', 'Storyboard master')}</strong>
                    <small>
                      {storyboardSkillEnabled && <CheckOutlined />}
                      {storyboardSkillEnabled ? l('已使用', 'Active') : l('点击使用', 'Use')}
                    </small>
                  </span>
                  <span>{l('专业分镜呈现画面设计，搭配 GPT Image 2 效果最佳', 'Designed for storyboard composition and works best with GPT Image 2')}</span>
                </button>
              </div>
            )}
          >
            <Button
              className={`project-clip-editor__skill-trigger${storyboardSkillEnabled ? ' is-active' : ''}`}
              icon={<BgColorsOutlined />}
            >
              {storyboardSkillEnabled ? l('分镜大师', 'Storyboard master') : l('使用技能', 'Skills')}
            </Button>
          </Popover>}
        </div>

        <footer className="project-clip-editor__generation-footer">
          <div className={`project-clip-editor__generation-selects${mode === 'video' ? ' is-video' : ''}`}>
            <StudioSelect
              aria-label={mode === 'video' ? l('视频模型', 'Video model') : l('图片模型', 'Image model')}
              value={mode === 'video' ? videoModel : model}
              options={mode === 'video'
                ? [
                    { value: 'seedance-2.5', label: 'Seedance 2.5' },
                    { value: 'seedance-2.0', label: 'Seedance 2.0' },
                  ]
                : [
                    { value: 'gpt-image-2', label: 'GPT Image 2' },
                    { value: 'nano-banana-2', label: 'Nano Banana 2' },
                  ]}
              onChange={(value) => {
                if (mode === 'video') setVideoModel(String(value))
                else setModel(String(value))
              }}
            />
            {mode === 'video' ? (
              <Popover
                placement="topRight"
                trigger="click"
                arrow={false}
                open={videoSpecOpen}
                onOpenChange={setVideoSpecOpen}
                overlayClassName="project-clip-editor__video-spec-popover"
                content={(
                  <div className="project-clip-editor__video-spec-panel">
                    <section>
                      <span className="project-clip-editor__video-spec-label">{l('分辨率', 'Resolution')}</span>
                      <div className="project-clip-editor__video-resolution-options" role="group" aria-label={l('分辨率', 'Resolution')}>
                        {(['480P', '720P'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={videoResolution === value ? 'is-selected' : ''}
                            aria-pressed={videoResolution === value}
                            onClick={() => setVideoResolution(value)}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section>
                      <span className="project-clip-editor__video-spec-label">{l('时长', 'Duration')}</span>
                      <div className="project-clip-editor__video-duration-control">
                        <div
                          className="project-clip-editor__video-duration-slider"
                          style={{
                            '--video-duration-progress': `${((videoDuration - VIDEO_DURATION_MIN) / (VIDEO_DURATION_MAX - VIDEO_DURATION_MIN)) * 100}%`,
                          } as CSSProperties}
                        >
                          <Slider
                            min={VIDEO_DURATION_MIN}
                            max={VIDEO_DURATION_MAX}
                            step={1}
                            value={videoDuration}
                            tooltip={{ open: false }}
                            aria-label={l('视频时长', 'Video duration')}
                            onChange={setVideoDuration}
                          />
                        </div>
                        <output>{videoDuration}s</output>
                      </div>
                    </section>
                  </div>
                )}
              >
                <button
                  type="button"
                  className={`project-clip-editor__video-spec-trigger${videoSpecOpen ? ' is-open' : ''}`}
                  aria-label={l('视频规格', 'Video output')}
                  aria-expanded={videoSpecOpen}
                >
                  <span>{videoResolution} · {videoDuration}s</span>
                  <DownOutlined />
                </button>
              </Popover>
            ) : (
              <StudioSelect
                aria-label={l('图片清晰度', 'Image resolution')}
                value={resolution}
                options={[
                  { value: '2k', label: '2K' },
                  { value: '4k', label: '4K' },
                ]}
                onChange={(value) => setResolution(String(value))}
              />
            )}
          </div>
          <Button
            type="primary"
            size="large"
            icon={<ThunderboltFilled />}
            disabled={!prompt.trim()}
            onClick={() => message.info(l('生成接口待接入', 'Generation API is not connected yet'))}
          >
            {mode === 'video'
              ? `${l('生视频', 'Generate video')} · 238`
              : `${l('生成图片', 'Generate image')} · 6`}
          </Button>
        </footer>
          </>
        )}
      </aside>
    </main>
    <Modal
      title={editorTitle}
      open={editorOpen}
      centered
      width={560}
      maskClosable={false}
      destroyOnClose
      className="project-clip-editor-modal"
      onCancel={closeClipEditor}
      footer={null}
    >
      <div className="project-clip-editor-modal__field">
        <label htmlFor="project-clip-number">{l('片段号', 'Clip number')}</label>
        <Input id="project-clip-number" value={editorClipTitle} disabled />
      </div>
      <div className="project-clip-editor-modal__field">
        <label htmlFor="project-clip-description">{l('片段描述', 'Clip description')}</label>
        <Input.TextArea
          id="project-clip-description"
          value={editingDescription}
          maxLength={5000}
          autoSize={false}
          onChange={(event) => setEditingDescription(event.target.value)}
        />
        <span className="project-clip-editor-modal__count">{editingDescription.length}/5000</span>
      </div>
      <div className="project-clip-editor-modal__actions">
        <Button onClick={closeClipEditor}>{l('取消', 'Cancel')}</Button>
        <Button type="primary" onClick={saveClipEditor}>{l('确定', 'Confirm')}</Button>
      </div>
    </Modal>
    <ImageViewer
      open={imageViewerOpen}
      imageUrl={activeImageUrl}
      alt={activeClip.title}
      onClose={() => setImageViewerOpen(false)}
    />
    <VoiceLibraryModal open={voiceLibraryOpen} onCancel={() => setVoiceLibraryOpen(false)} />
    </>
  )
}
