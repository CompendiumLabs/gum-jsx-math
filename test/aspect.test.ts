import { expect, test } from 'bun:test'
import { Element, LayoutPass, px, render_svg, make_request, exact } from '@gum-jsx/core'
import { MathSymbol, MathText, MathRow, MathCol, MathBox, Latex, Tex,
  Frac, Sqrt, SupSub, createMathFonts } from '../src'

const fonts = createMathFonts()
const pass = new LayoutPass({ fonts: { value: fonts, version: fonts.version } })

test('math elements use the shared aspect allocation without changing glyph scale', () => {
  const sources = [
    new MathSymbol({ children: 'x' }), new MathText({ children: 'x' }),
    new MathRow({ children: 'x' }), new MathCol({ children: ['x', 'y'] }),
    new MathBox({ children: 'x' }), new Latex({ children: 'x^2' }), new Tex({ children: 'x^2' }),
    new Frac({ children: ['1', '2'] }), new Sqrt({ children: 'x' }),
    new SupSub({ children: 'x', sup: '2' }),
  ]
  for (const source of sources) {
    const sized = new Element(source.type, { ...source.props, width: px(160), aspect: 2 })
    const fixed = new Element(source.type, { ...source.props, width: px(160), height: px(80) })
    const result = pass.layout(sized)
    expect(result.size).toEqual({ width: 160, height: 80 })
    expect(render_svg(result)).toBe(render_svg(pass.layout(fixed)))
    expect(pass.layout(sized)).toBe(result)
    expect(pass.layout(sized, make_request({ width: exact(40), height: exact(20) })).size)
      .toEqual({ width: 40, height: 20 })
  }
  const glyph = pass.layout(new MathSymbol({ children: 'x', aspect: 1 }))
  const natural = pass.layout(new MathSymbol({ children: 'x' }))
  expect(glyph.size.width).toBeCloseTo(glyph.size.height, 10)
  expect(glyph.draw).toEqual(natural.draw)
  expect(glyph.guides).toEqual(natural.guides)
  expect(glyph.math!.advance).toBe(glyph.size.width)
})
