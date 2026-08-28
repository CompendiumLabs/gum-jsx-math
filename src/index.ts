// @gum-jsx/math: LaTeX math elements for gum.jsx
//
// Importing this module registers the math elements (Latex, Tex, ...) with
// the core element registry, so they are available in evaluated JSX, and
// registers the KaTeX faces with the core font registry.

export * from './elems'
export { MATH_FONT_PATHS, MATH_FONT_FACES, MATH_FONTS, MATH_BASE_FONTS, MATH_EXTRA_FONTS, loadMathFonts, loadBaseMathFonts } from './fonts'
export { mathToElement, mathToSvg, mathToElementAsync, mathToSvgAsync } from './math'
export type { MathArgs } from './math'
