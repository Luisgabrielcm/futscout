# Candidate timeout diagnosis

Candidate `dpl_3xPMkKqmuoAsDz4wCT4W4eS8jxb4`, source
`c59a4276dcdc9b8c0cfc0b3eb14ceb0775f947b1`, was removed before promotion.

Historical Vercel request logs (2026-11-12 23:33–23:40 UTC) contain 90
requests: 87 HTTP 200, one 302 and two 307. The authenticated browser's
Gustavo Gómez document returned HTTP 200 at 23:35:26.879 UTC. Runtime logs
returned zero records. The operational runner timed out awaiting
`page.goto(..., {waitUntil: 'networkidle', timeout: 60000})`, before asserting
status or inspecting profile content. It removed the staged candidate.

This proves a network-quiescence timeout, not an HTTP 500. These logs do
not identify the request preventing quiescence, prove complete rendering,
or establish that a database operation timed out. No browser trace or
pending-request inventory was captured before removal. The exact historical
pending resource is therefore unknown.

Local application replay reused the existing disposable fixture through the
unchanged READ ONLY adapter, with zero Production connections. It returned
HTTP 200 for pilot pages, but the fresh development worktree initially lacked
the generated client; after reusing the existing local generated artifact,
cold compilation exceeded 60 seconds. The process subsequently exhausted its
JavaScript heap, also logging a local transaction-start timeout under load.
The full application replay is therefore incomplete, not a passing remote
validation. These local failures must not be attributed to the removed
candidate, whose runtime logs contain no corresponding errors.

A localhost-only browser regression reproduces the false gate: a visible
HTTP 200 profile with a pending auxiliary fetch fails `networkidle`, while
explicit visible profile readiness succeeds. HTTP 500, missing context and
an incomplete-profile error remain failures. This demonstrates the faulty
readiness criterion without claiming the synthetic request existed remotely.

## Correction

Use `navigateProfile` from `scripts/profileReadiness.mjs` instead of the
operational smoke runner's `page.goto` call. Pass `real` and `pilot` from the
existing approved fixture selection. It waits for document commit, requires
HTTP 200, then waits for the visible profile heading and appropriate context
within one bounded deadline. Keep all existing source, manifest, four-ID,
economic hash and page-error assertions, plus failure cleanup. Do not raise
timeouts or accept a partial profile merely because HTTP status is 200.

Playwright explicitly discourages `networkidle` for testing readiness:
https://playwright.dev/docs/api/class-page#page-goto-option-wait-until

Run the focused browser regression with an explicit locally installed module:
`PROFILE_PLAYWRIGHT_MODULE=<absolute playwright/index.mjs> node --test scripts/profileReadiness.test.mjs`.
The test binds only to localhost and needs no database or deployment.

The private operational runner has been updated locally to call this helper;
it was not executed remotely. For a future authorized run, use the reviewed
helper from the release worktree rather than reverting to `networkidle`.

No application/database behavior, reader flags, four-ID allowlist, economic
data or `vercel.json` is changed. No deployment, promotion, migration or
Production write is part of this correction. A future remote validation
still requires separate authorization and must retain protected staging and
removal on failure.
