import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'

// 短暂缓冲连续按键，避免 20 万字文本让创建页逐键重渲染。
const DEFAULT_COMMIT_DELAY_MS = 200

export type LongTextEditorHandle = {
  /** 立即把组件内尚未提交的文本同步给调用方，并返回最新值。 */
  flush: () => string
  getValue: () => string
}

type LongTextEditorProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'defaultValue' | 'maxLength' | 'onChange' | 'value'
> & {
  value: string
  maxLength: number
  onCommit: (value: string) => void
  onEdit?: () => void
  onFlush?: (value: string) => void
  commitDelay?: number
  counter?: {
    className: string
    suffix?: ReactNode
  }
}

const clampToEditorLimit = (value: string, maxLength: number) => (
  value.length > maxLength ? value.slice(0, maxLength) : value
)

const LongTextEditor = forwardRef<LongTextEditorHandle, LongTextEditorProps>(({
  value,
  maxLength,
  onCommit,
  onEdit,
  onFlush,
  commitDelay = DEFAULT_COMMIT_DELAY_MS,
  counter,
  onBlur,
  onCompositionEnd,
  onCompositionStart,
  ...textareaProps
}, ref) => {
  const normalizedValue = clampToEditorLimit(value, maxLength)
  const [editorValue, setEditorValue] = useState(normalizedValue)
  const editorValueRef = useRef(editorValue)
  const committedValueRef = useRef(normalizedValue)
  const composingRef = useRef(false)
  const commitTimerRef = useRef<number | null>(null)
  const onCommitRef = useRef(onCommit)
  const onFlushRef = useRef(onFlush)

  onCommitRef.current = onCommit
  onFlushRef.current = onFlush

  const cancelScheduledCommit = useCallback(() => {
    if (commitTimerRef.current === null) return
    window.clearTimeout(commitTimerRef.current)
    commitTimerRef.current = null
  }, [])

  const commitLatestValue = useCallback((forceFlush: boolean) => {
    cancelScheduledCommit()
    const nextValue = editorValueRef.current
    if (nextValue !== committedValueRef.current) {
      committedValueRef.current = nextValue
      onCommitRef.current(nextValue)
    }
    if (forceFlush) onFlushRef.current?.(nextValue)
    return nextValue
  }, [cancelScheduledCommit])
  const scheduleCommit = useCallback(() => {
    cancelScheduledCommit()
    commitTimerRef.current = window.setTimeout(
      () => commitLatestValue(false),
      Math.max(0, commitDelay),
    )
  }, [cancelScheduledCommit, commitDelay, commitLatestValue])

  useImperativeHandle(ref, () => ({
    flush: () => commitLatestValue(true),
    getValue: () => editorValueRef.current,
  }), [commitLatestValue])

  useEffect(() => {
    const nextValue = clampToEditorLimit(value, maxLength)
    committedValueRef.current = nextValue
    if (nextValue === editorValueRef.current) return
    editorValueRef.current = nextValue
    setEditorValue(nextValue)
  }, [maxLength, value])

  useEffect(() => cancelScheduledCommit, [cancelScheduledCommit])

  return (
    <>
      <textarea
        {...textareaProps}
        value={editorValue}
        maxLength={maxLength}
        onChange={(event) => {
          const nextValue = clampToEditorLimit(event.currentTarget.value, maxLength)
          editorValueRef.current = nextValue
          setEditorValue(nextValue)
          onEdit?.()
          if (!composingRef.current) scheduleCommit()
        }}
        onCompositionStart={(event) => {
          composingRef.current = true
          cancelScheduledCommit()
          onCompositionStart?.(event)
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false
          const nextValue = clampToEditorLimit(event.currentTarget.value, maxLength)
          editorValueRef.current = nextValue
          setEditorValue(nextValue)
          scheduleCommit()
          onCompositionEnd?.(event)
        }}
        onBlur={(event) => {
          commitLatestValue(true)
          onBlur?.(event)
        }}
      />
      {counter && (
        <div className={counter.className}>
          {editorValue.length.toLocaleString()} / {maxLength.toLocaleString()}
          {counter.suffix}
        </div>
      )}
    </>
  )
})

LongTextEditor.displayName = 'LongTextEditor'

export default memo(LongTextEditor)
