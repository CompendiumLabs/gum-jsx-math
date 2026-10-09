import { math_fonts } from '../font-provider'
import { draw_path, draw_text, make_size, make_point, transform_path, transform_rect, MissingGlyphError } from '@gum-jsx/core'
import type { LayoutQuery, FontProvider, MathClass } from '@gum-jsx/core'
import { MathElement, literal_text } from './base'
import { math_context, math_font_size, math_metrics, finish_math } from '../metrics'
import { MathError } from '../errors'
import symbols from '../symbols'
import { SYMBOL_CLASS } from '../types'
import type { MathAtomProps, SourceRange, SymbolMode } from '../types'

type MathSpanProps = MathAtomProps & Readonly<{
  center?: boolean; skew?: number
  source?: string; source_range?: SourceRange
}>
type MathSymbolProps = MathSpanProps & Readonly<{ mode?: SymbolMode }>

function glyph_layout(props: MathSpanProps, query: LayoutQuery, text: string, face: string,
  klass: MathClass, skew = 0, correct_italic = true) {
  const context = math_context(props, query)
  const font_size = math_font_size(query, context)
  const provider = math_fonts(query)
  const { glyph, shape } = query.prepare('math-glyph', () => {
    const fonts = query.resource<FontProvider>('fonts')
    const glyph = provider.glyph_font(face, text, fonts)
    try { return { glyph, shape: fonts.resolve(glyph.face, 400, 'normal').shape(glyph.text) } }
    catch (error) {
      if (!(error instanceof MissingGlyphError)) throw error
      throw new MathError('glyph', error.message, props.source, props.source_range, undefined, { cause: error })
    }
  })
  const top = shape.ink?.y ?? 0, height = shape.ink?.height ?? 0
  const baseline = -top * font_size
  const axis = props.center ? height * font_size / 2 : baseline - math_fonts(query).axis_height * font_size
  const advance = shape.advance * font_size
  const matrix = [font_size, 0, 0, font_size, 0, baseline] as const
  const ink = transform_rect(shape.ink, make_point(), matrix)
  const paint = {
    fill: query.style.color, stroke: 'none', stroke_width: 0, opacity: query.style.opacity,
  }
  // Mixed mode keeps math outlined. Metrics, baseline, ink, and italic correction
  // stay the same in every mode.
  const draw = query.resource<string>('text_mode') === 'live' && text
    ? draw_text(glyph.text, make_point(0, baseline), advance,
      { family: glyph.face, size: font_size, weight: 400, style: 'normal', color: false }, paint, ink, 'start', shape.glyphs)
    : draw_path(transform_path(shape.commands, matrix), paint, ink)
  const character = [...text].length === 1 && shape.ink !== null
  const correction = provider.italic_correction(glyph.face, glyph.text, shape)
  const italic = character && correct_italic ? correction * font_size : 0
  return finish_math({
    size: make_size(advance, height * font_size), draw: [draw],
    ...(glyph.text !== text ? { label: text } : {}),
    guides: { baseline, math_axis: axis },
    math: math_metrics(advance, props.klass ?? klass, {
      ...(props.left === undefined ? {} : { left: props.left }),
      right: props.right ?? props.left ?? props.klass ?? klass, italic,
      skew: (props.skew ?? (glyph.face === face ? skew : 0)) * font_size,
      ...(character ? { nucleus: 'character' } : {}),
    }),
  }, query)
}

class MathSpan extends MathElement<MathSpanProps> {
  static layout(props: MathSpanProps, query: LayoutQuery) {
    const face = math_fonts(query).span_font(props.font_family, query.style.font_family)
    return glyph_layout(props, query, literal_text(props.children), face, 'mord')
  }
}

class MathSymbol extends MathElement<MathSymbolProps> {
  static layout(props: MathSymbolProps, query: LayoutQuery) {
    const text = literal_text(props.children), mode = props.mode ?? 'math'
    if (mode !== 'math' && mode !== 'text') throw new TypeError('Unknown symbol mode')
    const entry = symbols[mode][text]
    if (!entry && text.startsWith('\\') && text.length > 1) {
      throw new MathError('symbol', `Unknown ${mode} symbol '${text}'`, props.source, props.source_range)
    }
    const family = entry?.family ?? (mode === 'math' ? 'mathord' : 'textord')
    const value = entry?.replace ?? text
    const { face, skew, correct_italic } = math_fonts(query).symbol_font({
      text: value, mode, family, font: entry?.font,
      requested: props.font_family, inherited: query.style.font_family,
    }, query.resource<FontProvider>('fonts'))
    return glyph_layout(props, query, value, face, SYMBOL_CLASS[family], skew, correct_italic)
  }
}

export { MathSpan, MathSymbol, glyph_layout }
export type { MathSpanProps, MathSymbolProps }
