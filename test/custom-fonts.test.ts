import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { LayoutPass, render_svg } from '@gum-jsx/core'
import type { FontProvider, Fragment } from '@gum-jsx/core'
import { createMathFonts, KatexMathFontProvider, Latex, MATH_FONT_PATHS } from '../src'
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
