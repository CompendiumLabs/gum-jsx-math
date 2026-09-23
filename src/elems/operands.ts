import { Element, make_request, definite_reference } from '@gum-jsx/core'
import type { Child, Fragment, LayoutQuery, MathContext } from '@gum-jsx/core'
import { MathText, syntax_operand } from './composition'
import { parse_math } from '../parse'
import { atom_metrics, math_axis, MATH_AXIS } from '../metrics'

function math_children(child: Child): Child[] {
  if (child == null || typeof child === 'boolean') return []
  if (Array.isArray(child)) return child.flatMap(math_children)
  return typeof child === 'string' && !child.trim() ? [] : [child]
}
function operand_source(child: Child, context: MathContext): Element {
  const children = math_children(child)
  if (children.length === 1) {
    const single = children[0]
    if (single instanceof Element) return single
    if (typeof single === 'string' || typeof single === 'number') {
      const source = String(single)
      return syntax_operand(parse_math(source, { display: context.style.startsWith('display') }), source)
    }
  }
  return new MathText({ children })
}
function measure_operand(source: Element, query: LayoutQuery, math: MathContext, index: number): Fragment {
  return query.child(source, make_request(), definite_reference(query.request, query.sizing), index,
    { math, coordinates: null })
}
function baseline(fragment: Fragment, font_size: number): number {
  return fragment.guides.baseline ?? math_axis(fragment, font_size) + MATH_AXIS * font_size
}
function extent(fragment: Fragment, font_size: number) {
  const height = baseline(fragment, font_size)
  return { height, depth: fragment.size.height - height }
}
function advance(fragment: Fragment): number {
  const metrics = atom_metrics(fragment)
  return metrics.advance + metrics.italic
}

export { math_children, operand_source, measure_operand, baseline, extent, advance }
