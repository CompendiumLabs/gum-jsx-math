import { describe, test, expect } from 'bun:test'
import { Fonts, LayoutPass, LayoutError, FontNotLoadedError,
  make_request, available, exact, px, em, render_svg, evaluate, define_component } from '@gum-jsx/core'
import type { Element, Fragment, MathStyle, FontProvider, LayoutQuery } from '@gum-jsx/core'
import type { MathTextProps } from '../src'
import * as math from '../src'
import { MathSpan, MathSymbol, MathSpacer, MathRule, MathRow, MathText, MathCol, MathBox,
  Latex, Tex, MathError, createMathFonts, registerMathFonts, MATH_FONTS, parse_math } from '../src'

function setup() {
  const fonts = createMathFonts()
  return { fonts, pass: new LayoutPass({ fonts: { value: fonts, version: fonts.version } }) }
}
const { pass, fonts } = setup()
function formula(text: string, size = 36, style: MathStyle = 'text') {
  return pass.layout(new MathText({ children: text, font_size: px(size), style }))
}
function width(text: string, size = 36) { return formula(text, size).math!.advance }
function near(a: number, b: number) { expect(a).toBeCloseTo(b, 9) }
function cause(element: Element): MathError {
  try { pass.layout(element) } catch (error) {
    while (error instanceof LayoutError) error = error.cause
    expect(error).toBeInstanceOf(MathError)
    return error as MathError
  }
  throw new Error('Expected a math failure')
}
function paths(fragment: Fragment): unknown[] {
  return [...fragment.draw, ...fragment.children.flatMap(child => paths(child.fragment))]
}

describe('glyph and font contracts', () => {
  test('construction snapshots source without resolving fonts or parsing TeX', () => {
    const args = { children: String.raw`\frac{` }
    const source = new Latex(args)
    args.children = 'changed'
    expect(source.props.children).toBe(String.raw`\frac{`)
    expect(Object.isFrozen(source)).toBe(true)
    expect(new MathSpan({ children: 'x', font_family: 'unregistered' }).props.children).toBe('x')
    expect(cause(source).kind).toBe('parse')
  })

  test('font geometry scales exactly and retains italic and tall-operator overhang', () => {
    for (const [face, text, correction] of [['KaTeX_Math', 'f', 0.10764], ['KaTeX_Size2', '∮', 0.44445]] as const) {
      const shape = fonts.resolve(face, 400, 'normal').shape(text)
      expect(shape.ink!.x + shape.ink!.width).toBeGreaterThan(shape.advance)
      for (const size of [20, 48]) {
        const glyph = pass.layout(new MathSpan({ children: text, font_family: face, font_size: px(size) }))
        near(glyph.math!.advance, shape.advance * size)
        near(glyph.guides.baseline!, -shape.ink!.y * size)
        near(glyph.guides.math_axis!, glyph.guides.baseline! - size / 4)
        near(glyph.math!.italic, correction * size)
        expect(glyph.overflow.right).toBeGreaterThan(0)
        expect(glyph.math!.nucleus).toBe('character')
        const svg = render_svg(glyph)
        expect(svg).toContain('<path')
        expect(svg).not.toContain('<text')
      }
    }
  })

  test('coverage chooses a supported face and reports missing glyphs', () => {
    expect(fonts.resolve('KaTeX_Main', 400, 'normal').has_glyphs('abc')).toBe(true)
    expect(fonts.resolve('KaTeX_Main', 400, 'normal').has_glyphs('🦄')).toBe(false)
    expect(cause(new MathSymbol({ children: '🦄' })).kind).toBe('glyph')
    expect(cause(new MathSymbol({ children: String.raw`\notacommand` })).kind).toBe('symbol')
    // Caligraphic has no lowercase; fallback retains the math italic glyph.
    const fallback = pass.layout(new MathSymbol({ children: 'x', font_family: 'KaTeX_Caligraphic' }))
    expect(fallback.draw).toEqual(pass.layout(new MathSymbol({ children: 'x' })).draw)
    for (const face of MATH_FONTS) {
      const font = fonts.resolve(face, 400, 'normal')
      const char = face.startsWith('KaTeX_Size') ? '(' : 'A'
      expect(font.has_glyphs(char)).toBe(true)
      expect(font.shape(char).commands.length).toBeGreaterThan(0)
    }
  })

  test('registration is lazy and concurrent loads share work, including retry', async () => {
    const resource = new Fonts()
    const nativeFetch = globalThis.fetch
    const bytes = await Bun.file(new URL('../../gum-jsx-core/src/fonts/IBMPlexSans-Regular.ttf', import.meta.url)).arrayBuffer()
    let fetches = 0, fail = true
    globalThis.fetch = (async () => {
      fetches++
      await Promise.resolve()
      return fail ? new Response('no', { status: 503 }) : new Response(bytes)
    }) as unknown as typeof fetch
    try {
      resource.register_url('remote', new URL('https://fonts.invalid/math.ttf'))
      expect(fetches).toBe(0)
      expect(() => resource.resolve('remote', 400, 'normal')).toThrow(FontNotLoadedError)
      const attempts = await Promise.allSettled([resource.load('remote'), resource.load('remote')])
      expect(attempts.every(attempt => attempt.status === 'rejected'
        && attempt.reason.message.includes('503'))).toBe(true)
      expect(fetches).toBe(1)
      fail = false
      await Promise.all([resource.load('remote'), resource.load('remote')])
      expect(fetches).toBe(2)
      const version = resource.version
      resource.register_url('remote', new URL('https://fonts.invalid/math.ttf'))
      expect(resource.version).toBe(version)
      expect(resource.resolve('remote', 400, 'normal').shape('x').advance).toBeGreaterThan(0)
    } finally { globalThis.fetch = nativeFetch }
  })

  test('prepared shaping survives offers, and contexts and resource versions invalidate layout', () => {
    const fonts = createMathFonts()
    let shapes = 0
    const provider: FontProvider = { resolve(...args) {
      const font = fonts.resolve(...args)
      return { ...font, shape(text) { shapes++; return font.shape(text) } }
    } }
    const pass = new LayoutPass({ fonts: { value: provider, version: 0 } })
    const source = new MathSymbol({ children: 'f', font_size: px(30) })
    const a = pass.layout(source)
    pass.layout(source, make_request({ width: available(10) }))
    expect(shapes).toBe(1)
    const b = pass.layout(source, make_request(), { math: { style: 'script', size: 1 } })
    near(b.math!.advance, a.math!.advance * 0.7)
    const c = pass.layout(source, make_request(), { math: { style: 'text-cramped', size: 2 } })
    near(c.math!.advance, a.math!.advance * 2)
    expect(pass.layout(source)).toBe(a)
    pass.set_resource('fonts', provider, 1)
    expect(pass.layout(source)).not.toBe(a)
    expect(shapes).toBe(4)
    const revision = fonts.version
    registerMathFonts(fonts)
    expect(fonts.version).toBe(revision)
  })
})

describe('math rows and source sequences', () => {
  test('binary, relation, unary, punctuation, and operator spacing use TeX classes', () => {
    const a = width('a'), b = width('b'), plus = width('+'), minus = width('-'), equal = width('=')
    near(width('a+b=c'), a + plus + b + equal + width('c') + 16 + 20)
    near(width('-x'), minus + width('x'))
    near(width('a+-b'), a + plus + minus + b + 16)
    near(width('a+'), a + plus)
    near(width('a+=b'), a + plus + equal + b + 20)
    near(width('(a+b)'), width('(') + a + plus + b + 16 + width(')'))
    near(width('a,b'), a + width(',') + b + 6)
    near(width(String.raw`\sin x`), width(String.raw`\sin`) + width('x') + 6)
    near(width(String.raw`\operatorname{rank}(A)`), width(String.raw`\operatorname{rank}`) + width('(A)'))
  })

  test('signed glue is transparent to cancellation and survives at two font sizes', () => {
    for (const size of [24, 54]) {
      near(width(String.raw`a\!b`, size), width('ab', size) - size / 6)
      near(width(String.raw`a\!+b`, size), width('a+b', size) - size / 6)
      near(width(String.raw`\!+b`, size), width('+b', size) - size / 6)
    }
    const negative = pass.layout(new MathSpacer({ advance: em(-1), font_size: px(24) }))
    expect(negative.size).toEqual({ width: 0, height: 0 })
    expect(negative.math!.advance).toBe(-24)
    const row = formula(String.raw`\kern-2em x`, 24)
    expect(row.size.width).toBe(0)
    expect(row.math!.advance).toBeLessThan(0)
    expect(row.ink!.x).toBeLessThan(0)
  })

  test('TeX italic correction is independent of ink overhang and is consumed once', () => {
    const f = pass.layout(new MathSymbol({ children: 'f', font_size: px(48) }))
    near(f.math!.italic, 0.10764 * 48)
    expect(f.math!.italic).toBeGreaterThan(f.overflow.right)
    near(width('ff', 48), 2 * (f.math!.advance + f.math!.italic))
    near(width('{f}f', 48), width('ff', 48))
    near(width(String.raw`\text{f}`, 48), fonts.resolve('KaTeX_Main', 400, 'normal').shape('f').advance * 48)
    near(width(String.raw`\mathit{f}`, 48), fonts.resolve('KaTeX_Main-Italic', 400, 'normal').shape('f').advance * 48)
  })

  test('groups isolate atoms while colors and nested MathText remain sequences', () => {
    near(width('a{+}b'), width('a') + width('+') + width('b'))
    near(width(String.raw`a\begingroup+\endgroup b`), width('a+b'))
    near(width(String.raw`a\textcolor{red}{+}b`), width('a+b'))
    const nested = new MathText({ font_size: px(36), children: ['a',
      new MathText({ color: 'red', children: ['+', 'b'] })] })
    const fragment = pass.layout(nested)
    near(fragment.math!.advance, width('a+b'))
    expect(fragment.children[1].fragment.draw[0].fill).toBe('red')
    const ColoredSequence = define_component('ColoredSequence', () => new MathText({ children: '+b', color: 'red' }))
    const adopted = pass.layout(new MathText({ font_size: px(36), children: ['a', new ColoredSequence()] }))
    near(adopted.math!.advance, width('a+b'))
    class GroupedText extends MathText {
      static layout(props: MathTextProps, query: LayoutQuery) { return MathRow.layout(props, query) }
    }
    const custom = pass.layout(new MathText({ font_size: px(36),
      children: ['a', new GroupedText({ children: '+' }), 'b'] }))
    near(custom.math!.advance, width('a{+}b'))
    const plus = new MathSymbol({ children: '+' })
    const unary = pass.layout(new MathText({ children: [plus, 'b'] }))
    pass.layout(new MathText({ children: ['a', plus, 'b'] }))
    expect(unary.children[0].fragment.math!.left).toBe('mbin')
    expect(unary.math!.left).toBe('mord')
    near(width(String.raw`a\mathrel{+}b`), width('a') + width('+') + width('b') + 20)
    expect(pass.layout(new MathRow({ children: ['a+b'] })).math!.left).toBe('mord')
  })

  test('script context scales once through nested rows and suppresses non-tight spaces', () => {
    for (const style of ['script', 'script-cramped', 'scriptscript', 'scriptscript-cramped'] as const) {
      const scale = style.startsWith('scriptscript') ? 0.5 : 0.7
      near(formula('a+b', 36, style).math!.advance, (width('a') + width('+') + width('b')) * scale)
      near(formula('a,b', 36, style).math!.advance, (width('a') + width(',') + width('b')) * scale)
      near(formula(String.raw`\sin x`, 36, style).math!.advance, width(String.raw`\sin x`) * scale)
      near(formula('{{x}}', 36, style).math!.advance, width('x') * scale)
      const nested = pass.layout(new MathText({ font_size: px(36), style,
        children: new Tex({ children: 'x', strut: false }) }))
      near(nested.math!.advance, width('x') * scale)
    }
  })

  test('fit=false preserves unscaled glyphs and overflow even in exact small boxes', () => {
    const source = new Latex({ children: 'a+b=c', font_size: px(36), fit: false })
    const natural = pass.layout(source)
    const offered = pass.layout(source, make_request({ width: available(5) }))
    const exactBox = pass.layout(source, make_request({ width: exact(5), height: exact(4) }))
    expect(offered.size).toEqual(natural.size)
    expect(exactBox.size).toEqual({ width: 5, height: 4 })
    expect(paths(exactBox)).toEqual(paths(natural))
    expect(exactBox.overflow.right).toBeGreaterThan(100)
    expect(exactBox.overflow.bottom).toBeGreaterThan(20)
    expect(exactBox.math!.advance).toBe(5)
    const glue = new MathSpacer({ advance: em(-1) })
    expect(pass.layout(glue, make_request({ width: exact(0) })).math!.advance).toBe(0)
    const allocated = pass.layout(new MathRow({ children:
      new MathSymbol({ children: 'f', width: px(5) }) }))
    expect(allocated.math!.advance).toBe(5)
  })

  test('axis alignment, box padding, column spacing, struts, and rule color', () => {
    const row = pass.layout(new MathRow({ font_size: px(32), children: [
      new MathSymbol({ children: 'x' }), new MathSymbol({ children: 'b' })] }))
    for (const child of row.children) near(child.offset.y + child.fragment.guides.math_axis!, row.guides.math_axis!)
    const box = pass.layout(new MathBox({ font_size: px(32), padding: em(0.5), children: 'x' }))
    near(box.size.width, width('x', 32) + 32)
    near(box.guides.baseline!, box.children[0].fragment.guides.baseline! + 16)
    const col = pass.layout(new MathCol({ font_size: px(32), gap: em(0.25), children: ['x', 'a+b'] }))
    near(col.children[1].offset.y, col.children[0].fragment.size.height + 8)
    near(col.guides.math_axis!, col.size.height / 2)
    expect(pass.layout(new Tex({ children: '', font_size: px(32) })).size.height).toBe(32)
    expect(formula('').size).toEqual({ width: 0, height: 0 })
    const rule = pass.layout(new MathRule({ width: em(2), thickness: em(0.04), font_size: px(32), color: 'white' }))
    expect(rule.draw[0].fill).toBe('white')
    near(rule.size.width, 64); near(rule.size.height, 1.28)
  })
})

describe('parser and host boundaries', () => {
  test('unsupported and malformed sources carry distinct diagnostics and do not poison a pass', () => {
    const malformed = cause(new Latex({ children: '{' }))
    expect(malformed.kind).toBe('parse')
    for (const text of [String.raw`\begin{CD}a\end{CD}`, String.raw`\phase{x}`, String.raw`\htmlClass{x}{a}`]) {
      expect(cause(new Latex({ children: text })).kind).toBe('unsupported')
    }
    const unsupported = cause(new Latex({ children: String.raw`a+\phase{x}` }))
    expect(unsupported.source).toBe(String.raw`a+\phase{x}`)
    expect(unsupported.node).toBe('enclose')
    expect(unsupported.range).toBeDefined()
    expect(formula('a+b').ink).not.toBeNull()
    const visible = pass.layout(new Latex({ children: String.raw`\phase{x}`, on_error: 'render' }))
    expect(visible.label).toContain('unsupported')
    expect(visible.ink).not.toBeNull()
    for (const text of ['{', String.raw`\nonesuch`, '🦄']) {
      const diagnostic = pass.layout(new Latex({ children: text, on_error: 'render' }))
      expect(diagnostic.label).toContain('parse:')
      expect(diagnostic.ink).not.toBeNull()
    }
  })

  test('macro expansion is local, and parser data contains no mutable KaTeX instances', () => {
    const macros = { '\\foo': 'a+b' }
    const source = new Latex({ children: String.raw`\foo`, macros, font_size: px(36), strut: false })
    macros['\\foo'] = 'c'
    near(pass.layout(source).math!.advance, width('a+b'))
    parse_math(String.raw`\gdef\bar{a}\bar`)
    expect(() => parse_math(String.raw`\bar`)).toThrow(MathError)
    expect(JSON.parse(JSON.stringify(parse_math('a+b')))).toHaveLength(3)
  })

  test('math JSX uses the evaluator scope without adding a core math dependency', () => {
    const source = evaluate('<Latex font-size={px(36)}>a+b=c</Latex>', { scope: math })
    near(pass.layout(source).math!.advance, width('a+b=c'))
    expect(() => evaluate('<Latex>x</Latex>')).toThrow()
  })
})
