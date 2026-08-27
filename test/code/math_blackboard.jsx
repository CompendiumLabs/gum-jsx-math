// \mathbb maps to KaTeX_AMS, which carries blackboard capitals only; lowercase
// and digits have no glyph in that face (or in real LaTeX's msbm), so this
// covers the range that does exist
<VStack spacing={0.1}>
  <Latex>{"\\mathbb{R} \\mathbb{N} \\mathbb{Z} \\mathbb{Q} \\mathbb{C} \\mathbb{H}"}</Latex>
  <Latex>{"\\Bbb{ABDEFGKLMPSTVWXY} \\quad \\mathbb{IJOU}"}</Latex>
</VStack>
