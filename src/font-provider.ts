import type { FontProvider, GlyphShape, LayoutQuery, MathContext, MathStyle } from '@gum-jsx/core'
import type { SymbolFamily, SymbolFont, SymbolMode } from './types'
import type { TextFont } from './text-fonts'
import { KatexMathFontProvider } from './katex/provider'

// All distances are in the active em. These are the parameters consumed by
// Gum's TeX layout algorithms, independent of how a provider obtains them.
type MathFontMetrics = Readonly<{
  x_height: number; rule: number
  num1: number; num2: number; num3: number; denom1: number; denom2: number
  sup1: number; sup2: number; sup3: number; sub1: number; sub2: number
  sup_drop: number; sub_drop: number; delim1: number; delim2: number
  bigop1: number; bigop2: number; bigop3: number; bigop4: number; bigop5: number
}>
type MathSymbolRequest = Readonly<{
  text: string; mode: SymbolMode; family: SymbolFamily; font?: SymbolFont
  requested?: string; inherited: string; math_font?: string
}>
type MathSymbolFont = Readonly<{ face: string; skew: number; correct_italic: boolean }>
type MathGlyphFont = Readonly<{ face: string; text: string }>
type MathDelimiterFont = Readonly<{ face: string; styles: readonly MathStyle[] }>
type MathOperatorFont = Readonly<{
  face: string; text: string; metrics?: readonly [number, number]
  contour?: readonly [number, number, number, number]
}>
type MathStretchMetrics = Readonly<{ height: number; min_width: number; thickness?: number }>

// Fonts owns font files and outlines; this provider owns math-specific choices
// and metrics. Providers belong to the layout pass, never to source elements.
interface MathFontProvider {
  readonly default_font: string
  readonly axis_height: number
  readonly x_height: number
  readonly rule_thickness: number
  font_scale(context: MathContext): number
  metrics(context: MathContext): MathFontMetrics
  font_command(command: string): string | undefined
  // The inherited family overrides the provider's default for this glyph only.
  glyph_font(face: string, text: string, fonts: FontProvider, family?: string): MathGlyphFont
  span_font(requested: string | undefined, inherited: string): string
  symbol_font(request: MathSymbolRequest, fonts: FontProvider): MathSymbolFont
  text_font(font: Partial<TextFont>, inherited?: string): string
  text_fallback(text: string): string
  is_monospace(face: string): boolean
  italic_correction(face: string, text: string, shape: GlyphShape): number
  delimiter_fonts(context: MathContext): readonly MathDelimiterFont[]
  delimiter_height(level: number): number
  operator_font(text: string, large: boolean): MathOperatorFont
  stretch_metrics(label: string): MathStretchMetrics
}

const DEFAULT_MATH_FONTS: MathFontProvider = Object.freeze(new KatexMathFontProvider())

// An ordinary core pass gets the same bundled math behavior as mathToSvg.
function math_fonts(query: Pick<LayoutQuery, 'resource'>): MathFontProvider {
  return query.resource<MathFontProvider>('math_fonts', DEFAULT_MATH_FONTS)
}

export { DEFAULT_MATH_FONTS, math_fonts }
export type { MathFontProvider, MathFontMetrics, MathSymbolRequest, MathSymbolFont, MathGlyphFont,
  MathDelimiterFont, MathOperatorFont, MathStretchMetrics }
