import { make_measure, make_size, make_fragment, draw_rect, make_rect, resolve_length } from '@gum-jsx/core'
import type { Child, LayoutQuery, Length } from '@gum-jsx/core'
import { MathElement } from './base'
import { operand_source, measure_operand, advance, baseline, extent } from './operands'
import { fit_glyph } from './delimiters'
import { math_context, math_font_size, math_metrics, finish_math, place_math, MATH_AXIS } from '../metrics'
import type { MathPlacement } from '../metrics'
import { cramped_style, tex_metrics } from '../styles'
import type { MathAtomProps } from '../types'

type SqrtProps = MathAtomProps & Readonly<{ index?: Child; thickness?: Length }>
class Sqrt extends MathElement<SqrtProps> {
  static layout(props: SqrtProps, query: LayoutQuery) {
    const math = math_context(props, query), f = math_font_size(query, math), tex = tex_metrics(math)
    const measure = make_measure(query.measure, { font_size: f })
    const cramped = { ...math, style: cramped_style(math.style) }, tiny = { ...math, style: 'scriptscript' as const }
    const sources = query.prepare('root-operands', () => ({ body: operand_source(props.children, cramped),
      index: props.index == null || typeof props.index === 'boolean' ? undefined : operand_source(props.index, tiny) }))
    const body = measure_operand(sources.body, query, cramped, 0), be = extent(body, f)
    const index = sources.index && measure_operand(sources.index, query, tiny, 1)
    const rule = props.thickness === undefined ? 0.04 * f
      : resolve_length(props.thickness, measure, query.measure.reference.height, 'thickness')
    if (rule < 0) throw new RangeError('Root rule thickness must be nonnegative')
    let gap = rule + (math.style.startsWith('display') ? tex.x_height * f : rule) / 4
    const body_height = Math.max(body.size.height, tex.x_height * f)
    const surd = fit_glyph(query, math, '√', body_height + gap + rule, 'mord', true)
    if (surd.size.height - rule > body_height + gap) gap = (gap + surd.size.height - rule - body_height) / 2
    const top = MATH_AXIS * f - be.height - gap - rule
    const prefix = index ? Math.max(0, advance(index) - 5 / 18 * f) : 0
    const body_width = Math.max(0, advance(body))
    const sx = prefix, bx = sx + surd.size.width, width = bx + body_width
    const overlap = Math.min(rule / 2, surd.size.width)
    const bar = make_fragment({ size: make_size(body_width + overlap, rule),
      draw: [draw_rect(make_rect(0, 0, body_width + overlap, rule), { fill: query.style.color,
        stroke: 'none', stroke_width: 0, opacity: query.style.opacity })] })
    const items: MathPlacement[] = [
      { fragment: surd, x: sx, axis: 0, y: top },
      { fragment: bar, x: bx - overlap, axis: 0, y: top },
      { fragment: body, x: bx, axis: baseline(body, f), y: MATH_AXIS * f },
    ]
    if (index) {
      const root_height = be.height + gap + rule, root_depth = Math.max(be.depth, surd.size.height - root_height)
      items.push({ fragment: index, x: Math.max(0, prefix + 5 / 9 * f - advance(index)),
        axis: baseline(index, math_font_size(query, tiny)), y: MATH_AXIS * f - 0.6 * (root_height - root_depth) })
    }
    return finish_math(place_math(items, width, f, math_metrics(width, props.left ?? props.klass ?? 'mord',
      { right: props.right ?? props.left ?? props.klass ?? 'mord' })), query)
  }
}
export { Sqrt }
export type { SqrtProps }

// Generated prop registrations; run the workspace props:generate command.
import { register_props } from '@gum-jsx/core'
import { prop_schemas } from '../prop-schemas'
register_props(Sqrt, prop_schemas.Sqrt)
