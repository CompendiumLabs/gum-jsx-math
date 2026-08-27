// \math* class overrides change inter-atom spacing (TeX's spacing table): the
// same `x` gets binary, relational, punctuation, and inner spacing in turn
<VStack spacing={0.1}>
  <Latex>{"a \\mathbin{x} b \\quad a \\mathrel{x} b \\quad a \\mathpunct{x} b"}</Latex>
  <Latex>{"a \\mathinner{x} b \\quad a \\mathopen{x} b \\quad a \\mathclose{x} b"}</Latex>
  <Latex>{"a \\mathord{x} b \\quad a x b"}</Latex>
  <Latex>{"a + b \\quad a = b \\quad a , b"}</Latex>
</VStack>
