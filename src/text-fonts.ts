type TextFont = Readonly<{ family: 'main' | 'sans' | 'mono'; bold: boolean; italic: boolean }>
const DEFAULT_TEXT_FONT: TextFont = Object.freeze({ family: 'main', bold: false, italic: false })

function text_command(font: TextFont, command: string): TextFont | undefined {
  switch (command) {
    case '\\text': return font
    case '\\textrm': case '\\textnormal': return { ...font, family: 'main' }
    case '\\textsf': return { ...font, family: 'sans' }
    case '\\texttt': return { ...font, family: 'mono' }
    case '\\textbf': return { ...font, bold: true }
    case '\\textmd': return { ...font, bold: false }
    case '\\textit': return { ...font, italic: true }
    case '\\textup': return { ...font, italic: false }
    case '\\emph': return { ...font, italic: !font.italic }
  }
}
function text_font_face({ family, bold, italic }: TextFont): string {
  // Computer Modern has no sans bold italic or styled typewriter face in
  // this font set. Retain weight and shape through the corresponding Main
  // face; the pinned KaTeX renderer instead errors on these missing variants.
  const base = family === 'sans' && !(bold && italic) ? 'SansSerif'
    : family === 'mono' && !bold && !italic ? 'Typewriter' : 'Main'
  return `KaTeX_${base}${bold && italic ? '-BoldItalic' : bold ? '-Bold' : italic ? '-Italic' : ''}`
}

export { DEFAULT_TEXT_FONT, text_command, text_font_face }
export type { TextFont }
