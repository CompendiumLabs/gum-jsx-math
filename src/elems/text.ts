import { Element, Span, make_fragment, resolve_style } from 'gum-jsx-core'
import type { Child, LayoutQuery, Style, FontProvider } from 'gum-jsx-core'
import { MathElement, literal_text } from './base'
import { glyph_layout } from './glyphs'
import type { MathSpanProps } from './glyphs'
import { assemble_row, measure_items } from './composition'
import type { MathRowProps } from './composition'
import { math_context } from '../metrics'
import { text_font_face } from '../text-fonts'
import symbols from '../symbols'

type TextModeProps = MathRowProps & Readonly<{
  family?: 'main' | 'sans' | 'mono'; bold?: boolean; italic?: boolean
}>
type Run = { text?: string; element?: Element; style: Style }

function text_face(props: TextModeProps, style: Style): string {
  const match = /^KaTeX_(Main|SansSerif|Typewriter)(?:-(Bold|Italic|BoldItalic))?$/.exec(style.font_family)
  if (props.family !== undefined && !['main', 'sans', 'mono'].includes(props.family)) throw new TypeError('Unknown text family')
  for (const key of ['bold', 'italic'] as const) {
    if (props[key] !== undefined && typeof props[key] !== 'boolean') throw new TypeError(`${key} must be boolean`)
  }
  if (props.family === undefined && props.bold === undefined && props.italic === undefined) {
    return style.font_family.startsWith('KaTeX_') ? style.font_family : 'KaTeX_Main'
  }
  const family = props.family ?? (match?.[1] === 'SansSerif' ? 'sans' : match?.[1] === 'Typewriter' ? 'mono' : 'main')
  const bold = props.bold ?? (match?.[2]?.includes('Bold') ?? false)
  const italic = props.italic ?? (match?.[2]?.includes('Italic') ?? false)
  return text_font_face({ family, bold, italic })
}

// A literal run uses the math text face only for its own glyphs. Nested math
// keeps the incoming family, context, and immutable source identity.
class LiteralRun extends MathElement<MathSpanProps> {
  static layout(props: MathSpanProps, query: LayoutQuery) {
    return glyph_layout(props, query, literal_text(props.children), props.font_family!, 'mord', 0, false)
  }
}

class TextMode extends MathElement<TextModeProps> {
  static layout(props: TextModeProps, query: LayoutQuery) {
    const context = math_context(props, query)
    const items = query.prepare('literal-math-text', () => {
      const runs: Run[] = []
      function collect(child: Child, style: Style) {
        if (child == null || typeof child === 'boolean') return
        if (Array.isArray(child)) { child.forEach(item => collect(item, style)); return }
        if (child instanceof Span) {
          collect(child.props.children, resolve_style(child.props, style, query.measure))
        } else if (child instanceof Element) runs.push({ element: child, style })
        else if (typeof child === 'string' || typeof child === 'number') {
          const text = String(child), last = runs.at(-1)
          if (!text) return
          if (last?.text !== undefined && JSON.stringify(last.style) === JSON.stringify(style)) last.text += text
          else runs.push({ text, style })
        } else throw new TypeError('Expected literal text or an inline element')
      }
      collect(props.children, query.style)
      return runs.flatMap(run => {
        // Text mode is a single horizontal math atom. Source line endings and
        // tabs are spaces, not glyphs; ordinary spaces remain uncollapsed.
        const text = run.text?.replace(/\r\n|[\r\n\t\v\f\u0085\u2028\u2029]/g, ' ')
        if (run.element) return [{ style: run.style, math: context, text, element: run.element }]
        const face = text_face(props, run.style), fonts = query.resource<FontProvider>('fonts')
        const selected = fonts.resolve(face, 400, 'normal'), pieces: { face: string; text: string }[] = []
        for (const char of text ?? '') {
          const fallback = symbols.text[char]?.font === 'ams' ? 'KaTeX_AMS' : 'KaTeX_Main'
          const chosen = selected.has_glyphs(char) ? face
            : fonts.resolve(fallback, 400, 'normal').has_glyphs(char) ? fallback : face
          const last = pieces.at(-1)
          if (last?.face === chosen) last.text += char
          else pieces.push({ face: chosen, text: char })
        }
        return pieces.map(piece => ({ style: run.style, math: context, text: piece.text,
          element: new LiteralRun({ children: piece.text, font_family: piece.face }) }))
      })
    })
    const measured = measure_items(items, query)
    const result = assemble_row(props, query, context, measured, false, true)
    const label = items.map((item, index) => item.text ?? measured[index].fragment.label ?? '\ufffc').join('')
    return make_fragment({ ...result, label })
  }
}

export { TextMode }
export type { TextModeProps }
