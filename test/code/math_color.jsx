// \color and \textcolor (`color` nodes) carry a colour down through spans,
// rules, braces, stretches, delimiters and boxes, without changing spacing;
// the Khan-Academy palette macros expand to \textcolor
<VStack spacing={0.1}>
  <Latex>{"a + {\\color{red} b + c} + d"}</Latex>
  <Latex>{"1 + \\textcolor{blue}{x^2} + \\textcolor{green}{y^2} = z^2"}</Latex>
  <Latex>{"1 + \\red{p} \\blue{q} \\green{r} + 2 \\quad \\textcolor{red}{\\frac{a}{b} + \\sqrt{x} + \\overbrace{y}^{z} + \\left( w \\right)}"}</Latex>
  <Latex>{"a + b + c + d"}</Latex>
</VStack>
