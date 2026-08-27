// macro definition and expansion: each row defines a macro then uses it, so the
// output must match the hand-expanded form on the right
<VStack spacing={0.1}>
  <Latex>{"\\def\\ab{a + b}\\ab \\quad a + b"}</Latex>
  <Latex>{"\\newcommand{\\sq}[1]{#1^2}\\sq{x} \\quad x^2"}</Latex>
  <Latex>{"\\let\\g=\\gamma \\g \\quad \\gamma \\qquad \\char\"41 \\quad \\@char{65} \\quad A"}</Latex>
  <Latex>{"\\gdef\\z{z}\\z \\quad \\bgroup y \\egroup \\quad \\edef\\w{w}\\w"}</Latex>
</VStack>
