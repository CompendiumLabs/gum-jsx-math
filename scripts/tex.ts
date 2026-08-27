#! /usr/bin/env bun

// Render LaTeX math to SVG/PNG (or display inline in a kitty terminal)

import { Command } from 'commander'
import { readFileSync, writeFileSync } from 'fs'

import { mathToSvg } from '../src/math'
import { mathToPng, mathToKitty } from '../src/render'
import { readStdin } from '@gum-jsx/core/render'

//
// argument transform
//

function transformArgs(cmd: Command) {
  const [ tex0 ] = cmd.args
  let { file, format, output, theme, background, size, fontSize, padding, inline, scale, color, strict } = cmd.opts()

  // add white background for light theme
  if (theme == 'light' && background == null) background = 'white'
  if (background == 'none') background = undefined

  // auto-detect format for output
  if (format == null) {
    if (output == null) {
      format = 'kitty'
    } else {
      if (output.endsWith('.svg')) format = 'svg'
      if (output.endsWith('.png')) format = 'png'
    }
  }

  return { tex: tex0, file, format, output, theme, background, size, fontSize, padding, inline, scale, color, strict }
}

//
// run command
//

async function runCommand(args: ReturnType<typeof transformArgs>) {
  const { tex: tex0, file, format, output, theme, background, size, fontSize, padding, inline, scale, color, strict } = args

  // get tex source: argument, file, or stdin
  const tex1 = tex0 ?? (file != null ? readFileSync(file, 'utf-8') : await readStdin())
  const tex = tex1.trim()

  // render math
  const margs = { theme, background, size, font_size: fontSize, padding, inline, color, strict }
  let out: string | Buffer
  if (format == 'svg') {
    out = mathToSvg(tex, margs)
  } else if (format == 'png') {
    out = mathToPng(tex, { ...margs, scale })
  } else if (format == 'kitty') {
    out = mathToKitty(tex, { ...margs, scale }) + '\n'
  } else {
    throw new Error(`Unsupported output format: ${format}`)
  }

  // write output
  if (output) {
    writeFileSync(output, out)
  } else {
    process.stdout.write(out)
  }
}

// main program

const program = new Command()
program.name('gum-tex')
  .description('render LaTeX math to SVG/PNG')
  .argument('[tex]', 'LaTeX source (reads from --file or stdin if not provided)')
  .option('-i, --inline', 'render in inline (text) style rather than display style', false)
  .option('-F, --file <file>', 'read LaTeX source from file')
  .option('-f, --format <format>', 'format to output: svg, png, kitty (default: kitty or inferred from output)')
  .option('-t, --theme <theme>', 'theme to use: light or dark', 'dark')
  .option('-c, --color <color>', 'text color (defaults to theme color)')
  .option('-b, --background <color>', 'background color ("none" for transparent; default: white for light theme)')
  .option('-s, --size <size>', 'overall size to fit the math into (overrides font size)', (value: string) => parseFloat(value))
  .option('-S, --font-size <size>', 'font size in pixels', (value: string) => parseFloat(value), 100)
  .option('-p, --padding <padding>', 'padding around the math in em', (value: string) => parseFloat(value), 0.25)
  .option('-x, --scale <scale>', 'raster scale factor for png/kitty output', (value: string) => parseFloat(value), 1)
  .option('--strict', 'throw on rendering fallbacks instead of drawing them', false)
  .option('-o, --output <output>', 'output file')
  .action(async function(this: Command) {
    const args = transformArgs(this)
    await runCommand(args)
  })
program.parse()
