import { test, expect } from 'bun:test'
import { Svg, LayoutPass, evaluate, render_svg, THEMES } from 'gum-jsx-core'
import type { Fragment } from 'gum-jsx-core'
import * as math from '../src/index'

function drawings(fragment: Fragment): Fragment['draw'][number][] {
  return [...fragment.draw, ...fragment.children.flatMap(child => drawings(child.fragment))]
}

test('math glyphs, rules, enclosures, and delimiters resolve inherited theme paints', () => {
  const child = evaluate(`
    <VStack>
      <MathText>
        <Frac>
          <Sqrt>x</Sqrt>
          <MathText>y</MathText>
        </Frac>
      </MathText>
      <MathText>
        <Enclose background="theme:area" border-color="theme:border">x</Enclose>
      </MathText>
      <MathText>
        <Overline fill="theme:accent">x</Overline>
      </MathText>
      <MathRule width={px(12)} thickness={px(2)} fill="theme:accent" />
      <MathText>
        <Bracket right-color="theme:muted">x</Bracket>
      </MathText>
      <MathText color="tomato">z</MathText>
    </VStack>
  `, { scope: math })
  const fonts = math.createMathFonts()
  const pass = new LayoutPass({ fonts: { value: fonts, version: fonts.version } })
  const roots = (['light', 'dark'] as const).map(theme => new Svg({ theme, children: child }))
  const fragments = roots.map(root => pass.layout(root))
  for (const [i, theme] of (['light', 'dark'] as const).entries()) {
    const fragment = fragments[i]!, paints = drawings(fragment)
    for (const key of ['foreground', 'area', 'border', 'accent', 'muted'] as const) {
      expect(paints.some(paint => paint.fill === THEMES[theme][key])).toBe(true)
    }
    expect(paints.some(paint => paint.fill === 'tomato')).toBe(true)
    expect(render_svg(fragment)).not.toContain('theme:')
    expect(pass.layout(roots[i]!)).toBe(fragment)
  }
})
