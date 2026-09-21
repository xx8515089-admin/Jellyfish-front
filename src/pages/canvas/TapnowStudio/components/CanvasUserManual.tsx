import { useMemo, useRef } from 'react'
import { Button, ConfigProvider, Modal, theme as antdTheme } from 'antd'
import { renderUserManual } from '../../../../i18n/userManual'
import './CanvasUserManual.css'

export default function CanvasUserManual({ theme, language, onClose }: {
  theme: string
  language: string
  onClose: () => void
}) {
  const { chapters, html } = useMemo(() => renderUserManual(language, 'canvas-manual-chapter-'), [language])
  const articleRef = useRef<HTMLElement>(null)
  const text = (zh: string, en: string) => language.startsWith('en') ? en : zh

  const goToChapter = (index: number) => {
    const heading = articleRef.current?.querySelector<HTMLElement>(`#canvas-manual-chapter-${index}`)
    heading?.scrollIntoView({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }

  return <ConfigProvider theme={{
    inherit: false,
    algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: theme === 'solarized'
      ? { colorBgElevated: '#fdf6e3', colorText: '#586e75', colorPrimary: '#466aa9' }
      : { colorPrimary: '#7495ff' },
    components: { Modal: { headerBg: 'transparent' } },
  }}>
    <Modal
      open centered width={1120} zIndex={20000}
      className={`canvas-user-manual canvas-user-manual--${theme}`}
      title={text('用户手册 · 自由画布与 3D 导演台', 'User manual · Canvas & 3D Director Desk')}
      onCancel={onClose}
      footer={<Button onClick={onClose}>{text('关闭手册', 'Close manual')}</Button>}
      modalRender={dialog => <div
        data-canvas-interactive="true"
        onKeyDown={event => {
          // Keep Modal's focus trap, but prevent canvas shortcuts while reading.
          if (event.key === 'Tab') return
          event.stopPropagation()
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            onClose()
          }
        }}
        onKeyUp={event => event.stopPropagation()}
        onCopy={event => event.stopPropagation()}
        onCut={event => event.stopPropagation()}
        onPaste={event => event.stopPropagation()}
        onWheel={event => event.stopPropagation()}
      >{dialog}</div>}
    >
      <p className="canvas-user-manual__intro">
        {text('从目录选择要做的事，照着步骤操作。关闭手册后可继续编辑画布。', 'Choose a chapter and follow the steps. Close the manual to continue editing.')}
      </p>
      <div className="canvas-user-manual__layout">
        <nav aria-label={text('用户手册目录', 'Manual chapters')}>
          <strong>{text('目录', 'Contents')}</strong>
          {chapters.map((chapter, index) => <button type="button" key={index} onClick={() => goToChapter(index)}>
            {chapter.text}
          </button>)}
        </nav>
        <article
          ref={articleRef}
          tabIndex={0}
          aria-label={text('用户手册正文', 'Manual content')}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </Modal>
  </ConfigProvider>
}
