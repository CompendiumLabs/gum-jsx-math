// phantoms reserve their body's layout box without ink: \phantom both ways,
// \hphantom only the width, \vphantom (and \mathstrut) only the height; \smash
// keeps the ink but drops the height and depth from the layout box
<VStack spacing={0.1}>
  <Latex>{"a \\phantom{XXXX} b \\quad a b"}</Latex>
  <Latex>{"a \\hphantom{XXXX} b \\quad a \\vphantom{\\frac{1}{2}} b"}</Latex>
  <Latex>{"a \\mathstrut b \\quad \\smash{\\frac{p}{q}} + r \\quad \\smash[b]{\\frac{p}{q}} + r"}</Latex>
</VStack>
