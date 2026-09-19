import { draw_rect, make_rect, make_size, make_fragment, make_point, place_fragment, resolve_length, theme_color } from 'gum-jsx-core'
import type { Child, Element, ElementType, Fragment, LayoutQuery, Length, MathContext } from 'gum-jsx-core'
import { MathElement } from './base'
import { MathSymbol } from './glyphs'
import { operand_source, measure_operand, advance, baseline, extent } from './operands'
import { math_context, math_font_size, atom_metrics, math_metrics, finish_math, place_math, MATH_AXIS } from '../metrics'
import type { MathPlacement } from '../metrics'
import { cramped_style, sup_style, sub_style, tex_metrics, font_scale } from '../styles'
import { stretch_fragment, stretch_entry } from '../stretch'
import type { MathAtomProps, SymbolMode } from '../types'

type MathStretchProps = MathAtomProps & Readonly<{ label?: string; thickness?: Length; head_curve?: number }>
type AccentProps = MathAtomProps & Readonly<{
  accent?: string; under?: boolean; stretchy?: boolean; shifty?: boolean; mode?: SymbolMode; head_curve?: number
}>
type LineProps = MathAtomProps & Readonly<{ thickness?: Length }>
type HorizBraceProps = LineProps & Readonly<{ label?: Child; over?: boolean; bracket?: boolean }>
type XArrowProps = MathStretchProps & Readonly<{ above?: Child; below?: Child }>

function thickness(props: LineProps, query: LayoutQuery, f: number): number | undefined {
  return props.thickness === undefined ? undefined : resolve_length(props.thickness,
    { font_size: f, fraction: query.reference.height }, 'decoration thickness')
}
function atom(props: MathAtomProps, width: number, klass: 'mord' | 'minner' | 'mrel' = 'mord') {
  return math_metrics(width, props.left ?? props.klass ?? klass, { right: props.right ?? props.left ?? props.klass ?? klass })
}

class MathStretch extends MathElement<MathStretchProps> {
  // Stretch builds its shape at the requested dimensions; explicit fit can
  // instead scale its natural shape like any other element.
  static auto_fit = false
  static layout(props: MathStretchProps, query: LayoutQuery) {
    const f = math_font_size(query, math_context(props, query)), label = props.label ?? 'overbrace'
    const width = query.request.width.kind === 'exact' ? query.request.width.value : stretch_entry(label).min_width * f
    const height = query.request.height.kind === 'exact' ? query.request.height.value : undefined
    const result = stretch_fragment(label, width, f, query, thickness(props, query, f), height, props.head_curve)
    return finish_math({ ...result, math: atom(props, result.size.width, 'mrel') }, query)
  }
}

function accent_body(props: AccentProps, query: LayoutQuery, cramped: boolean) {
  const math = math_context(props, query)
  const context = cramped ? { ...math, style: cramped_style(math.style) } : math
  const source = query.prepare('accent-body', () => operand_source(props.children, context))
  return measure_operand(source, query, context, 0)
}
// SupSub can measure a character nucleus separately from its decoration. The
// source and both fragments remain immutable; the accent still supplies ink.
class AccentNucleus extends MathElement<AccentProps> {
  static layout(props: AccentProps, query: LayoutQuery) { return finish_math(accent_body(props, query, false), query) }
}
function accent_nucleus(source: Element): Element | undefined {
  if (!accent_layouts.has(source.type.layout) || (source.props as AccentProps).under) return
  return new AccentNucleus(source.props as AccentProps)
}

const accent_layouts = new WeakSet<ElementType['layout']>()
class Accent extends MathElement<AccentProps> {
  constructor(props: AccentProps = {}) {
    super(props)
    if (new.target.layout === Accent.layout) accent_layouts.add(this.type.layout)
  }
  static layout(props: AccentProps, query: LayoutQuery) {
    const math = math_context(props, query), f = math_font_size(query, math)
    const body = accent_body(props, query, !props.under), bm = atom_metrics(body), be = extent(body, f)
    const label = (props.accent ?? 'hat').replace(/^\\/, '')
    const stretchy = props.stretchy ?? /^(wide|over|under|Over|utilde)/.test(label)
    const skew = props.shifty !== false && bm.nucleus === 'character' ? bm.skew : 0
    const full = label === 'textcircled', below = props.under || label === 'c'
    let accent: Fragment
    if (stretchy || label === 'vec') accent = stretch_fragment(label,
      stretchy ? Math.max(0, advance(body) - 2 * skew) : 0, f, query, undefined, undefined, props.head_curve)
    else {
      const source = query.prepare('accent-glyph', () => new MathSymbol({ text: `\\${label}`, mode: props.mode,
        // Accent glyphs are textords. A selected math alphabet may not contain
        // them; MathSymbol performs the same per-glyph coverage fallback.
      }))
      accent = measure_operand(source, query, math, 1)
    }
    const width = full || stretchy ? Math.max(advance(body), accent.size.width) : advance(body)
    const bx = (width - advance(body)) / 2
    let ax = full ? (width - accent.size.width) / 2 : bx + bm.advance / 2 + skew - accent.size.width / 2
    let axis = baseline(accent, f), y: number
    if (stretchy) {
      ax = (width - accent.size.width) / 2 + skew
      axis = below ? 0 : accent.size.height
      y = MATH_AXIS * f + (below ? be.depth + (label === 'utilde' ? 0.12 * f : 0) : -be.height)
    } else if (full) {
      axis = accent.size.height
      y = MATH_AXIS * f + 0.2 * f
    }
    else if (below) y = MATH_AXIS * f + be.depth
    else {
      if (label === 'vec') axis = 0.714 * f
      y = MATH_AXIS * f - Math.max(0, be.height - tex_metrics(math).x_height * f)
    }
    const result = place_math([{ fragment: body, x: bx, axis: baseline(body, f), y: MATH_AXIS * f },
      { fragment: accent, x: ax, axis, y }], width, f, atom(props, width))
    return finish_math(result, query)
  }
}

function line_layout(props: LineProps, query: LayoutQuery, over: boolean) {
  const math = math_context(props, query), f = math_font_size(query, math)
  const context = over ? { ...math, style: cramped_style(math.style) } : math
  const source = query.prepare('line-body', () => operand_source(props.children, context))
  const body = measure_operand(source, query, context, 0), width = advance(body)
  const t = thickness(props, query, f) ?? tex_metrics(math).rule * f
  if (!Number.isFinite(t) || t < 0) throw new RangeError('Decoration thickness must be nonnegative')
  const top = over ? 5 * t : 0, height = body.size.height + 5 * t
  const line = make_fragment({ name: 'DecorationRule', size: make_size(Math.max(0, width), t),
    draw: t > 0 && width > 0 ? [draw_rect(make_rect(0, 0, width, t), {
      fill: theme_color(props.fill ?? query.style.color, query.style.theme), stroke: 'none', stroke_width: 0, opacity: query.style.opacity,
    })] : [] })
  return finish_math({ size: make_size(Math.max(0, width), height), math: atom(props, width),
    guides: { baseline: baseline(body, f) + top, math_axis: baseline(body, f) + top - MATH_AXIS * f },
    children: [place_fragment(body, make_point(0, top)), place_fragment(line, make_point(0, over ? t : height - 2 * t))] }, query)
}
class Overline extends MathElement<LineProps> {
  static layout(props: LineProps, query: LayoutQuery) { return line_layout(props, query, true) }
}
class Underline extends MathElement<LineProps> {
  static layout(props: LineProps, query: LayoutQuery) { return line_layout(props, query, false) }
}

class HorizBrace extends MathElement<HorizBraceProps> {
  static layout(props: HorizBraceProps, query: LayoutQuery) {
    const math = math_context(props, query), f = math_font_size(query, math), over = props.over ?? true
    const display_context: MathContext = { ...math, style: 'display' }
    // Braced bodies use display typography even inside scripts. Preserve the
    // surrounding em while restoring display spacing, fractions, and limits.
    const base_context: MathContext = { ...display_context, size: math.size * font_scale(math) / font_scale(display_context) }
    const note_context = { ...math, style: over ? sup_style(math.style) : sub_style(math.style) }
    const sources = query.prepare('brace-operands', () => ({ body: operand_source(props.children, base_context),
      label: props.label == null || typeof props.label === 'boolean' ? undefined : operand_source(props.label, note_context) }))
    const body = measure_operand(sources.body, query, base_context, 0)
    const note = sources.label && measure_operand(sources.label, query, note_context, 1)
    const label = `${over ? 'over' : 'under'}${props.bracket ? 'bracket' : 'brace'}`
    const shape = stretch_fragment(label, advance(body), f, query, thickness(props, query, f))
    const width = Math.max(advance(body), shape.size.width, note ? advance(note) : 0), be = extent(body, f)
    const edge = MATH_AXIS * f + (over ? -be.height - 0.1 * f : be.depth + 0.1 * f)
    const items: MathPlacement[] = [
      { fragment: body, x: (width - advance(body)) / 2, axis: baseline(body, f), y: MATH_AXIS * f },
      { fragment: shape, x: (width - shape.size.width) / 2, axis: over ? shape.size.height : 0, y: edge },
    ]
    if (note) items.push({ fragment: note, x: (width - advance(note)) / 2,
      axis: over ? note.size.height : 0, y: edge + (over ? -1 : 1) * (shape.size.height + 0.2 * f) })
    return finish_math(place_math(items, width, f, atom(props, width, 'minner')), query)
  }
}

class XArrow extends MathElement<XArrowProps> {
  static layout(props: XArrowProps, query: LayoutQuery) {
    if (props.above !== undefined && props.children !== undefined) throw new TypeError('Use above or children, not both')
    const math = math_context(props, query), f = math_font_size(query, math), label = props.label ?? 'xrightarrow'
    const upper = { ...math, style: sup_style(math.style) }, lower = { ...math, style: sub_style(math.style) }
    const sources = query.prepare('arrow-labels', () => ({ above: operand_source(props.above ?? props.children, upper),
      below: props.below == null || typeof props.below === 'boolean' ? undefined : operand_source(props.below, lower) }))
    const above = measure_operand(sources.above, query, upper, 0)
    const below = sources.below && measure_operand(sources.below, query, lower, 1)
    const shape = stretch_fragment(label, Math.max(advance(above) + math_font_size(query, upper),
      below ? advance(below) + math_font_size(query, lower) : 0), f, query, thickness(props, query, f), undefined, props.head_curve)
    const width = shape.size.width, half = shape.size.height / 2, se = extent(above, math_font_size(query, upper))
    const items: MathPlacement[] = [
      { fragment: shape, x: 0, axis: half },
      { fragment: above, x: (width - advance(above)) / 2, axis: baseline(above, math_font_size(query, upper)),
        y: -half - 0.111 * f - (se.depth > 0.25 * f || label.replace(/^\\/, '') === 'xleftequilibrium' ? se.depth : 0) },
    ]
    if (below) items.push({ fragment: below, x: (width - advance(below)) / 2, axis: 0, y: half + 0.111 * f })
    return finish_math(place_math(items, width, f, atom(props, width, 'mrel')), query)
  }
}

export { Accent, AccentNucleus, accent_nucleus, MathStretch, Overline, Underline, HorizBrace, XArrow }
export type { AccentProps, MathStretchProps, LineProps, HorizBraceProps, XArrowProps }
