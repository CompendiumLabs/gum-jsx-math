// \overset, \underset and \stackrel make an `op` node out of an arbitrary
// body and stack their script on it as a limit in every style
<VStack spacing={0.1}>
  <Latex>{"\\overset{a}{b} \\quad \\underset{c}{d} \\quad \\stackrel{!}{=} \\quad X \\overset{\\text{def}}{=} Y \\quad \\underset{n \\to \\infty}{\\lim} f_n"}</Latex>
  <Latex inline>{"\\overset{a}{b} \\quad \\underset{c}{d} \\quad x^{\\overset{a}{b}} \\quad \\stackrel{\\sim}{\\to}"}</Latex>
</VStack>
