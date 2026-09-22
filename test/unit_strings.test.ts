import { expect, test } from 'bun:test'
import { LayoutPass, em, evaluate, make_request, px, render_svg } from 'gum-jsx-core'
import * as math from '../src'

const fonts = math.createMathFonts()
function pass() { return new LayoutPass({ fonts: { value: fonts, version: fonts.version } }) }

test('math spacing accepts unit strings alongside named spaces and signed advances', () => {
  const engine = pass()
  for (const style of ['text', 'script', 'scriptscript'] as const) {
    const layout = (advance: math.MathSpace) => engine.layout(new math.MathSpacer({
      advance, style, font_size: '20px',
    }), make_request(), { reference: { width: 200 } })
    for (const [actual, expected] of [
      ['1em', em(1)], ['-0.5em', em(-0.5)], ['2px', px(2)],
      ['50%', 0.5], ['thin', em(3 / 18)], ['quad', em(1)],
    ] as const) {
      expect(layout(actual)).toEqual(layout(expected))
    }
    expect(() => layout('bad' as math.MathSpace)).toThrow('MathSpacer.advance: expected a length')
  }
})

test('math JSX strings resolve rules, arrays, and padding without changing rendered output', () => {
  const strings = evaluate(`
    <Svg font-size="24px">
      <MathRow fit={false}>
        <MathBox style="script" padding={{ h: "1em", v: "6px" }}>
          <Rect width="20px" height="10px" />
        </MathBox>
        <MathRule width="80px" thickness="6px" />
        <Frac thickness="3px" padding="8px">
          <Rect width="20px" height="10px" />
          <Rect width="20px" height="10px" />
        </Frac>
        <MathArray cols="cc" colsep="8px" thickness="3px">
          <MathSymbol>x</MathSymbol>
          <MathSymbol>y</MathSymbol>
        </MathArray>
      </MathRow>
    </Svg>
  `, { scope: math })
  const helpers = evaluate(`
    <Svg font-size={px(24)}>
      <MathRow fit={false}>
        <MathBox style="script" padding={{ h: em(1), v: px(6) }}>
          <Rect width={px(20)} height={px(10)} />
        </MathBox>
        <MathRule width={px(80)} thickness={px(6)} />
        <Frac thickness={px(3)} padding={px(8)}>
          <Rect width={px(20)} height={px(10)} />
          <Rect width={px(20)} height={px(10)} />
        </Frac>
        <MathArray cols="cc" colsep={px(8)} thickness={px(3)}>
          <MathSymbol>x</MathSymbol>
          <MathSymbol>y</MathSymbol>
        </MathArray>
      </MathRow>
    </Svg>
  `, { scope: math })
  const engine = pass()
  expect(render_svg(engine.layout(strings))).toBe(render_svg(engine.layout(helpers)))
})

test('standalone math exports accept string dimensions, fonts, and padding', () => {
  expect(math.mathToSvg('x^2 + y', { width: '320px', height: '240px', font_size: '24px',
    padding: { h: '3px', v: '0.5em' } }))
    .toBe(math.mathToSvg('x^2 + y', { width: px(320), height: px(240), font_size: px(24),
      padding: { h: px(3), v: em(0.5) } }))
})
