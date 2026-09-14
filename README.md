# gum-next-math

Math elements and TeX parsing for the Gum rewrite. This package implements
phases 1 and 2 of the [math roadmap](../docs/MATH.md), using KaTeX **0.16.47**
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
import { Box, Svg, LayoutPass, render_svg, px, em } from 'gum-next-core'
import { Latex, createMathFonts } from 'gum-next-math'

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

## Elements and layout

| Element | Behavior |
| --- | --- |
| `MathSpan` | Literal, shaped glyph run in an exact font face. |
| `MathSymbol` | Symbol lookup, font coverage/fallback, and atom classification. |
| `MathSpacer` | Signed `advance` length or named thin/medium/thick/quad/qquad glue. |
| `MathRule` | Axis-centered rule; default thickness `em(0.04)`. |
| `MathRow` | Grouped atom with explicit axis-aligned placement, no automatic glue. |
| `MathCol` | Vertical math composition with a gap and horizontal justification. |
| `MathBox` | Single-child padding, allocation, alignment, and reclassification. |
| `MathText` | Flattenable source sequence with TeX spacing and binary cancellation. |
| `Latex` | Display-style formula with an optional one-em strut, enabled by default. |
| `Tex` | Text-style counterpart to `Latex`. |

Nested `MathText` descriptions flatten before layout unless they specify sizing,
atom classes, a strut, or visible error handling. `MathRow`, `MathBox`, and TeX
brace groups remain atoms. Color changes in a sequence preserve operator
classification. See the [runnable reference pages](../gum-next-docs/topics/text/Math.md).

`Fragment.math` keeps signed advance, edge classes, italic correction, skew,
and character-nucleus information. Font advances, TeX italic corrections, and
actual outline ink are independent: rows consume glyph advance plus italic
correction exactly once. An ink overhang is not a substitute for TeX correction.
`baseline` and `math_axis` are vertical guides in pixels and may lie outside a
zero-sized logical box. Fragments remain immutable and physically nonnegative.

The pass transports all eight math styles and a size multiplier. Math-specific
lengths use the active math em; ordinary Gum sizing props use the inherited Gum
font size. Available widths are advisory. Exact widths allocate without scaling,
and overflow preserves the drawing. `Fit` explicitly scales a formula. Leave
padding inside an explicit `Svg` viewport when ink extends beyond the advance.

## Supported TeX

Symbols and aliases, atom classes, ordinary groups, named operators and
`\operatorname`, signed kerns/glue, color, local macros, plain `\text`, and basic
math font commands are implemented. All eighteen KaTeX faces are registered;
font aliases such as `mathrm`, `mathbf`, and `mathbb` are exported for JSX.

Scripts, fractions, roots, large operators/limits, scalable delimiters, arrays,
decorations, full text-font composition, and inline math within prose `Text`
remain in later phases. Standalone export helpers and a dedicated TeX CLI are
also deferred. Unknown syntax cannot silently vanish.

`MathError.kind` distinguishes `parse`, `unsupported`, `symbol`, and `glyph`
failures, with source/range details where available. Layout wraps these in
core's `LayoutError.cause`. Set `on_error: 'render'` to show a formula diagnostic;
resource failures and programming errors continue to throw. Parser warnings
default to errors and can be set to `warn` or `ignore`. This does not enable
unsupported nodes or trusted HTML commands.

## Verification

From the workspace root:

```sh
bun run test
bun run typecheck
bun run build
bun gum-next-math/scripts/check-browser.ts
bun run compare --suite -S 48 -o gum-next-math/out/comparison.png \
  --artifacts gum-next-math/out/comparison
bun run compare 'a\!b' --inline -S 96 -o /tmp/negative-glue.png
```

The comparison script adapts gum-1's tool. It rasterizes Gum outlines, captures
KaTeX HTML in Chromium, and runs `pdflatex` plus `pdftoppm`, at the same pixels
per em. It expands Gum's viewport to include ink before trimming, checks for
clipped reference images, retains optional artifacts, and labels errors while
returning a failing exit code. Chromium and the two TeX binaries are required;
`--no-latex` explicitly requests only Gum/KaTeX. LaTeX needs the `standalone`,
`amsmath`, `amssymb`, and `xcolor` packages. Child processes have a 30-second
timeout and run in temporary directories; pdflatex disables shell escape.

The browser check exercises the built editor bundle using a temporary localhost
server. It verifies that imports fetch no fonts, concurrent renders load each
face once, repeated renders reuse them, and formula failures permit recovery.

Visual comparison is not a pixel-equality test: outline rasterization and font
metrics have small differences. TeX color groups can also classify atoms
differently from KaTeX; Gum follows KaTeX's transparent color boundaries. Plain
text spacing inside math can differ from LaTeX's text fonts.

`bun scripts/update-font-data.ts` regenerates italic corrections from the pinned
KaTeX version. Review the parser adapter, symbol/skew data, tests, and comparison
gallery before changing that pin. See [third-party notices](THIRD_PARTY_NOTICES.md).
