import { Element } from 'gum-jsx-core'
import type { Child } from 'gum-jsx-core'
import type { MathProps } from '../types'

// A source-language distinction for math containers, like core's inline Span.
// Construction still uses Element's immutable data protocol and never measures.
abstract class MathElement<Props extends MathProps = MathProps> extends Element<Props> {
  static auto_fit = true
}

function literal_text(children: Child): string {
  function text(child: Child): string {
    if (child == null || typeof child === 'boolean') return ''
    if (Array.isArray(child)) return child.map(text).join('')
    if (typeof child === 'string' || typeof child === 'number') return String(child)
    throw new TypeError('Expected literal string or number children')
  }
  return text(children)
}

export { MathElement, literal_text }
