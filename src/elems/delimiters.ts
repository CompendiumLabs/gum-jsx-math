import { make_measure, make_fragment, make_size, make_point, place_fragment, make_request } from '@gum-jsx/core'
import type { Element, FontProvider, LayoutQuery, MathContext, MathClass, Length, Fragment } from '@gum-jsx/core'
import { resolve_length, resolve_style } from '@gum-jsx/core'
import { MathElement } from './base'
import { MathSpan } from './glyphs'
import { prepare_items, measure_items, assemble_row } from './composition'
import { math_children } from './operands'
import { math_context, math_font_size, math_metrics, atom_metrics, math_axis, finish_math, MATH_AXIS } from '../metrics'
import { MathError } from '../errors'
import type { MathAtomProps } from '../types'
import symbols from '../symbols'

const FACES = ['KaTeX_Main', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4']
const PAIRS = { round: ['(', ')'], square: ['[', ']'], curly: ['\\{', '\\}'], angle: ['\\langle', '\\rangle'] } as const
const ANGLES: Record<string, string> = { '<': '⟨', '>': '⟩', '\\lt': '⟨', '\\gt': '⟩' }
const SIZE_HEIGHT = [0, 1.2, 1.8, 2.4, 3]

function stretch_glyph(fragment: Fragment, scale_x: number, scale_y: number, font_size: number): Fragment {
  const width = atom_metrics(fragment).advance * scale_x, height = fragment.size.height * scale_y
  return make_fragment({ size: make_size(width, height),
    children: [place_fragment(fragment, make_point(), [scale_x, 0, 0, scale_y, 0, 0])],
    guides: { math_axis: height / 2, baseline: height / 2 + MATH_AXIS * font_size },
    math: math_metrics(width, atom_metrics(fragment).left) })
}

// Coverage is checked before measuring a face. In particular, vertical bars
// and arrows have no glyph in several Size fonts; never accept .notdef there.
function fit_glyph(query: LayoutQuery, math: MathContext, text: string, target: number,
  klass: MathClass = 'mord', vertical = false): Fragment {
  const value = ANGLES[text] ?? symbols.math[text]?.replace ?? text
  const sources = query.prepare(`stretch-glyph:${value}:${klass}`, () => {
    const fonts = query.resource<FontProvider>('fonts')
    return FACES.filter(face => fonts.resolve(face, 400, 'normal').has_glyphs(value)).map(face => ({
      face, source: new MathSpan({ children: value, font_family: face, center: true, klass }),
    }))
  })
  const f = math_font_size(query, math), text_math = { ...math, style: 'text' as const }
  let largest: Fragment | undefined
  for (const { source, face } of sources) {
    const styles = face === 'KaTeX_Main'
      ? [...new Set([math.style, ...(math.style.startsWith('scriptscript') ? ['script' as const] : []), 'text' as const])]
      : ['text' as const]
    for (const style of styles) {
      const fragment = query.child(source, make_request(), {}, 0, { math: { ...text_math, style }, style: query.style, coordinates: null })
      if (!largest || fragment.size.height > largest.size.height) largest = fragment
      if (fragment.size.height >= target) {
        return stretch_glyph(fragment, 1, 1, f)
      }
    }
  }
  if (!largest || largest.size.height <= 0) throw new MathError('glyph', `No math font contains delimiter '${text}'`)
  const scale = Math.max(1, target / largest.size.height)
  return stretch_glyph(largest, vertical ? 1 : scale, scale, f)
}

function delimiter(query: LayoutQuery, math: MathContext, text: string | null, target: number, klass: MathClass): Fragment {
  if (text !== null && text !== '' && text !== '.') {
    const value = symbols.math[text]?.replace ?? text
    return fit_glyph(query, math, text, target, klass, ['|', '‖', '∣', '∥'].includes(value))
  }
  const width = text === '.' ? 0.12 * query.style.font_size : 0
  return make_fragment({ size: make_size(width, 0), guides: { math_axis: 0, baseline: MATH_AXIS * math_font_size(query, math) },
    math: math_metrics(width, klass) })
}

type DelimiterProps = MathAtomProps & Readonly<{ text: string; level: number }>
class SizedDelimiter extends MathElement<DelimiterProps> {
  static layout(props: DelimiterProps, query: LayoutQuery) {
    if (!Number.isInteger(props.level) || props.level < 1 || props.level > 4) throw new RangeError('Delimiter level must be 1–4')
    const math = math_context(props, query), text_math = { ...math, style: 'text' as const }
    const target = (SIZE_HEIGHT[props.level] - 0.01) * math_font_size(query, text_math)
    return finish_math(delimiter(query, text_math, props.text === '.' ? null : props.text, target, props.klass ?? 'mord'), query)
  }
}

const middle_types = new WeakSet<Element['type']>()
class Middle extends MathElement<MathAtomProps & Readonly<{ text: string }>> {
  constructor(props: MathAtomProps & Readonly<{ text: string }>) { super(props); middle_types.add(this.type) }
  static layout(): Fragment { throw new MathError('unsupported', 'A middle delimiter must belong to a Bracket body') }
}
function is_middle(element: Element): element is Middle { return middle_types.has(element.type) }

type BracketProps = MathAtomProps & Readonly<{
  delim?: keyof typeof PAIRS; left_delim?: string | null; right_delim?: string | null
  middle?: string | readonly string[]; delimiter_height?: Length; level?: number; right_color?: string
}>
class Bracket extends MathElement<BracketProps> {
  static layout(props: BracketProps, query: LayoutQuery) {
    const math = math_context(props, query), f = math_font_size(query, math)
    const measure = make_measure(query.measure, { font_size: f })
    const pair = PAIRS[props.delim ?? 'round']
    if (!pair) throw new TypeError('Unknown delimiter pair')
    const left = props.left_delim === undefined ? pair[0] : props.left_delim
    const right = props.right_delim === undefined ? pair[1] : props.right_delim
    const content = query.prepare('bracket-content', () => {
      if (props.middle === undefined) return props.children
      const middles = typeof props.middle === 'string' ? [props.middle] : props.middle
      const runs = math_children(props.children)
      if (runs.length !== middles.length + 1) throw new TypeError('Bracket needs one body run on each side of every middle delimiter')
      return runs.flatMap((run, i) => i === 0 ? [run] : [new Middle({ text: middles[i - 1] }), run])
    })
    const items = prepare_items({ children: content }, query, math, true)
    const measured = measure_items(items.filter(({ element }) => !is_middle(element)), query)
    const extent = Math.max(0, ...measured.flatMap(({ fragment, axis }) => [axis, fragment.size.height - axis]))
    if (props.level !== undefined && (!Number.isInteger(props.level) || props.level < 1 || props.level > 4)) {
      throw new RangeError('Delimiter level must be 1–4')
    }
    if (props.level !== undefined && props.delimiter_height !== undefined) throw new TypeError('Use level or delimiter_height, not both')
    const target = props.level !== undefined ? (SIZE_HEIGHT[props.level] - 0.01) * math_font_size(query, { ...math, style: 'text' })
      : props.delimiter_height === undefined
      ? Math.max(2 * 0.901 * extent, 2 * extent - 0.5 * query.style.font_size)
      : resolve_length(props.delimiter_height, measure, query.measure.reference.height, 'delimiter_height')
    if (target < 0) throw new RangeError('Delimiter height must be nonnegative')
    let index = 0
    const body = items.map(item => {
      if (!is_middle(item.element)) return measured[index++]
      const style = resolve_style(item.element.props, item.style, query.measure)
      const middle_query = { ...query, style, measure: make_measure(query.measure, { font_size: style.font_size }) }
      const fragment = delimiter(middle_query, item.math, item.element.props.text, target, 'none')
      const font_size = math_font_size(middle_query, item.math)
      return { fragment, axis: math_axis(fragment, font_size), font_size, math: item.math }
    })
    const fence = (text: string | null, klass: MathClass, color?: string) => {
      const q = color === undefined ? query : { ...query, style: resolve_style({ color }, query.style, query.measure) }
      const fragment = delimiter(q, math, text, target, klass)
      return { fragment, axis: math_axis(fragment, f), font_size: f, math }
    }
    return assemble_row({ ...props, klass: props.klass ?? 'minner' }, query, math,
      [fence(left, 'mopen'), ...body, fence(right, 'mclose', props.right_color)], true)
  }
}

export { Bracket, SizedDelimiter, Middle, fit_glyph, delimiter }
export type { BracketProps }

// Generated prop registrations; run the workspace props:generate command.
import { register_props } from '@gum-jsx/core'
import { prop_schemas } from '../prop-schemas'
register_props(SizedDelimiter, prop_schemas.SizedDelimiter)
register_props(Middle, prop_schemas.Middle)
register_props(Bracket, prop_schemas.Bracket)
