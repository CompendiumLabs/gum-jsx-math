// math font commands (`font` node) map to the KaTeX faces through
// TEX_FONT_FAMILY; a face without the glyph (\mathcal lowercase, \mathbb
// digits) falls back to the symbol's own face, and \boldsymbol picks
// Math-BoldItalic for letters and Main-Bold for everything else, as katex does
<VStack spacing={0.1}>
  <Latex>{"Rx \\quad \\mathrm{Rx} \\quad \\mathnormal{Rx} \\quad \\mathit{Rx}"}</Latex>
  <Latex>{"\\mathbf{Rx} \\quad \\bold{Rx} \\quad \\boldsymbol{Rx} \\quad \\bm{Rx} \\quad \\boldsymbol{a + 1}"}</Latex>
  <Latex>{"\\mathcal{Rx} \\quad \\mathfrak{Rx} \\quad \\mathscr{Rx} \\quad \\frak{Rx} \\quad \\mathcal{ab}"}</Latex>
  <Latex>{"\\mathsf{Rx} \\quad \\mathsfit{Rx} \\quad \\mathtt{Rx} \\quad \\mathbb{RX} \\quad \\mathbb{1a}"}</Latex>
  <Latex>{"{\\rm Rx} \\quad {\\bf Rx} \\quad {\\it Rx} \\quad {\\tt Rx} \\quad {\\cal Rx}"}</Latex>
</VStack>
