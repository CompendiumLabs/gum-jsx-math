// lap boxes have zero advance and overhang right (\mathrlap), left
// (\mathllap), or both (\mathclap); the flanking terms close over them
<VStack spacing={0.1}>
  <Latex>{"a \\mathrlap{XXX} b \\quad a \\mathllap{XXX} b \\quad a \\mathclap{XXX} b"}</Latex>
  <Latex>{"\\mathrlap{/}{=} \\quad a \\mathrlap{\\,\\prime} + b"}</Latex>
  <Latex>{"a XXX b"}</Latex>
</VStack>
