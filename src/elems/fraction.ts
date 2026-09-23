import { make_measure, make_size, make_fragment, make_point, place_fragment, draw_rect, make_rect, resolve_length } from '@gum-jsx/core'
import type { LayoutQuery, Length } from '@gum-jsx/core'
import { MathElement } from './base'
import { math_children, operand_source, measure_operand, extent, baseline, advance } from './operands'
import { delimiter } from './delimiters'
import { math_context, math_font_size, math_metrics, finish_math, place_math, MATH_AXIS, dimension_length } from '../metrics'
import type { MathPlacement } from '../metrics'
import { numerator_style, denominator_style, tex_metrics } from '../styles'
import type { MathAtomProps, MathDimension } from '../types'

type FracProps = MathAtomProps & Readonly<{
  has_bar?: boolean; thickness?: Length; continued?: boolean; padding?: Length
  left_delim?: string | null; right_delim?: string | null; bar_size?: MathDimension
}>
class Frac extends MathElement<FracProps> {
  static layout(props: FracProps, query: LayoutQuery) {
    const math = math_context(props, query), f = math_font_size(query, math), tex = tex_metrics(math)
    const measure = make_measure(query.measure, { font_size: f })
    const upper = { ...math, style: numerator_style(math.style) }, lower = { ...math, style: denominator_style(math.style) }
    const sources = query.prepare('fraction-operands', () => {
      const children = math_children(props.children)
      if (children.length !== 2) throw new TypeError('Frac expects exactly two children: numerator and denominator')
      return [operand_source(children[0], upper), operand_source(children[1], lower)]
    })
    let num = measure_operand(sources[0], query, upper, 0)
    const den = measure_operand(sources[1], query, lower, 1)
    const nf = math_font_size(query, upper), df = math_font_size(query, lower)
    if (props.continued) {
      const e = extent(num, nf), height = Math.max(e.height, 0.85 * f), depth = Math.max(e.depth, 0.35 * f)
      num = make_fragment({ size: make_size(num.size.width, height + depth), math: num.math,
        guides: { baseline: height, math_axis: height - MATH_AXIS * nf },
        children: [place_fragment(num, make_point(0, height - e.height))] })
    }
    const ne = extent(num, nf), de = extent(den, df)
    const thickness = props.has_bar === false ? 0 : props.thickness !== undefined
      ? resolve_length(props.thickness, measure, query.measure.reference.height, 'thickness')
      : props.bar_size ? dimension_length(props.bar_size, query, math) : tex.rule * f
    if (thickness < 0) throw new RangeError('Fraction rule thickness must be nonnegative')
    const display = math.style.startsWith('display'), has_bar = thickness > 0
    let up = (display ? tex.num1 : has_bar ? tex.num2 : tex.num3) * f
    let down = (display ? tex.denom1 : tex.denom2) * f
    const clearance = (has_bar ? (display ? 3 : 1) * thickness : (display ? 7 : 3) * tex.rule * f)
    if (has_bar) {
      up = Math.max(up, ne.depth + MATH_AXIS * f + thickness / 2 + clearance)
      down = Math.max(down, de.height - MATH_AXIS * f + thickness / 2 + clearance)
    } else {
      const extra = Math.max(0, clearance - (up - ne.depth - de.height + down)) / 2
      up += extra; down += extra
    }
    const width = Math.max(0, advance(num), advance(den))
    const items: MathPlacement[] = [
      { fragment: num, x: (width - advance(num)) / 2, axis: baseline(num, nf), y: MATH_AXIS * f - up },
      { fragment: den, x: (width - advance(den)) / 2, axis: baseline(den, df), y: MATH_AXIS * f + down },
    ]
    if (has_bar) items.push({ fragment: make_fragment({ size: make_size(width, thickness),
      draw: [draw_rect(make_rect(0, 0, width, thickness), { fill: query.style.color,
        stroke: 'none', stroke_width: 0, opacity: query.style.opacity })] }), x: 0, axis: thickness / 2 })
    const inner = place_math(items, width, f, math_metrics(width))
    const target = (display ? tex.delim1 : math.style.startsWith('scriptscript')
      ? tex_metrics({ ...math, style: 'script' }).delim2 : tex.delim2) * f
    const left = delimiter(query, math, props.left_delim ?? null, target, 'mopen')
    const right = delimiter(query, math, props.right_delim ?? null, target, 'mclose')
    const padding = props.padding === undefined ? 0.12 * query.style.font_size
      : resolve_length(props.padding, measure, query.measure.reference.width, 'padding')
    if (padding < 0) throw new RangeError('Fraction padding must be nonnegative')
    const lx = props.left_delim ? left.size.width : padding
    const rx = props.continued ? 0 : props.right_delim ? right.size.width : padding
    const total = lx + width + rx
    return finish_math(place_math([
      { fragment: left, x: 0, axis: left.guides.math_axis! },
      { fragment: inner, x: lx, axis: inner.guides.math_axis! },
      ...(props.continued ? [] : [{ fragment: right, x: lx + width, axis: right.guides.math_axis! }]),
    ], total, f, math_metrics(total, props.left ?? props.klass ?? 'mord',
      { right: props.right ?? props.left ?? props.klass ?? 'mord' })), query)
  }
}
export { Frac }
export type { FracProps }

// Generated prop registrations; run the workspace props:generate command.
import { register_props } from '@gum-jsx/core'
import { prop_schemas } from '../prop-schemas'
register_props(Frac, prop_schemas.Frac)
