// gum elements can serve as script bases and script contents
<MathText>
  <SupSub sup="2" sub="i">
    <Square rounded fill={blue} />
  </SupSub>
  <MathSymbol>{'+'}</MathSymbol>
  <SupSub sup={<Circle fill={red} />}>
    <MathSymbol>x</MathSymbol>
  </SupSub>
</MathText>
