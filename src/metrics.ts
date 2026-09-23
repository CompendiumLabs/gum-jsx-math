import { copy_math_context, make_fragment, make_size, make_point, place_fragment, finish_size,
  em, resolve_length } from '@gum-jsx/core'
import type { Fragment, FragmentSpec, LayoutQuery, Length, LengthContext, MathClass, MathContext, MathMetrics, MathStyle } from '@gum-jsx/core'
import type { MathProps, MathSpace, MathDimension } from './types'
import { font_scale, STYLE_SCALE, text_style } from './styles'

const MATH_AXIS = 0.25
const SPACES = { thin: 3 / 18, medium: 4 / 18, thick: 5 / 18, quad: 1, qquad: 2 } as const

function math_context(props: MathProps, query: LayoutQuery, fallback: MathStyle = 'text'): MathContext {
  const inherited = query.math?.style ?? fallback
  return copy_math_context({ style: props.style ?? (props.size_index === undefined ? inherited : text_style(inherited)), size: query.math?.size ?? 1,
    size_index: props.size_index ?? query.math?.size_index })
}

function dimension_length(dimension: MathDimension, query: LayoutQuery, context: MathContext): number {
  if (dimension.unit === 'pt') return dimension.value * query.style.font_size / 10
  if (dimension.unit === 'mu') return dimension.value * math_font_size(query, context) / 18
  const font_size = math_font_size(query, { ...context, style: text_style(context.style) })
  return dimension.value * font_size * (dimension.unit === 'ex' ? 0.431 : 1)
}

function math_font_size(query: LayoutQuery, context: MathContext = query.math ?? { style: 'text', size: 1 }): number {
  return query.style.font_size * font_scale(context)
}

function space_length(value: MathSpace, measure: LengthContext): number {
  if (typeof value === 'string' && Object.hasOwn(SPACES, value)) {
    value = em(SPACES[value as keyof typeof SPACES])
  }
  return resolve_length(value as Length, measure, measure.reference.width, 'advance')
}

function math_metrics(advance: number, klass: MathClass = 'mord', patch: Partial<MathMetrics> = {}): MathMetrics {
  return { advance, left: klass, right: klass, italic: 0, skew: 0, ...patch }
}

function atom_metrics(fragment: Fragment): MathMetrics {
  return fragment.math ?? math_metrics(fragment.size.width)
}

function math_axis(fragment: Fragment, font_size: number): number {
  return fragment.guides.math_axis ?? (fragment.guides.baseline !== undefined
    ? fragment.guides.baseline - MATH_AXIS * font_size : fragment.size.height / 2)
}

// Allocated boxes can grow/shrink while their drawings retain the resolved font
// size. Signed glue is a separate advance, never a negative physical size.
function finish_math(spec: FragmentSpec, query: LayoutQuery): Fragment {
  const size = finish_size(spec.size, query.request, query.sizing)
  const math = spec.math && (size.width !== spec.size.width || query.request.width.kind === 'exact')
    ? { ...spec.math, advance: size.width, italic: 0 } : spec.math
  return make_fragment({ ...spec, size, math })
}

type MathPlacement = Readonly<{ fragment: Fragment; x: number; y?: number; axis: number }>

// y is relative to the parent's math axis. Only logical bounds determine line
// height; make_fragment unions the independent ink and overflow of every child.
function place_math(items: readonly MathPlacement[], advance: number, font_size: number,
  math: MathMetrics, strut = false): Fragment {
  const visible = items.filter(({ fragment }) => fragment.size.height > 0)
  const tops = visible.map(({ y = 0, axis }) => y - axis)
  const bottoms = visible.map(({ fragment, y = 0, axis }) => y - axis + fragment.size.height)
  if (strut) { tops.push(-font_size / 2); bottoms.push(font_size / 2) }
  const top = tops.length ? Math.min(...tops) : 0
  const bottom = bottoms.length ? Math.max(...bottoms) : 0
  return make_fragment({
    size: make_size(Math.max(0, advance), Math.max(0, bottom - top)), math,
    guides: { math_axis: -top, baseline: -top + MATH_AXIS * font_size },
    children: items.map(({ fragment, x, y = 0, axis }) =>
      place_fragment(fragment, make_point(x, y - axis - top))),
  })
}

export { MATH_AXIS, STYLE_SCALE, math_context, math_font_size, space_length,
  math_metrics, atom_metrics, math_axis, finish_math, place_math, dimension_length }
export type { MathPlacement }
