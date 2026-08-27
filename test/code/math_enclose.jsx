// `enclose` nodes: \boxed and \fbox frame their body with \fboxsep of padding
// and an \fboxrule rule, \colorbox/\fcolorbox fill (and frame) it, \sout
// strikes through at half the x-height, and the cancels draw corner-to-corner
// strokes that take no space of their own (the ink is carried as overhang)
<VStack spacing={0.1}>
  <Latex>{"E = \\boxed{mc^2} + 1 \\quad a \\fbox{x} b"}</Latex>
  <Latex>{"1 + \\cancel{a} + \\bcancel{b} + \\xcancel{c} + \\cancel{a + b} + 2"}</Latex>
  <Latex>{"p \\sout{d} q \\quad \\colorbox{yellow}{r} \\fcolorbox{red}{lightblue}{s}"}</Latex>
</VStack>
