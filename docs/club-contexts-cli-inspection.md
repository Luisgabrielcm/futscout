# CLI inspection diagnosis and correction

Removed candidate: `dpl_BTvF4ndwxfSDBaYVQfZ3CkHMXsuk`.
Source: `2ebfc2e747adb61c25831407cf385728ad124f32`.

## What the evidence establishes

The failure was in the first Vercel API GET inside `owned()`, before browser
navigation, SQL comparison during inspection, or promotion. The local wrapper
used `spawnSync` with a 120000 ms timeout, but checked only `status !== 0` and
then threw `Error(stderr || 'CLI_FAILED')`. The recorded error was `CLI_FAILED`.
It discarded `result.error`, `signal`, actual exit status and elapsed time.

The historical subprocess result was not saved. Therefore the original cause
cannot now be distinguished between process timeout, signal termination,
resource exhaustion, spawn failure or an empty-stderr CLI exit. The previous
description as a confirmed timeout was too strong. 120000 ms was the configured
limit, not a captured ETIMEDOUT diagnosis. Do not attribute this to the database,
HTTP 500, authentication, networkidle or the provider without evidence.

A new read-only probe of exactly the removed deployment endpoint, using the
same installed Vercel CLI 65.14.0 and team scope, returned the expected 404 in
2573 ms, exit 1, signal null, no subprocess error and 34 stderr bytes. The
candidate is still removed. This proves present CLI/API reachability, not the
historical cause. No new candidate was created.

A real localhost child-process timeout reproduces the diagnostic loss:
`spawnSync.error.code` is ETIMEDOUT while stderr is empty, and the old wrapper
reports only CLI_FAILED. See Node's documented subprocess result fields:
https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options

## Prepared correction

`scripts/vercelReadOnlyApi.mjs` provides an allowlisted GET-only transport using
the existing authenticated CLI. It captures status, signal, allowlisted error
code, elapsed time, output byte counts and attempts. It never persists stdout,
stderr, environment values, credentials or arbitrary exception messages.

It permits at most two attempts, only for explicit transient read failures;
each defaults to 15 seconds and the overall budget is 35 seconds (maximum
configurable budget 60 seconds). 404, auth failures, signals, resource exhaustion,
unknown exits and invalid responses fail closed without retry. No retry is
introduced for deploy, promote, rollback, remove or any write. The existing
mutating command runner is intentionally not replaced by this read helper.

`requireReadyCandidate` separately checks exact ID, project, source SHA,
Production target, READY and an explicitly empty alias list. GET transport
success cannot authorize promotion or substitute for profile/hash validation.

The private operational scripts were copied to a separate preparation folder;
their API GET wrapper now uses this helper and writes only safe attempt metadata.
Historical scripts and receipts remain unchanged. These scripts were not run
in deployment/promotion/removal modes during this task.

## Focused validation

`node --test scripts/vercelReadOnlyApi.test.mjs`: 13 tests covering a real local
process timeout, a transient retry, bounded retry exhaustion, missing deployment,
auth, signal, resource exhaustion, spawn failure, malformed/error JSON, unknown
exit, blocked endpoints and candidate identity/readiness failures. The existing
focused CI job also runs these tests; no application build or database is needed
to execute them. Full application and previously approved SQL/UI tests are not
repeated locally.

No runtime reader, four-ID selection, economic data, default flags, shared
variables, migration or `vercel.json` is changed. No deploy or public promotion
is authorized by this correction. A future operational run still needs explicit
authorization and must remove the identified staged candidate or roll back a
promoted candidate if its gates fail.
