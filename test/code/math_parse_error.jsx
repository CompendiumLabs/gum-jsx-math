// invalid tex must not throw: it renders the raw source as an error span.
// @nostrict -- this example exists to exercise that permissive fallback
<Latex>{"\\frac{a}{ + \\oops"}</Latex>
