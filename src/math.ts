// Standalone LaTeX → SVG rendering (see render.ts for PNG/kitty output)
//
// A lightweight alternative to MathJax/KaTeX for server-side math rendering.
// The TeX string is parsed (with katex's parser) into gum.jsx math elements
// and laid out in em units; the resulting Svg is sized from the font size.

import { Svg } from '@gum-jsx/core/elems/core'
import { Box } from '@gum-jsx/core/elems/layout'
import { Latex } from './elems'
import { none } from '@gum-jsx/core/lib/const'
import { em_bounds, em_hink } from '@gum-jsx/core/lib/em'
import { resolveEnv, type Env } from '@gum-jsx/core/env'
import type { Size, ThemeName } from '@gum-jsx/core/lib/types'
import { FontNotLoadedError } from '@gum-jsx/core/fonts'
import { loadMathFonts, loadBaseMathFonts } from './fonts'
import { mathPlugin } from './elems'

// math layout only needs the KaTeX faces. In node they are read from disk on
// first use, so mathToSvg just works. In the browser they must be fetched
// first: either `await loadMathFonts()` (all 18) and use the sync mathToSvg,
// or use mathToSvgAsync, which loads the base faces and fetches the rest only
// when the math asks for them. The math is laid out against `env` (default:
// the default Env) with the math plugin applied and the given theme and
// strict mode, so nothing is left behind in the host's Env.

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
  env?: Env              // the Env to lay out against (default: the default Env)
  theme?: ThemeName      // light or dark (default: the Env's theme)
  strut?: boolean        // enforce a minimum line box around the axis
  strict?: boolean       // throw on rendering fallbacks instead of drawing them (default: the Env's)
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
  const { inline, font_size = DEFAULT_FONT_SIZE, size, padding = 0, color, background, env: env0, theme, strut = true, strict, ...attr } = args

  // the Env for this call: the math elements and faces, with the theme (for
  // color defaults) and strict mode (fallbacks become thrown errors) asked for
  const env = resolveEnv(env0).with({ theme, strict }).use(mathPlugin)

  // parse and lay out the math
  const color_attr = color != null ? { color } : {}
  const latex = new Latex({ children: tex, inline, strut, env, ...color_attr, ...attr })

  // natural math box in em units
  const [ xlo, xhi ] = em_hink(latex.em)
  const [ ylo, yhi ] = em_bounds(latex.em)
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
    env,
  }) : latex

  // size svg to the math box (or fit into the given size by aspect)
  const natural: Size = [ font_size * (width + 2 * padding), font_size * (height + 2 * padding) ]
  return new Svg({ children: [ child ], size: size ?? natural, env })
}

//
// output formats
//

function mathToSvg(tex: string, args: MathArgs = {}): string {
  const elem = mathToElement(tex, args)
  return elem.svg()
}

//
// async variants: load fonts on demand (browser)
//

// lay out with the base faces; if the math sets a face that is not loaded yet
// (\mathbf, \mathcal, ...), fetch the remaining faces in one go and lay out
// again (layout is cheap). A FontNotLoadedError after that is a non-math font
// (e.g. a host-supplied font_family) and is left to the caller.
async function mathToElementAsync(tex: string, args: MathArgs = {}): Promise<Svg> {
  await loadBaseMathFonts(args.env)
  try {
    return mathToElement(tex, args)
  } catch (e) {
    if (!(e instanceof FontNotLoadedError)) throw e
    await loadMathFonts(args.env)
    return mathToElement(tex, args)
  }
}

async function mathToSvgAsync(tex: string, args: MathArgs = {}): Promise<string> {
  const elem = await mathToElementAsync(tex, args)
  return elem.svg()
}

//
// exports
//

export { mathToElement, mathToSvg, mathToElementAsync, mathToSvgAsync, loadMathFonts, loadBaseMathFonts }
export type { MathArgs }
