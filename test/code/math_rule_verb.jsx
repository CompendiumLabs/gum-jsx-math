// leaf nodes: \rule (a filled box of given width, height and shift, which
// \vdots is built from), \verb (typewriter text), \raisebox, and the \TeX
// logos and \dddot, which are raiseboxes plus kerns and sizing
<VStack spacing={0.1}>
  <Latex>{"a \\rule{2em}{0.5em} b \\quad a \\rule[0.5em]{1em}{0.1em} b \\quad \\vdots \\quad \\ddots"}</Latex>
  <Latex>{"\\verb|x + y| \\quad \\verb*|a b| \\quad \\raisebox{0.5em}{high} \\quad low"}</Latex>
  <Latex>{"\\TeX \\quad \\LaTeX \\quad \\KaTeX \\quad \\dddot{x} \\quad \\ddddot{y}"}</Latex>
</VStack>
