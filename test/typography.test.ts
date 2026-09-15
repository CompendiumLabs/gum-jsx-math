import { expect, test } from 'bun:test'
import { Arrow, LayoutPass, Rect, Text, px, make_request, exact, available, resolve_style, render_svg } from 'gum-next-core'
import type { Element, Fragment, FontProvider, MathStyle, PathDraw } from 'gum-next-core'
import { Accent, Underline, Overline, MathStretch, HorizBrace, XArrow, MathSymbol, MathSpan, MathText, MathRow,
  SupSub, Frac, TextMode, Latex, Phantom, Smash, Lap, Enclose, RaiseBox, VCenter, Pmb,
  createMathFonts, MATH_FONTS, parse_math } from '../src'
import { STRETCH } from '../src/stretch'

const fonts = createMathFonts(), pass = new LayoutPass({ fonts: { value: fonts, version: fonts.version } })
const context = { style: resolve_style({ font_size: px(40) }) }, natural = make_request()
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 8)
const layout = (element: Element) => pass.layout(element, natural, context)
const formula = (text: string, style: MathStyle = 'display') => layout(new Latex({ text, style, strut: false }))
function descendants(f: Fragment): Fragment[] { return [f, ...f.children.flatMap(c => descendants(c.fragment))] }
function drawings(f: Fragment) { return descendants(f).flatMap(item => item.draw) }
function named(f: Fragment, name: string) { return descendants(f).filter(item => item.name === name) }
const b = (f: Fragment) => f.guides.baseline!
const width = (f: Fragment) => f.math!.advance + f.math!.italic
const relative_baseline = (f: Fragment, index: number) => f.children[index].offset.y + b(f.children[index].fragment) - b(f)

test('fixed accents use character skew and attach scripts to the bare nucleus', () => {
  const plain = layout(new MathSymbol({ text: 'f' })), accent = layout(new Accent({ children: 'f' }))
  near(width(accent), width(plain))
  const [body, hat] = accent.children
  near(hat.offset.x + hat.fragment.size.width / 2, body.offset.x + plain.math!.advance / 2 + plain.math!.skew)
  const no_skew = layout(new Accent({ children: 'f', shifty: false }))
  near(hat.offset.x - no_skew.children[1].offset.x, plain.math!.skew)
  const wide = new Accent({ children: 'f', accent: 'overrightarrow' })
  const omitted = layout(new SupSub({ children: wide, sup: false, sub: null }))
  expect(omitted.size).toEqual(layout(wide).size)
  expect(omitted.math).toEqual(layout(wide).math)
  for (const style of ['display', 'text', 'script', 'scriptscript'] as const) {
    const plain = named(formula('f_i^2', style), 'SupSub')[0]
    const accented = named(formula(String.raw`\hat{f}_i^2`, style), 'SupSub')[0]
    for (const i of [1, 2]) {
      near(relative_baseline(accented, i), relative_baseline(plain, i))
      near(accented.children[i].offset.x, plain.children[i].offset.x)
    }
    near(accented.size.width, plain.size.width)
  }
  const compound = named(formula(String.raw`\widehat{\frac{a}{b}}^2`), 'SupSub')[0]
  expect(compound.children[1].offset.y).toBeLessThan(compound.children[0].offset.y + compound.children[0].fragment.size.height / 2)
  expect(formula(String.raw`\hat{\mathbb{A}}`).ink).not.toBeNull()
  const circled = named(formula(String.raw`\text{\textcircled{a}}`), 'Accent')[0]
  expect(circled.size.width).toBeGreaterThanOrEqual(circled.children[1].fragment.size.width)
  near(circled.children[1].offset.y + circled.children[1].fragment.size.height - b(circled), 8)
  const cedilla = named(formula(String.raw`\text{\c{c}}`), 'Accent')[0]
  expect(cedilla.children[1].offset.y).toBeGreaterThan(cedilla.children[0].offset.y)
})

test('wide accents fit measured operands; over and under rules preserve the body baseline', () => {
  for (const accent of ['widehat', 'widecheck', 'widetilde']) {
    const narrow = layout(new Accent({ accent, children: new Rect({ width: px(40), height: px(20) }) }))
    const wide = layout(new Accent({ accent, children: new Rect({ width: px(180), height: px(20) }) }))
    near(named(narrow, 'StretchShape')[0].size.width, 40)
    near(named(wide, 'StretchShape')[0].size.width, 180)
    expect(named(wide, 'StretchShape')[0].size.height).toBeGreaterThan(named(narrow, 'StretchShape')[0].size.height)
    expect(wide.size.height).toBeLessThan(narrow.size.height + 10)
  }
  for (const [Line, over] of [[Overline, true], [Underline, false]] as const) {
    const f = layout(new Line({ children: 'x+y', thickness: px(2), color: '#eee' }))
    const [body, rule] = f.children
    near(f.size.height, body.fragment.size.height + 10)
    near(b(f), body.offset.y + b(body.fragment))
    near(over ? body.offset.y - rule.offset.y - 2 : rule.offset.y - body.offset.y - body.fragment.size.height, 6)
    expect(rule.fragment.draw[0].fill).toBe('#eee')
  }
  const under = layout(new Accent({ children: 'x', accent: 'utilde', under: true }))
  const [body, tilde] = under.children
  near(tilde.offset.y - body.offset.y - body.fragment.size.height, 4.8)
})

test('every stretch family scales, inherits paint, retains its form and reports narrow overflow', () => {
  for (const label of Object.keys(STRETCH)) {
    const shape = layout(new MathStretch({ label, width: px(180), color: '#fafafa', opacity: 0.6 }))
    const half = layout(new MathStretch({ label, width: px(90), font_size: px(20) }))
    near(shape.size.width, 180)
    near(half.ink!.width * 2, shape.ink!.width)
    near(half.ink!.height * 2, shape.ink!.height)
    expect(shape.ink!.width).toBeGreaterThan(150)
    expect(shape.ink!.height).toBeGreaterThan(0)
    expect(drawings(shape).length).toBeGreaterThan(0)
    expect(drawings(shape).every(d => (d.fill === '#fafafa' || d.stroke === '#fafafa') && d.opacity === 0.6)).toBe(true)
    near(shape.guides.math_axis!, shape.size.height / 2)
    const small = pass.layout(new MathStretch({ label }), make_request({ width: exact(1) }), context)
    near(small.size.width, 1)
    expect(small.overflow.right).toBeGreaterThan(0)
    const none = layout(new MathStretch({ label, thickness: px(0) }))
    expect(none.ink).toBeNull()
  }
  expect(() => layout(new MathStretch({ label: 'unknown' }))).toThrow('Unknown stretchy')
})

test('math arrows share adjustable barb curvature across arrows, harpoons and accents', () => {
  for (const label of ['xrightarrow', 'xleftarrow', 'xleftrightarrow', 'xRightarrow', 'xLeftrightarrow',
    'xtwoheadrightarrow', 'xhookleftarrow', 'xmapsto', 'xrightharpoonup', 'xleftharpoondown',
    'xrightleftharpoons', 'xrightequilibrium', 'overrightarrow', 'vec']) {
    const props = { label, width: px(180), color: '#b24', opacity: 0.5 }
    const normal = layout(new MathStretch(props)), straight = layout(new MathStretch({ ...props, head_curve: 0 }))
    expect(drawings(normal)).toEqual(drawings(layout(new MathStretch({ ...props, head_curve: 0.7 }))))
    expect(drawings(normal)).not.toEqual(drawings(straight))
    for (const head_curve of [0, 0.7, 1]) {
      const shape = layout(new MathStretch({ ...props, head_curve }))
      expect(shape.size).toEqual(normal.size)
      expect(shape.guides).toEqual(normal.guides)
      expect(shape.math).toEqual(normal.math)
      expect(drawings(shape).every(d => d.fill === 'none' && d.stroke === '#b24' && d.opacity === 0.5)).toBe(true)
      expect(render_svg(shape)).not.toMatch(/NaN|Infinity/)
    }
  }
  for (const element of [
    (head_curve: number) => new XArrow({ label: 'xRightarrow', above: 'f', below: 'g', head_curve }),
    (head_curve: number) => new Accent({ accent: 'overrightarrow', children: 'ABC', head_curve }),
    (head_curve: number) => new Accent({ accent: 'vec', children: 'v', head_curve }),
  ]) {
    const straight = layout(element(0)), curved = layout(element(0.7))
    expect(straight.size).toEqual(curved.size)
    expect(straight.guides).toEqual(curved.guides)
    expect(drawings(named(straight, 'StretchShape')[0])).not.toEqual(drawings(named(curved, 'StretchShape')[0]))
    expect(() => layout(element(2))).toThrow('curve')
  }
})

test('math arrows render through core elements with joined tips and correctly oriented harpoons', () => {
  const head_width = 2 * Math.tan(46 * Math.PI / 180), h = 0.522 * 40, t = 0.04 * 40
  const style = { stroke: '#246', fill: 'none', stroke_width: px(t),
    stroke_linecap: 'butt' as const, stroke_linejoin: 'round' as const }
  for (const label of ['xrightarrow', 'xleftarrow', 'xleftrightarrow']) for (const head_curve of [0, 0.7, 1]) {
    const shape = layout(new MathStretch({ label, width: px(180), head_curve, color: '#246' }))
    const right = label !== 'xleftarrow', from = [px(t / 2), px(h / 2)] as const, to = [px(180 - t / 2), px(h / 2)] as const
    const core = layout(new Arrow({ ...style, width: px(180), height: px(h), from: right ? from : to, to: right ? to : from,
      start_head: label === 'xleftrightarrow', head_open: true, head_curve, head_width, head_size: px((h - t) / head_width) }))
    expect(named(shape, 'Arrow')).toHaveLength(1)
    expect(named(shape, 'Arrow')[0].draw).toEqual(core.draw)
    for (const head of core.draw.slice(1) as PathDraw[]) {
      expect(head.commands.filter(c => c.kind === 'M')).toHaveLength(1)
      expect(head.commands.some(c => c.kind === 'Z')).toBe(false)
      // A single continuous path joins both barbs at the tip; separate capped
      // bands left the notch this regression is intended to catch.
      expect(head.commands.filter(c => c.kind === 'C' || c.kind === 'L').length).toBeGreaterThanOrEqual(2)
    }
  }
  for (const direction of ['left', 'right']) for (const vertical of ['up', 'down']) {
    const shape = layout(new MathStretch({ label: `x${direction}harpoon${vertical}`, width: px(180) }))
    const head = named(shape, 'Arrow')[0].draw[1] as PathDraw
    expect(head.commands.filter(c => c.kind === 'C')).toHaveLength(1)
    const endpoints = head.commands.filter(c => c.kind !== 'Z')
    expect(endpoints.every(p => vertical === 'up' ? p.y <= h / 2 + 1e-8 : p.y >= h / 2 - 1e-8)).toBe(true)
  }
  for (const label of ['xRightarrow', 'xLeftarrow', 'xLeftrightarrow', 'xlongequal']) {
    const shape = layout(new MathStretch({ label }))
    expect(named(shape, 'Line')).toHaveLength(2)
    expect(named(shape, 'ArrowHead')).toHaveLength(label === 'xlongequal' ? 0 : label === 'xLeftrightarrow' ? 2 : 1)
  }
  for (const label of ['xhookrightarrow', 'xhookleftarrow']) {
    const shape = layout(new MathStretch({ label }))
    const shaft = named(shape, 'Arrow')[0].draw[0] as PathDraw, hook = named(shape, 'Arc')[0].draw[0] as PathDraw
    expect(shaft.commands[0]).toEqual(hook.commands[0])
  }
  expect(named(layout(new MathStretch({ label: 'xrightleftharpoons' })), 'Arrow')).toHaveLength(2)
  expect(named(layout(new MathStretch({ label: 'xtwoheadrightarrow' })), 'ArrowHead')).toHaveLength(1)
  expect(named(layout(new XArrow({ above: 'f', below: 'g' })), 'Arrow')).toHaveLength(1)
  expect(named(layout(new Accent({ accent: 'vec', children: 'v' })), 'Arrow')).toHaveLength(1)
})

test('horizontal braces measure their body before labels and keep opposite scripts', () => {
  for (const over of [false, true]) {
    const plain = layout(new HorizBrace({ children: 'a+b', over }))
    const long = layout(new HorizBrace({ children: 'a+b', over, label: String.raw`\text{a very long description}` }))
    near(named(plain, 'StretchShape')[0].size.width, named(long, 'StretchShape')[0].size.width)
    expect(long.size.width).toBeGreaterThan(plain.size.width)
    const [body, brace, note] = long.children
    near(body.offset.x + body.fragment.size.width / 2, long.size.width / 2)
    near(brace.offset.x + brace.fragment.size.width / 2, long.size.width / 2)
    near(note.offset.x + note.fragment.size.width / 2, long.size.width / 2)
    near(over ? body.offset.y - brace.offset.y - brace.fragment.size.height
      : brace.offset.y - body.offset.y - body.fragment.size.height, 4)
    near(over ? brace.offset.y - note.offset.y - note.fragment.size.height
      : note.offset.y - brace.offset.y - brace.fragment.size.height, 8)
    const tex = formula(over ? String.raw`\overbrace{x}^{n}_{i}` : String.raw`\underbrace{x}_{n}^{i}`)
    expect(named(tex, 'HorizBrace')).toHaveLength(1)
    expect(named(tex, 'SupSub')).toHaveLength(1)
    expect(named(tex, 'MathSymbol')).toHaveLength(3)
  }
  expect(named(formula(String.raw`\overbrace{\frac{x}{y}}`), 'Frac')[0].size)
    .toEqual(named(formula(String.raw`\dfrac{x}{y}`), 'Frac')[0].size)
  const bracket = layout(new HorizBrace({ children: 'a+b', bracket: true }))
  expect(bracket.ink).not.toBeNull()
  const scripted = layout(new HorizBrace({ children: 'a+b', style: 'script' }))
  near(scripted.children[0].fragment.size.width, 0.7 * formula('a+b').size.width)
  const scripted_fraction = named(formula(String.raw`x^{\overbrace{\frac{x}{y}}}`), 'Frac')[0]
  near(scripted_fraction.size.height, 0.7 * named(formula(String.raw`\dfrac{x}{y}`), 'Frac')[0].size.height)
})

test('extensible arrows fit both labels, center on the axis and compensate deep upper labels', () => {
  const a = layout(new XArrow({ above: 'f', below: String.raw`\text{a much longer label}` }))
  const [shape, above, below] = a.children
  near(a.guides.math_axis!, shape.offset.y + shape.fragment.size.height / 2)
  near(a.size.width, width(below.fragment) + 28)
  for (const label of [above, below]) near(label.offset.x + width(label.fragment) / 2, a.size.width / 2)
  near(below.offset.y - shape.offset.y - shape.fragment.size.height, 4.44)
  const deep = layout(new XArrow({ above: String.raw`\frac{x}{\frac{x}{y}}` }))
  expect(deep.children[1].offset.y + deep.children[1].fragment.size.height)
    .toBeLessThan(deep.children[0].offset.y)
  for (const style of ['text', 'script'] as const) {
    const script_body = (f: Fragment) => f.children.length === 1 ? f.children[0].fragment : f
    const overset = script_body(named(formula(String.raw`a\overset{!}{=}b`, style), 'SupSub')[0])
    expect(overset.children[1].offset.y + overset.children[1].fragment.size.height).toBeLessThan(overset.children[0].offset.y)
    const underset = script_body(named(formula(String.raw`a\underset{n}{\sim}b`, style), 'SupSub')[0])
    expect(underset.children[1].offset.y).toBeGreaterThan(underset.children[0].offset.y)
    expect(formula(String.raw`a\stackrel{!}{=}b`, style).size.width).toBeCloseTo(formula(String.raw`a\overset{!}{=}b`, style).size.width, 8)
  }
})

test('phantom preserves layout and spacing without any descendant ink or overflow', () => {
  const source = new Enclose({ notation: 'xcancel', color: 'red', children: new Frac({ children: ['x', 'y'] }) })
  const body = layout(source), f = layout(new Phantom({ children: source }))
  expect(f.size).toEqual(body.size)
  expect(f.ink).toBeNull(); expect(f.children).toHaveLength(0)
  expect(f.overflow).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
  for (const [text, expected] of [[String.raw`a\phantom{+}b`, 'a+b'], [String.raw`\phantom{+}b`, '+b'],
    [String.raw`a\phantom{+b}+c`, 'a+b+c'], [String.raw`a\phantom{\scriptstyle +}b`, String.raw`a\textcolor{red}{\scriptstyle +}b`]]) {
    near(formula(text).size.width, formula(expected).size.width)
  }
  const h = layout(new Phantom({ children: source, vertical: false }))
  near(h.size.height, 0); near(width(h), width(body))
  const v = layout(new Phantom({ children: source, horizontal: false }))
  near(v.size.width, 0); near(v.size.height, body.size.height)
  const explicit = pass.layout(new Phantom({ children: source }), make_request({ width: exact(80) }), context)
  expect(explicit.ink).toBeNull(); near(width(explicit), 80)
})

test('smash suppresses top and bottom independently around the baseline, retaining ink', () => {
  const source = new Frac({ children: ['x', 'y'], style: 'display' }), body = layout(source)
  for (const [top, bottom] of [[true, true], [true, false], [false, true], [false, false]]) {
    const f = layout(new Smash({ children: source, top, bottom }))
    near(width(f), width(body))
    near(b(f), top ? 0 : b(body))
    near(f.size.height - b(f), bottom ? 0 : body.size.height - b(body))
    near(f.ink!.y - b(f), body.ink!.y - b(body))
    near(f.ink!.height, body.ink!.height)
    if (top) expect(f.overflow.top).toBeGreaterThan(0)
    if (bottom) expect(f.overflow.bottom).toBeGreaterThan(0)
  }
  const smashed = named(formula(String.raw`x+\smash{\frac{x}{y}}+z`), 'Smash')[0]
  near(smashed.size.height, 0)
  near(formula(String.raw`x+\smash{\frac{x}{y}}+z`).size.height, formula('x+z').size.height)
  const ink_only = layout(new Smash({ children: new Lap({ children: 'W' }) }))
  expect(ink_only.size).toEqual({ width: 0, height: 0 }); expect(ink_only.ink).not.toBeNull()
})

test('lap retains ink at each edge; zero advance stays distinct from negative kerns and rules', () => {
  const body = layout(new MathSymbol({ text: 'W' }))
  for (const [align, offset] of [['left', 0], ['center', -width(body) / 2], ['right', -width(body)]] as const) {
    const lap = layout(new Lap({ children: 'W', align }))
    near(width(lap), 0); near(b(lap), b(body)); near(lap.ink!.x, body.ink!.x + offset)
  }
  const plain = formula('ab').size.width
  near(formula(String.raw`a\mathrlap{W}b`).size.width, plain)
  near(formula(String.raw`a\kern-1em b`).math!.advance, plain - 40)
  near(formula(String.raw`a\rule{-1em}{1pt}b`).math!.advance, plain - 40)
  near(formula(String.raw`a\kern-1em b`).size.width, 0)
  near(named(formula(String.raw`\rule{-1em}{1pt}`), 'MathRule')[0].math!.advance, -40)
  const in_text = layout(new Text({ children: ['a', new Latex({ text: String.raw`\mathllap{W}`, strut: false }), 'b'] }))
  expect(in_text.ink).not.toBeNull()
})

test('enclosures pad borders and backgrounds; cancellation keeps natural extents and overlays ink', () => {
  const base = layout(new MathSymbol({ text: 'x' }))
  const framed = layout(new Enclose({ children: 'x', padding: px(5), thickness: px(2), background: '#ffe080', border_color: '#123456' }))
  near(framed.size.width, width(base) + 14)
  near(framed.size.height, base.size.height + 14)
  near(b(framed), b(base) + 7)
  expect(framed.draw[0].fill).toBe('#ffe080')
  expect(named(framed, 'EnclosureInk')[0].draw.every(d => d.fill === '#123456')).toBe(true)
  for (const notation of ['cancel', 'bcancel', 'xcancel', 'sout'] as const) {
    const f = layout(new Enclose({ children: 'x', notation }))
    near(f.size.height, base.size.height); near(f.size.width, width(base)); near(b(f), b(base))
    expect(f.children.at(-1)!.fragment.name).toBe('EnclosureInk')
    if (notation !== 'sout') expect(f.ink!.height).toBeGreaterThan(base.ink!.height)
  }
  const compound = layout(new Enclose({ notation: 'cancel', children: 'a+b' }))
  expect(compound.overflow.left).toBeGreaterThan(0)
  expect(compound.overflow.right).toBeGreaterThan(0)
})

test('rule dimensions, raisebox and vcenter use explicit baselines and math axes', () => {
  for (const style of ['display', 'script', 'scriptscript'] as const) {
    const rule = named(formula(String.raw`\rule[2pt]{1em}{0.6pt}`, style), 'MathRule')[0]
    near(rule.size.width, 40); near(rule.size.height, 2.4); near(b(rule), 10.4)
    const raised = named(formula(String.raw`\raisebox{2pt}{x}`, style), 'RaiseBox')[0]
    near(b(raised) - b(raised.children[0].fragment), 8)
    const lowered = layout(new RaiseBox({ children: 'x', shift: px(-10), style }))
    near(b(lowered) - b(lowered.children[0].fragment), -10)
  }
  const centered = layout(new VCenter({ children: new Rect({ width: px(20), height: px(80) }) }))
  near(centered.guides.math_axis!, 40); near(b(centered), 50)
  const empty = named(formula(String.raw`\rule{0pt}{2em}`), 'MathRule')[0]
  near(empty.size.height, 80); expect(empty.ink).toBeNull()
  const negative = named(formula(String.raw`\rule{1em}{-1pt}`), 'MathRule')[0]
  near(negative.size.width, 40); near(negative.size.height, 0); expect(negative.ink).toBeNull()
  near(formula(String.raw`a+\rule{1em}{2pt}`).size.width, formula('a+{}').size.width + 40)
})

test('poor-man bold overprints the same immutable fragment and preserves advance and classes', () => {
  const source = new MathText({ text: 'x+y' }), plain = layout(source), bold = layout(new Pmb({ children: source }))
  near(bold.size.width, plain.size.width); near(bold.size.height, plain.size.height)
  expect(bold.children[0].fragment).toBe(bold.children[1].fragment)
  expect(render_svg(bold.children[0].fragment)).toBe(render_svg(plain))
  near(bold.ink!.width, plain.ink!.width + 0.8); near(bold.ink!.height, plain.ink!.height + 0.4)
  near(formula(String.raw`a\pmb{+}b`).size.width, formula('a+b').size.width)
  near(formula(String.raw`a\pmb{=}b`).size.width, formula('a=b').size.width)
})

test('text font commands compose family, weight and shape with scoped resets and nested math', () => {
  const face_width = (face: string, text: string) => fonts.resolve(face, 400, 'normal').shape(text).advance * 40
  near(formula(String.raw`\textbf{A\textit{B}C}`).size.width,
    face_width('KaTeX_Main-Bold', 'A') + face_width('KaTeX_Main-BoldItalic', 'B') + face_width('KaTeX_Main-Bold', 'C'))
  near(formula(String.raw`\textit{A\textup{B}C}`).size.width,
    face_width('KaTeX_Main-Italic', 'A') + face_width('KaTeX_Main', 'B') + face_width('KaTeX_Main-Italic', 'C'))
  near(formula(String.raw`\emph{A\emph{B}C}`).size.width, formula(String.raw`\textit{A\textup{B}C}`).size.width)
  near(formula(String.raw`\textsf{\textbf{A}\textit{B}C}`).size.width,
    face_width('KaTeX_SansSerif-Bold', 'A') + face_width('KaTeX_SansSerif-Italic', 'B') + face_width('KaTeX_SansSerif', 'C'))
  near(formula(String.raw`\textsf{\textbf{\textit{A}}}`).size.width, face_width('KaTeX_Main-BoldItalic', 'A'))
  near(formula(String.raw`\texttt{\textbf{A}}`).size.width, face_width('KaTeX_Main-Bold', 'A'))
  near(formula(String.raw`\textbf{A\textmd{B}\textrm{C}\textnormal{D}}`).size.width,
    face_width('KaTeX_Main-Bold', 'A') + face_width('KaTeX_Main', 'B') + face_width('KaTeX_Main-Bold', 'CD'))
  near(formula(String.raw`\text{A\textup{V}}`).size.width, face_width('KaTeX_Main', 'AV'))
  near(formula(String.raw`\text{A{V}}`).size.width, face_width('KaTeX_Main', 'AV'))
  near(formula(String.raw`\texttt{a--b}`).size.width, face_width('KaTeX_Typewriter', 'a--b'))
  const mixed = formula(String.raw`\textbf{speed $x^2$ now}`)
  const scripts = named(mixed, 'SupSub')[0]
  expect(render_svg(scripts.children[0].fragment)).toBe(render_svg(named(formula('x^2', 'text'), 'SupSub')[0].children[0].fragment))
  expect(render_svg(scripts.children[1].fragment)).toBe(render_svg(layout(new MathSymbol({ text: '2', font_family: 'KaTeX_Main-Bold', style: 'script' }))))
  near(formula(String.raw`\mathbf{\text{ABC}}`).size.width, face_width('KaTeX_Main', 'ABC'))
  near(formula(String.raw`\textsf{$12$}`).size.width, formula('12').size.width)
})

test('all eighteen faces render; math alphabets and bold symbols fall back per glyph', () => {
  const shaped: [string, string][] = []
  const provider: FontProvider = { resolve(face, weight, style) {
    const font = fonts.resolve(face, weight, style)
    return { ...font, shape(text) { shaped.push([face, text]); return font.shape(text) } }
  } }
  const local = new LayoutPass({ fonts: { value: provider, version: 0 } })
  for (const face of MATH_FONTS) {
    const text = face.startsWith('KaTeX_Size') ? '(' : 'A'
    expect(local.layout(new MathSpan({ text, font_family: face })).ink).not.toBeNull()
  }
  expect(new Set(shaped.map(([face]) => face)).size).toBe(18)
  shaped.length = 0
  local.layout(new Latex({ text: String.raw`\mathcal{Ax}+\boldsymbol{\alpha+\Gamma}+\mathsfit{x}`, strut: false }))
  expect(shaped).toContainEqual(['KaTeX_Caligraphic', 'A'])
  expect(shaped).toContainEqual(['KaTeX_Math', 'x'])
  expect(shaped).toContainEqual(['KaTeX_Math-BoldItalic', 'α'])
  expect(shaped).toContainEqual(['KaTeX_Main-Bold', '+'])
  expect(shaped).toContainEqual(['KaTeX_Main-Bold', 'Γ'])
  expect(shaped).toContainEqual(['KaTeX_SansSerif-Italic', 'x'])
  shaped.length = 0
  local.layout(new TextMode({ text: 'Ax', font_family: 'KaTeX_Caligraphic' }))
  expect(shaped).toContainEqual(['KaTeX_Caligraphic', 'A']); expect(shaped).toContainEqual(['KaTeX_Main', 'x'])
  expect(() => local.layout(new TextMode({ text: '🦄' }))).toThrow('glyph')
})

test('macro arguments, declarations, local definitions and global definitions stay inside a parse', () => {
  const macros = { '\\pair': String.raw`\left\langle #1,#1\right\rangle`, '\\a': 'x' }
  const source = new Latex({ text: String.raw`\widehat{\pair{\a}}`, macros, strut: false })
  macros['\\a'] = 'z'
  near(layout(source).size.width, formula(String.raw`\widehat{\left\langle x,x\right\rangle}`).size.width)
  near(formula(String.raw`\def\a{x}{\def\a{y}\a}\a`).size.width, formula('{y}x').size.width)
  near(formula(String.raw`\newcommand{\pair}[2]{#1+#2}\pair{x}{y}+\pair{z}{w}`).size.width, formula('x+y+z+w').size.width)
  expect(() => parse_math(String.raw`\newcommand{\pair}[2][x]{#1+#2}\pair{y}`)).toThrow('parse')
  near(formula(String.raw`\def\a{x}\let\b\a\b`).size.width, formula('x').size.width)
  expect(() => parse_math(String.raw`\gdef\leaked{x}\leaked`)).not.toThrow()
  expect(() => parse_math(String.raw`\leaked`)).toThrow('Undefined control sequence')
  expect(() => parse_math(String.raw`\loop`, { macros: { '\\loop': '\\loop' } })).toThrow('expansions')
  expect(() => formula(String.raw`\href{https://example.com}{x}`)).toThrow('unsupported')
})

test('verbatim preserves syntax and visible spaces, including text size in scripts; HTML math branch and cr are explicit', () => {
  near(formula(String.raw`\verb|x^2 % ~|`).size.width, fonts.resolve('KaTeX_Typewriter', 400, 'normal').shape('x^2\u00a0%\u00a0~').advance * 40)
  const star = formula(String.raw`\verb*|a b|`)
  expect(named(star, 'TextMode')[0].label).toBe('a\u2423b')
  const nested = formula(String.raw`x^{\verb|abc|}`)
  near(named(nested, 'TextMode')[0].size.width, formula(String.raw`\verb|abc|`).size.width)
  near(formula(String.raw`\html@mathml{x}{\phase{y}}`).size.width, formula('x').size.width)
  near(formula(String.raw`a\\[2em]b`).size.width, formula('ab').size.width)
  expect(() => formula(String.raw`a\\b`, 'text')).toThrow('line break outside an array')
  expect(() => parse_math(String.raw`\text{\'{e}}`)).not.toThrow()
  expect(() => parse_math(String.raw`\'{e}`)).toThrow('parse')
})

test('decorated and suppressed sources survive reuse, exact offers and resource invalidation', () => {
  const source = new MathRow({ children: [new Accent({ accent: 'widehat', children: 'ABC' }),
    new Smash({ children: new Lap({ children: 'W', align: 'right' }) }), new XArrow({ above: 'f' })] })
  const plain = layout(source), saved = render_svg(plain)
  const narrow = pass.layout(source, make_request({ width: exact(10), height: exact(10) }), context)
  near(narrow.size.width, 10); expect(narrow.overflow.right).toBeGreaterThan(0)
  const offer = pass.layout(source, make_request({ width: available(1000) }), context)
  expect(offer.size).toEqual(plain.size)
  expect(render_svg(plain)).toBe(saved)
  const dark = pass.layout(source, natural, { style: resolve_style({ font_size: px(20), color: 'white' }) })
  near(dark.size.width * 2, plain.size.width)
  expect(drawings(dark).every(draw => draw.fill === 'white' || draw.stroke === 'white')).toBe(true)
  pass.set_resource('fonts', fonts, fonts.version + 1)
  expect(render_svg(layout(source))).toBe(saved)
})

test('all drawn TeX decoration labels and text accents survive normalization in every size style', () => {
  for (const label of Object.keys(STRETCH)) for (const style of ['display', 'text', 'script', 'scriptscript'] as const) {
    const source = label.startsWith('x') ? `A\\${label}[b]{a}B` : `\\${label}{AB}`
    const f = formula(source, style)
    expect(named(f, 'StretchShape')).toHaveLength(1)
    expect(f.ink).not.toBeNull()
  }
  for (const label of ["'", '`', '^', '~', '=', 'u', '.', '"', 'c', 'r', 'H', 'v', 'textcircled']) {
    const f = formula(`\\text{\\${label}{a}}`)
    expect(named(f, 'Accent')).toHaveLength(1)
    expect(f.ink).not.toBeNull()
  }
})

// Every node family handled by gum-1 has a named conversion/rendering case.
// More specific tests above and in ordinary/arrays cover the significant fields.
const families: [string, string][] = [
  ['mathord', 'x'], ['textord', '1'], ['atom', '+'], ['spacing', String.raw`a\ b`], ['ordgroup', '{x+y}'],
  ['font', String.raw`\mathrm{x}`], ['text', String.raw`\textbf{abc}`], ['accent', String.raw`\hat{x}`],
  ['kern', String.raw`a\kern-1pt b`], ['mclass', String.raw`a\mathrel{x}b`], ['lap', String.raw`\mathclap{x}`],
  ['htmlmathml', String.raw`\html@mathml{x}{y}`], ['styling', String.raw`\scriptstyle x`], ['supsub', 'x_i^2'],
  ['genfrac', String.raw`\frac{x}{y}`], ['underline', String.raw`\underline{x}`], ['overline', String.raw`\overline{x}`],
  ['sqrt', String.raw`\sqrt{x}`], ['accentUnder', String.raw`\underleftarrow{AB}`], ['xArrow', String.raw`A\xrightarrow[b]{a}B`],
  ['op', String.raw`\sum_0^n`], ['operatorname', String.raw`\operatorname{rank}(A)`], ['horizBrace', String.raw`\overbrace{x}^{n}`],
  ['array', String.raw`\begin{matrix}a&b\\c&d\end{matrix}`], ['leftright', String.raw`\left(x\right)`],
  ['delimsizing', String.raw`\bigl(x\bigr)`], ['color', String.raw`\textcolor{red}{x}`], ['sizing', String.raw`{\Huge x}`],
  ['mathchoice', String.raw`\mathchoice{x}{y}{z}{w}`], ['phantom', String.raw`x+\phantom{y}`],
  ['hphantom', String.raw`x\hphantom{y}`], ['vphantom', String.raw`x\vphantom{y}`], ['smash', String.raw`\smash[t]{x}`],
  ['rule', String.raw`\rule[-1pt]{1em}{1pt}`], ['raisebox', String.raw`\raisebox{2pt}{abc}`],
  ['vcenter', String.raw`\vcenter{\hbox{$x$}}`], ['hbox', String.raw`\hbox{a $x$ b}`], ['pmb', String.raw`\pmb{x}`],
  ['cr', String.raw`a\\b`], ['verb', String.raw`\verb|x^2|`], ['enclose', String.raw`\boxed{x}`],
]
for (const [family, tex] of families) test(`legacy TeX node family ${family} renders without silent omissions`, () => {
  const result = formula(tex)
  expect(result.ink).not.toBeNull()
  expect(descendants(result).flatMap(f => f.draw).length).toBeGreaterThan(0)
  expect(result.label).toBe(tex)
})
