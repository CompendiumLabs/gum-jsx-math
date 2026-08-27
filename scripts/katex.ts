#! /usr/bin/env bun

import { writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { Command } from 'commander'
import { Svg, Box } from '@gum-jsx/core'
import { formatImage } from '@gum-jsx/core/render'
import { Latex } from '../src/elems'
import { registerFont } from '@gum-jsx/core/fonts'

// get directories
const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = resolve(__dirname, '..')
const FONTS_DIR = join(PROJECT_DIR, 'node_modules', 'katex', 'dist', 'fonts')

// register math fonts
await registerFont('KaTeX_Math', join(FONTS_DIR, 'KaTeX_Math-Italic.ttf'))
await registerFont('KaTeX_Main', join(FONTS_DIR, 'KaTeX_Main-Regular.ttf'))
await registerFont('KaTeX_AMS', join(FONTS_DIR, 'KaTeX_AMS-Regular.ttf'))
await registerFont('KaTeX_Size1', join(FONTS_DIR, 'KaTeX_Size1-Regular.ttf'))
await registerFont('KaTeX_Size2', join(FONTS_DIR, 'KaTeX_Size2-Regular.ttf'))
await registerFont('KaTeX_Size3', join(FONTS_DIR, 'KaTeX_Size3-Regular.ttf'))
await registerFont('KaTeX_Size4', join(FONTS_DIR, 'KaTeX_Size4-Regular.ttf'))

// convert SVG to PNG
function convertSvgToPng(svg: string, outputPath?: string): Buffer {
    const args = [
        '--use-fonts-dir',
        FONTS_DIR,
        '--resources-dir',
        PROJECT_DIR,
        '-',
        outputPath ?? '-c',
    ]

    const result = spawnSync('resvg', args, {
        input: svg,
        stdio: outputPath ? ['pipe', 'inherit', 'inherit'] : ['pipe', 'pipe', 'inherit'],
    })

    if (result.error) {
        throw result.error
    }

    if (result.status !== 0) {
        throw new Error(`resvg exited with status ${result.status}`)
    }

    if (!outputPath) {
        return result.stdout instanceof Buffer ? result.stdout : Buffer.alloc(0)
    }

    return Buffer.alloc(0)
}

// read full stdin as utf-8
async function read_stdin(): Promise<string> {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
        chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('utf-8')
}

// parse cli args
const program = new Command()
program
    .name('katex-test')
    .description('Render TeX from stdin using test/katex.ts and output SVG/PNG')
    .option('-o, --output <output>', 'output file; defaults to stdout')
    .option('-p, --png', 'emit PNG (via resvg) instead of SVG')
    .option('-b, --background <color>', 'background color (PNG)', 'white')
    .option('-m, --margin <margin>', 'margin in px', (value) => parseFloat(value), 0.1)
    .option('-s, --size <size>', 'svg size in px', (value) => parseInt(value), 500)
    .parse(process.argv)
const { output, png, size, background, margin } = program.opts<{ output?: string, png?: boolean, size: number, background?: string, margin?: number }>()

// read stdin
const stdoutIsTTY = process.stdout.isTTY === true
const tex = await read_stdin()

// bail on empty input
if (tex.trim().length == 0) {
    throw new Error('No TeX input found on stdin')
}

// parse TeX input
const elem = new Latex({ children: [ tex ] })
if (elem == null) {
    throw new Error('Failed to parse TeX input')
}

// make box with margin and background
const box = new Box({ children: [ elem ], padding: margin, rounded: 0.1, fill: background, clip: true })
const out = new Svg({ children: [ box ], size }).svg()

// convert for output
if (png) {
    const pngBuffer = convertSvgToPng(out, output)
    if (!output) {
        const outputData = stdoutIsTTY ? (formatImage(pngBuffer) + '\n') : pngBuffer
        process.stdout.write(outputData)
    }
} else {
    if (output) {
        writeFileSync(output, out)
    } else {
        process.stdout.write(out)
    }
}
