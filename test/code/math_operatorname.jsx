// \operatorname sets its body upright as a single Op atom; the starred form
// (and the macros built on it) stacks its scripts as limits in display style
<VStack spacing={0.1}>
  <Latex>{"\\operatorname{sn}(x) + \\operatorname{cd}(y) \\quad \\operatorname*{lim}_{n \\to \\infty} a_n"}</Latex>
  <Latex>{"\\limsup_{n} a_n = \\liminf_{n} b_n \\quad \\argmax_x f(x) \\quad \\argmin_x g(x)"}</Latex>
  <Latex>{"\\injlim_n A \\quad \\projlim_n B \\quad \\varlimsup_n c \\quad \\varinjlim_n d"}</Latex>
  <Latex>{"\\sin x + \\log y + \\operatorname{foo-bar} z \\quad \\lim_{n} u_n"}</Latex>
</VStack>
