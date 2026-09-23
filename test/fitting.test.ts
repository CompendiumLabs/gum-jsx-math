import { describe, expect, test } from 'bun:test'
import { Box, Text, LayoutPass, available, exact, make_request, px, em, render_svg,
  define_component, define_element, make_fragment, make_size, finish_size } from '@gum-jsx/core'
import type { Fragment, ElementProps, MathStyle } from '@gum-jsx/core'
import { MathText, MathRow, MathArray, MathRule, MathSpacer, MathStretch, Tex, Latex,
  MathElement, createMathFonts, mathToElement } from '../src'

const fonts = createMathFonts()
const setup = () => new LayoutPass({ fonts: { value: fonts, version: fonts.version } })
const offer = (width?: number, height?: number) => make_request({
  width: width === undefined ? undefined : available(width),
  height: height === undefined ? undefined : available(height),
})
const descendants = (f: Fragment): Fragment[] => [f, ...f.children.flatMap(c => descendants(c.fragment))]
const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 8)
const text = String.raw`\underbrace{a_1+a_2+\cdots+a_n}_{n\text{ terms}}=S_n`

describe('automatic formula fitting', () => {
  test('complete formulas shrink at either boundary, never enlarge, and match explicit fit', () => {
    const pass = setup(), source = new MathText({ children: text, font_size: px(36) })
    const saved = JSON.stringify(source), natural = pass.layout(source)
    for (const request of [offer(80), offer(undefined, 20), offer(80, 20), offer(1000, 1000), offer(0, 20),
      make_request({ width: exact(80), height: exact(60) })]) {
      const result = pass.layout(source, request)
      const explicit = pass.layout(new MathText({ ...source.props, fit: true }), request)
      expect(render_svg(result)).toBe(render_svg(explicit))
      expect(pass.layout(source, request)).toBe(result)
    }
    const fitted = pass.layout(source, offer(80))
    const scale = 80 / natural.size.width
    near(fitted.size.height, natural.size.height * scale)
    near(fitted.guides.baseline!, natural.guides.baseline! * scale)
    near(fitted.math!.advance, natural.math!.advance * scale)
    expect(pass.layout(source, offer(1000, 1000)).size).toEqual(natural.size)
    expect(JSON.stringify(source)).toBe(saved)
  })

  test('own maxima are fitting bounds and false explicitly keeps the unscaled drawing', () => {
    const pass = setup(), source = new Latex({ children: text, font_size: px(36) })
    const natural = pass.layout(source)
    const bounded = pass.layout(new Latex({ ...source.props, max_width: px(80), max_height: px(20) }))
    expect(bounded.size.width).toBeLessThanOrEqual(80)
    expect(bounded.size.height).toBeLessThanOrEqual(20)
    const disabled = new Latex({ ...source.props, fit: false })
    expect(pass.layout(disabled, offer(80)).size).toEqual(natural.size)
    const allocated = pass.layout(disabled, make_request({ width: exact(80) }))
    expect(allocated.overflow.right).toBeGreaterThan(0)
    expect(allocated.size.height).toBe(natural.size.height)
    // Invalid explicit values are not mistaken for an omitted automatic policy.
    expect(() => pass.layout(new Latex({ children: text, fit: null as any }), offer(80))).toThrow('fit must be')
  })

  test('internal math allocations do not scale atoms or stretch requests', () => {
    const pass = setup(), source = new MathText({ children: 'a+b=c', font_size: px(36) })
    for (const style of ['display', 'display-cramped', 'text', 'text-cramped',
      'script', 'script-cramped', 'scriptscript', 'scriptscript-cramped'] as MathStyle[]) {
      const context = { math: { style, size: 1 } }
      const request = make_request({ width: exact(5) })
      const implicit = pass.layout(source, request, context)
      const disabled = pass.layout(new MathText({ ...source.props, fit: false }), request, context)
      expect(render_svg(implicit)).toBe(render_svg(disabled))
      expect(implicit.overflow.right).toBeGreaterThan(0)
      const explicit = pass.layout(new MathText({ ...source.props, fit: true }), request, context)
      expect(explicit.size.height).toBeLessThan(implicit.size.height)
    }
    const grouped = new MathText({ children: ['a', new MathText({ color: 'red', children: '+b' }), '=c'] })
    expect(render_svg(pass.layout(grouped, offer(25))))
      .toBe(render_svg(pass.layout(new MathText({ ...grouped.props, fit: true }), offer(25))))
  })

  test('inline formulas keep their font scale while ordinary paragraphs reflow', () => {
    const pass = setup(), formula = new Tex({ children: text, font_size: px(24) })
    const natural = pass.layout(formula)
    const paragraph = new Text({ children: ['Before ', formula, ' after. More ordinary text.'] })
    for (const width of [640, 100]) {
      const result = pass.layout(paragraph, offer(width))
      const inline = descendants(result).find(f => f.name === 'Tex')!
      expect(inline.size).toEqual(natural.size)
    }
    const prose = new Text({ children: 'A paragraph reflows at its normal font size when the host gets narrower.' })
    expect(pass.layout(prose, offer(100)).size.height).toBeGreaterThan(pass.layout(prose, offer(640)).size.height)
  })

  test('allocation primitives keep stretching, rule thickness, and signed-space semantics', () => {
    const pass = setup()
    const rule = pass.layout(new MathRule({ thickness: px(2) }), make_request({ width: exact(200) }))
    expect(rule.draw[0].kind).toBe('rect')
    expect(rule.size).toEqual({ width: 200, height: 2 })
    const arrow = pass.layout(new MathStretch({ label: 'xrightarrow' }), make_request({ width: exact(200) }))
    expect(arrow.size.width).toBe(200)
    expect(arrow.children.some(c => c.transform)).toBe(false)
    const glue = pass.layout(new MathSpacer({ advance: em(-1) }), make_request({ width: exact(0) }))
    expect(glue.math!.advance).toBe(0)
    const fittedRule = pass.layout(new MathRule({ width: px(200), thickness: px(2), fit: true }), offer(100))
    expect(fittedRule.size).toEqual({ width: 100, height: 1 })
  })

  test('custom math subclasses, components and protocol adoption retain automatic fitting', () => {
    class Formula extends MathElement { static layout = MathRow.layout }
    const Alias = define_component<ElementProps>('Alias', props => new Latex({ children: text, ...props }))
    const pass = setup()
    for (const source of [new Formula({ children: text }), new Alias()]) {
      expect(source.type.auto_fit).toBe(true)
      expect(pass.layout(source, offer(40)).size.width).toBeLessThanOrEqual(40 + 1e-8)
    }
    let layouts = 0
    const Intrinsic = define_element('Intrinsic', (_, query) => {
      layouts++
      return make_fragment({ size: finish_size(make_size(200, 100), query.request, query.sizing) })
    }, {}, { auto_fit: true })
    const source = new Intrinsic()
    for (const width of [100, 80, 60, 20]) near(pass.layout(source, offer(width)).size.width, width)
    expect(layouts).toBe(1)
    pass.set_resource('test', {}, 1)
    pass.layout(source, offer(40))
    expect(layouts).toBe(2)
  })

  test('authored math dimensions establish percentage operands before fitting', () => {
    const pass = setup(), cell = new Box({ width: 0.5, height: px(10) })
    const designed = new MathArray({ width: px(200), children: [[cell]] })
    const natural = pass.layout(designed)
    const fitted = pass.layout(designed, offer(100))
    near(fitted.size.width, 100)
    near(fitted.size.height, natural.size.height / 2)
    expect(descendants(fitted).find(f => f.name === 'Box')!.size.width).toBe(100)
    const allocated = new MathArray({ fit: false, children: [[cell]] })
    expect(descendants(pass.layout(allocated, make_request({ width: exact(200) })))
      .find(f => f.name === 'Box')!.size.width).toBe(100)
  })

  test('standalone exports fit their full ink-safe viewport, including suppressed metrics', () => {
    const pass = setup(), source = mathToElement(String.raw`\smash{\mathllap{f}\widehat{ABC}}`, { padding: em(0.2) })
    const natural = pass.layout(source), fitted = pass.layout(source, offer(natural.size.width / 2))
    near(fitted.size.width, natural.size.width / 2)
    near(fitted.size.height, natural.size.height / 2)
    expect(fitted.overflow.right).toBeLessThan(1e-8)
    expect(fitted.overflow.bottom).toBeLessThan(1e-8)
    expect(fitted.ink!.x).toBeGreaterThanOrEqual(0)
  })
})
