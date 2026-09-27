# Math performance

```sh
bun run perf
bun run perf --list
bun run perf --filter 'math/layout/'
bun run perf --smoke
bun run perf --json > /tmp/math-perf.json
```

Run these from this repository after installing development dependencies. The
workspace root also provides `bun run perf:math`; `bun run perf` includes all three
suites in sequence. Every command accepts the same flags. Filters are regular
expressions over full case names; unknown flags and filters with no matches fail.

## What is measured

The quadratic formula, nested fractions, sums/integrals, and an 8-by-8 symbolic
matrix each have three cases:

- `math/parse/`: parse TeX into Gum's math syntax, including the KaTeX adapter.
- `math/layout/`: lay out an existing `Latex` element using a fresh pass and warm
  fonts. Includes TeX parsing, math element preparation, glyph measurement, and
  layout; it does not consume a previously parsed tree.
- `math/svg/`: serialize an already laid-out fragment.

Additional cases measure `mathToSvg` with warm fonts and with a new font provider,
a repeated matrix layout cache hit, and rendering a wrapping paragraph with 20
inline formulas. The paragraph's element tree is built outside timing; each
render uses a new pass. Fresh-font cases include lazy font loading, but neither
operating-system file caches nor process startup are reset.

Fixture setup is outside timing. Mitata supplies warmup, repeated sampling, and
latency distributions. `--list` does no fixture setup. `--smoke` executes every
selected case twice without measuring performance. `--json` emits one report;
timings in `benchmarks[].runs[].stats` are nanoseconds (`avg`, `p50`, `p99`). Save
reports before and after changes on the same idle machine and Bun version, and
record Git revisions. Avoid running tests or other benchmarks at the same time.
Repeat runs to distinguish improvements from noise; timings are not test gates.

Add deterministic setup factories to `cases.ts` when extending the suite. Each
returns a synchronous function that returns its measured result. The small
`runner.ts` CLI adapter is kept identical in core, math, and maps so each
repository can run independently.
