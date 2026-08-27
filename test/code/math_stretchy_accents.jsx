// stretchy over-accents are drawn, not set from a glyph: each is a filled
// outline stretched to the body's width. The last row is the glyph-backed
// accents, which stay on the old path
<VStack spacing={0.1}>
  <Latex>{"\\overrightarrow{AB} \\quad \\overleftarrow{CD} \\quad \\overleftrightarrow{xy} \\quad \\Overrightarrow{PQ}"}</Latex>
  <Latex>{"\\overgroup{ab} \\quad \\overlinesegment{cd} \\quad \\overleftharpoon{ef} \\quad \\overrightharpoon{gh}"}</Latex>
  <Latex>{"\\overrightarrow{v} \\quad \\overrightarrow{ABCDEF} \\quad \\overrightarrow{\\frac{a}{b}}"}</Latex>
  <Latex>{"\\widehat{AB} \\quad \\widetilde{CD} \\quad \\widecheck{EF} \\quad \\vec{v} \\quad \\hat{x}"}</Latex>
</VStack>
