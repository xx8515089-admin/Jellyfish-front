import React, { memo, useEffect, useMemo, useState } from 'react'
import { Button, Tooltip } from 'antd'
import { Check, Copy, Sparkles } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { billingLabels } from '../canvasActualBilling'
import { credits, executionStatus } from '../canvasExecution'

/** Render model text as sanitized prose; media remains in the dedicated attachment previews. */
function replyHtml(text) {
  const fragment = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: true }), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'hr', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'title', 'start', 'align'],
    RETURN_DOM_FRAGMENT: true,
  })
  fragment.querySelectorAll('a').forEach(link => { link.target = '_blank'; link.rel = 'noopener noreferrer' })
  // Wrap wide tables independently, so long rows never stretch the chat sidebar.
  fragment.querySelectorAll('table').forEach(table => {
    const wrapper = document.createElement('div')
    wrapper.className = 'canvas-v4-reply__table'
    wrapper.tabIndex = 0
    wrapper.setAttribute('role', 'region')
    wrapper.setAttribute('aria-label', '回复表格')
    table.replaceWith(wrapper); wrapper.appendChild(table)
  })
  const container = document.createElement('div')
  container.appendChild(fragment)
  return container.innerHTML
}

/** Assistant message with readable Markdown and secondary, expandable billing information. */
export default memo(function CanvasChatReply({ text = '', task, status }) {
  const html = useMemo(() => replyHtml(text), [text])
  const [copyState, setCopyState] = useState('idle')
  useEffect(() => {
    if (copyState === 'idle') return
    const timer = setTimeout(() => setCopyState('idle'), 2200)
    return () => clearTimeout(timer)
  }, [copyState])
  const resolvedStatus = task?.status ?? status
  const working = [1, 2].includes(resolvedStatus)
  const billing = billingLabels[task?.billingState]
  // Copy the original Markdown so lists and headings remain useful outside the chat.
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopyState('copied') }
    catch { setCopyState('failed') }
  }
  return <section className="canvas-v4-reply" aria-label="助手回复">
    <header className="canvas-v4-reply__header"><span className="canvas-v4-reply__avatar"><Sparkles size={15} /></span><strong>画布助手</strong>
      {resolvedStatus !== 3 && <span className={`canvas-v4-reply__status${working ? ' is-working' : ''}`}>{executionStatus[resolvedStatus] || '等待回复'}</span>}
    </header>
    {text ? <div className="canvas-v4-reply__markdown" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="canvas-v4-reply__placeholder">{working ? '正在整理思路，回复完成后会显示在这里…' : resolvedStatus === 6 ? '这条消息的结果待核查。' : resolvedStatus === 5 ? '这条消息已取消。' : '暂未收到回复。'}</p>}
    {(text || task) && <footer className="canvas-v4-reply__footer">
      {text && <Tooltip title={copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败，请选中文字复制' : '复制回复'}><Button type="text" size="small" aria-label="复制回复" icon={copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />} onClick={copy}>{copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制'}</Button></Tooltip>}
      {task && <details className="canvas-v4-reply__billing"><summary>{task.actualCredits == null ? '费用待核算' : `${credits(task.actualCredits)} 积分`}<span>{billing}</span></summary><div>{(task.billingState === 'reserved' || task.reservedCredits > 0) && <>预留 {credits(task.reservedCredits)} · </>}实际 {credits(task.actualCredits)} 积分 · {billing || task.billingState}</div></details>}
    </footer>}
  </section>
})
