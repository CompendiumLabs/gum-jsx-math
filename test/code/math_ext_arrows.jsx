// extensible arrows are gum's own Arrow/ArrowHead, stroked in em (the stroke
// unit is rebased to pixels per em inside the decoration), stretched to fit
// their labels at script size: the one above hangs from its baseline, the
// optional one below from its top. The fourth row checks harpoon handedness
// against the font's own glyphs, and the last has mhchem's equilibrium arrows,
// whose off-side harpoon is cut short
<VStack spacing={0.1}>
  <Latex>{"A \\xrightarrow{f} B \\xleftarrow{g} C \\xleftrightarrow{h} D"}</Latex>
  <Latex>{"X \\xrightarrow[\\text{below}]{\\text{above}} Y \\xRightarrow{k} Z \\xLeftarrow{m} W"}</Latex>
  <Latex>{"P \\xhookrightarrow{a} Q \\xhookleftarrow{b} R \\xmapsto{c} S \\xlongequal{d} T"}</Latex>
  <Latex>{"E \\xtwoheadrightarrow{n} F \\xrightleftharpoons{p} G \\xrightleftarrows{q} H"}</Latex>
  <Latex>{"\\xrightharpoonup{a} \\xrightharpoondown{b} \\xleftharpoonup{c} \\xleftharpoondown{d} \\quad \\rightharpoonup \\rightharpoondown \\leftharpoonup \\leftharpoondown"}</Latex>
  <Latex>{"A \\xrightequilibrium{a} B \\xleftequilibrium{b} C \\quad A \\xrightequilibrium{\\text{long label}} B"}</Latex>
</VStack>
