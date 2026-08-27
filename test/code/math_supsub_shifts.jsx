// TeX Rule 18 script shifts: sub-only drops visibly (x_0 vs x0), sup-only sits
// at sup2, and paired scripts stay tight while clearing each other
<Frame margin={0.2}>
  <Latex>{"x_0 \\; x0 \\; x^2 \\; x_i^2 \\; y_j^n \\; A_k \\; d^2 \\; f_y^b"}</Latex>
  <HLine stroke-dasharray={5} />
</Frame>
