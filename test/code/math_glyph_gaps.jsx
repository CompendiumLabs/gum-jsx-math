// \oiint and \oiiint have no glyph in any KaTeX face: like katex, gum sets
// \iint/\iiint and overlays an oval (MathOval, katex's oiintSize1/2 path as an
// ellipse centred on the axis); the second row is the working neighbours
<VStack spacing={0.1}>
  <Latex>{"\\oiint \\quad \\oiiint \\quad \\oiint_S \\quad \\textstyle \\oiint \\oiiint"}</Latex>
  <Latex>{"\\int \\quad \\iint \\quad \\iiint \\quad \\oint"}</Latex>
</VStack>
