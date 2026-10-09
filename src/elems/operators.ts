import { math_fonts } from '../font-provider'
import { make_fragment, make_point, make_size, place_fragment, draw_ellipse } from '@gum-jsx/core'
import type { LayoutQuery } from '@gum-jsx/core'
import { MathElement } from './base'
import { MathSpan } from './glyphs'
import { math_children, operand_source, measure_operand } from './operands'
import { math_context, math_font_size, atom_metrics, finish_math } from '../metrics'
import type { MathAtomProps, LimitPolicy, SourceRange } from '../types'
import symbols from '../symbols'

type MathOpProps = MathAtomProps & Readonly<{
  symbol?: boolean; limits?: LimitPolicy | boolean; center?: boolean
  source?: string; source_range?: SourceRange
}>
const LIMIT_NAMES = new Set(['det', 'gcd', 'inf', 'lim', 'max', 'min', 'Pr', 'sup', 'liminf', 'limsup'])
const INTEGRALS = new Set(['∫', '∬', '∭', '∮', '∯', '∰'])
const OPERATOR_GLYPHS = new Set(Object.values(symbols.math).filter(entry => entry.family === 'op-token').map(entry => entry.replace))
function limit_policy(value: LimitPolicy | boolean | undefined, fallback: LimitPolicy): LimitPolicy {
  const policy = value === undefined ? fallback : value === true ? 'always' : value === false ? 'never' : value
  if (!['auto', 'always', 'never'].includes(policy)) throw new TypeError('limits must be auto, always, never, or a boolean')
  return policy
}

class MathOp extends MathElement<MathOpProps> {
  static layout(props: MathOpProps, query: LayoutQuery) {
    const math = math_context(props, query), f = math_font_size(query, math)
    const prepared = query.prepare('operator', () => {
      const children = math_children(props.children)
      const literal = children.length === 1 && typeof children[0] === 'string' ? children[0].trim() : undefined
      const text = literal === undefined ? undefined : symbols.math[literal]?.replace ?? symbols.math['\\' + literal]?.replace ?? literal
      const symbol = props.symbol ?? (text !== undefined && [...text].length === 1 &&
        OPERATOR_GLYPHS.has(text))
      const name = literal?.replace(/^\\/, '')
      const limits = limit_policy(props.limits, symbol
        ? (INTEGRALS.has(text!) && name !== 'intop' && name !== 'smallint' ? 'never' : 'auto')
        : (name && LIMIT_NAMES.has(name) ? 'auto' : 'never'))
      const large = math.style.startsWith('display') && name !== 'smallint'
      const glyph = text === undefined ? undefined : math_fonts(query).operator_font(text, large)
      const source = text === undefined ? operand_source(query, props.children, math) : new MathSpan({
        children: symbol ? glyph?.text : name, font_family: symbol ? glyph?.face
          : props.font_family ?? math_fonts(query).default_font, center: symbol, klass: 'mop',
        source: props.source, source_range: props.source_range,
      })
      return { source, limits, symbol, body: literal === undefined,
        metrics: symbol ? glyph?.metrics : undefined, contour: glyph?.contour }
    })
    let child = measure_operand(prepared.source, query, math, 0)
    if (prepared.contour) {
      // The provider describes any contour needed over the operator glyph.
      const [cx, rx, ry, thickness] = prepared.contour
      child = make_fragment({ ...child, children: [place_fragment(child, make_point())],
        draw: [draw_ellipse(make_point(cx * f, child.guides.math_axis!), make_point(rx * f, ry * f),
          { fill: 'none', stroke: query.style.color, stroke_width: thickness * f, opacity: query.style.opacity })] })
    }
    const metrics = atom_metrics(child)
    const center = props.center ?? (prepared.symbol || prepared.body && metrics.nucleus === 'character')
    const height = prepared.metrics ? (prepared.metrics[0] + prepared.metrics[1]) * f : child.size.height
    const child_baseline = child.guides.baseline ?? (child.guides.math_axis ?? child.size.height / 2) + math_fonts(query).axis_height * f
    const base = center ? height / 2 + math_fonts(query).axis_height * f : prepared.metrics ? prepared.metrics[0] * f : child_baseline
    const axis = base - math_fonts(query).axis_height * f, offset = base - child_baseline
    return finish_math({ size: make_size(child.size.width, height),
      children: [place_fragment(child, make_point(0, offset))],
      guides: { ...child.guides, baseline: base, math_axis: axis },
      math: { ...metrics, left: props.left ?? props.klass ?? 'mop',
        right: props.right ?? props.left ?? props.klass ?? 'mop', limits: prepared.limits, nucleus: undefined },
    }, query)
  }
}
export { MathOp, limit_policy }
export type { MathOpProps }
