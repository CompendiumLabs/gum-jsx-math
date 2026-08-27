#! /usr/bin/env bun

// Compare gum's math rendering against katex's and real LaTeX's. The same TeX
// is rendered at the same pixels per em three ways -- gum (mathToPng), katex's
// own HTML pipeline in headless Chromium (katex.renderToString + katex.min.css,
// which pulls in the KaTeX fonts), and pdflatex rasterized with pdftoppm -- and
// the results are stacked in one PNG. Beyond a Chromium binary and a TeX
// install, nothing is needed: the trims and the composite are node-canvas,
// which gum already uses to rasterize. The LaTeX panel is skipped if pdflatex
// is missing, and shows the compile error when LaTeX rejects the input (katex
// knows commands amsmath does not).

import { Command } from 'commander'
import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createCanvas, Image, type Canvas } from 'canvas'
import { renderToString } from 'katex'

import { mathToPng } from '../src/render'
import { formatImage, readStdin } from '@gum-jsx/core/render'

// katex.min.css sets `.katex { font-size: 1.21em }`, so a page font size of
// S/1.21 puts katex's glyphs at S pixels per em, matching gum's font_size
const KATEX_SCALE = 1.21
const KATEX_CSS = import.meta.resolve('katex/dist/katex.min.css')

const CHROME_NAMES = [ 'chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'chrome' ]

//
// chromium
//

function findChrome(explicit?: string): string {
  const names = [ explicit, process.env.GUM_CHROME, ...CHROME_NAMES ].filter((n): n is string => n != null)
  for (const name of names) {
    if (name.includes('/')) { if (existsSync(name)) return name; continue }
    const { status, stdout } = spawnSync('which', [ name ], { encoding: 'utf-8' })
    if (status == 0 && stdout.trim().length > 0) return stdout.trim()
  }
  throw new Error(`No Chromium found (tried ${names.join(', ')}); pass --chrome <path> or set GUM_CHROME`)
}

interface KatexPngArgs {
  font_size: number
  inline: boolean
  background: string
  window: [ number, number ]
  chrome?: string
}

// render tex with katex's html pipeline and screenshot it in headless chromium
function katexToPng(tex: string, { font_size, inline, background, window: [ w, h ], chrome }: KatexPngArgs): Buffer {
  const body = renderToString(tex, { displayMode: !inline, throwOnError: false })
  const page = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${KATEX_CSS}">
<style>
html, body { margin: 0; background: ${background}; }
body { display: inline-block; font-size: ${font_size / KATEX_SCALE}px; padding: 8px; white-space: nowrap; }
.katex-display { margin: 0; }
</style></head><body>${body}</body></html>`

  // screenshot from a scratch directory; the virtual time budget lets the
  // webfonts finish loading before the capture
  const dir = mkdtempSync(join(tmpdir(), 'gum-compare-'))
  try {
    const html = join(dir, 'page.html')
    const png = join(dir, 'page.png')
    writeFileSync(html, page)
    const bin = findChrome(chrome)
    const args = [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--virtual-time-budget=5000',
      `--window-size=${w},${h}`, `--screenshot=${png}`, `file://${html}`,
    ]
    const { status, stderr } = spawnSync(bin, args, { encoding: 'utf-8' })
    if (status != 0 || !existsSync(png)) {
      throw new Error(`chromium screenshot failed (exit ${status}): ${stderr.trim().split('\n').pop() ?? ''}`)
    }
    return readFileSync(png)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

//
// latex
//

interface LatexPngArgs {
  font_size: number
  inline: boolean
  packages: string[]
}

function haveBinary(name: string): boolean {
  const { status } = spawnSync('which', [ name ], { encoding: 'utf-8' })
  return status == 0
}

// render tex with pdflatex and rasterize with pdftoppm. A 10pt document puts
// 1 em at 10 TeX points, so dpi = font_size * 72.27 / 10 gives font_size pixels
// per em; the standalone class crops the page to the content. Returns the png,
// or the first error line of the log if LaTeX refused the input
function latexToPng(tex: string, { font_size, inline, packages }: LatexPngArgs): Buffer | string {
  const doc = `\\documentclass[10pt,preview,border=2pt]{standalone}
\\usepackage{${packages.join(',')}}
\\begin{document}
${inline ? `$${tex}$` : `\\[ ${tex} \\]`}
\\end{document}
`
  const dir = mkdtempSync(join(tmpdir(), 'gum-compare-tex-'))
  try {
    writeFileSync(join(dir, 'doc.tex'), doc)
    const run = spawnSync('pdflatex', [ '-interaction=nonstopmode', '-halt-on-error', 'doc.tex' ], { cwd: dir, encoding: 'utf-8' })
    if (run.status != 0 || !existsSync(join(dir, 'doc.pdf'))) {
      const log = run.stdout ?? ''
      const err = log.split('\n').find(l => l.startsWith('!')) ?? 'pdflatex failed'
      return err.replace(/^!\s*/, '')
    }
    const dpi = Math.round(font_size * 72.27 / 10)
    const ras = spawnSync('pdftoppm', [ '-r', String(dpi), '-png', '-singlefile', 'doc.pdf', 'doc' ], { cwd: dir, encoding: 'utf-8' })
    if (ras.status != 0 || !existsSync(join(dir, 'doc.png'))) {
      return `pdftoppm failed: ${(ras.stderr ?? '').trim().split('\n').pop() ?? ''}`
    }
    return readFileSync(join(dir, 'doc.png'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// a panel carrying an error message in place of a render
function messageCanvas(text: string, background: string): Canvas {
  const size = 18
  const canvas = createCanvas(Math.max(200, Math.round(0.55 * size * text.length) + 24), 2 * size + 16)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#c33'
  ctx.font = `${size}px monospace`
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 12, 0.5 * canvas.height)
  return canvas
}

//
// image ops
//

// decode a png onto the background colour, so that transparent pixels (gum's
// render is transparent outside the math; its rounded white box would otherwise
// leave transparent corners) read as background to the trim below
function loadCanvas(buf: Buffer, background: string): Canvas {
  const img = new Image()
  img.src = buf
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, img.width, img.height)
  ctx.drawImage(img, 0, 0)
  return canvas
}

// crop a render to its ink (anything that differs from the top-left pixel)
// plus a margin; reports whether the ink ran into the edge, which for the
// screenshot means the window was too small
function trimCanvas(canvas: Canvas, margin: number): { canvas: Canvas, clipped: boolean } {
  const { width, height } = canvas
  const ctx = canvas.getContext('2d')
  const { data } = ctx.getImageData(0, 0, width, height)
  const [ br, bg, bb, ba ] = data
  let [ x0, y0, x1, y1 ] = [ width, height, -1, -1 ]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = 4 * (y * width + x)
      const diff = Math.abs(data[i] - br) + Math.abs(data[i+1] - bg) + Math.abs(data[i+2] - bb) + Math.abs(data[i+3] - ba)
      if (diff > 24) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return { canvas, clipped: false }  // blank

  const clipped = x0 == 0 || y0 == 0 || x1 == width - 1 || y1 == height - 1
  const [ cw, ch ] = [ x1 - x0 + 1, y1 - y0 + 1 ]
  const out = createCanvas(cw + 2 * margin, ch + 2 * margin)
  const octx = out.getContext('2d')
  octx.fillStyle = `rgba(${br},${bg},${bb},${ba / 255})`
  octx.fillRect(0, 0, out.width, out.height)
  octx.drawImage(canvas, x0, y0, cw, ch, margin, margin, cw, ch)
  return { canvas: out, clipped }
}

interface ComposeArgs {
  gap: number
  labels: boolean
  background: string
}

// put the two renders next to each other (or stacked), each centred in its
// slot, with a hairline between and small labels above
function compose(panels: [ string, Canvas ][], { gap, labels, background }: ComposeArgs): Buffer {
  const label_h = labels ? 22 : 0
  const sizes = panels.map(([ , c ]) => [ c.width, c.height + label_h ] as [ number, number ])
  const [ W, H ] = [ Math.max(...sizes.map(s => s[0])), sizes.reduce((a, s) => a + s[1], 0) + gap * (panels.length - 1) ]
  const out = createCanvas(W, H)
  const ctx = out.getContext('2d')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, W, H)

  let pos = 0
  panels.forEach(([ name, c ], i) => {
    const [ sw, sh ] = sizes[i]
    // side by side, the labels sit on one line across the top and each render
    // is centred in the space beneath; stacked, each label tops its own slot
    const x = 0.5 * (W - sw)
    const y = pos + label_h
    ctx.drawImage(c, x, y)
    if (labels) {
      ctx.fillStyle = '#888'
      ctx.font = '32px sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText(name, 12, pos + 2)
    }
    if (i < panels.length - 1) {
      ctx.fillStyle = '#ccc'
      ctx.fillRect(0, pos + sh + 0.5 * gap, W, 1)
    }
    pos += sh + gap
  })
  return out.toBuffer('image/png')
}

//
// main
//

const program = new Command()
program.name('compare')
  .description('Render TeX with gum, with katex (headless Chromium), and with pdflatex, and stack the three in one PNG')
  .argument('[tex]', 'LaTeX source (reads from --file or stdin if not provided)')
  .option('-F, --file <file>', 'read LaTeX source from file')
  .option('-i, --inline', 'render in inline (text) style rather than display style', false)
  .option('-S, --font-size <px>', 'pixels per em for both renders', (v: string) => parseFloat(v), 96)
  .option('-m, --margin <px>', 'margin around each render after trimming to its ink', (v: string) => parseInt(v), 16)
  .option('-g, --gap <px>', 'gap between the two renders', (v: string) => parseInt(v), 32)
  .option('-b, --background <color>', 'background color', 'white')
  .option('--no-labels', 'omit the panel labels')
  .option('--no-latex', 'skip the pdflatex panel')
  .option('--packages <list>', 'LaTeX packages for the pdflatex panel (comma separated)', 'amsmath,amssymb')
  .option('--chrome <path>', 'chromium binary (default: search PATH, or $GUM_CHROME)')
  .option('--window <WxH>', 'screenshot window; enlarge if the katex render is clipped', '4000x1500')
  .option('-o, --output <file>', 'output PNG (default: show in terminal)')
  .parse()

const opts = program.opts()
const [ tex0 ] = program.args
const tex = (tex0 ?? (opts.file != null ? readFileSync(opts.file, 'utf-8') : await readStdin())).trim()
if (tex.length == 0) throw new Error('No TeX input')

const [ ww, wh ] = String(opts.window).split('x').map(Number)
const font_size: number = opts.fontSize
const background: string = opts.background

// both renders at font_size pixels per em, flattened onto the background and
// trimmed to their ink the same way, so they line up on the glyphs themselves
const gum = trimCanvas(loadCanvas(mathToPng(tex, { font_size, inline: opts.inline, padding: 0, theme: 'light' }), background), opts.margin)
const kat = trimCanvas(loadCanvas(katexToPng(tex, { font_size, inline: opts.inline, background, window: [ ww, wh ], chrome: opts.chrome }), background), opts.margin)
if (kat.clipped) console.error(`warning: katex render touched the screenshot edge; try --window larger than ${opts.window}`)

const panels: [ string, Canvas ][] = [ [ 'gum', gum.canvas ], [ 'katex', kat.canvas ] ]
if (opts.latex) {
  if (!haveBinary('pdflatex') || !haveBinary('pdftoppm')) {
    console.error('note: pdflatex/pdftoppm not found, skipping the latex panel (--no-latex silences this)')
  } else {
    const packages = String(opts.packages).split(',').map(p => p.trim()).filter(p => p.length > 0)
    const res = latexToPng(tex, { font_size, inline: opts.inline, packages })
    panels.push([ 'latex', typeof res == 'string' ? messageCanvas(res, background) : trimCanvas(loadCanvas(res, background), opts.margin).canvas ])
  }
}

const out = compose(panels, { gap: opts.gap, labels: opts.labels, background })

if (opts.output != null) {
  writeFileSync(opts.output, out)
} else if (process.stdout.isTTY) {
  process.stdout.write(formatImage(out) + '\n')
} else {
  process.stdout.write(out)
}
