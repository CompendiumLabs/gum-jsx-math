// manual delimiter sizing (`delimsizing` node): \big ... \Bigg pick the
// Size1 ... Size4 glyph of katex's sizeToMaxHeight, and the l/r/m variants set
// the atom class (opener, closer, relation); \left...\right still auto-sizes
<VStack spacing={0.1}>
  <Latex>{"\\big( x \\big) \\Big( x \\Big) \\bigg( x \\bigg) \\Bigg( x \\Bigg)"}</Latex>
  <Latex>{"\\bigl[ a \\bigr] \\Bigl\\{ b \\Bigr\\} \\biggl\\langle c \\biggr\\rangle"}</Latex>
  <Latex>{"a \\bigm| b \\quad \\big. x \\big| \\quad \\bigl< y \\bigr>"}</Latex>
  <Latex>{"\\left( \\frac{1}{2} \\right) \\left[ \\sum_i a_i \\right]"}</Latex>
</VStack>
