import type { MathContext, MathSizeStyle, MathStyle } from 'gum-jsx-core'

const STYLE_SCALE = { display: 1, text: 1, script: 0.7, scriptscript: 0.5 } as const
const SIZE_MULTIPLIERS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.44, 1.728, 2.074, 2.488] as const
// Text, script, scriptscript font sizes (TeX's 10pt size declarations).
const SIZE_STYLES = [[1, 1, 1], [2, 1, 1], [3, 1, 1], [4, 2, 1], [5, 2, 1],
  [6, 3, 1], [7, 4, 2], [8, 6, 3], [9, 7, 6], [10, 8, 7], [11, 10, 9]] as const

function style_size(style: MathStyle): MathSizeStyle {
  return style.replace('-cramped', '') as MathSizeStyle
}
function cramped_style(style: MathStyle): MathStyle { return `${style_size(style)}-cramped` }
function sup_style(style: MathStyle): MathStyle {
  const next = style.includes('script') ? 'scriptscript' : 'script'
  return style.endsWith('-cramped') ? `${next}-cramped` : next
}
function sub_style(style: MathStyle): MathStyle { return cramped_style(sup_style(style)) }
function numerator_style(style: MathStyle): MathStyle {
  if (style_size(style) !== 'display') return sup_style(style)
  return style.endsWith('-cramped') ? 'text-cramped' : 'text'
}
function denominator_style(style: MathStyle): MathStyle { return cramped_style(numerator_style(style)) }
function text_style(style: MathStyle): MathStyle {
  return style.includes('script') ? (style.endsWith('-cramped') ? 'text-cramped' : 'text') : style
}
function font_index(context: MathContext): number {
  const style = style_size(context.style)
  return SIZE_STYLES[(context.size_index ?? 6) - 1][style === 'script' ? 1 : style === 'scriptscript' ? 2 : 0]
}
function font_scale(context: MathContext): number { return SIZE_MULTIPLIERS[font_index(context) - 1] * context.size }

// Computer Modern parameters from KaTeX 0.16.47 fontMetrics.ts (MIT). Each
// column uses text, script, or scriptscript font metrics, in the active em.
const PARAMETERS = {
  x_height: [0.431, 0.431, 0.431], rule: [0.04, 0.049, 0.049],
  num1: [0.677, 0.732, 0.925], num2: [0.394, 0.384, 0.387], num3: [0.444, 0.471, 0.504],
  denom1: [0.686, 0.752, 1.025], denom2: [0.345, 0.344, 0.532],
  sup1: [0.413, 0.503, 0.504], sup2: [0.363, 0.431, 0.404], sup3: [0.289, 0.286, 0.294],
  sub1: [0.15, 0.143, 0.2], sub2: [0.247, 0.286, 0.4],
  sup_drop: [0.386, 0.353, 0.494], sub_drop: [0.05, 0.071, 0.1],
  delim1: [2.39, 1.7, 1.98], delim2: [1.01, 1.157, 1.42],
  bigop1: [0.111, 0.111, 0.111], bigop2: [0.166, 0.166, 0.166],
  bigop3: [0.2, 0.2, 0.2], bigop4: [0.6, 0.611, 0.611], bigop5: [0.1, 0.143, 0.143],
} as const
function tex_metrics(context: MathContext): Record<keyof typeof PARAMETERS, number> {
  const index = font_index(context), column = index >= 5 ? 0 : index >= 3 ? 1 : 2
  return Object.fromEntries(Object.entries(PARAMETERS).map(([key, values]) => [key, values[column]])) as
    Record<keyof typeof PARAMETERS, number>
}

export { STYLE_SCALE, SIZE_MULTIPLIERS, style_size, cramped_style, sup_style, sub_style,
  numerator_style, denominator_style, text_style, font_scale, tex_metrics }
