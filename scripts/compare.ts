#!/usr/bin/env bun
// Adapted from gum-1's scripts/compare.ts. Compare at the same pixels per em,
// retaining Gum's ink overhang before rasterizing. All three renderers must
// succeed; failed panels are visible and the command exits unsuccessfully.
import { Command, InvalidArgumentError } from 'commander'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createCanvas, Image } from 'canvas'
import type { Canvas } from 'canvas'
import katex from 'katex'
import { LayoutPass, px, make_fragment, make_size, make_point, make_rect,
  union_rects, place_fragment, render_svg } from 'gum-next-core'
import { rasterize_svg } from 'gum-next-png'
import { createMathFonts, Latex } from '../src'

const BASIC = [
  'a+b=c', '-x+a+-b', '(a+b)=c',
  String.raw`a{+}b+a\textcolor{red}{+}b`,
  String.raw`a\!b\quad ab\quad a\!+b`,
  String.raw`\sin x+\cos y=\operatorname{rank}(A)`,
  String.raw`\alpha+\beta\leq\Gamma\quad\mathbb{R}`,
  String.raw`\mathrm{speed}+\mathbf{F}=\mathit{f}`,
  'f+f=ff', String.raw`\text{if }a=b\text{ then }c=d`,
]
const ORDINARY = [
  String.raw`e^{i\pi}+1=0`,
  String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`,
  String.raw`\int_{-\infty}^{\infty}e^{-x^2}\,dx=\sqrt{\pi}`,
  String.raw`\sum_{n=0}^{\infty}\frac{x^n}{n!}`,
  String.raw`f_i^j+x^{y^{z^w}}`,
  String.raw`\frac{1}{1+\frac{1}{1+x}}\quad\cfrac{1}{1+\cfrac{1}{1+x}}`,
  String.raw`\binom{n}{k}\quad\genfrac{[}{]}{2pt}{}{a}{b}\quad{a\atop b}`,
  String.raw`\sqrt[3]{x}+\sqrt{\frac{a}{b}}`,
  String.raw`\left\{x\middle|\frac{1}{x}>0\right\}`,
  String.raw`\int\limits_0^1+\sum\nolimits_{i=0}^n+\lim_{x\to0}f(x)`,
  String.raw`\bigl(\Bigl[\biggl\{\Biggl\langle x\Biggr\rangle\biggr\}\Bigr]\bigr)`,
  String.raw`{\scriptstyle a+b}\quad{\Huge x^{y^z}}\quad\mathchoice{D}{T}{S}{Q}`,
]
const TEXT = [
  String.raw`\text{AV office}`,
  String.raw`\frac{\text{distance}}{\text{time}}`,
  String.raw`v_{\text{average}}=\frac{d_{\text{total}}}{t}`,
  String.raw`\text{if $x>0$ then }x^2>0`,
  String.raw`\text{a \textcolor{blue}{blue} word}+x`,
  String.raw`\text{100\% of }n\text{ samples}`,
  String.raw`\text{left }x\text{ right}\quad\sqrt{\text{area}}`,
]
const ARRAYS = [
  String.raw`A=\begin{pmatrix}a&bb\\ccc&d\end{pmatrix}`,
  String.raw`\begin{bmatrix}\frac1x&0\\0&\frac{a+b}{c}\end{bmatrix}`,
  String.raw`\begin{Bmatrix}a&b\\c&d\end{Bmatrix}\quad\begin{vmatrix}a&b\\c&d\end{vmatrix}\quad\begin{Vmatrix}a&b\\c&d\end{Vmatrix}`,
  String.raw`\begin{pmatrix*}[l]a&bb\\ccc&d\end{pmatrix*}\quad\begin{pmatrix*}[r]a&bb\\ccc&d\end{pmatrix*}`,
  String.raw`\begin{array}{lcr}a&&ccc\\[0.4em]dd&e&f\\[-0.2em]g&hh&i\end{array}`,
  String.raw`\begin{array}{|r||c:l|}\hline\hline a&\frac12&c\\[0.3em]\hdashline dd&e&f\\\hline\end{array}`,
  String.raw`{\def\arraystretch{1.5}\begin{array}{rl}a&=b\\c&=d\end{array}}`,
  String.raw`f(x)=\begin{cases}\frac1x&x>0\\0&x=0\end{cases}\quad\begin{dcases}\frac1x&x>0\\0&x=0\end{dcases}`,
  String.raw`\begin{rcases}a&x>0\\b&x<0\end{rcases}`,
  String.raw`\begin{aligned}a&=b&c&=d\\aa&+b&cc&-d\end{aligned}`,
  String.raw`\begin{alignedat}{2}a&=b&c&=d\\aa&=bb&cc&=dd\end{alignedat}`,
  String.raw`\begin{gathered}a+b=c\\\frac{1}{x}=y\end{gathered}`,
  String.raw`A=\left(\begin{smallmatrix}a&b\\c&d\end{smallmatrix}\right)`,
  String.raw`\sum_{\substack{i<n\\j<m}}a_{ij}\quad\sum_{\begin{subarray}{l}i<n\\j<m\end{subarray}}a_{ij}`,
  String.raw`\begin{gathered}x\end{gathered}=x`,
  String.raw`\mathbf{\begin{matrix}x&\mathbf{x}\\\sin x&\text{word}\end{matrix}}`,
]
const DISPLAY_ARRAYS = [
  String.raw`\begin{align*}a+b&=c\\a&=c-b\end{align*}`,
  String.raw`\begin{alignat*}{2}a&=b&c&=d\\aa&=bb&cc&=dd\end{alignat*}`,
  String.raw`\begin{gather*}a+b=c\\\frac1x=y\end{gather*}`,
  String.raw`\begin{equation*}\begin{split}a+b&=c\\a&=c-b\end{split}\end{equation*}`,
]
const TYPOGRAPHY = [
  String.raw`\hat{x}_i^2+\bar{f}_j+\vec{v}+\dot{x}+\ddot{x}+\mathring{A}`,
  String.raw`\acute{a}+\grave{a}+\breve{a}+\check{a}+\tilde{a}`,
  String.raw`\widehat{x}\quad\widehat{ABC}\quad\widehat{a+b+c+d}`,
  String.raw`\widetilde{x}\quad\widetilde{ABC}\quad\widetilde{a+b+c+d}`,
  String.raw`\overline{x+\frac1y}\quad\underline{x+\frac1y}`,
  String.raw`\overrightarrow{AB}\quad\overleftarrow{ABC}\quad\overleftrightarrow{a+b}`,
  String.raw`\underrightarrow{AB}\quad\underleftarrow{ABC}\quad\underleftrightarrow{a+b}`,
  String.raw`\overbrace{a+b+c}^{\text{a long label}}\quad\underbrace{\frac1x+\frac1y}_{n\text{ terms}}`,
  String.raw`\overbrace{x}^{n}_{i}\quad\underbrace{x}_{n}^{i}`,
  String.raw`A\xrightarrow[f^{-1}]{\text{a long map}}B\quad C\xleftarrow[g]{f}D`,
  String.raw`A\xleftrightarrow[b]{a}B\quad C\xmapsto{f}D`,
  String.raw`a\overset{!}{=}b\quad a\underset{n}{\sim}b\quad A\stackrel{f}{\longrightarrow}B`,
  String.raw`a+\phantom{x+y}+b\quad\sqrt{\vphantom{\frac1x}y}\quad a\hphantom{x^2}b`,
  String.raw`\sqrt{\smash{x^2}}\quad\smash[t]{\frac{x}{y}}+\smash[b]{\frac{x}{y}}`,
  String.raw`\mathllap{a}B\quad A\mathrlap{b}\quad\sum_{\mathclap{1\leq i\leq n}}x_i`,
  String.raw`\boxed{x^2+1}\quad\fbox{hello}\quad\colorbox{yellow}{$x$}\quad\fcolorbox{blue}{yellow}{$y$}`,
  String.raw`\cancel{x}+\bcancel{a+b}+\xcancel{\frac1y}\quad\text{\sout{old} new}`,
  String.raw`x\rule[2pt]{1em}{0.6pt}y\quad x\raisebox{0.5ex}{up}\raisebox{-2pt}{down}y`,
  String.raw`a+\vcenter{\hbox{$\frac{x}{y}$}}+b\quad\pmb{x+\alpha}=\boldsymbol{x+\alpha}`,
  String.raw`\verb|x^2 % ~|\quad\verb*|a b|`,
  String.raw`\textbf{bold \textit{and italic}}\quad\textsf{sans \textbf{bold} \textit{italic}}`,
  String.raw`\textit{A \textup{B} C}\quad\emph{A \emph{B} C}\quad\texttt{a--b}`,
  String.raw`\mathcal{ABC}+\mathfrak{xyz}+\mathbb{R}\quad\boldsymbol{\alpha+\Gamma\leq x}`,
  String.raw`{\def\pair#1{\langle #1,#1\rangle}\textcolor{blue}{\widehat{\pair{x}}}}`,
]
// Extended KaTeX commands need assorted LaTeX packages or have no direct
// equivalent. Request this gallery explicitly with --suite 6-extra --no-latex.
const TYPOGRAPHY_EXTRA = [
  String.raw`\widecheck{x}\quad\widecheck{ABC}\quad\widecheck{a+b+c+d}`,
  String.raw`\overleftharpoon{AB}\quad\overrightharpoon{ABC}\quad\Overrightarrow{a+b}`,
  String.raw`\overgroup{a+b+c}\quad\undergroup{a+b+c}\quad\utilde{ABC}`,
  String.raw`\overlinesegment{AB}\quad\underlinesegment{ABC}`,
  String.raw`\overbracket{a+b}^{n}\quad\underbracket{a+b}_{m}`,
  String.raw`A\xRightarrow[b]{a}B\quad C\xLeftarrow[b]{a}D\quad E\xLeftrightarrow[b]{a}F`,
  String.raw`A\xhookrightarrow[b]{a}B\quad C\xhookleftarrow[b]{a}D\quad E\xlongequal[b]{a}F`,
  String.raw`A\xtwoheadrightarrow[b]{a}B\quad C\xtwoheadleftarrow[b]{a}D`,
  String.raw`A\xrightharpoonup[b]{a}B\quad C\xrightharpoondown[b]{a}D`,
  String.raw`A\xleftharpoonup[b]{a}B\quad C\xleftharpoondown[b]{a}D`,
  String.raw`A\xrightleftharpoons[b]{a}B\quad C\xleftrightharpoons[b]{a}D`,
  String.raw`A\xrightleftarrows[b]{a}B\quad C\xtofrom[b]{a}D`,
  String.raw`A\xrightequilibrium[b]{a}B\quad C\xleftequilibrium[b]{a}D`,
  String.raw`\textsf{\textbf{ABC}\textit{xyz}}\quad\textbf{speed $x^2$ now}\quad\mathbf{\text{ABC}}`,
  String.raw`\text{\'{a}\ \c{c}\ \H{o}\ \textcircled{a}}\quad\mathsfit{ABC}`,
  String.raw`x^{\overbrace{a+b}^{n}}+x^{\widehat{abc}}+x^{\xrightarrow[g]{f}}`,
]

function positive(value: string): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new InvalidArgumentError('Expected a positive finite number')
  return number
}
const program = new Command().name('compare')
  .description('Compare Gum, KaTeX HTML in Chromium, and pdflatex at equal pixels per em.')
  .argument('[tex]', 'TeX source (otherwise read stdin)')
  .option('-F, --file <path>', 'Read TeX from a file')
  .option('--suite [phase]', 'Gallery: 1-2, 3, 4, 5, 6, 6-extra (KaTeX extensions), or all (default)')
  .option('-i, --inline', 'Use inline math style')
  .option('-S, --font-size <pixels>', 'Pixels per em in all renderers', positive, 64)
  .option('-o, --output <path>', 'Output PNG (otherwise write PNG to stdout)')
  .option('--artifacts <directory>', 'Keep individual images, Gum SVG, HTML, and LaTeX logs')
  .option('--chrome <path>', 'Chromium binary (also accepts GUM_CHROME)')
  .option('--window <WxH>', 'Chromium screenshot size', '4000x1000')
  .option('--no-latex', 'Explicitly omit the LaTeX comparison')
  .parse()
const options = program.opts<{
  file?: string; suite?: boolean | string; inline?: boolean; fontSize: number; output?: string
  artifacts?: string; chrome?: string; window: string; latex: boolean
}>()
if ([options.file !== undefined, options.suite !== undefined, program.args.length > 0].filter(Boolean).length > 1) {
  program.error('Use a TeX argument, --file, or --suite, not more than one')
}
if (typeof options.suite === 'string' && !['1-2', '3', '4', '5', '6', '6-extra', 'all'].includes(options.suite)) program.error('--suite must be 1-2, 3, 4, 5, 6, 6-extra, or all')
// AMS display environments are invalid in inline mode in both reference tools.
const arrays = [...ARRAYS, ...(options.inline ? [] : DISPLAY_ARRAYS)]
const formulas = options.suite ? options.suite === '1-2' ? BASIC : options.suite === '3' ? ORDINARY
  : options.suite === '4' ? TEXT : options.suite === '5' ? arrays : options.suite === '6' ? TYPOGRAPHY
  : options.suite === '6-extra' ? TYPOGRAPHY_EXTRA : [...BASIC, ...ORDINARY, ...TEXT, ...arrays, ...TYPOGRAPHY]
  : [program.args[0] ?? readFileSync(options.file ?? 0, 'utf8').trim()]
const windowSize = /^(\d+)x(\d+)$/.exec(options.window)
if (!windowSize || Number(windowSize[1]) < 100 || Number(windowSize[2]) < 100) {
  program.error('--window must be WxH, at least 100 pixels on each axis')
}
const font_size = options.fontSize, names = ['Gum', 'KaTeX', ...(options.latex ? ['LaTeX'] : [])]
const fonts = createMathFonts(), pass = new LayoutPass({ fonts: { value: fonts, version: fonts.version } })
const css = import.meta.resolve('katex/dist/katex.min.css')
const chrome = options.chrome ?? process.env.GUM_CHROME ?? ['chromium', 'chromium-browser',
  'google-chrome-stable', 'google-chrome'].map(name => Bun.which(name)).find(Boolean)
const scratch = mkdtempSync(join(tmpdir(), 'gum-next-compare-'))
const reference_borders = new Map<string, number>(), expected_ink = new Map<string, boolean>()
let failed = false

function run(binary: string, args: string[], cwd: string): string {
  const result = spawnSync(binary, args, { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 })
  if (result.error || result.status !== 0) {
    const log = [result.stdout, result.stderr].filter(Boolean).join('\n')
    const message = log.split('\n').find(line => line.startsWith('!')) ?? log.trim().slice(-1200)
    throw new Error(`${binary} failed: ${result.error?.message ?? message}`)
  }
  return result.stdout
}

function gum(tex: string, directory: string): Buffer {
  const fragment = pass.layout(new Latex({ text: tex, font_size: px(font_size), inline: options.inline, strut: false }))
  // Export the union of logical size and ink, including both signed kerns and
  // italic overhang. An explicit Svg viewport elsewhere keeps its own clipping.
  const bounds = union_rects(make_rect(0, 0, fragment.size.width, fragment.size.height), fragment.ink)!
  // Standalone's PDF crop sees logical TeX boxes, so reserve enough border for
  // lap/smash ink. Use Gum's overhang as an estimate plus a full em of slack.
  const overhang = Math.max(0, -bounds.x, -bounds.y,
    bounds.x + bounds.width - fragment.size.width, bounds.y + bounds.height - fragment.size.height)
  reference_borders.set(tex, Math.ceil(Math.max(2, overhang / font_size + 1) * 10))
  expected_ink.set(tex, fragment.ink !== null)
  const size = make_size(Math.ceil(bounds.width + 24), Math.ceil(bounds.height + 24))
  const viewport = make_fragment({ size, children: [place_fragment(fragment,
    make_point(12 - bounds.x, 12 - bounds.y))] })
  const svg = render_svg(viewport, { background: 'white', title: tex })
  writeFileSync(join(directory, 'gum.svg'), svg)
  writeFileSync(join(directory, 'gum.json'), JSON.stringify(fragment, null, 2))
  return rasterize_svg(svg, { size })
}

function katexPng(tex: string, directory: string): Buffer {
  if (!chrome) throw new Error('Chromium not found; use --chrome or GUM_CHROME')
  const body = katex.renderToString(tex, { displayMode: !options.inline, throwOnError: true, strict: 'error', trust: false })
  const page = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${css}">
<style>html,body{margin:0;background:white}body{display:inline-block;padding:24px;font-size:${font_size}px;white-space:nowrap}
.katex{font-size:1em}.katex-display{margin:0}</style></head><body>${body}
<script>document.fonts.ready.then(()=>{
  // Lap/smash can put ink beyond a zero-size box, including before the page
  // origin. Measure descendants too and translate the complete formula into
  // the viewport before taking a screenshot.
  // Stretchy SVGs deliberately extend hundreds of em inside clipped spans.
  // Their DOM rectangles are not visible overhang; the enclosing spans are.
  const rects = [...document.querySelectorAll('.katex, .katex *')]
    .filter(node=>!(node instanceof SVGElement)).flatMap(node=>[...node.getClientRects()]);
  document.body.style.marginLeft = Math.max(0, 24 - Math.min(...rects.map(r=>r.left))) + 'px';
  document.body.style.marginTop = Math.max(0, 24 - Math.min(...rects.map(r=>r.top))) + 'px';
  document.body.dataset.fonts='ready';
})</script></body></html>`
  const html = join(directory, 'katex.html'), png = join(directory, 'katex.png')
  writeFileSync(html, page)
  const dom = run(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1',
    `--user-data-dir=${join(scratch, 'chrome')}`, '--virtual-time-budget=5000',
    `--window-size=${options.window.replace('x', ',')}`, `--screenshot=${png}`, '--dump-dom',
    pathToFileURL(html).href], directory)
  if (!dom.includes('data-fonts="ready"')) throw new Error('Chromium did not finish loading fonts')
  writeFileSync(join(directory, 'katex-dom.html'), dom)
  return readFileSync(png)
}

function latex(tex: string, directory: string): Buffer {
  const display = /^\s*\\begin\{(?:align\*?|alignat\*?|gather\*?|equation\*?)\}/.test(tex)
  const document = String.raw`\documentclass[10pt,preview,border=${reference_borders.get(tex) ?? 20}pt]{standalone}
\usepackage{amsmath,amssymb,xcolor}
${/\\begin\{(?:[pbBvV]?matrix\*|[dr]*cases)\}|\\(?:math[clr]lap|x(?:leftrightarrow|mapsto))/.test(tex) ? '\\usepackage{mathtools}' : ''}
${/\\hdashline|\\begin\{array\}\{[^}]*:/.test(tex) ? '\\usepackage{arydshln}' : ''}
${tex.includes('\\begin{darray}') ? '\\usepackage{nccmath}' : ''}
${/\\[bx]?cancel/.test(tex) ? '\\usepackage{cancel}' : ''}
${tex.includes('\\sout') ? '\\usepackage[normalem]{ulem}' : ''}
\begin{document}
${display ? `\\begin{preview}${tex}\\end{preview}` : options.inline ? `$${tex}$` : `\\[${tex}\\]`}
\end{document}
`
  writeFileSync(join(directory, 'doc.tex'), document)
  run('pdflatex', ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'doc.tex'], directory)
  // TeX points are 1/72.27 inch. Keep fractional DPI to avoid a scale mismatch.
  run('pdftoppm', ['-r', String(font_size * 72.27 / 10), '-png', '-singlefile', 'doc.pdf', 'latex'], directory)
  return readFileSync(join(directory, 'latex.png'))
}

function trim(png: Buffer): Canvas {
  const image = new Image(); image.src = png
  const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let x0 = canvas.width, y0 = canvas.height, x1 = -1, y1 = -1
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const i = (y * canvas.width + x) * 4
    if (765 - data[i]! - data[i + 1]! - data[i + 2]! > 24) {
      x0 = Math.min(x, x0); x1 = Math.max(x, x1); y0 = Math.min(y, y0); y1 = Math.max(y, y1)
    }
  }
  if (x1 < 0) return createCanvas(24, 24)
  if (x0 === 0 || y0 === 0 || x1 === canvas.width - 1 || y1 === canvas.height - 1) {
    throw new Error('Ink reaches the image edge; enlarge --window or check the viewport')
  }
  const width = x1 - x0 + 1, height = y1 - y0 + 1
  const out = createCanvas(width + 24, height + 24), context = out.getContext('2d')
  context.fillStyle = 'white'; context.fillRect(0, 0, out.width, out.height)
  context.drawImage(canvas, x0, y0, width, height, 12, 12, width, height)
  return out
}

function diagnostic(message: string): Canvas {
  const out = createCanvas(440, 100), ctx = out.getContext('2d')
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, out.width, out.height)
  ctx.fillStyle = '#b42318'; ctx.font = '14px monospace'
  const lines = message.match(/.{1,48}/g) ?? []
  lines.slice(0, 5).forEach((line, index) => ctx.fillText(line, 12, 20 + index * 17))
  return out
}

try {
  const rows = formulas.map((tex, index) => {
    const directory = options.artifacts ? resolve(options.artifacts, String(index + 1).padStart(2, '0'))
      : join(scratch, String(index))
    mkdirSync(directory, { recursive: true })
    return names.map(name => {
      try {
        const png = (name === 'Gum' ? gum : name === 'KaTeX' ? katexPng : latex)(tex, directory)
        writeFileSync(join(directory, `${name.toLowerCase()}.png`), png)
        const canvas = trim(png)
        if (expected_ink.get(tex) && canvas.width === 24 && canvas.height === 24) {
          throw new Error('Renderer produced no visible ink for a nonempty formula; check the viewport')
        }
        console.error(`${index + 1}/${formulas.length} ${name}: ${canvas.width - 24}×${canvas.height - 24} ink px`)
        return canvas
      } catch (error) {
        failed = true
        const message = error instanceof Error ? error.message : String(error)
        console.error(`${name}: ${tex}: ${message}`)
        return diagnostic(message)
      }
    })
  })
  const column = Math.max(260, ...rows.flatMap(row => row.map(panel => panel.width))) + 32
  const heights = rows.map(row => Math.max(...row.map(panel => panel.height)) + 68)
  const out = createCanvas(column * names.length, 44 + heights.reduce((a, b) => a + b, 0))
  const ctx = out.getContext('2d')
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, out.width, out.height)
  ctx.fillStyle = '#333'; ctx.font = '20px sans-serif'
  names.forEach((name, index) => ctx.fillText(`${name} · ${font_size} px/em`, index * column + 16, 28))
  let y = 44
  rows.forEach((row, index) => {
    ctx.fillStyle = '#eef0f3'; ctx.fillRect(0, y, out.width, 30)
    ctx.fillStyle = '#445'; ctx.font = '14px monospace'; ctx.fillText(formulas[index]!, 16, y + 20)
    row.forEach((panel, columnIndex) => ctx.drawImage(panel, columnIndex * column + 16, y + 38))
    y += heights[index]!
  })
  const output = out.toBuffer('image/png')
  if (options.output) {
    mkdirSync(dirname(resolve(options.output)), { recursive: true })
    writeFileSync(options.output, output)
    console.error(`Wrote ${options.output}`)
  } else process.stdout.write(output)
  if (failed) process.exitCode = 1
} finally { rmSync(scratch, { recursive: true, force: true }) }
