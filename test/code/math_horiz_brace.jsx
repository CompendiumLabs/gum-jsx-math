// \overbrace and \underbrace: the body sets the brace width (down to a floor)
// and keeps its own baseline, and a script on the brace becomes a label beyond
// it, since LaTeX passes the brace like an operator with \limits
<VStack spacing={0.1}>
  <Latex>{"\\overbrace{a + b + c}^{n} + d \\qquad \\overbrace{w}"}</Latex>
  <Latex>{"x + \\underbrace{y + z}_{\\text{tail}} \\qquad \\underbrace{p}_{\\text{wide label}}"}</Latex>
  <Latex>{"\\overbrace{\\underbrace{p + q}_{m}}^{r} \\qquad \\underbrace{\\sum_i a_i}_{k}"}</Latex>
</VStack>
