// the \text* family composes a family (roman, sans, typewriter) with a weight
// and a shape, so \textbf{\textit{..}} is bold italic and \emph toggles
<VStack spacing={0.1}>
  <Latex>{"\\text{plain} \\quad \\textrm{roman} \\quad \\textnormal{normal}"}</Latex>
  <Latex>{"\\textbf{bold} \\quad \\textmd{medium} \\quad \\textit{italic} \\quad \\textbf{\\textit{both}}"}</Latex>
  <Latex>{"\\textup{upright} \\quad \\emph{emphasis \\emph{nested}} \\quad \\textsf{sans \\textbf{bold}} \\quad \\texttt{mono}"}</Latex>
</VStack>
