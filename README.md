# @gum-jsx/math

LaTeX math for [gum.jsx](https://github.com/CompendiumLabs/gum.jsx). It adds the `Latex` and `Tex` elements (and the math layout elements behind them, such as `MathArray`, `Frac`, `Sqrt`, and `Bracket`) to `@gum-jsx/core`, ships the KaTeX fonts, and exposes the LaTeX pipeline standalone as a lightweight alternative to MathJax/KaTeX for server-side rendering.

## Installation

```bash
npm install @gum-jsx/core @gum-jsx/math
```

## Usage

Importing the package registers the math elements with core, so they are available in evaluated gum code:

```javascript
import '@gum-jsx/math'
import { evaluateGum } from '@gum-jsx/core/eval'
const svg = evaluateGum('<Latex>{"\\int_0^1 x^2 \\, dx"}</Latex>').svg()
```

In the browser, `await loadMathFonts()` (from `@gum-jsx/math`) before evaluating; in node the fonts are read from disk on first use.

## Math Rendering

The LaTeX pipeline is also available standalone as a lightweight alternative to MathJax/KaTeX for server-side math rendering. By default the output is sized naturally to the math at `font_size` pixels per em (plus optional `padding` in em); alternatively pass `size` (a number or `[width, height]`) to fit the math into a box of that size:

```javascript
import { mathToSvg } from '@gum-jsx/math'
import { mathToPng, mathToKitty } from '@gum-jsx/math/render'
const svg = mathToSvg('\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}', { font_size: 24 })
const png = mathToPng('e^{i\\pi} + 1 = 0', { font_size: 32, inline: true, padding: 0.5, background: 'white', scale: 2 })
const fit = mathToSvg('E = mc^2', { size: 400 })  // fit into a 400×400 box
```

Options: `inline` (text style rather than display style), `font_size` (px per em), `size` (overall box, overrides `font_size`), `padding` (em), `color`, `background`, `theme` (`light`/`dark`), and `scale` (raster scale factor for PNG). There is also `mathToElement`, which returns the `Svg` element itself.

The same is available from the command line with `gum-tex`:

```bash
gum-tex '\sum_{n=1}^\infty \frac{1}{n^2} = \frac{\pi^2}{6}' -o sum.svg
gum-tex -S 32 -t light -o euler.png < euler.tex
gum-tex 'E = mc^2' -s 400 -o emc.png   # fit into a 400px box
gum-tex 'E = mc^2'   # display in the terminal
```

| Option | Description | Default |
|--------|-------------|---------|
| `tex` | LaTeX source | `--file` or stdin |
| `-i, --inline` | Inline (text) style rather than display style | off |
| `-F, --file <file>` | Read LaTeX source from file | |
| `-s, --size <size>` | Overall size to fit the math into (overrides font size) | natural |
| `-S, --font-size <size>` | Font size in pixels | 100 |
| `-p, --padding <padding>` | Padding around the math in em | 0.25 |
| `-t, --theme <theme>` | Theme: `light` or `dark` | dark |
| `-c, --color <color>` | Text color | theme color |
| `-b, --background <color>` | Background color (`none` for transparent) | white for light theme |
| `-x, --scale <scale>` | Raster scale factor for PNG/kitty output | 1 |
| `-f, --format <format>` | Format: `svg`, `png`, `kitty` | auto |
| `-o, --output <output>` | Output file | stdout |

