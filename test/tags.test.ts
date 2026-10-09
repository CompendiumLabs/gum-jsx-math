import { expect, test } from 'bun:test'
import { LayoutPass, make_request, px, resolve_style } from '@gum-jsx/core'
import type { Fragment, Placement } from '@gum-jsx/core'
import { Latex, MathArray, createMathFonts, mathToSvg, parse_math } from '../src'

const pass = new LayoutPass({ fonts: { value: createMathFonts(), version: 0 } })
const context = { style: resolve_style({ font_size: px(40) }) }
const formula = (text: string) => pass.layout(new Latex({ children: text, strut: false }), make_request(), context)
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 8)
const baseline = (child: Placement) => child.offset.y + child.fragment.guides.baseline!

// Locate a table without depending on the surrounding TeX group wrappers.
function table(fragment: Fragment): Fragment | undefined {
  if (fragment.name === 'MathArray') return fragment
  return fragment.children.map(child => table(child.fragment)).find(Boolean)
}

test.each([
  [String.raw`x=1\tag{1.16}`, '(1.16)'],
  [String.raw`x=1\tag*{1.16}`, '1.16'],
  [String.raw`x=1\tag{\def\labeltext{1.16}\labeltext}`, '(1.16)'],
  [String.raw`x=1\tag{A{.}2}`, '(A.2)'],
])('renders the parsed label in %s', (source, label) => {
  const parsed = parse_math(source)[0]
  expect(parsed.kind).toBe('tag')
  if (parsed.kind !== 'tag') throw new Error('Expected a tagged equation')
  expect(parsed.body.length).toBeGreaterThan(0)
  expect(parsed.tag.length).toBeGreaterThan(0)
  const svg = mathToSvg(source, { text_mode: 'live' })
  expect(svg).toContain(`>${label}</text>`)
  if (source.includes('tag*')) expect(svg).not.toContain(`>(${label})</text>`)
  expect(mathToSvg(source)).not.toContain('<text')
})

test.each(['x', String.raw`\frac{1}{x}`, String.raw`\begin{aligned}a&=b\\c&=d\end{aligned}`])(
  'adds a natural two-em gap without rescaling %s', source => {
    const plain = formula(source)
    const tagged = formula(source + String.raw`\tag{1.16}`)
    const row = tagged.children[0].fragment
    const [body, gap, tag] = row.children
    expect(body.fragment.size).toEqual(plain.size)
    near(gap.fragment.size.width, 80)
    near(tag.offset.x - body.fragment.size.width, 80)
    near(baseline(body), baseline(tag))
    near(tagged.size.width, tag.offset.x + tag.fragment.size.width)
    const ink = tagged.ink!
    expect(ink.x + ink.width).toBeLessThanOrEqual(tagged.size.width + 1e-8)
  },
)

test('row tags share a right edge and retain the original equation columns', () => {
  const rows = [String.raw`a&=b`, String.raw`aa&=c\notag`, String.raw`d&=\frac{1}{x}`]
  const plain = table(formula(`\\begin{align}${rows.join('\\\\')}\\end{align}`))!
  const source = `\\begin{align}${rows[0]}\\tag{1.16}\\\\${rows[1]}\\\\${rows[2]}\\tag*{A}\\end{align}`
  const tagged = table(formula(source))!
  expect(tagged.children).toHaveLength(8)
  for (let i = 0; i < 6; i++) expect(tagged.children[i]).toEqual(plain.children[i])
  const [first, last] = tagged.children.slice(6)
  near(baseline(first), baseline(tagged.children[0]))
  near(baseline(last), baseline(tagged.children[4]))
  near(first.offset.x + first.fragment.size.width, tagged.size.width)
  near(last.offset.x + last.fragment.size.width, tagged.size.width)
  near(first.offset.x - plain.size.width, 80)
  expect(tagged.size.height).toBe(plain.size.height)

  const parsed = parse_math(source)[0]
  expect(parsed.kind).toBe('array')
  if (parsed.kind === 'array') expect(parsed.tags?.[1]).toBeNull()
})

test.each(['equation', 'equation*', 'gather', 'gather*', 'align', 'align*', 'alignat', 'alignat*'])(
  'supports explicit tags in %s', environment => {
    const argument = environment.startsWith('alignat') ? '{1}' : ''
    const body = environment.startsWith('align') ? 'x&=1' : 'x=1'
    const source = `\\begin{${environment}}${argument}${body}\\tag{1.16}\\end{${environment}}`
    expect(table(formula(source))).toBeDefined()
    expect(mathToSvg(source, { text_mode: 'live' })).toContain('>(1.16)</text>')
  },
)

test('tag content retains text styling, nested math, and explicit operator limits', () => {
  const source = String.raw`x\tag{\textbf{A} $\operatorname*{rank}\nolimits_x$}`
  const equivalent = String.raw`x\tag{\textbf{A} $\operatorname{rank}_x$}`
  expect(mathToSvg(source)).toBe(mathToSvg(equivalent))
  expect(mathToSvg(source, { text_mode: 'live' })).toContain('KaTeX_Main-Bold')
  const row = String.raw`\begin{align}x&=1\tag{$\operatorname*{rank}\nolimits_x$}\end{align}`
  expect(mathToSvg(row)).toBe(mathToSvg(row.replace(
    String.raw`\operatorname*{rank}\nolimits`, String.raw`\operatorname{rank}`)))
})

test('array tag extents reserve row space and empty tag slots reserve no column', () => {
  const rows = [['x'], ['y']]
  const layout = (tags?: readonly (string | null)[]) => pass.layout(
    new MathArray({ children: rows, tags }), make_request(), context)
  const plain = layout(), empty = layout([null, null])
  expect(empty.size).toEqual(plain.size)
  const tagged = layout([String.raw`\dfrac{1}{\dfrac{2}{3}}`, 'A'])
  expect(tagged.size.height).toBeGreaterThan(plain.size.height)
  const [first, second] = tagged.children.slice(2)
  near(baseline(first), baseline(tagged.children[0]))
  near(baseline(second), baseline(tagged.children[1]))
  expect(second.offset.y).toBeGreaterThanOrEqual(first.offset.y + first.fragment.size.height)
  expect(() => layout(['A', 'B', 'C'])).toThrow('more tags than rows')
})

test('tag parsing preserves invalid-input errors and does not leak between renders', () => {
  expect(() => parse_math(String.raw`x\tag{1}`, { display: false })).toThrow('display equations')
  for (const source of [String.raw`x\tag{1}\tag{2}`, String.raw`x\tag{`]) {
    expect(() => formula(source)).toThrow('parse:')
  }
  const plain = mathToSvg('x')
  mathToSvg(String.raw`x\tag{1.16}`)
  expect(mathToSvg('x')).toBe(plain)
})
