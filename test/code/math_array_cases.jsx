// the other array environments: cases braces a left-aligned body, aligned and
// gathered add \jot of leading between rows, and substack stacks a script-size
// column under a big operator
<VStack spacing={0.1}>
  <Latex>{"f(x) = \\begin{cases} x & x > 0 \\\\ -x & x \\le 0 \\end{cases}"}</Latex>
  <Latex>{"\\begin{aligned} x + yyy &= 1 \\\\ zzzzz &= 22222 \\end{aligned} \\qquad \\begin{gathered} u = v \\\\ w = z \\end{gathered}"}</Latex>
  <Latex>{"\\sum_{\\substack{i < j \\\\ j < k}} a_{ij} = 1"}</Latex>
</VStack>
