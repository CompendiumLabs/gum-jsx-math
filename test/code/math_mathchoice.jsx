// `mathchoice` picks a branch by the current style: \bmod, \pmod, \mod, \pod
// and \colon all space themselves differently in display and script styles,
// and \minuso kerns its circle by style
<VStack spacing={0.1}>
  <Latex>{"a \\bmod b \\quad a \\pmod{n} \\quad a \\mod n \\quad a \\pod{n} \\quad f \\colon X \\to Y \\quad a \\minuso b"}</Latex>
  <Latex>{"x^{a \\bmod b} \\quad x^{a \\pmod{n}} \\quad x^{f \\colon X} \\quad \\mathchoice{D}{T}{S}{SS} \\quad x^{\\mathchoice{D}{T}{S}{SS}}"}</Latex>
</VStack>
