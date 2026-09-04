# `@gum-jsx/math`

LaTeX math for [gum.jsx](https://github.com/CompendiumLabs/gum-jsx): the `Latex`/`Tex` elements
and the math layout elements behind them, the KaTeX faces, and standalone `mathToSvg`.
A pure, browser-safe library with no node-only dependencies (rasterizing, the `gum-tex` CLI,
the katex comparison script, and the math test examples all live in the batteries-included
`gum-jsx` package, `../gum-jsx`). It is an add-on to `@gum-jsx/core`: it exports `math`, an
`EnvPlugin` that an `Env` applies with `env.use(math)` (`gum.use(math)` for the default Env) to
get the math elements in evaluated JSX and the 18 KaTeX faces in its font registry. Importing
the package has no side effects; `mathToElement` applies the plugin itself to a copy of the Env
it is given.

## Layout

- `src/index.ts` - Package entry: re-exports the elements, fonts, `mathToElement`/`mathToSvg`, and the `math` plugin
- `src/elems.ts` - The math elements (`MathSpan`, `MathSymbol`, `MathArray`, `MathStretch`, `SupSub`, `Frac`, `Sqrt`, `Bracket`, `Latex`, `Tex`, `TextMode`, …) and the katex tree converter; ends with `MATH_ELEMS` and the plugin (`mathPlugin`, exported as `math`), which also carries `MATH_BINDINGS`, the KaTeX faces as globals
- `src/fonts.ts` - The KaTeX faces out of the `katex` package (`MATH_FONT_PATHS`, `MATH_FONT_FACES`, `MATH_FONT_PLUGIN`, `MATH_FONTS`, `loadMathFonts(env?)`, plus the `MATH_BASE_FONTS`/`MATH_EXTRA_FONTS` tiers and `loadBaseMathFonts(env?)`); the loaders register the faces with the Env first, so a host need not have used the plugin
- `src/symbols.ts` - katex's symbol table (de-flowed)
- `src/math.ts` - Standalone LaTeX → SVG (`mathToElement`, `mathToSvg`), browser-safe; `mathToElementAsync`/`mathToSvgAsync` load the base faces and fetch the extra ones on a `FontNotLoadedError` (browser on-demand loading)
- `src/types/katex.d.ts` - Types for katex's parser (`__parse`) and tree nodes
- `docs/katex.md` - How the katex parse tree is converted, the gotchas, and which test (`test/code/math_*.jsx` in `gum-jsx`) covers what
- `docs/design.md` - Design notes and roadmap for math rendering

Core is reached through its subpath exports: `@gum-jsx/core` (public API), `@gum-jsx/core/lib/*`
and `@gum-jsx/core/elems/*` (internals: `Context`, `spec_split`, `rawTextMetrics`, `THEME`,
`strictError`, …), `@gum-jsx/core/env` (`Env`, `resolveEnv`), and `@gum-jsx/core/fonts` (the font
registry). Core is a peer dependency (`^1.9.0`, versioned in lockstep): exactly one copy of core
may exist in a host, since the math elements subclass core's and are constructed against a core
`Env`. It is also a `devDependency` so the package typechecks on its own; in the `gum-org` bun
workspace both resolve to `../gum-jsx-core`.

Every element takes the `Env` it is built against in its args (`env`, see core's `CLAUDE.md`) and
reads its theme, strict flag and fonts from it, so the converter threads `env` through: it rides in
the `attr` bag of `ConvertCtx` (spread into every element the converter makes), helper functions
that take a body use `body.env`, and the ones that take none (`fit_glyph`, `radical_glyph`,
`build_accent_symbol`, `array_rule`, `normalize_math_leaf`, …) take an `env` parameter. A
construction site that drops it silently gets the default Env, which the `gum-jsx` test runner
catches (it walks every tree in strict mode and fails on an element with another Env).

## Commands

### Math CLI (`gum-tex`)

The LaTeX pipeline is exposed standalone via `src/math.ts` (`mathToElement`, `mathToSvg`; exported from `@gum-jsx/math`). Rasterizing lives in `gum-jsx` (`gum-jsx/render`: `mathToPng`, `mathToKitty`, on `@gum-jsx/node`), and the `gum-tex` CLI there (`../gum-jsx/scripts/tex.ts`) wraps both. By default output is sized naturally to the math at `font_size` pixels per em (with `padding` in em); `size` instead fits the math into an overall box:

```bash
# Render LaTeX to SVG/PNG (or kitty terminal image if no output/format given)
gum-tex '\frac{1}{2}' -o half.svg
gum-tex -S 32 -t dark -o eq.png < eq.tex
gum-tex 'E = mc^2' -s 400 -o emc.png   # fit into a 400px box
```

### Comparing against katex

`../gum-jsx/scripts/compare.ts` renders the same TeX three ways at the same pixels per em — gum
(`mathToPng`), katex's own HTML pipeline in headless Chromium (`renderToString` +
`katex.min.css`, which pulls in the KaTeX fonts), and real LaTeX (`pdflatex` with the
`standalone` class, rasterized by `pdftoppm` at `font_size · 72.27 / 10` dpi so a 10 pt em is
`font_size` px) — trims each to its ink, and stacks them in one PNG (or shows it in a kitty
terminal when no `-o` is given). It needs a Chromium binary on `PATH` (or `--chrome`/
`$GUM_CHROME`) and a TeX install (`--no-latex` skips that panel; it is skipped with a note if
`pdflatex` is missing, and shows the compile error when LaTeX rejects a katex-only command);
the trims and composite are node-canvas. This is the ground truth for layout questions the
metrics checks cannot see, like widths and stroke weights:

```bash
cd ../gum-jsx
bun scripts/compare.ts '\xrightarrow{f} \quad \frac{a}{b}' -o cmp.png
bun scripts/compare.ts -i -S 64 -F eq.tex --packages amsmath,amssymb,mathtools   # inline; extra LaTeX packages
```

Note `katex.min.css` sets `.katex { font-size: 1.21em }`; the script divides the page font size
by 1.21 so both renders share a scale.


### Testing

```bash
bun tsc --noEmit      # typecheck (follows the workspace symlink into core's sources)
```

The math examples (`test/code/math_*.jsx`) live in `gum-jsx` (`../gum-jsx`) and run with the rest
of the suite there: `bun test/run.ts` (add `--report` for the `test/report` browser). Strict
mode (`@gum-jsx/core/lib/strict`) turns the permissive rendering fallbacks into thrown errors:
unparseable TeX (`parse`), a katex node with no gum equivalent (`node`), an unknown command name
drawn verbatim (`symbol`), a TeX font command with no gum face mapped (`font`), and a character
missing from the resolved face (`glyph`). An example that deliberately exercises a fallback opts
out with a `@nostrict` comment. `docs/katex.md` lists which `math_*.jsx` file covers what.

## Math Elements

We use `katex` to parse LaTeX strings into an AST. This is then converted into gum.jsx elements and rendered to SVG. The `Latex` element is a wrapper that parses the LaTeX string and positions the element at the center of the rectangle.

`MathArray` implements katex's `array` node, which backs every tabular environment:
`matrix`/`pmatrix`/`bmatrix`/`vmatrix`/`Vmatrix`/`Bmatrix` (and their starred variants),
`smallmatrix`, `array`, `darray`, `cases`/`dcases`/`rcases`/`drcases`, `aligned`, `gathered`,
and `\substack` — plus `\\` row breaks, `\hline`/`\hdashline`, and `|`/`:` column
separators. It follows LaTeX's own metrics (`\arraystretch`, `\arraycolsep`, `\jot`, and
the per-row strut), so its height and depth match katex's to within a hundredth of an em.
From JSX it takes a flat list of cells plus `ncol` and reshapes them, the way `Grid` does,
since the JSX evaluator flattens nested array children.

`MathStretch` draws the stretchy decorations — `\overbrace`/`\underbrace`, the stretchy
over-accents (`\overrightarrow` and friends), all of `accentUnder`, and the `\x...`
extensible arrows — plus one fixed-size entry: `\vec`'s accent arrow (its U+20D7 is a
zero-advance combining glyph, so `Accent` draws it at the ink size of Computer Modern's,
0.442×0.197 em; katex uses a static SVG path there too). No font carries stretchable versions of any of these, so gum draws
them from a shape table keyed by katex's own label, using katex's `katexImagesData`
heights and minimum widths. The arrows are gum's own `Arrow`/`ArrowHead`/`Line`/`Arc`,
stroked in em: `MathShape.inner` (the base of every drawn shape) rebases the context's stroke
unit to its box's pixels per em (`ctx.clone({ unit })`), so `stroke_width: TEX.rule` is a TeX
rule at any font size and script-size arrows get proportionally thinner strokes. Heads are `ArrowHead`'s
open two-barb form with `arc: 92` (head depth/half-height = cot(arc/2) = 0.97, as measured on
Computer Modern's →) and `curve: 0.7` — `ArrowHead`'s barbs are circular arcs that leave the tip
turned toward the shaft by `curve * arc/2` and flare out (`curve = 1` is tangent to the shaft,
0 is straight; Computer Modern is about 0.7) — and `ArrowHead` takes `barb: 'left' | 'right'`
for harpoons. Note `Arrow`'s own `curve` bends the *shaft* (spline), while `arrow_curve` reaches
the heads via the `arrow_` prefix. Under-decorations get `STRETCH_UNDER_KERN` (0.1 em) of
clearance below the body; katex uses 0, which lets barb tips touch serif feet. Delimiters
(`fit_delim`, and the radical in `fit_radical`, both on `fit_glyph` over `SIZE_FONTS`) follow
TeX's rule: the first of Main, Size1…4 whose natural extent covers the requirement is used
unscaled, so they overshoot like TeX rather than being stretched (which would thicken the
glyph); only beyond Size4 is the glyph scaled, standing in for TeX's
extensible pieces. `Bracket` also takes `height`, a fixed total delimiter height in em that
ignores the body (TeX Rule 15e): the genfrac branch passes `TEX.delim1`/`delim2` for `\binom`
and friends, whose parentheses do not fit their contents. Braces,
groups and the `\utilde` tilde are still filled outlines (a centerline offset along its
normals in both directions). Two traps: a `Polygon`/`Line` maps its points through its
*own* context, so point-based pieces need the em `coord` explicitly — but `ArrowHead` and
`Arc` draw in their own unit box and are placed by `pos`/`size`, so they must *not* get
it. `\widehat`/`\widetilde`/`\widecheck` are stretchy to katex but do have glyphs, so the
converter only takes the drawn path for labels present in the shape table. Every drawn math
shape extends `MathShape` and resolves its colour with `shape_ink`: an explicit `fill`, else
the `color` in force, else the theme's ink (`MathShape` in `THEME_DARK`), so they follow the
text in dark mode; `MathArray`'s rules use the same rule.

`\operatorname` sets its body upright as a single Op atom, passing the upright face down
directly since gum cannot express katex's `withFont("mathrm")` through `TEX_FONT_FAMILY`.

Font commands flow down as `font_family` in the converter's `attr`: `TEX_FONT_FAMILY` is katex's
`fontMap` (`\mathbf` → `KaTeX_Main-Bold`, `\mathcal` → `KaTeX_Caligraphic`, …) and
`text_font_family` composes the `\text*` family/weight/shape, carried separately as `text_face` in
the `ConvertCtx` so it reaches only text-mode symbols (math inside `\text{}` keeps its face);
`TextMode` is the JSX element for literal `\text{}` (`family`/`bold`/`italic`), built as text-mode symbols without the parser. The plugin also binds the faces as
globals named by their commands (`mathbb`, `mathbf`, ...; `MATH_BINDINGS`) so JSX can say `font-family={mathbb}`. `MathSymbol` only honours
the requested face where it has the glyph (`resolve_font_override`), falling back to the symbol's
own face as katex does, which is also how `\boldsymbol` gets Math-BoldItalic letters and Main-Bold
operators. `\color` flows the same way as `color`; every `MathShape` takes it as a `fill` alias
so drawn shapes follow it.

A math box may draw outside the box it is laid out by: `hink` is the horizontal ink range when
it differs from `[0, width]` (`\rlap`, the cancel strokes) and `vink` the vertical one when it
differs from `[0, height]` (`\smash`, `\cancel` on a single character). `em_rect` gives the ink
rect, `em_bounds` the layout bounds (both in core's `lib/em.ts`), and `place_items`/`layout_em_row`
(core's `elems/em.ts`) place children by the former while stacking by the latter (`hull_overhang`). `MathOval` (the `\oiint` ring) and
`MathCancel` are `MathShape`s like `MathStretch`; `enclose_box` builds `\boxed`/`\fbox`/
`\colorbox` from a `MathBox` plus a stroked frame. Array rules and box frames are stroked in em
(`em_context`, the same stroke-unit rebase `MathShape.inner` does), so they thin with the style
like `MathStretch`'s arrows; each rule runs the full ink extent, `\hline`s across the outer
separators' overhang and separators down the top `\hline`'s, so the corners meet squarely.
`\tiny` … `\Huge` scale relative to the size in force, carried as `size` in the `ConvertCtx`
(`{ attr, style, size }`) that `convert_tree` threads through the conversion.

The goal is not always perfectly replicating what LaTeX/KaTeX do. We want the implementation to be simple and easy to understand, and to be able to use the full power of gum.jsx to create complex layouts.
