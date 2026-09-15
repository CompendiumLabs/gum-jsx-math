/// <reference path="./assets.d.ts" />
import { Fonts } from 'gum-next-core'
import MathItalic from 'katex/dist/fonts/KaTeX_Math-Italic.ttf'
import Main from 'katex/dist/fonts/KaTeX_Main-Regular.ttf'
import AMS from 'katex/dist/fonts/KaTeX_AMS-Regular.ttf'
import Size1 from 'katex/dist/fonts/KaTeX_Size1-Regular.ttf'
import Size2 from 'katex/dist/fonts/KaTeX_Size2-Regular.ttf'
import Size3 from 'katex/dist/fonts/KaTeX_Size3-Regular.ttf'
import Size4 from 'katex/dist/fonts/KaTeX_Size4-Regular.ttf'
import MainBold from 'katex/dist/fonts/KaTeX_Main-Bold.ttf'
import MainItalic from 'katex/dist/fonts/KaTeX_Main-Italic.ttf'
import MainBoldItalic from 'katex/dist/fonts/KaTeX_Main-BoldItalic.ttf'
import MathBoldItalic from 'katex/dist/fonts/KaTeX_Math-BoldItalic.ttf'
import Caligraphic from 'katex/dist/fonts/KaTeX_Caligraphic-Regular.ttf'
import Fraktur from 'katex/dist/fonts/KaTeX_Fraktur-Regular.ttf'
import Script from 'katex/dist/fonts/KaTeX_Script-Regular.ttf'
import SansSerif from 'katex/dist/fonts/KaTeX_SansSerif-Regular.ttf'
import SansSerifBold from 'katex/dist/fonts/KaTeX_SansSerif-Bold.ttf'
import SansSerifItalic from 'katex/dist/fonts/KaTeX_SansSerif-Italic.ttf'
import Typewriter from 'katex/dist/fonts/KaTeX_Typewriter-Regular.ttf'

// Each name denotes one exact face. Outlines need no CSS family/weight mapping.
// Imports resolve to paths in Bun and asset URLs in a browser build; no I/O here.
const MATH_FONT_PATHS = Object.freeze({
  KaTeX_Math: MathItalic, KaTeX_Main: Main, KaTeX_AMS: AMS,
  KaTeX_Size1: Size1, KaTeX_Size2: Size2, KaTeX_Size3: Size3, KaTeX_Size4: Size4,
  'KaTeX_Main-Bold': MainBold, 'KaTeX_Main-Italic': MainItalic,
  'KaTeX_Main-BoldItalic': MainBoldItalic, 'KaTeX_Math-BoldItalic': MathBoldItalic,
  KaTeX_Caligraphic: Caligraphic, KaTeX_Fraktur: Fraktur, KaTeX_Script: Script,
  KaTeX_SansSerif: SansSerif, 'KaTeX_SansSerif-Bold': SansSerifBold,
  'KaTeX_SansSerif-Italic': SansSerifItalic, KaTeX_Typewriter: Typewriter,
})
type MathFont = keyof typeof MATH_FONT_PATHS
const MATH_FONTS = Object.freeze(Object.keys(MATH_FONT_PATHS) as MathFont[])
const MATH_BASE_FONTS: readonly MathFont[] = Object.freeze([
  'KaTeX_Math', 'KaTeX_Main', 'KaTeX_AMS', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4',
])
const MATH_EXTRA_FONTS = Object.freeze(MATH_FONTS.filter(name => !MATH_BASE_FONTS.includes(name)))

function registerMathFonts(fonts: Fonts): Fonts {
  for (const name of MATH_FONTS) fonts.register_url(name, new URL(MATH_FONT_PATHS[name], import.meta.url))
  return fonts
}

function createMathFonts(): Fonts { return registerMathFonts(new Fonts()) }

async function loadMathFonts(fonts: Fonts, names: readonly MathFont[] = MATH_FONTS): Promise<void> {
  registerMathFonts(fonts)
  await Promise.all(names.map(name => fonts.load(name)))
}

function loadBaseMathFonts(fonts: Fonts): Promise<void> { return loadMathFonts(fonts, MATH_BASE_FONTS) }

const mathrm: MathFont = 'KaTeX_Main', mathit: MathFont = 'KaTeX_Main-Italic'
const mathbf: MathFont = 'KaTeX_Main-Bold', mathbb: MathFont = 'KaTeX_AMS'
const mathcal: MathFont = 'KaTeX_Caligraphic', mathfrak: MathFont = 'KaTeX_Fraktur'
const mathscr: MathFont = 'KaTeX_Script', mathsf: MathFont = 'KaTeX_SansSerif'
const mathtt: MathFont = 'KaTeX_Typewriter', boldsymbol: MathFont = 'KaTeX_Math-BoldItalic'
const mathnormal: MathFont = 'KaTeX_Math', mathsfit: MathFont = 'KaTeX_SansSerif-Italic'

export { MATH_FONT_PATHS, MATH_FONTS, MATH_BASE_FONTS, MATH_EXTRA_FONTS,
  registerMathFonts, createMathFonts, loadMathFonts, loadBaseMathFonts,
  mathrm, mathit, mathbf, mathbb, mathcal, mathfrak, mathscr, mathsf, mathtt, boldsymbol, mathnormal, mathsfit }
export type { MathFont }
