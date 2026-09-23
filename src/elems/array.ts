import { make_measure, em, resolve_length, resolve_style, make_size, make_point, make_rect,
  make_fragment, place_fragment, draw_rect, draw_path } from '@gum-jsx/core'
import type { Child, LayoutQuery, Length, Drawing, PathCommand, Placement } from '@gum-jsx/core'
import { MathElement } from './base'
import { math_children, operand_source, measure_operand, baseline, advance } from './operands'
import { math_context, math_font_size, math_metrics, finish_math, dimension_length, MATH_AXIS } from '../metrics'
import type { MathAtomProps, MathDimension, ArrayCol, ArrayAlign } from '../types'
import type { MathStyle } from '@gum-jsx/core'

type MathArrayProps = MathAtomProps & Readonly<{
  cols?: string | readonly ArrayCol[]
  ncol?: number
  cell_style?: MathStyle
  small?: boolean
  stretch?: number
  jot?: boolean
  colsep?: Length
  outer?: boolean
  hlines?: readonly (readonly boolean[])[]
  rowgaps?: readonly (Length | null)[]
  thickness?: Length
  // The parser retains TeX units: unlike Gum em(), TeX em dimensions in a
  // script refer to the text-size font. Keep that distinction until layout.
  row_gap_dimensions?: readonly (MathDimension | null)[]
}>

const ALIGN: Record<ArrayAlign, number> = { l: 0, c: 0.5, r: 1 }

function columns(cols: MathArrayProps['cols'] = []): readonly ArrayCol[] {
  const result = typeof cols === 'string' ? [...cols.replace(/\s/g, '')].map<ArrayCol>(char => {
    if (char === '|' || char === ':') return { type: 'separator' as const, separator: char }
    return { type: 'align' as const, align: char as ArrayAlign }
  }) : cols
  for (const col of result) {
    if (col.type === 'align' && Object.hasOwn(ALIGN, col.align)) continue
    if (col.type === 'separator' && (col.separator === '|' || col.separator === ':')) continue
    throw new TypeError('MathArray.cols expects l, c, r alignments and | or : separators')
  }
  return result
}

function rows(props: MathArrayProps, cols: readonly ArrayCol[]): readonly (readonly Child[])[] {
  if (props.ncol !== undefined && (!Number.isInteger(props.ncol) || props.ncol < 1)) {
    throw new RangeError('MathArray.ncol must be a positive integer')
  }
  const children = Array.isArray(props.children) ? props.children : [props.children]
  const items = children.filter(child => child != null && typeof child !== 'boolean'
    && !(typeof child === 'string' && !child.trim()))
  // Row data preserves null/empty cells. Flat JSX follows ordinary conditional
  // child rules; an empty MathText is an explicit cell in that form.
  if (items.length && items.every(Array.isArray)) return items as readonly (readonly Child[])[]
  const flat = math_children(props.children)
  const ncol = props.ncol ?? Math.max(1, cols.filter(col => col.type === 'align').length)
  return Array.from({ length: Math.ceil(flat.length / ncol) }, (_, r) => flat.slice(r * ncol, (r + 1) * ncol))
}

// Filled rectangles give rules exact ink bounds, including square intersections.
// Dashed rules end on a dash at both ends, independently of rasterizer stroke
// bounds or CSS dash heuristics.
function array_rule(x: number, y: number, width: number, height: number, dashed: boolean,
  horizontal: boolean, font_size: number, fill: string, opacity: number): Drawing | undefined {
  if (width <= 0 || height <= 0) return
  const paint = { fill, stroke: 'none', stroke_width: 0, opacity }
  const bounds = make_rect(x, y, width, height)
  if (!dashed) return draw_rect(bounds, paint)
  const span = horizontal ? width : height
  const count = Math.max(1, Math.round(span / (2 * (0.08 * font_size || 2 * Math.min(width, height)))))
  const dash = span / (2 * count - 1), commands: PathCommand[] = []
  for (let i = 0; i < count; i++) {
    const x0 = x + (horizontal ? 2 * i * dash : 0), y0 = y + (horizontal ? 0 : 2 * i * dash)
    const x1 = x0 + (horizontal ? dash : width), y1 = y0 + (horizontal ? height : dash)
    commands.push({ kind: 'M', x: x0, y: y0 }, { kind: 'L', x: x1, y: y0 },
      { kind: 'L', x: x1, y: y1 }, { kind: 'L', x: x0, y: y1 }, { kind: 'Z' })
  }
  return draw_path(commands, paint, bounds)
}

class MathArray extends MathElement<MathArrayProps> {
  static layout(props: MathArrayProps, query: LayoutQuery) {
    const math = math_context(props, query), f = math_font_size(query, math)
    const measure = make_measure(query.measure, { font_size: f })
    const cell_math = { ...math, style: props.cell_style ?? (props.small ? 'script' : math.style) }
    const prepared = query.prepare('array-cells', () => {
      const cols = columns(props.cols)
      return { cols, rows: rows(props, cols).map(row => row.map(cell => operand_source(cell, cell_math))) }
    })
    const length = (value: Length, key: string, vertical = false) => resolve_length(value,
      measure, vertical ? measure.reference.height : measure.reference.width, key)
    const stretch = props.stretch ?? (props.small ? 0.5 : 1)
    if (!Number.isFinite(stretch) || stretch <= 0) throw new RangeError('MathArray.stretch must be positive and finite')
    const thickness = length(props.thickness ?? em(0.04), 'thickness', true)
    if (thickness < 0) throw new RangeError('MathArray.thickness must be nonnegative')
    if (props.rowgaps !== undefined && props.row_gap_dimensions !== undefined) {
      throw new TypeError('Use rowgaps or row_gap_dimensions, not both')
    }
    const colsep = props.colsep === undefined
      ? props.small ? 0.2778 * math_font_size(query, { ...math, style: 'script' }) : 0.5 * f
      : length(props.colsep, 'colsep')
    const strut_height = 0.84 * stretch * f, strut_depth = 0.36 * stretch * f
    const rules: { pos: number; dashed: boolean }[] = []
    let total = 0, index = 0
    const add_rules = (flags: readonly boolean[] = []) => flags.forEach((dashed, i) => {
      if (typeof dashed !== 'boolean') throw new TypeError('MathArray.hlines expects boolean rule flags')
      if (i > 0) total += 0.25 * f
      rules.push({ pos: total, dashed })
    })
    if (props.hlines && props.hlines.length > prepared.rows.length + 1) {
      throw new RangeError('MathArray.hlines has more boundaries than rows')
    }
    if ((props.rowgaps?.length ?? props.row_gap_dimensions?.length ?? 0) > prepared.rows.length) {
      throw new RangeError('MathArray has more row gaps than rows')
    }

    // Measure natural fragments once. A row shares a baseline; a column shares
    // an advance width. Ink overhang remains independent of both measurements.
    add_rules(props.hlines?.[0])
    const measured = prepared.rows.map((row, r) => {
      const cells = row.map(source => {
        const fragment = measure_operand(source, query, cell_math, index++)
        const style = resolve_style(source.props, query.style, query.measure)
        const font_size = fragment.math ? math_font_size({ ...query, style }, math_context(source.props, { ...query, math: cell_math }))
          : style.font_size
        return { fragment, baseline: baseline(fragment, font_size), width: Math.max(0, advance(fragment)) }
      })
      const height = Math.max(strut_height, ...cells.map(cell => cell.baseline))
      let depth = Math.max(strut_depth, ...cells.map(cell => cell.fragment.size.height - cell.baseline))
      const dimension = props.row_gap_dimensions?.[r]
      let gap = dimension ? dimension_length(dimension, query, math) : length(props.rowgaps?.[r] ?? em(0), 'rowgaps', true)
      // Positive \\[length] deepens the row's strut, so tall cells can absorb
      // it. Negative gaps move the following baseline up, preserving overhang.
      if (gap > 0) { depth = Math.max(depth, strut_depth + gap); gap = 0 }
      if (props.jot && r < prepared.rows.length - 1) depth += 0.3 * f
      total += height
      const pos = total
      total += depth + gap
      add_rules(props.hlines?.[r + 1])
      return { cells, pos }
    })

    const ncol = Math.max(0, ...measured.map(row => row.cells.length))
    const widths = Array.from({ length: ncol }, (_, c) => Math.max(0, ...measured.map(row => row.cells[c]?.width ?? 0)))
    const top = Math.min(0, ...rules.map(rule => rule.pos - thickness)), bottom = Math.max(0, total)
    const children: Placement[] = [], seps: { x: number; dashed: boolean }[] = []
    const positions: { x: number; align: number }[] = []
    let x = 0
    for (let c = 0, d = 0; c < ncol || d < prepared.cols.length; c++, d++) {
      let col = prepared.cols[d]
      for (let first = true; col?.type === 'separator'; first = false) {
        if (!first) x += 0.2 * f
        seps.push({ x, dashed: col.separator === ':' })
        col = prepared.cols[++d]
      }
      if (c >= ncol) continue
      const align = col?.type === 'align' ? ALIGN[col.align] : 0.5
      if (c > 0 || props.outer) x += col?.type === 'align' && col.pregap !== undefined ? length(col.pregap, 'cols.pregap') : colsep
      positions.push({ x, align })
      x += widths[c]
      if (c < ncol - 1 || props.outer) x += col?.type === 'align' && col.postgap !== undefined ? length(col.postgap, 'cols.postgap') : colsep
    }
    for (const { cells, pos } of measured) cells.forEach((cell, c) => {
      children.push(place_fragment(cell.fragment, make_point(positions[c].x + (widths[c] - cell.width) * positions[c].align,
        pos - cell.baseline - top)))
    })
    const width = Math.max(0, x), height = bottom - top
    const left = Math.min(0, ...seps.map(sep => sep.x - thickness / 2))
    const right = Math.max(width, ...seps.map(sep => sep.x + thickness / 2))
    const draw = [
      ...rules.map(rule => array_rule(left, rule.pos - thickness - top, right - left, thickness, rule.dashed, true,
        f, props.fill ?? query.style.color, query.style.opacity)),
      ...seps.map(sep => array_rule(sep.x - thickness / 2, 0, thickness, height, sep.dashed, false,
        f, props.fill ?? query.style.color, query.style.opacity)),
    ].filter((rule): rule is Drawing => !!rule)
    if (draw.length) children.push(place_fragment(make_fragment({ name: 'ArrayRules', size: make_size(width, height), draw })))
    const axis = total / 2 - top
    return finish_math({ size: make_size(width, height), children,
      guides: { math_axis: axis, baseline: axis + MATH_AXIS * f },
      math: math_metrics(x, props.left ?? props.klass, { right: props.right ?? props.left ?? props.klass ?? 'mord' }),
    }, query)
  }
}

export { MathArray }
export type { MathArrayProps }
