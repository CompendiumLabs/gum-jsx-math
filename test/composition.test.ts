import { expect, test } from 'bun:test'
import { LayoutPass, Text, Span, Rect, Circle, Plot, Polyline, Box, Fit, TextRow,
  Rotate, TransformBox, TextBox, TitleBox, TextFigure, Bullets, Slide, px, em,
  make_request, exact, available, resolve_style, render_svg, evaluate } from 'gum-jsx-core'
import type { Fragment, FontProvider } from 'gum-jsx-core'
import * as math from '../src'
import { Tex, Latex, MathText, MathRow, MathSymbol, TextMode, Frac, SupSub, Sqrt, createMathFonts } from '../src'

const fonts = createMathFonts()
const pass = new LayoutPass({ fonts: { value: fonts, version: fonts.version } })
const style = resolve_style({ font_size: px(32) })
const context = { style }
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 8)
function descendants(f: Fragment): Fragment[] { return [f, ...f.children.flatMap(c => descendants(c.fragment))] }
function named(f: Fragment, name: string) { return descendants(f).filter(item => item.name === name) }

test('paragraphs wrap at the formula boundary and keep each formula at its natural size', () => {
  const a = new Tex({ text: 'x^2' }), b = new Tex({ text: String.raw`\frac{1}{1+x}` })
  const source = new Text({ children: ['a ', a, ' ', b] })
  const natural = pass.layout(source, make_request(), context)
  const at = pass.layout(source, make_request({ width: exact(natural.size.width) }), context)
  const below = pass.layout(source, make_request({ width: exact(natural.size.width - 1e-9) }), context)
  expect(at.children).toHaveLength(1)
  expect(below.children).toHaveLength(2)
  expect(named(below.children[0].fragment, 'Tex')).toHaveLength(1)
  expect(named(below.children[1].fragment, 'Tex')).toHaveLength(1)
  for (const [index, item] of [a, b].entries()) {
    const standalone = pass.layout(item, make_request(), context)
    near(named(at, 'Tex')[index].size.width, standalone.size.width)
    near(named(below, 'Tex')[index].size.height, standalone.size.height)
  }
  const tiny = pass.layout(source, make_request({ width: exact(1), height: exact(1) }), context)
  expect(named(tiny, 'Tex')).toHaveLength(2)
  expect(tiny.overflow.right).toBeGreaterThan(1)
  near(named(tiny, 'Tex')[1].size.width, named(at, 'Tex')[1].size.width)
  const nowrap = pass.layout(new Text({ wrap: false, children: source.props.children }),
    make_request({ width: exact(1) }), context)
  expect(nowrap.children).toHaveLength(1)
})

test('inline fractions expand logical line extents and inherit a styled span', () => {
  const formula = new Tex({ text: String.raw`\frac{a}{b}` })
  const source = new Text({ children: ['Result: ', new Span({ font_size: em(1.5), color: '#176b9b',
    font_family: 'IBM Plex Mono', children: formula }), '\nNext line.'] })
  const result = pass.layout(source, make_request(), context)
  const line = result.children[0].fragment
  const item = line.children.find(c => c.fragment.name === 'Tex')!
  const expected = pass.layout(formula, make_request(), { style: resolve_style({ font_size: px(48), color: '#176b9b' }) })
  near(item.fragment.size.width, expected.size.width)
  near(line.guides.baseline!, item.offset.y + item.fragment.guides.baseline!)
  expect(line.size.height).toBeGreaterThanOrEqual(item.fragment.size.height)
  expect(line.size.height).toBeGreaterThan(result.children[1].fragment.size.height)
  expect(descendants(item.fragment).flatMap(f => f.draw).every(draw => draw.fill === '#176b9b')).toBe(true)
  const tight = pass.layout(new Text({ line_height: px(1), children: formula }), make_request(), context)
  near(named(tight, 'Tex')[0].size.height, pass.layout(formula, make_request(), context).size.height)
  expect(tight.size.height).toBeGreaterThanOrEqual(named(tight, 'Tex')[0].size.height)
})

test('TextMode is literal, preserves spaces and kerning, and isolates its text face from nested math', () => {
  const literal = String.raw` AV  x^2 & \alpha `
  const result = pass.layout(new TextMode({ text: literal }), make_request(), context)
  near(result.size.width, fonts.resolve('KaTeX_Main', 400, 'normal').shape(literal).advance * 32)
  expect(result.label).toBe(literal)
  const lines = pass.layout(new TextMode({ text: 'one\r\ntwo\tthree' }), make_request(), context)
  expect(lines.label).toBe('one two three')
  near(lines.size.width, fonts.resolve('KaTeX_Main', 400, 'normal').shape('one two three').advance * 32)
  const split = pass.layout(new TextMode({ children: ['A', new Span({ children: 'V' })] }), make_request(), context)
  near(split.size.width, fonts.resolve('KaTeX_Main', 400, 'normal').shape('AV').advance * 32)
  const formula = new MathText({ text: 'x^2' })
  const mixed = pass.layout(new TextMode({ children: ['speed ', formula, ' m/s'] }), make_request(), context)
  const standalone = pass.layout(formula, make_request(), context)
  near(named(mixed, 'MathText')[0].size.width, standalone.size.width)
  expect(render_svg(named(mixed, 'MathText')[0])).toBe(render_svg(standalone))
  const parsed = pass.layout(new Latex({ text: String.raw`\text{speed $x^2$ m/s}`, strut: false }), make_request(), context)
  near(parsed.size.width, mixed.size.width)
  const kerned = pass.layout(new Tex({ text: String.raw`\text{AV office}`, strut: false }), make_request(), context)
  near(kerned.size.width, fonts.resolve('KaTeX_Main', 400, 'normal').shape('AV office').advance * 32)
  const scripted = pass.layout(new SupSub({ children: 'x', sub: new TextMode({ text: 'average' }) }), make_request(), context)
  const normal = pass.layout(new TextMode({ text: 'average' }), make_request(), context)
  near(named(scripted, 'TextMode')[0].size.width / normal.size.width, 0.7)
  for (const [options, face] of [[{ bold: true, italic: true }, 'KaTeX_Main-BoldItalic'],
    [{ family: 'sans', italic: true }, 'KaTeX_SansSerif-Italic'], [{ family: 'mono' }, 'KaTeX_Typewriter']] as const) {
    const styled = pass.layout(new TextMode({ ...options, children: ['AV ', formula] }), make_request(), context)
    near(styled.size.width, fonts.resolve(face, 400, 'normal').shape('AV ').advance * 32 + standalone.size.width)
    expect(render_svg(named(styled, 'MathText')[0])).toBe(render_svg(standalone))
  }
  const fallback = pass.layout(new TextMode({ family: 'sans', bold: true, italic: true, text: 'x' }), make_request(), context)
  near(fallback.size.width, fonts.resolve('KaTeX_Main-BoldItalic', 400, 'normal').shape('x').advance * 32)
  expect(new TextMode({ text: literal }).props.text).toBe(literal)
})

test('ordinary shapes, plots, and wrapping text retain explicit dimensions in compound math', () => {
  const plot = new Plot({ width: px(120), height: px(65), axis: false, grid: false, margin: px(0),
    xlim: [0, 2], ylim: [0, 2], children: new Polyline({ points: [[0, 0], [1, 1.5], [2, 1]], stroke: '#176b9b' }) })
  const circle = new Circle({ width: px(24), height: px(24), fill: '#c84b36', stroke: 'none' })
  const result = pass.layout(new Frac({ children: [plot, circle] }), make_request(), context)
  expect(named(result, 'Plot')[0].size).toEqual({ width: 120, height: 65 })
  expect(named(result, 'Circle')[0].size).toEqual({ width: 24, height: 24 })
  const text = new Text({ text: 'First line and a second line', width: px(95), font_size: px(20) })
  const operand = pass.layout(new Frac({ children: [text, 'n'] }), make_request(), context)
  expect(named(operand, 'Text')[0].size.width).toBe(95)
  expect(named(operand, 'Text')[0].children.length).toBeGreaterThan(1)
  for (const Row of [MathRow, MathText]) {
    const row = pass.layout(new Row({ style: 'script', children: [text, new MathSymbol({ text: '=' })] }), make_request(), context)
    const placement = row.children[0]
    near(placement.offset.y + placement.fragment.guides.baseline! - 0.25 * 20, row.guides.math_axis!)
  }
  const shapes = pass.layout(new MathRow({ children: [circle, new MathSymbol({ text: '=' })] }), make_request(), context)
  near(shapes.children[0].offset.y + 12, shapes.guides.math_axis!)
  const root = pass.layout(new Sqrt({ children: plot }), make_request(), context)
  expect(named(root, 'Plot')[0].size).toEqual({ width: 120, height: 65 })
})

test('padding, fitting, baseline rows, and transforms preserve representable guides and ink', () => {
  const formula = new Tex({ text: String.raw`\frac{x}{y}` })
  const bare = pass.layout(formula, make_request(), context)
  const padded = pass.layout(new Box({ padding: px(5), children: formula }), make_request(), context)
  near(padded.guides.baseline!, bare.guides.baseline! + 5)
  near(padded.guides.math_axis!, bare.guides.math_axis! + 5)
  const fitted = pass.layout(new Fit({ height: px(bare.size.height / 2), children: formula }), make_request(), context)
  near(fitted.guides.baseline!, bare.guides.baseline! / 2)
  near(fitted.ink!.height, bare.ink!.height / 2)
  const embedded = pass.layout(new MathText({ children: [
    new Fit({ height: px(bare.size.height / 2), children: formula }), new MathSymbol({ text: '=' }),
  ] }), make_request(), context)
  near(embedded.children[0].offset.y + embedded.children[0].fragment.guides.math_axis!, embedded.guides.math_axis!)
  const row = pass.layout(new TextRow({ children: [new Text({ text: 'Answer:' }), formula] }), make_request(), context)
  for (const child of row.children) near(child.offset.y + child.fragment.guides.baseline!, row.guides.baseline!)
  const scaled = pass.layout(new TransformBox({ matrix: [2, 0, 0, 2, 3, 7], children: formula }), make_request(), context)
  near(scaled.guides.baseline!, bare.guides.baseline! * 2)
  const same = pass.layout(new Rotate({ angle: 0, children: formula }), make_request(), context)
  near(same.guides.baseline!, bare.guides.baseline!)
  const rotated = pass.layout(new Rotate({ angle: -90, children: formula }), make_request(), context)
  near(rotated.size.width, bare.size.height); near(rotated.size.height, bare.size.width)
  expect(rotated.guides.baseline).toBeUndefined()
  expect(rotated.children[0].fragment.guides.baseline).toBe(bare.guides.baseline)
  const nested = pass.layout(new Text({ children: ['label ', new Box({ padding: px(3), children: new Rotate({ angle: -90, children: formula }) })] }), make_request(), context)
  expect(named(nested, 'Tex')[0].size).toEqual(bare.size)
  expect(nested.ink).not.toBeNull()
})

test('shared formula sources keep style and placement local while reusing preparation', () => {
  let shaped = 0
  const provider: FontProvider = { resolve(face, weight, style) {
    const font = fonts.resolve(face, weight, style)
    return { ...font, shape(text) { shaped++; return font.shape(text) } }
  } }
  const local = new LayoutPass({ fonts: { value: provider, version: 0 } })
  const formula = new MathText({ text: 'x+1' })
  const source = new Text({ children: [formula, ' then ', formula] })
  const natural = local.layout(source, make_request(), context), saved = render_svg(natural), count = shaped
  const narrow = local.layout(source, make_request({ width: exact(100) }), context)
  expect(shaped).toBe(count)
  const parts = named(natural, 'MathText')
  expect(parts).toHaveLength(2)
  expect(parts[0]).toBe(parts[1])
  const script = local.layout(new SupSub({ children: 'f', sup: formula }), make_request(), context)
  near(named(script, 'MathSymbol')[1].size.width / named(parts[0], 'MathSymbol')[0].size.width, 0.7)
  near(named(script, 'MathText')[0].size.width,
    local.layout(formula, make_request(), { style, math: { style: 'script', size: 1 } }).size.width)
  const row = local.layout(new MathRow({ children: formula }), make_request(), context)
  near(row.children[0].fragment.size.width, parts[0].size.width)
  expect(render_svg(natural)).toBe(saved)
  expect(Object.isFrozen(natural.children[0].fragment.children[0])).toBe(true)
  expect(named(narrow, 'MathText')[0].size).toEqual(parts[0].size)
  expect(formula.props.style).toBeUndefined()
})

test('math composes through document helpers, plot labels, and indented JSX', () => {
  const formula = new Tex({ text: 'x^2' }), mixed = ['The value ', formula, ' stays inline.']
  for (const source of [new TextBox({ children: mixed }), new Bullets({ items: [mixed] }),
    new TitleBox({ title: mixed, children: new Text({ text: 'Body' }) }),
    new TextFigure({ caption: mixed, children: new Rect({ width: px(80), height: px(30) }) }),
    new Slide({ title: mixed, width: px(400), height: px(260), children: new Text({ children: mixed }) }),
    new Plot({ width: px(360), height: px(240), xlim: [0, 1], ylim: [0, 1],
      title: new Text({ children: mixed }), ylabel: new Text({ children: ['Power ', formula] }) })]) {
    const result = pass.layout(source, make_request({ width: available(400) }))
    expect(named(result, 'Tex').length).toBeGreaterThan(0)
    expect(render_svg(result)).toContain('<path')
  }
  const source = evaluate(`<TextBox width={px(300)}>
    The rate is
    <Span color={blue}>
      <Tex>
        <Frac>
          <TextMode>distance</TextMode>
          <TextMode>time</TextMode>
        </Frac>
      </Tex>
    </Span>
    and the paragraph can wrap.
  </TextBox>`, { scope: math })
  const result = pass.layout(source)
  expect(named(result, 'Frac')).toHaveLength(1)
  expect(named(result, 'Text')[0].label).toContain('The rate is')
})
