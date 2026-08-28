// the KaTeX faces used by the math elements (Latex/Tex), out of the katex package
//
// Each face is registered under one name per file for measurement
// (KaTeX_Main, KaTeX_Main-Bold, KaTeX_Math-BoldItalic, ...); the bold and
// italic ones are emitted as the base family plus weight/style (FONT_FACES),
// which is how fontconfig and katex.min.css know them.

import { bold } from '@gum-jsx/core/lib/const'
import { registerFonts, loadFonts, type FontPath, type FontFace } from '@gum-jsx/core/fonts'

// vite resolves these as assets via static string analysis
const MATH_FONT_PATHS: Record<string, FontPath> = {
    // @ts-ignore
    'KaTeX_Math': (await import('katex/dist/fonts/KaTeX_Math-Italic.ttf')).default,
    // @ts-ignore
    'KaTeX_Main': (await import('katex/dist/fonts/KaTeX_Main-Regular.ttf')).default,
    // @ts-ignore
    'KaTeX_AMS': (await import('katex/dist/fonts/KaTeX_AMS-Regular.ttf')).default,
    // @ts-ignore
    'KaTeX_Size1': (await import('katex/dist/fonts/KaTeX_Size1-Regular.ttf')).default,
    // @ts-ignore
    'KaTeX_Size2': (await import('katex/dist/fonts/KaTeX_Size2-Regular.ttf')).default,
    // @ts-ignore
    'KaTeX_Size3': (await import('katex/dist/fonts/KaTeX_Size3-Regular.ttf')).default,
    // @ts-ignore
    'KaTeX_Size4': (await import('katex/dist/fonts/KaTeX_Size4-Regular.ttf')).default,
    // the remaining faces, behind \mathbf, \mathcal, \textit and friends
    // @ts-ignore
    'KaTeX_Main-Bold': (await import('katex/dist/fonts/KaTeX_Main-Bold.ttf')).default,
    // @ts-ignore
    'KaTeX_Main-Italic': (await import('katex/dist/fonts/KaTeX_Main-Italic.ttf')).default,
    // @ts-ignore
    'KaTeX_Main-BoldItalic': (await import('katex/dist/fonts/KaTeX_Main-BoldItalic.ttf')).default,
    // @ts-ignore
    'KaTeX_Math-BoldItalic': (await import('katex/dist/fonts/KaTeX_Math-BoldItalic.ttf')).default,
    // @ts-ignore
    'KaTeX_Caligraphic': (await import('katex/dist/fonts/KaTeX_Caligraphic-Regular.ttf')).default,
    // @ts-ignore
    'KaTeX_Fraktur': (await import('katex/dist/fonts/KaTeX_Fraktur-Regular.ttf')).default,
    // @ts-ignore
    'KaTeX_Script': (await import('katex/dist/fonts/KaTeX_Script-Regular.ttf')).default,
    // @ts-ignore
    'KaTeX_SansSerif': (await import('katex/dist/fonts/KaTeX_SansSerif-Regular.ttf')).default,
    // @ts-ignore
    'KaTeX_SansSerif-Bold': (await import('katex/dist/fonts/KaTeX_SansSerif-Bold.ttf')).default,
    // @ts-ignore
    'KaTeX_SansSerif-Italic': (await import('katex/dist/fonts/KaTeX_SansSerif-Italic.ttf')).default,
    // @ts-ignore
    'KaTeX_Typewriter': (await import('katex/dist/fonts/KaTeX_Typewriter-Regular.ttf')).default,
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

registerFonts(MATH_FONT_PATHS, MATH_FONT_FACES)

// all 18 faces (~480 kB): enough for anything Latex/Tex can set
function loadMathFonts(): Promise<void> {
    return loadFonts(MATH_FONTS)
}

// the base faces only (~190 kB)
function loadBaseMathFonts(): Promise<void> {
    return loadFonts(MATH_BASE_FONTS)
}

export { MATH_FONT_PATHS, MATH_FONT_FACES, MATH_FONTS, MATH_BASE_FONTS, MATH_EXTRA_FONTS, loadMathFonts, loadBaseMathFonts }
