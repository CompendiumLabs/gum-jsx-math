// column alignment and rules: l/c/r per column, | and : separators between
// them, \hline and \hdashline between rows
<VStack spacing={0.1}>
  <Latex>{"\\begin{array}{|l|c|r|} \\hline aaaa & bb & c \\\\ \\hline d & eeee & fff \\\\ \\hline \\end{array}"}</Latex>
  <Latex>{"\\begin{array}{c:c} a & b \\\\ \\hdashline c & d \\end{array} \\qquad \\begin{array}{c||c} p & q \\end{array}"}</Latex>
  <Latex>{"\\begin{array}{cc} a & b \\\\[1em] c & d \\end{array} \\qquad \\begin{darray}{cc} \\frac{1}{2} & x \\end{darray}"}</Latex>
</VStack>
