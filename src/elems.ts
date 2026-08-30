// math components

import './types/katex.d.ts'
import { THEME } from '@gum-jsx/core/lib/theme'
import { none, black, red, maxis, d2r } from '@gum-jsx/core/lib/const'
import { EMPTY_VRANGE, DEFAULT_VRANGE, textHasGlyphs, rawTextMetrics, type TextMetrics } from '@gum-jsx/core/lib/text'
import { StrictError, strictError } from '@gum-jsx/core/lib/strict'
import { FontNotLoadedError } from '@gum-jsx/core/fonts'
import { is_array, is_scalar, is_string, is_boolean, is_object, check_singleton, check_array, check_string, ensure_vector, merge_limits, prefix_split, join_limits, sum, max, range, rotate_aspect, pad_rect } from '@gum-jsx/core/lib/utils'
import symbols from './symbols'
import { registerElements } from '@gum-jsx/core/lib/registry'
import './fonts'
import { Context, Element, Group, Spacer, Rectangle, spec_split, ensure_children } from '@gum-jsx/core/elems/core'
import { Polygon, Line, Arc, Arrow, ArrowHead, Ellipse } from '@gum-jsx/core/elems/geometry'
import { Span } from '@gum-jsx/core/elems/text'
import { __parse as parse_tex } from 'katex'

import type { Padding, Point, Rect, Limit, Align, Attrs } from '@gum-jsx/core/lib/types'
import type { ElementArgs, GroupArgs } from '@gum-jsx/core/elems/core'
import type { SpanArgs } from '@gum-jsx/core/elems/text'
import type { Measurement, SymbolMode, SymbolFamily, SymbolFont, SymbolEntry, Tree, TreeNode, TreeHorizBrace, TreeXArrow, TreeOperatorName, TreeEnclose } from 'katex'

//
// types
//

type FontFamily =
    | 'KaTeX_Math' | 'KaTeX_Main' | 'KaTeX_AMS' | 'KaTeX_Size1' | 'KaTeX_Size2' | 'KaTeX_Size3' | 'KaTeX_Size4'
    | 'KaTeX_Main-Bold' | 'KaTeX_Main-Italic' | 'KaTeX_Main-BoldItalic' | 'KaTeX_Math-BoldItalic'
    | 'KaTeX_Caligraphic' | 'KaTeX_Fraktur' | 'KaTeX_Script' | 'KaTeX_SansSerif' | 'KaTeX_SansSerif-Bold' | 'KaTeX_SansSerif-Italic' | 'KaTeX_Typewriter'

type MathClass = 'mord' | 'mop' | 'mbin' | 'mrel' | 'mopen' | 'mclose' | 'mpunct' | 'minner' | 'none'

type MathSpec = {
    left: MathClass
    right: MathClass
    advance: number
    vrange: Limit
    vanchor: number
    italic: number  // superscript overhang past advance (TeX italic correction)
    scale: number   // style scale applied to the content, so its baseline sits MATH_AXIS * scale below the anchor
    hrange?: Limit  // horizontal ink range from the cursor origin, when it differs from [0, advance] (TeX \rlap etc.)
    vink?: Limit    // vertical ink range (same frame as vrange), when it differs from vrange (\smash, \cancel)
}

type MathMetrics = Pick<MathSpec, 'advance' | 'vrange' | 'vanchor'> & Partial<Pick<MathSpec, 'italic' | 'scale' | 'hrange' | 'vink'>>

type WithMath<E extends Element = Element> = E & {
    math: MathSpec
}

//
// fonts
//

const OP_TEXT_FONT: FontFamily = 'KaTeX_Size1'
const OP_DISPLAY_FONT: FontFamily = 'KaTeX_Size2'

// the delimiter sizes: Main is the text size, Size1 ... Size4 the \big ... \Bigg
// sizes; `level` is 1-based, clamped to the table
const SIZE_FONTS: FontFamily[] = [ 'KaTeX_Main', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4' ]

function size_font(level: number): FontFamily {
    return SIZE_FONTS[Math.min(Math.max(level, 1), SIZE_FONTS.length) - 1]
}

const SYMBOL_MODE_FONT: Record<SymbolMode, FontFamily> = {
    math: 'KaTeX_Math',
    text: 'KaTeX_Main',
}

// math font commands (katex's fontMap, keyed by the `font` node's name)
const TEX_FONT_FAMILY: Record<string, FontFamily | undefined> = {
    mathrm: 'KaTeX_Main',
    mathit: 'KaTeX_Main-Italic',
    textit: 'KaTeX_Main-Italic',
    mathbf: 'KaTeX_Main-Bold',
    mathnormal: 'KaTeX_Math',
    mathsfit: 'KaTeX_SansSerif-Italic',
    mathbb: 'KaTeX_AMS',
    mathcal: 'KaTeX_Caligraphic',
    mathfrak: 'KaTeX_Fraktur',
    mathscr: 'KaTeX_Script',
    mathsf: 'KaTeX_SansSerif',
    mathtt: 'KaTeX_Typewriter',
    boldsymbol: 'KaTeX_Math-BoldItalic',  // letters; everything else falls back to Main-Bold (see resolve_font_override)
}

// a face asked for by a font command may not carry the glyph (\mathcal has no
// lowercase, \mathbb no digits); katex then sets the character in its default
// face, and \boldsymbol always sets non-letters in Main-Bold
function resolve_font_override(override: string, text: string, family: SymbolFamily, fallback: FontFamily): string {
    const candidates = override == 'KaTeX_Math-BoldItalic'
        ? (family == 'mathord' ? [ override, 'KaTeX_Main-Bold' ] : [ 'KaTeX_Main-Bold' ])
        : [ override ]
    for (const font_family of candidates) {
        if (textHasGlyphs(text, { font_family })) return font_family
    }
    return fallback
}

// text-mode font commands compose a family (roman, sans, typewriter) with a
// weight and a shape, the way katex's Options carry fontFamily/fontWeight/
// fontShape; the composed face is carried as a family name in `font_family`
type TextFace = { family: 'Main' | 'SansSerif' | 'Typewriter', bold: boolean, italic: boolean }

const TEXT_FONT_COMMANDS: Record<string, Partial<TextFace>> = {
    '\\text': {},
    '\\textrm': { family: 'Main' },
    '\\textnormal': { family: 'Main' },
    '\\textsf': { family: 'SansSerif' },
    '\\texttt': { family: 'Typewriter' },
    '\\textbf': { bold: true },
    '\\textmd': { bold: false },
    '\\textit': { italic: true },
    '\\textup': { italic: false },
}

function parse_text_face(font_family: string | undefined): TextFace {
    const match = /^KaTeX_(Main|SansSerif|Typewriter)(?:-(Bold|Italic|BoldItalic))?$/.exec(font_family ?? '')
    if (match == null) return { family: 'Main', bold: false, italic: false }
    const [ , family, style = '' ] = match
    return { family: family as TextFace['family'], bold: style.startsWith('Bold'), italic: style.endsWith('Italic') }
}

function text_face_family({ family, bold, italic }: TextFace): FontFamily {
    if (family == 'Typewriter') return 'KaTeX_Typewriter'
    if (family == 'SansSerif') return bold ? 'KaTeX_SansSerif-Bold' : italic ? 'KaTeX_SansSerif-Italic' : 'KaTeX_SansSerif'
    return bold && italic ? 'KaTeX_Main-BoldItalic' : bold ? 'KaTeX_Main-Bold' : italic ? 'KaTeX_Main-Italic' : 'KaTeX_Main'
}

// the face a text font command selects, given the one in force (\emph toggles)
function text_font_family(font: string, current: string | undefined): FontFamily | undefined {
    const face = parse_text_face(current)
    if (font == '\\emph') return text_face_family({ ...face, italic: !face.italic })
    const patch = TEXT_FONT_COMMANDS[font]
    if (patch == null) return undefined
    return text_face_family({ ...face, ...patch })
}

// \tiny ... \Huge, indexed by katex's size number (1-11, 6 is \normalsize)
const SIZE_MULTIPLIERS = [ 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.44, 1.728, 2.074, 2.488 ]

//
// constants
//

const MATH_AXIS = maxis
const STRUT: Limit = [ -0.5, 0.5 ]  // minimum line box around the axis for top-level math

// TeX font parameters (Computer Modern, in em) that drive Appendix G layout;
// script-font parameters (sup_drop, sub_drop) are given in script em
const TEX = {
    x_height: 0.431,
    rule: 0.04,         // default rule thickness
    frac_rule: 0.03,    // lighter fraction bar
    sup1: 0.413,        // sup shift, display
    sup2: 0.363,        // sup shift, text and scripts
    sup3: 0.289,        // sup shift, cramped styles
    sub1: 0.15,         // sub shift, no sup
    sub2: 0.247,        // sub shift, with sup
    sup_drop: 0.386,    // sup baseline below top of tall base
    sub_drop: 0.05,     // sub baseline below bottom of tall base
    num1: 0.677,        // numerator shift, display
    num2: 0.394,        // numerator shift, text
    num3: 0.444,        // numerator shift, display no bar
    denom1: 0.686,      // denominator shift, display
    denom2: 0.345,      // denominator shift, text
    bigop1: 0.111,      // min gap: upper limit above op
    bigop2: 0.166,      // min gap: lower limit below op
    bigop3: 0.2,        // upper limit baseline clearance
    bigop4: 0.6,        // lower limit baseline clearance
    bigop5: 0.1,        // padding above/below limits
    script_space: 0.05, // space after scripts
    accent_gap: 0.12,   // accent ink above x-height (as designed in the fonts)
    delim1: 2.39,       // delimiter height for generalized fractions, display (sigma20)
    delim2: 1.01,       // same in text style (sigma21)
    delim2_script: 1.157,  // sigma21 of the script-size font, used in script styles
}

//
// measurement conversion
//

// katex's ptPerUnit table for the absolute units, at 10 pt per em
const PT_PER_EM = 10
const PT_PER_UNIT: Record<string, number> = {
    pt: 1, mm: 7227 / 2540, cm: 7227 / 254, in: 72.27, bp: 803 / 800, pc: 12,
    dd: 1238 / 1157, cc: 14856 / 1157, nd: 685 / 642, nc: 1370 / 107, sp: 1 / 65536,
}

function measurement_to_em(d: Measurement): number {
    const scale: Record<string, number> = {
        mu: 1 / 18,
        em: 1,
        ex: TEX.x_height,
    }
    const factor = scale[d.unit] ?? (PT_PER_UNIT[d.unit] != null ? PT_PER_UNIT[d.unit] / PT_PER_EM : 0)
    return d.number * factor
}

//
// math styles
//

// TeX's eight styles pair four size regimes with cramped/uncramped vertical
// layout. Cramping preserves glyph size but changes script placement and is
// inherited by superscripts; subscripts and fraction denominators are cramped.
type MathSizeStyle = 'display' | 'text' | 'script' | 'scriptscript'
type MathStyle = MathSizeStyle | `${MathSizeStyle}-cramped`

const STYLE_SCALE: Record<MathSizeStyle, number> = {
    display: 1,
    text: 1,
    script: 0.7,
    scriptscript: 0.5,
}

function style_size(style: MathStyle): MathSizeStyle {
    const suffix = '-cramped'
    return style.endsWith(suffix) ? style.slice(0, -suffix.length) as MathSizeStyle : style as MathSizeStyle
}

function is_cramped_style(style: MathStyle): boolean {
    return style.endsWith('-cramped')
}

function make_style(size: MathSizeStyle, cramped: boolean): MathStyle {
    return cramped ? `${size}-cramped` : size
}

function cramped_style(style: MathStyle): MathStyle {
    return make_style(style_size(style), true)
}

function next_script_size(style: MathStyle): MathSizeStyle {
    const size = style_size(style)
    return (size == 'display' || size == 'text') ? 'script' : 'scriptscript'
}

function sup_style(style: MathStyle): MathStyle {
    return make_style(next_script_size(style), is_cramped_style(style))
}

function sub_style(style: MathStyle): MathStyle {
    return make_style(next_script_size(style), true)
}

function next_frac_size(style: MathStyle): MathSizeStyle {
    const size = style_size(style)
    if (size == 'display') return 'text'
    if (size == 'text') return 'script'
    return 'scriptscript'
}

function frac_num_style(style: MathStyle): MathStyle {
    return make_style(next_frac_size(style), is_cramped_style(style))
}

function frac_den_style(style: MathStyle): MathStyle {
    return make_style(next_frac_size(style), true)
}

function is_script_style(style: MathStyle): boolean {
    const size = style_size(style)
    return size == 'script' || size == 'scriptscript'
}

function relative_scale(outer: MathStyle, inner: MathStyle): number {
    return STYLE_SCALE[style_size(inner)] / STYLE_SCALE[style_size(outer)]
}

//
// symbols and spacing
//

const SYMBOL_FAMILY_CLASS: Record<SymbolFamily, MathClass> = {
    mathord: 'mord',
    textord: 'mord',
    bin: 'mbin',
    rel: 'mrel',
    open: 'mopen',
    close: 'mclose',
    punct: 'mpunct',
    inner: 'minner',
    'op-token': 'mop',
    'accent-token': 'mord',
    spacing: 'none',
}

const THINSPACE: Measurement = { number: 3, unit: 'mu' }
const MEDIUMSPACE: Measurement = { number: 4, unit: 'mu' }
const THICKSPACE: Measurement = { number: 5, unit: 'mu' }

type SpacingTable = Partial<Record<MathClass, Measurement>>
const SPACING_TABLE: Record<MathClass, SpacingTable> = {
    mord: { mop: THINSPACE, mbin: MEDIUMSPACE, mrel: THICKSPACE, minner: THINSPACE },
    mop: { mord: THINSPACE, mop: THINSPACE, mrel: THICKSPACE, minner: THINSPACE },
    mbin: { mord: MEDIUMSPACE, mop: MEDIUMSPACE, mopen: MEDIUMSPACE, minner: MEDIUMSPACE },
    mrel: { mord: THICKSPACE, mop: THICKSPACE, mopen: THICKSPACE, minner: THICKSPACE },
    mopen: {},
    mclose: { mop: THINSPACE, mbin: MEDIUMSPACE, mrel: THICKSPACE, minner: THINSPACE },
    mpunct: { mord: THINSPACE, mop: THINSPACE, mrel: THICKSPACE, mopen: THINSPACE, mclose: THINSPACE, mpunct: THINSPACE, minner: THINSPACE },
    minner: { mord: THINSPACE, mop: THINSPACE, mbin: MEDIUMSPACE, mrel: THICKSPACE, mopen: THINSPACE, mpunct: THINSPACE, minner: THINSPACE },
    none: {},
}

//
// math metrics
//

const EMPTY_MATH_METRICS: MathMetrics = {
    advance: 0,
    vrange: EMPTY_VRANGE,
    vanchor: 0,
}

const DEFAULT_MATH_METRICS: MathMetrics = {
    advance: 1,
    vrange: DEFAULT_VRANGE,
    vanchor: MATH_AXIS,
}

function make_math({ left, right, advance, vrange, vanchor, italic, scale, hrange, vink }: Partial<MathSpec>): MathSpec {
    return {
        left: left ?? 'mord',
        right: right ?? 'mord',
        advance: advance ?? EMPTY_MATH_METRICS.advance,
        vrange: vrange ?? EMPTY_MATH_METRICS.vrange,
        vanchor: vanchor ?? EMPTY_MATH_METRICS.vanchor,
        italic: italic ?? 0,
        scale: scale ?? 1,
        hrange,
        vink,
    }
}

function text_math_metrics({ advance, vrange, italic }: TextMetrics): MathMetrics {
    return { advance, vrange, vanchor: MATH_AXIS, italic }
}

function metrics_bounds({ vrange: [ ylo, yhi ], vanchor }: MathMetrics): Limit {
    return [ ylo - vanchor, yhi - vanchor ]
}

function metrics_height({ vrange: [ ylo, yhi ] }: MathMetrics): number {
    return yhi - ylo
}

function metrics_hrange({ advance, hrange }: MathMetrics): Limit {
    return hrange ?? [ 0, advance ]
}

// vertical ink bounds about the anchor: the layout bounds unless the ink
// overhangs them (\smash, \cancel), as hrange does horizontally
function metrics_ink_bounds({ vrange, vanchor, vink }: MathMetrics): Limit {
    const [ ylo, yhi ] = vink ?? vrange
    return [ ylo - vanchor, yhi - vanchor ]
}

// the ink box aspect: width from hrange (advance unless overhanging), height from the ink bounds
function metrics_aspect(metrics: MathMetrics): number | undefined {
    const [ xlo, xhi ] = metrics_hrange(metrics)
    const [ ylo, yhi ] = metrics_ink_bounds(metrics)
    const height = yhi - ylo
    return height > 0 ? (xhi - xlo) / height : undefined
}

// the rect an item draws into when its anchor sits at (x, y): the ink box
function metrics_rect(metrics: MathMetrics, x: number = 0, y: number = 0): Rect {
    const [ xlo, xhi ] = metrics_hrange(metrics)
    const [ ylo, yhi ] = metrics_ink_bounds(metrics)
    return [ x + xlo, y + ylo, x + xhi, y + yhi ]
}

// the ink hull of placed rects, against the layout box: hrange and vink are
// only set when the ink actually overhangs
function hull_overhang(rects: Rect[], advance: number, vrange: Limit): { hrange?: Limit, vink?: Limit, coord: Rect } {
    const [ xlo, xhi ] = merge_limits([ [ 0, advance ], ...rects.map(([ x1, , x2 ]) => [ x1, x2 ] as Limit) ])
    const [ ylo, yhi ] = merge_limits([ vrange, ...rects.map(([ , y1, , y2 ]) => [ y1, y2 ] as Limit) ])
    const hrange: Limit | undefined = (xlo == 0 && xhi == advance) ? undefined : [ xlo, xhi ]
    const vink: Limit | undefined = (ylo == vrange[0] && yhi == vrange[1]) ? undefined : [ ylo, yhi ]
    return { hrange, vink, coord: [ xlo, ylo, xhi, yhi ] }
}

function inherit_metrics(source: WithMath | MathSpec, patch: Partial<MathSpec> = {}): MathSpec {
    const math = (source as WithMath).math ?? source as MathSpec
    return make_math({ ...math, ...patch })
}

function with_math<E extends Element>(element: E, patch: Partial<MathSpec> = {}, args: Attrs = {}): WithMath<E> {
    const out = element.clone(args) as WithMath<E>
    const math = (element as WithMath<E>).math ?? make_math(ensure_metrics(element))
    out.math = make_math({ ...math, ...patch })
    return out
}

function ensure_metrics(element: Element): MathMetrics {
    if (element instanceof Span) {
        return text_math_metrics(element.metrics)
    } else {
        const { advance, vrange, vanchor } = DEFAULT_MATH_METRICS
        return { advance: element.spec.aspect ?? advance, vrange, vanchor }
    }
}

function ensure_math<E extends Element>(element: E): WithMath<E> {
    if ((element as any).math != null) {
        return element as WithMath<E>
    }
    return with_math(element)
}

// scale an element's inline metrics uniformly: children in smaller styles are
// laid out at relative scale, and rendering follows the metrics
function scale_math<E extends Element>(element: WithMath<E>, scale: number): WithMath<E> {
    if (scale == 1) return element
    const { advance, vrange: [ ylo, yhi ], vanchor, italic, scale: scale0, hrange, vink } = element.math
    return with_math(element, {
        advance: scale * advance,
        vrange: [ scale * ylo, scale * yhi ],
        vanchor: scale * vanchor,
        italic: scale * italic,
        scale: scale * scale0,
        hrange: hrange != null ? [ scale * hrange[0], scale * hrange[1] ] : undefined,
        vink: vink != null ? [ scale * vink[0], scale * vink[1] ] : undefined,
    })
}

// make an element opaque to row flattening: a MathText splices the items of
// nested MathText rows, which would discard any metrics patched onto the row
// itself (scaling, zero advance, class overrides). A single-item row is just
// that item; longer rows are wrapped in a MathRow carrying their metrics
function seal_math(element: WithMath): WithMath {
    if (!(element instanceof MathText)) return element
    if (element.items.length == 1) return element.items[0]
    const { left, right } = element.math
    return with_math(new MathRow({ children: [ element ] }), { left, right })
}

//
// symbol lookup
//

function get_symbol_entry(mode: SymbolMode, text: string): SymbolEntry | null {
    if (text in symbols[mode]) return symbols[mode][text]
    return null
}

function get_font_family(mode: SymbolMode, font: SymbolFont, family: SymbolFamily): FontFamily {
    return font == 'ams' ? 'KaTeX_AMS' :
           family == 'mathord' ? SYMBOL_MODE_FONT[mode] :
           'KaTeX_Main'
}

//
// inter-atom spacing
//

function inter_item_spacing(prev: WithMath | null, next: WithMath | null, script: boolean = false): number {
    if (prev == null || next == null) return 0
    const { right: prev_right } = prev.math
    const { left: next_left } = next.math
    const measurement = SPACING_TABLE[prev_right]?.[next_left]
    if (measurement == null) return 0
    if (script && measurement != THINSPACE) return 0
    return measurement_to_em(measurement)
}

//
// binary atom cancellation
//

const BIN_LEFT_CANCELLER = new Set<MathClass>(['mbin', 'mopen', 'mrel', 'mop', 'mpunct'])
const BIN_RIGHT_CANCELLER = new Set<MathClass>(['mrel', 'mclose', 'mpunct'])

function cancel_element_left_bin(element: WithMath): WithMath {
    const { left, right } = element.math
    if (left != 'mbin') return element
    const right1 = right == 'mbin' ? 'mord' : right
    return with_math(element, { left: 'mord', right: right1 })
}

function cancel_element_right_bin(element: WithMath): WithMath {
    const { left, right } = element.math
    if (right != 'mbin') return element
    const left1 = left == 'mbin' ? 'mord' : left
    return with_math(element, { left: left1, right: 'mord' })
}

function cancel_binary_atoms(items0: WithMath[]): WithMath[] {
    const items = items0.slice()
    let prev_index: number | null = null

    for (let i = 0; i < items.length; i++) {
        let item = items[i]
        const { left, right } = item.math
        if (left == 'none' && right == 'none') continue

        if (prev_index == null) {
            item = cancel_element_left_bin(item)
            items[i] = item
        } else if (left != 'none') {
            const prev = items[prev_index]
            const { right: prev_right } = prev.math

            if (prev_right == 'mbin' && BIN_RIGHT_CANCELLER.has(left)) {
                items[prev_index] = cancel_element_right_bin(prev)
            }

            const { right: prev_class } = items[prev_index].math
            if (left == 'mbin' && (prev_class == 'none' || BIN_LEFT_CANCELLER.has(prev_class))) {
                item = cancel_element_left_bin(item)
                items[i] = item
            }
        }

        prev_index = i
    }

    if (prev_index != null) {
        items[prev_index] = cancel_element_right_bin(items[prev_index])
    }

    return items
}

//
// math group and shape bases
//

// the single child of a composite (Frac, Sqrt, ...), parsed as TeX in the
// given style when it is a string
function math_child(children: MathLeaf[] | undefined, style: MathStyle, name: string): WithMath {
    const child = check_singleton(children)
    const body = normalize_math_leaf(child, style)
    if (body == null) throw new Error(`${name} must have exactly one child`)
    return body
}

// a composite assembled from explicitly placed items (what place_items returns):
// the group draws those children in their shared frame and carries its math box
class MathGroup extends Group {
    math: MathSpec

    constructor(body: WithMath<Group>, attr: GroupArgs = {}) {
        const { coord, aspect } = body.spec
        super({ children: body.children, coord, aspect, upright: true, ...attr })
        this.math = body.math
    }
}

interface MathShapeArgs extends GroupArgs {
    fill?: string
    color?: string  // alias for fill, so a \color in force reaches drawn shapes
}

// the colour a drawn shape takes: an explicit fill, else the colour in force
// (\color flows down as `color`), else the theme's ink (white in dark mode)
function shape_ink(args: MathShapeArgs): string {
    const { fill, color } = THEME(args, 'MathShape')
    return args.fill ?? color ?? fill ?? black
}

// theme a shape's args and resolve its colour, leaving the rest for the group
function shape_args<T extends MathShapeArgs>(args: T): [ string, Omit<T, 'fill' | 'color'> ] {
    const { fill, color, ...rest } = THEME(args, 'MathShape')
    return [ args.fill ?? color ?? fill ?? black, rest ]
}

interface MathShapeSpec extends GroupArgs {
    metrics: MathMetrics
    klass?: MathClass
}

// a context whose stroke unit is this box's pixels per em, so a stroke_width
// in em (TEX.rule, say) is a TeX rule at any font size
function em_context(ctx: Context): Context {
    return ctx.clone({ unit: Math.abs(ctx.resizex(1, false)) })
}

// a drawn math shape (rule, brace, arrow, oval, strike): `metrics` is its math
// box and `coord` the em frame its pieces draw in. Strokes in here are given in
// em, so the stroke unit is rebased to this box's pixels per em and the rules
// and arrowheads scale with the math around them rather than with the image
class MathShape extends Group {
    math: MathSpec

    constructor(args: MathShapeSpec) {
        const { metrics, klass = 'mord', ...attr } = args
        super({ aspect: metrics_aspect(metrics), upright: true, ...attr })
        this.args = args  // so a clone keeps its metrics (subclasses overwrite this with their own args)
        this.math = make_math({ left: klass, right: klass, ...metrics })
    }

    inner(ctx: Context): string {
        return super.inner(em_context(ctx))
    }
}

//
// math spacer
//

interface MathSpacerArgs extends ElementArgs {
    advance?: number
    vrange?: Limit
}

class MathSpacer extends Spacer {
    math: MathSpec

    constructor(args: MathSpacerArgs = {}) {
        const { advance = 0, vrange = EMPTY_VRANGE, ...attr } = THEME(args, 'MathSpacer')

        // pass to Spacer
        super({ aspect: advance, ...attr })
        this.args = args

        // glue carries no atom class
        this.math = make_math({ left: 'none', right: 'none', advance, vrange, vanchor: 0 })
    }
}

//
// math span
//

interface MathSpanArgs extends SpanArgs {
    klass?: MathClass
    left?: MathClass
    right?: MathClass
    center?: boolean
}

// a glyph atom with TeX-style ink metrics: the math box is the ink extent at
// the glyph's natural size (undoing the 1em line-box normalization of text
// metrics), with the baseline 0.25em below the axis, or the ink centered on
// the axis for large operators and delimiters (TeX Rule 13)
class MathSpan extends Span {
    math: MathSpec

    constructor(args: MathSpanArgs = {}) {
        const { children, klass = 'mord', left = klass, right = left, center = false, ...attr } = THEME(args, 'MathSpan')
        const text = check_string(children)

        // pass to Span
        super({ children: [ text ], ...attr })
        this.args = args

        // the ink extents above/below the baseline at a 1em font (y-up); no
        // ink means a plain text box
        const raw = rawTextMetrics(this.metrics)
        if (raw == null) {
            this.math = make_math({ left, right, ...text_math_metrics(this.metrics) })
            return
        }
        const { advance, vrange: [ ymin, ymax ], italic = 0 } = raw
        const height = ymax - ymin

        // ink box in anchor coords (y-down, axis at 0)
        const baseline = center ? 0.5 * (ymax + ymin) : MATH_AXIS
        const vrange: Limit = [ baseline - ymax, baseline - ymin ]

        // Span places text in a 1em box ending at the baseline; make the ink box
        // the coordinate frame so any assigned rect scales the glyph with its box
        const aspect = advance / height
        this.metrics = { advance, vrange: [ baseline - 1, baseline ], raw_vrange: vrange, italic }
        this.spec.coord = [ 0, vrange[0], 1, vrange[1] ]
        this.spec.aspect0 = aspect
        this.spec.aspect = this.spec.rotate_invar ? aspect : rotate_aspect(aspect, this.spec.rotate)

        // set math metrics
        this.math = make_math({ left, right, advance, vrange, vanchor: 0, italic })
    }
}

//
// math symbol
//

interface MathSymbolArgs extends MathSpanArgs {
    mode?: SymbolMode
}

class MathSymbol extends MathSpan {
    constructor(args: MathSymbolArgs = {}) {
        const { children: children0, mode = 'math', ...attr } = THEME(args, 'MathSymbol')
        const text = check_string(children0)

        // try to get symbol entry; an unresolved command name (as opposed to a
        // literal character, a lone backslash included) would otherwise be
        // drawn verbatim, backslash and all
        const entry = get_symbol_entry(mode, text)
        if (entry == null && text.startsWith('\\') && text.length > 1) {
            strictError('symbol', `no ${mode}-mode symbol '${text}'`)
        }
        const { font, family, replace } = entry ??
            { font: 'main', family: 'mathord', replace: text }

        // font family and spacing class; a font command's face is used only
        // where it has the glyph, otherwise the symbol's own face (as katex)
        const children = [ replace ?? text ]
        const { font_family: override, ...attr1 } = attr
        const family0 = get_font_family(mode, font, family)
        const font_family = override != null ? resolve_font_override(override, children[0], family, family0) : family0
        const klass = SYMBOL_FAMILY_CLASS[family]

        // pass to MathSpan
        super({ children, font_family, klass, ...attr1 })
        this.args = args
    }
}

//
// math operator
//

// operators whose scripts stack as limits in display style (from katex's
// functions/op.js); other symbol operators (\int, ...) and named functions
// (\sin, ...) take side scripts
const OP_SYMBOL_LIMITS = [
    '\\coprod', '\\bigvee', '\\bigwedge', '\\biguplus', '\\bigcap', '\\bigcup', '\\intop', '\\prod', '\\sum',
    '\\bigotimes', '\\bigoplus', '\\bigodot', '\\bigsqcup', '\\smallint',
]
const OP_NAME_LIMITS = [ '\\det', '\\gcd', '\\inf', '\\lim', '\\max', '\\min', '\\Pr', '\\sup' ]

// unicode big operators map to their command names
const OP_UNICODE: Record<string, string> = {
    '\u220F': '\\prod', '\u2210': '\\coprod', '\u2211': '\\sum', '\u22c0': '\\bigwedge', '\u22c1': '\\bigvee',
    '\u22c2': '\\bigcap', '\u22c3': '\\bigcup', '\u2a00': '\\bigodot', '\u2a01': '\\bigoplus', '\u2a02': '\\bigotimes',
    '\u2a04': '\\biguplus', '\u2a06': '\\bigsqcup', '\u222b': '\\int', '\u222c': '\\iint', '\u222d': '\\iiint',
    '\u222e': '\\oint', '\u222f': '\\oiint', '\u2230': '\\oiiint',
}

interface OpEntry {
    name: string
    symbol: boolean
    limits: boolean
}

// classify an operator by command name (`\sum`), unicode glyph (`∑`), or plain
// text (`lim`, `argmax`); unknown names fall back to named (text) operators
function get_op_entry(text: string): OpEntry {
    const name0 = OP_UNICODE[text] ?? text
    if (get_symbol_entry('math', name0)?.family == 'op-token') {
        return { name: name0, symbol: true, limits: OP_SYMBOL_LIMITS.includes(name0) }
    }
    const name = name0.startsWith('\\') ? name0.slice(1) : name0
    const limits = OP_NAME_LIMITS.includes(`\\${name}`)
    return { name, symbol: false, limits }
}

interface MathOpArgs extends MathSymbolArgs {
    style?: MathStyle
    limits?: boolean
}

// large operator or named function: symbol operators (∑, ∫, ...) are glyphs
// centered on the axis (TeX Rule 13) at the size for the given style, while
// named operators (lim, sin, ...) are upright text on the baseline. `limits`
// overrides the operator's intrinsic flag; scripts stack as limits only in
// display style (TeX Rule 13a), which `SupSub` reads from `this.limits`
class MathOp extends MathSymbol {
    limits: boolean

    constructor(args: MathOpArgs = {}) {
        const { children, style = 'display', limits: limits0, klass = 'mop', ...attr } = THEME(args, 'MathOp')
        const text = check_string(children)

        // look up operator entry
        const { name, symbol, limits: limits1 } = get_op_entry(text)
        const display = style_size(style) == 'display'
        const props = symbol ?
            { mode: 'math' as SymbolMode, center: true, font_family: display ? OP_DISPLAY_FONT : OP_TEXT_FONT } :
            { mode: 'text' as SymbolMode, center: false }

        // pass to MathSymbol
        super({ children: [ name ], klass, ...props, ...attr })
        this.args = args

        // set limits flag
        const limits = limits0 ?? limits1
        this.limits = limits && display
    }
}

//
// math row
//

type MathLayout = {
    children: Element[]
    metrics: MathMetrics
    coord?: Rect
    aspect?: number
}

function layout_math_row(items: WithMath[]): MathLayout {
    // empty case
    if (items.length == 0) return { children: [], aspect: 0, metrics: EMPTY_MATH_METRICS }

    // find outer vertical range
    const advance = sum(items.map(item => item.math.advance))
    const vrange = merge_limits(items.map(item => metrics_bounds(item.math)))

    // compute placements
    let xmax = 0
    const rects = items.map(item => {
        const { advance: x } = item.math
        xmax += x
        return metrics_rect(item.math, xmax - x, 0)
    })
    const children = items.map((item, i) => with_math(item, {}, { rect: rects[i] }))

    // the ink hull covers the layout box plus any overhang from the items
    const { hrange, vink, coord } = hull_overhang(rects, advance, vrange)

    // compute layout metrics
    const metrics: MathMetrics = { advance, vrange, vanchor: 0, hrange, vink }
    const aspect = metrics_aspect(metrics)

    // return layout
    return { children, coord, aspect, metrics }
}

interface MathRowArgs extends Omit<GroupArgs, 'children'> {
    children?: MathLeaf[]
    style?: MathStyle
}

class MathRow extends Group {
    math: MathSpec

    constructor(args: MathRowArgs = {}) {
        const { children: children0, style = 'text', ...attr } = THEME(args, 'MathRow')
        const math_items = normalize_math_items(children0, style)

        // compute layout
        const { metrics, ...layout } = layout_math_row(math_items)

        // pass to Group
        super({ ...layout, upright: true, ...attr })
        this.args = args

        // set math metrics
        this.math = make_math({ left: 'mord', right: 'mord', ...metrics })
    }
}

//
// math col
//

type MathColOptions = {
    justify?: Align
    spacing?: number
}

function layout_math_col(items: WithMath[], { justify = 'center', spacing = 0 }: MathColOptions): MathLayout {
    // empty case
    if (items.length == 0) return { children: [], aspect: 0, metrics: EMPTY_MATH_METRICS }

    // find outer advance
    const advance = max(items.map(item => item.math.advance)) ?? 0

    // stack top-down while preserving each child's anchor line
    let ybottom = 0
    const children = items.map((item, i) => {
        const [ ylo, yhi ] = metrics_bounds(item.math)
        const yanchor = ybottom + (i > 0 ? spacing : 0) - ylo
        ybottom = yanchor + yhi
        const [ , y0, , y1 ] = metrics_rect(item.math, 0, yanchor)
        const rect: Rect = [ 0, y0, advance, y1 ]
        return with_math(item, {}, { rect, align: justify })
    })

    // compute layout metrics
    const vrange: Limit = [ 0, ybottom ]
    const metrics: MathMetrics = { advance, vrange, vanchor: 0.5 * ybottom }
    const coord = join_limits({ h: [ 0, advance ], v: vrange })
    const aspect = metrics_aspect(metrics)

    // return layout
    return { children, coord, aspect, metrics }
}

interface MathColArgs extends Omit<GroupArgs, 'children'> {
    children?: MathLeaf[]
    style?: MathStyle
    spacing?: number
    justify?: Align
}

class MathCol extends Group {
    math: MathSpec

    constructor(args: MathColArgs = {}) {
        const { children: children0, justify, spacing = 0, style = 'text', ...attr } = THEME(args, 'MathCol')
        const math_items = normalize_math_items(children0, style)

        // compute layout
        const { metrics, ...layout } = layout_math_col(math_items, { justify, spacing })

        // pass to Group
        super({ ...layout, upright: true, ...attr })
        this.args = args

        // set math metrics
        this.math = make_math({ left: 'mord', right: 'mord', ...metrics })
    }
}

//
// math box/rule
//

interface MathBoxArgs extends Omit<GroupArgs, 'children'> {
    children?: MathLeaf[]
    style?: MathStyle
    advance?: number
    padding?: Padding
    top?: number
    bottom?: number
    justify?: Align
    vanchor?: number
    klass?: MathClass
}

class MathBox extends Group {
    math: MathSpec

    constructor(args: MathBoxArgs = {}) {
        const { children: children0, advance: advance0, padding: padding0, justify = 'center', vanchor: vanchor0, style = 'text', klass, ...attr } = THEME(args, 'MathBox')
        const child = math_child(children0, style, 'MathBox')

        // get metrics info
        const [ ylo, yhi ] = metrics_bounds(child.math)
        const [ pl, pt, pr, pb ] = pad_rect(padding0)

        // compute layout metrics
        const inner_advance = advance0 ?? child.math.advance
        const outer_advance = inner_advance + pl + pr
        const outer_height = pt + (yhi - ylo) + pb
        const vrange: Limit = [ 0, outer_height ]
        const vanchor = vanchor0 ?? (pt - ylo)
        const metrics: MathMetrics = { advance: outer_advance, vrange, vanchor }

        // make child item (its ink may overhang its layout box)
        const [ , iy0, , iy1 ] = metrics_rect(child.math, 0, pt - ylo)
        const rect: Rect = [ pl, iy0, pl + inner_advance, iy1 ]
        const item = with_math(child, {}, { rect, align: justify })
        const coord: Rect = [ 0, 0, outer_advance, outer_height ]
        const aspect = metrics_aspect(metrics)

        super({ children: [ item ], coord, aspect, upright: true, ...attr })
        this.args = args

        // the box keeps the child's spacing classes unless klass overrides
        // them, which is how a custom element becomes a relation (say) in a row
        const kpatch = klass != null ? { left: klass, right: klass } : {}
        this.math = inherit_metrics(child, { ...metrics, ...kpatch })
    }
}

interface MathRuleArgs extends MathShapeArgs {
    advance?: number
    thickness?: number
}

class MathRule extends MathShape {
    constructor(args: MathRuleArgs = {}) {
        const [ fill, { advance = 1, thickness = TEX.rule, ...attr } ] = shape_args(args)

        // a filled shape, not an outlined one: the inherited SVG stroke would
        // add a second, slightly larger bar around the fill
        const bar = thickness > 0 ? new Rectangle({ rect: [ 0, 0, advance, thickness ], fill, stroke: none }) : null

        // a rule is glue for spacing
        const metrics: MathMetrics = { advance, vrange: [ 0, thickness ], vanchor: 0.5 * thickness }
        super({ children: [ bar ], coord: [ 0, 0, advance, thickness ], metrics, klass: 'none', ...attr })
        this.args = args
    }
}

//
// math array
//

// LaTeX array metrics (article.cls / lttab.dtx / ltmath.dtx), in em at
// ptPerEm = 10, matching katex's fontMetrics
const ARRAY_PT = 0.1
const ARRAY_BASELINE_SKIP = 12 * ARRAY_PT  // \baselineskip from size10.clo
const ARRAY_JOT = 3 * ARRAY_PT             // \jot, extra leading in aligned/gathered
const ARRAY_COL_SEP = 5 * ARRAY_PT         // \arraycolsep
const ARRAY_RULE = TEX.rule                // \arrayrulewidth, 0.4 pt like the default rule
const ARRAY_DOUBLE_RULE_SEP = 0.2          // \doublerulesep
const ARRAY_SMALL_SEP = 0.2778             // \thickspace, used by {smallmatrix}
const ARRAY_HLINE_GAP = 0.25               // gap between stacked \hline rules
const ARRAY_DASH = 0.08                    // dash length for \hdashline and ':'

// a column descriptor: either an alignment (with optional explicit gaps) or a
// vertical separator drawn between columns
type ArrayAlign = 'l' | 'c' | 'r'
type ArrayCol =
    | { type: 'align', align: ArrayAlign, pregap?: number, postgap?: number }
    | { type: 'separator', separator: string }

const ARRAY_ALIGN: Record<ArrayAlign, Align> = { l: 'left', c: 'center', r: 'right' }

interface MathArrayArgs extends Omit<GroupArgs, 'children'> {
    children?: MathLeaf[][] | MathLeaf[]  // rows of cells, or a flat list chunked by ncol
    style?: MathStyle              // style string cells are parsed in
    cols?: ArrayCol[]              // column alignments and separators
    ncol?: number                  // columns to chunk a flat child list into
    stretch?: number               // \arraystretch
    jot?: boolean                  // add \jot of leading between rows
    colsep?: number                // column separation (default \arraycolsep)
    outer?: boolean                // pad the outer edges by colsep too
    hlines?: boolean[][]           // rules before each row; true means dashed
    rowgaps?: (number | null)[]    // extra gap after each row, in em
    thickness?: number             // rule thickness
    fill?: string                  // rule color
}

// a horizontal or vertical rule inside an array, as a line stroked in em (the
// array rebases its stroke unit, see em_context) between the given endpoints,
// which sit on the rule's centerline. A dashed rule picks its dash length so
// that the pattern ends on a dash at both ends
function array_rule(p1: Point, p2: Point, thickness: number, dashed: boolean, stroke: string, coord: Rect): Line {
    const attr: Attrs = { stroke, stroke_width: thickness, stroke_linecap: 'butt' }
    if (dashed) {
        const span = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        const count = Math.max(1, Math.round(span / (2 * ARRAY_DASH)))
        attr.stroke_dasharray = span / (2 * count - 1)
    }
    return new Line({ points: [ p1, p2 ], coord, ...attr })
}

// cells either come as rows (how convert_tree builds them) or, since JSX
// flattens nested children, as one flat list chunked by the column count --
// the same bargain Grid strikes
function normalize_rows(children: MathLeaf[][] | MathLeaf[] | undefined, ncol0: number | undefined, cols: ArrayCol[]): MathLeaf[][] {
    if (children == null) return []
    const items: any[] = is_array(children as any) ? children as any[] : [ children ]
    if (items.length == 0) return []
    if (items.every(is_array)) return items.map(row => ensure_children(row))

    const flat = ensure_children(items)
    const ncol = Math.max(1, ncol0 ?? cols.filter(col => col.type == 'align').length)
    return range(Math.ceil(flat.length / ncol)).map(r => flat.slice(r * ncol, (r + 1) * ncol))
}

class MathArray extends Group {
    math: MathSpec

    constructor(args: MathArrayArgs = {}) {
        const {
            children: children0, cols = [], ncol: ncol0, stretch = 1, jot = false, colsep = ARRAY_COL_SEP,
            outer = false, hlines = [], rowgaps = [], thickness = ARRAY_RULE, fill: fill0, style = 'text', ...attr
        } = THEME(args, 'MathArray')
        const rows0 = normalize_rows(children0, ncol0, cols).map(row =>
            row.map(cell => normalize_math_leaf(cell, style) ?? EMPTY_MATH)
        )
        const fill = shape_ink({ fill: fill0, color: attr.color as string | undefined })

        // LaTeX gives every row a strut so short rows still occupy a full line
        const arrayskip = stretch * ARRAY_BASELINE_SKIP
        const strut_height = 0.7 * arrayskip
        const strut_depth = 0.3 * arrayskip

        // pass 1: walk down the rows accumulating height and depth about each
        // row's own baseline, recording where the \hline rules fall
        const rules: { pos: number, dashed: boolean }[] = []
        let total = 0
        const add_rules = (flags: boolean[] = []) => flags.forEach((dashed, i) => {
            if (i > 0) total += ARRAY_HLINE_GAP
            rules.push({ pos: total, dashed })
        })

        add_rules(hlines[0])
        const rows = rows0.map((cells, r) => {
            const extents = cells.map(cell => baseline_extents(cell))
            const height = max([ strut_height, ...extents.map(([ h ]) => h) ]) ?? strut_height
            let depth = max([ strut_depth, ...extents.map(([ , d ]) => d) ]) ?? strut_depth

            // \\[len] deepens the row rather than opening a gap, unless negative
            let gap = rowgaps[r] ?? 0
            if (gap > 0) {
                gap += strut_depth
                depth = Math.max(depth, gap)
                gap = 0
            }

            // \openup in the AMS multiline environments. \jot is leading
            // *between* lines, so the last row does not get it -- katex 0.16
            // adds it to every row, which pads the box; katex 0.18 fixed this
            if (jot && r < rows0.length - 1) depth += ARRAY_JOT

            total += height
            const pos = total
            total += depth + gap
            add_rules(hlines[r + 1])
            return { cells, pos }
        })

        // the array centers on the math axis, which is where gum's anchor line
        // already sits, so a row's baseline lands at pos - total / 2
        const offset = 0.5 * total
        const baseline = (pos: number) => pos - offset

        // column widths, over however many columns the widest row has
        const ncol = max(rows.map(({ cells }) => cells.length)) ?? 0
        const widths = range(ncol).map(c =>
            max(rows.map(({ cells }) => cells[c]?.math.advance ?? 0)) ?? 0
        )

        // pass 2: walk the columns and the column descriptors together, so a
        // trailing separator with no column after it still gets drawn
        const children: Element[] = []
        const seps: { x: number, dashed: boolean }[] = []
        let x = 0
        for (let c = 0, d = 0; c < ncol || d < cols.length; c++, d++) {
            let col = cols[d]

            // separators sit between columns and take no width of their own
            for (let first = true; col?.type == 'separator'; first = false) {
                if (!first) x += ARRAY_DOUBLE_RULE_SEP
                seps.push({ x, dashed: col.separator == ':' })
                col = cols[++d]
            }
            if (c >= ncol) continue

            // \arraycolsep before and after each column, except at the outer
            // edges unless the environment asks for it
            const align = col?.type == 'align' ? col.align : 'c'
            if (c > 0 || outer) x += col?.type == 'align' ? col.pregap ?? colsep : colsep

            for (const { cells, pos } of rows) {
                const cell = cells[c]
                if (cell == null) continue
                // the cell's anchor sits MATH_AXIS * scale above its baseline
                // (script-style cells, as {smallmatrix} hands them over)
                const y = baseline(pos) - MATH_AXIS * cell.math.scale
                const [ , y0, , y1 ] = metrics_rect(cell.math, 0, y)
                const rect: Rect = [ x, y0, x + widths[c], y1 ]
                children.push(with_math(cell, {}, { rect, align: ARRAY_ALIGN[align] }))
            }
            x += widths[c]

            if (c < ncol - 1 || outer) x += col?.type == 'align' ? col.postgap ?? colsep : colsep
        }
        const advance = x

        // rules span the full array: \hline across it, separators down it. A
        // \hline hangs above its row boundary (so the top rule adds its whole
        // thickness to the array) while a separator straddles its column
        // boundary, matching how LaTeX and katex place them. Each runs the full
        // extent of the ink, including the other kind's overhang, so the
        // corners meet squarely (an \hline above the first row lifts the top
        // of the box, an outer separator widens it by half a rule)
        const [ ytop, ybot ] = [ baseline(0), baseline(total) ]
        const coord: Rect = [ 0, ytop, advance, ybot ]
        const vrange: Limit = [ Math.min(ytop, ...rules.map(({ pos }) => baseline(pos) - thickness)), ybot ]
        const hink: Limit = [ Math.min(0, ...seps.map(({ x }) => x - 0.5 * thickness)), Math.max(advance, ...seps.map(({ x }) => x + 0.5 * thickness)) ]
        for (const { pos, dashed } of rules) {
            const y = baseline(pos) - 0.5 * thickness
            children.push(array_rule([ hink[0], y ], [ hink[1], y ], thickness, dashed, fill, coord))
        }
        for (const { x: xs, dashed } of seps) {
            children.push(array_rule([ xs, vrange[0] ], [ xs, vrange[1] ], thickness, dashed, fill, coord))
        }
        const hrange = hink[0] < 0 || hink[1] > advance ? hink : undefined
        const metrics: MathMetrics = { advance, vrange, vanchor: 0, hrange }

        // pass to Group
        super({ children, coord, aspect: metrics_aspect(metrics), upright: true, ...attr })
        this.args = args

        // a tabular body is a single Ord atom
        this.math = make_math({ left: 'mord', right: 'mord', ...metrics })
    }

    // the rules are stroked in em
    inner(ctx: Context): string {
        return super.inner(em_context(ctx))
    }
}

//
// horizontal brace
//

// katex draws its stretchy braces as SVG paths (no font has a stretchy brace
// glyph) sized 548/1000 em tall; the kerns come from its horizBrace builder
const BRACE_HEIGHT = 0.548
const BRACE_MIN_WIDTH = 1.6   // katex sets this as a css min-width on the brace
const BRACE_THICKNESS = 0.1   // along the runs; katex's brace path has a 0.12 em band there
const BRACE_THIN = 0.03       // at the free ends of the hooks and the peak
const BRACE_KERN = 0.1        // between the body and the brace
const BRACE_LABEL_KERN = 0.2  // between the brace and its label
const BRACE_SAMPLES = 12      // points per quarter turn

// shift a polyline sideways along its normals (by a constant distance or one
// per point); tracing one way and back gives the filled outline of a stroke,
// which is what math rules need -- an actual SVG stroke is specified in pixels
// and would not scale with the font
function offset_polyline(points: Point[], dist: number | number[]): Point[] {
    return points.map(([ x, y ], i) => {
        const d = is_array(dist) ? dist[i] : dist
        const [ ax, ay ] = points[Math.max(0, i - 1)]
        const [ bx, by ] = points[Math.min(points.length - 1, i + 1)]
        const [ dx, dy ] = [ bx - ax, by - ay ]
        const norm = Math.hypot(dx, dy) || 1
        return [ x - d * dy / norm, y + d * dx / norm ] as Point
    })
}

// filled outline of a horizontal brace pointing up: a hook curling down at each
// end and a peak in the middle, joined by straight runs. The centerline is four
// quarter circles of radius r, so the brace stands 2r tall and wants 4r of
// width (below that the runs vanish and r shrinks to fit). Like Computer
// Modern's, it is thick along the runs and thins into the free ends of the
// hooks and the tip of the peak; the ink is inset so it stays inside the box
function brace_outline(width: number, height: number, thick: number, thin: number): Point[] {
    const [ w, h, x0, y0 ] = [ width - thick, height - thick, 0.5 * thick, 0.5 * thick ]
    const r = Math.min(0.5 * h, 0.25 * w)
    const peak = h - 2 * r
    const n = BRACE_SAMPLES
    const ease = (f: number) => 0.5 - 0.5 * Math.cos(Math.PI * f)
    const arc = (cx: number, cy: number, a0: number, a1: number, t0: number, t1: number) =>
        range(n + 1).map(i => {
            const f = i / n
            const a = d2r * (a0 + (a1 - a0) * f)
            return { p: [ x0 + cx + r * Math.cos(a), y0 + cy + r * Math.sin(a) ] as Point, t: t0 + (t1 - t0) * ease(f) }
        })
    const segs = [
        ...arc(r, h, 180, 270, thin, thick),                   // left hook: thin free end up to the run
        ...arc(0.5 * w - r, peak, 90, 0, thick, thin),         // rise from the run to the peak
        ...arc(0.5 * w + r, peak, 180, 90, thin, thick).slice(1),  // fall from the peak
        ...arc(w - r, h, 270, 360, thick, thin),               // right hook down to its free end
    ]
    const line = segs.map(s => s.p)
    const half = segs.map(s => 0.5 * s.t)
    return [ ...offset_polyline(line, half), ...offset_polyline(line, half.map(d => -d)).reverse() ]
}

//
// stretchy decorations
//

// katex draws all of these as SVG paths that stretch to the body, since no font
// carries stretchable versions. The box heights and minimum widths below are its
// katexImagesData, in em. The arrows are gum's own Arrow/ArrowHead/Line/Arc,
// stroked in em -- MathStretch is a MathShape, so its stroke unit is pixels per
// em and a stroke_width of TEX.rule is a TeX rule at any size. Braces, groups
// and the \utilde tilde are filled outlines (a centerline offset along its
// normals both ways, see offset_polyline)
const STRETCH_THICKNESS = TEX.rule
const STRETCH_SAMPLES = 12
const STRETCH_LINE_GAP = 0.194  // between the centres of the rules of a double arrow, as in Computer Modern's ⇒ and = (rules at 0.133-0.173 and 0.327-0.367 em)
const STRETCH_ARC = 92          // ArrowHead's barb spread: cot(arc/2) is the head's depth per half-height, 0.97 in Computer Modern
const STRETCH_CURVE = 0.7       // ArrowHead's barb bow, matching Computer Modern's heads
const STRETCH_UNDER_KERN = 0.1  // clearance between a body and a decoration hung beneath it

// head size for a box: the barb ends reach the box edges less half a stroke, so
// the round caps stay inside the box (the box is the decoration's metrics)
function stretch_head_size(height: number, t: number): number {
    return 2 * Math.max(0.5 * height - 0.5 * t, 0) / Math.sin(0.5 * d2r * STRETCH_ARC)
}

// how far back from the tip a head's barb has opened `dy` from the shaft. The
// barb is a circular arc that leaves the tip turned toward the shaft by
// curve * arc/2 (see ArrowHead), so it opens much more slowly than a straight
// barb at arc/2 would. Beyond the barb's end it is the barb's full reach
function stretch_barb_reach(size: number, dy: number): number {
    const half = 0.5 * d2r * STRETCH_ARC
    const chord = 0.5 * size
    const theta0 = (1 - STRETCH_CURVE) * half
    const radius = chord / (2 * Math.sin(STRETCH_CURVE * half))
    const cos1 = Math.cos(theta0) - dy / radius
    if (cos1 < Math.cos(theta0 + 2 * STRETCH_CURVE * half)) return chord * Math.cos(half)
    return radius * (Math.sin(Math.acos(cos1)) - Math.sin(theta0))
}

// the box a shape draws into; `y` is the top of its band, so two arrows can
// stack in one box for \rightleftharpoons
type StretchBox = { width: number, height: number, thickness: number, y: number, coord: Rect, color: string, x?: number }
type StretchShape = (box: StretchBox) => Element[]

// stroke attrs for the pieces; `coord` goes only on the point-based elements
// (Line, Arrow), since ArrowHead and Arc draw in their own unit box and are
// positioned by pos/size within the parent's coord
function stretch_stroke_attr({ thickness, color }: StretchBox): Attrs {
    return { stroke: color, stroke_width: thickness, stroke_linecap: 'round', stroke_linejoin: 'round' }
}

// arrows: a stem (one rule, or two for the double forms) with open barbed heads
// at either end. `heads` draws a second chevron behind the first for
// \twoheadrightarrow; `barb` keeps one barb for the harpoons
type ArrowSpec = { left?: boolean, right?: boolean, lines?: number, heads?: number, barb?: 'both' | 'up' | 'down' }

function stretch_arrow({ left = false, right = false, lines = 1, heads = 1, barb = 'both' }: ArrowSpec): StretchShape {
    return box => {
        const { width, height, thickness: t, y, coord, x: xs = 0 } = box
        const xe = xs + width
        const mid = y + 0.5 * height
        const size = stretch_head_size(height, t)
        const depth = 0.5 * size * Math.cos(0.5 * d2r * STRETCH_ARC)  // barb reach back from the tip
        const attr = stretch_stroke_attr(box)

        // a harpoon keeps the upper or lower barb, which is the head's left or
        // right barb depending on which way it points
        const end_barb = barb == 'both' ? 'both' : barb == 'up' ? 'left' : 'right'
        const start_barb = barb == 'both' ? 'both' : barb == 'up' ? 'right' : 'left'
        const head_attr = { arrow_size: size, arrow_arc: STRETCH_ARC, arrow_curve: STRETCH_CURVE, arrow_exact: true, start_barb, end_barb }

        const out: Element[] = []
        if (lines == 1) {
            // a single stem runs to the tip and the barbs open from it
            out.push(new Arrow({ points: [ [ xs, mid ], [ xe, mid ] ], arrow_start: left, arrow_end: right, coord, ...head_attr, ...attr }))
        } else {
            // two stems straddle the centerline and stop where they meet the
            // barbs, as in \Rightarrow; the head is placed on its own. The tip
            // sits half a stroke in from the end (arrow_exact), and a stem ends
            // where its centerline crosses the barb's, so its round cap lies
            // inside the barb's stroke and the join seals without a notch
            const gap = 0.5 * STRETCH_LINE_GAP
            const inset = 0.5 * t + stretch_barb_reach(size, gap)
            const [ x0, x1 ] = [ left ? xs + inset : xs + 0.5 * t, right ? xe - inset : xe - 0.5 * t ]
            for (const dy of [ -gap, gap ]) out.push(new Line({ points: [ [ x0, mid + dy ], [ x1, mid + dy ] ], coord, ...attr }))
            if (right) out.push(new ArrowHead({ angle: 0, pos: [ xe, mid ], size, arc: STRETCH_ARC, curve: STRETCH_CURVE, barb: end_barb, ...attr }))
            if (left) out.push(new ArrowHead({ angle: 180, pos: [ xs, mid ], size, arc: STRETCH_ARC, curve: STRETCH_CURVE, barb: start_barb, ...attr }))
        }

        // extra chevrons sit a bit behind the first
        for (const i of range(1, heads)) {
            const back = 0.6 * depth * i
            if (right) out.push(new ArrowHead({ angle: 0, pos: [ xe - back, mid ], size, arc: STRETCH_ARC, curve: STRETCH_CURVE, barb: end_barb, ...attr }))
            if (left) out.push(new ArrowHead({ angle: 180, pos: [ xs + back, mid ], size, arc: STRETCH_ARC, curve: STRETCH_CURVE, barb: start_barb, ...attr }))
        }
        return out
    }
}

// \hookrightarrow: the tail is a half circle sitting above the stem and opening
// toward the head -- like a ⊂ whose lower arm runs on as the stem and whose
// upper arm is the free end. Its bottom sits on the stem's centerline and its
// top and outer side stay half a stroke inside the box, so the stroke's caps
// and outer edge do not spill out
function stretch_hook_arrow(side: 'left' | 'right'): StretchShape {
    return box => {
        const { width, height, thickness: t, y, coord } = box
        const mid = y + 0.5 * height
        const r = 0.25 * (height - t)
        const attr = stretch_stroke_attr(box)
        const [ cx, start, end ] = side == 'left' ? [ r + 0.5 * t, 90, 270 ] : [ width - r - 0.5 * t, -90, 90 ]
        const hook = new Arc({ pos: [ cx, mid - r ], rad: r, start, end, ...attr })
        // Arrow pulls its tail in by half a stroke to keep the cap inside, so
        // the stem is given a tail that far behind the arc's end: its cap then
        // lands exactly on the arc's, and the two join without a seam
        const tail = side == 'left' ? cx - 0.5 * t : cx + 0.5 * t
        const arrow = new Arrow({
            points: side == 'left' ? [ [ tail, mid ], [ width, mid ] ] : [ [ tail, mid ], [ 0, mid ] ],
            arrow_size: stretch_head_size(height, t), arrow_arc: STRETCH_ARC, arrow_curve: STRETCH_CURVE, arrow_exact: true, coord, ...attr,
        })
        return [ hook, arrow ]
    }
}

// \mapsto's stem is stopped by a full-height bar at its tail
function stretch_mapsto(side: 'left' | 'right'): StretchShape {
    const arrow = stretch_arrow({ right: side == 'left', left: side == 'right' })
    return box => {
        const { width, height, thickness: t, y } = box
        const x = side == 'left' ? 0.5 * t : width - 0.5 * t
        return [ ...arrow(box), new Line({ points: [ [ x, y + 0.5 * t ], [ x, y + height - 0.5 * t ] ], coord: box.coord, ...stretch_stroke_attr(box) }) ]
    }
}

// \overlinesegment and \underlinesegment are the same shape: a rule through
// the middle of the box with a tick at each end reaching 0.167 em above and
// below it (katex's path is a 0.04 em bar at y = 241..281 of 522 with ticks
// spanning 94..428), so the ticks are centred on the bar, not hanging from it
const SEGMENT_TICK = 0.167

function stretch_segment(): StretchShape {
    return box => {
        const { width, height, thickness: t, y, coord } = box
        const attr = { coord, ...stretch_stroke_attr(box) }
        const mid = y + 0.5 * height
        const [ yt, yb ] = [ mid - SEGMENT_TICK, mid + SEGMENT_TICK ]
        return [
            new Line({ points: [ [ 0.5 * t, mid ], [ width - 0.5 * t, mid ] ], ...attr }),
            new Line({ points: [ [ 0.5 * t, yt ], [ 0.5 * t, yb ] ], ...attr }),
            new Line({ points: [ [ width - 0.5 * t, yt ], [ width - 0.5 * t, yb ] ], ...attr }),
        ]
    }
}

// two arrows stacked in one box, as in \rightleftharpoons
function stretch_pair(top: ArrowSpec, bottom: ArrowSpec): StretchShape {
    return box => {
        const half = 0.5 * box.height
        return [
            ...stretch_arrow(top)({ ...box, height: half }),
            ...stretch_arrow(bottom)({ ...box, height: half, y: box.y + half }),
        ]
    }
}

// mhchem's equilibrium arrows: \rightleftharpoons with the harpoon pointing
// away from the equilibrium side cut short at that end (katex's
// baraboveshortleftharpoon / shortrightharpoonabovebar pairs)
const EQUILIBRIUM_SHORT = 0.5

function stretch_equilibrium(side: 'left' | 'right'): StretchShape {
    return box => {
        const half = 0.5 * box.height
        const short = Math.max(box.width - EQUILIBRIUM_SHORT, 0.5 * box.width)
        const top: StretchBox = side == 'right'
            ? { ...box, height: half }
            : { ...box, height: half, x: box.width - short, width: short }
        const bottom: StretchBox = side == 'right'
            ? { ...box, height: half, y: box.y + half, width: short }
            : { ...box, height: half, y: box.y + half }
        return [
            ...stretch_arrow({ right: true, barb: 'up' })(top),
            ...stretch_arrow({ left: true, barb: 'down' })(bottom),
        ]
    }
}

// the filled outlines: a centerline traced both ways along its normals
function stretch_arc(cx: number, cy: number, r: number, a0: number, a1: number): Point[] {
    return range(STRETCH_SAMPLES + 1).map(i => {
        const a = d2r * (a0 + (a1 - a0) * (i / STRETCH_SAMPLES))
        return [ cx + r * Math.cos(a), cy + r * Math.sin(a) ] as Point
    })
}

function stretch_stroke(points: Point[], thickness: number): Point[] {
    return [ ...offset_polyline(points, 0.5 * thickness), ...offset_polyline(points, -0.5 * thickness).reverse() ]
}

function stretch_filled(outline: (width: number, height: number, t: number) => Point[][]): StretchShape {
    return ({ width, height, thickness, coord, color }) =>
        outline(width, height, thickness).map(points => new Polygon({ points, coord, fill: color, stroke: none }))
}

// \overgroup: a run with a hook sweeping down at each end, like a brace with
// no peak. The hooks are quarter ellipses, wider than they are deep, so the
// shape reads as a shallow sweep rather than a narrow U (neither katex's nor
// LaTeX's exact form, which differ from each other)
const GROUP_SWEEP = 1.8  // hook width per depth

function stretch_group(width: number, height: number, t: number): Point[][] {
    const ry = Math.max(height - t, 0)
    const rx = Math.max(Math.min(GROUP_SWEEP * ry, 0.5 * (width - t)), 0)
    const [ x0, y0 ] = [ 0.5 * t, 0.5 * t ]
    const arc = (cx: number, a0: number, a1: number) => range(STRETCH_SAMPLES + 1).map(i => {
        const a = d2r * (a0 + (a1 - a0) * (i / STRETCH_SAMPLES))
        return [ x0 + cx + rx * Math.cos(a), y0 + ry + ry * Math.sin(a) ] as Point
    })
    const line = [ ...arc(rx, 180, 270), ...arc(width - t - rx, 270, 360) ]
    return [ stretch_stroke(line, t) ]
}

// \utilde's stretchy tilde: one period of a sine, flattened to the box
function stretch_tilde(width: number, height: number, t: number): Point[][] {
    const amp = 0.5 * (height - t)
    const line = range(4 * STRETCH_SAMPLES + 1).map(i => {
        const f = i / (4 * STRETCH_SAMPLES)
        return [ f * width, 0.5 * height - amp * Math.sin(2 * Math.PI * f) ] as Point
    })
    return [ stretch_stroke(line, t) ]
}

// the brace outline is inset so the ink lands inside the box; it is thick
// along the runs (its own thickness, not the rule weight of the arrows)
function stretch_brace(width: number, height: number, t: number): Point[][] {
    return [ brace_outline(width, height, t, BRACE_THIN) ]
}

const stretch_flip = (fn: (w: number, h: number, t: number) => Point[][]) =>
    (w: number, h: number, t: number) => fn(w, h, t).map(p => p.map(([ x, y ]) => [ x, h - y ] as Point))

// keyed by katex's stretchy label; height and min_width are its katexImagesData,
// thickness the stroke (or band) weight when it is not a TeX rule
type StretchEntry = { shape: StretchShape, height: number, min_width: number, thickness?: number }

const ARROW_H = 0.522, DOUBLE_H = 0.56, FLAT_H = 0.334, GROUP_H = 0.26, PAIR_H = 0.716  // GROUP_H is shallower than katex's 0.342 by choice
const STRETCH: Record<string, StretchEntry> = {
    overrightarrow:      { shape: stretch_arrow({ right: true }), height: ARROW_H, min_width: 0.888 },
    overleftarrow:       { shape: stretch_arrow({ left: true }), height: ARROW_H, min_width: 0.888 },
    underrightarrow:     { shape: stretch_arrow({ right: true }), height: ARROW_H, min_width: 0.888 },
    underleftarrow:      { shape: stretch_arrow({ left: true }), height: ARROW_H, min_width: 0.888 },
    overleftrightarrow:  { shape: stretch_arrow({ left: true, right: true }), height: ARROW_H, min_width: 0.888 },
    underleftrightarrow: { shape: stretch_arrow({ left: true, right: true }), height: ARROW_H, min_width: 0.888 },
    Overrightarrow:      { shape: stretch_arrow({ right: true, lines: 2 }), height: DOUBLE_H, min_width: 0.888 },
    overleftharpoon:     { shape: stretch_arrow({ left: true, barb: 'up' }), height: ARROW_H, min_width: 0.888 },
    overrightharpoon:    { shape: stretch_arrow({ right: true, barb: 'up' }), height: ARROW_H, min_width: 0.888 },
    overlinesegment:     { shape: stretch_segment(), height: ARROW_H, min_width: 0.888 },
    underlinesegment:    { shape: stretch_segment(), height: ARROW_H, min_width: 0.888 },
    overgroup:           { shape: stretch_filled(stretch_group), height: GROUP_H, min_width: 0.888 },
    undergroup:          { shape: stretch_filled(stretch_flip(stretch_group)), height: GROUP_H, min_width: 0.888 },
    utilde:              { shape: stretch_filled(stretch_tilde), height: 0.26, min_width: 0 },
    overbrace:           { shape: stretch_filled(stretch_brace), height: BRACE_HEIGHT, min_width: BRACE_MIN_WIDTH, thickness: BRACE_THICKNESS },
    underbrace:          { shape: stretch_filled(stretch_flip(stretch_brace)), height: BRACE_HEIGHT, min_width: BRACE_MIN_WIDTH, thickness: BRACE_THICKNESS },

    xrightarrow:         { shape: stretch_arrow({ right: true }), height: ARROW_H, min_width: 1.469 },
    xleftarrow:          { shape: stretch_arrow({ left: true }), height: ARROW_H, min_width: 1.469 },
    xleftrightarrow:     { shape: stretch_arrow({ left: true, right: true }), height: ARROW_H, min_width: 1.75 },
    xRightarrow:         { shape: stretch_arrow({ right: true, lines: 2 }), height: DOUBLE_H, min_width: 1.526 },
    xLeftarrow:          { shape: stretch_arrow({ left: true, lines: 2 }), height: DOUBLE_H, min_width: 1.526 },
    xLeftrightarrow:     { shape: stretch_arrow({ left: true, right: true, lines: 2 }), height: DOUBLE_H, min_width: 1.75 },
    xlongequal:          { shape: stretch_arrow({ lines: 2 }), height: FLAT_H, min_width: 0.888 },
    xtwoheadrightarrow:  { shape: stretch_arrow({ right: true, heads: 2 }), height: FLAT_H, min_width: 0.888 },
    xtwoheadleftarrow:   { shape: stretch_arrow({ left: true, heads: 2 }), height: FLAT_H, min_width: 0.888 },
    xrightharpoonup:     { shape: stretch_arrow({ right: true, barb: 'up' }), height: ARROW_H, min_width: 0.888 },
    xrightharpoondown:   { shape: stretch_arrow({ right: true, barb: 'down' }), height: ARROW_H, min_width: 0.888 },
    xleftharpoonup:      { shape: stretch_arrow({ left: true, barb: 'up' }), height: ARROW_H, min_width: 0.888 },
    xleftharpoondown:    { shape: stretch_arrow({ left: true, barb: 'down' }), height: ARROW_H, min_width: 0.888 },
    xhookrightarrow:     { shape: stretch_hook_arrow('left'), height: ARROW_H, min_width: 1.08 },
    xhookleftarrow:      { shape: stretch_hook_arrow('right'), height: ARROW_H, min_width: 1.08 },
    xmapsto:             { shape: stretch_mapsto('left'), height: ARROW_H, min_width: 1.5 },
    xrightleftharpoons:  { shape: stretch_pair({ right: true, barb: 'up' }, { left: true, barb: 'down' }), height: PAIR_H, min_width: 1.75 },
    xleftrightharpoons:  { shape: stretch_pair({ left: true, barb: 'up' }, { right: true, barb: 'down' }), height: PAIR_H, min_width: 1.75 },
    xrightleftarrows:    { shape: stretch_pair({ right: true }, { left: true }), height: 0.901, min_width: 1.75 },
    xtofrom:             { shape: stretch_pair({ right: true }, { left: true }), height: 0.528, min_width: 1.75 },
    xrightequilibrium:   { shape: stretch_equilibrium('right'), height: PAIR_H, min_width: 1.75 },
    xleftequilibrium:    { shape: stretch_equilibrium('left'), height: PAIR_H, min_width: 1.75 },
}

function stretch_entry(label: string): StretchEntry | undefined {
    return STRETCH[label.replace(/^\\/, '')]
}

interface MathStretchArgs extends MathShapeArgs {
    label?: string
    advance?: number
    height?: number
    thickness?: number
    klass?: MathClass
}

class MathStretch extends MathShape {
    constructor(args: MathStretchArgs = {}) {
        const [ fill, { label = 'overbrace', advance: advance0, height: height0, thickness: thickness0, klass = 'mrel', ...attr } ] = shape_args(args)
        const entry = stretch_entry(label)
        if (entry == null) {
            throw new Error(`Unknown stretchy decoration: '${label}'`)
        }
        const thickness = thickness0 ?? entry.thickness ?? STRETCH_THICKNESS

        // the shape draws into a box of its natural height and at least its
        // natural width, so a decoration over a narrow body keeps its form
        const height = Math.max(height0 ?? entry.height, 2 * thickness)
        const advance = Math.max(advance0 ?? entry.min_width, entry.min_width, 2 * thickness)

        // the shape is centered on its anchor (the math axis), like MathRule
        // and MathOval, so on its own it sits where a relation would; it is
        // classed as one too, so a row spaces it like \xrightarrow and friends
        // (the explicit placements ignore the class, so this only matters for
        // a standalone stretch dropped into a MathText)
        const metrics: MathMetrics = { advance, vrange: [ 0, height ], vanchor: 0.5 * height }
        const coord: Rect = [ 0, 0, advance, height ]

        // the children draw in em within this coord (a Polygon maps its points
        // through its own context, so each piece needs the coord explicitly)
        const children = entry.shape({ width: advance, height, thickness, y: 0, coord, color: fill })
        super({ children, coord, metrics, klass, ...attr })
        this.args = args
    }
}

interface HorizBraceArgs extends Omit<GroupArgs, 'children'> {
    children?: MathLeaf[]
    label?: MathLeaf
    over?: boolean
    style?: MathStyle
    height?: number
    thickness?: number
}

class HorizBrace extends MathGroup {
    constructor(args: HorizBraceArgs = {}) {
        const {
            children, label = null, over = true, style = 'text',
            height = BRACE_HEIGHT, thickness = BRACE_THICKNESS, ...attr0
        } = THEME(args, 'HorizBrace')
        const [ spec, attr ] = spec_split(attr0)

        // TeX sets the braced body in display style, so operators take limits
        // and fractions stay full size
        const body = math_child(children, is_script_style(style) ? style : 'display', 'HorizBrace')

        // the label is set at script size, like the script it is written as in
        // TeX (\overbrace{...}^{label}), so a string parses in the script style
        const note_style = over ? sup_style(style) : sub_style(style)
        const label0 = normalize_math_leaf(label, note_style)
        const note = label0 != null
            ? { item: scale_math(label0, relative_scale(style, note_style)), kern: BRACE_LABEL_KERN }
            : null

        // the brace is a stretchy decoration with a floor on its width (so a
        // brace over a narrow body does not collapse into a squiggle) and its
        // label riding beyond it; an over/underbrace is an inner atom
        super(place_stretch(body, over ? 'overbrace' : 'underbrace', over, BRACE_KERN, { height, thickness, ...attr }, note, 'minner'), spec)
        this.args = args
    }
}

//
// math text
//

interface MathTextArgs extends GroupArgs {
    spacing?: number
    style?: MathStyle
    strut?: boolean
}

type MathLeaf = Element | string | number | boolean | null | undefined

// parse a TeX string into math elements in the given style, rendering the raw
// text in red on a parse error (as Latex does)
// katex's strict handler: \\ outside an array is a no-op in LaTeX display mode,
// which is also what gum does with it (the `cr` branch), so that warning is
// noise here; everything else keeps katex's default of a console warning
function parse_strict(code: string): 'ignore' | 'warn' {
    return code == 'newLineInDisplayMode' ? 'ignore' : 'warn'
}

function parse_math(tex: string, attr: Attrs = {}, style: MathStyle = 'display'): WithMath {
    try {
        // the AMS multiline environments (align, gather, equation, ...) are
        // gated on display mode in katex's parser
        const tree = parse_tex(tex, { displayMode: style_size(style) == 'display', strict: parse_strict })
        return convert_tree(tree, { attr, style, size: 1 })
    } catch (e) {
        // a strict failure from convert_tree is already reported, and a font
        // that is not loaded yet is the host's to handle (see mathToElementAsync);
        // don't re-wrap either as a parse error on the way out
        if (e instanceof StrictError || e instanceof FontNotLoadedError) throw e
        strictError('parse', `${(e as Error).message.split('\n')[0]}`)
        return new MathSpan({ children: [ tex ], color: red, font_family: 'KaTeX_Main' })
    }
}

// elements pass through the inline protocol; strings, numbers, and booleans
// are parsed as TeX in the given style
function normalize_math_leaf(child: MathLeaf, style: MathStyle = 'text'): WithMath | undefined {
    if (child == null) {
        return
    } else if (child instanceof Element) {
        return ensure_math(child)
    } else if (is_scalar(child) || is_string(child) || is_boolean(child)) {
        const text = String(child)
        return parse_math(text, {}, style)
    } else {
        throw new Error(`Unknown math leaf type: ${typeof child}`)
    }
}

type MathLeafTree = MathLeaf | MathLeafTree[]

// each child as one math item, kept whole (a MathText child stays a row)
function normalize_math_items(children: MathLeaf[] | undefined, style: MathStyle = 'text'): WithMath[] {
    return ensure_children(children).map(child => normalize_math_leaf(child, style)).filter(item => item != null)
}

function normalize_math_children(children0: MathLeafTree, style: MathStyle = 'text'): WithMath[] {
    const children: MathLeafTree[] = is_array(children0) ? children0 : [ children0 ]
    const out: WithMath[] = []

    for (const child of children) {
        if (child == null) {
            continue
        } else if (is_array(child)) {
            out.push(...normalize_math_children(child, style))
            continue
        }
        const elem = normalize_math_leaf(child, style)
        if (elem == null) {
            continue
        } else if (elem instanceof MathText) {
            out.push(...elem.items)
        } else {
            out.push(elem)
        }
    }

    return out
}

type MathTextLayout = {
    items: WithMath[]
    left: MathClass
    right: MathClass
}

function layout_math_text(math_items: WithMath[], script: boolean = false): MathTextLayout {
    const row_items: WithMath[] = []

    // accumulate math metrics
    let left: MathClass = 'none'
    let right: MathClass = 'none'
    let prev_item: WithMath | null = null

    // process items (glue with no class is transparent to spacing, as in TeX)
    for (const item of math_items) {
        const { left: item_left, right: item_right } = item.math
        const atom = item_left != 'none' || item_right != 'none'

        // insert item with spacing
        const gap = atom ? inter_item_spacing(prev_item, item, script) : 0
        if (gap > 0) row_items.push(new MathSpacer({ advance: gap }))
        row_items.push(item)

        // update left/right classes
        if (!atom) continue
        if (left == 'none') left = item_left
        if (item_right != 'none') right = item_right
        prev_item = item
    }

    // set default right
    if (right == 'none') right = left

    // return math items
    return { items: row_items, left, right }
}

class MathText extends MathRow {
    items: WithMath[]

    constructor(args: MathTextArgs = {}) {
        const { children: children0, style = 'text', strut = false, ...attr } = THEME(args, 'MathText')
        const inputs = ensure_children(children0)
        const math_items = normalize_math_children(inputs, style)

        // compress spacing and layout, with an optional strut (TeX \strut)
        // guaranteeing a minimum line box for top-level math
        const spaced_items = cancel_binary_atoms(math_items)
        const { items: items0, left, right } = layout_math_text(spaced_items, is_script_style(style))
        const items = strut ? [ ...items0, new MathSpacer({ vrange: STRUT }) ] : items0

        // pass to Group
        super({ children: items, ...attr })
        this.args = args

        // set math metrics
        this.items = math_items
        this.math.left = left
        this.math.right = right
    }
}

//
// explicit placement
//

// an item placed at an anchor position (x, y) in a shared anchor-relative
// frame; `align` centers or justifies it within a rect of the given width
type Placed = {
    item: WithMath
    x: number
    y: number
    width?: number
    align?: Align
}

// assemble explicitly placed items into a group whose anchor is at y = 0 and
// whose math box is the union of the placed boxes (optionally padded)
function place_items(placed: Placed[], pad: Limit = [ 0, 0 ], klass: MathClass = 'none'): WithMath<Group> {
    // an item given a width is justified within it; otherwise it draws in its
    // own ink box, which may overhang its layout box
    const rects = placed.map(({ item, x, y, width }) => {
        const [ x1, y1, x2, y2 ] = metrics_rect(item.math, x, y)
        return (width != null ? [ x, y1, x + width, y2 ] : [ x1, y1, x2, y2 ]) as Rect
    })
    const children = placed.map(({ item, align }, i) =>
        with_math(item, {}, { rect: rects[i], ...(align != null ? { align } : {}) })
    )

    // the layout box is the union of the layout boxes (optionally padded)
    const advance = max(placed.map(({ item, x, width }) => x + (width ?? item.math.advance))) ?? 0
    const [ ylo0, yhi0 ] = merge_limits(placed.map(({ item, y }) => {
        const [ lo, hi ] = metrics_bounds(item.math)
        return [ y + lo, y + hi ] as Limit
    }))
    const vrange: Limit = [ ylo0 - pad[0], yhi0 + pad[1] ]

    // the group draws the ink hull, which the layout box may not cover
    const { hrange, vink, coord } = hull_overhang(rects, advance, vrange)
    const metrics: MathMetrics = { advance, vrange, vanchor: 0, hrange, vink }
    const group = new Group({ children, coord, aspect: metrics_aspect(metrics) })
    return with_math(group, { left: klass, right: klass, ...metrics })
}

// height above and depth below the baseline of an item in a given style scale
// (its baseline sits MATH_AXIS * scale below its anchor); defaults to the scale
// the item carries, which is what scale_math left on it
function baseline_extents(item: WithMath, scale: number = item.math.scale): [ number, number ] {
    const [ lo, hi ] = metrics_bounds(item.math)
    const baseline = MATH_AXIS * scale
    return [ baseline - lo, hi - baseline ]
}

//
// sup/sub
//

// TeX Rule 18: scripts shift up/down from the base baseline by fixed style
// amounts, riding higher/lower on tall bases (sup_drop/sub_drop from the
// base's top and bottom), with the superscript kept clear of the x-height and
// the two scripts kept apart by 4 rule thicknesses; the superscript alone is
// shifted right by the base's italic correction
function layout_scripts(base: WithMath, sup: WithMath | null, sub: WithMath | null, style: MathStyle, rel: number): WithMath | null {
    if (sup == null && sub == null) return null

    // base extents and script extents (all in base em, relative to baselines)
    const [ hb, db ] = baseline_extents(base)
    const { italic } = base.math
    const u = hb - TEX.sup_drop * rel
    const v = db + TEX.sub_drop * rel

    // superscript shift up
    let sup_shift = 0
    let dsup = 0
    if (sup != null) {
        const [ , d ] = baseline_extents(sup, rel)
        const p = style == 'display' ? TEX.sup1 : is_cramped_style(style) ? TEX.sup3 : TEX.sup2
        sup_shift = Math.max(u, p, d + 0.25 * TEX.x_height)
        dsup = d
    }

    // subscript shift down
    let sub_shift = 0
    if (sub != null) {
        const [ h ] = baseline_extents(sub, rel)
        if (sup == null) {
            sub_shift = Math.max(v, TEX.sub1, h - 0.8 * TEX.x_height)
        } else {
            sub_shift = Math.max(v, TEX.sub2)
            const gap = (sup_shift - dsup) - (h - sub_shift)
            if (gap < 4 * TEX.rule) sub_shift += 4 * TEX.rule - gap
            const psi = 0.8 * TEX.x_height - (sup_shift - dsup)
            if (psi > 0) { sup_shift += psi; sub_shift -= psi }
        }
    }

    // anchors of the scripts (their baselines sit MATH_AXIS * rel below)
    const placed: Placed[] = []
    if (sup != null) placed.push({ item: sup, x: italic, y: MATH_AXIS - sup_shift - MATH_AXIS * rel })
    if (sub != null) placed.push({ item: sub, x: 0, y: MATH_AXIS + sub_shift - MATH_AXIS * rel })
    return place_items(placed)
}

// TeX Rule 13a: limits centered above and below a large operator, split by
// half the italic correction, with minimum clearances from the operator
function layout_limits(base: WithMath, sup: WithMath | null, sub: WithMath | null, rel: number): WithMath<Group> {
    const [ blo, bhi ] = metrics_bounds(base.math)
    const { italic } = base.math
    const width = max([ base.math.advance, sup?.math.advance ?? 0, sub?.math.advance ?? 0 ].map(w => w + italic)) ?? 0
    const placed: Placed[] = [ { item: base, x: 0.5 * italic, y: 0, width: width - italic, align: 'center' } ]

    if (sup != null) {
        const [ , d ] = baseline_extents(sup, rel)
        const [ , shi ] = metrics_bounds(sup.math)
        const gap = Math.max(TEX.bigop1, TEX.bigop3 - d)
        placed.push({ item: sup, x: italic, y: blo - gap - shi, width: width - italic, align: 'center' })
    }
    if (sub != null) {
        const [ h ] = baseline_extents(sub, rel)
        const [ slo ] = metrics_bounds(sub.math)
        const gap = Math.max(TEX.bigop2, TEX.bigop4 - h)
        placed.push({ item: sub, x: 0, y: bhi + gap - slo, width: width - italic, align: 'center' })
    }

    const pad: Limit = [ sup != null ? TEX.bigop5 : 0, sub != null ? TEX.bigop5 : 0 ]
    return place_items(placed, pad)
}

interface SupSubArgs extends MathRowArgs {
    sup?: MathLeaf
    sub?: MathLeaf
    style?: MathStyle
    limits?: boolean
}

class SupSub extends MathRow {
    constructor(args: SupSubArgs = {}) {
        const { children, sup: sup0, sub: sub0, style = 'text', limits: limits0, ...attr } = THEME(args, 'SupSub')
        const base = math_child(children, style, 'SupSub')

        // scripts render one size level down; superscripts inherit crampedness
        // while subscripts are always cramped (TeX's eight-style transition table)
        const style_sup = sup_style(style)
        const style_sub = sub_style(style)
        const rel = relative_scale(style, style_sup)
        const sub_rel = relative_scale(style, style_sub)
        const sup0m = normalize_math_leaf(sup0, style_sup)
        const sub0m = normalize_math_leaf(sub0, style_sub)
        const sup = sup0m != null ? scale_math(sup0m, rel) : null
        const sub = sub0m != null ? scale_math(sub0m, sub_rel) : null

        // limits stack over/under (by default when the base is a display-style
        // operator that takes them); side scripts follow the base plus script space
        const limits = limits0 ?? (base instanceof MathOp && base.limits)
        let items: WithMath[]
        if (limits) {
            items = [ layout_limits(base, sup, sub, rel) ]
        } else {
            const scripts = layout_scripts(base, sup, sub, style, rel)
            const space = new MathSpacer({ advance: TEX.script_space })
            items = scripts != null ? [ base, scripts, space ] : [ base ]
        }

        // pass to MathRow
        super({ children: items, ...attr })
        this.args = args

        // preserve the base atom classes while keeping the actual row metrics
        this.math.left = base.math.left
        this.math.right = base.math.right
    }
}

//
// frac
//

interface FracArgs extends Omit<GroupArgs, 'children'> {
    children?: MathLeaf[]  // [ numerator, denominator ]
    has_bar?: boolean
    padding?: Padding
    rule_size?: number
    style?: MathStyle
    color?: string
}

// TeX Rule 15: numerator and denominator baselines shift up/down from the
// fraction's baseline by fixed style amounts, pushed further apart if their
// ink would come within a clearance of the bar (which sits on the axis)
class Frac extends MathGroup {
    constructor(args: FracArgs = {}) {
        const { children: children0, has_bar = true, padding = [ 0.1, 0 ], rule_size = TEX.frac_rule, style = 'display', color, ...attr } = THEME(args, 'Frac')
        const [ numer0, denom0 ] = check_array(children0, 2)
        const [ pl, pt, pr, pb ] = pad_rect(padding)
        const [ pad_x, pad_y ] = [ 0.5 * (pl + pr), 0.5 * (pt + pb) ]
        const nstyle = frac_num_style(style)
        const dstyle = frac_den_style(style)
        const numer1 = normalize_math_leaf(numer0, nstyle)
        const denom1 = normalize_math_leaf(denom0, dstyle)

        // check children
        if (numer1 == null || denom1 == null) {
            throw new Error('Frac must have exactly two children')
        }

        // fraction contents render one style level down in inline styles
        const rel = relative_scale(style, nstyle)
        const drel = relative_scale(style, dstyle)
        const numer = scale_math(numer1, rel)
        const denom = scale_math(denom1, drel)

        // style parameters: baseline shifts and clearance from the bar
        const display = style_size(style) == 'display'
        const num_shift = display ? (has_bar ? TEX.num1 : TEX.num3) : TEX.num2
        const den_shift = display ? TEX.denom1 : TEX.denom2
        const rule_spacing = has_bar ? rule_size : TEX.rule
        const clearance = (has_bar ? (display ? 3 : 1) : (display ? 7 : 3)) * rule_spacing + pad_y
        const half = has_bar ? 0.5 * rule_size : 0

        // numerator: baseline MATH_AXIS - shift, pushed up to clear the bar
        const [ , dn ] = baseline_extents(numer, rel)
        const num_base = Math.min(MATH_AXIS - num_shift, -(half + clearance + dn))
        const [ hd ] = baseline_extents(denom, rel)
        const den_base = Math.max(MATH_AXIS + den_shift, half + clearance + hd)

        // assemble around the bar
        const width = Math.max(numer.math.advance, denom.math.advance) + 2 * pad_x
        const placed: Placed[] = [
            { item: numer, x: pad_x, y: num_base - MATH_AXIS * rel, width: width - 2 * pad_x, align: 'center' },
            { item: denom, x: pad_x, y: den_base - MATH_AXIS * rel, width: width - 2 * pad_x, align: 'center' },
        ]
        if (has_bar) {
            const bar = new MathRule({ advance: width, thickness: rule_size, color })
            placed.push({ item: bar, x: 0, y: 0 })
        }

        // a fraction is an inner atom
        super(place_items(placed, [ 0, 0 ], 'minner'), { ...(color != null ? { color } : {}), ...attr })
        this.args = args
    }
}

//
// over/underline
//

interface LineDecorationArgs extends GroupArgs {
    thickness?: number
    color?: string
    style?: MathStyle
}

type LineDecorationSide = 'over' | 'under'

function layout_line_decoration(body: WithMath, side: LineDecorationSide, thickness: number, color?: string): WithMath<Group> {
    const [ top, bottom ] = metrics_bounds(body.math)
    const edge = side == 'over' ? top : bottom
    const direction = side == 'over' ? -1 : 1
    const rule = new MathRule({ advance: body.math.advance, thickness, color })
    const line_anchor = edge + direction * 3.5 * thickness
    const padding: Limit = side == 'over' ? [ thickness, 0 ] : [ 0, thickness ]
    return place_items([
        { item: body, x: 0, y: 0 },
        { item: rule, x: 0, y: line_anchor },
    ], padding, 'mord')
}

// TeX Rule 10: keep the body's baseline and top fixed, then place a rule
// below its ink with a three-rule gap and one extra rule of trailing depth.
// Rule 9 mirrors that above the body, which is first set in the cramped
// version of the surrounding style
class LineDecoration extends MathGroup {
    constructor(args: LineDecorationArgs, side: LineDecorationSide, name: string) {
        const { children, thickness = TEX.rule, color, style = 'text', ...attr } = THEME(args, name)
        const body = math_child(children, side == 'over' ? cramped_style(style) : style, name)
        super(layout_line_decoration(body, side, thickness, color), attr)
        this.args = args
    }
}

class Underline extends LineDecoration {
    constructor(args: LineDecorationArgs = {}) {
        super(args, 'under', 'Underline')
    }
}

class Overline extends LineDecoration {
    constructor(args: LineDecorationArgs = {}) {
        super(args, 'over', 'Overline')
    }
}

//
// sqrt
//

interface SqrtArgs extends GroupArgs {
    index?: MathLeaf
    padding?: Padding
    rule_size?: number
    line_width?: number
    style?: MathStyle
}

// TeX's delimiter search (katex's traverseSequence): walk the sizes from the
// smallest and take the first whose natural extent covers the requirement,
// unscaled, so glyphs overshoot rather than being scaled -- a stretched glyph
// also thickens. Only when even the largest size is too small (where TeX would
// build the glyph from extensible pieces) is that glyph returned with the scale
// that would fit it. The size fonts do not all cover every glyph (the vertical
// bars stop after Size1, since real TeX builds tall ones from pieces), so
// sizes without it are skipped
function fit_glyph<E extends WithMath>(text: string, target: number, make: (font_family: FontFamily) => E, measure: (glyph: E) => number): [ E, number ] {
    let largest: E | null = null
    for (const font_family of SIZE_FONTS) {
        if (!textHasGlyphs(text, { font_family })) continue
        const glyph = make(font_family)
        if (measure(glyph) >= target) return [ glyph, 1 ]
        largest = glyph
    }
    if (largest == null) return [ make(SIZE_FONTS[0]), 1 ]
    return [ largest, target / measure(largest) ]
}

interface RadicalSpanArgs extends MathSpanArgs {
    fit_width?: boolean
    fit_aspect?: number
}

// SVG text normally scales uniformly with its font size. The tall fallback
// needs KaTeX's behavior instead: grow vertically while retaining the Size4
// surd's advance. textLength constrains that one exceptional glyph's width.
class RadicalSpan extends MathSpan {
    fit_width: boolean

    constructor(args: RadicalSpanArgs = {}) {
        const { fit_width = false, fit_aspect, ...attr } = args
        super(attr)
        this.args = args
        this.fit_width = fit_width
        if (fit_aspect != null) {
            this.spec.aspect = fit_aspect
            this.spec.aspect0 = fit_aspect
        }
    }

    props(ctx: Context): Attrs {
        const attr = super.props(ctx)
        if (!this.fit_width) return attr
        const [ x1, , x2 ] = ctx.prect
        return {
            ...attr,
            textLength: Math.abs(x2 - x1),
            lengthAdjust: 'spacingAndGlyphs',
        }
    }
}

function radical_glyph(font_family: FontFamily, color: string | undefined): WithMath<RadicalSpan> {
    return new RadicalSpan({
        children: [ '\u221a' ],
        font_family,
        center: true,
        ...(color != null ? { color } : {}),
    })
}

// the first natural surd that covers the requested height; beyond Size4 the
// glyph keeps its horizontal proportions and stretches only vertically, the
// role of katex's tall-radical SVG fallback
function fit_radical(height: number, color: string | undefined): WithMath<RadicalSpan> {
    const [ glyph, scale ] = fit_glyph('\u221a', height, font_family => radical_glyph(font_family, color), g => metrics_height(g.math))
    if (scale == 1) return glyph
    const [ lo, hi ] = metrics_bounds(glyph.math)
    const fitted = glyph.clone({ fit_width: true, fit_aspect: glyph.math.advance / height }) as RadicalSpan
    return with_math(fitted, { vrange: [ scale * lo, scale * hi ], vanchor: 0 })
}

class Sqrt extends MathGroup {
    constructor(args: SqrtArgs = {}) {
        const {
            children,
            index = null,
            color,
            padding = 0,
            rule_size: rule_size0,
            line_width: line_width,
            style = 'text',
            ...attr
        } = THEME(args, 'Sqrt')
        const body = math_child(children, cramped_style(style), 'Sqrt')
        const rule_size = rule_size0 ?? line_width ?? TEX.rule

        // TeX Rule 11: the radicand is cramped, with a style-dependent gap
        // below the rule. The smallest delimiter is still a full text surd.
        const body_box = new MathBox({ children: [ body ], padding })
        const body_height = metrics_height(body_box.math)
        const body_width = body_box.math.advance
        const phi = style_size(style) == 'display' ? TEX.x_height : rule_size
        let clearance = rule_size + 0.25 * phi
        const eff_height = Math.max(body_height, TEX.x_height)
        const min_radical_height = eff_height + clearance + rule_size
        const radical = fit_radical(min_radical_height, color)
        const radical_height = metrics_height(radical.math)

        // A natural delimiter is often taller than the minimum. Split that
        // extra room above and below the body, as TeX/KaTeX do.
        const radical_depth = radical_height - rule_size
        if (radical_depth > eff_height + clearance) {
            clearance = 0.5 * (clearance + radical_depth - eff_height)
        }

        // Preserve the body's anchor. The surd and the square rule meet with a
        // small overlap so rasterization cannot open a seam at their joint.
        const [ body_top ] = metrics_bounds(body_box.math)
        const rule_top = body_top - clearance - rule_size
        const [ radical_top ] = metrics_bounds(radical.math)
        const radical_y = rule_top - radical_top
        const radical_width = radical.math.advance
        const overlap = Math.min(0.5 * rule_size, radical_width)
        const rule = new MathRule({ advance: overlap + body_width, thickness: rule_size, color })
        const [ rule_lo ] = metrics_bounds(rule.math)
        const rule_y = rule_top - rule_lo

        const placed: Placed[] = [
            { item: radical, x: 0, y: radical_y },
            { item: rule, x: radical_width - overlap, y: rule_y },
            { item: body_box, x: radical_width, y: 0 },
        ]

        // TeX always sets a root index in scriptscript style. Keep it inside
        // the surd's horizontal advance, aligned with the upper-left shoulder.
        const index0 = normalize_math_leaf(index, 'scriptscript')
        if (index0 != null) {
            const index_elem = scale_math(index0, relative_scale(style, 'scriptscript'))
            const [ , index_bottom ] = metrics_bounds(index_elem.math)
            const right = 0.65 * radical_width
            const bottom = rule_top + 0.55 * radical_height
            placed.push({
                item: index_elem,
                x: Math.max(0, right - index_elem.math.advance),
                y: bottom - index_bottom,
            })
        }

        super(place_items(placed, [ 0, 0 ], 'mord'), attr)
        this.args = args
    }
}

//
// accent
//

const ACCENT_LABEL_FALLBACK: Record<string, string> = {
    '\\widehat': '\\hat',
    '\\widecheck': '\\check',
    '\\widetilde': '\\tilde',
    '\\utilde': '\\tilde',
}

const ACCENT_TEXT_FALLBACK: Record<string, string> = {
    '\\vec': '→',
}

function build_accent_symbol(label: string, color: string | undefined, mode: SymbolMode = 'math'): WithMath {
    const span_attr = color != null ? { color } : {}
    const label1 = ACCENT_LABEL_FALLBACK[label] ?? label
    if (label1 in ACCENT_TEXT_FALLBACK) {
        const span = new MathSpan({ children: [ ACCENT_TEXT_FALLBACK[label1] ], ...span_attr })
        return scale_math(span, 0.5)
    }
    return new MathSymbol({ children: [ label1 ], mode, ...span_attr })
}

interface AccentArgs extends GroupArgs {
    label?: string
    color?: string
    mode?: SymbolMode  // text-mode accents (\', \", \c, ...) live in the text symbol table
}

class Accent extends MathGroup {
    constructor(args: AccentArgs = {}) {
        const { children, label = '', color, mode = 'math', ...attr } = THEME(args, 'Accent')
        const base = math_child(children, 'text', 'Accent')

        // TeX Rule 12: the accent glyph is designed to sit above the x-height;
        // raise it to clear taller bases (ink bottom at max(base height, x-height)
        // plus the designed gap). Two text-mode exceptions, as in katex: the
        // cedilla hangs from the base's ink bottom, and \textcircled's ring is a
        // full-size glyph that simply overprints the base on its own baseline
        const accent = build_accent_symbol(label, color, mode)
        const [ hb ] = baseline_extents(base)
        const [ alo, ahi ] = metrics_bounds(accent.math)
        const [ , bhi ] = metrics_bounds(base.math)
        const bottom = MATH_AXIS - Math.max(hb, TEX.x_height) - TEX.accent_gap
        const dy = label == '\\textcircled' ? 0 : label == '\\c' ? bhi - alo : bottom - ahi

        // center both in a shared inline box; the accented atom keeps the
        // base's spacing classes
        const advance = max([ base.math.advance, accent.math.advance ]) ?? 0
        const body = place_items([
            { item: accent, x: 0.5 * (advance - accent.math.advance), y: dy },
            { item: base, x: 0.5 * (advance - base.math.advance), y: 0 },
        ])
        super(body, attr)
        this.args = args
        this.math = make_math({ ...body.math, left: base.math.left, right: base.math.right })
    }
}

//
// bracket
//

type DelimType = 'round' | 'square' | 'curly' | 'angle'

// '<' and '>' turn into angle brackets as delimiters, as in katex
const DELIM_ANGLE: Record<string, string> = {
    '<': '\\langle', '\\lt': '\\langle', '\u27e8': '\\langle',
    '>': '\\rangle', '\\gt': '\\rangle', '\u27e9': '\\rangle',
}

function normalize_delim(delim: string | null | undefined): string | null {
    if (delim == null || delim == '.' || delim == '') return null
    return DELIM_ANGLE[delim] ?? delim
}

// the named delimiter pairs; anything else is taken as the glyph itself
const DELIM_PAIRS: Record<DelimType, [ string, string ]> = {
    round: [ '(', ')' ], square: [ '[', ']' ], curly: [ '{', '}' ], angle: [ '<', '>' ],
}

function get_delim_text(delim: string | undefined, side: 'left' | 'right'): string {
    if (delim == null || delim == '.') return ''
    const pair = DELIM_PAIRS[delim as DelimType]
    return pair != null ? pair[side == 'left' ? 0 : 1] : delim
}

interface DelimArgs extends MathSymbolArgs {
    delim?: string
    side?: 'left' | 'right'
    mode?: SymbolMode
    level?: number
}

// delimiter glyphs are designed to be centered on the axis at every size; the
// face is the size font for `level`, unless given directly
class Delim extends MathSymbol {
    constructor(args: DelimArgs = {}) {
        const { delim, side = 'left', mode = 'math', level = 1, font_family: font_family0, ...attr } = THEME(args, 'Delim')
        const text = get_delim_text(delim, side)
        const font_family = font_family0 ?? size_font(level)
        const klass = side == 'left' ? 'mopen' : 'mclose'
        super({ children: [ text ], mode, klass, font_family, center: true, ...attr })
    }
}

// TeX Rule 19: the delimiter must cover the body's extent above and below the
// axis (scaled by delimiterfactor, less delimitershortfall) and is never
// smaller than the text-size glyph; `target` is that half-height. An explicit
// level skips the search
const DELIM_FACTOR = 0.901
const DELIM_SHORTFALL = 0.5

function fit_delim(delim: string, side: 'left' | 'right', target: number, level0: number | undefined, attr: Attrs): WithMath<Delim> {
    if (level0 != null) return new Delim({ delim, side, level: level0, ...attr })
    const text = get_delim_text(delim, side)
    const [ glyph, scale ] = fit_glyph(text, target,
        font_family => new Delim({ delim, side, font_family, ...attr }) as WithMath<Delim>,
        g => { const [ lo, hi ] = metrics_bounds(g.math); return 0.5 * (hi - lo) })
    return scale_math(glyph, scale)
}

// \big ... \Bigg ask for a delimiter of a fixed total height (katex's
// sizeToMaxHeight), which is the natural height of Size1 ... Size4; a hair of
// slack lets a 1.199 em glyph answer for 1.2
const DELIM_SIZE_HEIGHT = [ 0, 1.2, 1.8, 2.4, 3.0 ]
const DELIM_SIZE_SLACK = 0.01

function sized_delim(delim: string, side: 'left' | 'right', size: number, attr: Attrs): WithMath<Delim> {
    const target = 0.5 * DELIM_SIZE_HEIGHT[size] - DELIM_SIZE_SLACK
    return fit_delim(delim, side, target, undefined, attr)
}

interface BracketArgs extends MathRowArgs {
    delim?: DelimType | [ DelimType, DelimType ]
    left_delim?: string | null
    right_delim?: string | null
    height?: number  // fixed total delimiter height in em instead of fitting the body (TeX rule 15e, for \binom and \genfrac)
}

class Bracket extends MathRow {
    constructor(args: BracketArgs = {}) {
        const { children, delim: delim0 = 'round', left_delim: left_delim0, right_delim: right_delim0, height, ...attr0 } = THEME(args, 'Bracket')
        const body = math_child(children, 'text', 'Bracket')
        const [ left_delim1, right_delim1 ] = ensure_vector(delim0, 2)
        const left_delim = normalize_delim(left_delim0 ?? left_delim1)
        const right_delim = normalize_delim(right_delim0 ?? right_delim1)
        const [ spec, shared_attr0 ] = spec_split(attr0)
        const [ delim_attr, shared_attr ] = prefix_split([ 'delim' ], shared_attr0)
        const { level: level0, ...delim_attr1 } = delim_attr as DelimArgs

        // required half-height around the axis: from the body (TeX Rule 19), or
        // a fixed size that ignores the body (Rule 15e, generalized fractions)
        const [ blo, bhi ] = metrics_bounds(body.math)
        const extent = Math.max(-blo, bhi)
        const target = height != null ? 0.5 * height : Math.max(DELIM_FACTOR * extent, extent - 0.5 * DELIM_SHORTFALL, 0.5)

        // fit delimiters
        const delim_args = { ...shared_attr, ...delim_attr1 }
        const left = left_delim != null ? fit_delim(left_delim, 'left', target, level0, delim_args) : null
        const right = right_delim != null ? fit_delim(right_delim, 'right', target, level0, delim_args) : null
        const items = [ left, body, right ].filter(item => item != null)

        // pass to MathRow
        super({ children: items, ...shared_attr, ...spec })
        this.args = args

        // a delimited group is an inner atom
        this.math.left = 'minner'
        this.math.right = 'minner'
    }
}

//
// oval overlay for \oiint and \oiiint
//

// no KaTeX face has these glyphs; katex sets \iint/\iiint and overlays an oval
// SVG (its oiintSize1/2 paths), centred on the axis. The ellipse below is that
// path's mid-ring and stroke, in em: [centre x, rx, ry, stroke width]
const OIINT_OVAL: Record<string, Record<'text' | 'display', [ number, number, number, number ]>> = {
    '\\oiint':  { text: [ 0.513, 0.344, 0.197, 0.04 ], display: [ 0.758, 0.477, 0.254, 0.05 ] },
    '\\oiiint': { text: [ 0.681, 0.503, 0.197, 0.04 ], display: [ 1.021, 0.739, 0.302, 0.05 ] },
}
const OIINT_BASE: Record<string, string> = { '\\oiint': '\\iint', '\\oiiint': '\\iiint' }

interface MathOvalArgs extends MathShapeArgs {
    cx?: number
    rx?: number
    ry?: number
    thickness?: number
}

// the ring alone, as glue laid over the operator
class MathOval extends MathShape {
    constructor(args: MathOvalArgs = {}) {
        const [ color, { cx = 0.5, rx = 0.35, ry = 0.2, thickness = TEX.rule, ...attr } ] = shape_args(args)
        const [ w, h ] = [ cx + rx + 0.5 * thickness, 2 * ry + thickness ]
        const oval = new Ellipse({ pos: [ cx, 0.5 * h ], rad: [ rx, ry ], stroke: color, stroke_width: thickness, fill: none })
        const metrics: MathMetrics = { advance: w, vrange: [ 0, h ], vanchor: 0.5 * h }
        super({ children: [ oval ], coord: [ 0, 0, w, h ], metrics, klass: 'none', ...attr })
        this.args = args
    }
}

function convert_oiint(name: string, limits: boolean | undefined, { attr, style }: ConvertCtx): WithMath {
    const op = new MathOp({ children: [ OIINT_BASE[name] ], style, limits, ...attr })
    const size = style_size(style) == 'display' ? 'display' : 'text'
    const [ cx, rx, ry, thickness ] = OIINT_OVAL[name][size]
    const oval = new MathOval({ cx, rx, ry, thickness, color: attr.color as string | undefined })
    const group = place_items([ { item: op, x: 0, y: 0 }, { item: oval, x: 0, y: 0 } ], [ 0, 0 ], 'mop')
    return with_math(group, { italic: op.math.italic })
}

//
// phantoms and smashes
//

// the body's layout box with nothing drawn in it; hphantom keeps only the
// width and vphantom only the height. Spacing classes are kept, since a
// phantom is meant to stand in for its body
function phantom_math(body: WithMath, keep: { h: boolean, v: boolean }): WithMath {
    const { left, right, advance, vrange, vanchor, italic, hrange } = body.math
    const spacer = new MathSpacer({ advance: keep.h ? advance : 0 })
    return with_math(spacer, {
        left, right,
        advance: keep.h ? advance : 0,
        vrange: keep.v ? vrange : [ vanchor, vanchor ],
        vanchor,
        italic: keep.h ? italic : 0,
        hrange: keep.h ? hrange : undefined,
    })
}

// \smash: the body still draws, but its layout box loses its height above the
// baseline and/or its depth below it; the ink is kept as an overhang
function smash_math(body: WithMath, height: boolean, depth: boolean): WithMath {
    if (!height && !depth) return body
    const { vrange: [ ylo, yhi ], vanchor, vink, scale } = body.math
    const baseline = vanchor + MATH_AXIS * scale
    const vrange: Limit = [ height ? Math.min(baseline, yhi) : ylo, depth ? Math.max(baseline, ylo) : yhi ]
    if (height && depth) vrange[1] = vrange[0]
    return with_math(body, { vrange, vink: vink ?? [ ylo, yhi ] })
}

//
// enclosures: \boxed, \fbox, \colorbox, \fcolorbox, \cancel, \sout
//

const FBOX_SEP = 0.3           // \fboxsep, 3 pt
const FBOX_RULE = TEX.rule     // \fboxrule, 0.4 pt like the default rule
const CANCEL_PAD = 0.2         // katex's cancel-pad: the strike overshoots a multi-character body sideways by this, and a single character vertically
const CANCEL_THICKNESS = 0.046  // katex's .cancel-lines stroke

// katex's isCharacterBox: a lone symbol, possibly wrapped in groups, fonts
// and colours, which the cancel package strikes through corner to corner
function is_character_box(tree: TreeNode | TreeNode[] | null | undefined): boolean {
    if (tree == null) return false
    if (is_array(tree)) return tree.length == 1 && is_character_box(tree[0])
    const { type } = tree
    if (type == 'mathord' || type == 'textord' || type == 'atom') return true
    if (type == 'ordgroup' || type == 'color') return is_character_box(tree.body)
    if (type == 'font') return is_character_box(tree.body)
    return false
}

// a framed (and/or filled) box around the body: fboxsep of padding all round,
// then the rule outside that, as \fbox sets it
function enclose_box(body: WithMath, border: string | null, background: string | null, thickness: number): WithMath<Group> {
    const pad = FBOX_SEP + (border != null ? thickness : 0)
    const box = new MathBox({ children: [ body ], padding: pad })
    const [ lo, hi ] = metrics_bounds(box.math)
    const w = box.math.advance
    const rect: Rect = [ 0, lo, w, hi ]

    // the frame is a rectangle stroked in em (MathShape rebases the stroke
    // unit), inset by half the rule so its outer edge is the box edge
    const children: Element[] = []
    if (background != null) children.push(new Rectangle({ rect, fill: background, stroke: none }))
    children.push(with_math(box, {}, { rect }))
    if (border != null) {
        const t = thickness
        const frame: Rect = [ 0.5 * t, lo + 0.5 * t, w - 0.5 * t, hi - 0.5 * t ]
        children.push(new Rectangle({ rect: frame, fill: none, stroke: border, stroke_width: t }))
    }

    const metrics: MathMetrics = { advance: w, vrange: [ lo, hi ], vanchor: 0 }
    return new MathShape({ children, coord: rect, metrics })
}

// the strike lines of \cancel (rising), \bcancel (falling) and \xcancel
// (both), stroked in em across a box that may overhang the body: the strike
// takes no space of its own, so its math box is the body's with the strike box
// carried as overhang
interface MathCancelArgs extends MathShapeArgs {
    box?: Rect         // the strike box, in the anchor frame
    rising?: boolean
    falling?: boolean
    thickness?: number
    metrics?: MathMetrics
}

class MathCancel extends MathShape {
    constructor(args: MathCancelArgs = {}) {
        const [ color, { box = [ 0, 0, 1, 1 ], rising = true, falling = false, thickness = CANCEL_THICKNESS, metrics: metrics0, ...attr } ] = shape_args(args)
        const [ x0, y0, x1, y1 ] = box
        const line_attr = { coord: box, stroke: color, stroke_width: thickness }
        const children: Element[] = []
        if (rising) children.push(new Line({ points: [ [ x0, y1 ], [ x1, y0 ] ], ...line_attr }))
        if (falling) children.push(new Line({ points: [ [ x0, y0 ], [ x1, y1 ] ], ...line_attr }))
        const metrics = metrics0 ?? { advance: x1 - x0, vrange: [ y0, y1 ], vanchor: 0 }
        super({ children, coord: box, aspect: (x1 - x0) / (y1 - y0), metrics, klass: 'none', ...attr })
        this.args = args
    }
}

function enclose_cancel(body: WithMath, rising: boolean, falling: boolean, single: boolean, color: string): WithMath<Group> {
    const [ lo, hi ] = metrics_bounds(body.math)
    const w = body.math.advance
    const pad = CANCEL_PAD
    const rect: Rect = single ? [ 0, lo - pad, w, hi + pad ] : [ -pad, lo, w + pad, hi ]
    const [ x0, y0, x1, y1 ] = rect

    const lines = new MathCancel({
        box: rect, rising, falling, thickness: CANCEL_THICKNESS, color,
        metrics: {
            advance: w, vrange: [ lo, hi ], vanchor: 0,
            hrange: x0 != 0 ? [ x0, x1 ] : undefined,
            vink: single ? [ y0, y1 ] : undefined,
        },
    })
    return place_items([ { item: body, x: 0, y: 0 }, { item: lines, x: 0, y: 0 } ], [ 0, 0 ], 'mord')
}

// \sout: a rule through the body at half the x-height
function enclose_sout(body: WithMath, color: string): WithMath<Group> {
    const rule = new MathRule({ advance: body.math.advance, thickness: TEX.rule, fill: color })
    const y = MATH_AXIS - 0.5 * TEX.x_height - 0.5 * TEX.rule
    return place_items([ { item: body, x: 0, y: 0 }, { item: rule, x: 0, y } ], [ 0, 0 ], 'mord')
}

function convert_enclose(tree: TreeEnclose, ctx: ConvertCtx): WithMath {
    const { label, body: body0, backgroundColor, borderColor } = tree
    const name = label.slice(1)
    const body = seal_math(convert_tree(body0, ctx))
    const color = shape_ink({ color: ctx.attr.color as string | undefined })

    if (name == 'boxed' || name == 'fbox') return enclose_box(body, color, null, FBOX_RULE)
    if (name == 'colorbox') return enclose_box(body, null, backgroundColor ?? null, FBOX_RULE)
    if (name == 'fcolorbox') return enclose_box(body, borderColor ?? color, backgroundColor ?? null, FBOX_RULE)
    if (name == 'sout') return enclose_sout(body, color)
    if (name == 'cancel' || name == 'bcancel' || name == 'xcancel') {
        const single = is_character_box(body0)
        return enclose_cancel(body, name != 'bcancel', name != 'cancel', single, color)
    }

    // \phase, \angl, \angln: the body still draws
    strictError('node', `unsupported enclosure '${label}'`)
    return body
}

//
// text mode
//

type TextModeFamily = 'main' | 'sans' | 'mono'

interface TextModeArgs extends MathTextArgs {
    family?: TextModeFamily
    bold?: boolean
    italic?: boolean
}

const TEXT_MODE_FAMILY: Record<TextModeFamily, TextFace['family']> = {
    main: 'Main', sans: 'SansSerif', mono: 'Typewriter',
}

// plain text inside math, set the way \text{...} sets it: each character of a
// string child is a text-mode symbol in the face composed from `family`/
// `bold`/`italic` over any `font_family` given (a space is the face's space
// glyph, as in katex), so the text is literal (no TeX parsing) and the symbols
// are built directly rather than through the parser; elements mix inline as
// in MathText
class TextMode extends MathText {
    constructor(args: TextModeArgs = {}) {
        const { children: children0, family, bold, italic, style = 'text', strut, ...attr0 } = THEME(args, 'TextMode')
        const [ spec, attr ] = spec_split(attr0)
        const inputs = ensure_children(children0)

        // compose the text face over the one given
        const face = parse_text_face(attr.font_family as string | undefined)
        const font_family = text_face_family({
            ...face,
            ...(family != null ? { family: TEXT_MODE_FAMILY[family] } : {}),
            ...(bold != null ? { bold } : {}),
            ...(italic != null ? { italic } : {}),
        })

        // one text-mode symbol per character
        const elems = inputs.flatMap(child =>
            (is_string(child) || is_scalar(child))
                ? [ ...String(child) ].map(c => new MathSymbol({ children: [ c ], mode: 'text', ...attr, font_family }))
                : [ child ]
        )

        // pass to MathText
        super({ children: elems, style, strut, ...spec })
        this.args = args
    }
}

//
// parse katex tree
//

const EMPTY_MATH = new MathSpacer()

// what flows down the conversion: `attr` is whatever every leaf inherits (the
// Latex element's own attributes, `font_family` from math font commands,
// `color` from \color), `text_face` the face the \text* commands have
// composed for text-mode symbols (math inside text keeps the math face, as in
// katex), `style` is the TeX style in force, and `size` the \tiny ... \Huge
// multiplier in force, so a nested size change is relative to the enclosing
// one (katex's sizeMultiplier)
type ConvertCtx = { attr: Attrs, style: MathStyle, size: number, text_face?: FontFamily }

function ctx_style(ctx: ConvertCtx, style: MathStyle): ConvertCtx {
    return style == ctx.style ? ctx : { ...ctx, style }
}

function ctx_attr(ctx: ConvertCtx, attr: Attrs): ConvertCtx {
    return { ...ctx, attr: { ...ctx.attr, ...attr } }
}

// the attributes a symbol inherits: a text-mode symbol takes the composed text
// face over the math one
function symbol_attr(mode: SymbolMode, { attr, text_face }: ConvertCtx): Attrs {
    return mode == 'text' && text_face != null ? { ...attr, font_family: text_face } : attr
}

// convert a body into a single atom of the given class: sealed, so a fragment
// row does not splice into its parent, and reclassed on both sides
function convert_atom(body: Tree | TreeNode | null, ctx: ConvertCtx, klass: MathClass): WithMath {
    const inner = seal_math(convert_tree(body, ctx))
    return with_math(inner, { left: klass, right: klass })
}

// \operatorname{...}: the body is set upright, the way the built-in named
// operators are, and the whole name behaves as a single Op atom
function convert_operatorname(tree: TreeOperatorName, ctx: ConvertCtx): WithMath {
    const { body } = tree

    // katex rewrites each character as an upright text-mode symbol, and amsopn
    // asks for a hyphen rather than a minus and an asterisk rather than \ast
    const upright = (body ?? []).map(node => {
        const text = is_object(node) && 'text' in node ? (node as { text?: unknown }).text : undefined
        return is_string(text)
            ? { type: 'textord', mode: 'text', text: text.replace(/\u2212/, '-').replace(/\u2217/, '*') } as TreeNode
            : node
    })
    // katex builds the body withFont("mathrm"); force the upright face here so
    // a nested group (\varlimsup wraps its name in \overline) stays upright too
    return convert_atom(upright, ctx_attr(ctx, { font_family: SYMBOL_MODE_FONT.text }), 'mop')
}

// a stretchy decoration sitting on the body, which sets its width: the body
// keeps its own baseline and the decoration is centred over (or under) it,
// with an optional note (a brace's label) riding beyond the decoration; a
// wider decoration or note overhangs the body
type StretchNote = { item: WithMath, kern: number }

function place_stretch(body: WithMath, label: string, over: boolean, kern: number, attr: Attrs, note: StretchNote | null = null, klass: MathClass = 'mord'): WithMath<Group> {
    const deco = new MathStretch({ label, advance: body.math.advance, ...attr })
    const [ blo, bhi ] = metrics_bounds(body.math)
    const height = metrics_height(deco.math)
    const items = [ body, deco, note?.item ].filter(item => item != null)
    const width = max(items.map(item => item.math.advance)) ?? 0

    // stack outward from the body, whose anchor the whole group keeps; the
    // decoration is anchored at its middle, so it is placed by its far edge
    const edge = over ? blo - kern - height : bhi + kern
    const placed: Placed[] = [
        { item: body, x: 0, y: 0, width, align: 'center' },
        { item: deco, x: 0, y: edge + 0.5 * height, width, align: 'center' },
    ]
    if (note != null) {
        const [ nlo, nhi ] = metrics_bounds(note.item.math)
        const y = over ? edge - note.kern - nhi : edge + height + note.kern - nlo
        placed.push({ item: note.item, x: 0, y, width, align: 'center' })
    }
    return place_items(placed, [ 0, 0 ], klass)
}

// \xrightarrow and friends: the arrow is the base, sitting on the math axis,
// with its labels riding at script size just clear of it
const XARROW_KERN = 0.111  // 2 mu between the arrow and its labels, from amsmath
const XARROW_PAD = 0.5     // beside the labels: katex's .x-arrow-pad is 0.5em a side

function convert_xarrow(tree: TreeXArrow, ctx: ConvertCtx): WithMath {
    const { label, body: body0, below: below0 } = tree
    const { attr, style } = ctx
    const up_style = sup_style(style)
    const down_style = sub_style(style)
    const above = scale_math(convert_tree(body0, ctx_style(ctx, up_style)), relative_scale(style, up_style))
    const below = below0 != null
        ? scale_math(convert_tree(below0, ctx_style(ctx, down_style)), relative_scale(style, down_style))
        : null

    const wide = max([ above.math.advance, below?.math.advance ?? 0 ]) ?? 0
    const arrow = new MathStretch({ label, advance: wide + 2 * XARROW_PAD, ...attr })
    const height = metrics_height(arrow.math)
    const width = max([ arrow.math.advance, wide ]) ?? 0

    // the arrow straddles the axis, which is where its anchor already sits
    const placed: Placed[] = [ { item: arrow, x: 0, y: 0, width, align: 'center' } ]

    // the label above hangs from its baseline, so an ordinary descender drops
    // into the gap; only a deep one is pushed clear (amsmath's rule)
    const [ , depth ] = baseline_extents(above)
    const drop = depth > 0.25 ? depth : 0
    const base_y = -0.5 * height - XARROW_KERN - drop
    placed.push({ item: above, x: 0, y: base_y - MATH_AXIS * above.math.scale, width, align: 'center' })
    if (below != null) {
        const [ llo ] = metrics_bounds(below.math)
        placed.push({ item: below, x: 0, y: 0.5 * height + XARROW_KERN - llo, width, align: 'center' })
    }
    return place_items(placed, [ 0, 0 ], 'mrel')
}

// \overbrace and \underbrace, with the script that may be wrapped around them:
// LaTeX passes the brace like an operator with \limits, so a sup on an
// overbrace (or a sub on an underbrace) becomes the brace's label rather than
// an ordinary script
function convert_horiz_brace(tree: TreeHorizBrace, note: TreeNode | null, ctx: ConvertCtx): WithMath {
    const { isOver, base } = tree
    const { attr, style } = ctx

    // the label is converted in the script style it was written as; HorizBrace
    // scales it to script size
    const note_style = isOver ? sup_style(style) : sub_style(style)
    const label = note != null ? convert_tree(note, ctx_style(ctx, note_style)) : null

    // TeX sets the braced body in display style, so operators take limits and
    // fractions stay full size
    const body = convert_tree(base, ctx_style(ctx, is_script_style(style) ? style : 'display'))
    return new HorizBrace({ children: [ body ], label, over: isOver, style, ...attr })
}

// which of a phantom body's dimensions survive
const PHANTOM_KEEP: Record<string, { h: boolean, v: boolean }> = {
    phantom: { h: true, v: true },
    hphantom: { h: true, v: false },
    vphantom: { h: false, v: true },
}

function convert_tree(tree: Tree | TreeNode | null, ctx: ConvertCtx): WithMath {
    if (tree == null) return EMPTY_MATH
    const { attr, style } = ctx

    if (is_array(tree)) {
        const row = new MathText({ children: tree.map(node => convert_tree(node, ctx)), style })
        return row.children.length > 0 ? row : EMPTY_MATH
    }

    if (is_object(tree)) {
        const { type } = tree

        if (type == 'mathord' || type == 'textord') {
            const { mode, text } = tree
            return new MathSymbol({ children: [ text ], mode, ...symbol_attr(mode, ctx) })
        } else if (type == 'atom') {
            const { mode, text, family } = tree
            return new MathSymbol({ children: [ text ], mode, family, ...symbol_attr(mode, ctx) })
        } else if (type == 'ordgroup') {
            // a braced group is a single Ord atom for spacing (TeX Rule 20)
            return convert_atom(tree.body, ctx, 'mord')
        } else if (type == 'op') {
            const { name, body, limits } = tree
            // \overset and friends make an operator out of an arbitrary body
            if (name == null) return convert_atom(body ?? null, ctx, 'mop')
            if (name in OIINT_BASE) return convert_oiint(name, limits, ctx)
            return new MathOp({ children: [ name ], style, limits, ...attr })
        } else if (type == 'text') {
            // \textbf and friends compose with the text face already in force
            const { body, font } = tree
            const text_face = font != null ? text_font_family(font, ctx.text_face ?? attr.font_family as string | undefined) : undefined
            if (font != null && text_face == null) {
                strictError('font', `no font family mapped for '${font}'`)
            }
            return convert_tree(body, text_face == null ? ctx : { ...ctx, text_face })
        } else if (type == 'font') {
            const { font, body } = tree
            const font_family = TEX_FONT_FAMILY[font]
            if (font_family == null) {
                strictError('font', `no font family mapped for '${font}'`)
            }
            return convert_tree(body, font_family == null ? ctx : ctx_attr(ctx, { font_family }))
        } else if (type == 'accent') {
            const { label, base: base0, isStretchy } = tree

            // a stretchy accent has no glyph: it is drawn to the body's width.
            // katex also calls \widehat and \widetilde stretchy, but those do
            // have glyphs, so only take this path for shapes we draw
            if (isStretchy && stretch_entry(label) != null) {
                const body = convert_tree(base0, ctx_style(ctx, cramped_style(style)))
                return place_stretch(body, label, true, 0, attr)
            }
            const base = convert_tree(base0, ctx)
            return new Accent({ children: [ base ], label, mode: tree.mode, ...attr })
        } else if (type == 'kern') {
            const { dimension } = tree
            const em = measurement_to_em(dimension)
            return new MathSpacer({ advance: em })
        } else if (type == 'spacing') {
            const { mode, text } = tree
            const entry = get_symbol_entry(mode, text)
            if (entry?.replace == null) return EMPTY_MATH
            return new MathSymbol({ children: [ text ], mode, ...attr })
        } else if (type == 'mclass') {
            return convert_atom(tree.body, ctx, tree.mclass)
        } else if (type == 'lap') {
            // zero-advance box with content overhanging right (rlap), left (llap), or both (clap)
            const { alignment, body } = tree
            const inner = seal_math(convert_tree(body, ctx))
            const [ xlo, xhi ] = metrics_hrange(inner.math)
            const shift = alignment == 'rlap' ? 0 : alignment == 'llap' ? -inner.math.advance : -0.5 * inner.math.advance
            return with_math(inner, { advance: 0, hrange: [ xlo + shift, xhi + shift ] })
        } else if (type == 'htmlmathml') {
            // katex renders these differently for html and mathml; follow html
            const { html } = tree
            return convert_tree(html, ctx)
        } else if (type == 'styling') {
            const { style: style1, body } = tree
            const inner = seal_math(convert_tree(body, ctx_style(ctx, style1)))
            return scale_math(inner, relative_scale(style, style1))
        } else if (type == 'supsub') {
            const { base: base0, sup: sup0, sub: sub0 } = tree

            // a brace swallows the script as its label
            if (base0 != null && is_object(base0) && base0.type == 'horizBrace') {
                return convert_horiz_brace(base0, sup0 ?? sub0 ?? null, ctx)
            }

            // \operatorname* (and the macros built on it) stacks its scripts as
            // limits, but only in display style, like any other operator
            if (base0 != null && is_object(base0) && base0.type == 'operatorname' && base0.alwaysHandleSupSub) {
                const base = convert_operatorname(base0, ctx)
                const sup = sup0 ? convert_tree(sup0, ctx_style(ctx, sup_style(style))) : null
                const sub = sub0 ? convert_tree(sub0, ctx_style(ctx, sub_style(style))) : null
                const limits = style_size(style) == 'display'
                return new SupSub({ children: [ base ], sup, sub, style, limits, ...attr })
            }

            // \overset, \underset and \stackrel always stack their scripts as
            // limits, whatever the style
            const stacked = base0 != null && is_object(base0) && base0.type == 'op' && base0.name == null && base0.limits
            const limits = stacked ? { limits: true } : {}

            const base = convert_tree(base0, ctx)
            const sup = sup0 ? convert_tree(sup0, ctx_style(ctx, sup_style(style))) : null
            const sub = sub0 ? convert_tree(sub0, ctx_style(ctx, sub_style(style))) : null
            return new SupSub({ children: [ base ], sup, sub, style, ...limits, ...attr })
        } else if (type == 'genfrac') {
            const { mode = 'math', numer: numer0, denom: denom0, hasBarLine = true, leftDelim, rightDelim } = tree
            const numer = convert_tree(numer0, ctx_style(ctx, frac_num_style(style)))
            const denom = convert_tree(denom0, ctx_style(ctx, frac_den_style(style)))
            const frac = new Frac({ children: [ numer, denom ], has_bar: hasBarLine, style, ...attr })
            if (leftDelim != null || rightDelim != null) {
                // TeX Rule 15e: a generalized fraction's delimiters have a fixed
                // size by style rather than fitting the body, as in \binom
                const height = style_size(style) == 'display' ? TEX.delim1 : style_size(style) == 'text' ? TEX.delim2 : TEX.delim2_script
                return new Bracket({ children: [ frac ], left_delim: leftDelim, right_delim: rightDelim, height, mode, ...attr })
            }
            return frac
        } else if (type == 'underline') {
            const { body: body0 } = tree
            const body = convert_tree(body0, ctx)
            return new Underline({ children: [ body ], style, ...attr })
        } else if (type == 'overline') {
            const { body: body0 } = tree
            const body = convert_tree(body0, ctx_style(ctx, cramped_style(style)))
            return new Overline({ children: [ body ], style, ...attr })
        } else if (type == 'sqrt') {
            const { body: body0, index: index0 } = tree
            const body = convert_tree(body0, ctx_style(ctx, cramped_style(style)))
            const index = index0 ? convert_tree(index0, ctx_style(ctx, 'scriptscript')) : null
            return new Sqrt({ children: [ body ], index, style, ...attr })
        } else if (type == 'accentUnder' && stretch_entry(tree.label) != null) {
            const { label, base: base0 } = tree
            const body = convert_tree(base0, ctx)
            return place_stretch(body, label, false, Math.max(STRETCH_UNDER_KERN, label == '\\utilde' ? 0.12 : 0), attr)
        } else if (type == 'xArrow' && stretch_entry(tree.label) != null) {
            return convert_xarrow(tree, ctx)
        } else if (type == 'operatorname') {
            return convert_operatorname(tree, ctx)
        } else if (type == 'horizBrace') {
            return convert_horiz_brace(tree, null, ctx)
        } else if (type == 'array') {
            const {
                body, cols, arraystretch = 1, addJot, rowGaps, hLinesBeforeRow,
                hskipBeforeAndAfter, colSeparationType,
            } = tree

            // {smallmatrix} separates columns by \thickspace rather than
            // \arraycolsep, measured in the outer em
            const colsep = colSeparationType == 'small'
                ? ARRAY_SMALL_SEP * relative_scale(style, 'script')
                : undefined

            // katex hands cells over already wrapped in the environment's style
            const rows = (body ?? []).map(row => row.map(cell => convert_tree(cell, ctx)))
            const rowgaps = (rowGaps ?? []).map(gap => gap == null ? null : measurement_to_em(gap))

            return new MathArray({
                children: rows, cols: cols as ArrayCol[] | undefined, stretch: arraystretch,
                jot: addJot, colsep, outer: hskipBeforeAndAfter, hlines: hLinesBeforeRow,
                rowgaps, ...attr,
            })
        } else if (type == 'leftright') {
            const { mode, body: body0, left, right } = tree
            const body = convert_tree(body0, ctx)
            return new Bracket({ children: [ body ], left_delim: left, right_delim: right, mode, ...attr })
        } else if (type == 'delimsizing') {
            // \big ... \Bigg: a delimiter of fixed size, in the class the command
            // says (\bigl is an opener, \bigm a relation, \big an ordinary atom)
            const { size, mclass, delim: delim0, mode } = tree
            const delim = normalize_delim(delim0)
            if (delim == null) return with_math(new MathSpacer(), { left: mclass, right: mclass })
            const side = mclass == 'mclose' ? 'right' : 'left'
            const glyph = sized_delim(delim, side, size, { ...attr, mode })
            return with_math(glyph, { left: mclass, right: mclass })
        } else if (type == 'color') {
            // a colour is a fragment: its items still space against their neighbours
            return convert_tree(tree.body, ctx_attr(ctx, { color: tree.color }))
        } else if (type == 'sizing') {
            // \tiny ... \Huge scale their body relative to the size in force
            const { size, body } = tree
            const multiplier = SIZE_MULTIPLIERS[size - 1] ?? 1
            const inner = seal_math(convert_tree(body, { ...ctx, size: multiplier }))
            return scale_math(inner, multiplier / ctx.size)
        } else if (type == 'mathchoice') {
            const { display, text, script, scriptscript } = tree
            const size = style_size(style)
            const branch = size == 'display' ? display : size == 'text' ? text : size == 'script' ? script : scriptscript
            return convert_tree(branch, ctx)
        } else if (type == 'phantom' || type == 'hphantom' || type == 'vphantom') {
            const inner = seal_math(convert_tree(tree.body, ctx))
            return phantom_math(inner, PHANTOM_KEEP[type])
        } else if (type == 'smash') {
            const { body, smashHeight, smashDepth } = tree
            const inner = seal_math(convert_tree(body, ctx))
            return with_math(smash_math(inner, smashHeight, smashDepth), { left: 'mord', right: 'mord' })
        } else if (type == 'rule') {
            // a filled box of the given width and height, its bottom `shift`
            // above the baseline
            const { width: width0, height: height0, shift: shift0 } = tree
            const width = measurement_to_em(width0)
            const height = measurement_to_em(height0)
            const shift = shift0 != null ? measurement_to_em(shift0) : 0
            const [ ylo, yhi ] = [ MATH_AXIS - shift - height, MATH_AXIS - shift ]
            if (width <= 0 || height <= 0) {
                return with_math(new MathSpacer({ advance: Math.max(width, 0), vrange: [ ylo, yhi ] }), { left: 'mord', right: 'mord' })
            }
            const rule = new MathRule({ advance: width, thickness: height, ...attr })
            return place_items([ { item: rule, x: 0, y: 0.5 * (ylo + yhi) } ], [ 0, 0 ], 'mord')
        } else if (type == 'raisebox') {
            const { dy, body } = tree
            const inner = seal_math(convert_tree(body, ctx))
            return place_items([ { item: inner, x: 0, y: -measurement_to_em(dy) } ], [ 0, 0 ], 'mord')
        } else if (type == 'vcenter') {
            // re-anchor the body so it is centred on the axis
            const inner = seal_math(convert_tree(tree.body, ctx))
            const [ lo, hi ] = metrics_bounds(inner.math)
            return place_items([ { item: inner, x: 0, y: -0.5 * (lo + hi) } ], [ 0, 0 ], 'mord')
        } else if (type == 'hbox') {
            return convert_tree(tree.body, ctx)
        } else if (type == 'pmb') {
            // poor man's bold: the body overprinted at a small offset
            const { mclass, body } = tree
            const inner = seal_math(convert_tree(body, ctx))
            const group = place_items([ { item: inner, x: 0, y: 0 }, { item: inner, x: 0.02, y: -0.01 } ], [ 0, 0 ], mclass)
            return with_math(group, { advance: inner.math.advance })
        } else if (type == 'cr') {
            // a line break outside an array: a no-op in display mode (as in
            // LaTeX), and gum lays out a single line in any case
            return EMPTY_MATH
        } else if (type == 'verb') {
            // verbatim text in the typewriter face; \verb* shows its spaces
            const { body, star } = tree
            const text = body.replace(/ /g, star ? '\u2423' : '\u00a0')
            return new MathSpan({ children: [ text ], font_family: 'KaTeX_Typewriter', ...attr })
        } else if (type == 'enclose') {
            return convert_enclose(tree, ctx)
        }
    }

    // fallback: empty space, silent unless strict
    const type = is_object(tree) ? tree.type : typeof tree
    strictError('node', `unsupported katex node type '${type}'`)
    return EMPTY_MATH
}

//
// katex parser and component
//

interface LatexArgs extends ElementArgs {
    inline?: boolean
    style?: MathStyle
    strut?: boolean
}

class Latex extends MathText {
    constructor(args: LatexArgs = {}) {
        const { children, inline, style = inline ? 'text' : 'display', strut = true, ...attr0 } = THEME(args, 'Latex')
        const tex = check_string(children)
        const [ spec, attr ] = spec_split(attr0)

        // parse and convert to math elements
        const elems = [ parse_math(tex, attr, style) ]

        // pass to MathText
        super({ children: elems, style, strut, ...spec })
        this.args = args
    }
}

class Tex extends Latex {
    constructor({ inline = true, ...args }: LatexArgs = {}) {
        super({ inline, ...args })
    }
}

//
// registration
//

// bind the math elements in evaluated JSX (the math fonts are registered by
// the fonts/math import above)
const MATH_ELEMS = {
    MathSpan, MathSymbol, MathOp, MathSpacer, MathRow, MathCol, MathBox, MathRule, MathArray, MathStretch, HorizBrace, MathText, SupSub, Frac, Underline, Overline, Sqrt, Accent, Bracket, Latex, Tex, TextMode,
}

registerElements(MATH_ELEMS)

//
// exports
//

export { MATH_ELEMS, MathSpan, MathSymbol, MathOp, MathSpacer, MathRow, MathCol, MathBox, MathRule, MathArray, MathStretch, HorizBrace, MathText, SupSub, Frac, Underline, Overline, Sqrt, Accent, Bracket, Latex, Tex, TextMode }
export type { MathClass, MathSpec, MathStyle, MathMetrics, FontFamily, MathSymbolArgs, MathOpArgs, MathTextArgs, TextModeArgs }
