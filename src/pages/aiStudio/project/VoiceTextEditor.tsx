import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
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

export type VoiceTextEditorHandle = {
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


export default VoiceTextEditor
