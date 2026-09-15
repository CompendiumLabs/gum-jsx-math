import type { ElementProps, Length, MathClass, MathStyle } from 'gum-next-core'

type SymbolMode = 'math' | 'text'
type SymbolFont = 'main' | 'ams'
type SymbolFamily = 'accent-token' | 'bin' | 'close' | 'inner' | 'mathord' | 'op-token'
  | 'open' | 'punct' | 'rel' | 'spacing' | 'textord'
type SymbolEntry = { font: SymbolFont; family: SymbolFamily; replace: string | null }
type SourceRange = Readonly<{ start: number; end: number }>
type MathProps = ElementProps & Readonly<{ style?: MathStyle; size_index?: number }>
type MathAtomProps = MathProps & Readonly<{ klass?: MathClass; left?: MathClass; right?: MathClass }>
type MathSpace = Length | 'thin' | 'medium' | 'thick' | 'quad' | 'qquad'
type LimitPolicy = 'auto' | 'always' | 'never'
type MathDimension = Readonly<{ value: number; unit: 'em' | 'ex' | 'mu' | 'pt' }>
type ArrayAlign = 'l' | 'c' | 'r'
type ArrayCol = Readonly<
  | { type: 'align'; align: ArrayAlign; pregap?: Length; postgap?: Length }
  | { type: 'separator'; separator: '|' | ':' }
>

const SYMBOL_CLASS: Record<SymbolFamily, MathClass> = {
  mathord: 'mord', textord: 'mord', bin: 'mbin', rel: 'mrel', open: 'mopen',
  close: 'mclose', punct: 'mpunct', inner: 'minner', 'op-token': 'mop',
  'accent-token': 'mord', spacing: 'none',
}

export { SYMBOL_CLASS }
export type { SymbolMode, SymbolFont, SymbolFamily, SymbolEntry, SourceRange, MathProps, MathAtomProps, MathSpace, LimitPolicy, MathDimension,
  ArrayAlign, ArrayCol }
export type { MathStyle, MathSizeStyle, MathClass, MathContext, MathMetrics } from 'gum-next-core'
