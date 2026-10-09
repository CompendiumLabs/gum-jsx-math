import type { FontProvider, GlyphShape, MathContext } from '@gum-jsx/core'
import type { MathFontProvider, MathSymbolRequest, MathOperatorFont } from '../font-provider'
import { math_alphabet } from '../alphabets'
import type { TextFont } from '../text-fonts'
import { font_scale, tex_metrics } from './metrics'
import { MATH_ITALIC } from '../italic'
import { MATH_SKEW } from '../skew'
import { OPERATOR_METRICS } from '../operator-metrics'
import { STRETCH } from './stretch'
import { MathError } from '../errors'
import symbols from '../symbols'

const FONT_COMMANDS: Readonly<Record<string, string>> = {
  mathrm: 'KaTeX_Main', mathit: 'KaTeX_Main-Italic', mathbf: 'KaTeX_Main-Bold',
  mathnormal: 'KaTeX_Math', mathbb: 'KaTeX_AMS', mathcal: 'KaTeX_Caligraphic',
  mathfrak: 'KaTeX_Fraktur', mathscr: 'KaTeX_Script', mathsf: 'KaTeX_SansSerif',
  mathtt: 'KaTeX_Typewriter', mathsfit: 'KaTeX_SansSerif-Italic', boldsymbol: 'KaTeX_Math-BoldItalic',
}
const DELIMITER_FONTS = ['KaTeX_Main', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4']
const DELIMITER_HEIGHTS = [0, 1.2, 1.8, 2.4, 3]

// Preserve the bundled KaTeX/Computer Modern behavior in one implementation.
class KatexMathFontProvider implements MathFontProvider {
  readonly default_font: string = 'KaTeX_Main'
  readonly axis_height: number = 0.25
  readonly x_height: number = 0.431
  readonly rule_thickness: number = 0.04

  constructor(readonly font_family?: string) {}

  font_scale(context: MathContext) { return font_scale(context) }
  metrics(context: MathContext) { return tex_metrics(context) }
  font_command(command: string) { return FONT_COMMANDS[command] }

  // Substitute only supported ordinary faces, retaining real font/text identities.
  glyph_font(face: string, text: string, fonts: FontProvider) {
    if (!this.font_family || !['KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS'].includes(face)) {
      return { face, text }
    }
    const value = face === 'KaTeX_Math' ? math_alphabet(text, 'italic')
      : face === 'KaTeX_AMS' ? math_alphabet(text, 'double-struck') : text
    return fonts.resolve(this.font_family, 400, 'normal').has_glyphs(value)
      ? { face: this.font_family, text: value } : { face, text }
  }

  // Ordinary prose defaults do not override the math font set.
  span_font(requested: string | undefined, inherited: string): string {
    const face = requested ?? (inherited.startsWith('KaTeX_') ? inherited : this.default_font)
    return face === 'auto' ? this.default_font : face
  }

  // Bold symbols may need Main-Bold; missing variants retain the original face.
  symbol_font(request: MathSymbolRequest, fonts: FontProvider) {
    const { text, mode, family, font, requested, inherited } = request
    const fallback = font === 'ams' ? 'KaTeX_AMS'
      : family === 'mathord' && mode === 'math' ? 'KaTeX_Math' : this.default_font
    const selected = requested ?? (inherited.startsWith('KaTeX_') ? inherited : undefined)
    const override = selected === 'auto' ? undefined : selected
    let face = fallback
    if (override) {
      const candidates = override === 'KaTeX_Math-BoldItalic'
        ? (family === 'mathord' ? [override, 'KaTeX_Main-Bold'] : ['KaTeX_Main-Bold']) : [override]
      face = candidates.find(name => {
        const glyph = this.glyph_font(name, text, fonts)
        return fonts.resolve(glyph.face, 400, 'normal').has_glyphs(glyph.text)
      }) ?? fallback
    }
    return { face, skew: MATH_SKEW[face]?.[text] ?? 0,
      correct_italic: mode === 'math' && override !== 'KaTeX_Main-Italic' }
  }

  // Retain weight/shape via Main where Computer Modern lacks a styled face.
  text_font(font: Partial<TextFont>, inherited = this.default_font): string {
    const match = /^KaTeX_(Main|SansSerif|Typewriter)(?:-(Bold|Italic|BoldItalic))?$/.exec(inherited)
    if (font.family === undefined && font.bold === undefined && font.italic === undefined) {
      return inherited.startsWith('KaTeX_') ? inherited : this.default_font
    }
    const family = font.family ?? (match?.[1] === 'SansSerif' ? 'sans' : match?.[1] === 'Typewriter' ? 'mono' : 'main')
    const bold = font.bold ?? (match?.[2]?.includes('Bold') ?? false)
    const italic = font.italic ?? (match?.[2]?.includes('Italic') ?? false)
    const base = family === 'sans' && !(bold && italic) ? 'SansSerif'
      : family === 'mono' && !bold && !italic ? 'Typewriter' : 'Main'
    return `KaTeX_${base}${bold && italic ? '-BoldItalic' : bold ? '-Bold' : italic ? '-Italic' : ''}`
  }
  text_fallback(text: string): string {
    return symbols.text[text]?.font === 'ams' ? 'KaTeX_AMS' : this.default_font
  }
  is_monospace(face: string): boolean { return face === 'KaTeX_Typewriter' }

  // KaTeX's corrections differ from outline overhang; use overhang for other faces.
  italic_correction(face: string, text: string, shape: GlyphShape): number {
    return MATH_ITALIC[face] ? MATH_ITALIC[face][text] ?? 0
      : Math.max(0, (shape.ink?.x ?? 0) + (shape.ink?.width ?? 0) - shape.advance)
  }

  // Try smaller Main styles before the dedicated display-sized glyphs.
  delimiter_fonts(context: MathContext) {
    return DELIMITER_FONTS.map((face, index) => ({ face, styles: index === 0
      ? [...new Set([context.style, ...(context.style.startsWith('scriptscript') ? ['script' as const] : []), 'text' as const])]
      : ['text' as const] }))
  }
  delimiter_height(level: number): number { return DELIMITER_HEIGHTS[level] - 0.01 }

  // Contour double/triple integrals need a ring over the available integral glyph.
  operator_font(text: string, large: boolean): MathOperatorFont {
    const oval = text === '∯' || text === '∰', double = text === '∯'
    const value = oval ? (double ? '∬' : '∭') : text
    const face = large ? 'KaTeX_Size2' : 'KaTeX_Size1'
    const contour: MathOperatorFont['contour'] = !oval ? undefined : double
      ? (large ? [0.758, 0.477, 0.254, 0.05] : [0.513, 0.344, 0.197, 0.04])
      : (large ? [1.021, 0.739, 0.302, 0.05] : [0.681, 0.503, 0.197, 0.04])
    return { face, text: value, metrics: OPERATOR_METRICS[face]?.[value], contour }
  }

  stretch_metrics(label: string) {
    const entry = STRETCH[label.replace(/^\\/, '')]
    if (!entry) throw new MathError('unsupported', `Unknown stretchy decoration '${label}'`)
    return entry
  }
}

export { KatexMathFontProvider }
