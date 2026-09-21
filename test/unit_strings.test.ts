import { expect, test } from 'bun:test'
import { LayoutPass, Span, Text, em, evaluate, make_request, px, render_svg, vh, vw } from 'gum-jsx-core'
import * as math from '../src'

const fonts = math.createMathFonts()
function pass() { return new LayoutPass({ fonts: { value: fonts, version: fonts.version } }) }

test('math spacing accepts unit strings alongside named spaces and signed advances', () => {
  const engine = pass()
  for (const style of ['text', 'script', 'scriptscript'] as const) {
    const layout = (advance: math.MathSpace) => engine.layout(new math.MathSpacer({
      advance, style, font_size: '20px',
    }), make_request(), { viewport: { width: 800, height: 600 }, reference: { width: 200 } })
    for (const [actual, expected] of [
      ['1em', em(1)], ['-0.5em', em(-0.5)], ['2px', px(2)], ['5vw', vw(5)],
      ['1vh', vh(1)], ['50%', 0.5], ['thin', em(3 / 18)], ['quad', em(1)],
    ] as const) {
      expect(layout(actual)).toEqual(layout(expected))
    }
    expect(() => layout('bad' as math.MathSpace)).toThrow('MathSpacer.advance: expected a length')
  }
})

test('math JSX strings resolve rules, arrays, and padding without changing rendered output', () => {
  const strings = evaluate(`
    <Svg viewport={{ width: 800, height: 600 }} font-size="4vh">
      <MathRow fit={false}>
        <MathBox style="script" padding={{ h: "1em", v: "1vh" }}>
          <Rect width="20px" height="10px" />
        </MathBox>
        <MathRule width="10vw" thickness="1vh" />
        <Frac thickness="0.5vh" padding="1vw">
          <Rect width="20px" height="10px" />
          <Rect width="20px" height="10px" />
        </Frac>
        <MathArray cols="cc" colsep="1vw" thickness="0.5vh">
          <MathSymbol>x</MathSymbol>
          <MathSymbol>y</MathSymbol>
        </MathArray>
      </MathRow>
    </Svg>
  `, { scope: math })
  const helpers = evaluate(`
    <Svg viewport={{ width: 800, height: 600 }} font-size={vh(4)}>
      <MathRow fit={false}>
        <MathBox style="script" padding={{ h: em(1), v: vh(1) }}>
          <Rect width={px(20)} height={px(10)} />
        </MathBox>
        <MathRule width={vw(10)} thickness={vh(1)} />
        <Frac thickness={vh(0.5)} padding={vw(1)}>
          <Rect width={px(20)} height={px(10)} />
          <Rect width={px(20)} height={px(10)} />
        </Frac>
        <MathArray cols="cc" colsep={vw(1)} thickness={vh(0.5)}>
          <MathSymbol>x</MathSymbol>
          <MathSymbol>y</MathSymbol>
        </MathArray>
      </MathRow>
    </Svg>
  `, { scope: math })
  const engine = pass()
  expect(render_svg(engine.layout(strings))).toBe(render_svg(engine.layout(helpers)))
})

test('standalone math exports accept string dimensions, viewport fonts, and padding', () => {
  expect(math.mathToSvg('x^2 + y', { width: '320px', height: '240px', font_size: '4vh',
    padding: { h: '1vw', v: '2vh' } }))
    .toBe(math.mathToSvg('x^2 + y', { width: px(320), height: px(240), font_size: vh(4),
      padding: { h: vw(1), v: vh(2) } }))
})

test('cached flattened math and text spans remeasure string viewport typography', () => {
  const engine = pass()
  for (const source of [
    new math.MathText({ fit: false, children: new math.MathText({ font_size: '10vh', children: 'xy' }) }),
    new math.TextMode({ fit: false, children: new Span({ font_size: '10vh', children: 'xy' }) }),
    new Text({ children: new math.MathText({ font_size: '10vh', children: 'xy' }) }),
  ]) {
    const a = engine.layout(source, make_request(), { viewport: { height: 200 } })
    const b = engine.layout(source, make_request(), { viewport: { height: 400 } })
    expect(b.size.width).toBeCloseTo(2 * a.size.width, 8)
    expect(engine.layout(source, make_request(), { viewport: { height: 200 } })).toBe(a)
  }
})
