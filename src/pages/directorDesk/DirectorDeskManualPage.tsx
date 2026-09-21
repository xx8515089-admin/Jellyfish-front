import { useEffect, useMemo, useRef } from 'react'
import { renderUserManual } from '../../i18n/userManual'
import { useBilingualText } from '../../i18n/useBilingualText'
import { useAppStore } from '../../store/useAppStore'
import './directorDeskManual.css'

const directorStartId = 'chapter-6'

export default function DirectorDeskManualPage() {
  const language = useAppStore(state => state.language)
  const setLanguage = useAppStore(state => state.setLanguage)
  const l = useBilingualText()
  const { chapters, html } = useMemo(() => renderUserManual(language, 'chapter-'), [language])
  const articleRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const requestedId = window.location.hash.slice(1) || directorStartId
    const heading = document.getElementById(requestedId)
    const target = heading && articleRef.current?.contains(heading) ? heading : document.getElementById(directorStartId)
    target?.scrollIntoView({ block: 'start' })
    target?.focus({ preventScroll: true })
  }, [language])

  return <main className="director-manual">
    <header className="director-manual__header">
      <strong>{l('3D 导演台 · 用户手册', '3D Director Desk · User manual')}</strong>
      <span>{l('零基础操作指南 · 与自由画布使用同一份最新手册', 'Beginner guide · Shared with Free Canvas')}</span>
      <a href={`#${directorStartId}`}>{l('从导演台入门开始', 'Start with Director Desk')}</a>
      <select aria-label={l('界面语言', 'Interface language')} value={language} onChange={event => setLanguage(event.target.value as 'zh-CN' | 'en-US')}>
        <option value="zh-CN">中文</option><option value="en-US">English</option>
      </select>
    </header>
    <div className="director-manual__layout">
      <nav aria-label={l('用户手册目录', 'Manual chapters')}>
        <strong>{l('目录', 'Contents')}</strong>
        {chapters.map((chapter, index) => <a key={index} href={`#chapter-${index}`}>{chapter.text}</a>)}
      </nav>
      <article ref={articleRef} aria-label={l('用户手册正文', 'Manual content')} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  </main>
}
