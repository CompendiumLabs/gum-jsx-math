// @gum-jsx/math: LaTeX math elements for gum.jsx
//
// Importing this module registers the math elements (Latex, Tex, ...) with
// the core element registry, so they are available in evaluated JSX, and
// registers the KaTeX faces with the core font registry.

export * from './elems'
export { MATH_FONT_PATHS, MATH_FONT_FACES, MATH_FONTS, loadMathFonts } from './fonts'
export { mathToElement, mathToSvg } from './math'
export type { MathArgs } from './math'
