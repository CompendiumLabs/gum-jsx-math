// box-level nodes: \vcenter centres its body on the axis, \hbox just groups,
// \pmb overprints for a poor man's bold, and \\ outside an array is dropped
// (a no-op in LaTeX display mode, as katex itself warns)
<VStack spacing={0.1}>
  <Latex>{"x + \\vcenter{\\hbox{$\\frac{a}{b} + \\dfrac{c}{d}$}} + y \\quad x + \\frac{a}{b} + y"}</Latex>
  <Latex>{"\\pmb{\\alpha + \\beta} \\quad \\alpha + \\beta \\quad a \\\\ b \\quad \\hbox{plain text}"}</Latex>
</VStack>
