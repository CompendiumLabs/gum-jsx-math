import assert from 'node:assert/strict'
import { LayoutPass, Text, px, render_element, render_svg } from '@gum-jsx/core'
import { Latex, Tex, createMathFonts, mathToSvg, parse_math } from '../../src'
import type { BenchmarkSetup } from './runner'

const formulas = {
  'quadratic': String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
  'nested-fractions': String.raw`\frac{1}{1+\frac{x^2}{2+\frac{x^2}{3+\frac{x^2}{4+\frac{x^2}{5}}}}}`,
  'operators': String.raw`\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6},\qquad \int_0^\infty e^{-x^2}\,dx=\frac{\sqrt{\pi}}{2}`,
  'matrix-8x8': String.raw`\begin{pmatrix}` + Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 8 }, (_, col) => `a_{${row + 1}${col + 1}}`).join(' & ')
  ).join(String.raw` \\ `) + String.raw`\end{pmatrix}`,
}

export const cases: Record<string, BenchmarkSetup> = {}
for (const [name, source] of Object.entries(formulas)) {
  cases[`math/parse/${name}`] = () => {
    assert.ok(parse_math(source).length > 0)
    return () => parse_math(source)
  }
  cases[`math/layout/${name}`] = () => {
    const element = new Latex({ children: source, font_size: px(24) }), fonts = createMathFonts()
    render_element(element, { fonts })
    // Parsing and math-tree creation belong to each fresh pass's preparation.
    return () => new LayoutPass({ fonts: { value: fonts, version: fonts.version } }).layout(element)
  }
  cases[`math/svg/${name}`] = () => {
    const { fragment, svg } = render_element(new Latex({ children: source }), { fonts: createMathFonts() })
    assert.ok(svg.includes('<path') && fragment.size.width > 0)
    return () => render_svg(fragment)
  }
}
cases['math/render/quadratic-warm-fonts'] = () => {
  const fonts = createMathFonts()
  mathToSvg(formulas.quadratic, { fonts })
  return () => mathToSvg(formulas.quadratic, { fonts })
}
cases['math/render/quadratic-new-fonts'] = () => () => mathToSvg(formulas.quadratic)
cases['math/cache/matrix-8x8-hit'] = () => {
  const fonts = createMathFonts(), element = new Latex({ children: formulas['matrix-8x8'] })
  const pass = new LayoutPass({ fonts: { value: fonts, version: fonts.version } })
  const fragment = pass.layout(element)
  assert.equal(pass.layout(element), fragment)
  assert.ok(pass.stats.hits > 0)
  return () => pass.layout(element)
}
cases['math/render/inline-prose-20-formulas'] = () => {
  const fonts = createMathFonts()
  const element = new Text({
    width: px(700), font_size: px(18),
    children: Array.from({ length: 20 }, (_, i) => [
      `Term ${i + 1} contributes `,
      new Tex({ children: String.raw`\frac{x^{${i + 1}}}{${i + 1}}` }),
      ' to the expansion. ',
    ]).flat(),
  })
  render_element(element, { fonts })
  return () => render_element(element, { fonts })
}
