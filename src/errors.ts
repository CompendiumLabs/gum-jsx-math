import type { SourceRange } from './types'

type MathErrorKind = 'parse' | 'unsupported' | 'symbol' | 'glyph' | 'font'

class MathError extends Error {
  readonly kind: MathErrorKind
  readonly source?: string
  readonly range?: SourceRange
  readonly node?: string

  constructor(kind: MathErrorKind, message: string,
    source?: string, range?: SourceRange, node?: string,
    options?: ErrorOptions) {
    super(`${kind}: ${message}${range ? ` (TeX ${range.start}:${range.end})` : ''}`, options)
    this.kind = kind
    this.source = source
    this.range = range
    this.node = node
    this.name = 'MathError'
  }
}

export { MathError }
export type { MathErrorKind }
