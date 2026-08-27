// TextMode is first-class \text{...} without the parser: each character of a
// string is a text-mode symbol in the face composed from family/bold/italic,
// text is literal (a $ or \ is just a character), spaces are the face's
// space glyph, and elements mix inline as in MathText. The Latex line checks
// the converter's own \text: inline $x$ keeps its math face (italic) and
// \textbf/\emph compose with the face in force
<VStack spacing={0.1}>
  <MathText>x = <TextMode>abc def</TextMode> + y</MathText>
  <MathText><TextMode bold>bold</TextMode>{"\\quad"}<TextMode italic>italic</TextMode>{"\\quad"}<TextMode bold italic>both</TextMode></MathText>
  <MathText><TextMode family="sans">sans</TextMode>{"\\quad"}<TextMode family="sans" bold>sans bold</TextMode>{"\\quad"}<TextMode family="mono">mono</TextMode></MathText>
  <MathText><TextMode>{"cost is $5, not \\alpha"}</TextMode></MathText>
  <MathText><TextMode color={blue}>blue <Square fill={red} /> text</TextMode></MathText>
  <Latex>{"\\text{if $x$ then \\textbf{$y$}} \\quad \\mathbf{\\text{ab}} \\quad \\textit{$\\mathbf{z}$}"}</Latex>
</VStack>
