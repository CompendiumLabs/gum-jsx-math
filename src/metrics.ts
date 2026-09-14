import { copy_math_context, make_fragment, make_size, make_point, place_fragment, finish_size,
  resolve_length } from 'gum-next-core'
import type { Fragment, FragmentSpec, LayoutQuery, MathClass, MathContext, MathMetrics, MathStyle } from 'gum-next-core'
import type { MathProps, MathSpace } from './types'

const MATH_AXIS = 0.25
const STYLE_SCALE = { display: 1, text: 1, script: 0.7, scriptscript: 0.5 } as const
const SPACES = { thin: 3 / 18, medium: 4 / 18, thick: 5 / 18, quad: 1, qquad: 2 } as const

function math_context(props: MathProps, query: LayoutQuery, fallback: MathStyle = 'text'): MathContext {
  return copy_math_context({ style: props.style ?? query.math?.style ?? fallback, size: query.math?.size ?? 1 })
}

function math_font_size(query: LayoutQuery, context = query.math ?? { style: 'text', size: 1 }): number {
  const size = context.style.replace('-cramped', '') as keyof typeof STYLE_SCALE
  return query.style.font_size * STYLE_SCALE[size] * context.size
}

function space_length(value: MathSpace, font_size: number, reference?: number): number {
  if (typeof value === 'string') {
    if (!(value in SPACES)) throw new TypeError(`Unknown math space: ${value}`)
    return SPACES[value] * font_size
  }
  return resolve_length(value, { font_size, fraction: reference }, 'math advance')
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
  math_metrics, atom_metrics, math_axis, finish_math, place_math }
export type { MathPlacement }
