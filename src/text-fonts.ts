import { freeze_owned } from '@gum-jsx/core'
type TextFont = Readonly<{ family: 'main' | 'sans' | 'mono'; bold: boolean; italic: boolean }>
const DEFAULT_TEXT_FONT: TextFont = freeze_owned({ family: 'main', bold: false, italic: false })

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

export { DEFAULT_TEXT_FONT, text_command }
export type { TextFont }
