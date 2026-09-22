import { describe, test, expect } from 'bun:test'
import { Svg, Rect, LayoutPass, FontNotLoadedError, px, em, make_request,
  available, exact, render_svg, inspect_fragment } from 'gum-jsx-core'
import type { Fragment, FontProvider } from 'gum-jsx-core'
import { Latex, mathToElement, mathToElementAsync, mathToSvg, mathToSvgAsync,
  createMathFonts, MATH_FONT_PATHS } from '../src'

function setup() {
  const fonts = createMathFonts()
  return { fonts, pass: new LayoutPass({ fonts: { value: fonts, version: fonts.version } }) }
}
function near(a: number, b: number) { expect(a).toBeCloseTo(b, 8) }
function formula(fragment: Fragment) { return fragment.children[0].fragment.children[0] }

describe('standalone math exports', () => {
  test('construction is immutable and leaves parsing and resource access to layout', () => {
    const options = { macros: { '\\f': 'x' }, padding: { left: px(3) } }
    const source = mathToElement(String.raw`\f`, options)
    options.macros['\\f'] = 'y'; options.padding.left = px(100)
    expect(Object.isFrozen(source)).toBe(true)
    expect(Object.isFrozen(source.props.children)).toBe(true)
    expect(source).toBeInstanceOf(Svg)
    const { pass } = setup()
    expect(render_svg(pass.layout(source))).toBe(mathToSvg(String.raw`\f`, { macros: { '\\f': 'x' }, padding: { left: px(3) } }))
    const invalid = mathToElement('{')
    expect(() => pass.layout(invalid)).toThrow('parse:')
    expect(() => mathToElement(42 as never)).toThrow('TeX string or an Element')
  })

  test('natural exports preserve advance and contain ink at every edge at two sizes', () => {
    const sources = ['f', String.raw`\int_0^\infty f(x)\,dx`, String.raw`\widehat{ABC}`,
      String.raw`\mathllap{abc}x\mathrlap{def}`, String.raw`\smash{\frac{x^2}{y_2}}`,
      String.raw`\kern-2em x`, String.raw`\raisebox{2em}{x}\raisebox{-2em}{y}`]
    for (const font_size of [px(20), px(48)]) for (const text of sources) {
      const { pass } = setup()
      const raw = pass.layout(new Latex({ children: text, font_size, strut: false }))
      const exported = pass.layout(mathToElement(text, { font_size, strut: false }))
      const child = formula(exported)
      expect(child.fragment.draw).toEqual(raw.draw)
      expect(child.fragment.math).toEqual(raw.math)
      near(exported.guides.baseline! - child.offset.y, raw.guides.baseline!)
      const ink = raw.ink!
      expect(ink.x + child.offset.x).toBeGreaterThanOrEqual(-1e-8)
      expect(ink.y + child.offset.y).toBeGreaterThanOrEqual(-1e-8)
      expect(ink.x + ink.width + child.offset.x).toBeLessThanOrEqual(exported.size.width + 1e-8)
      expect(ink.y + ink.height + child.offset.y).toBeLessThanOrEqual(exported.size.height + 1e-8)
      near(exported.ink!.width, raw.ink!.width)
      near(exported.ink!.height, raw.ink!.height)
    }
  })

  test('padding uses source lengths and a one-pixel floor makes empty exports valid', () => {
    const { pass } = setup()
    const natural = pass.layout(mathToElement('x'))
    const padded = pass.layout(mathToElement('x', { padding: { left: px(3), right: px(7), top: em(0.5), bottom: px(2) } }))
    near(padded.size.width - natural.size.width, 10)
    near(padded.size.height - natural.size.height, 14)
    near(padded.guides.baseline! - natural.guides.baseline!, 12)
    for (const text of ['', '  ', String.raw`\kern-2em`]) {
      const empty = pass.layout(mathToElement(text, { strut: false }))
      expect(empty.size).toEqual({ width: 1, height: 1 })
      expect(empty.ink).toBeNull()
    }
    const spaced = pass.layout(mathToElement(String.raw`\quad`, { strut: false }))
    expect(spaced.size).toEqual({ width: 24, height: 1 })
    const phantom = pass.layout(mathToElement(String.raw`\phantom{xxx}`))
    expect(phantom.size.width).toBeGreaterThan(24)
    expect(phantom.ink).toBeNull()
    expect(() => pass.layout(mathToElement('x', { padding: px(-1) }))).toThrow('nonnegative')
  })

  test('source reuse responds to inherited em sizes and automatically fits advisory offers', () => {
    const { pass } = setup()
    const source = mathToElement('x^2', { font_size: em(1) })
    const small = pass.layout(new Svg({ font_size: px(20), children: source }))
    const large = pass.layout(new Svg({ font_size: px(40), children: source }))
    near(large.size.width, small.size.width * 2)
    near(large.size.height, small.size.height * 2)
    const natural = pass.layout(source)
    const narrow = pass.layout(source, make_request({ width: available(1) }))
    near(narrow.size.width, 1)
    near(narrow.size.height, natural.size.height / natural.size.width)
    expect(pass.layout(source)).toBe(natural)
    expect(pass.stats.hits).toBeGreaterThan(0)
  })

  test('fit=false opts out of automatic export fitting while contain permits enlargement', () => {
    const { pass } = setup()
    const source = mathToElement('x+y', { fit: false })
    const natural = pass.layout(source)
    const clipped = pass.layout(source, make_request({ width: exact(5) }))
    expect(clipped.size.width).toBe(5)
    expect(clipped.overflow.right).toBeGreaterThan(0)
    expect(formula(clipped).fragment).toEqual(formula(natural).fragment)
    expect(clipped.ink!.x + clipped.ink!.width).toBeLessThanOrEqual(5)
    const fit = pass.layout(mathToElement('x+y', { fit: 'contain', width: px(200) }))
    near(fit.size.height, natural.size.height * 200 / natural.size.width)
    near(fit.children[0].fragment.children[0].transform![0], 200 / natural.size.width)
    expect(fit.children[0].fragment.children[0].fragment.children).toEqual(natural.children[0].fragment.children)
    expect(pass.layout(mathToElement('x', { width: px(0), height: px(0) })).ink).toBeNull()
  })

  test('direct Gum operands use the same export, and labels and SVG options survive', () => {
    const { pass } = setup()
    const source = mathToElement(new Rect({ width: px(80), height: px(50), fill: 'blue', stroke: 'none' }), { strut: false })
    expect(pass.layout(source).size).toEqual({ width: 80, height: 50 })
    const svg = mathToSvg('x<y', { title: 'A < B & C', background: 'white', id_prefix: 'export-test' })
    expect(svg).toContain('<title>A &lt; B &amp; C</title>')
    expect(svg).toContain('aria-label="x&lt;y"')
    expect(svg).toContain('id="export-test-clip-')
    expect(svg).toContain('fill="white"')
    expect(svg).not.toMatch(/<text|@font-face|\.ttf/)
    expect(inspect_fragment(pass.layout(mathToElement('x^2')))).toContain('MathViewport')
    expect(() => mathToSvg('x', { id_prefix: '1invalid' })).toThrow('identifier')
    expect(() => mathToSvg(String.raw`\phase{x}`)).toThrow('unsupported:')
    expect(mathToSvg('{', { on_error: 'render' }).includes('parse:')).toBe(true)
  })

  test('export fitting props scale the complete ink-safe viewport without a wrapper', () => {
    const { pass } = setup()
    const text = String.raw`\mathllap{f}\!\int_0^\infty e^{-x^2}\,dx`
    const natural = pass.layout(mathToElement(text, { padding: em(0.2) }))
    const small = pass.layout(mathToElement(text, { padding: em(0.2) }),
      make_request({ width: available(natural.size.width / 2) }))
    near(small.size.width, natural.size.width / 2)
    near(small.size.height, natural.size.height / 2)
    near(small.guides.baseline!, natural.guides.baseline! / 2)
    expect(small.ink!.x).toBeGreaterThanOrEqual(0)
    expect(small.ink!.x + small.ink!.width).toBeLessThanOrEqual(small.size.width + 1e-8)
    const enlarged = pass.layout(mathToElement(text, { padding: em(0.2),
      width: px(natural.size.width * 2), fit: 'contain' }))
    near(enlarged.size.width, natural.size.width * 2)
    near(enlarged.size.height, natural.size.height * 2)
  })

  test('supplied resources remain caller-owned and synchronous custom providers work', async () => {
    const { pass, fonts } = setup()
    expect(mathToSvg('x', { pass, fonts })).toBe(mathToSvg('x'))
    expect(() => mathToSvg('x', { pass, fonts: createMathFonts() })).toThrow('same resource')
    const provider: FontProvider = { resolve: (...args) => fonts.resolve(...args) }
    const custom = new LayoutPass({ fonts: { value: provider, version: 0 } })
    expect(mathToSvg('x', { pass: custom })).toBe(mathToSvg('x'))
    const old = mathToSvg('x', { pass })
    fonts.register('KaTeX_Math', await Bun.file(MATH_FONT_PATHS.KaTeX_Main).arrayBuffer())
    expect(mathToSvg('x', { pass })).not.toBe(old)
  })

  test('async helpers preload optional faces, share concurrent loads, and retry failed fetches', async () => {
    const { pass, fonts } = setup()
    const bytes = await Bun.file(MATH_FONT_PATHS.KaTeX_Script).arrayBuffer()
    fonts.register_url('KaTeX_Script', new URL('https://fonts.invalid/script.ttf'))
    expect(() => fonts.resolve('KaTeX_Script', 400, 'normal')).toThrow(FontNotLoadedError)
    const original = globalThis.fetch
    let requests = 0, fail = true
    globalThis.fetch = (async () => {
      requests++; await Promise.resolve()
      return fail ? new Response('unavailable', { status: 503 }) : new Response(bytes)
    }) as unknown as typeof fetch
    try {
      const attempts = await Promise.allSettled([mathToSvgAsync('x', { pass }), mathToSvgAsync('x', { fonts })])
      expect(attempts.every(item => item.status === 'rejected')).toBe(true)
      expect(requests).toBe(1)
      fail = false
      const [svg, source] = await Promise.all([
        mathToSvgAsync(String.raw`\mathscr{A}`, { pass }),
        mathToElementAsync(String.raw`\mathscr{A}`, { fonts }),
      ])
      expect(requests).toBe(2)
      expect(render_svg(pass.layout(source))).toBe(svg)
      expect(await mathToSvgAsync(String.raw`\mathscr{A}`, { fonts })).toBe(svg)
      expect(requests).toBe(2)
    } finally { globalThis.fetch = original }
    expect(await mathToSvgAsync('x')).toBe(mathToSvg('x'))
    await expect(mathToElementAsync('x', {} as never)).rejects.toThrow('requires fonts or pass')
    const custom = new LayoutPass({ fonts: { value: { resolve: fonts.resolve.bind(fonts) }, version: 0 } })
    await expect(mathToSvgAsync('x', { pass: custom })).rejects.toThrow('require Fonts')
  })
})
