import { make_measure, Element, Text, Span, LayoutError, make_request, make_size, make_point, make_fragment,
  place_fragment, resolve_style, definite_reference, layout_content, resolve_insets,
  resolve_alignment, resolve_length, em } from 'gum-jsx-core'
import type { Child, LayoutQuery, MathContext, MathMetrics, MathSizeStyle, Fragment, Style, Length, InsetSpec,
  Alignment, ElementType, FontProvider } from 'gum-jsx-core'
import { MathElement } from './base'
import { MathSymbol } from './glyphs'
import { MathSpacer, MathRule } from './space'
import { MathOp } from './operators'
import { SupSub } from './scripts'
import { Frac } from './fraction'
import { Sqrt } from './radical'
import { Bracket, SizedDelimiter, Middle } from './delimiters'
import { TextMode } from './text'
import { MathArray } from './array'
import { Accent, Overline, Underline, HorizBrace, XArrow } from './decorations'
import { Phantom, Smash, Lap, Enclose, RaiseBox, VCenter, Pmb } from './boxes'
import { style_size } from '../styles'
import { math_context, math_font_size, math_metrics, atom_metrics, math_axis,
  finish_math, place_math, MATH_AXIS } from '../metrics'
import { is_atom, cancel_binary_atoms, atom_spacing } from '../spacing'
import { parse_math } from '../parse'
import type { MathSyntax, ParseOptions } from '../parse'
import { MathError } from '../errors'
import type { MathAtomProps, SourceRange } from '../types'

type MathRowProps = MathAtomProps & Readonly<{ strut?: boolean }>
type MathTextProps = MathRowProps & Readonly<{
  inline?: boolean; macros?: ParseOptions['macros']; warnings?: ParseOptions['warnings']
  on_error?: 'throw' | 'render'
}>
type MathChoiceProps = Omit<MathAtomProps, 'children'> & Readonly<{
  children: readonly [Child, Child, Child, Child]
}>
type MathColProps = MathAtomProps & Readonly<{ gap?: Length; justify?: Alignment; axis?: Length }>
type MathBoxProps = MathAtomProps & Readonly<{ padding?: InsetSpec; align?: Alignment }>
type Item = Readonly<{ element: Element; style: Style; math: MathContext }>
type MeasuredItem = Readonly<{ fragment: Fragment; axis: number; font_size: number; math: MathContext }>

function syntax_elements(nodes: readonly MathSyntax[], source: string): Element[] {
  return nodes.map(node => {
    const attr = { color: node.color, font_family: node.font_family }
    switch (node.kind) {
      case 'symbol': return new MathSymbol({ ...attr, children: node.text, mode: node.mode,
        klass: node.klass, source, source_range: node.range })
      case 'literal': return new TextMode({ ...attr, children: node.text })
      case 'text': {
        const children = (nodes: readonly MathSyntax[]): Child[] => nodes.flatMap(child => child.kind === 'text'
          ? children(child.body) : [child.kind === 'literal'
            ? new Span({ color: child.color, font_family: child.font_family, children: child.text })
            : syntax_elements([child], source)[0]])
        return new TextMode({ ...attr, children: children(node.body) })
      }
      case 'operator': return new MathOp({ ...attr, symbol: node.symbol, limits: node.limits,
        center: node.center,
        children: node.body ? syntax_operand(node.body, source) : node.text, source, source_range: node.range })
      case 'space': return new MathSpacer({ ...attr, dimension: node.dimension })
      case 'group': return new MathRow({ ...attr, klass: node.klass,
        children: new MathText({ children: syntax_elements(node.body, source) }) })
      case 'scripts': return new SupSub({ ...attr, children: syntax_operand(node.base, source),
        sup: node.sup && syntax_operand(node.sup, source), sub: node.sub && syntax_operand(node.sub, source) })
      case 'fraction': return new Frac({ ...attr, children: [syntax_operand(node.numerator, source), syntax_operand(node.denominator, source)],
        has_bar: node.has_bar, bar_size: node.bar_size, continued: node.continued,
        left_delim: node.left_delim, right_delim: node.right_delim })
      case 'root': return new Sqrt({ ...attr, children: syntax_operand(node.body, source),
        index: node.index && syntax_operand(node.index, source) })
      case 'accent': return new Accent({ ...attr, children: syntax_operand(node.body, source), accent: node.label,
        under: node.under, stretchy: node.stretchy, shifty: node.shifty, mode: node.mode })
      case 'line': return new (node.over ? Overline : Underline)({ ...attr, children: syntax_operand(node.body, source) })
      case 'brace': return new HorizBrace({ ...attr, children: syntax_operand(node.body, source),
        label: node.label && syntax_operand(node.label, source), over: node.over, bracket: node.bracket })
      case 'arrow': return new XArrow({ ...attr, label: node.label, children: syntax_operand(node.above, source),
        below: node.below && syntax_operand(node.below, source) })
      case 'phantom': return new Phantom({ ...attr, children: syntax_operand(node.body, source), horizontal: node.horizontal, vertical: node.vertical })
      case 'smash': return new Smash({ ...attr, children: syntax_operand(node.body, source), top: node.top, bottom: node.bottom })
      case 'lap': return new Lap({ ...attr, children: syntax_operand(node.body, source), align: node.align })
      case 'enclose': return new Enclose({ ...attr, children: syntax_operand(node.body, source), notation: node.notation,
        background: node.background, border_color: node.border_color })
      case 'raise': return new RaiseBox({ ...attr, children: syntax_operand(node.body, source), shift_dimension: node.shift })
      case 'vcenter': return new VCenter({ ...attr, children: syntax_operand(node.body, source) })
      case 'pmb': return new Pmb({ ...attr, children: syntax_operand(node.body, source), klass: node.klass })
      case 'rule': return new MathRule({ ...attr, klass: 'mord', width_dimension: node.width, height_dimension: node.height, shift_dimension: node.shift })
      case 'verb': return new TextMode({ ...attr, children: node.text, family: 'mono', bold: false, italic: false, style: 'text' })
      case 'array': return new MathArray({ ...attr, children: node.rows.map(row => row.map(cell => syntax_operand(cell, source))),
        cols: node.cols, stretch: node.stretch, jot: node.jot, outer: node.outer, small: node.small,
        row_gap_dimensions: node.rowgaps, hlines: node.hlines })
      case 'bracket': return new Bracket({ ...attr, children: syntax_elements(node.body, source),
        left_delim: node.left, right_delim: node.right, right_color: node.right_color })
      case 'delimiter': return new SizedDelimiter({ ...attr, text: node.text, level: node.level, klass: node.klass })
      case 'middle': return new Middle({ ...attr, text: node.text })
      case 'scope': return new MathText({ ...attr, children: syntax_elements(node.body, source), style: node.style, size_index: node.size_index })
      case 'choice': return new MathText({ ...attr, children: new MathChoice({ children: [
        syntax_elements(node.choices.display, source), syntax_elements(node.choices.text, source),
        syntax_elements(node.choices.script, source), syntax_elements(node.choices.scriptscript, source),
      ] }) })
      case 'unsupported': return new UnsupportedMath({ node: node.node, source, range: node.range })
    }
  })
}

class UnsupportedMath extends MathElement<MathAtomProps & { node: string; source: string; range?: SourceRange }> {
  static layout(props: { node: string; source: string; range?: SourceRange }): Fragment {
    throw new MathError('unsupported', `Unsupported TeX node '${props.node}'`, props.source, props.range, props.node)
  }
}

// TeX treats a braced single character as a character nucleus for scripts.
// Strip only that operand wrapper, preserving the group's atom classification.
function syntax_operand(nodes: readonly MathSyntax[], source: string): Element {
  if (nodes.length === 1) {
    const node = nodes[0]
    if (node.kind === 'group') {
      let inner = node
      while (inner.body.length === 1 && inner.body[0].kind === 'group') inner = inner.body[0]
      if (inner.body.length === 1 && inner.body[0].kind === 'symbol') {
        return syntax_elements([{ ...inner.body[0], klass: node.klass }], source)[0]
      }
      if (inner.body.length === 1 && inner.body[0].kind === 'literal' && [...inner.body[0].text].length === 1) {
        const leaf = inner.body[0]
        return new MathSymbol({ children: leaf.text, mode: 'text', font_family: leaf.font_family, color: leaf.color, klass: node.klass })
      }
    }
    if (node.kind === 'literal' && [...node.text].length === 1) return new MathSymbol({ children: node.text, mode: 'text',
      font_family: node.font_family, color: node.color })
    return syntax_elements(nodes, source)[0]
  }
  return new MathText({ children: syntax_elements(nodes, source) })
}

function choice_child(props: MathChoiceProps, math: MathContext): Child {
  const children = props.children
  if (!Array.isArray(children) || children.length !== 4) throw new TypeError('MathChoice expects four children')
  const index: Record<MathSizeStyle, number> = { display: 0, text: 1, script: 2, scriptscript: 3 }
  return children[index[style_size(math.style)]]
}

class MathChoice extends MathElement<MathChoiceProps> {
  static layout(props: MathChoiceProps, query: LayoutQuery) {
    const math = math_context(props, query)
    return row_layout({ ...props, children: choice_child(props, math) }, query, true)
  }
}

// MathText is a source sequence. A sized, reclassified, or strutted MathText is
// an atom, as are MathRow and MathBox. Flatten source descriptions before any
// measurement; cached fragments and their classes are never spliced or edited.
const ATOM_PROPS = ['width', 'height', 'min_width', 'max_width', 'min_height', 'max_height',
  'aspect', 'klass', 'left', 'right'] as const
const sequence_layouts = new WeakSet<ElementType['layout']>()
function is_sequence(element: Element): element is Element<MathTextProps> {
  const props = element.props as MathTextProps
  return sequence_layouts.has(element.type.layout) && !props.strut && !props.fit && props.on_error !== 'render'
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
        if (sequences) collect(elements, style, math, options)
        else result.push({ element: new MathText({ children: elements }), style, math })
        return
      }
      if (!(child instanceof Element)) throw new TypeError('Expected a math child')
      if (sequences && child instanceof MathChoice) {
        const nested_math = math_context(child.props, { ...query, math })
        collect(choice_child(child.props, nested_math), resolve_style(child.props, style, query.measure), nested_math, options)
      } else if (sequences && is_sequence(child)) {
        const nested = child.props
        const nested_math = math_context(nested, { ...query, math })
        collect(nested.children, resolve_style(nested, style, query.measure), nested_math, {
          ...options, display: nested_math.style.startsWith('display'),
          macros: nested.macros ?? options.macros, warnings: nested.warnings ?? options.warnings,
        })
      } else result.push({ element: child, style, math })
    }
    collect(props.children, query.style, context, {
      display: context.style.startsWith('display'), macros: props.macros, warnings: props.warnings,
    })
    return Object.freeze(result.map(item => Object.freeze(item)))
  })
}

function measure_items(items: readonly Item[], query: LayoutQuery) {
  const reference = definite_reference(query.request, query.sizing)
  return items.map(({ element, style, math }, index) => {
    const fragment = query.child(element, make_request(), reference, index, { style, math, coordinates: null })
    const child_style = resolve_style(element.props, style, query.measure)
    const font_size = math_font_size({ ...query, style: child_style }, math_context(element.props, { ...query, math }))
    // Ordinary text retains its own font size in a math operand. Its first
    // baseline implies an axis using that font, regardless of the TeX style.
    return { fragment, font_size, axis: math_axis(fragment, fragment.math ? font_size : child_style.font_size), math }
  })
}

function row_layout(props: MathTextProps, query: LayoutQuery, spaced: boolean) {
  const context = math_context(props, query, props.inline === false ? 'display' : 'text')
  const measured = measure_items(prepare_items(props, query, context, spaced), query)
  return assemble_row(props, query, context, measured, spaced)
}

function assemble_row(props: MathTextProps, query: LayoutQuery, context: MathContext, measured: readonly MeasuredItem[], spaced: boolean,
  align_baselines = spaced) {
  const font_size = math_font_size(query, context)
  const metrics = measured.map(({ fragment }) => atom_metrics(fragment))
  const effective = spaced ? cancel_binary_atoms(metrics) : metrics
  let advance = 0, previous: MathMetrics | undefined
  const placements = measured.map(({ fragment, axis, font_size: child_font_size, math }, index) => {
    const atom = effective[index]
    if (spaced && is_atom(atom)) {
      if (previous) advance += atom_spacing(previous.right, atom.left, math.style.includes('script')) * child_font_size
      previous = atom
    }
    const x = advance
    // A glyph's font advance and italic correction stay independently available
    // for scripts. Ordinary rows consume both; compound atoms clear correction.
    advance += atom.advance + atom.italic
    // TeX atoms preserve baselines across local style/size declarations.
    // Foreign Gum operands honor their own axis; TextMode instead aligns all
    // its children as literal prose, without inserting inter-atom glue.
    return align_baselines && (fragment.math || !spaced)
      ? { fragment, x, axis: fragment.guides.baseline ?? axis + MATH_AXIS * child_font_size,
      y: MATH_AXIS * font_size } : { fragment, x, axis }
  })
  const atoms = effective.filter(is_atom)
  const left = props.left ?? props.klass ?? (spaced ? atoms[0]?.left ?? 'none' : 'mord')
  const right = props.right ?? props.left ?? props.klass ?? (spaced ? atoms.at(-1)?.right ?? 'none' : 'mord')
  const result = place_math(placements, advance, font_size, math_metrics(advance, left, { right }), props.strut)
  const source = props.children
  const label = typeof source === 'string' ? source
    : Array.isArray(source) && source.length === 1 && typeof source[0] === 'string' ? source[0] : undefined
  return finish_math({ ...result, ...(label === undefined ? {} : { label }) }, query)
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
      const child = query.child(new Text({ children: `[math ${message}]`, color: '#b42318',
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
    const measure = make_measure(query.measure, { font_size })
    const items = measure_items(prepare_items(props, query, context, false), query)
    const gap = resolve_length(props.gap ?? em(0), measure, query.measure.reference.height, 'gap')
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
      : resolve_length(props.axis, measure, height, 'axis')
    return finish_math({ size: make_size(width, height), children,
      guides: { math_axis: axis, baseline: axis + MATH_AXIS * font_size },
      math: math_metrics(width, props.left ?? props.klass, { right: props.right ?? props.left ?? props.klass ?? 'mord' }),
    }, query)
  }
}

class MathBox extends MathElement<MathBoxProps> {
  static layout(props: MathBoxProps, query: LayoutQuery) {
    const math = math_context(props, query), font_size = math_font_size(query, math)
    const measure = make_measure(query.measure, { font_size })
    const items = prepare_items(props, query, math, false)
    if (items.length > 1) throw new TypeError('MathBox expects one content element or TeX string')
    const child_query: LayoutQuery = { ...query, math,
      child: (child, offer, reference, index, context) =>
        query.child(child, offer, reference, index, { math, coordinates: null, ...context }) }
    const insets = resolve_insets(props.padding, measure)
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

export { MathRow, MathText, MathChoice, MathCol, MathBox, Latex, Tex, syntax_operand, prepare_items, measure_items, assemble_row }
export type { MathRowProps, MathTextProps, MathChoiceProps, MathColProps, MathBoxProps }
