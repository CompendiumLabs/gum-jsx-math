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

function positive(value: string): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new InvalidArgumentError('Expected a positive finite number')
  return number
}
const program = new Command().name('compare')
  .description('Compare Gum, KaTeX HTML in Chromium, and pdflatex at equal pixels per em.')
  .argument('[tex]', 'TeX source (otherwise read stdin)')
  .option('-F, --file <path>', 'Read TeX from a file')
  .option('--suite [phase]', 'Render a comparison gallery: 1-2, 3, or all (default)')
  .option('-i, --inline', 'Use inline math style')
  .option('-S, --font-size <pixels>', 'Pixels per em in all renderers', positive, 64)
  .option('-o, --output <path>', 'Output PNG (otherwise write PNG to stdout)')
  .option('--artifacts <directory>', 'Keep individual images, Gum SVG, HTML, and LaTeX logs')
  .option('--chrome <path>', 'Chromium binary (also accepts GUM_CHROME)')
  .option('--window <WxH>', 'Chromium screenshot size', '4000x500')
  .option('--no-latex', 'Explicitly omit the LaTeX comparison')
  .parse()
const options = program.opts<{
  file?: string; suite?: boolean | string; inline?: boolean; fontSize: number; output?: string
  artifacts?: string; chrome?: string; window: string; latex: boolean
}>()
if ([options.file !== undefined, options.suite !== undefined, program.args.length > 0].filter(Boolean).length > 1) {
  program.error('Use a TeX argument, --file, or --suite, not more than one')
}
if (typeof options.suite === 'string' && !['1-2', '3', 'all'].includes(options.suite)) program.error('--suite must be 1-2, 3, or all')
const formulas = options.suite ? options.suite === '1-2' ? BASIC : options.suite === '3' ? ORDINARY : [...BASIC, ...ORDINARY]
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
<script>document.fonts.ready.then(()=>document.body.dataset.fonts='ready')</script></body></html>`
  const html = join(directory, 'katex.html'), png = join(directory, 'katex.png')
  writeFileSync(html, page)
  const dom = run(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1',
    `--user-data-dir=${join(scratch, 'chrome')}`, '--virtual-time-budget=5000',
    `--window-size=${options.window.replace('x', ',')}`, `--screenshot=${png}`, '--dump-dom',
    pathToFileURL(html).href], directory)
  if (!dom.includes('data-fonts="ready"')) throw new Error('Chromium did not finish loading fonts')
  return readFileSync(png)
}

function latex(tex: string, directory: string): Buffer {
  const document = String.raw`\documentclass[10pt,preview,border=2pt]{standalone}
\usepackage{amsmath,amssymb,xcolor}
\begin{document}
${options.inline ? `$${tex}$` : `\\[${tex}\\]`}
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
