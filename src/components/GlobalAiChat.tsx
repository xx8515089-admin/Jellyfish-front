import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Check, Clipboard, MessageCircle, Minus, Send, Sparkles, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import './GlobalAiChat.css'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  time: string
}

type Position = {
  x: number
  y: number
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  moved: boolean
}

const AI_IMAGE_SRC = '/assets/images/ai.png'
const POSITION_STORAGE_KEY = 'reelmax_global_ai_chat_position'
const CLOSED_BOUNDS = { width: 112, height: 132 }
const OPEN_BOUNDS = { width: 640, height: 560 }
const COMPANION_BOUNDS = { width: 196 }
const VIEWPORT_PADDING = 12
const INPUT_MIN_HEIGHT = 42
const INPUT_MAX_HEIGHT = 88

function getDefaultPosition(): Position {
  if (typeof window === 'undefined') return { x: 24, y: 120 }
  return {
    x: Math.max(VIEWPORT_PADDING, window.innerWidth - CLOSED_BOUNDS.width - 28),
    y: Math.max(VIEWPORT_PADDING, window.innerHeight - CLOSED_BOUNDS.height - 32),
  }
}

function clampPosition(position: Position, isOpen: boolean): Position {
  if (typeof window === 'undefined') return position
  const bounds = isOpen ? OPEN_BOUNDS : CLOSED_BOUNDS
  const maxX = Math.max(VIEWPORT_PADDING, window.innerWidth - bounds.width - VIEWPORT_PADDING)
  const maxY = Math.max(VIEWPORT_PADDING, window.innerHeight - bounds.height - VIEWPORT_PADDING)
  return {
    x: Math.min(Math.max(VIEWPORT_PADDING, position.x), maxX),
    y: Math.min(Math.max(VIEWPORT_PADDING, position.y), maxY),
  }
}

function readStoredPosition(): Position {
  if (typeof window === 'undefined') return getDefaultPosition()
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return getDefaultPosition()
    const parsed = JSON.parse(raw) as Partial<Position>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return getDefaultPosition()
    return clampPosition({ x: parsed.x, y: parsed.y }, false)
  } catch {
    return getDefaultPosition()
  }
}

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }
}

function buildLocalReply(input: string): string {
  const normalized = input.trim()
  if (/提示词|prompt/i.test(normalized)) {
    return '可以，我可以帮你把想法拆成画面主体、镜头、风格、光线和限制词。把目标效果发给我，我会按短剧生成场景整理。'
  }
  if (/布局|样式|颜色|页面/.test(normalized)) {
    return '我会优先看信息层级、留白、对比度和交互状态，再给你一个更统一的调整方向。'
  }
  return '收到。这个悬浮聊天入口已经准备好，后续接入真实 AI 对话接口后，这里会直接返回完整回复。'
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text.trim() || typeof window === 'undefined') return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the textarea fallback.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

const GlobalAiChat = () => {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<Position>(() => readStoredPosition())
  const [isDragging, setIsDragging] = useState(false)
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createMessage('assistant', '你好，我是 Reelmax AI。可以随时问我创作、提示词、页面和流程问题。'),
  ])
  const dragStateRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)
  const replyTimerRef = useRef<number | null>(null)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const companionRef = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const isComposingRef = useRef(false)
  const copyResetTimerRef = useRef<number | null>(null)

  const persistPosition = useCallback((nextPosition: Position) => {
    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nextPosition))
    } catch {
      // Position persistence is optional.
    }
  }, [])

  const updatePosition = useCallback((nextPosition: Position, nextOpen = isOpen) => {
    const clamped = clampPosition(nextPosition, nextOpen)
    setPosition(clamped)
    persistPosition(clamped)
  }, [isOpen, persistPosition])

  const getOpenPositionFromClosed = useCallback((closedPosition: Position): Position => {
    if (typeof window === 'undefined') return closedPosition
    const openWidth = Math.min(OPEN_BOUNDS.width, window.innerWidth - VIEWPORT_PADDING * 2)
    const openHeight = Math.min(OPEN_BOUNDS.height, window.innerHeight - VIEWPORT_PADDING * 2)
    const closedCenterX = closedPosition.x + CLOSED_BOUNDS.width / 2
    const closedBottomY = closedPosition.y + CLOSED_BOUNDS.height

    return clampPosition({
      x: closedCenterX - openWidth + COMPANION_BOUNDS.width / 2,
      y: closedBottomY - openHeight,
    }, true)
  }, [])

  const getClosedPositionFromCompanion = useCallback((): Position => {
    const companionRect = companionRef.current?.getBoundingClientRect()
    if (companionRect) {
      return clampPosition({
        x: companionRect.left + (companionRect.width - CLOSED_BOUNDS.width) / 2,
        y: companionRect.bottom - CLOSED_BOUNDS.height,
      }, false)
    }

    const rootRect = rootRef.current?.getBoundingClientRect()
    if (rootRect) {
      return clampPosition({
        x: rootRect.right - CLOSED_BOUNDS.width,
        y: rootRect.bottom - CLOSED_BOUNDS.height,
      }, false)
    }

    return clampPosition(position, false)
  }, [position])

  useEffect(() => {
    const handleResize = () => updatePosition(position, isOpen)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen, position, updatePosition])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, isThinking])

  useLayoutEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const measuredHeight = input.length > 0 ? textarea.scrollHeight : INPUT_MIN_HEIGHT
    const nextHeight = Math.min(Math.max(measuredHeight, INPUT_MIN_HEIGHT), INPUT_MAX_HEIGHT)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = measuredHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [input])

  useEffect(() => {
    return () => {
      if (replyTimerRef.current) window.clearTimeout(replyTimerRef.current)
      if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current)
    }
  }, [])

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const clamped = clampPosition(position, isOpen)
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: clamped.x,
      originY: clamped.y,
      moved: false,
    }
    setPosition(clamped)
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const deltaX = event.clientX - dragState.startX
    const deltaY = event.clientY - dragState.startY
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragState.moved = true
    }
    updatePosition({ x: dragState.originX + deltaX, y: dragState.originY + deltaY }, isOpen)
  }

  const stopDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    if (dragState.moved) {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
    dragStateRef.current = null
    setIsDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const openPanel = () => {
    if (suppressClickRef.current) return
    const nextPosition = getOpenPositionFromClosed(position)
    setIsOpen(true)
    updatePosition(nextPosition, true)
  }

  const minimizePanel = () => {
    const nextPosition = getClosedPositionFromCompanion()
    setIsOpen(false)
    updatePosition(nextPosition, false)
  }

  const sendMessage = useCallback((draft?: string) => {
    const content = (draft ?? input).trim()
    if (!content || isThinking) return
    setMessages((current) => [...current, createMessage('user', content)])
    setInput('')
    setIsThinking(true)
    if (replyTimerRef.current) window.clearTimeout(replyTimerRef.current)
    replyTimerRef.current = window.setTimeout(() => {
      setMessages((current) => [...current, createMessage('assistant', buildLocalReply(content))])
      setIsThinking(false)
    }, 420)
  }, [input, isThinking])

  const handleInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (isComposingRef.current || event.nativeEvent.isComposing) return
    event.preventDefault()
    sendMessage()
  }, [sendMessage])

  const handleCopyMessage = useCallback(async (message: ChatMessage) => {
    const copied = await copyTextToClipboard(message.content)
    if (!copied) return

    setCopiedMessageId(message.id)
    if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current)
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopiedMessageId(null)
    }, 1400)
  }, [])

  const isCanvasStudioPage = location.pathname === '/canvas' || location.pathname.startsWith('/canvas/')
  const isDirectorDeskPage = location.pathname.startsWith('/director-desk') || location.pathname.endsWith('/director-stage')
  const shouldHide = location.pathname === '/login' || isCanvasStudioPage || isDirectorDeskPage
  if (shouldHide) return null

  return (
    <div
      ref={rootRef}
      className={`global-ai-chat ${isOpen ? 'is-open' : 'is-closed'} ${isDragging ? 'is-dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
    >
      {!isOpen ? (
        <button
          type="button"
          className="global-ai-chat-orb"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onClick={openPanel}
          aria-label="打开 Reelmax AI 聊天"
        >
          <span className="global-ai-chat-orb-glow" />
          <img src={AI_IMAGE_SRC} alt="" draggable={false} />
          <span className="global-ai-chat-orb-label">
            <MessageCircle size={13} />
            AI 助手
          </span>
        </button>
      ) : (
        <section className="global-ai-chat-panel" aria-label="Reelmax AI 聊天">
          <div className="global-ai-chat-dialog">
            <header
              className="global-ai-chat-header"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            >
              <div className="global-ai-chat-title">
                <strong>Reelmax AI</strong>
              </div>
              <div className="global-ai-chat-actions">
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={minimizePanel}
                  aria-label="最小化 AI 聊天"
                >
                  <Minus size={16} />
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={minimizePanel}
                  aria-label="关闭 AI 聊天"
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className="global-ai-chat-messages">
              {messages.map((message) => (
                <div key={message.id} className={`global-ai-chat-message ${message.role}`}>
                  <div className="global-ai-chat-message-body">
                    <div className="global-ai-chat-bubble">
                      <p>{message.content}</p>
                    </div>
                    <div className="global-ai-chat-message-meta">
                      <time>{message.time}</time>
                      <button
                        type="button"
                        className="global-ai-chat-copy"
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleCopyMessage(message)
                        }}
                        aria-label={copiedMessageId === message.id ? '已复制消息' : '复制消息'}
                        title={copiedMessageId === message.id ? '已复制' : '复制'}
                      >
                        {copiedMessageId === message.id ? <Check size={12} /> : <Clipboard size={12} />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {isThinking && (
                <div className="global-ai-chat-message assistant">
                  <div className="global-ai-chat-bubble thinking">
                    <Sparkles size={14} />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
              <div ref={messageEndRef} />
            </div>

            <div className="global-ai-chat-suggestions">
              {['帮我写提示词', '当前页面怎么优化？', '生成分镜建议'].map((item) => (
                <button key={item} type="button" onClick={() => sendMessage(item)}>
                  {item}
                </button>
              ))}
            </div>

            <footer className="global-ai-chat-footer">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onCompositionStart={() => { isComposingRef.current = true }}
                onCompositionEnd={() => { isComposingRef.current = false }}
                onKeyDown={handleInputKeyDown}
                placeholder="问问 Reelmax AI..."
                rows={1}
              />
              <button type="button" onClick={() => sendMessage()} disabled={!input.trim() || isThinking} aria-label="发送消息">
                <Send size={17} />
              </button>
            </footer>
          </div>

          <aside
            ref={companionRef}
            className="global-ai-chat-companion"
            aria-hidden="true"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          >
            <span />
            <img src={AI_IMAGE_SRC} alt="" draggable={false} />
          </aside>
        </section>
      )}
    </div>
  )
}

export default GlobalAiChat
