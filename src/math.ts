// Standalone LaTeX → SVG rendering (see render.ts for PNG/kitty output)
//
// A lightweight alternative to MathJax/KaTeX for server-side math rendering.
// The TeX string is parsed (with katex's parser) into gum.jsx math elements
// and laid out in em units; the resulting Svg is sized from the font size.

import { Svg } from '@gum-jsx/core/elems/core'
import { Box } from '@gum-jsx/core/elems/layout'
import { Latex } from './elems'
import { none } from '@gum-jsx/core/lib/const'
import { setTheme, type ThemeName } from '@gum-jsx/core/lib/theme'
import { setStrict } from '@gum-jsx/core/lib/strict'
import type { Size } from '@gum-jsx/core/lib/types'
import { is_browser } from '@gum-jsx/core/lib/utils'
import { loadMathFonts } from './fonts'

// math layout only needs the KaTeX faces; in the browser start that download
// on import (without blocking), hosts must still `await loadMathFonts()` before
// calling mathToSvg; in node the fonts are loaded from disk on first use
if (is_browser()) loadMathFonts().catch(() => {})

//
// types
//

interface MathArgs {
  inline?: boolean       // text style (inline) rather than display style
  font_size?: number     // font size in pixels (ignored if size is given)
  size?: number | Size   // overall size to fit the math into (overrides font_size)
  padding?: number       // padding around the math in em
  color?: string         // text color (defaults to theme color)
  background?: string    // background color (default: transparent)
  theme?: ThemeName      // light or dark
  strut?: boolean        // enforce a minimum line box around the axis
  strict?: boolean       // throw on rendering fallbacks instead of drawing them
  [key: string]: any     // other attributes forwarded to Latex
}

const DEFAULT_FONT_SIZE = 24

//
// element construction
//

// build an Svg element sized to the math: by default the natural size at the
// given font size (the viewBox is the math box in em units scaled by font_size,
// so glyphs render at exactly `font_size` pixels per em); if `size` is given,
// the math is instead fit into that box preserving its aspect ratio
function mathToElement(tex: string, args: MathArgs = {}): Svg {
  const { inline, font_size = DEFAULT_FONT_SIZE, size, padding = 0, color, background, theme = 'light', strut = true, strict = false, ...attr } = args

  // set theme for color defaults
  setTheme(theme)

  // turn silent rendering fallbacks into thrown errors
  setStrict(strict)

  // parse and lay out the math
  const color_attr = color != null ? { color } : {}
  const latex = new Latex({ children: tex, inline, strut, ...color_attr, ...attr })

  // natural math box in em units
  const { advance, vrange: [ ylo, yhi ], hrange } = latex.math
  const [ xlo, xhi ] = hrange ?? [ 0, advance ]
  const width = Math.max(xhi - xlo, 1e-6)
  const height = Math.max(yhi - ylo, 1e-6)

  // pad and optionally fill background (padding is in em, so convert to fractions of the math box)
  const boxed = padding > 0 || background != null
  const child = boxed ? new Box({
    children: [ latex ],
    padding: [ padding / width, padding / height, padding / width, padding / height ],
    fill: background,
    stroke: none,
    adjust: false,
  }) : latex

  // size svg to the math box (or fit into the given size by aspect)
  const natural: Size = [ font_size * (width + 2 * padding), font_size * (height + 2 * padding) ]
  return new Svg({ children: [ child ], size: size ?? natural })
}

//
// output formats
//

function mathToSvg(tex: string, args: MathArgs = {}): string {
  const elem = mathToElement(tex, args)
  return elem.svg()
}

//
// exports
//

export { mathToElement, mathToSvg, loadMathFonts }
export type { MathArgs }
