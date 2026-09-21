import { uiText, useUiLanguage } from '../i18n/uiText'
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

type PositionOffset = {
  right: number
  bottom: number
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  originRight: number
  originBottom: number
  width: number
  height: number
  moved: boolean
  lastPosition: PositionOffset
}

const AI_IMAGE_SRC = '/assets/images/ai.png'
const POSITION_STORAGE_KEY = 'reelmax_global_ai_chat_offset_v2'
const VIEWPORT_PADDING = 12
const DRAG_THRESHOLD = 3
const INPUT_MIN_HEIGHT = 42
const INPUT_MAX_HEIGHT = 88

function getDefaultPosition(): PositionOffset {
  return { right: VIEWPORT_PADDING, bottom: VIEWPORT_PADDING }
}

function readStoredPosition(): PositionOffset {
  if (typeof window === 'undefined') return getDefaultPosition()

  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return getDefaultPosition()
    const parsed = JSON.parse(raw) as Partial<PositionOffset>
    if (!Number.isFinite(parsed.right) || !Number.isFinite(parsed.bottom)) {
      return getDefaultPosition()
    }
    return { right: parsed.right as number, bottom: parsed.bottom as number }
  } catch {
    return getDefaultPosition()
  }
}

function clampPosition(position: PositionOffset, width: number, height: number): PositionOffset {
  if (typeof window === 'undefined') return position

  const maxRight = Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING)
  const maxBottom = Math.max(VIEWPORT_PADDING, window.innerHeight - height - VIEWPORT_PADDING)
  return {
    right: Math.min(Math.max(VIEWPORT_PADDING, position.right), maxRight),
    bottom: Math.min(Math.max(VIEWPORT_PADDING, position.bottom), maxBottom),
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
    // 继续使用 textarea 回退方案。
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
  useUiLanguage()

  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<PositionOffset>(() => readStoredPosition())
  const [isDragging, setIsDragging] = useState(false)
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createMessage('assistant', '你好，我是 Reelmax AI。可以随时问我创作、提示词、页面和流程问题。'),
  ])
  const replyTimerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const desiredPositionRef = useRef(position)
  const dragStateRef = useRef<DragState | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const pendingPositionRef = useRef<PositionOffset | null>(null)
  const suppressClickRef = useRef(false)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const isComposingRef = useRef(false)
  const copyResetTimerRef = useRef<number | null>(null)

  const applyPosition = useCallback((nextPosition: PositionOffset) => {
    setPosition(nextPosition)
  }, [])

  const persistPosition = useCallback((nextPosition: PositionOffset) => {
    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nextPosition))
    } catch {
      // 位置持久化失败不影响拖动和聊天。
    }
  }, [])

  const fitDesiredPositionToViewport = useCallback(() => {
    const root = rootRef.current
    if (!root || dragStateRef.current) return
    const nextPosition = clampPosition(
      desiredPositionRef.current,
      root.offsetWidth,
      root.offsetHeight,
    )
    applyPosition(nextPosition)
  }, [applyPosition])

  useLayoutEffect(() => {
    fitDesiredPositionToViewport()
  }, [fitDesiredPositionToViewport, isOpen])

  useEffect(() => {
    window.addEventListener('resize', fitDesiredPositionToViewport)
    return () => window.removeEventListener('resize', fitDesiredPositionToViewport)
  }, [fitDesiredPositionToViewport])

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
      if (dragFrameRef.current) window.cancelAnimationFrame(dragFrameRef.current)
    }
  }, [])

  const queuePositionUpdate = (nextPosition: PositionOffset) => {
    pendingPositionRef.current = nextPosition
    if (dragFrameRef.current !== null) return

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null
      const pendingPosition = pendingPositionRef.current
      pendingPositionRef.current = null
      if (pendingPosition) applyPosition(pendingPosition)
    })
  }

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const root = rootRef.current
    if (!root) return

    const rect = root.getBoundingClientRect()
    const currentPosition = clampPosition({
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom,
    }, rect.width, rect.height)

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originRight: currentPosition.right,
      originBottom: currentPosition.bottom,
      width: rect.width,
      height: rect.height,
      moved: false,
      lastPosition: currentPosition,
    }
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    const deltaX = event.clientX - dragState.startX
    const deltaY = event.clientY - dragState.startY
    if (!dragState.moved) {
      if (Math.abs(deltaX) <= DRAG_THRESHOLD && Math.abs(deltaY) <= DRAG_THRESHOLD) return
      dragState.moved = true
    }

    const nextPosition = clampPosition({
      right: dragState.originRight - deltaX,
      bottom: dragState.originBottom - deltaY,
    }, dragState.width, dragState.height)
    dragState.lastPosition = nextPosition
    queuePositionUpdate(nextPosition)
  }

  const stopDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
    pendingPositionRef.current = null
    dragStateRef.current = null

    if (dragState.moved) {
      const root = rootRef.current
      const finalPosition = clampPosition(
        dragState.lastPosition,
        root?.offsetWidth ?? dragState.width,
        root?.offsetHeight ?? dragState.height,
      )
      applyPosition(finalPosition)
      desiredPositionRef.current = finalPosition
      persistPosition(finalPosition)

      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    } else {
      fitDesiredPositionToViewport()
    }

    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const openPanel = () => {
    if (suppressClickRef.current) return
    setIsOpen(true)
  }

  const minimizePanel = () => {
    setIsOpen(false)
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
      style={{ right: position.right, bottom: position.bottom }}
    >
      {!isOpen ? (
        <button
          type="button"
          className="global-ai-chat-orb"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onLostPointerCapture={stopDrag}
          onClick={openPanel}
          aria-label={uiText("打开 Reelmax AI 聊天")}
        >
          <span className="global-ai-chat-orb-glow" />
          <img src={AI_IMAGE_SRC} alt="" draggable={false} />
          <span className="global-ai-chat-orb-label">
            <MessageCircle size={13} />
            {uiText("AI 助手")}</span>
        </button>
      ) : (
        <section className="global-ai-chat-panel" aria-label={uiText("Reelmax AI 聊天")}>
          <div className="global-ai-chat-dialog">
            <header
              className="global-ai-chat-header"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              onLostPointerCapture={stopDrag}
            >
              <div className="global-ai-chat-title">
                <strong>Reelmax AI</strong>
              </div>
              <div className="global-ai-chat-actions">
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={minimizePanel}
                  aria-label={uiText("最小化 AI 聊天")}
                >
                  <Minus size={16} />
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={minimizePanel}
                  aria-label={uiText("关闭 AI 聊天")}
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
                        aria-label={copiedMessageId === message.id ? uiText("已复制消息") : uiText("复制消息")}
                        title={copiedMessageId === message.id ? uiText("已复制") : uiText("复制")}
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
                placeholder={uiText("问问 Reelmax AI...")}
                rows={1}
              />
              <button type="button" onClick={() => sendMessage()} disabled={!input.trim() || isThinking} aria-label={uiText("发送消息")}>
                <Send size={17} />
              </button>
            </footer>
          </div>

          <aside
            className="global-ai-chat-companion"
            aria-hidden="true"
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
