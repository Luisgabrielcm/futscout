# Lote 10 E.1 — guarded multi-club writes (implementation only)

No real write or consumable authorization for real candidates was generated or executed in E.1. Tests use synthetic identities and injected fakes. The final operational command is READ ONLY.

## Reuse and scope

| Existing component | Reuse |
| --- | --- |
| multiClubIdentityAuthorization | Canonical hash, two-order validation, limits and preparation comparison; preparation-only behavior unchanged |
| multiClubIdentityPipeline / clubPlayerIdentityPipeline | Fresh dry-runs and unchanged matcher decisions |
| loadClubIdentityEvidence | Club/cache/snapshot integrity and bulk identity/owner/attempt evidence |
| persistPlayerIdentityWithPolicy | Sole real Player+Attempt transaction implementation; unchanged |
| preparedMatch / requireClubIdentityGit | Existing pure match preparation (now exported) and Git guard |
| readIdentityWriteAudit / assertIdentityWriteAudit | Full nine-area SQL audit and exact permitted deltas; unchanged |
| withPrismaReadOnly | Shared rollback lifecycle for multi-club preflight and new write audits |

The old single-club writer, old dry-run CLI, matcher/scoring, schema, cache refresh and retry policies are not replaced. A separate operational CLI keeps the preparation CLI unambiguous.

## Versioned allow-list

services/firstMultiClubIdentityBatch.ts contains a deeply frozen first-multi-club-batch-v1 policy: five ordered club identities, all twenty selected identity tuples (Player ID, slug, provider ID, club, expectedUpdatedAt, confidence, margin), and an independent executionOrder of their Player IDs.

It was generated from the local Phase D report only AFTER validating approved canonical summary hash:
4726c0d4560a5cff48b52155e2b979ddfba3b0feef733809cabfc00a58212a34.

No identifiers were reconstructed from names. Deferred candidates occur only in baseline/candidate-set metadata, never the executable allow-list. Full approved summary hash also pins all local rankings, deferred and cache/dry-run state. Any change requires a new review, not replacement or re-ranking.

## Write contract, envelope and token

MULTI_CLUB_IDENTITY_V1 is distinct from MULTI_CLUB_PREPARATION_ONLY_V1. The new summary is write-capable, has the batch ID, and preserves all Phase D summary fields and both orders. Converting back for validation must reproduce the approved preparation hash and exact versioned allow-list.

The envelope binds version, prefix, createdAt, expiresAt, expectedHead, summary and summaryHash. The confirmation prefix is AUTHORIZE_MULTI_CLUB_IDENTITY_V1 followed by SHA-256 of the entire canonical envelope. It is explicit confirmation, NOT an authentication secret or signature. It never accepts a single-club or preparation token, wrong version, malformed value, future creation time or expired envelope.

Validity is at most 15 minutes and cannot exceed any cache expiry. No automatic renewal. Git must remain clean beta-next at the supplied full HEAD. CLI validates before loading write dependencies and again after loading; dispatcher repeats guards before each candidate and inside its transaction.

## Commands

Readiness only, no consumable envelope/token emitted:

```
npx tsx scripts/runGuardedMultiClubIdentityBatch.ts --preflight --expected-head <full-HEAD>
```

Future write, ONLY under a new explicit operational authorization (NOT executed in E.1):

```
npx tsx scripts/runGuardedMultiClubIdentityBatch.ts --write --summary-file audit/reports/<fresh-envelope>.json --confirmation <fresh-confirmation> --expected-head <full-HEAD>
```

The summary file contains the new write envelope, not the old readiness report. Pure createMultiClubWriteEnvelope/multiClubWriteToken functions are available for the separately authorized issuance step, using freshly reviewed evidence. Preflight deliberately does not call them. No bypass/test flag is exposed by CLI; dependency injection and synthetic policy are the test harness only. CLI always uses the fixed real policy.

## Read-only transaction lifecycle

withPrismaReadOnly uses Prisma's managed BEGIN, SET TRANSACTION READ ONLY, verifies SHOW transaction_read_only, and executes reads. On success/early return it throws a private per-call sentinel so Prisma takes its ROLLBACK path, then returns the captured result outside the transaction. Real query/rollback errors propagate. No manual SQL ROLLBACK is issued inside a managed transaction, avoiding an implicit later COMMIT.

All Phase D multi-club preflight transactions now use this helper, as do the new operational audits. Other legacy single-club transactions are intentionally out of scope.

## Execution and audits

Before the first write: the CLI repeats the versioned pristine-baseline preflight; dispatcher independently reloads all five clubs and the global audit, reconstructs the unchanged dry-run, and compares the exact approved summary. The adapter also checks initial nine-area hashes against versioned baseline pins. Twenty selected, exactly five clubs, at most five per club; any invalid selected aborts the whole operation (no shrinking to19 here).

The dispatcher uses executionOrder grouped by club, derived and validated from the protected selected candidates. It does not use selectionOrder to sequence writes or fill vacancies.

Per Player, the existing atomic persistence does Serializable, re-read, provider uniqueness, conditional apiFootballId update, matched Attempt and commit. The adapter rechecks all five clubs/caches and the global snapshot inside that transaction, and the callback requires the same state as the immediate pre-transaction read. Expiry, Git and matcher evidence are rechecked. The existing 15-second transaction timeout is unchanged: operational latency can abort safely and is not proven by fake tests.

After each result (including failure): independent READ ONLY audit. After each completed club: another independent boundary audit before the next club. Only confirmed Player.apiFootballId/updatedAt and one new matched Attempt per confirmed identity may change. All old attempts, other Player fields, unselected/review/deferred identities and seven protected tables remain identical. Added checks require exactly one correct provider owner and exactly one matching Attempt.

Any validation, cache/candidate/state change, transaction failure or audit mismatch stops globally; no retry, no compensation, no continuation/resume. Previous confirmed commits remain. Output identifies results, last confirmed Player, indeterminate IDs, completed clubs and not-executed IDs.

On INDETERMINATE_COMMIT, never claim rollback. Independently audit whether the association is observed, validating the full delta either way; preserve the indeterminate result and STOP regardless. Observation is not permission to retry.

## Idempotency and operational limits

This first fixed batch is intentionally pristine-only. Replay after successful association is rejected before new writes. A fresh dry-run reports ALREADY_MATCHED; no duplicate Attempt, repair or substitution occurs. Newly computed remaining AUTO_MATCH rows cannot reuse this allow-list/token. This is the fail-closed idempotent behavior, not an automatic resume feature.

Fakes exercise the REAL dispatcher, Prisma adapter and atomic persistence callback, including 20 successes; failures1/5/6/10/11/15/16/20; first/last club boundaries; indeterminate1/10/20 both server-commit possibilities; post-commit protected drift; serialization conflict; cache/identity mutation inside the transaction; expiry; tokens/Git/orders/limits; and rollback lifecycle.

A passing fake suite establishes code behavior, not real write throughput/latency. Real writes remain subject to a new operational authorization and fresh readiness. No schema/migration, API-Football/EA call, refresh, deferred processing, master merge or Production deploy is included.
