import type { SourceRange } from './types'

type MathErrorKind = 'parse' | 'unsupported' | 'symbol' | 'glyph' | 'font'

class MathError extends Error {
  constructor(readonly kind: MathErrorKind, message: string,
    readonly source?: string, readonly range?: SourceRange, readonly node?: string,
    options?: ErrorOptions) {
    super(`${kind}: ${message}${range ? ` (TeX ${range.start}:${range.end})` : ''}`, options)
    this.name = 'MathError'
  }
}

export { MathError }
export type { MathErrorKind }
