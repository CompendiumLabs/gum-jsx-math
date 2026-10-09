import { expect, test } from 'bun:test'
import { LayoutPass, px, render_svg } from '@gum-jsx/core'
import type { Fragment, MathContext } from '@gum-jsx/core'
import { KatexMathFontProvider, DEFAULT_MATH_FONTS, createMathFonts, parse_math,
  mathToSvg, mathToSvgAsync, mathToElementAsync, Latex, MathSpan, MathSymbol,
  MathRule, MathSpacer, Frac, MathOp, Bracket, MathStretch } from '../src'
import type { MathFontProvider } from '../src'

// Share the glyph registry, but keep each provider and its caches pass-local.
const fonts = createMathFonts()
function make_pass(provider?: MathFontProvider) {
  return new LayoutPass({ fonts: { value: fonts, version: fonts.version },
    ...(provider ? { math_fonts: { value: provider, version: 0 } } : {}) })
}
function fragments(fragment: Fragment): Fragment[] {
  return [fragment, ...fragment.children.flatMap(child => fragments(child.fragment))]
}

test('the implicit and explicit KaTeX providers produce identical formulas', () => {
  const implicit = make_pass(), explicit = make_pass(new KatexMathFontProvider())
  const formulas = [
    String.raw`\boldsymbol{x+\alpha}+\mathbb{R}+\mathcal{ABC}`,
    String.raw`\left(\frac{x^2}{\sqrt[3]{y}}\right)+\sum_{i=0}^{n}i+\oiint f`,
    String.raw`\widehat{ABC}+\overbrace{x+y}^{n}+A\xrightarrow[g]{f}B`,
    String.raw`\textsf{\textbf{bold}\textit{italic}}+\texttt{a--b}+\operatorname{rank}(A)`,
  ]
  for (const children of formulas) {
    const source = new Latex({ children })
    expect(explicit.layout(source)).toEqual(implicit.layout(source))
  }
})

test('provider metrics control glyph axes, scaling, ex lengths, and rules', () => {
  class Metrics extends KatexMathFontProvider {
    override readonly axis_height = 0.4
    override readonly x_height = 0.6
    override readonly rule_thickness = 0.08
    override font_scale(context: MathContext) { return super.font_scale(context) * 1.5 }
    override metrics(context: MathContext) { return { ...super.metrics(context), rule: 0.09 } }
  }
  const pass = make_pass(new Metrics()), ordinary = make_pass()
  const source = new MathSymbol({ children: 'x', font_size: px(20) })
  const glyph = pass.layout(source)
  expect(glyph.math!.advance).toBeCloseTo(ordinary.layout(source).math!.advance * 1.5, 9)
  expect(glyph.guides.baseline! - glyph.guides.math_axis!).toBeCloseTo(12, 9)
  expect(pass.layout(new MathSpacer({ dimension: { value: 2, unit: 'ex' }, font_size: px(20) })).math!.advance)
    .toBeCloseTo(36, 9)
  expect(pass.layout(new MathRule({ font_size: px(20) })).size.height).toBeCloseTo(2.4, 9)
  const fraction = pass.layout(new Frac({ children: ['x', 'y'], font_size: px(20) }))
  const rules = fragments(fraction).filter(fragment => fragment.draw.some(draw => draw.kind === 'rect'))
  expect(rules).toHaveLength(1)
  expect(rules[0].size.height).toBeCloseTo(2.7, 9)
})

test('provider replacement reparses nested operands without changing other passes', () => {
  class BoldRoman extends KatexMathFontProvider {
    override font_command(command: string) {
      return command === 'mathrm' ? 'KaTeX_Main-Bold' : super.font_command(command)
    }
  }
  const provider = new BoldRoman(), pass = make_pass(), other = make_pass()
  const source = new Frac({ children: [String.raw`\mathrm{x}`, String.raw`\mathrm{y}`] })
  const original = pass.layout(source)
  expect(pass.layout(source)).toBe(original)
  pass.set_resource('math_fonts', provider, 0)
  const changed = pass.layout(source)
  expect(changed).not.toEqual(original)
  expect(changed).toEqual(other.layout(new Frac({ children: [String.raw`\mathbf{x}`, String.raw`\mathbf{y}`] })))
  expect(other.layout(source)).toEqual(original)
  expect(parse_math(String.raw`\mathrm{x}`, { math_fonts: provider })[0].font_family).toBe('KaTeX_Main-Bold')
  pass.set_resource('math_fonts', DEFAULT_MATH_FONTS, 0)
  expect(pass.layout(source)).toEqual(original)
})

test('version changes invalidate cached glyph metrics', () => {
  class Corrections extends KatexMathFontProvider {
    correction = 0.1
    override italic_correction() { return this.correction }
  }
  const provider = new Corrections(), pass = make_pass(provider)
  const source = new MathSpan({ children: 'x', font_size: px(20) })
  const first = pass.layout(source)
  expect(first.math!.italic).toBe(2)
  provider.correction = 0.3
  pass.set_resource('math_fonts', provider, 1)
  expect(pass.layout(source).math!.italic).toBe(6)
  expect(first.math!.italic).toBe(2)
})

test('operator, delimiter, and decoration selection belongs to the provider', () => {
  class Variants extends KatexMathFontProvider {
    override operator_font(text: string) { return super.operator_font(text, false) }
    override delimiter_fonts() { return [{ face: 'KaTeX_Size4', styles: ['text' as const] }] }
    override stretch_metrics(label: string) { return { ...super.stretch_metrics(label), min_width: 4 } }
  }
  const pass = make_pass(new Variants()), ordinary = make_pass()
  expect(pass.layout(new MathOp({ children: 'sum', style: 'display' })))
    .toEqual(ordinary.layout(new MathOp({ children: 'sum', style: 'text' })))
  pass.set_resource('text_mode', 'live', 'live')
  const bracket = render_svg(pass.layout(new Bracket({ children: 'x' })))
  expect(bracket).toContain('KaTeX_Size4')
  expect(bracket).not.toContain('KaTeX_Main')
  expect(pass.layout(new MathStretch({ label: 'overbrace', font_size: px(20) })).size.width).toBe(80)
})

test('text selection and export helpers use the same provider', async () => {
  class BoldText extends KatexMathFontProvider {
    override text_font() { return 'KaTeX_Main-Bold' }
  }
  const provider = new BoldText(), source = String.raw`\text{abc}`
  const expected = mathToSvg(String.raw`\textbf{abc}`, { fonts })
  expect(mathToSvg(source, { fonts, math_fonts: provider })).toBe(expected)
  expect(await mathToSvgAsync(source, { fonts, math_fonts: provider })).toBe(expected)
  const pass = make_pass()
  const element = await mathToElementAsync(source, { pass, math_fonts: provider })
  expect(render_svg(pass.layout(element))).toBe(expected)
  // A reused pass retains its provider when the next export omits the option.
  expect(mathToSvg(source, { pass })).toBe(expected)
  expect(mathToSvg(source, { fonts })).not.toBe(expected)
})
