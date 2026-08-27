// the \tiny...\Huge family (`sizing` node) scales the rest of its group by
// katex's size multipliers; a nested size change is relative to the one in
// force, so `\tiny a \small b` sets b at 0.9, not 0.45
<VStack spacing={0.1}>
  <Latex>{"A {\\tiny t} B {\\scriptsize s} C {\\footnotesize f} D {\\small m} E"}</Latex>
  <Latex>{"A {\\normalsize n} B {\\large l} C {\\Large L} D {\\LARGE X} E"}</Latex>
  <Latex>{"A {\\huge h} B {\\Huge H} C \\quad {\\tiny a \\small b \\Huge c} \\quad A t B s C f D m E"}</Latex>
</VStack>
