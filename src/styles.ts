import type { MathSizeStyle, MathStyle } from '@gum-jsx/core'

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

export { style_size, cramped_style, sup_style, sub_style,
  numerator_style, denominator_style, text_style }
