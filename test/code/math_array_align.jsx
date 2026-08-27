// the AMS display-mode environments: katex gates these on display mode, which
// the parser is told about from the current style, and they all build on array
<VStack spacing={0.1}>
  <Latex>{"\\begin{align} x + yyy &= 1 \\\\ zzzzz &= 22222 \\end{align}"}</Latex>
  <Latex>{"\\begin{alignat}{2} a &= b & \\quad c &= d \\\\ e &= f & \\quad g &= h \\end{alignat}"}</Latex>
  <Latex>{"\\begin{gather} p = q \\\\ rrrr = ssss \\end{gather} \\qquad \\begin{equation} y = mx + b \\end{equation}"}</Latex>
  <Latex>{"\\begin{split} u &= v + w \\\\ &= x \\end{split} \\qquad \\begin{subarray}{c} i < j \\\\ j < k \\end{subarray}"}</Latex>
</VStack>
