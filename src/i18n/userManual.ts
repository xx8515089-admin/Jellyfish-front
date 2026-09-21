import DOMPurify from 'dompurify'
import { marked, type Tokens } from 'marked'
import chinese from '../../docs/canvas-director-beginner-manual.md?raw'
import english from '../../docs/canvas-director-beginner-manual.en.md?raw'

/** Shared chapters keep links stable when either manual switches language. */
export function renderUserManual(language: string, prefix: string) {
  const source = language.startsWith('en') ? english : chinese
  const chapters = marked.lexer(source).filter((token): token is Tokens.Heading => token.type === 'heading' && token.depth === 2)
  let index = 0
  const html = DOMPurify.sanitize(marked.parse(source, { async: false }) as string)
    .replace(/<h2>/g, () => `<h2 id="${prefix}${index++}" tabindex="-1">`)
  return { chapters, html }
}
