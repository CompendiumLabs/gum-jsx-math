import { make_fragment, make_point, make_size, place_fragment, draw_ellipse } from 'gum-jsx-core'
import type { LayoutQuery } from 'gum-jsx-core'
import { MathElement } from './base'
import { MathSpan } from './glyphs'
import { math_children, operand_source, measure_operand } from './operands'
import { math_context, math_font_size, atom_metrics, finish_math, MATH_AXIS } from '../metrics'
import type { MathAtomProps, LimitPolicy, SourceRange } from '../types'
import symbols from '../symbols'
import { OPERATOR_METRICS } from '../operator-metrics'

type MathOpProps = MathAtomProps & Readonly<{
  text?: string; symbol?: boolean; limits?: LimitPolicy | boolean; center?: boolean
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
      if (props.text !== undefined && props.children !== undefined) throw new TypeError('Use text or children, not both')
      const children = math_children(props.children)
      const literal = props.text ?? (children.length === 1 && typeof children[0] === 'string' ? children[0].trim() : undefined)
      const text = literal === undefined ? undefined : symbols.math[literal]?.replace ?? symbols.math['\\' + literal]?.replace ?? literal
      const symbol = props.symbol ?? (text !== undefined && [...text].length === 1 &&
        OPERATOR_GLYPHS.has(text))
      const name = literal?.replace(/^\\/, '')
      const limits = limit_policy(props.limits, symbol
        ? (INTEGRALS.has(text!) && name !== 'intop' && name !== 'smallint' ? 'never' : 'auto')
        : (name && LIMIT_NAMES.has(name) ? 'auto' : 'never'))
      const large = math.style.startsWith('display') && name !== 'smallint'
      const oval = text === '∯' || text === '∰'
      const value = oval ? (text === '∯' ? '∬' : '∭') : text
      const face = large ? 'KaTeX_Size2' : 'KaTeX_Size1'
      const source = text === undefined ? operand_source(props.children, math) : new MathSpan({
        text: symbol ? value : name, font_family: symbol ? face
          : props.font_family ?? 'KaTeX_Main', center: symbol, klass: 'mop',
        source: props.source, source_range: props.source_range,
      })
      return { source, limits, symbol, oval, body: literal === undefined, double: text === '∯', large,
        metrics: symbol && value ? OPERATOR_METRICS[face]?.[value] : undefined }
    })
    let child = measure_operand(prepared.source, query, math, 0)
    if (prepared.oval) {
      // KaTeX's contour double/triple integrals have no complete font glyph.
      // Preserve the integral's advance/slant and overlay its contour ring.
      const [cx, rx, ry, thickness] = prepared.double
        ? (prepared.large ? [0.758, 0.477, 0.254, 0.05] : [0.513, 0.344, 0.197, 0.04])
        : (prepared.large ? [1.021, 0.739, 0.302, 0.05] : [0.681, 0.503, 0.197, 0.04])
      child = make_fragment({ ...child, children: [place_fragment(child, make_point())],
        draw: [draw_ellipse(make_point(cx * f, child.guides.math_axis!), make_point(rx * f, ry * f),
          { fill: 'none', stroke: query.style.color, stroke_width: thickness * f, opacity: query.style.opacity })] })
    }
    const metrics = atom_metrics(child)
    const center = props.center ?? (prepared.symbol || prepared.body && metrics.nucleus === 'character')
    const height = prepared.metrics ? (prepared.metrics[0] + prepared.metrics[1]) * f : child.size.height
    const child_baseline = child.guides.baseline ?? (child.guides.math_axis ?? child.size.height / 2) + MATH_AXIS * f
    const base = center ? height / 2 + MATH_AXIS * f : prepared.metrics ? prepared.metrics[0] * f : child_baseline
    const axis = base - MATH_AXIS * f, offset = base - child_baseline
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
