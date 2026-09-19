import { draw_rect, make_rect, make_size, em, resolve_length, theme_color } from 'gum-jsx-core'
import type { LayoutQuery, Length } from 'gum-jsx-core'
import { MathElement } from './base'
import { math_context, math_font_size, math_metrics, finish_math, MATH_AXIS, space_length, dimension_length } from '../metrics'
import type { MathProps, MathAtomProps, MathSpace, MathDimension } from '../types'

type MathSpacerProps = MathProps & Readonly<{ advance?: MathSpace; axis?: Length; dimension?: MathDimension }>
type MathRuleProps = MathAtomProps & Readonly<{ thickness?: Length; shift?: Length;
  width_dimension?: MathDimension; height_dimension?: MathDimension; shift_dimension?: MathDimension }>

class MathSpacer extends MathElement<MathSpacerProps> {
  // Signed glue is an allocation primitive, not a drawing to scale.
  static auto_fit = false
  static layout(props: MathSpacerProps, query: LayoutQuery) {
    const math = math_context(props, query), f = math_font_size(query, math)
    const advance = props.dimension ? dimension_length(props.dimension, query, math)
      : space_length(props.advance ?? em(0), f, query.reference.width)
    const height = query.request.height.kind === 'exact' ? query.request.height.value : query.sizing.height.min
    const axis = props.axis === undefined ? height / 2
      : resolve_length(props.axis, { font_size: f, fraction: height }, 'MathSpacer.axis')
    return finish_math({ size: make_size(Math.max(0, advance), height),
      math: math_metrics(advance, 'none'), guides: { math_axis: axis, baseline: axis + MATH_AXIS * f } }, query)
  }
}

class MathRule extends MathElement<MathRuleProps> {
  // Rules obey their allocation without scaling their authored thickness.
  static auto_fit = false
  static layout(props: MathRuleProps, query: LayoutQuery) {
    const math = math_context(props, query), f = math_font_size(query, math)
    const width = props.width_dimension ? dimension_length(props.width_dimension, query, math)
      : query.request.width.kind === 'exact' ? query.request.width.value : f
    const raw_height = props.height_dimension ? dimension_length(props.height_dimension, query, math) : resolve_length(props.thickness ?? em(0.04),
      { font_size: f, fraction: query.reference.height }, 'MathRule.thickness')
    if (raw_height < 0 && !props.height_dimension) throw new RangeError('Math rule thickness must be nonnegative')
    const thickness = Math.max(0, raw_height)
    const shifted = props.shift !== undefined || props.shift_dimension !== undefined || props.height_dimension !== undefined
    const shift = props.shift_dimension ? dimension_length(props.shift_dimension, query, math)
      : resolve_length(props.shift ?? 0, { font_size: f, fraction: query.reference.height }, 'MathRule.shift')
    const baseline = shifted ? raw_height + shift : thickness / 2 + MATH_AXIS * f
    return finish_math({
      size: make_size(Math.max(0, width), thickness), math: math_metrics(width, props.left ?? props.klass ?? 'none',
        { right: props.right ?? props.left ?? props.klass ?? 'none' }),
      guides: { math_axis: baseline - MATH_AXIS * f, baseline },
      draw: width > 0 && thickness > 0 ? [draw_rect(make_rect(0, 0, width, thickness), {
        fill: theme_color(props.fill ?? query.style.color, query.style.theme), stroke: 'none', stroke_width: 0, opacity: query.style.opacity,
      })] : [],
    }, query)
  }
}

export { MathSpacer, MathRule }
export type { MathSpacerProps, MathRuleProps }
