import katex from 'katex'
import type { KatexOptions } from 'katex'
import { em } from 'gum-next-core'
import type { MathClass, MathStyle, MathSizeStyle } from 'gum-next-core'
import { MathError } from './errors'
import { SYMBOL_CLASS } from './types'
import type { SourceRange, SymbolFamily, SymbolMode, LimitPolicy, MathDimension, ArrayCol } from './types'
import symbols from './symbols'

// KaTeX's internal AST is confined to this adapter. No lexer/location instances
// escape into Element props, and a parser upgrade has one compatibility boundary.
type RawNodes = Raw | RawNodes[]
type Raw = {
  type: string; mode?: SymbolMode; text?: string | Raw[]; family?: SymbolFamily
  loc?: SourceRange; body?: RawNodes; color?: string; font?: string
  mclass?: MathClass; name?: string; symbol?: boolean; semisimple?: boolean
  dimension?: { number: number; unit: string }
  base?: Raw; sup?: Raw; sub?: Raw; numer?: Raw; denom?: Raw; index?: Raw
  limits?: boolean; alwaysHandleSupSub?: boolean; suppressBaseShift?: boolean; explicitLimits?: LimitPolicy
  hasBarLine?: boolean; barSize?: { number: number; unit: string } | null; continued?: boolean
  leftDelim?: string | null; rightDelim?: string | null
  left?: string; right?: string; rightColor?: string; delim?: string
  size?: number; style?: MathStyle; resetFont?: boolean; display?: Raw[]; script?: Raw[]; scriptscript?: Raw[]
  cols?: ({ type: 'align'; align: string; pregap?: number; postgap?: number }
    | { type: 'separator'; separator: string })[]
  arraystretch?: number; addJot?: boolean; hskipBeforeAndAfter?: boolean
  rowGaps?: (Raw['dimension'] | null)[]; hLinesBeforeRow?: boolean[][]
  colSeparationType?: string; tags?: (boolean | Raw[])[]
}
const parser = katex as typeof katex & { __parse: (source: string, options: KatexOptions) => Raw[] }
type ParseOptions = Readonly<{
  display?: boolean
  macros?: Readonly<Record<string, string>>
  warnings?: 'error' | 'warn' | 'ignore'
}>
type Attributes = Readonly<{ color?: string; font_family?: string }>
type Located = Attributes & Readonly<{ range?: SourceRange }>
type MathSyntax = Located & (
  | Readonly<{ kind: 'symbol'; text: string; mode: SymbolMode; klass?: MathClass }>
  | Readonly<{ kind: 'literal'; text: string }>
  | Readonly<{ kind: 'text'; body: readonly MathSyntax[] }>
  | Readonly<{ kind: 'space'; advance: number; dimension: MathDimension }>
  | Readonly<{ kind: 'group'; body: readonly MathSyntax[]; klass: MathClass }>
  | Readonly<{ kind: 'operator'; text?: string; body?: readonly MathSyntax[]; symbol: boolean; limits: LimitPolicy; center?: boolean }>
  | Readonly<{ kind: 'scripts'; base: readonly MathSyntax[]; sup?: readonly MathSyntax[]; sub?: readonly MathSyntax[] }>
  | Readonly<{ kind: 'fraction'; numerator: readonly MathSyntax[]; denominator: readonly MathSyntax[];
      has_bar: boolean; bar_size?: MathDimension; continued: boolean; left_delim: string | null; right_delim: string | null }>
  | Readonly<{ kind: 'root'; body: readonly MathSyntax[]; index?: readonly MathSyntax[] }>
  | Readonly<{ kind: 'bracket'; body: readonly MathSyntax[]; left: string; right: string; right_color?: string }>
  | Readonly<{ kind: 'delimiter'; text: string; level: number; klass: MathClass }>
  | Readonly<{ kind: 'middle'; text: string }>
  | Readonly<{ kind: 'scope'; body: readonly MathSyntax[]; style?: MathStyle; size_index?: number }>
  | Readonly<{ kind: 'choice'; choices: Readonly<Record<MathSizeStyle, readonly MathSyntax[]>> }>
  | Readonly<{ kind: 'array'; rows: readonly (readonly (readonly MathSyntax[])[])[];
      cols: readonly ArrayCol[]; stretch: number; jot: boolean; outer: boolean; small: boolean;
      rowgaps: readonly (MathDimension | null)[]; hlines: readonly (readonly boolean[])[] }>
  | Readonly<{ kind: 'unsupported'; node: string }>
)

const FONT_COMMANDS: Record<string, string> = {
  mathrm: 'KaTeX_Main', mathit: 'KaTeX_Main-Italic', mathbf: 'KaTeX_Main-Bold',
  mathnormal: 'KaTeX_Math', mathbb: 'KaTeX_AMS', mathcal: 'KaTeX_Caligraphic',
  mathfrak: 'KaTeX_Fraktur', mathscr: 'KaTeX_Script', mathsf: 'KaTeX_SansSerif',
  mathtt: 'KaTeX_Typewriter', boldsymbol: 'KaTeX_Math-BoldItalic',
}
const UNIT_EM: Record<string, number> = {
  mu: 1 / 18, em: 1, ex: 0.431,
  pt: 0.1, mm: 7227 / 25400, cm: 7227 / 2540, in: 7.227, bp: 803 / 8000,
  pc: 1.2, dd: 1238 / 11570, cc: 14856 / 11570, nd: 685 / 6420, nc: 1370 / 1070, sp: 1 / 655360,
}

function raw_nodes(nodes: RawNodes | undefined): Raw[] {
  return !nodes ? [] : Array.isArray(nodes) ? nodes.flatMap(raw_nodes) : [nodes]
}

function source_range(node: Raw, source: string): SourceRange {
  if (node.loc) return { start: node.loc.start, end: node.loc.end }
  const body = [node.body, node.base, node.sup, node.sub, node.numer, node.denom, node.index].flatMap(raw_nodes)
  if (!body.length) return { start: 0, end: source.length }
  const ranges = body.map(child => source_range(child, source))
  return { start: Math.min(...ranges.map(range => range.start)), end: Math.max(...ranges.map(range => range.end)) }
}

function operator_nodes(nodes: RawNodes | undefined): Raw[] {
  if (!nodes) return []
  if (Array.isArray(nodes)) return nodes.flatMap(operator_nodes)
  return [
    ...(['op', 'operatorname'].includes(nodes.type) ? [nodes] : []),
    ...[nodes.body, nodes.base, nodes.sup, nodes.sub, nodes.numer, nodes.denom, nodes.index,
      nodes.display, Array.isArray(nodes.text) ? nodes.text : undefined, nodes.script, nodes.scriptscript].flatMap(operator_nodes),
  ]
}

function parse_math(source: string, options: ParseOptions = {}): readonly MathSyntax[] {
  let tree: Raw[]
  try {
    const settings: KatexOptions = {
      displayMode: options.display ?? true,
      strict: (code, message) => {
        if (code === 'htmlExtension') throw new MathError('unsupported', message, source)
        return options.warnings ?? 'error'
      },
      macros: { ...options.macros }, throwOnError: true,
      trust: context => { throw new MathError('unsupported', `Unsupported command '${context.command}'`, source) },
    }
    tree = parser.__parse(source, settings)
    const operators = operator_nodes(tree)
    if (operators.some(node => node.type === 'operatorname')) {
      // KaTeX 0.16.47 discards explicit \nolimits on \operatorname*, and both
      // controls on unstarred names. Probe the same expanded input with names
      // represented as \mathop, whose AST retains explicit-control flags.
      // Only copy that policy; keep the original names, typography, and ranges.
      // This also handles controls inside user macros without scanning TeX text.
      const probe = operator_nodes(parser.__parse(source, { ...settings, strict: 'ignore', macros: {
        ...options.macros,
        '\\operatorname@': String.raw`\mathop{\mathrm{#1}}`,
        '\\operatornamewithlimits': String.raw`\mathop{\mathrm{#1}}`,
      } }))
      if (probe.length !== operators.length) {
        throw new MathError('unsupported', 'Cannot preserve operator limits with overridden operator-name macros', source)
      }
      operators.forEach((node, index) => {
        if (node.type === 'operatorname' && probe[index].alwaysHandleSupSub) {
          node.explicitLimits = probe[index].limits ? 'always' : 'never'
        }
      })
    }
  } catch (error) {
    if (!(error instanceof katex.ParseError)) throw error
    const details = error as Error & { position?: number; length?: number; rawMessage?: string }
    const range = details.position === undefined ? undefined : { start: details.position,
      end: Math.min(source.length, details.position + (details.length ?? 1)) }
    // KaTeX's formatted message inserts combining underlines (even between
    // surrogate halves). Keep its plain message and our separate source range.
    throw new MathError('parse', details.rawMessage ?? error.message, source, range, undefined, { cause: error })
  }

  type Context = Attributes & { text_face?: string; upright?: boolean; literal?: boolean }
  function convert(nodes: RawNodes | undefined, context: Context = {}): MathSyntax[] {
    if (!nodes) return []
    if (Array.isArray(nodes)) return nodes.flatMap(node => convert(node, context))
    const node = nodes, range = source_range(node, source)
    const { color, font_family } = context
    const attr: Located = { ...(color === undefined ? {} : { color }),
      ...(font_family === undefined ? {} : { font_family }), range }
    const unsupported = (detail = node.type): never => {
      throw new MathError('unsupported', `Unsupported TeX ${detail}`, source, range, node.type)
    }
    const dimension = (dim: Raw['dimension']): MathDimension => {
      if (!dim || !(dim.unit in UNIT_EM)) return unsupported('measurement')
      if (dim.unit === 'em' || dim.unit === 'ex' || dim.unit === 'mu') return { value: dim.number, unit: dim.unit }
      return { value: dim.number * UNIT_EM[dim.unit] * 10, unit: 'pt' }
    }
    switch (node.type) {
      case 'mathord': case 'textord': case 'atom': case 'spacing': {
        if (typeof node.text !== 'string') throw new Error(`Invalid KaTeX ${node.type} text`)
        const mode = context.upright ? 'text' : node.mode ?? 'math'
        if (node.type === 'spacing' && symbols[mode][node.text]?.replace === null) return []
        const text = context.upright ? node.text.replace(/\u2212/g, '-').replace(/\u2217/g, '*') : node.text
        const face = mode === 'text' ? context.text_face ?? font_family : font_family
        if (mode === 'text' && context.literal) {
          return [{ ...attr, kind: 'literal', text: symbols.text[text]?.replace ?? text,
            ...(face === undefined ? {} : { font_family: face }) }]
        }
        return [{ ...attr, ...(face === undefined ? {} : { font_family: face }),
          kind: 'symbol', text, mode, ...(node.family ? { klass: SYMBOL_CLASS[node.family] } : {}) }]
      }
      case 'ordgroup': case 'mclass':
        if (node.type === 'ordgroup' && node.semisimple) return convert(node.body, context)
        return [{ ...attr, kind: 'group', body: convert(node.body, context), klass: node.mclass ?? 'mord' }]
      case 'kern': {
        const dim = node.dimension
        if (!dim || !(dim.unit in UNIT_EM)) return unsupported('measurement')
        return [{ ...attr, kind: 'space', advance: dim.number * UNIT_EM[dim.unit], dimension: dimension(dim) }]
      }
      case 'color':
        return convert(node.body, { ...context, color: node.color })
      case 'font': {
        const face = node.font && FONT_COMMANDS[node.font]
        if (!face) return unsupported(`font '${node.font}'`)
        return convert(node.body, { ...context, font_family: face })
      }
      case 'text':
        if (node.font && !['\\text', '\\textrm', '\\textnormal'].includes(node.font)) return unsupported(`text font '${node.font}'`)
        return [{ ...attr, kind: 'text', body: convert(node.body, { ...context, text_face: 'KaTeX_Main', literal: true }) }]
      case 'op':
        return [{ ...attr, kind: 'operator', text: node.name, symbol: node.symbol ?? false,
          ...(node.suppressBaseShift ? { center: false } : {}),
          ...(node.body ? { body: convert(node.body, context) } : {}),
          limits: node.limits ? (node.alwaysHandleSupSub ? 'always' : 'auto') : 'never' }]
      case 'operatorname':
        return [{ ...attr, kind: 'operator', symbol: false, center: false,
          limits: node.explicitLimits ?? (node.alwaysHandleSupSub ? (node.limits ? 'always' : 'auto') : 'never'),
          body: convert(node.body, { ...context, font_family: 'KaTeX_Main', text_face: 'KaTeX_Main', upright: true }) }]
      case 'supsub':
        return [{ ...attr, kind: 'scripts', base: convert(node.base, context),
          ...(node.sup ? { sup: convert(node.sup, context) } : {}),
          ...(node.sub ? { sub: convert(node.sub, context) } : {}) }]
      case 'genfrac':
        return [{ ...attr, kind: 'fraction', numerator: convert(node.numer, context),
          denominator: convert(node.denom, context), has_bar: node.hasBarLine ?? true,
          ...(node.barSize ? { bar_size: dimension(node.barSize) } : {}),
          continued: node.continued ?? false, left_delim: node.leftDelim ?? null, right_delim: node.rightDelim ?? null }]
      case 'sqrt':
        return [{ ...attr, kind: 'root', body: convert(node.body, context),
          ...(node.index ? { index: convert(node.index, context) } : {}) }]
      case 'array': {
        if (node.colSeparationType === 'CD') return unsupported('CD environment')
        // Automatic numbering belongs to a future display container. Named
        // display environments render their body without numbers; explicit
        // tags must still fail visibly instead of disappearing from a table.
        if (node.tags?.some(Array.isArray)) return unsupported('equation tags')
        if (!Array.isArray(node.body) || !node.body.every(Array.isArray)) throw new Error('Invalid KaTeX array body')
        const cols: ArrayCol[] = (node.cols ?? []).map(col => {
          if (col.type === 'separator') {
            if (col.separator !== '|' && col.separator !== ':') return unsupported('array separator')
            return { type: 'separator', separator: col.separator }
          }
          if (col.align !== 'l' && col.align !== 'c' && col.align !== 'r') return unsupported('array alignment')
          return { type: 'align', align: col.align,
            ...(col.pregap === undefined ? {} : { pregap: em(col.pregap) }),
            ...(col.postgap === undefined ? {} : { postgap: em(col.postgap) }) }
        })
        return [{ ...attr, kind: 'array', rows: node.body.map(row => row.map(cell => convert(cell, context))), cols,
          stretch: node.arraystretch ?? 1, jot: node.addJot ?? false, outer: node.hskipBeforeAndAfter ?? false,
          small: node.colSeparationType === 'small', rowgaps: (node.rowGaps ?? []).map(gap => gap ? dimension(gap) : null),
          hlines: (node.hLinesBeforeRow ?? []).map(flags => [...flags]) }]
      }
      case 'leftright':
        return [{ ...attr, kind: 'bracket', body: convert(node.body, context),
          left: node.left!, right: node.right!, right_color: node.rightColor }]
      case 'middle': return [{ ...attr, kind: 'middle', text: node.delim! }]
      case 'delimsizing': return [{ ...attr, kind: 'delimiter', text: node.delim!, level: node.size!, klass: node.mclass! }]
      case 'styling': case 'sizing':
        // Environment cells reset the outer math alphabet, as KaTeX's
        // resetFont flag requests. Local font commands inside the cell win.
        return [{ ...attr, ...(node.resetFont ? { font_family: 'auto' } : {}), kind: 'scope',
          body: convert(node.body, node.resetFont ? { ...context, font_family: 'auto' } : context),
          ...(node.type === 'styling' ? { style: node.style } : { size_index: node.size }) }]
      case 'mathchoice': {
        // All branches must be syntactically valid, but only the selected one
        // needs implemented layout nodes. Keep deferred failures as plain data.
        const choice = (nodes: Raw[] | undefined): MathSyntax[] => {
          try { return convert(nodes, context) }
          catch (error) {
            if (!(error instanceof MathError) || error.kind !== 'unsupported') throw error
            return [{ kind: 'unsupported', node: error.node ?? 'unknown', range: error.range }]
          }
        }
        return [{ ...attr, kind: 'choice', choices: {
          display: choice(node.display), text: choice(Array.isArray(node.text) ? node.text : []),
          script: choice(node.script), scriptscript: choice(node.scriptscript),
        } }]
      }
      default: return unsupported(`node '${node.type}'`)
    }
  }
  return convert(tree)
}

export { parse_math }
export type { MathSyntax, ParseOptions }
