import { draw_rect, make_rect, make_size, em, resolve_length } from 'gum-next-core'
import type { LayoutQuery, Length } from 'gum-next-core'
import { MathElement } from './base'
import { math_context, math_font_size, math_metrics, finish_math, MATH_AXIS, space_length } from '../metrics'
import type { MathProps, MathSpace } from '../types'

type MathSpacerProps = MathProps & Readonly<{ advance?: MathSpace; axis?: Length }>
type MathRuleProps = MathProps & Readonly<{ thickness?: Length }>

class MathSpacer extends MathElement<MathSpacerProps> {
  static layout(props: MathSpacerProps, query: LayoutQuery) {
    const f = math_font_size(query, math_context(props, query))
    const advance = space_length(props.advance ?? em(0), f, query.reference.width)
    const height = query.request.height.kind === 'exact' ? query.request.height.value : query.sizing.height.min
    const axis = props.axis === undefined ? height / 2
      : resolve_length(props.axis, { font_size: f, fraction: height }, 'MathSpacer.axis')
    return finish_math({ size: make_size(Math.max(0, advance), height),
      math: math_metrics(advance, 'none'), guides: { math_axis: axis, baseline: axis + MATH_AXIS * f } }, query)
  }
}

class MathRule extends MathElement<MathRuleProps> {
  static layout(props: MathRuleProps, query: LayoutQuery) {
    const f = math_font_size(query, math_context(props, query))
    const width = query.request.width.kind === 'exact' ? query.request.width.value : f
    const thickness = resolve_length(props.thickness ?? em(0.04),
      { font_size: f, fraction: query.reference.height }, 'MathRule.thickness')
    if (thickness < 0) throw new RangeError('Math rule thickness must be nonnegative')
    return finish_math({
      size: make_size(width, thickness), math: math_metrics(width, 'none'),
      guides: { math_axis: thickness / 2, baseline: thickness / 2 + MATH_AXIS * f },
      draw: [draw_rect(make_rect(0, 0, width, thickness), {
        fill: props.fill ?? query.style.color, stroke: 'none', stroke_width: 0, opacity: query.style.opacity,
      })],
    }, query)
  }
}

export { MathSpacer, MathRule }
export type { MathSpacerProps, MathRuleProps }
