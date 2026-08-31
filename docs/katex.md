# KaTeX coverage

What of KaTeX's command surface `src/elems.ts` renders, how, and what is still missing. gum parses TeX with katex's parser (`__parse`, katex 0.16.33 from `node_modules`) and converts the parse tree into gum math elements; this file is the map of that conversion. The test corpus that pins it down (`test/code/math_*.jsx` in the `gum-jsx` package) is listed at the end.

**Coverage.** 41 of katex's 57 parse-node types convert (nine more never leave the parser); all 33 environments lay out; every KaTeX face is loaded; 1480 of the 1487 entries in katex's math symbol table and 745 of the 749 text entries draw strictly (counting command names and their unicode aliases separately; big operators go through `MathOp`, `\oiint`/`\oiiint` through the oval overlay), the misses being glyphs no KaTeX face carries — `\origof`/`⊶`, `\imageof`/`⊷`, and thorn/eth in either mode. The gaps are `\middle`, `\tag`, the arrows of the `CD` environment, and three exotic enclosures — see *Outstanding* below. The suite runs 119 passed, 0 failed.

## How it works

**Parse.** `parse_math` calls katex with `displayMode` derived from the current math style — the AMS multiline environments (`align`, `gather`, `equation`, `split`, `alignat`, `subarray`) are gated on it in katex's *parser*, not its builder — and a `strict` handler that silences only `newLineInDisplayMode`. A parse failure renders the raw TeX in red.

**Convert.** `convert_tree(tree, ctx)` is a straight recursion over node types, with a `ConvertCtx { attr, style, size }` threaded down: `attr` carries anything that flows to every leaf — `font_family` from font commands, `color` from `\color`/`\textcolor` — `size` is the `\tiny` … `\Huge` multiplier in force, and `style` is one of TeX's eight styles (`display`/`text`/`script`/`scriptscript`, each optionally `-cramped`), which drives script and fraction placement and the 0.7/0.5 scaling of `scale_math`. Fragments (`color`, `mathchoice`, `hbox`, an unbraced `sizing` body) return a `MathText` whose items are spliced into the parent row, so they space against their neighbours as in TeX; anything that must behave as one atom is wrapped with `seal_math` (`convert_atom` is seal-and-reclass in one step, for `ordgroup`, `mclass`, `\operatorname` and the bodiless `op` of `\overset`).

**Elements.** The converter builds the same elements JSX can: `Latex`/`Tex` (a TeX string), `MathText` (a row of items, spacing and binary cancellation applied), `SupSub`, `Frac`, `Sqrt`, `Bracket`, `Accent`, `Underline`/`Overline`, `HorizBrace`, `MathArray`, `MathStretch`, the leaves `MathSymbol`/`MathOp`/`MathSpan`/`MathSpacer`/`MathRule`, and the layout boxes `MathRow`/`MathCol`/`MathBox` — that set, registered in `src/gum.ts`, is the public surface; `MathOval`, `MathCancel`, `Delim`, `RadicalSpan` and the bases are internal. A composite's child may be an element or a TeX string (`math_child` → `normalize_math_leaf` parses strings in the composite's style), so `<Frac>{'a'}{'b+1'}</Frac>` works. Composites placed from explicit positions extend `MathGroup` (it adopts a `place_items` group's children, frame and math box); everything drawn rather than set in a font extends `MathShape` (see *Drawn shapes*).

**Metrics.** Every element carries a `MathSpec`: the atom classes `left`/`right` (for inter-atom spacing and binary cancellation), `advance`, `vrange` and `vanchor` (the layout box about an anchor on the math axis), `italic` (superscript overhang), `scale` (so `baseline_extents` knows where a scaled item's baseline is), and two optional ink overhangs — `hrange`, the horizontal ink range when it differs from `[0, advance]` (`\rlap`, cancel strokes), and `vink`, the vertical one when it differs from `vrange` (`\smash`, `\cancel` on a single character). `metrics_bounds` is the layout box, `metrics_rect` the ink box; `place_items` and `layout_math_row` place children by the latter and stack by the former, and record the group's own overhang from the hull.

**Fonts.** `TEX_FONT_FAMILY` is katex's `fontMap` (`mathbf` → Main-Bold, `mathcal` → Caligraphic, …); `text_font_family` composes the `\text*` family, weight and shape so `\textbf{\textit{x}}` is bold italic and `\emph` toggles; the composed face travels as `text_face` in the `ConvertCtx`, separate from `attr.font_family`, and only text-mode symbols take it (`symbol_attr`), so `$x$` inside `\text{}` keeps its math face as in katex. `TextMode` is the JSX form of `\text{}` without the parser: it composes the face from `family`/`bold`/`italic` and makes one text-mode `MathSymbol` per character of each string child (a space is the `spacing` symbol, as the converter's `spacing` branch makes it), so the text is literal. `MathSymbol` honours a requested face only where it has the glyph (`resolve_font_override`), falling back to the symbol's own face as katex's `makeOrd` does — which is also how `\boldsymbol` gets Math-BoldItalic letters and Main-Bold operators, and why `\mathcal{a}` and `\mathbb{1}` come out in the default face rather than as notdef boxes. Faces are registered one name per file for measurement (`KaTeX_Main-Bold`) but emitted as base family plus `font-weight`/`font-style` (`fontFace`), which is how fontconfig and `katex.min.css` know them.

**Drawn shapes.** What no font carries is drawn: stretchy accents, extensible arrows and braces (`MathStretch`; `\overbrace`/`\underbrace` are `HorizBrace`, a `MathStretch` with a label placed by `place_stretch`), the `\oiint` ring (`MathOval`), cancel strokes (`MathCancel`), rules and array lines (`MathRule`, `array_rule`). All of them extend `MathShape`, which rebases the context's stroke unit to the box's own pixels per em (so strokes are given in em) and resolves the colour with `shape_ink` — an explicit `fill`, else the `color` in force, else the theme's ink — so they follow the text in dark mode; `MathArray`'s rules and `enclose_box`'s border use the same rule. Delimiters (`fit_delim`) and the radical (`fit_radical`) share `fit_glyph`, TeX's rule over `SIZE_FONTS`: the first of Main, Size1…4 whose natural extent covers the requirement, unscaled, and only beyond Size4 a stretched glyph (uniformly for delimiters, vertically only for the surd); `\big`…`\Bigg` feed katex's `sizeToMaxHeight` (1.2/1.8/2.4/3.0 em) into the same search.

**Arrays.** Every tabular environment is the one `array` node, implemented as `MathArray` with LaTeX's own metrics (`\arraystretch`, `\arraycolsep`, `\jot`, the per-row strut), and matches katex's height and depth to within 0.008 em across all of them. `\substack`, `\\` row breaks and `\\[len]`, `\hline`/`\hdashline`, `|`/`:`/`||` separators and `l`/`c`/`r` columns come with it.

**Strict mode** (`src/lib/strict.ts`). Every fallback is silent by default: parse errors become red text, an unhandled node an empty spacer, an unknown command name is drawn verbatim, a missing glyph is measured as `.notdef`. `strict: true` (on `evaluateGum`, `mathToSvg`/`mathToElement`, and `--strict` on `gum`/`gum-tex`) throws a `StrictError` of kind `parse`, `node`, `symbol`, `font` or `glyph` instead. `scripts/test.ts` renders strictly to decide pass/fail and permissively for the report; an example that means to exercise a fallback opts out with `@nostrict` (`math_parse_error.jsx` is the only one).

## Gotchas

- **katex version.** Parsing is 0.16.33; `\overbracket`, `\underbracket` and text-mode `·` exist only from 0.18.4, so they parse-error. A version bump, not a gap.
- **`\\` outside an array** is a no-op in LaTeX display mode and is dropped (`cr`); katex's warning for it is silenced at the parse call. Nothing else in katex's strict warnings is.
- **`\tag`** parses (because display mode is on) into an unsupported node and drops silently rather than showing red source.
- **Nested sizing** is relative to the size in force — `\tiny a \small b` sets b at 0.9, not 0.45 — the `sizing` branch converts its body with `size` set to the new multiplier and scales the result by the ratio to the enclosing one.
- **`\color` is a fragment**: `\color{red}{2 +} 3` spaces like `2 + 3`.
- **`\vert`/`\Vert`/`|`** have glyphs only in Main and Size1 (real TeX builds tall bars from extensible pieces), so `fit_delim` skips faces without the glyph and stretches the largest that has it.
- **`\boxed{x}`** is `\fbox{$\displaystyle{x}$}`, so its body arrives wrapped in text-mode styling nodes; `\hbox` bodies are text-style, so `\frac` inside `\vcenter{\hbox{…}}` is small unless written `\dfrac`.
- **Overhang is not clipping-safe.** A group's coord is its ink hull, so `hrange`/`vink` overhang draws; but `MathSpan` does not carry a glyph's own italic overhang as `hrange`, which is the big-operator clipping listed below.
- **`\mathbb` lowercase/digits, `\origof`/`\imageof`, thorn/eth** have no glyph in any KaTeX face; the first falls back to the default face, the rest draw `.notdef` — katex draws tofu for them too.
- **`\href` `\url` `\html*` `\includegraphics`** need katex's `trust` option; untrusted they arrive as `color` nodes and draw as error-coloured text, exactly as katex does.

## Outstanding

Needs new structure:

| gap | why |
| --- | --- |
| `\middle` | The delimiter is sized to the *enclosing* `\left…\right` body, so it cannot be built bottom-up. The fix: `leftright` splits its body on the middle nodes, converts each run, then fits left, middles and right against the combined extent. |
| `\tag` | Sets its number at the *margin* of the display, which needs a measure gum's naturally-sized math box does not have. Wants a display container that knows its width. |
| `CD` environment (`cdlabel`, `cdlabelparent`) | The array lays out; the arrows are per-cell stretchy arrows sized to their column and labelled above and below, plus vertical arrows spanning rows. New assembly, not a new shape. |
| script-style fraction and delimiter metrics | Script-style fractions drift from katex, and in script style katex's delimiter sequence can pick a text-size Main glyph larger than the local em, so `x^{\binom{n}{k}}` is ~0.3 em short. Accuracy work in `fit_delim`/`Frac`. |
| big-operator ink overhang | A row ending in `\oint` or `\iiint` (Size2) is clipped at the right: the glyph's ink runs past its advance and `MathSpan` does not carry that as `hrange`. Needs an ink-wide `coord`/`aspect` on `MathSpan` that still keeps the glyph at the left of its box. |

Won't fix: `\phase` `\angl` `\angln` (the three exotic `enclose` labels — steinmetz and actuarial angles; the body still renders and strict mode reports the dropped decoration), and the no-glyph symbols above.

## Tests

All in `test/code/`, one feature per file, run strictly by `bun scripts/test.ts` (119 passed, 0 failed; no false positives in `docs/` or `gala/`). Rows keep surviving anchor terms (`1 + … + 2`) so a dropped construct reads as a hole rather than a blank card. Nothing in *Outstanding* has a test today; a one-line `math_middle.jsx` with `\left( a \middle| b \right)` is the one to add back when that lands.

| file | covers |
| --- | --- |
| `math_delim_sizing.jsx` | `\big` `\Big` `\bigg` `\Bigg`, `l`/`r`/`m` variants, `\big.`, `\bigl<` |
| `math_enclose.jsx` | `\boxed` `\fbox` `\colorbox` `\fcolorbox` `\cancel` `\bcancel` `\xcancel` `\sout` |
| `math_phantom.jsx` | `\phantom` `\hphantom` `\vphantom` `\mathstrut` `\smash` `\smash[b]` |
| `math_sizing.jsx` | `\tiny` … `\Huge`, nested size changes |
| `math_color.jsx` | `\color` `\textcolor`, palette macros, colour reaching rules/braces/delimiters |
| `math_rule_verb.jsx` | `\rule` (with shift) `\vdots` `\verb` `\verb*` `\raisebox` `\TeX` `\LaTeX` `\KaTeX` `\dddot` |
| `math_font_families.jsx` | `\mathrm` `\mathbf` `\mathit` `\mathcal` `\mathfrak` `\mathscr` `\mathsf` `\mathtt` `\boldsymbol`, and the per-glyph fallbacks |
| `math_text_styles.jsx` | `\textbf` `\textit` `\texttt` `\textsf` `\emph`, and their composition |
| `math_text_accents.jsx` | `\'e` `` \`a `` `\^o` `\~n` `\"u` `\c c` `\v s` `\textcircled` `\copyright` |
| `math_glyph_gaps.jsx` | `\oiint` `\oiiint` at text and display size, against `\int`/`\iint`/`\oint` |
| `math_mathchoice.jsx` | `\bmod` `\pmod` `\mod` `\pod` `\colon` `\minuso` `\mathchoice` in display and script style |
| `math_overset.jsx` | `\overset` `\underset` `\stackrel` |
| `math_boxes.jsx` | `\vcenter` `\hbox` `\pmb` `\\` |
| `math_stretchy_accents.jsx` | `\overrightarrow` `\overleftrightarrow` `\overgroup` `\overlinesegment`, glyph accents |
| `math_accent_under.jsx` | `\underrightarrow` `\underleftrightarrow` `\undergroup` `\utilde` |
| `math_accent_scripts.jsx` | scripts on accented characters (`\hat{x}^2`, `\bar{y}_i^2`) attach to the character, not the accent |
| `math_accent_skew.jsx` | accents shift right by the character's skew (`\hat{f}`, `\hat{A}`, `\hat{\mathcal{A}}`) and take no width (`\vec{\imath}`) |
| `math_ext_arrows.jsx` | `\xrightarrow` `\xmapsto` `\xhookrightarrow` `\xrightleftharpoons` `\xrightequilibrium`, labels above and below |
| `math_operatorname.jsx` | `\operatorname` `\operatorname*` `\limsup` `\argmax` `\varlimsup` |
| `math_text_spacing.jsx` | spaces inside `\text{}` carry their advance |
| `math_horiz_brace.jsx` | `\overbrace` `\underbrace`, labels, nesting, minimum width |
| `math_array_matrix.jsx` | `pmatrix` `bmatrix` `vmatrix` `Vmatrix` `Bmatrix` `smallmatrix`, tall cells |
| `math_array_cases.jsx` | `cases` `aligned` `gathered` `substack` |
| `math_array_align.jsx` | `align` `alignat` `gather` `equation` `split` `subarray` (display-mode gated) |
| `math_array_rules.jsx` | `l`/`c`/`r` columns, `\|`/`:`/`\|\|` separators, `\hline` `\hdashline`, `\\[len]` |
| `math_symbol_sweep.jsx` | a dense grid of the 453 named math symbols that render (of 459), to catch font-table regressions |
| `math_infix_frac.jsx` | `\over` `\atop` `\above` `\choose` `\brace` `\brack` |
| `math_macros.jsx` | `\def` `\newcommand` `\let` `\char` |
| `math_lap.jsx` | `\mathllap` `\mathrlap` `\mathclap` |
| `math_class_spacing.jsx` | `\mathbin` `\mathrel` `\mathpunct` `\mathinner` spacing |
| `math_blackboard.jsx` | `\mathbb`/`\Bbb` over the blackboard capitals KaTeX_AMS carries |

The older files: `math_symbols` `math_negations` `math_accents` `math_spacing` `math_styles` (symbols and spacing); `math_supsub_basic` `math_supsub_nested` `math_supsub_shifts` `math_supsub_tall` `math_mix_supsub` (scripts); `math_frac_inline` `math_frac_display` `math_binom` (fractions); `math_sqrt` `math_brackets` `math_overline` `math_underline` (radicals, delimiters, rules); `math_op_inline` `math_op_display` `math_op_limits` `math_op_axis` `math_op_manual` `math_functions` (operators); `math_inline_text` `math_equation_full` `math_string_leaves` `math_mix_elements` `math_text_mode` (the JSX elements, string leaves, mixing with gum elements); `math_parse_error` (the red-text fallback, `@nostrict`). `scripts/compare.ts` (gum vs katex-in-Chromium vs pdflatex, same em) is the ground truth for anything the metrics cannot see.
