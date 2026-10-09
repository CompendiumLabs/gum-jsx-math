import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { LayoutPass, render_svg, Svg, Text, Span, resolve_style, px } from '@gum-jsx/core'
import type { FontProvider, Fragment } from '@gum-jsx/core'
import { createMathFonts, KatexMathFontProvider, Latex, MathText, TextMode, MATH_FONT_PATHS,
  mathToSvg, mathToSvgAsync } from '../src'
import { math_alphabet } from '../src/alphabets'

// Unicode's exceptional letters and Greek variants must retain their meanings.
test('math alphabets encode letters and digits without changing punctuation', () => {
  expect(math_alphabet('Axh Γαϵϕ ∂ + 12', 'italic')).toBe('𝐴𝑥ℎ 𝛤𝛼𝜖𝜙 𝜕 + 12')
  expect(math_alphabet('CHNPQRZ ax09 + ∞', 'double-struck')).toBe('ℂℍℕℙℚℝℤ 𝕒𝕩𝟘𝟡 + ∞')
})

// Coverage can opt into alphabets unavailable in KaTeX's corresponding face.
test('custom glyph selection keeps real font and character identities', () => {
  const base = createMathFonts(), provider = new KatexMathFontProvider('Custom Math')
  const available = new Set([...'𝑥ℎ𝛼ℝ𝕩𝟙+'])
  const fonts: FontProvider = { resolve(family, weight, style) {
    if (family !== 'Custom Math') return base.resolve(family, weight, style)
    return { ...base.resolve('KaTeX_Main', weight, style),
      has_glyphs: text => [...text].every(char => available.has(char)) }
  } }
  for (const [face, text, expected] of [
    ['KaTeX_Math', 'x', '𝑥'], ['KaTeX_Math', 'h', 'ℎ'], ['KaTeX_Math', 'α', '𝛼'],
    ['KaTeX_AMS', 'R', 'ℝ'], ['KaTeX_AMS', 'x', '𝕩'], ['KaTeX_AMS', '1', '𝟙'],
    ['KaTeX_Main', '+', '+'],
  ]) {
    expect(provider.glyph_font(face, text, fonts)).toEqual({ face: 'Custom Math', text: expected })
  }
  const selected = provider.symbol_font({ text: 'x', mode: 'math', family: 'mathord',
    requested: 'KaTeX_AMS', inherited: 'IBM Plex Sans' }, fonts)
  expect(provider.glyph_font(selected.face, 'x', fonts)).toEqual({ face: 'Custom Math', text: '𝕩' })
  const scoped = new KatexMathFontProvider()
  const choice = scoped.symbol_font({ text: 'x', mode: 'math', family: 'mathord',
    requested: 'KaTeX_AMS', inherited: 'IBM Plex Sans', math_font: 'Custom Math' }, fonts)
  expect(scoped.glyph_font(choice.face, 'x', fonts, 'Custom Math')).toEqual({ face: 'Custom Math', text: '𝕩' })

  // Missing glyphs and unsupported alphabets/operators retain their bundled face.
  for (const [face, text] of [['KaTeX_Math', 'z'], ['KaTeX_Main-Bold', 'x'],
    ['KaTeX_Size2', '∫'], ['KaTeX_Caligraphic', 'A']]) {
    expect(provider.glyph_font(face, text, fonts)).toEqual({ face, text })
  }
})

function drawings(fragment: Fragment): Fragment['draw'][number][] {
  return [...fragment.draw, ...fragment.children.flatMap(child => drawings(child.fragment))]
}

test('custom outlines and live output use the same actual font', () => {
  const fonts = createMathFonts()
  fonts.register('Custom Math', readFileSync(MATH_FONT_PATHS.KaTeX_Main))
  const pass = new LayoutPass({
    fonts: { value: fonts, version: fonts.version },
    math_fonts: { value: new KatexMathFontProvider('Custom Math'), version: 0 },
  })
  const source = new Latex({ children: String.raw`\mathrm{A}+x` })
  const outlined = pass.layout(source)
  expect(render_svg(outlined)).not.toContain('<text ')
  pass.set_resource('text_mode', 'live', 'live')
  const live = pass.layout(source)
  expect(live.size).toEqual(outlined.size)
  const runs = drawings(live).filter(draw => draw.kind === 'text')
  expect(runs.map(draw => [draw.text, draw.font_family])).toEqual([
    ['A', 'Custom Math'], ['+', 'Custom Math'], ['x', 'KaTeX_Math'],
  ])
})

// Reuse the same source objects across scopes to exercise layout/preparation keys.
test('math-font scopes override the provider family without leaking to prose or siblings', () => {
  const fonts = createMathFonts()
  for (const family of ['Math A', 'Math B', 'Math Default']) {
    fonts.register(family, readFileSync(MATH_FONT_PATHS.KaTeX_Main))
  }
  class Provider extends KatexMathFontProvider { override readonly axis_height = 0.4 }
  const pass = new LayoutPass({
    fonts: { value: fonts, version: fonts.version },
    math_fonts: { value: new Provider('Math Default'), version: 0 },
    text_mode: { value: 'live', version: 0 },
  })
  const shared = new MathText({ children: String.raw`\mathrm{A}`, font_size: px(20) })
  const source = new Svg({ math_font: 'Math A', font_family: 'IBM Plex Mono', children: new Text({
    children: ['prose ', shared,
      new Span({ math_font: 'Math B', children: shared }), shared],
  }) })
  const families = (fragment: Fragment) => drawings(fragment)
    .filter(draw => draw.kind === 'text').map(draw => draw.font_family)
  expect(families(pass.layout(source))).toEqual(['IBM Plex Mono', 'Math A', 'Math B', 'Math A'])
  expect(families(pass.layout(shared))).toEqual(['Math Default'])
  const scoped = pass.layout(shared, undefined, { style: resolve_style({ math_font: 'Math B' }) })
  expect(families(scoped)).toEqual(['Math B'])
  expect(scoped.guides.baseline! - scoped.guides.math_axis!).toBeCloseTo(8, 9)
  // Flattened math sequences and literal text spans carry their own style too.
  const row = new MathText({ math_font: 'Math A', children: [shared,
    new MathText({ math_font: 'Math B', children: shared }), shared] })
  expect(families(pass.layout(row))).toEqual(['Math A', 'Math B', 'Math A'])
  const text = new TextMode({ math_font: 'Math A', children: ['A',
    new Span({ math_font: 'Math B', children: 'A' }), 'A'] })
  expect(families(pass.layout(text))).toEqual(['Math A', 'Math B', 'Math A'])
})

test('standalone exports accept math_font and preserve the provider fallback', async () => {
  const fonts = createMathFonts()
  fonts.register('Custom Math', readFileSync(MATH_FONT_PATHS.KaTeX_Main))
  const math_fonts = new KatexMathFontProvider('Custom Math')
  const source = String.raw`\frac{\mathrm{A}}{\text{AB}}+x`
  const expected = mathToSvg(source, { fonts, math_fonts })
  expect(mathToSvg(source, { fonts, math_font: 'Custom Math' })).toBe(expected)
  expect(await mathToSvgAsync(source, { fonts, math_font: 'Custom Math' })).toBe(expected)
  const normal = mathToSvg(source, { fonts })
  expect(mathToSvg(source, { fonts, math_fonts, math_font: 'KaTeX_Main' })).toBe(normal)
  expect(() => mathToSvg(source, { fonts, math_font: 'Missing Font' })).toThrow('Missing Font')
})
