// infix fraction forms: the parser rewrites each into a genfrac, so these must
// match their prefix equivalents (\over = \frac, \choose = \binom)
<VStack spacing={0.1}>
  <Latex>{"{a \\over b} \\quad \\frac{a}{b} \\quad {n \\choose k} \\quad \\binom{n}{k}"}</Latex>
  <Latex>{"{x \\atop y} \\quad {p \\above 1pt q} \\quad {u \\brace v} \\quad {s \\brack t}"}</Latex>
  <Latex>{"\\genfrac{[}{]}{0pt}{}{a}{b} \\quad \\cfrac{1}{1 + \\cfrac{1}{2}}"}</Latex>
</VStack>
