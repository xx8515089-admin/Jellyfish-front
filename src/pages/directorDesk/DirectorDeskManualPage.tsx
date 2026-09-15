import { marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import manual from '../../../docs/3d-director-desk-user-manual.md?raw'
import './directorDeskManual.css'

const chapters = marked.lexer(manual).filter((token): token is Tokens.Heading => token.type === 'heading' && token.depth === 2)
let chapterIndex = 0
const html = DOMPurify.sanitize(marked.parse(manual, { async: false }) as string)
  .replace(/<h2>/g, () => `<h2 id="chapter-${chapterIndex++}">`)

/** Render the bundled user manual so help stays available with the deployed frontend. */
export default function DirectorDeskManualPage() {
  return <main className="director-manual">
    <header className="director-manual__header"><strong>3D 导演台 · 使用文档</strong><span>可保留此页面，对照导演台操作</span></header>
    <div className="director-manual__layout">
      <nav aria-label="文档目录"><strong>目录</strong>{chapters.map((chapter, index) => <a key={index} href={`#chapter-${index}`}>{chapter.text}</a>)}</nav>
      <article dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  </main>
}
