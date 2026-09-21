import { uiText } from '../../../../i18n/uiText'
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
  const billing = uiText(billingLabels[task?.billingState] || '')
  // Copy the original Markdown so lists and headings remain useful outside the chat.
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopyState('copied') }
    catch { setCopyState('failed') }
  }
  return <section className="canvas-v4-reply" aria-label={uiText("助手回复")}>
    <header className="canvas-v4-reply__header"><span className="canvas-v4-reply__avatar"><Sparkles size={15} /></span><strong>{uiText("画布助手")}</strong>
      {resolvedStatus !== 3 && <span className={`canvas-v4-reply__status${working ? ' is-working' : ''}`}>{uiText(executionStatus[resolvedStatus] || '') || uiText("等待回复")}</span>}
    </header>
    {text ? <div className="canvas-v4-reply__markdown" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="canvas-v4-reply__placeholder">{working ? uiText("正在整理思路，回复完成后会显示在这里…") : resolvedStatus === 6 ? uiText("这条消息的结果待核查。") : resolvedStatus === 5 ? uiText("这条消息已取消。") : uiText("暂未收到回复。")}</p>}
    {(text || task) && <footer className="canvas-v4-reply__footer">
      {text && <Tooltip title={copyState === 'copied' ? uiText("已复制") : copyState === 'failed' ? uiText("复制失败，请选中文字复制") : uiText("复制回复")}><Button type="text" size="small" aria-label={uiText("复制回复")} icon={copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />} onClick={copy}>{copyState === 'copied' ? uiText("已复制") : copyState === 'failed' ? uiText("复制失败") : uiText("复制")}</Button></Tooltip>}
      {task && <details className="canvas-v4-reply__billing"><summary>{task.actualCredits == null ? uiText("费用待核算") : uiText("{0} 积分", credits(task.actualCredits))}<span>{billing}</span></summary><div>{(task.billingState === 'reserved' || task.reservedCredits > 0) && <>{uiText("预留") + " "}{credits(task.reservedCredits)} · </>}{uiText("实际") + " "}{credits(task.actualCredits)} {uiText("积分 ·") + " "}{billing || task.billingState}</div></details>}
    </footer>}
  </section>
})
