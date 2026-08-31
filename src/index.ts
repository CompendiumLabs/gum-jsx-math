// @gum-jsx/math: LaTeX math elements for gum.jsx
//
// Importing this module has no side effects. `math` is the plugin: apply it
// to an Env (`env.use(math)`, or `gum.use(math)` for the default one) to make
// the math elements (Latex, Tex, ...) available in evaluated JSX and the
// KaTeX faces known to its font registry. mathToSvg and friends apply it to
// the Env they are given themselves.

export * from './elems'
export { mathPlugin as math } from './elems'
export { MATH_FONT_PATHS, MATH_FONT_FACES, MATH_FONT_PLUGIN, MATH_FONTS, MATH_BASE_FONTS, MATH_EXTRA_FONTS, loadMathFonts, loadBaseMathFonts } from './fonts'
export { mathToElement, mathToSvg, mathToElementAsync, mathToSvgAsync } from './math'
export type { MathArgs } from './math'
