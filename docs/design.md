# Math Rendering in `gum.jsx`

This document describes how math rendering works (`src/elems.ts`), assesses the current design, and lays out a path for expanding capability and compatibility.

## Pipeline

Math rendering is a four-stage pipeline:

1. **Parse**: `Latex` calls KaTeX's internal parser (`__parse`) to turn a TeX string into KaTeX's parse tree. We use only the parser — none of KaTeX's layout or HTML/MathML emitters.
2. **Convert**: `convert_tree` walks the KaTeX AST and builds a tree of gum elements (`MathSymbol`, `SupSub`, `Frac`, `Sqrt`, `Accent`, `Bracket`, ...).
3. **Layout**: each math element computes its own *inline metrics* at construction time and lays out its children with explicit `rect`s in a local em-based coordinate system.
4. **Render**: the result is an ordinary gum `Group`/`Element` tree, so the standard `svg(ctx)` machinery renders it. Nothing downstream knows math is special.

The crucial property is that stage 3 produces plain gum elements. Math is not a separate rendering engine — it is a layout *protocol* layered on top of gum's existing rect/coord/aspect system.

## The inline metrics protocol

Every participant in math layout is a `WithMath<Element>` — a regular element carrying an extra `em: MathSpec` field, core's em metrics (`@gum-jsx/core/lib/em`) plus the TeX fields:

```typescript
type EmSpec = {
    width: number        // layout box width in em, x from 0 at the left edge
    height: number       // layout box height in em, y from 0 at the top
    anchor: number       // y of the anchor (the math axis), down from the top
    scale: number        // em of the content relative to the em these are stated in
    hink?: Limit         // horizontal ink range when it overhangs [0, width]
    vink?: Limit         // vertical ink range when it overhangs [0, height]
}

type MathSpec = EmSpec & {
    left: MathClass      // TeX atom class of the left edge (mord, mop, mbin, mrel, ...)
    right: MathClass     // atom class of the right edge
    italic: number       // superscript overhang past the width (TeX italic correction), usually 0
    skew?: number        // accent shift over a single character
}
```

This is TeX's `(width, height, depth)` box model plus atom classes, with one twist: instead of height/depth measured from a baseline, the box is measured from its top with the anchor marked in it. The anchor is the **math axis** (the line through the middle of `=` and the fraction bar), not the text baseline. `em_bounds` re-expresses the box relative to the anchor, and all horizontal layout aligns anchors at `y = 0`. The baseline of any item sits `MATH_AXIS = 0.25em` (times its style scale) below its anchor, so `baseline_extents` recovers TeX's *h* and *d* from any item when a rule needs them. The `italic` field is TeX's italic correction: superscripts (only) are shifted right by it, so scripts clear slanted glyphs like ∫ and *f*. Compound elements have `italic = 0`, matching TeX, where only character nuclei carry one.

**Glyph boxes are ink boxes.** A `MathSpan`'s box is the actual ink extent of its glyphs at their natural size — `x` is 0.43em tall with no depth, `d` is 0.69em, ∫ in the display font is 2.2em with its baseline placed so the ink centers on the axis. This is what TeX's TFM height/depth are, and it is what all of Appendix G assumes: rules like "keep the superscript's bottom above four-fifths of the x-height" or "push the subscript down if it would come within four rule-thicknesses of the superscript" are meaningless against uniform 1em line boxes. Non-glyph elements (a `Square`, a `Plot`) get a 1em box centered on the axis instead. Top-level `Latex` adds a zero-width **strut** (`STRUT`, one em centered on the axis, i.e. TeX's `\strut`) so a formula presented to the outside world is never shorter than a text line — `<Latex>x</Latex>` and `<Latex>y</Latex>` render at the same scale in equal frames — while internal rows stay ink-tight.

Key functions:

- `ensure_math(element)` lifts any gum element into the protocol (core's `ensure_em` plus the atom classes). A `Span` gets real font metrics; an arbitrary element (a `Square`, a `Plot`, anything) gets `width = aspect`, a one em height, and the anchor at its middle. **This is the mixing mechanism**: any gum element can appear mid-formula and will be sized to 1em and centered on the axis.
- `with_math(element, patch, args)` clones an element while updating its `MathSpec` — layout is done functionally, by re-wrapping children with explicit rects. **Important:** `clone` re-runs the element's constructor, so anything an element needs to survive layout must be produced *by its constructor* (from `args`), not patched onto an instance afterward. `MathSpan` builds its ink frame in its constructor for exactly this reason.
- `scale_math(element, s)` places an element at a smaller style: it multiplies the metrics by `s`, and because a `MathSpan`'s coordinate frame *is* its ink box, the glyph scales with the smaller rect it's given. Scaling is pure arithmetic — no font machinery.
- `place_math(placed)` (core's `place_items` plus an atom class) assembles explicitly positioned items (each an `{item, x, y}` in anchor coordinates) into an anchored group whose box is their union. `SupSub`, `Frac`, `Accent`, and operator limits all lay out through it.
- Text metrics come from `lib/text.ts`, which measures actual glyph geometry via opentype.js — ink bounds (`yMin`/`yMax`), advance, and italic overhang (`xMax − advance`) — not TeX font metric tables. Tall glyphs (taller than 1em) are normalized into a 1em line box by `normalizeTextMetrics` for text-layout purposes; `raw_vrange` records where the ink actually sits, and `MathSpan` inverts the normalization to recover natural-size ink metrics.

## Layout primitives

A few small primitives do all the geometric work:

- **`MathRow`** — horizontal concatenation (core's `layout_em_row`). Widths accumulate left to right; every child's anchor sits on `y = 0`; the row's box is the union of child bounds. This is TeX's `\hbox` with baseline alignment.
- **`MathCol`** — vertical stack. Children stack top-down at their natural heights; the column's anchor defaults to its vertical center.
- **`MathBox`** — padding/repositioning wrapper around a single child, preserving its anchor.
- **`MathRule`** / **`MathSpacer`** — the fraction bar and glue. Spacers can carry named widths (`thin`/`medium`/`thick`) from the TeX spacing table. Both have class `none`: like TeX glue and kerns they are transparent to inter-atom spacing and binary cancellation, so `a \quad + b` still spaces the `+` as a binary operator.
- **`place_items`** — explicit placement (see above), for anything that isn't a plain row or column.

`MathText` is `MathRow` plus TeX's horizontal spacing pass: it flattens children, runs **binary atom cancellation** (`cancel_binary_atoms`, the TeX rule that turns `mbin` into `mord` when a binary operator lacks an operand on either side), and inserts inter-atom glue from the classic spacing table (`SPACING_TABLE`, in `mu` units).

## Compound elements

Each implements the corresponding rule from Appendix G of *The TeXbook*, using the Computer Modern font parameters collected in the `TEX` constant (in em):

- **`SupSub`** — Rule 18. Scripts are scaled one style down and shifted from the base baseline by `sup1`/`sup2` and `sub1`/`sub2`, or further if the base is tall (`sup_drop` below its top, `sub_drop` below its bottom — so `d^2` rides higher than `x^2`, and scripts on a fraction hang from its edges). The superscript stays at least a quarter x-height clear of the baseline; when both are present they are kept `4 × rule` apart, and if the superscript had to be lowered for that it's raised back to four-fifths of the x-height. The superscript alone is shifted right by the base's italic correction, and `script_space` follows. With `limits: true` (Rule 13a, big operators in display style) the scripts are centered above and below the operator, split by half the italic correction, with the `bigop` clearances.
- **`Frac`** — Rule 15. Numerator and denominator baselines shift up/down by `num1`/`denom1` (display) or `num2`/`denom2` (text), and are pushed further apart if their ink would come within the clearance (3 rules display, 1 rule text) of the bar, which sits on the axis. Contents descend a style level in text style. A fraction is an `minner` atom, so it gets thin-space separation from ordinals as in TeX.
- **`Sqrt`** — a `MathBox` around the body plus a hand-drawn radical (`CoordLine` polyline scaled to the body box). The body box is floored to the strut line box, mirroring TeX's smallest fixed radical glyph; only taller bodies grow the radical. Because the radical is drawn, it stretches to *any* body size — no glyph assembly needed.
- **`Accent`** — Rule 12. Accent glyphs are designed to sit just above the x-height; the accent's ink bottom is placed at `max(base height, x-height) + accent_gap`, so it rises to clear tall bases (`\hat{d}`) and stays put on short ones (`\hat{x}`).
- **`Bracket`/`Delim`** — Rule 19. A `Delim` is a `MathSymbol` from the Main or `Size1`–`Size4` font with its ink centered on the axis (all KaTeX delimiter glyphs are designed that way). The required half-height is the body's extent above or below the axis, scaled by `delimiterfactor` (0.901) less `delimitershortfall`, and never smaller than the text-size glyph — so `\left( x \right)` gets ordinary parentheses. `fit_delim` picks the natural size nearest in log-scale, then `scale_math`s it to fit exactly; continuous scaling of a discretely-chosen glyph keeps stroke weight approximately right. A delimited group is an `minner` atom.

## Symbols and fonts

- `src/symbols.ts` is KaTeX's symbol table (de-flowed): TeX control sequence → font, atom family, and replacement character. `MathSymbol` looks up the entry, picks the font (`KaTeX_Math` italic for math-mode ordinals, `KaTeX_Main` otherwise, `KaTeX_AMS` for `\mathbb` etc.), and maps the family to an atom class.
- The KaTeX TTF fonts (Math Italic, Main, AMS, Size1–4) are bundled alongside the IBM Plex text fonts in `src/fonts/fonts.ts` and measured with opentype.js like any other font.
- Named operators (`\sin`, `\lim`) render as upright text; symbol operators (`\sum`, `\int`) are `MathOp` elements — a `MathSymbol` from `KaTeX_Size1` (text style) or `KaTeX_Size2` (display style) with `center: true`, which places the baseline so the ink is centered on the math axis (TeX Rule 13). The KaTeX operator glyphs are designed so this puts the baseline exactly 0.25em below the axis.

## Math styles

TeX's size regimes are threaded through conversion and layout as a `MathStyle`:

```typescript
type MathStyle = 'display' | 'text' | 'script' | 'scriptscript'
```

with fixed glyph scales 1 / 1 / 0.7 / 0.5. The style is a *construction-time parameter*, not a new element kind: every element's metrics are expressed in its own local em, and a parent placing a child in a smaller style simply multiplies the child's metrics by the relative scale (`scale_math`). Since rendering follows the metrics, scaling is pure arithmetic — no font machinery involved.

Style descent rules (TeX Appendix G, simplified):

- `SupSub` scripts descend one level (`script_style`: D,T → S; S,SS → SS — the scale bottoms out at 0.5 rather than shrinking geometrically).
- `Frac` contents descend in inline styles (`frac_style`: D → T at full scale; T → S; S,SS → SS).
- In script styles, `MathText` suppresses medium and thick inter-atom glue, keeping only thin spaces.
- In display style, symbol operators use the large-size font, and operators flagged `limits` in the AST place their scripts above/below (`SupSub` with `limits: true`).
- Display style also selects the display-style shift parameters (`sup1`, `num1`/`denom1`, wider fraction clearance).
- `\displaystyle` etc. (`styling` nodes) switch the style mid-formula.

Script and fraction placement follow TeX's rules verbatim (see *Compound elements*), with the Computer Modern parameters in the `TEX` constant. Where a rule needs a height or depth, `baseline_extents` derives it from the item's ink box and its style scale.

## Error handling

- A TeX parse failure renders the raw source in red — visible and debuggable.
- An unrecognized AST node type logs to the console and renders as an **empty spacer** — the content silently vanishes (e.g. a `pmatrix` today renders as nothing). This should become a visible inline error too.

---

# Assessment

## What is right

The core abstraction is sound, and worth keeping:

1. **Math as a protocol, not an engine.** `MathSpec` + `ensure_math` is exactly the right interface for the stated goal of mixing math and gum arbitrarily. Any element with an aspect participates in a formula; any formula is an element that participates in gum layout. No other math renderer has this property, and it falls out of a ~40-line protocol.
2. **Anchor-based vertical layout.** Storing the box with its anchor (rather than baseline height/depth) makes axis-centered alignment the default, which is what math wants, and generalizes cleanly to non-text elements that have no baseline — while `baseline_extents` gives back TeX's h/d whenever a rule wants them.
3. **Selective adoption of TeX wisdom.** The spacing table, atom classes, bin cancellation, symbol table, fonts, ink-based boxes, and the Appendix G placement rules with their font parameters are the parts of TeX that encode decades of typographic judgment — they are data and short formulas, cheap to adopt, and they are adopted. The parts *not* adopted (glyph assembly, exact TFM tables per glyph, cramped styles) are the parts that cost complexity for little visible return.
4. **Drawn rather than assembled stretchy shapes.** The `Sqrt` radical as a polyline is more elegant than TeX's multi-glyph assembly and stretches perfectly. This is the right instinct for `gum.jsx` and should be extended (stretchy accents, wide hats, braces, arrows) rather than walked back.
5. **Continuous delimiter fitting.** Discrete size choice + linear rescale is a good trade — simpler than KaTeX's stacked-glyph assembly and visually fine at moderate sizes.

## Two structural fixes (implemented)

The original renderer had two gaps that between them accounted for nearly every visible defect.

**No style context.** There was no notion of TeX's size regimes, so scripts were sized from the base glyph's height, nested scripts shrank geometrically past 0.5, integrals rendered at 1em, `\lim`/`\sum` limits sat beside instead of below, and full-size relation glue appeared inside subscripts. `MathStyle` threading fixed all of these with one construction-time parameter plus metrics arithmetic.

**Line boxes instead of ink boxes.** Every glyph carried a uniform 1em box (0.75 above the baseline, 0.25 below) regardless of its ink, so the layout could not tell `x` from `d`, or a superscript `2` from a superscript `y`. The symptoms were `x_0` looking like `x0`, superscripts too high and far from subscripts, and a `TALL_BASE` gate hacked in to stop the "ride higher on tall bases" rule from firing on every letter. Switching `MathSpan` to natural-size ink metrics let `SupSub`, `Frac`, `Sqrt`, `Accent`, and `Bracket` implement their Appendix G rules directly with TeX's own parameters, and deleted the by-eye constants. The strut restores the 1em-line-box guarantee where it matters — at the boundary with the rest of gum.

Refinements deliberately left out, in case they become worth doing:

- **Cramped styles** (used under fraction bars and radicals to lower superscripts slightly).
- **`genfrac` size overrides** (`\dfrac`/`\tfrac` carry an explicit style in the AST that could feed straight into the `style` prop).
- **Accent skew** — TeX shifts accents right over slanted letters using a per-glyph kern; we center on the advance.
- **`\vec` and wide accents** are still fallbacks (a scaled `→`; `\widehat` → `\hat`); they want to be drawn shapes.

## Coverage gaps (incremental, mostly easy)

These are additions to `convert_tree` plus small compounds, in rough order of value:

| Construct | AST type | Notes |
|---|---|---|
| Matrices/arrays | `array` | The big one — `pmatrix`, `cases`, `aligned`. A `MathTable` built from `MathRow`s/`MathCol`s with per-column alignment; `cases`/`pmatrix` wrap it in `Bracket`. Currently vanishes silently. |
| Text-mode spacing | `spacing` | `\text{for all }` drops its space today ("foralln"). Map to `MathSpacer`. |
| Over/underline | `overline`, `underline` | Trivial with `MathCol` + `MathRule`. |
| `\operatorname`, `\mathrm` etc. | `font`, `op` with body | `TEX_FONT_FAMILY` only knows `mathbb`; add `mathrm`, `mathbf`, `mathcal`, `mathsf`, `mathtt` (fonts already ship with KaTeX). |
| Explicit sizing | `delimsizing`, `sizing` | `\big` etc. — `Delim` already takes a `level`; just wire it. |
| Stretchy accents | `accent` (`isStretchy`) | `\widehat`, `\overbrace`: draw them (polyline/spline scaled to base width) in the `Sqrt` spirit, replacing the current fixed-glyph fallback. Also fixes `\vec`, which currently overlays a full-size → across the glyph. |
| Style/color nodes | `styling`, `color`, `phantom`, `rule` | `styling` becomes a `MathStyle` override; the rest are direct. |
| Line breaks | `cr` | Multi-line display math via `MathCol` with alignment (pairs with `array`). |

Unknown nodes should render a visible red placeholder (like the parse-error path) instead of an empty spacer.

## Smaller rough edges

- **Inline baseline integration is a fudge.** `MathText` shifts its coord by a constant `INLINE_SHIFT = -0.1` when `inline` is set (the `Tex` element). The real issue is that `Text`/`TextLine` has no baseline concept — lines are even VStacks — so math can't share a true baseline with surrounding prose. The `MathSpec` anchor machinery is exactly what `Text` layout would need; unifying them (giving `TextLine` anchor alignment) would delete the hack and improve mixed text generally. This is the most valuable *non-math* payoff of the math work.
- **`ensure_math` on non-text elements** centers them on the axis with a fixed 1em height. Consider letting arbitrary elements opt into the protocol declaratively — e.g. an `em` prop or a `MathBox`-style wrapper exposing `width`/`anchor` — so a diagram embedded in a formula can say "align my second row to the axis." The em record is now core's `EmSpec`, shared with the text elements, which is the first step of that.
- **Extreme delimiter sizes** (tall matrices) will get thin strokes from rescaling a Size4 glyph; if that starts to matter, draw large delimiters as paths (the `Sqrt` approach) rather than adding KaTeX's glyph-stacking.
- **`Span`'s `vshift` is applied inconsistently for tall glyphs** — metrics shift by `vshift` in box units, but `props` shifts the SVG baseline by `vshift × font_height`; these agree only when the glyph fits in 1em. `MathSpan` sidesteps this by choosing metrics that cancel `vshift` out entirely (its text `metrics.vrange` is a 1em box ending at the intended baseline, in the ink frame); a cleaner `Span` would remove the need.
- **Direct-JSX `MathText` is ink-tight**, unlike `Latex`, which struts. That's deliberate — a `MathText` inside a `Frac` must not strut — but a user composing `<MathText>` at top level may want `strut` on. It's a prop.

## Recommended sequence

1. ~~**`MathStyle` threading**~~ — done: script scale/shift rewrite in `SupSub`, display-size operators, over/under limits, script-style glue suppression, `styling` nodes.
1b. ~~**Ink metrics + Appendix G rules**~~ — done: `MathSpan` ink boxes, Rules 12/13/13a/15/18/19 with CM parameters, strut at the `Latex` boundary.
2. **`array` support + visible unknown-node errors** — largest compatibility win, and failures become diagnosable.
3. **Easy AST wins**: text-mode `spacing`, over/underline, font families, `delimsizing`.
4. **Drawn stretchy shapes**: `\widehat`, `\vec`, `\overbrace` as scaled paths.
5. **Baseline-aware `TextLine`** using the anchor protocol; delete `INLINE_SHIFT`.

None of these require abandoning the current architecture; all of them are extensions of the existing protocol. The design is right — it was under-parameterized (no style) and under-measured (line boxes instead of ink), both now fixed, and remains under-covered (AST breadth), not wrong.
