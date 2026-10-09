import { math_fonts } from '../font-provider'
import { make_fragment, make_size, make_point, place_fragment } from '@gum-jsx/core'
import type { Child, LayoutQuery } from '@gum-jsx/core'
import { MathElement } from './base'
import { operand_source, measure_operand, extent, baseline, advance } from './operands'
import { limit_policy } from './operators'
import { accent_nucleus } from './decorations'
import { math_context, math_font_size, atom_metrics, math_metrics, finish_math, place_math } from '../metrics'
import type { MathPlacement } from '../metrics'
import { sup_style, sub_style } from '../styles'
import type { MathAtomProps, LimitPolicy } from '../types'

type SupSubProps = MathAtomProps & Readonly<{ sup?: Child; sub?: Child; limits?: LimitPolicy | boolean }>
class SupSub extends MathElement<SupSubProps> {
  static layout(props: SupSubProps, query: LayoutQuery) {
    const math = math_context(props, query), f = math_font_size(query, math), tex = math_fonts(query).metrics(math)
    const upper = { ...math, style: sup_style(math.style) }, lower = { ...math, style: sub_style(math.style) }
    const sources = query.prepare('script-operands', () => ({ base: operand_source(query, props.children, math),
      sup: props.sup == null || typeof props.sup === 'boolean' ? undefined : operand_source(query, props.sup, upper),
      sub: props.sub == null || typeof props.sub === 'boolean' ? undefined : operand_source(query, props.sub, lower) }))
    const base = measure_operand(sources.base, query, math, 0)
    const sup = sources.sup && measure_operand(sources.sup, query, upper, 1)
    const sub = sources.sub && measure_operand(sources.sub, query, lower, 2)
    if (!sup && !sub) {
      const bm = atom_metrics(base)
      return finish_math({ ...base, math: { ...bm,
        left: props.left ?? props.klass ?? bm.left, right: props.right ?? props.left ?? props.klass ?? bm.right } }, query)
    }
    const nucleus_source = query.prepare('accent-script-nucleus', () => accent_nucleus(sources.base))
    const nucleus = nucleus_source && measure_operand(nucleus_source, query, math, 3)
    const attachment = nucleus && atom_metrics(nucleus).nucleus === 'character' ? nucleus : base
    const bm = atom_metrics(attachment)
    const sf = math_font_size(query, upper), tf = math_font_size(query, lower)
    const be = extent(query, attachment, f), se = sup && extent(query, sup, sf), te = sub && extent(query, sub, tf)
    const policy = limit_policy(props.limits, bm.limits ?? 'never')
    const stacked = policy === 'always' || policy === 'auto' && math.style.startsWith('display')
    let width: number, pad_top = 0, pad_bottom = 0
    const items: MathPlacement[] = []
    if (stacked) {
      width = Math.max(advance(base), sup ? advance(sup) + bm.italic : 0, sub ? advance(sub) + bm.italic : 0)
      items.push({ fragment: base, x: (width - advance(base)) / 2, axis: baseline(query, base, f), y: math_fonts(query).axis_height * f })
      if (sup && se) {
        const gap = Math.max(tex.bigop1 * f, tex.bigop3 * f - se.depth)
        items.push({ fragment: sup, x: (width - advance(sup) + bm.italic) / 2,
          axis: baseline(query, sup, sf), y: math_fonts(query).axis_height * f - be.height - gap - se.depth })
        pad_top = tex.bigop5 * f
      }
      if (sub && te) {
        const gap = Math.max(tex.bigop2 * f, tex.bigop4 * f - te.height)
        items.push({ fragment: sub, x: (width - advance(sub) - bm.italic) / 2,
          axis: baseline(query, sub, tf), y: math_fonts(query).axis_height * f + be.depth + gap + te.height })
        pad_bottom = tex.bigop5 * f
      }
    } else {
      let up = bm.nucleus === 'character' ? 0 : be.height - math_fonts(query).metrics(upper).sup_drop * sf
      let down = bm.nucleus === 'character' ? 0 : be.depth + math_fonts(query).metrics(lower).sub_drop * tf
      if (sup && se) up = Math.max(up, (math.style === 'display' ? tex.sup1
        : math.style.endsWith('-cramped') ? tex.sup3 : tex.sup2) * f, se.depth + 0.25 * tex.x_height * f)
      if (sub && te) {
        if (!sup) down = Math.max(down, tex.sub1 * f, te.height - 0.8 * tex.x_height * f)
        else {
          down = Math.max(down, tex.sub2 * f)
          const gap = up - se!.depth - te.height + down
          if (gap < 4 * tex.rule * f) {
            down += 4 * tex.rule * f - gap
            const correction = 0.8 * tex.x_height * f - (up - se!.depth)
            if (correction > 0) { up += correction; down -= correction }
          }
        }
      }
      items.push({ fragment: base, x: 0, axis: baseline(query, base, f), y: math_fonts(query).axis_height * f })
      width = advance(base)
      if (sup) {
        items.push({ fragment: sup, x: bm.advance + bm.italic, axis: baseline(query, sup, sf), y: math_fonts(query).axis_height * f - up })
        width = Math.max(width, bm.advance + bm.italic + advance(sup))
      }
      if (sub) {
        items.push({ fragment: sub, x: bm.advance, axis: baseline(query, sub, tf), y: math_fonts(query).axis_height * f + down })
        width = Math.max(width, bm.advance + advance(sub))
      }
      width += 0.05 * query.style.font_size // TeX's font-size-independent 0.5pt script space.
    }
    const classes = atom_metrics(base)
    const metrics = math_metrics(width, props.left ?? props.klass ?? classes.left,
      { right: props.right ?? props.left ?? props.klass ?? classes.right })
    let result = place_math(query, items, width, f, metrics)
    if (pad_top || pad_bottom) result = make_fragment({ size: make_size(width, result.size.height + pad_top + pad_bottom),
      children: [place_fragment(result, make_point(0, pad_top))], math: metrics,
      guides: { baseline: result.guides.baseline! + pad_top, math_axis: result.guides.math_axis! + pad_top } })
    return finish_math(result, query)
  }
}
export { SupSub }
export type { SupSubProps }
