// matrix environments: the array body sets column widths and row baselines,
// and the wrapping \left...\right delimiters stretch to the result
<VStack spacing={0.1}>
  <Latex>{"A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\quad B = \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}"}</Latex>
  <Latex>{"C = \\begin{vmatrix} x & y \\\\ z & w \\end{vmatrix} \\quad D = \\begin{Vmatrix} x & y \\\\ z & w \\end{Vmatrix} \\quad E = \\begin{Bmatrix} p & q \\end{Bmatrix}"}</Latex>
  <Latex>{"F = \\begin{matrix} \\frac{1}{2} & \\sqrt{x} \\\\ \\sum_i a_i & y^2 \\end{matrix} \\quad G = \\begin{smallmatrix} 1 & 2 \\\\ 3 & 4 \\end{smallmatrix}"}</Latex>
</VStack>
