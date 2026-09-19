import { expect, test } from 'bun:test'
import { LayoutPass, Rect, Text, Plot, Polyline, Span, Box, px, em, make_request,
  available, exact, resolve_style, render_svg, evaluate } from 'gum-jsx-core'
import type { Fragment, FontProvider, MathStyle, Child } from 'gum-jsx-core'
import * as math from '../src'
import { MathArray, MathText, MathSymbol, Frac, SupSub, Latex, Tex, createMathFonts, parse_math } from '../src'
import type { MathArrayProps, MathSyntax } from '../src'

const fonts = createMathFonts()
const pass = new LayoutPass({ fonts: { value: fonts, version: fonts.version } })
const context = { style: resolve_style({ font_size: px(40) }) }
const natural = make_request()
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 8)
const array = (props: MathArrayProps) => pass.layout(new MathArray(props), natural, context)
const formula = (text: string, style: MathStyle = 'display') => pass.layout(new Latex({ text, style, strut: false }), natural, context)
function descendants(f: Fragment): Fragment[] { return [f, ...f.children.flatMap(c => descendants(c.fragment))] }
function named(f: Fragment, name: string) { return descendants(f).filter(item => item.name === name) }
function syntax(nodes: readonly MathSyntax[]): MathSyntax[] {
  return nodes.flatMap(node => [node, ...(node.kind === 'array' ? node.rows.flatMap(row => row.flatMap(syntax))
    : 'body' in node && node.body ? syntax(node.body) : [])])
}
const cell = (width: number, height = 20) => new Rect({ width: px(width), height: px(height), fill: '#167da5', stroke: 'none' })
const row_baseline = (f: Fragment, i: number) => f.children[i].offset.y + f.children[i].fragment.guides.baseline!

test('natural columns align unequal advances without stretching their cells', () => {
  const rows = [[cell(20), cell(10), cell(30)], [cell(40), cell(30), cell(10)]]
  const f = array({ rows, cols: 'lcr', colsep: px(6) })
  near(f.size.width, 40 + 30 + 30 + 24)
  near(f.size.height, 96)
  near(f.guides.math_axis!, 48)
  near(f.guides.baseline!, 58)
  const [a, b, c, d, e, g] = f.children
  near(a.offset.x, d.offset.x)
  near(b.offset.x + 5, e.offset.x + 15)
  near(c.offset.x + 30, g.offset.x + 10)
  near(e.offset.x, 52)
  near(c.offset.x, 94)
  expect(f.children.map(item => item.fragment.size.width)).toEqual([20, 10, 30, 40, 30, 10])
  expect(f.math).toMatchObject({ advance: 124, left: 'mord', right: 'mord', italic: 0 })
  const padded = array({ rows, cols: 'lcr', colsep: px(6), outer: true })
  near(padded.size.width, f.size.width + 12)
  near(padded.children[0].offset.x, 6)
  const custom = array({ rows: [[cell(20), cell(30)]], outer: true, cols: [
    { type: 'align', align: 'l', pregap: px(2), postgap: px(3) },
    { type: 'align', align: 'r', pregap: px(7), postgap: px(11) },
  ] })
  near(custom.children[0].offset.x, 2)
  near(custom.children[1].offset.x, 32)
  near(custom.size.width, 73)
})

test('row data keeps empty cells and ragged rows; flat indented JSX chunks by ncol', () => {
  const f = array({ rows: [[null, 'x'], ['y']] })
  expect(f.children).toHaveLength(3)
  expect(f.children[0].fragment.size).toEqual({ width: 0, height: 0 })
  const y = f.children[2].fragment.math!
  near(f.children[0].offset.x, (y.advance + y.italic) / 2)
  near(f.children[1].offset.x, y.advance + y.italic + 40)
  near(f.size.height, 96)
  expect(array({ rows: [] }).size).toEqual({ width: 0, height: 0 })
  near(array({ rows: [[]] }).size.height, 48)
  const direct = evaluate(`<MathArray ncol={2} cols="rc">
    <MathText>a</MathText>
    <Frac>
      <MathText>1</MathText>
      <MathText>x</MathText>
    </Frac>
    <MathText />
    <MathText>bb</MathText>
  </MathArray>`, { scope: math })
  const actual = pass.layout(direct, natural, context)
  const expected = array({ cols: 'rc', rows: [['a', String.raw`\frac{1}{x}`], [null, 'bb']] })
  expect(actual.size).toEqual(expected.size)
  actual.children.forEach((part, i) => expect(part.offset).toEqual(expected.children[i].offset))
  expect(array({ children: [['a', 'b'], ['c', 'd']] }).size)
    .toEqual(array({ rows: [['a', 'b'], ['c', 'd']] }).size)
})

test('tall cells share row baselines and positive gaps deepen a strut before adding space', () => {
  const rows = [[new Frac({ children: ['1', 'x'], style: 'display' }), 'a'], ['b', 'c']]
  const f = array({ rows })
  near(row_baseline(f, 0), row_baseline(f, 1))
  near(row_baseline(f, 2), row_baseline(f, 3))
  expect(row_baseline(f, 2) - row_baseline(f, 0)).toBeGreaterThanOrEqual(48)
  const fraction = f.children[0]
  expect(fraction.offset.y).toBeGreaterThanOrEqual(0)
  expect(fraction.offset.y + fraction.fragment.size.height).toBeLessThanOrEqual(f.children[2].offset.y)
  const short = { rows: [['x'], ['y']] }
  const plain = array(short), positive = array({ ...short, rowgaps: [em(0.2)] }), negative = array({ ...short, rowgaps: [em(-0.2)] })
  near(positive.size.height, plain.size.height + 8)
  near(row_baseline(positive, 1) - row_baseline(plain, 1), 8)
  near(negative.size.height, plain.size.height - 8)
  near(row_baseline(negative, 1) - row_baseline(plain, 1), -8)
  const tall = { rows: [[cell(20, 120)], ['y']] }
  near(array({ ...tall, rowgaps: [em(0.2)] }).size.height, array(tall).size.height)
  const overlapping = array({ ...short, rowgaps: [em(-4)] })
  expect(overlapping.size.height).toBeGreaterThanOrEqual(0)
  expect(overlapping.overflow.top).toBeGreaterThan(0)
  const stretched = array({ ...short, stretch: 1.5 })
  near(stretched.size.height, 144)
  near(row_baseline(stretched, 1) - row_baseline(stretched, 0), 72)
})

test('multiline leading goes between rows, including in parsed aligned and gathered environments', () => {
  const one = array({ rows: [['x']], jot: true }), two = array({ rows: [['x'], ['y']], jot: true })
  near(one.size.height, 48)
  near(two.size.height, 108)
  near(row_baseline(two, 1) - row_baseline(two, 0), 60)
  for (const env of ['aligned', 'gathered', 'align*', 'gather*', 'split']) {
    const single = formula(`\\begin{${env}}x\\end{${env}}`)
    const multiple = formula(`\\begin{${env}}x\\\\y\\end{${env}}`)
    near(named(single, 'MathArray')[0].size.height, 48)
    near(named(multiple, 'MathArray')[0].size.height, 108)
  }
  const aligned = named(formula(String.raw`\begin{aligned}a&=b&c&=d\\aa&+b&cc&-d\end{aligned}`), 'MathArray')[0]
  const [, equal, , other, , plus] = aligned.children
  near(equal.offset.x + equal.fragment.children[0].offset.x, aligned.children[0].fragment.size.width
    + aligned.children[0].offset.x)
  near(equal.fragment.size.width, formula('{}=b').size.width)
  near(plus.fragment.size.width, formula('{}+b').size.width)
  expect(plus.fragment.size.width).toBeGreaterThan(formula('+b').size.width)
  const alignat = named(formula(String.raw`\begin{alignedat}{2}a&=b&c&=d\\aa&+b&cc&-d\end{alignedat}`), 'MathArray')[0]
  near(aligned.size.width - alignat.size.width, 40)
  near(other.offset.x - alignat.children[3].offset.x, 40)
})

test('smallmatrix and substack use script cells once; TeX row dimensions retain their own units', () => {
  const small = formula(String.raw`\begin{smallmatrix}a&b\\c&d\end{smallmatrix}`)
  const direct = array({ rows: [['a', 'b'], ['c', 'd']], small: true })
  near(small.size.width, direct.size.width)
  near(small.size.height, direct.size.height)
  const table = named(small, 'MathArray')[0]
  const widths = table.children.map(({ fragment }) => fragment.math!.advance + fragment.math!.italic)
  near(table.size.width - Math.max(widths[0], widths[2]) - Math.max(widths[1], widths[3]), 2 * 0.2778 * 28)
  const script = named(small, 'MathSymbol')[0], normal = named(formula('a'), 'MathSymbol')[0]
  near(script.math!.advance / normal.math!.advance, 0.7)
  const nested = formula(String.raw`x^{\substack{a\\b}}`)
  near(named(nested, 'MathSymbol')[1].math!.advance / normal.math!.advance, 0.7)
  // This table sits just above Size1's delimiter threshold. A tolerance here
  // used to accept a smaller-than-requested glyph instead of selecting Size2.
  const fenced = named(formula(String.raw`\left(\begin{smallmatrix}a&b\\c&d\end{smallmatrix}\right)`), 'Bracket')[0]
  expect(fenced.children[0].fragment.size.height).toBeGreaterThanOrEqual(table.size.height * 0.901)
  const matrix = (gap: string, style: MathStyle) => named(formula(`\\begin{matrix}x\\\\[${gap}]x\\end{matrix}`, style), 'MathArray')[0]
  for (const style of ['display', 'script', 'scriptscript'] as const) {
    near(matrix('2pt', style).size.height - matrix('0pt', style).size.height, 8)
    near(matrix('-1em', style).size.height - matrix('0em', style).size.height, -40)
  }
})

test('solid, dashed, double and intersecting rules retain precise ink and inherited paint', () => {
  const f = array({ rows: [[cell(20), cell(20)], [cell(20), cell(20)]], cols: '|c||:c|',
    colsep: px(5), outer: true, hlines: [[false, false], [true], [false]], thickness: px(2),
    color: '#ab285e', opacity: 0.6 })
  near(f.size.width, 76)
  near(f.size.height, 108)
  near(f.guides.math_axis!, 55)
  const rules = named(f, 'ArrayRules')[0]
  expect(rules.draw).toHaveLength(9)
  near(rules.ink!.x, -1)
  near(rules.ink!.width, 78)
  near(rules.ink!.y, 0)
  near(rules.ink!.height, 108)
  const [top, double, dashed, bottom, left, middle, next, vertical, right] = rules.draw
  expect(top).toMatchObject({ kind: 'rect', rect: { x: -1, y: 0, width: 78, height: 2 } })
  expect(double).toMatchObject({ kind: 'rect', rect: { y: 10 } })
  expect(bottom).toMatchObject({ kind: 'rect', rect: { y: 106 } })
  expect(left).toMatchObject({ kind: 'rect', rect: { x: -1, y: 0, height: 108 } })
  expect(middle).toMatchObject({ kind: 'rect', rect: { x: 29 } })
  expect(next).toMatchObject({ kind: 'rect', rect: { x: 37 } })
  expect(right).toMatchObject({ kind: 'rect', rect: { x: 75 } })
  for (const rule of [dashed, vertical]) {
    expect(rule.kind).toBe('path')
    if (rule.kind !== 'path') continue
    expect(rule.commands.filter(command => command.kind === 'Z').length).toBeGreaterThan(2)
    const first = rule.commands[0], last = rule.commands.at(-2)!
    if (first.kind === 'M' && last.kind === 'L') {
      if (rule === dashed) near(rule.commands.at(-3)!.kind === 'L' ? (rule.commands.at(-3) as { x: number }).x : 0, 77)
      else near(last.y, 108)
    }
  }
  expect(rules.draw.every(rule => rule.fill === '#ab285e' && rule.opacity === 0.6)).toBe(true)
  near(f.overflow.left, 1); near(f.overflow.right, 1)
  const invisible = array({ rows: [['x']], cols: '|c|', hlines: [[false], [false]], thickness: px(0) })
  expect(named(invisible, 'ArrayRules')).toHaveLength(0)
  const parsed = formula(String.raw`\begin{array}{|c||:c|}\hline\hline a&b\\\hdashline c&d\\\hline\end{array}`)
  expect(named(parsed, 'ArrayRules')[0].draw).toHaveLength(9)
})

const matrix_names = ['matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix']
const environments: [string, string, string][] = [
  ['array', '{lcr}', 'a&b&c\\\\d&e&f'], ['darray', '{lr}', String.raw`\frac12&x\\y&z`],
  ...matrix_names.flatMap(name => [[name, '', 'a&bb\\\\cc&d'], [name + '*', '[r]', 'a&bb\\\\cc&d']] as [string, string, string][]),
  ['smallmatrix', '', 'a&b\\\\c&d'], ['subarray', '{l}', 'i<n\\\\j<m'],
  ...['cases', 'dcases', 'rcases', 'drcases'].map(name => [name, '', String.raw`\frac1x&x>0\\0&x=0`] as [string, string, string]),
  ...['align', 'align*', 'aligned', 'split'].map(name => [name, '', 'a&=b\\\\aa&=c'] as [string, string, string]),
  ...['gather', 'gather*', 'gathered'].map(name => [name, '', 'a=b\\\\c=d'] as [string, string, string]),
  ...['alignat', 'alignat*', 'alignedat'].map(name => [name, '{2}', 'a&=b&c&=d\\\\e&=f&g&=h'] as [string, string, string]),
  ['equation', '', 'a=b'], ['equation*', '', String.raw`\frac1x=y`],
]
for (const [name, argument, body] of environments) test(`TeX environment ${name} preserves its cells and variants`, () => {
  const text = `\\begin{${name}}${argument}${body}\\end{${name}}`
  const f = formula(text), tables = named(f, 'MathArray')
  expect(tables).toHaveLength(1)
  expect(f.ink).not.toBeNull()
  const cells = tables[0].children.filter(child => child.fragment.name !== 'ArrayRules')
  expect(cells).toHaveLength(body.split(/\\\\|&/).length)
  if (name.endsWith('*') && matrix_names.includes(name.slice(0, -1))) {
    near(cells[0].offset.x + cells[0].fragment.size.width, cells[2].offset.x + cells[2].fragment.size.width)
  }
  expect(render_svg(f)).not.toContain('<text')
})

test('environment styles, delimiters and arraystretch reflect the completed table', () => {
  const matrix = formula(String.raw`\begin{pmatrix}\frac{1}{x}&b\\c&d\end{pmatrix}`)
  const table = named(matrix, 'MathArray')[0], bracket = named(matrix, 'Bracket')[0]
  const fences = [bracket.children[0], bracket.children.at(-1)!]
  for (const fence of fences) expect(fence.fragment.size.height).toBeGreaterThanOrEqual(table.size.height * 0.901)
  const text = formula(String.raw`\begin{cases}\frac1x&x>0\end{cases}`)
  const display = formula(String.raw`\begin{dcases}\frac1x&x>0\end{dcases}`)
  expect(named(display, 'Frac')[0].size.height).toBeGreaterThan(named(text, 'Frac')[0].size.height)
  const stretched = formula(String.raw`{\def\arraystretch{1.5}\begin{array}{c}x\\y\end{array}}`)
  near(named(stretched, 'MathArray')[0].size.height, 144)
  const scoped = formula(String.raw`\begin{matrix}\def\foo{x}\foo&y\end{matrix}`)
  expect(scoped.ink).not.toBeNull()
  expect(() => formula(String.raw`\begin{matrix}\def\foo{x}\foo&\foo\end{matrix}`)).toThrow('parse:')
  const operators = formula(String.raw`\begin{matrix}\operatorname*{rank}\nolimits_x&\operatorname{rank}_x\end{matrix}`)
  const scripts = named(operators, 'SupSub')
  near(scripts[0].size.height, scripts[1].size.height)
  const alphabets = formula(String.raw`\mathbf{\begin{matrix}x&\mathbf{x}\\\sin x&\text{word}\end{matrix}}`)
  const glyphs = named(alphabets, 'MathSymbol')
  near(glyphs[0].math!.advance, named(formula('x'), 'MathSymbol')[0].math!.advance)
  near(glyphs[1].math!.advance, named(formula(String.raw`\mathbf{x}`), 'MathSymbol')[0].math!.advance)
  expect(glyphs[0].math!.advance).not.toBe(glyphs[1].math!.advance)
  const data = syntax(parse_math(String.raw`\begin{array}{|l:r|}\hline a&b\\[-2pt]\hdashline c&d\end{array}`))
    .find(node => node.kind === 'array')!
  expect(data).toMatchObject({ kind: 'array', outer: true, rowgaps: [{ value: -2, unit: 'pt' }], hlines: [[false], [true], []] })
  const source = new Latex({ text: String.raw`\begin{matrix}x&y\end{matrix}` })
  expect(Object.isFrozen(source.props)).toBe(true)
})

test('arrays preserve explicit Gum operands, inline baselines, cache reuse and overflow under narrow offers', () => {
  let shaped = 0
  const provider: FontProvider = { resolve(face, weight, style) {
    const font = fonts.resolve(face, weight, style)
    return { ...font, shape(text) { shaped++; return font.shape(text) } }
  } }
  const local = new LayoutPass({ fonts: { value: provider, version: 0 } })
  const shared = new MathText({ text: 'f+x' })
  const rows: Child[][] = [[shared, shared], [new Frac({ children: ['1', 'x'] }), 'y']]
  const source = new MathArray({ rows, fit: false })
  rows[0][0] = 'changed'
  const f = local.layout(source, natural, context), svg = render_svg(f), count = shaped
  const offered = local.layout(source, make_request({ width: available(1) }), context)
  expect(offered.size).toEqual(f.size)
  expect(shaped).toBe(count)
  const constrained = local.layout(source, make_request({ width: exact(1), height: exact(1) }), context)
  expect(constrained.size).toEqual({ width: 1, height: 1 })
  expect(constrained.overflow.right).toBeGreaterThan(1)
  expect(constrained.overflow.bottom).toBeGreaterThan(1)
  expect(shaped).toBe(count)
  expect(f.children[0].fragment).toBe(f.children[1].fragment)
  expect(constrained.children[0].fragment.size).toEqual(f.children[0].fragment.size)
  const script = local.layout(new SupSub({ children: 'x', sub: source }), natural, context)
  near(named(script, 'MathArray')[0].children[0].fragment.size.width / f.children[0].fragment.size.width,
    formula('f+x', 'script').size.width / formula('f+x', 'text').size.width)
  expect(render_svg(f)).toBe(svg)
  const prose = pass.layout(new Text({ children: ['Matrix ', new Span({ color: '#167da5', children: new Tex({ children: source }) }), ' end'] }), natural, context)
  expect(named(prose, 'MathArray')[0].size).toEqual(f.size)
  expect(prose.size.height).toBeGreaterThanOrEqual(f.size.height)
  const plot = new Plot({ width: px(100), height: px(60), axis: false, grid: false, margin: px(0),
    xlim: [0, 1], ylim: [0, 1], children: new Polyline({ points: [[0, 0], [1, 1]] }) })
  const text = new Text({ width: px(90), font_size: px(18), text: 'One line and another line.' })
  const mixed = array({ rows: [[plot, text], [shared, cell(24)]], style: 'script' })
  expect(named(mixed, 'Plot')[0].size).toEqual({ width: 100, height: 60 })
  expect(named(mixed, 'Text')[0].size.width).toBe(90)
  expect(named(mixed, 'Text')[0].children.length).toBeGreaterThan(1)
  // Percentage-sized operands opt into allocated layout instead of natural fitting.
  const relative = new MathArray({ fit: false, rows: [[new Box({ width: 0.5, height: px(10) })]] })
  const inside = pass.layout(relative, make_request({ width: exact(200) }), context)
  expect(inside.children[0].fragment.size.width).toBe(100)
  expect(() => pass.layout(relative, make_request({ width: available(200) }), context)).toThrow('definite')
})

test('invalid tables and deferred tags/CD fail visibly without breaking subsequent renders', () => {
  for (const props of [{ ncol: 0 }, { ncol: 1.5 }, { stretch: 0 }, { stretch: Infinity },
    { cols: 'cx' }, { thickness: px(-1) }, { rows: [['x']], children: 'y' },
    { rows: [['x']], rowgaps: [em(1), em(2)] }, { rows: [], hlines: [[], []] }] as MathArrayProps[]) {
    expect(() => array(props)).toThrow()
  }
  for (const text of [String.raw`\begin{CD}a\end{CD}`, String.raw`\begin{equation}x\tag{1}\end{equation}`,
    String.raw`\begin{align*}a&=b\tag{A}\end{align*}`, String.raw`x\tag{1}`]) {
    expect(() => formula(text)).toThrow('unsupported:')
    expect(pass.layout(new Latex({ text, on_error: 'render' })).label).toContain('unsupported:')
  }
  for (const text of [String.raw`\begin{matrix}x\end{array}`, String.raw`\begin{array}{q}x\end{array}`,
    String.raw`\begin{alignedat}{1}a&b&c\end{alignedat}`]) expect(() => formula(text)).toThrow('parse:')
  expect(() => formula(String.raw`\begin{align}a&=b\end{align}`, 'text')).toThrow('display mode')
  const numbered = formula(String.raw`\begin{align}a&=b\\c&=d\end{align}`)
  const starred = formula(String.raw`\begin{align*}a&=b\\c&=d\end{align*}`)
  expect(numbered.size).toEqual(starred.size)
  expect(formula(String.raw`\substack{i<n\\j<m}`).ink).not.toBeNull()
})
