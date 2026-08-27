// operators center on the math axis (dashed line) and stay inside their box;
// the superscript clears the integral hook via italic correction
<Frame margin={0.2}>
  <Latex>{"\\int_0^1 x^2 dx + \\int\\limits_0^1 f^2"}</Latex>
  <HLine stroke-dasharray={5} />
</Frame>
