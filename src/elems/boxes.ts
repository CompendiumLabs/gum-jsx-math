import { draw_path, draw_rect, make_rect, make_fragment, make_size, make_point, place_fragment, resolve_length } from 'gum-next-core'
import type { LayoutQuery, Length, PathCommand } from 'gum-next-core'
import { MathElement } from './base'
import { operand_source, measure_operand, advance, baseline, extent } from './operands'
import { math_context, math_font_size, math_metrics, atom_metrics, finish_math, dimension_length, MATH_AXIS } from '../metrics'
import { tex_metrics } from '../styles'
import type { MathAtomProps, MathDimension } from '../types'

type PhantomProps = MathAtomProps & Readonly<{ horizontal?: boolean; vertical?: boolean }>
type SmashProps = MathAtomProps & Readonly<{ top?: boolean; bottom?: boolean }>
type LapProps = MathAtomProps & Readonly<{ align?: 'left' | 'center' | 'right' }>
type RaiseBoxProps = MathAtomProps & Readonly<{ shift?: Length; shift_dimension?: MathDimension }>
type EncloseProps = MathAtomProps & Readonly<{
  notation?: 'box' | 'colorbox' | 'cancel' | 'bcancel' | 'xcancel' | 'sout'
  background?: string; border_color?: string; padding?: Length; thickness?: Length
}>

function operand(props: MathAtomProps, query: LayoutQuery) {
  const math = math_context(props, query), f = math_font_size(query, math)
  const source = query.prepare('box-operand', () => operand_source(props.children, math))
  const body = measure_operand(source, query, math, 0)
  return { math, f, body, bm: atom_metrics(body) }
}
function atom(props: MathAtomProps, width: number) {
  return math_metrics(width, props.left ?? props.klass ?? 'mord', { right: props.right ?? props.left ?? props.klass ?? 'mord' })
}

class Phantom extends MathElement<PhantomProps> {
  static layout(props: PhantomProps, query: LayoutQuery) {
    const { body, bm, f } = operand(props, query), horizontal = props.horizontal ?? true, vertical = props.vertical ?? true
    const b = vertical ? baseline(body, f) : 0
    // No child, path, label, or overflow escapes this wrapper, even when a
    // descendant sets its own color or carries cancellation/background ink.
    return finish_math({ size: make_size(horizontal ? body.size.width : 0, vertical ? body.size.height : 0),
      guides: { baseline: b, math_axis: b - MATH_AXIS * f }, math: { ...bm,
        advance: horizontal ? bm.advance : 0, italic: horizontal ? bm.italic : 0, skew: 0, nucleus: undefined, limits: undefined,
        left: props.left ?? props.klass ?? bm.left, right: props.right ?? props.left ?? props.klass ?? bm.right } }, query)
  }
}

class Smash extends MathElement<SmashProps> {
  static layout(props: SmashProps, query: LayoutQuery) {
    const { body, f } = operand(props, query), be = extent(body, f)
    const h = (props.top ?? true) ? 0 : be.height, d = (props.bottom ?? true) ? 0 : be.depth
    return finish_math({ size: make_size(Math.max(0, advance(body)), Math.max(0, h + d)), math: atom(props, advance(body)),
      guides: { baseline: h, math_axis: h - MATH_AXIS * f },
      children: [place_fragment(body, make_point(0, h - be.height))] }, query)
  }
}

class Lap extends MathElement<LapProps> {
  static layout(props: LapProps, query: LayoutQuery) {
    const { body, f } = operand(props, query), align = props.align ?? 'left'
    if (!['left', 'center', 'right'].includes(align)) throw new TypeError('Lap.align must be left, center, or right')
    const x = align === 'left' ? 0 : -advance(body) * (align === 'center' ? 0.5 : 1)
    return finish_math({ size: make_size(0, body.size.height), math: atom(props, 0),
      guides: { baseline: baseline(body, f), math_axis: baseline(body, f) - MATH_AXIS * f },
      children: [place_fragment(body, make_point(x, 0))] }, query)
  }
}

class RaiseBox extends MathElement<RaiseBoxProps> {
  static layout(props: RaiseBoxProps, query: LayoutQuery) {
    const { math, f, body } = operand(props, query)
    const shift = props.shift_dimension ? dimension_length(props.shift_dimension, query, math)
      : resolve_length(props.shift ?? 0, { font_size: f, fraction: query.reference.height }, 'RaiseBox.shift')
    const b = baseline(body, f) + shift
    return finish_math({ size: body.size, math: atom(props, advance(body)),
      guides: { baseline: b, math_axis: b - MATH_AXIS * f }, children: [place_fragment(body)] }, query)
  }
}

class VCenter extends MathElement<MathAtomProps> {
  static layout(props: MathAtomProps, query: LayoutQuery) {
    const { body, f } = operand(props, query), axis = body.size.height / 2
    return finish_math({ size: body.size, math: atom(props, advance(body)),
      guides: { math_axis: axis, baseline: axis + MATH_AXIS * f }, children: [place_fragment(body)] }, query)
  }
}

class Pmb extends MathElement<MathAtomProps> {
  static layout(props: MathAtomProps, query: LayoutQuery) {
    const { body, f } = operand(props, query)
    return finish_math({ size: make_size(Math.max(0, advance(body)), body.size.height), math: atom(props, advance(body)),
      guides: body.guides, children: [place_fragment(body), place_fragment(body, make_point(0.02 * f, 0.01 * f))] }, query)
  }
}

class Enclose extends MathElement<EncloseProps> {
  static layout(props: EncloseProps, query: LayoutQuery) {
    const { body, bm, math, f } = operand(props, query), notation = props.notation ?? 'box'
    if (!['box', 'colorbox', 'cancel', 'bcancel', 'xcancel', 'sout'].includes(notation)) throw new TypeError('Unknown enclosure notation')
    const box = notation === 'box' || notation === 'colorbox', border = notation === 'box'
    const t = props.thickness === undefined ? (notation.includes('cancel') ? 0.046 : tex_metrics(math).rule) * f
      : resolve_length(props.thickness, { font_size: f, fraction: query.reference.height }, 'Enclose.thickness')
    const sep = props.padding === undefined ? 0.3 * f
      : resolve_length(props.padding, { font_size: f, fraction: query.reference.width }, 'Enclose.padding')
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(sep) || sep < 0) throw new RangeError('Enclosure thickness and padding must be nonnegative')
    const pad = box ? sep + (border ? t : 0) : 0
    const width = Math.max(0, advance(body)) + 2 * pad, height = body.size.height + 2 * pad
    const paint = { fill: props.border_color ?? query.style.color, stroke: 'none', stroke_width: 0, opacity: query.style.opacity }
    const draw = []
    if (border && t > 0) {
      for (const rect of [make_rect(0, 0, width, t), make_rect(0, height - t, width, t),
        make_rect(0, t, t, Math.max(0, height - 2 * t)), make_rect(width - t, t, t, Math.max(0, height - 2 * t))]) {
        draw.push(draw_rect(rect, paint))
      }
    } else if (notation === 'sout' && t > 0) {
      draw.push(draw_rect(make_rect(0, baseline(body, f) - 0.5 * tex_metrics(math).x_height * f - t / 2, width, t), paint))
    } else if (notation.includes('cancel') && t > 0) {
      const single = bm.nucleus === 'character', dx = single ? 0 : 0.2 * f, dy = single ? 0.2 * f : 0
      const a = -dx, b = width + dx, top = -dy, bottom = height + dy
      function slash(y1: number, y2: number): PathCommand[] {
        const length = Math.hypot(b - a, y2 - y1) || 1, ox = -(y2 - y1) * t / (2 * length), oy = (b - a) * t / (2 * length)
        return [{ kind: 'M', x: a + ox, y: y1 + oy }, { kind: 'L', x: b + ox, y: y2 + oy },
          { kind: 'L', x: b - ox, y: y2 - oy }, { kind: 'L', x: a - ox, y: y1 - oy }, { kind: 'Z' }]
      }
      draw.push(draw_path([...(notation !== 'bcancel' ? slash(bottom, top) : []),
        ...(notation !== 'cancel' ? slash(top, bottom) : [])], paint))
    }
    const decoration = make_fragment({ name: 'EnclosureInk', size: make_size(width, height), draw })
    return finish_math({ size: make_size(width, height), math: atom(props, width),
      guides: { baseline: baseline(body, f) + pad, math_axis: baseline(body, f) + pad - MATH_AXIS * f },
      draw: box && props.background ? [draw_rect(make_rect(0, 0, width, height), { ...paint, fill: props.background })] : [],
      children: [place_fragment(body, make_point(pad, pad)), place_fragment(decoration)] }, query)
  }
}

export { Phantom, Smash, Lap, RaiseBox, VCenter, Pmb, Enclose }
export type { PhantomProps, SmashProps, LapProps, RaiseBoxProps, EncloseProps }
