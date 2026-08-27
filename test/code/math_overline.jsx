// overlines span cramped-style bodies and compose with other math structures
<MathCol spacing={0.35}>
  <Latex>{"\\overline{x + y}"}</Latex>
  <Latex>{"x^{a^b} + \\overline{x^{a^b}} + \\overline{g_y}"}</Latex>
  <Latex>{"\\overline{\\frac{x^2}{y^1}} + \\overline{\\sqrt{z^2}}"}</Latex>
  <Latex>{"\\overline{\\overline{x}} + \\underline{\\overline{y}}"}</Latex>
  <MathText>
    <Overline>{"u + v"}</Overline>
    <MathSymbol>=</MathSymbol>
    <MathSymbol>w</MathSymbol>
  </MathText>
</MathCol>
