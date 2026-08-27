// spaces inside \text carry their advance: katex emits each as its own spacing
// token, and an all-whitespace run has to survive whitespace compression
<VStack spacing={0.1}>
  <Latex>{"\\text{if } x > 0 \\text{ and } y < 1"}</Latex>
  <Latex>{"\\overbrace{a + b + c}^{n \\text{ terms}} \\quad \\text{for all } n \\in \\mathbb{N}"}</Latex>
  <Latex>{"\\text{a b} \\ne \\text{ab} \\quad \\text{a  b} = \\text{a b}"}</Latex>
</VStack>
