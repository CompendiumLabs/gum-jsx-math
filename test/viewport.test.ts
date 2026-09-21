import { expect, test } from 'bun:test'
import { LayoutPass, Span, Text, Rect, Svg, em, px, vw, vh, evaluate, make_request } from 'gum-jsx-core'
import type { Fragment } from 'gum-jsx-core'
import * as math from '../src'

const fonts = math.createMathFonts()
function pass() { return new LayoutPass({ fonts: { value: fonts, version: fonts.version } }) }
function nodes(fragment: Fragment): Fragment[] {
  return [fragment, ...fragment.children.flatMap(child => nodes(child.fragment))]
}
function named(fragment: Fragment, name: string) {
  const node = nodes(fragment).find(node => node.name === name)
  expect(node).toBeDefined()
  return node!
}

test('MathBox padding keeps viewport references while em padding follows math script sizing', () => {
  const engine = pass()
  for (const [style, font] of [['text', 20], ['script', 14], ['scriptscript', 10]] as const) {
    const box = new math.MathBox({ style, padding: { h: em(1), v: vh(1) },
      children: new Rect({ width: px(20), height: px(10) }) })
    const source = new Svg({ font_size: px(20), viewport: { width: 800, height: 600 }, children: box })
    expect(named(engine.layout(source), 'MathBox').size).toEqual({ width: 20 + 2 * font, height: 22 })
  }
})

test('standalone math export padding resolves viewport lengths against the root canvas', () => {
  for (const [width, height] of [[320, 240], [800, 600]]) {
    const options = { width: px(width!), height: px(height!) }
    const actual = math.mathToSvg('x^2 + y', { ...options, padding: { h: vw(1), v: vh(2) } })
    const expected = math.mathToSvg('x^2 + y', { ...options, padding: { h: px(width! * 0.01), v: px(height! * 0.02) } })
    expect(actual).toBe(expected)
  }
})

test('math inherits a viewport root font alongside ordinary text under maximum bounds', () => {
  const source = evaluate(`
    <Svg viewport={{ width: 800, height: 600 }} max-width={px(800)} max-height={px(600)} font-size={vh(4)}>
      <VStack gap={vh(2)}>
        <Text>Body text</Text>
        <Latex>x^2 + y^2</Latex>
      </VStack>
    </Svg>
  `, { scope: math })
  const engine = pass(), result = engine.layout(source)
  const natural = engine.layout(new math.Latex({ font_size: px(24), children: 'x^2 + y^2' }))
  expect(named(result, 'Latex').size).toEqual(natural.size)
  expect(named(result, 'Text').size.height).toBeCloseTo(28.8, 8)
})

test('math spacing, rules, fractions, and array lengths use the reference canvas', () => {
  const source = evaluate(`
    <Svg viewport={{ width: 800, height: 600 }}>
      <MathRow fit={false}>
        <MathSpacer advance={vw(5)} />
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
  const result = pass().layout(source)
  expect(named(result, 'MathSpacer').size.width).toBe(40)
  expect(named(result, 'MathRule').size).toEqual({ width: 80, height: 6 })
  expect(named(result, 'Frac').size.width).toBe(36)
  const bar = nodes(named(result, 'Frac')).flatMap(node => node.draw)
    .find(draw => draw.kind === 'rect' && draw.rect.height === 3)
  expect(bar?.kind).toBe('rect')
  if (bar?.kind === 'rect') expect(bar.rect.height).toBe(3)
})

test('cached flattened math and literal spans update when only the reference canvas changes', () => {
  const engine = pass()
  const sources = [
    new math.MathText({ fit: false, children: new math.MathText({ font_size: vh(10), children: 'xy' }) }),
    new math.TextMode({ fit: false, children: new Span({ font_size: vh(10), children: 'xy' }) }),
    new Text({ children: new math.MathText({ font_size: vh(10), children: 'xy' }) }),
  ]
  for (const source of sources) {
    const a = engine.layout(source, make_request(), { viewport: { height: 200 } })
    const b = engine.layout(source, make_request(), { viewport: { height: 400 } })
    expect(b.size.width).toBeCloseTo(2 * a.size.width, 8)
    expect(engine.layout(source, make_request(), { viewport: { height: 200 } })).toBe(a)
  }
})
