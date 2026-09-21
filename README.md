# gum-jsx-math

Math elements and TeX parsing for the Gum rewrite. This package implements
phases 1–7 of the [math roadmap](../docs/MATH.md), using KaTeX **0.16.47**
for parsing and fonts, Gum for layout, and Fontkit for outline geometry.

## Use

Run `bun install` from the parent workspace. The CLI and editor already include
the math bindings:

```jsx
<Svg font-size={px(36)}>
  <Box padding={em(0.5)}>
    <Latex>{String.raw`\sin x+\cos y=\operatorname{rank}(A)`}</Latex>
  </Box>
</Svg>
```

For library use:

```ts
import { Box, Svg, LayoutPass, render_svg, px, em } from 'gum-jsx-core'
import { Latex, createMathFonts } from 'gum-jsx-math'

const fonts = createMathFonts()
const source = new Svg({ font_size: px(36), children:
  new Box({ padding: em(0.5), children: new Latex({ text: 'a+b=c' }) }) })
// Browser hosts preload; Bun also supports synchronous local loading on demand.
await fonts.load()
const pass = new LayoutPass({ fonts: { value: fonts, version: fonts.version } })
const svg = render_svg(pass.layout(source))
```

Core has no dependency on this package. Custom JSX hosts pass the package's
exports through `evaluate(code, { scope: math })`. Source construction performs
no parsing, font loading, or measurement. Font registration records asset URLs;
browser bundlers must support TTF imports. `loadBaseMathFonts(fonts)` loads the
seven base faces; `loadMathFonts(fonts)` loads all eighteen. Concurrent loads
share work and failed loads can be retried. Exported SVGs contain paths and do
not require page fonts. Notify a reused pass of font replacements with
`pass.set_resource('fonts', fonts, fonts.version)`.

## Standalone exports

```ts
import { px, em } from 'gum-jsx-core'
import { mathToElement, mathToSvg, mathToSvgAsync } from 'gum-jsx-math'

const tex = String.raw`\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}`
const source = mathToElement(tex, { font_size: px(36), padding: em(0.25) })
const svg = mathToSvg(tex, { font_size: px(36), title: 'Gaussian integral' })
const browserSvg = await mathToSvgAsync(tex, { font_size: px(36) })
```

`mathToElement` returns an immutable `Svg`. Construction performs no parsing or
font I/O; ordinary layout determines its natural viewport from the union of
logical size and visible ink. Negative extents are translated before clipping.
Each natural axis has a one-pixel floor, so empty and all-space formulas have a
valid export. Default typography is display style at `px(24)` with a strut;
`inline`, `style`, `strut`, `macros`, and error controls follow `Latex`.
An existing Gum element is also accepted as the source.

Use Gum lengths for `font_size` and `padding`, including unit strings such as
`"24px"`, `"0.25em"`, and `"4vh"`; `width` and `height` are explicit SVG pixel
dimensions, written as `px(320)` or `"320px"`, that shrink the completed formula
when necessary. Set
`fit: 'contain'` to permit enlargement or `fit: false` to retain clipping at the
original size. Inline prose continues to use `Tex` and
its ordinary typographic advance.

SVG helpers accept `title`, `background`, `id_prefix`, `precision`, `request`, and optional
caller-owned `fonts`/`pass`. Supplied resources must already register the math
faces; custom registrations are preserved. The helpers refresh a reused pass's
font version after replacement. Async helpers preload every registered face,
sharing concurrent loads and permitting retries. `mathToElementAsync` requires
caller-owned `fonts` or `pass` so you retain the preloaded resource used later
for layout. Synchronous SVG helpers also accept a custom font provider through
a pass; its host is responsible for preloading.

```sh
bun run gum-tex 'e^{i\pi}+1=0' -S 48 -p 0.25 -o /tmp/euler.png --ratio 2
bun run gum-tex -i formula.tex -f svg
bun run gum-tex 'x^2' --fit -W 320
```

PNG/kitty output stays in the host packages. See the
[standalone export guide](../gum-jsx-docs/docs/gallery/text/MathExport.md) for all
options, browser loading, PNG library composition, and runnable sizing examples.

## Elements and layout

| Element | Behavior |
| --- | --- |
| `MathSpan` | Literal, shaped glyph run in an exact font face. |
| `MathSymbol` | Symbol lookup, font coverage/fallback, and atom classification. |
| `MathSpacer` | Signed `advance` length or named thin/medium/thick/quad/qquad glue. |
| `MathRule` | Axis-centered rule; default thickness `em(0.04)`. |
| `MathRow` | Grouped atom with explicit axis-aligned placement, no automatic glue. |
| `MathCol` | Vertical math composition with a gap and horizontal justification. |
| `MathArray` | Natural columns, row baselines, cell styles, gaps, struts, and solid/dashed rules. |
| `MathBox` | Single-child padding, allocation, alignment, and reclassification. |
| `MathText` | Flattenable source sequence with TeX spacing and binary cancellation. |
| `Latex` | Display-style formula with an optional one-em strut, enabled by default. |
| `Tex` | Text-style counterpart to `Latex`. |
| `MathOp` | Upright names, large glyph operators, and explicit limit policies. |
| `SupSub` | Side scripts or limits with TeX style descent and italic correction. |
| `Frac` | Fractions, no-bar/continued forms, custom rules, and binomials. |
| `Sqrt` | Cramped radicands, scriptscript indices, and vertically growing surds. |
| `Bracket` | Measured left/middle/right delimiter groups and fixed levels. |
| `TextMode` | Literal text runs, preserved spaces and kerning, and nested math. |
| `Accent`, `Overline`, `Underline` | Fixed/wide accents and rules with baseline and script attachment. |
| `MathStretch`, `HorizBrace`, `XArrow` | Drawn horizontal shapes, braces, and arrows with labels. |
| `Phantom`, `Smash`, `Lap` | Independently suppress ink, vertical dimensions, or advance. |
| `Enclose` | Frames, backgrounds, cancellation, and strikeout. |
| `RaiseBox`, `VCenter`, `Pmb` | Vertical shifts, axis centering, and overprinted bold. |

Nested `MathText` descriptions flatten before layout unless they specify sizing,
atom classes, a strut, or visible error handling. `MathRow`, `MathBox`, and TeX
brace groups remain atoms. Color changes in a sequence preserve operator
classification. See the [runnable reference pages](../gum-jsx-docs/docs/gallery/text/Math.md).

`Fragment.math` keeps signed advance, edge classes, italic correction, skew,
and character-nucleus information. Font advances, TeX italic corrections, and
actual outline ink are independent: rows consume glyph advance plus italic
correction exactly once. An ink overhang is not a substitute for TeX correction.
`baseline` and `math_axis` are vertical guides in pixels and may lie outside a
zero-sized logical box. Fragments remain immutable and physically nonnegative.

The pass transports all eight math styles, a size multiplier, and an optional
TeX size index. `size_index` selects the `\tiny`…`\Huge` font-size table, including
its script sizes; `MathText.choices` is the direct JSX counterpart of `\mathchoice`.
Automatic rows preserve baselines across size changes; explicit `MathRow`
composition aligns axes. Math-specific
lengths use the active math em; ordinary Gum sizing props use the inherited Gum
font size. Whole formulas automatically shrink into finite offers or own maxima,
without enlarging. Set `fit={false}` to retain unscaled layout and overflow.
Internal math allocations and inline formulas keep their normal typographic
scale. MathSpacer, MathRule, and MathStretch are allocation primitives and do not
automatically scale. Use explicit `fit` if their complete drawing should scale.
Percentage-sized Gum operands require a natural design size on the formula, or
`fit={false}` to use the parent's allocation. Leave padding inside an explicit
`Svg` viewport when ink extends beyond the advance, or use `mathToElement` for an
ink-safe export. Custom MathElement subclasses inherit automatic fitting.

## Supported TeX

Symbols and aliases, atom classes, ordinary groups, named operators and
`\operatorname`, signed kerns/glue, color, local macros, composed text, and
math font commands are implemented. Scripts, fractions and generalized fractions,
continued fractions, binomials, indexed roots, named/large operators, explicit
limits, style/size commands, `\mathchoice`, and left/middle/right or fixed-size
delimiters are supported. All eighteen KaTeX faces are registered;
font aliases such as `mathrm`, `mathbf`, and `mathbb` are exported for JSX.

Arrays and multiline environments are supported as described below. Accents,
wide hats/checks/tildes, over/under rules and decorations, labeled braces and
arrows, overset/underset/stackrel, phantom/smash/lap, enclosures/cancellation,
rules, raisebox, vcenter, hbox, verbatim, and poor-man's bold are implemented.
Standalone exports and the `gum-tex` CLI use the same layout. Unknown
syntax cannot silently vanish. See [decorations](../gum-jsx-docs/docs/gallery/text/MathDecorations.md),
[boxes](../gum-jsx-docs/docs/gallery/text/MathBoxes.md), and [fonts/macros](../gum-jsx-docs/docs/gallery/text/MathFonts.md).

Macros support arguments, declarations, and local scope within the pinned
parser. A supplied macro dictionary is snapshotted, and even `\gdef` cannot
leak into another formula. Optional `\newcommand` defaults are not supported
by KaTeX 0.16.47. Actual line breaks outside arrays are unsupported; a normal
display-mode `\\` is a no-op. The HTML math branch of `\html@mathml` is used
without enabling trusted HTML commands. `\phase`, `\angl`, and `\angln` remain
explicit unsupported enclosures.

`limits: 'auto'` stacks limits in display style; `'always'` forces stacking and
`'never'` keeps side scripts. Operator glyphs use TeX logical height/depth while
retaining independent outline ink. Fraction bars inherit the formula color;
explicit TeX point dimensions retain their size in scripts.
The adapter restores explicit controls on `\operatorname` as well, including
inside macros; KaTeX's AST otherwise drops some of those controls.

Delimiters try Main and Size1–4, skipping missing glyphs. Beyond the largest
glyph, ordinary fences scale uniformly; vertical bars and tall radicals keep
their width. Extensible-piece assembly is deferred. Root rules overlap the
surd to prevent a rasterization seam.

`MathError.kind` distinguishes `parse`, `unsupported`, `symbol`, and `glyph`
failures, with source/range details where available. Layout wraps these in
core's `LayoutError.cause`. Set `on_error: 'render'` to show a formula diagnostic;
resource failures and programming errors continue to throw. Parser warnings
default to errors and can be set to `warn` or `ignore`. This does not enable
unsupported nodes or trusted HTML commands.

## Mixed content

Core `Text` accepts generic inline elements. Use `Tex` for a text-style formula
inside prose; `Latex` retains its display-style default. A formula is indivisible,
shares the prose baseline, and expands its line using logical height/depth.
An oversized formula overflows at its original size. Styled spans pass font
size and color through, while math retains its own default faces.

Mixed arrays work in text boxes, bullet items, captions, and titles. A sole
element remains a block; wrap several elements without prose in `Text` for
inline layout. See the [paragraph examples](../gum-jsx-docs/docs/gallery/code/InlineMath.jsx).

In the other direction, math rows and compound operands measure ordinary Gum
elements through the same pass. An existing math axis wins, a text baseline
implies an axis using that element's own font size, and an unguided figure is
centered. Wrapping text needs an explicit width. Give plots concrete dimensions
and use `fit` to scale intentionally; embedding does not shrink them into a
script. See the [mixed formula examples](../gum-jsx-docs/docs/gallery/code/MathComposition.jsx).

`TextMode` strings are literal, including spaces and kerning. Source newlines
and tabs become spaces. Its `family`, `bold`, and `italic` controls select among
the bundled text faces without changing nested math fonts. Sans bold italic and
styled typewriter fall back to the corresponding Main face. Parsed text font
commands compose family, weight, shape, and emphasis with scoped resets. Literal
runs preserve kerning across compatible scopes and fall back per glyph; a glyph
absent from the fallback face is an error. Nested `$…$` math is supported.

## Arrays and multiline math

`MathArray` measures each cell naturally, then assigns shared column widths and
row baselines. It accepts nested `rows` data (including `null` empty cells), or
flat JSX children with `ncol`. A `cols` string such as `"r|c:l"` combines
alignment and rules; descriptors can supply explicit pre/post column gaps.
Use Gum lengths for `colsep`, `rowgaps`, and `thickness`. `stretch` changes row
struts, and `jot` adds leading only between rows. `small` selects the defaults
for a small matrix. See the [MathArray reference](../gum-jsx-docs/docs/elements/text/MathArray.md).

Cells can contain ordinary Gum elements with explicit dimensions. Offers do
not shrink a table; exact allocations preserve its geometry and report overflow.
A `Bracket` measures the finished table to select delimiters. Rule intersections
have precise ink bounds; outer separators can overhang the logical advance.

The supported environment inventory is:

| Family | Environments / variants |
| --- | --- |
| Arrays | `array`, `darray` with `l`/`c`/`r`, `|`/`:`, repeated separators, `\hline`, `\hdashline`, row gaps, and array stretch. |
| Matrices | `matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`, `Vmatrix`, and all six starred variants with optional `[l]`/`[c]`/`[r]`. |
| Cases | `cases`, `dcases`, `rcases`, `drcases`. |
| Small tables | `smallmatrix`, `subarray` with `{l}`/`{c}`, and the `\substack` macro. |
| Embedded multiline | `aligned`, `alignedat`, `gathered`, `split`. |
| Display-only | `align`, `align*`, `alignat`, `alignat*`, `gather`, `gather*`, `equation`, `equation*`. |

These 32 environments have named tests. Cells retain environment-specific math
styles, font resets, relation spacing, and leading. TeX row-gap units remain
distinct from Gum lengths, including in scripts. Array font resets select the
automatic math alphabet (`font_family: 'auto'`); local cell commands can override it.

Starred and unstarred display environments currently render without numbers.
Explicit `\tag` and the entire `CD` environment fail visibly; numbering and
commutative diagrams remain deferred. Optional positioning arguments on aligned
environments and general LaTeX column preambles are outside the pinned parser's
supported syntax. See [matrices](../gum-jsx-docs/docs/gallery/text/MathArrays.md) and
[aligned equations](../gum-jsx-docs/docs/gallery/text/AlignedMath.md).

## Verification

From the workspace root:

```sh
bun run test
bun run typecheck
bun run build
bun --filter @gum-jsx/math test:browser
bun run compare --suite -S 48 -o gum-jsx-math/out/comparison.png \
  --artifacts gum-jsx-math/out/comparison
bun run compare --suite 3 -S 48 -o gum-jsx-math/out/phase3.png
bun run compare --suite 3 --inline -S 48 -o gum-jsx-math/out/phase3-inline.png
bun run compare --suite 4 -S 48 -o gum-jsx-math/out/phase4.png
bun run compare --suite 4 --inline -S 48 -o gum-jsx-math/out/phase4-inline.png
bun run compare --suite 5 -S 48 -o gum-jsx-math/out/phase5.png
bun run compare --suite 5 --inline -S 48 -o gum-jsx-math/out/phase5-inline.png
bun run compare --suite 6 -S 48 -o gum-jsx-math/out/phase6.png
bun run compare --suite 6 --inline -S 48 -o gum-jsx-math/out/phase6-inline.png
bun run compare --suite 6-extra --no-latex -S 48 -o gum-jsx-math/out/phase6-extra.png
bun run compare --suite 7 -S 48 -o gum-jsx-math/out/phase7.png
bun run compare 'a\!b' --inline -S 96 -o /tmp/negative-glue.png
```

The comparison script adapts gum-1's tool. It rasterizes Gum outlines, captures
KaTeX HTML in Chromium, and runs `pdflatex` plus `pdftoppm`, at the same pixels
per em. It expands Gum's viewport to include ink before trimming, checks for
clipped reference images, retains optional artifacts, and labels errors while
returning a failing exit code. Chromium and the two TeX binaries are required;
`--no-latex` explicitly requests only Gum/KaTeX. LaTeX needs the `standalone`,
`amsmath`, `amssymb`, and `xcolor` packages. Array comparisons also use `mathtools`
for starred matrices/cases and some arrows/laps, `arydshln` for dashed rules,
and `nccmath` for `darray`. Typography comparisons use `cancel` and `ulem` too.
KaTeX pages are shifted to include leading overhang, and the LaTeX crop gets
extra border based on Gum's ink bounds so laps and smashes remain visible.
Display-only environments are wrapped as displays in the LaTeX document; the
inline suite omits those cases. Child processes have a 30-second
timeout and run in temporary directories; pdflatex disables shell escape.

The browser check exercises the built editor bundle using a temporary localhost
server. It verifies that imports fetch no fonts, concurrent renders load each
face once, repeated renders reuse them, and formula failures permit recovery.

Visual comparison is not a pixel-equality test: outline rasterization and font
metrics have small differences. TeX color groups can also classify atoms
differently from KaTeX; Gum follows KaTeX's transparent color boundaries. Plain
text spacing inside math can differ from LaTeX's text fonts. Size declarations
inside math follow KaTeX; standard LaTeX warns and ignores `\Huge` there.
Small matrices and substacks can differ from LaTeX in script font metrics.
Tall braces and matrix bars still use the existing glyph-scaling fallback,
so they differ from KaTeX/LaTeX's assembled delimiters. Dash patterns vary too.
Horizontal decoration curves are Gum's own; wide hats/checks/tildes use measured
width, including ordinary figure operands. Horizontal brace labels do not widen
the brace, and an opposite script is retained even where KaTeX drops it.
Frame padding includes the border, as in LaTeX; KaTeX's horizontal frame padding
is slightly narrower. Poor-man bold uses two overprints, whereas LaTeX uses three.

`bun scripts/update-font-data.ts` regenerates italic corrections from the pinned
KaTeX version. Review the parser adapter, symbol/skew data, tests, and comparison
gallery before changing that pin. See [third-party notices](THIRD_PARTY_NOTICES.md).
