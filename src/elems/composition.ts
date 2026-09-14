import { Element, Text, LayoutError, make_request, make_size, make_point, make_fragment,
  place_fragment, resolve_style, definite_reference, layout_content, resolve_insets,
  resolve_alignment, resolve_length, em } from 'gum-next-core'
import type { Child, LayoutQuery, MathContext, MathMetrics, Style, Length, InsetSpec,
  Alignment, ElementType, FontProvider } from 'gum-next-core'
import { MathElement } from './base'
import { MathSpan, MathSymbol } from './glyphs'
import { MathSpacer } from './space'
import { math_context, math_font_size, math_metrics, atom_metrics, math_axis,
  finish_math, place_math, MATH_AXIS } from '../metrics'
import { is_atom, cancel_binary_atoms, atom_spacing } from '../spacing'
import { parse_math } from '../parse'
import type { MathSyntax, ParseOptions } from '../parse'
import { MathError } from '../errors'
import type { MathAtomProps } from '../types'

type MathRowProps = MathAtomProps & Readonly<{ strut?: boolean }>
type MathTextProps = MathRowProps & Readonly<{
  text?: string; inline?: boolean; macros?: ParseOptions['macros']; warnings?: ParseOptions['warnings']
  on_error?: 'throw' | 'render'
}>
type MathColProps = MathAtomProps & Readonly<{ gap?: Length; justify?: Alignment; axis?: Length }>
type MathBoxProps = MathAtomProps & Readonly<{ padding?: InsetSpec; align?: Alignment }>
type Item = Readonly<{ element: Element; style: Style; math: MathContext }>

function syntax_elements(nodes: readonly MathSyntax[], source: string): Element[] {
  return nodes.map(node => {
    const attr = { color: node.color, font_family: node.font_family }
    switch (node.kind) {
      case 'symbol': return new MathSymbol({ ...attr, text: node.text, mode: node.mode,
        klass: node.klass, source, source_range: node.range })
      case 'operator': return new MathSpan({ ...attr, font_family: node.font_family ?? 'KaTeX_Main',
        text: node.text, klass: 'mop', source, source_range: node.range })
      case 'space': return new MathSpacer({ advance: em(node.advance) })
      case 'group': return new MathRow({ ...attr, klass: node.klass,
        children: new MathText({ children: syntax_elements(node.body, source) }) })
    }
  })
}

function source_children(props: MathTextProps): Child {
  if (props.text !== undefined && props.children !== undefined) throw new TypeError('Use text or children, not both')
  return props.text ?? props.children
}

// MathText is a source sequence. A sized, reclassified, or strutted MathText is
// an atom, as are MathRow and MathBox. Flatten source descriptions before any
// measurement; cached fragments and their classes are never spliced or edited.
const ATOM_PROPS = ['width', 'height', 'min_width', 'max_width', 'min_height', 'max_height',
  'aspect', 'klass', 'left', 'right'] as const
const sequence_layouts = new WeakSet<ElementType['layout']>()
function is_sequence(element: Element): element is Element<MathTextProps> {
  const props = element.props as MathTextProps
  return sequence_layouts.has(element.type.layout) && !props.strut && props.on_error !== 'render'
    && ATOM_PROPS.every(key => props[key] === undefined)
}

function prepare_items(props: MathTextProps, query: LayoutQuery, context: MathContext,
  sequences: boolean): readonly Item[] {
  return query.prepare(sequences ? 'math-sequence' : 'math-items', () => {
    const result: Item[] = []
    function collect(child: Child, style: Style, math: MathContext, options: ParseOptions) {
      if (child == null || typeof child === 'boolean') return
      if (Array.isArray(child)) { child.forEach(item => collect(item, style, math, options)); return }
      if (typeof child === 'string' || typeof child === 'number') {
        const source = String(child)
        const elements = syntax_elements(parse_math(source, options), source)
        if (sequences) elements.forEach(element => result.push({ element, style, math }))
        else result.push({ element: new MathText({ children: elements }), style, math })
        return
      }
      if (!(child instanceof Element)) throw new TypeError('Expected a math child')
      if (sequences && is_sequence(child)) {
        const nested = child.props
        const nested_math = { ...math, style: nested.style ?? math.style }
        collect(source_children(nested), resolve_style(nested, style), nested_math, {
          ...options, display: nested_math.style.startsWith('display'),
          macros: nested.macros ?? options.macros, warnings: nested.warnings ?? options.warnings,
        })
      } else result.push({ element: child, style, math })
    }
    collect(source_children(props), query.style, context, {
      display: context.style.startsWith('display'), macros: props.macros, warnings: props.warnings,
    })
    return Object.freeze(result.map(item => Object.freeze(item)))
  })
}

function measure_items(items: readonly Item[], query: LayoutQuery) {
  const reference = definite_reference(query.request, query.sizing)
  return items.map(({ element, style, math }, index) => {
    const fragment = query.child(element, make_request(), reference, index, { style, math, coordinates: null })
    const font_size = math_font_size({ ...query, style: resolve_style(element.props, style) }, math)
    return { fragment, font_size, axis: math_axis(fragment, font_size), math }
  })
}

function row_layout(props: MathTextProps, query: LayoutQuery, spaced: boolean) {
  const context = math_context(props, query, props.inline === false ? 'display' : 'text')
  const font_size = math_font_size(query, context)
  const measured = measure_items(prepare_items(props, query, context, spaced), query)
  const metrics = measured.map(({ fragment }) => atom_metrics(fragment))
  const effective = spaced ? cancel_binary_atoms(metrics) : metrics
  let advance = 0, previous: MathMetrics | undefined
  const placements = measured.map(({ fragment, axis, font_size, math }, index) => {
    const atom = effective[index]
    if (spaced && is_atom(atom)) {
      if (previous) advance += atom_spacing(previous.right, atom.left, math.style.includes('script')) * font_size
      previous = atom
    }
    const x = advance
    // A glyph's font advance and italic correction stay independently available
    // for scripts. Ordinary rows consume both; compound atoms clear correction.
    advance += atom.advance + atom.italic
    return { fragment, x, axis }
  })
  const atoms = effective.filter(is_atom)
  const left = props.left ?? props.klass ?? (spaced ? atoms[0]?.left ?? 'none' : 'mord')
  const right = props.right ?? props.left ?? props.klass ?? (spaced ? atoms.at(-1)?.right ?? 'none' : 'mord')
  const result = place_math(placements, advance, font_size, math_metrics(advance, left, { right }), props.strut)
  return finish_math({ ...result, ...(props.text === undefined ? {} : { label: props.text }) }, query)
}

class MathRow extends MathElement<MathRowProps> {
  static layout(props: MathRowProps, query: LayoutQuery) { return row_layout(props, query, false) }
}

class MathText extends MathElement<MathTextProps> {
  constructor(props: MathTextProps = {}) {
    super(props)
    // Tag the immutable source protocol, not its prototype. define_component
    // adopts this layout identity, so a named sequence keeps its semantics.
    if (new.target.layout === MathText.layout) sequence_layouts.add(this.type.layout)
  }

  static layout(props: MathTextProps, query: LayoutQuery) {
    if (props.on_error !== undefined && !['throw', 'render'].includes(props.on_error)) {
      throw new TypeError('on_error must be throw or render')
    }
    try { return row_layout(props, query, true) }
    catch (error) {
      let cause = error
      while (cause instanceof LayoutError) cause = cause.cause
      if (props.on_error !== 'render' || !(cause instanceof MathError)) throw error
      // Only documented formula failures become visible diagnostics. Missing
      // resources and programming errors still reach the host for correction.
      const font = query.resource<FontProvider>('fonts').resolve('IBM Plex Mono',
        query.style.font_weight, query.style.font_style)
      const message = [...cause.message].map(char => char === '\n' || font.has_glyphs(char)
        ? char : `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`).join('')
      const child = query.child(new Text({ text: `[math ${message}]`, color: '#b42318',
        font_family: 'IBM Plex Mono' }), make_request(), {}, 0, { math: null })
      return finish_math({ ...child, math: math_metrics(child.size.width), label: cause.message }, query)
    }
  }
}

class Latex extends MathText {
  static normalize(props: MathTextProps) {
    return { ...props, inline: props.inline ?? false, strut: props.strut ?? true }
  }
}

class Tex extends MathText {
  static normalize(props: MathTextProps) {
    return { ...props, inline: props.inline ?? true, strut: props.strut ?? true }
  }
}

class MathCol extends MathElement<MathColProps> {
  static layout(props: MathColProps, query: LayoutQuery) {
    const context = math_context(props, query), font_size = math_font_size(query, context)
    const items = measure_items(prepare_items(props, query, context, false), query)
    const gap = resolve_length(props.gap ?? em(0), { font_size, fraction: query.reference.height }, 'MathCol.gap')
    if (gap < 0) throw new RangeError('MathCol.gap must be nonnegative')
    const align = resolve_alignment(props.justify ?? 'center')
    if (typeof align.x !== 'number') throw new TypeError('MathCol.justify must be start, center, end, or a fraction')
    const width = Math.max(0, ...items.map(({ fragment }) => fragment.size.width))
    const height = items.reduce((total, { fragment }) => total + fragment.size.height, 0)
      + Math.max(0, items.length - 1) * gap
    let y = 0
    const children = items.map(({ fragment }) => {
      const placement = place_fragment(fragment, make_point((width - fragment.size.width) * (align.x as number), y))
      y += fragment.size.height + gap
      return placement
    })
    const axis = props.axis === undefined ? height / 2
      : resolve_length(props.axis, { font_size, fraction: height }, 'MathCol.axis')
    return finish_math({ size: make_size(width, height), children,
      guides: { math_axis: axis, baseline: axis + MATH_AXIS * font_size },
      math: math_metrics(width, props.left ?? props.klass, { right: props.right ?? props.left ?? props.klass ?? 'mord' }),
    }, query)
  }
}

class MathBox extends MathElement<MathBoxProps> {
  static layout(props: MathBoxProps, query: LayoutQuery) {
    const math = math_context(props, query), font_size = math_font_size(query, math)
    const items = prepare_items(props, query, math, false)
    if (items.length > 1) throw new TypeError('MathBox expects one content element or TeX string')
    const child_query: LayoutQuery = { ...query, math,
      child: (child, offer, reference, index, context) =>
        query.child(child, offer, reference, index, { math, coordinates: null, ...context }) }
    const insets = resolve_insets(props.padding, { font_size, reference: query.reference, path: query.path })
    const { placement, ...layout } = layout_content(items[0]?.element, child_query, insets, props.align)
    const axis = layout.guides.math_axis ?? (layout.guides.baseline === undefined
      ? layout.size.height / 2 : layout.guides.baseline - MATH_AXIS * font_size)
    return make_fragment({ ...layout, children: placement ? [placement] : [],
      guides: { ...layout.guides, math_axis: axis, baseline: layout.guides.baseline ?? axis + MATH_AXIS * font_size },
      math: math_metrics(layout.size.width, props.left ?? props.klass,
        { right: props.right ?? props.left ?? props.klass ?? 'mord' }),
    })
  }
}

export { MathRow, MathText, MathCol, MathBox, Latex, Tex }
export type { MathRowProps, MathTextProps, MathColProps, MathBoxProps }
