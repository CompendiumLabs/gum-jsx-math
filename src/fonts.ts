// the KaTeX faces used by the math elements (Latex/Tex), out of the katex package
//
// Each face is registered (by the math plugin) under one name per file for measurement
// (KaTeX_Main, KaTeX_Main-Bold, KaTeX_Math-BoldItalic, ...); the bold and
// italic ones are emitted as the base family plus weight/style (FONT_FACES),
// which is how fontconfig and katex.min.css know them.

import { bold } from '@gum-jsx/core/lib/const'
import { resolveEnv, type Env } from '@gum-jsx/core/env'
import type { FontPath, FontFace, FontPlugin } from '@gum-jsx/core/fonts'

// the KaTeX font files (static imports, so importing this module never needs
// a top-level await; bundlers resolve them as asset urls, bun and node as paths)
// @ts-ignore
import Face_KaTeX_Math_Italic from 'katex/dist/fonts/KaTeX_Math-Italic.ttf'
// @ts-ignore
import Face_KaTeX_Main_Regular from 'katex/dist/fonts/KaTeX_Main-Regular.ttf'
// @ts-ignore
import Face_KaTeX_AMS_Regular from 'katex/dist/fonts/KaTeX_AMS-Regular.ttf'
// @ts-ignore
import Face_KaTeX_Size1_Regular from 'katex/dist/fonts/KaTeX_Size1-Regular.ttf'
// @ts-ignore
import Face_KaTeX_Size2_Regular from 'katex/dist/fonts/KaTeX_Size2-Regular.ttf'
// @ts-ignore
import Face_KaTeX_Size3_Regular from 'katex/dist/fonts/KaTeX_Size3-Regular.ttf'
// @ts-ignore
import Face_KaTeX_Size4_Regular from 'katex/dist/fonts/KaTeX_Size4-Regular.ttf'
// @ts-ignore
import Face_KaTeX_Main_Bold from 'katex/dist/fonts/KaTeX_Main-Bold.ttf'
// @ts-ignore
import Face_KaTeX_Main_Italic from 'katex/dist/fonts/KaTeX_Main-Italic.ttf'
// @ts-ignore
import Face_KaTeX_Main_BoldItalic from 'katex/dist/fonts/KaTeX_Main-BoldItalic.ttf'
// @ts-ignore
import Face_KaTeX_Math_BoldItalic from 'katex/dist/fonts/KaTeX_Math-BoldItalic.ttf'
// @ts-ignore
import Face_KaTeX_Caligraphic_Regular from 'katex/dist/fonts/KaTeX_Caligraphic-Regular.ttf'
// @ts-ignore
import Face_KaTeX_Fraktur_Regular from 'katex/dist/fonts/KaTeX_Fraktur-Regular.ttf'
// @ts-ignore
import Face_KaTeX_Script_Regular from 'katex/dist/fonts/KaTeX_Script-Regular.ttf'
// @ts-ignore
import Face_KaTeX_SansSerif_Regular from 'katex/dist/fonts/KaTeX_SansSerif-Regular.ttf'
// @ts-ignore
import Face_KaTeX_SansSerif_Bold from 'katex/dist/fonts/KaTeX_SansSerif-Bold.ttf'
// @ts-ignore
import Face_KaTeX_SansSerif_Italic from 'katex/dist/fonts/KaTeX_SansSerif-Italic.ttf'
// @ts-ignore
import Face_KaTeX_Typewriter_Regular from 'katex/dist/fonts/KaTeX_Typewriter-Regular.ttf'

const MATH_FONT_PATHS: Record<string, FontPath> = {
    'KaTeX_Math': Face_KaTeX_Math_Italic,
    'KaTeX_Main': Face_KaTeX_Main_Regular,
    'KaTeX_AMS': Face_KaTeX_AMS_Regular,
    'KaTeX_Size1': Face_KaTeX_Size1_Regular,
    'KaTeX_Size2': Face_KaTeX_Size2_Regular,
    'KaTeX_Size3': Face_KaTeX_Size3_Regular,
    'KaTeX_Size4': Face_KaTeX_Size4_Regular,
    // the remaining faces, behind \mathbf, \mathcal, \textit and friends
    'KaTeX_Main-Bold': Face_KaTeX_Main_Bold,
    'KaTeX_Main-Italic': Face_KaTeX_Main_Italic,
    'KaTeX_Main-BoldItalic': Face_KaTeX_Main_BoldItalic,
    'KaTeX_Math-BoldItalic': Face_KaTeX_Math_BoldItalic,
    'KaTeX_Caligraphic': Face_KaTeX_Caligraphic_Regular,
    'KaTeX_Fraktur': Face_KaTeX_Fraktur_Regular,
    'KaTeX_Script': Face_KaTeX_Script_Regular,
    'KaTeX_SansSerif': Face_KaTeX_SansSerif_Regular,
    'KaTeX_SansSerif-Bold': Face_KaTeX_SansSerif_Bold,
    'KaTeX_SansSerif-Italic': Face_KaTeX_SansSerif_Italic,
    'KaTeX_Typewriter': Face_KaTeX_Typewriter_Regular,
}

const MATH_FONT_FACES: Record<string, FontFace> = {
    'KaTeX_Main-Bold': { family: 'KaTeX_Main', weight: bold },
    'KaTeX_Main-Italic': { family: 'KaTeX_Main', style: 'italic' },
    'KaTeX_Main-BoldItalic': { family: 'KaTeX_Main', weight: bold, style: 'italic' },
    'KaTeX_Math-BoldItalic': { family: 'KaTeX_Math', weight: bold, style: 'italic' },
    'KaTeX_SansSerif-Bold': { family: 'KaTeX_SansSerif', weight: bold },
    'KaTeX_SansSerif-Italic': { family: 'KaTeX_SansSerif', style: 'italic' },
}

const MATH_FONTS: string[] = Object.keys(MATH_FONT_PATHS)

// what ordinary math needs: letters, digits, operators, \mathbb, delimiters and
// large operators (~190 kB); the rest sit behind the font commands (\mathbf,
// \mathit, \boldsymbol, \mathcal, \mathfrak, \mathscr, \mathsf, \mathtt,
// \text*; ~290 kB) and can be fetched on demand (see mathToElementAsync)
const MATH_BASE_FONTS: string[] = [ 'KaTeX_Math', 'KaTeX_Main', 'KaTeX_AMS', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4' ]
const MATH_EXTRA_FONTS: string[] = MATH_FONTS.filter(name => !MATH_BASE_FONTS.includes(name))

// the faces as a font plugin (part of the math plugin, see elems.ts)
const MATH_FONT_PLUGIN: FontPlugin = { paths: MATH_FONT_PATHS, faces: MATH_FONT_FACES }

// load faces into an Env (default: the default Env), registering them first
// so a host need not have used the math plugin yet
function loadFaces(names: string[], env?: Env): Promise<void> {
    const env1 = resolveEnv(env)
    env1.registerFonts(MATH_FONT_PATHS, MATH_FONT_FACES)
    return env1.loadFonts(names)
}

// all 18 faces (~480 kB): enough for anything Latex/Tex can set
function loadMathFonts(env?: Env): Promise<void> {
    return loadFaces(MATH_FONTS, env)
}

// the base faces only (~190 kB)
function loadBaseMathFonts(env?: Env): Promise<void> {
    return loadFaces(MATH_BASE_FONTS, env)
}

export { MATH_FONT_PATHS, MATH_FONT_FACES, MATH_FONT_PLUGIN, MATH_FONTS, MATH_BASE_FONTS, MATH_EXTRA_FONTS, loadMathFonts, loadBaseMathFonts }
