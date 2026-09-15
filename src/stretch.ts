import { Arrow, ArrowHead, Arc, Line, Polyline, arrow_barb, draw_path, exact, make_fragment,
  make_request, make_size, place_fragment, px, resolve_style } from 'gum-next-core'
import type { ArrowBarbSide, Element, LayoutQuery, PathCommand, Placement, PositionValue } from 'gum-next-core'
import { math_metrics, MATH_AXIS } from './metrics'
import { MathError } from './errors'

type Point = readonly [number, number]
type StretchEntry = Readonly<{ height: number; min_width: number; thickness?: number }>
const STRETCH: Readonly<Record<string, StretchEntry>> = Object.freeze(Object.fromEntries([
  ...['overrightarrow', 'overleftarrow', 'underrightarrow', 'underleftarrow',
    'overleftrightarrow', 'underleftrightarrow', 'overleftharpoon', 'overrightharpoon',
    'overlinesegment', 'underlinesegment'].map(name => [name, { height: 0.522, min_width: 0.888 }]),
  ['Overrightarrow', { height: 0.56, min_width: 0.888 }],
  ...['overgroup', 'undergroup'].map(name => [name, { height: 0.26, min_width: 0.888 }]),
  ...['widehat', 'widecheck', 'widetilde', 'utilde'].map(name => [name, { height: 0.26, min_width: 0 }]),
  ...['overbrace', 'underbrace'].map(name => [name, { height: 0.548, min_width: 1.6, thickness: 0.1 }]),
  ['overbracket', { height: 0.44, min_width: 1.6, thickness: 0.12 }],
  ['underbracket', { height: 0.41, min_width: 1.6, thickness: 0.12 }],
  ['vec', { height: 0.197, min_width: 0.442 }],
  ...['xrightarrow', 'xleftarrow'].map(name => [name, { height: 0.522, min_width: 1.469 }]),
  ['xleftrightarrow', { height: 0.522, min_width: 1.75 }],
  ...['xRightarrow', 'xLeftarrow'].map(name => [name, { height: 0.56, min_width: 1.526 }]),
  ['xLeftrightarrow', { height: 0.56, min_width: 1.75 }],
  ...['xlongequal', 'xtwoheadrightarrow', 'xtwoheadleftarrow'].map(name => [name, { height: 0.334, min_width: 0.888 }]),
  ...['xrightharpoonup', 'xrightharpoondown', 'xleftharpoonup', 'xleftharpoondown']
    .map(name => [name, { height: 0.522, min_width: 0.888 }]),
  ...['xhookrightarrow', 'xhookleftarrow'].map(name => [name, { height: 0.522, min_width: 1.08 }]),
  ['xmapsto', { height: 0.522, min_width: 1.5 }],
  ...['xrightleftharpoons', 'xleftrightharpoons', 'xrightequilibrium', 'xleftequilibrium']
    .map(name => [name, { height: 0.716, min_width: 1.75 }]),
  ['xrightleftarrows', { height: 0.901, min_width: 1.75 }],
  ['xtofrom', { height: 0.528, min_width: 1.75 }],
] as [string, StretchEntry][]))

function stretch_entry(label: string): StretchEntry {
  const entry = STRETCH[label.replace(/^\\/, '')]
  if (!entry) throw new MathError('unsupported', `Unknown stretchy decoration '${label}'`)
  return entry
}

// Tapered braces need variable-width filled bands. Constant-width decorations
// and arrows use core elements so joins and caps share the ordinary renderer.
function offset_line(points: readonly Point[], distances: readonly number[]): Point[] {
  return points.map(([x, y], i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], norm = Math.hypot(dx, dy) || 1
    return [x - distances[i] * dy / norm, y + distances[i] * dx / norm]
  })
}
function band(points: readonly Point[], thickness: number | readonly number[]): Point[] {
  const half = points.map((_, i) => (typeof thickness === 'number' ? thickness : thickness[i]) / 2)
  return [...offset_line(points, half), ...offset_line(points, half.map(x => -x)).reverse()]
}
function polygon(points: readonly Point[]): PathCommand[] {
  return points.length ? [{ kind: 'M', x: points[0][0], y: points[0][1] },
    ...points.slice(1).map(([x, y]) => ({ kind: 'L' as const, x, y })), { kind: 'Z' }] : []
}

function brace(width: number, height: number, thick: number): Point[] {
  const w = width - thick, h = height - thick, r = Math.min(h / 2, w / 4), peak = h - 2 * r
  const arc = (cx: number, cy: number, a0: number, a1: number, t0: number, t1: number) =>
    Array.from({ length: 13 }, (_, i) => {
      const u = i / 12, a = (a0 + (a1 - a0) * u) * Math.PI / 180
      return { p: [thick / 2 + cx + r * Math.cos(a), thick / 2 + cy + r * Math.sin(a)] as Point,
        t: t0 + (t1 - t0) * (1 - Math.cos(Math.PI * u)) / 2 }
    })
  const thin = thick / 5
  const parts = [...arc(r, h, 180, 270, thin, thick), ...arc(w / 2 - r, peak, 90, 0, thick, thin),
    ...arc(w / 2 + r, peak, 180, 90, thin, thick).slice(1), ...arc(w - r, h, 270, 360, thick, thin)]
  return band(parts.map(p => p.p), parts.map(p => p.t))
}

function stretch_fragment(label: string, desired: number, f: number, query: LayoutQuery,
  thickness?: number, height?: number, head_curve = 0.7) {
  const name = label.replace(/^\\/, ''), entry = stretch_entry(name)
  const t = thickness ?? (entry.thickness ?? 0.04) * f
  if (!Number.isFinite(t) || t < 0) throw new RangeError('Decoration thickness must be nonnegative')
  const w = Math.max(desired, entry.min_width * f, 2 * t)
  // Wide accents grow in height modestly while fitting the actual measured
  // body width. Glyph count is not a proxy for width (figures are operands too).
  const wide = ['widehat', 'widecheck', 'widetilde'].includes(name)
  const h = Math.max(height ?? (wide ? Math.min(0.42, 0.22 + 0.045 * w / f) : entry.height) * f, 2 * t)
  const size = make_size(w, h), request = make_request({ width: exact(w), height: exact(h) })
  const style = resolve_style({ fill: 'none', stroke: query.style.color, stroke_width: px(t),
    stroke_linecap: 'butt', stroke_linejoin: 'round', stroke_dasharray: [] }, query.style)
  const children: Placement[] = []
  const point = ([x, y]: Point): PositionValue => [px(x), px(y)]
  const add = (element: Element) => {
    if (t > 0) children.push(place_fragment(query.child(element, request, size, children.length,
      { coordinates: null, style })))
  }
  const paths: Point[][] = []
  const line = (points: Point[]) => add(points.length === 2
    ? new Line({ from: point(points[0]), to: point(points[1]) })
    : new Polyline({ points: points.map(point) }))
  const flip = (points: Point[]) => points.map(([x, y]) => [x, h - y] as Point)

  function arrow(x: number, y: number, width: number, height: number, left: boolean, right: boolean,
    double = false, harp?: 'up' | 'down', twohead = false, hook = false, mapsto = false) {
    const cy = y + height / 2, head_width = 2 * Math.tan(46 * Math.PI / 180)
    const depth = Math.max(0, height - t) / head_width
    const tip_l = x + t / 2, tip_r = x + width - t / 2
    // Barb names are relative to travel: a left-facing arrow's upper barb is
    // on its right. Choose the route direction to keep harpoons unambiguous.
    const barb: ArrowBarbSide = !harp ? 'both' : (harp === 'up') === right ? 'left' : 'right'
    const head = (tip: number, leftward: boolean) => {
      if (depth > 0) add(new ArrowHead({ tip: point([tip, cy]), angle: leftward ? 180 : 0,
        head_size: px(depth), head_width, open: true, curve: head_curve, barb }))
    }
    const r = (height - t) / 4
    if (double) {
      const gap = Math.min(0.194 * f, height / 2)
      const inset = Math.min(depth, arrow_barb(depth, head_width, head_curve).reach(gap / 2))
      for (const offset of [-gap / 2, gap / 2]) {
        line([[tip_l + (left ? inset : 0), cy + offset], [tip_r - (right ? inset : 0), cy + offset]])
      }
      if (left) head(tip_l, true)
      if (right) head(tip_r, false)
    } else {
      const a = point([tip_l + (hook && right ? r : 0), cy])
      const b = point([tip_r - (hook && left ? r : 0), cy])
      add(new Arrow({ from: right ? a : b, to: right ? b : a,
        start_head: left && right, end_head: left || right,
        head_size: px(depth), head_width, head_open: true, head_curve, head_barb: barb }))
    }
    if (twohead && left) head(tip_l + 0.6 * depth, true)
    if (twohead && right) head(tip_r - 0.6 * depth, false)
    if (mapsto) line([[tip_l, y + t / 2], [tip_l, y + height - t / 2]])
    if (hook) {
      add(new Arc({ center: point([right ? tip_l + r : tip_r - r, cy - r]),
        radius: px(r), start: 90, end: right ? 270 : -90 }))
    }
  }

  if (name.endsWith('brace')) {
    const points = brace(w, h, t)
    paths.push(name.startsWith('under') ? flip(points) : points)
  } else if (name.endsWith('bracket')) {
    const top = name.startsWith('over') ? Math.min(0.03 * f, h - 2 * t) : 0
    const points: Point[] = [[0, h], [t, h], [t, top + t], [w - t, top + t],
      [w - t, h], [w, h], [w, top], [0, top]]
    paths.push(name.startsWith('under') ? flip(points) : points)
  } else if (name === 'widehat' || name === 'widecheck') {
    const points: Point[] = [[t / 2, h - t / 2], [w / 2, t / 2], [w - t / 2, h - t / 2]]
    line(name === 'widecheck' ? flip(points) : points)
  } else if (name === 'widetilde' || name === 'utilde') {
    line(Array.from({ length: 65 }, (_, i) => [t / 2 + (w - t) * i / 64,
      h / 2 - (h - t) / 2 * Math.sin(2 * Math.PI * i / 64)]))
  } else if (name.endsWith('group')) {
    const r = Math.min((h - t) * 1.8, (w - t) / 2), d = h - t
    const points: Point[] = [...Array.from({ length: 17 }, (_, i) => {
      const a = Math.PI / 2 * i / 16
      return [t / 2 + r * (1 - Math.cos(a)), t / 2 + d * (1 - Math.sin(a))] as Point
    }), ...Array.from({ length: 17 }, (_, i) => {
      const a = Math.PI / 2 * i / 16
      return [w - t / 2 - r * (1 - Math.sin(a)), t / 2 + d * (1 - Math.cos(a))] as Point
    })]
    line(name.startsWith('under') ? flip(points) : points)
  } else if (name.endsWith('linesegment')) {
    line([[t / 2, h / 2], [w - t / 2, h / 2]])
    for (const x of [t / 2, w - t / 2]) line([[x, h / 2 - 0.167 * f], [x, h / 2 + 0.167 * f]])
  } else if (['xrightleftharpoons', 'xleftrightharpoons', 'xrightleftarrows', 'xtofrom',
    'xrightequilibrium', 'xleftequilibrium'].includes(name)) {
    const left_first = name === 'xleftrightharpoons', harp = name.includes('harpoon') || name.includes('equilibrium')
    const short = Math.min(0.5 * f, w / 2)
    const top_short = name === 'xleftequilibrium', bottom_short = name === 'xrightequilibrium'
    arrow(top_short ? short : 0, 0, w - (top_short ? short : 0), h / 2, left_first, !left_first, false, harp ? 'up' : undefined)
    arrow(0, h / 2, w - (bottom_short ? short : 0), h / 2, !left_first, left_first, false, harp ? 'down' : undefined)
  } else {
    const lower = name.toLowerCase(), left = lower.includes('left'), right = lower.includes('right') || name === 'vec' || name === 'xmapsto'
    const harp = lower.includes('harpoon') ? (lower.endsWith('down') ? 'down' : 'up') : undefined
    arrow(0, 0, w, h, left, right, /[A-Z]/.test(name) || name === 'xlongequal', harp,
      name.includes('twohead'), name.includes('hook'), name === 'xmapsto')
  }
  return make_fragment({ name: 'StretchShape', size, math: math_metrics(w, 'mrel'), children,
    guides: { math_axis: h / 2, baseline: h / 2 + MATH_AXIS * f },
    draw: t === 0 || paths.length === 0 ? [] : [draw_path(paths.flatMap(polygon), {
      fill: query.style.color, stroke: 'none', stroke_width: 0, opacity: query.style.opacity,
    })] })
}

export { stretch_entry, stretch_fragment, STRETCH }
