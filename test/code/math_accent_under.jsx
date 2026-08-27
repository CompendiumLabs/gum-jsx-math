// under-accents mirror the stretchy over-accents, hanging below the body;
// \utilde takes an extra kern so the tilde clears descenders
<VStack spacing={0.1}>
  <Latex>{"\\underrightarrow{AB} \\quad \\underleftarrow{CD} \\quad \\underleftrightarrow{xy}"}</Latex>
  <Latex>{"\\undergroup{zw} \\quad \\underlinesegment{pq} \\quad \\utilde{rs}"}</Latex>
  <Latex>{"1 + \\underrightarrow{ABCDEF} + \\underline{gh} + \\overline{ij} + 2"}</Latex>
</VStack>
