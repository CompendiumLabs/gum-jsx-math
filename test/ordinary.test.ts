import { describe, expect, test } from 'bun:test'
import { LayoutPass, px, em, make_request, available, exact, render_svg, evaluate } from 'gum-jsx-core'
import type { Fragment, MathStyle, Element, FontProvider } from 'gum-jsx-core'
import * as math from '../src'
import { MathSymbol, MathText, MathChoice, MathBox, MathOp, SupSub, Frac, Sqrt, Bracket, Latex, createMathFonts, parse_math } from '../src'
import { sup_style, sub_style, numerator_style, denominator_style } from '../src/styles'

const fonts = createMathFonts()
const pass = new LayoutPass({ fonts: { value: fonts, version: fonts.version } })
const natural = make_request()
function formula(text: string, style: MathStyle = 'display', font_size = 40) {
  return pass.layout(new Latex({ children: text, style, font_size: px(font_size), strut: false }))
}
function near(actual: number, expected: number) { expect(actual).toBeCloseTo(expected, 8) }
function descendants(fragment: Fragment): Fragment[] {
  return [fragment, ...fragment.children.flatMap(child => descendants(child.fragment))]
}
function ink(element: Element) { return render_svg(pass.layout(element)).replace(/id="[^"]*"/g, '') }
function symbols(fragment: Fragment) { return descendants(fragment).filter(item => item.name === 'MathSymbol') }

describe('ordinary math styles and scripts', () => {
  test('all eight styles have the TeX transition table and scriptscript floor', () => {
    const styles: MathStyle[] = ['display', 'display-cramped', 'text', 'text-cramped',
      'script', 'script-cramped', 'scriptscript', 'scriptscript-cramped']
    expect(styles.map(sup_style)).toEqual(['script', 'script-cramped', 'script', 'script-cramped',
      'scriptscript', 'scriptscript-cramped', 'scriptscript', 'scriptscript-cramped'])
    expect(styles.map(sub_style)).toEqual(['script-cramped', 'script-cramped', 'script-cramped', 'script-cramped',
      'scriptscript-cramped', 'scriptscript-cramped', 'scriptscript-cramped', 'scriptscript-cramped'])
    expect(styles.map(numerator_style)).toEqual(['text', 'text-cramped', 'script', 'script-cramped',
      'scriptscript', 'scriptscript-cramped', 'scriptscript', 'scriptscript-cramped'])
    expect(styles.map(denominator_style)).toEqual(['text-cramped', 'text-cramped', 'script-cramped', 'script-cramped',
      'scriptscript-cramped', 'scriptscript-cramped', 'scriptscript-cramped', 'scriptscript-cramped'])
    const widths = symbols(formula('x^{x^{x^{x}}}')).map(glyph => glyph.math!.advance)
    expect(widths).toHaveLength(4)
    widths.forEach((width, i) => near(width / widths[0], [1, 0.7, 0.5, 0.5][i]))
  })

  test('side scripts use the character nucleus, italic correction once, and TeX clearance', () => {
    const base = new MathSymbol({ children: 'f' }), sup = new MathSymbol({ children: 'j' }), sub = new MathSymbol({ children: 'i' })
    const result = pass.layout(new SupSub({ children: base, sup, sub, font_size: px(40), style: 'text' }))
    const [b, s, t] = result.children
    near(s.offset.x, b.fragment.math!.advance + b.fragment.math!.italic)
    near(t.offset.x, b.fragment.math!.advance)
    const parent_baseline = result.guides.baseline!
    const shift = parent_baseline - (s.offset.y + s.fragment.guides.baseline!)
    expect(shift).toBeGreaterThanOrEqual(0.363 * 40)
    expect(t.offset.y - (s.offset.y + s.fragment.size.height)).toBeGreaterThanOrEqual(4 * 0.04 * 40 - 1e-8)
    const only_sub = pass.layout(new SupSub({ children: base, sub, font_size: px(40) }))
    near(only_sub.children[1].offset.x, only_sub.children[0].fragment.math!.advance)
    near(formula('{f}^j', 'text').size.width, formula('f^j', 'text').size.width)
    near(formula('{{f}}^j', 'text').size.width, formula('f^j', 'text').size.width)
    near(formula('f_i^j', 'text').size.width, result.size.width)
    expect(formula('x^x', 'text-cramped').size.height).toBeLessThan(formula('x^x', 'text').size.height)
    const omitted = pass.layout(new SupSub({ children: base, sup: false, sub: null, klass: 'mrel', font_size: px(40) }))
    near(omitted.math!.advance, result.children[0].fragment.math!.advance)
    expect(omitted.math!.left).toBe('mrel')
  })

  test('size declarations use their own script-size table, and mathchoice follows the active style', () => {
    const huge = symbols(formula(String.raw`{\Huge x^{x^x}}`)).map(glyph => glyph.math!.advance)
    const normal = symbols(formula('x'))[0].math!.advance
    huge.forEach((width, i) => near(width / normal, [2.488, 2.074, 1.728][i]))
    for (const [style, choice] of [['display', 'D'], ['text-cramped', 'T'], ['script', 'S'], ['scriptscript-cramped', 'Q']] as const) {
      near(formula(String.raw`\mathchoice{D}{T}{S}{Q}`, style).size.width, formula(choice, style).size.width)
      const direct = new MathText({ style, font_size: px(40),
        children: new MathChoice({ children: ['D', 'T', 'S', 'Q'] }) })
      near(pass.layout(direct).size.width, formula(choice, style).size.width)
    }
    near(formula(String.raw`x^{\mathchoice{D}{T}{S}{Q}}`).size.width, formula('x^S').size.width)
    near(formula(String.raw`\mathchoice{x}{\phase{x}}{\phase{y}}{\phase{z}}`).size.width, formula('x').size.width)
    expect(() => formula(String.raw`\mathchoice{x}{\phase{x}}{y}{z}`, 'text')).toThrow('unsupported')
    const mixed = formula(String.raw`x{\Huge x}`)
    const small_baseline = mixed.children[0].offset.y + mixed.children[0].fragment.guides.baseline!
    const huge_baseline = mixed.children[1].offset.y + mixed.children[1].fragment.guides.baseline!
    near(small_baseline, huge_baseline)
    const shared = new MathSymbol({ children: 'x' })
    const small = pass.layout(shared, natural, { math: { style: 'script', size: 1, size_index: 1 } })
    const large = pass.layout(shared, natural, { math: { style: 'script', size: 1, size_index: 11 } })
    near(large.math!.advance / small.math!.advance, 2.074 / 0.5)
  })

  test('automatic, forced, and disabled limits survive normalization and text/display layout', () => {
    for (const style of ['text', 'display'] as const) {
      const automatic = formula(String.raw`\sum_{i=0}^n`, style)
      const limits = formula(String.raw`\sum\limits_{i=0}^n`, style)
      const sides = formula(String.raw`\sum\nolimits_{i=0}^n`, style)
      near(automatic.size.height, (style === 'display' ? limits : sides).size.height)
      expect(limits.size.height).toBeGreaterThan(sides.size.height)
      const integral = formula(String.raw`\int\limits_0^1`, style)
      expect(integral.size.height).toBeGreaterThan(formula(String.raw`\int_0^1`, style).size.height)
      const direct = new SupSub({ children: new MathOp({ children: '\\int', limits: 'always' }),
        sup: '1', sub: '0', style, font_size: px(40) })
      near(pass.layout(direct).size.width, integral.size.width)
      near(pass.layout(direct).size.height, integral.size.height)
    }
    for (const [source, policy] of [[String.raw`\sum`, 'auto'], [String.raw`\int\limits`, 'always'],
      [String.raw`\sum\nolimits`, 'never']] as const) {
      expect(parse_math(source)[0]).toMatchObject({ kind: 'operator', limits: policy })
    }
    expect(formula(String.raw`\operatorname*{argmax}_x`).size.height)
      .toBeGreaterThan(formula(String.raw`\operatorname{argmax}_x`).size.height)
    for (const style of ['display', 'text'] as const) {
      near(formula(String.raw`\operatorname*{rank}\nolimits_x`, style).size.height,
        formula(String.raw`\operatorname{rank}_x`, style).size.height)
      near(formula(String.raw`\operatorname{rank}\limits_x`, style).size.height,
        formula(String.raw`\operatorname*{rank}\limits_x`, style).size.height)
    }
    const macro = pass.layout(new Latex({ children: '\\op_x', strut: false, font_size: px(40),
      macros: { '\\op': String.raw`\operatorname*{rank}\nolimits` } }))
    near(macro.size.height, formula(String.raw`\operatorname{rank}_x`).size.height)
    expect(formula(String.raw`\oiint+\oiiint`).ink).not.toBeNull()
    expect(formula(String.raw`\smallint`).size.height).toBeLessThan(formula(String.raw`\int`).size.height)
    const sum = pass.layout(new MathOp({ children: 'sum', style: 'display', font_size: px(40) }))
    near(sum.size.height, 1.60001 * 40)
    expect(sum.math!.nucleus).toBeUndefined()
    const integral = pass.layout(new SupSub({ children: new MathOp({ children: '∫' }), sup: '1', sub: '0', style: 'display', font_size: px(40) }))
    const [base, sup] = integral.children
    expect(sup.offset.y + sup.fragment.guides.baseline!).toBeLessThan(base.offset.y + base.fragment.guides.baseline! - 0.8 * 40)
  })
})

describe('fractions, roots, and delimiters', () => {
  test('fraction rules honor absolute TeX dimensions and numerator/denominator clearances', () => {
    for (const style of ['display', 'text', 'script', 'scriptscript'] as const) {
      const result = formula(String.raw`\genfrac{}{}{2pt}{}{a}{b}`, style)
      const bars = descendants(result).flatMap(item => item.draw).filter(draw => draw.kind === 'rect')
      expect(bars).toHaveLength(1)
      if (bars[0].kind === 'rect') near(bars[0].rect.height, 8)
      const no_bar = formula(String.raw`\genfrac{}{}{0pt}{}{a}{b}`, style)
      expect(descendants(no_bar).flatMap(item => item.draw).some(draw => draw.kind === 'rect')).toBe(false)
    }
    const result = pass.layout(new Frac({ font_size: px(40), children: ['a', 'b'], style: 'display' }))
    const [num, den, bar] = result.children[1].fragment.children
    expect(bar.offset.y - num.offset.y - num.fragment.size.height).toBeGreaterThanOrEqual(3 * 0.04 * 40 - 1e-8)
    expect(den.offset.y - bar.offset.y - bar.fragment.size.height).toBeGreaterThanOrEqual(3 * 0.04 * 40 - 1e-8)
    near(formula(String.raw`\frac ab`).size.width, result.size.width)
    const cfrac = formula(String.raw`\cfrac{1}{1+x}`)
    expect(cfrac.size.height).toBeGreaterThan(formula(String.raw`\frac{1}{1+x}`).size.height)
    expect(formula(String.raw`\binom nk`).size.width).toBeGreaterThan(formula(String.raw`{n\atop k}`).size.width)
    const data = parse_math(String.raw`\genfrac{[}{]}{2pt}{}{a}{b}`)[0]
    expect(data).toMatchObject({ kind: 'fraction', has_bar: true, bar_size: { value: 2, unit: 'pt' }, left_delim: '[', right_delim: ']' })
  })

  test('roots cramp their bodies, use a scriptscript index, and keep tall surds narrow', () => {
    const root = pass.layout(new Sqrt({ children: 'x^x', index: '3', font_size: px(40) }))
    const body = root.children[2].fragment, index = root.children[3].fragment
    near(body.size.height, formula('x^x', 'text-cramped').size.height)
    near(index.math!.advance, symbols(formula('3', 'scriptscript'))[0].math!.advance)
    const text_root = pass.layout(new Sqrt({ children: 'x', font_size: px(40), style: 'text' }))
    const script_root = pass.layout(new Sqrt({ children: 'x', font_size: px(40), style: 'script' }))
    near(script_root.children[0].fragment.size.width / text_root.children[0].fragment.size.width, 0.7)
    const tall = (height: number) => pass.layout(new Sqrt({ font_size: px(40),
      children: new MathBox({ height: em(height), children: new MathSymbol({ children: 'x' }) }) }))
    const a = tall(8), b = tall(12)
    near(a.children[0].fragment.size.width, b.children[0].fragment.size.width)
    expect(b.children[0].fragment.size.height).toBeGreaterThan(a.children[0].fragment.size.height)
    const wide = pass.layout(new Sqrt({ font_size: px(40), children: 'x', index: '123456789' }))
    expect(wide.size.width).toBeGreaterThan(root.size.width)
    expect(wide.overflow.left).toBe(0)
    expect(formula(String.raw`\sqrt{\kern-1em}`).size.width).toBeGreaterThanOrEqual(0)
  })

  test('middle delimiters fit the whole group, preserve color, and skip missing size glyphs', () => {
    const result = pass.layout(new Bracket({ font_size: px(40), middle: '|',
      children: [new MathText({ children: 'x' }), new Frac({ children: ['a', 'b'], style: 'display' })] }))
    const middle = result.children.find(child => child.fragment.math?.left === 'none')!
    const body = result.children.find(child => child.fragment.name === 'Frac')!
    expect(middle.fragment.size.height).toBeGreaterThanOrEqual(body.fragment.size.height * 0.901)
    const tinted = formula(String.raw`\left(x\color{red}\middle|\frac ab\right)`)
    expect(render_svg(tinted)).toContain('red')
    for (const text of [String.raw`\left|\frac ab\right|`, String.raw`\left\uparrow\frac ab\right\downarrow`,
      String.raw`\left(\left[x\middle|\frac ab\right]\middle\|y\right)`, String.raw`\bigl< x\bigr>`]) {
      expect(formula(text).ink).not.toBeNull()
    }
    const shaped: string[] = []
    const provider: FontProvider = { resolve(face, weight, style) {
      const font = fonts.resolve(face, weight, style)
      return { ...font, has_glyphs: text => face === 'KaTeX_Size2' ? false : font.has_glyphs(text),
        shape: text => { shaped.push(face); return font.shape(text) } }
    } }
    const fallback = new LayoutPass({ fonts: { value: provider, version: 0 } })
    fallback.layout(new Bracket({ delimiter_height: em(1.7), children: 'x' }))
    expect(shaped).not.toContain('KaTeX_Size2')
    expect(shaped).toContain('KaTeX_Size3')
  })

  test('compound elements retain sizing, immutable sharing, and prepared work across offers', () => {
    let calls = 0
    const provider: FontProvider = { resolve(face, weight, style) {
      const font = fonts.resolve(face, weight, style)
      return { ...font, shape: text => { calls++; return font.shape(text) } }
    } }
    const local = new LayoutPass({ fonts: { value: provider, version: 0 } })
    const shared = new SupSub({ children: 'f', sup: 'x' })
    const source = new Frac({ children: [shared, shared], font_size: px(40), style: 'display' })
    const a = local.layout(source), count = calls
    const b = local.layout(source, make_request({ width: available(400) }))
    near(a.size.width, b.size.width)
    expect(calls).toBe(count)
    const tiny = local.layout(source, make_request({ width: exact(2) }))
    expect(tiny.size.width).toBe(2)
    expect(tiny.overflow.right).toBeLessThan(1e-8)
    expect(tiny.size.height).toBeLessThan(a.size.height)
    expect(calls).toBe(count)
    expect(local.stats.hits).toBeGreaterThan(0)
    expect(Object.isFrozen(a.children[1].fragment)).toBe(true)
  })

  test('common formulas render through both parsed TeX and multiline JSX', () => {
    const examples = [
      [String.raw`e^{i\pi}+1=0`, `<MathText>
        <SupSub sup="iπ"><MathSymbol>e</MathSymbol></SupSub>
        +1=0
      </MathText>`],
      [String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`, `<MathText>
        x=
        <Frac>
          <MathText>
            -b±<Sqrt><MathText><SupSub sup="2">b</SupSub>-4ac</MathText></Sqrt>
          </MathText>
          <MathText>2a</MathText>
        </Frac>
      </MathText>`],
      [String.raw`\int_{-\infty}^\infty e^{-x^2}\,dx=\sqrt\pi`, `<MathText>
        <SupSub sub="-∞" sup="∞"><MathOp>∫</MathOp></SupSub>
        <SupSub sup="-x^2">e</SupSub>
        <MathSpacer advance="thin" />dx=<Sqrt>π</Sqrt>
      </MathText>`],
      [String.raw`\sum_{n=0}^\infty\frac{x^n}{n!}`, `<MathText>
        <SupSub sub="n=0" sup="∞">
          <MathOp>∑</MathOp>
        </SupSub>
        <Frac>
          <SupSub sup="n">x</SupSub>
          <MathText>n!</MathText>
        </Frac>
      </MathText>`],
      [String.raw`\frac{1}{1+\frac{1}{x}}`, `<MathText>
        <Frac>
          <MathText>1</MathText>
          <MathText>
            1+
            <Frac>
              <MathText>1</MathText>
              <MathText>x</MathText>
            </Frac>
          </MathText>
        </Frac>
      </MathText>`],
    ]
    for (const [tex, jsx] of examples) {
      const parsed = formula(tex)
      const element = evaluate(`<MathText style="display" font-size={px(40)}>${jsx}</MathText>`, { scope: math })
      const direct = pass.layout(element)
      near(direct.size.width, parsed.size.width)
      near(direct.size.height, parsed.size.height)
      expect(ink(element)).toContain('<path')
      expect(ink(element)).not.toContain('<text')
    }
  })
})
