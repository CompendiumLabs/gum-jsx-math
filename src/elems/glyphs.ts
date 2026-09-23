import { draw_path, make_size, make_point, transform_path, transform_rect, MissingGlyphError } from '@gum-jsx/core'
import type { LayoutQuery, FontProvider, MathClass } from '@gum-jsx/core'
import { MathElement, literal_text } from './base'
import { math_context, math_font_size, MATH_AXIS, math_metrics, finish_math } from '../metrics'
import { MathError } from '../errors'
import { MATH_SKEW } from '../skew'
import { MATH_ITALIC } from '../italic'
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
  const shape = query.prepare('math-glyph', () => {
    try { return query.resource<FontProvider>('fonts').resolve(face, 400, 'normal').shape(text) }
    catch (error) {
      if (!(error instanceof MissingGlyphError)) throw error
      throw new MathError('glyph', error.message, props.source, props.source_range, undefined, { cause: error })
    }
  })
  const top = shape.ink?.y ?? 0, height = shape.ink?.height ?? 0
  const baseline = -top * font_size
  const axis = props.center ? height * font_size / 2 : baseline - MATH_AXIS * font_size
  const advance = shape.advance * font_size
  const matrix = [font_size, 0, 0, font_size, 0, baseline] as const
  const ink = transform_rect(shape.ink, make_point(), matrix)
  const draw = draw_path(transform_path(shape.commands, matrix), {
    fill: query.style.color, stroke: 'none', stroke_width: 0, opacity: query.style.opacity,
  }, ink)
  const character = [...text].length === 1 && shape.ink !== null
  const correction = MATH_ITALIC[face] ? MATH_ITALIC[face][text] ?? 0
    : Math.max(0, (shape.ink?.x ?? 0) + (shape.ink?.width ?? 0) - shape.advance)
  const italic = character && correct_italic ? correction * font_size : 0
  return finish_math({
    size: make_size(advance, height * font_size), draw: [draw],
    guides: { baseline, math_axis: axis },
    math: math_metrics(advance, props.klass ?? klass, {
      ...(props.left === undefined ? {} : { left: props.left }),
      right: props.right ?? props.left ?? props.klass ?? klass, italic,
      skew: (props.skew ?? skew) * font_size, ...(character ? { nucleus: 'character' } : {}),
    }),
  }, query)
}

class MathSpan extends MathElement<MathSpanProps> {
  static layout(props: MathSpanProps, query: LayoutQuery) {
    const requested = props.font_family ?? (query.style.font_family.startsWith('KaTeX_') ? query.style.font_family : 'KaTeX_Main')
    const face = requested === 'auto' ? 'KaTeX_Main' : requested
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
    const fallback = entry?.font === 'ams' ? 'KaTeX_AMS'
      : family === 'mathord' && mode === 'math' ? 'KaTeX_Math' : 'KaTeX_Main'
    const requested = props.font_family ?? (query.style.font_family.startsWith('KaTeX_') ? query.style.font_family : undefined)
    const override = requested === 'auto' ? undefined : requested
    let face = fallback
    if (override) {
      const candidates = override === 'KaTeX_Math-BoldItalic'
        ? (family === 'mathord' ? [override, 'KaTeX_Main-Bold'] : ['KaTeX_Main-Bold']) : [override]
      const fonts = query.resource<FontProvider>('fonts')
      face = candidates.find(name => fonts.resolve(name, 400, 'normal').has_glyphs(value)) ?? fallback
    }
    return glyph_layout(props, query, value, face, SYMBOL_CLASS[family], MATH_SKEW[face]?.[value] ?? 0,
      mode === 'math' && override !== 'KaTeX_Main-Italic')
  }
}

export { MathSpan, MathSymbol, glyph_layout }
export type { MathSpanProps, MathSymbolProps }

// Generated prop registrations; run the workspace props:generate command.
import { register_props } from '@gum-jsx/core'
import { prop_schemas } from '../prop-schemas'
register_props(MathSpan, prop_schemas.MathSpan)
register_props(MathSymbol, prop_schemas.MathSymbol)
