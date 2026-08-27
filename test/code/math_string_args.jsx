// string arguments are parsed as TeX in the composite's own style everywhere
// an element is accepted: HorizBrace label (script style), Sqrt index
// (scriptscript), MathArray cells, and MathRow/MathCol/MathBox children
<MathCol spacing={0.3}>
  <MathText>
    <HorizBrace label="n + 1">{"a + b + c"}</HorizBrace>
    {"+"}
    <HorizBrace over={false} label="\text{tail}">{"y + z"}</HorizBrace>
    {"+"}
    <Sqrt index="3">{"x + 1"}</Sqrt>
  </MathText>
  <MathText>
    <Bracket><MathArray ncol={2}>{["a", "b", "c", "\\frac{1}{2}"]}</MathArray></Bracket>
    {"="}
    <MathBox padding={0.2}>{"x^2"}</MathBox>
    <MathRow>{"a"}{"+"}{"b"}</MathRow>
  </MathText>
  {"\\sum_{k} x_k"}
</MathCol>
