// text-mode accents resolve through the text symbol table (the `accent` node
// carries its mode); \c hangs its cedilla from the base, and \textcircled (so
// \copyright and \textregistered) overprints a full-size ring on the baseline
<VStack spacing={0.1}>
  <Latex>{"\\text{\\'e \\`a \\^o \\~n \\\"u}"}</Latex>
  <Latex>{"\\text{\\=o \\.o \\u{o} \\v{s} \\c{c}}"}</Latex>
  <Latex>{"\\text{\\r{a} \\H{o} \\textcircled{a} \\aa \\AA \\copyright \\textregistered}"}</Latex>
  <Latex>{"\\text{\\ss \\o \\O \\ae \\oe \\AE \\OE \\i \\j}"}</Latex>
</VStack>
