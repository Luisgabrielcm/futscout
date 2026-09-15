# Lote 10 Phase D — preparation, not permission to write

Subsequent guarded write implementation is documented in [Phase E.1](multi-club-identity-phase-e1.md). This Phase D contract remains preparation-only.

This phase adds a non-consumable preparation contract. Existing matcher, thresholds, retry, cache, schema and operational writers are unchanged. No token is generated. None of these modules is connected to a public route or a real write dispatcher.

## Two protected orders

1. Rank each club's AUTO_MATCH rows by confidence, actual snapshot presence, margin and provider ID. Keep the first five; retain all other AUTO_MATCH as local deferred.
2. Rank only that pool by confidence, margin, configured club order and provider ID. Select up to 20; explicitly retain the global deferred.
3. Keep this ranking as **selectionOrder**.
4. Build **executionOrder** by club order, retaining each club's local ordering and only globally selected members.
5. Canonical SHA-256 includes both arrays, all candidates, local/global deferred, the ordered clubs, hard limits 5/5/20, rule version, cache/snapshot/dry-run hashes and expectedUpdatedAt.

Array order is significant; object property order is not. Both orders must have exactly the same unique player/provider set. No fairness quotas or OVR inputs. Plans with 21 selected, six selected in a club or six clubs are rejected. The explicit pool-to-selected operation is distinct from accepting an over-budget selected plan.

The operational preflight fixes the cohort order: Atletico Madrid 530, Arsenal 42, Chelsea 49, Liverpool 40, Manchester United 33; season 2026. Generic preparation can describe smaller plans, but does not authorize other cohorts.

## Revalidation and expiry

A selected member becoming ineligible produces a smaller summary and never promotes the 21st. That changed summary invalidates the prior envelope and requires a new reviewed preflight. Whole-database drift in the operational read-only audit is stricter: it aborts the run, rather than publishing an authorizable reduced report against stale baseline pins. Do not rerun selection to silently replace a member of a previously reviewed batch.

The preparation-only envelope has prefix MULTI_CLUB_PREPARATION_ONLY_V1, version, writeEnabled=false, expectedHead, createdAt, expiresAt and summary/hash. Expiry is at most 15 minutes and cannot outlive a cache. It is not a writer credential, signature, token or permission. A later real-write phase must obtain explicit approval, use a fresh preflight and validate the final envelope again.

## Read-only preflight

Command, on the exact clean beta-next HEAD:

```
npx tsx scripts/prepareFirstMultiClubIdentityBatch.ts --preflight --pins audit/reports/lote10-phase-d-pins.json --expected-head <full-40-character-HEAD>
```

The ignored pins file is an audit artifact, not a secret or authorization token. It holds the independently captured nine-area baseline, cache hashes and full AUTO_MATCH sets. It must not be silently regenerated after drift.

The CLI checks Git before/after, blocks fetch, uses the local direct admin connection without printing its value, and exposes no write/refresh dispatch. All PostgreSQL transactions SET TRANSACTION READ ONLY and verify SHOW transaction_read_only. The repository repeats the real five-club cache-only dry-run, verifies Llorente 753 ALREADY_MATCHED / 548707 REVIEW, audits before/after independently, and bulk-reads selected Players and globally claimed provider IDs including attempt presence. No per-player query loop.

Reports include evidence, both orders, all deferred and hashes. Their observations expire and do not replace in-transaction checks. The database can change after the final read; future writes must revalidate ownership, updatedAt, attempt absence and cache pins inside each Serializable transaction.

## Future transaction model — fakes only here

simulatePreparedMultiClubBatch accepts only the validated preparation and a finite fault descriptor; it cannot receive a database or writer callback. It creates one isolated in-memory draft per candidate in executionOrder, commits successful drafts, audits each success and each club, and never retries. Previous successes survive a later rollback. A club's failure prevents every later candidate/club.

INDETERMINATE_COMMIT is unknown: previous confirmed commits are retained, the current result is marked indeterminate (not claimed rolled back), no later work or retry occurs. An operational read-only reconciliation would be required under separate authorization. This simulation does not prove PostgreSQL concurrency or transport-failure behavior and does not enable real writes.

The future BEFORE/AFTER policy covers Player, ApiFootballPlayerMatchAttempt, Club, League, PlayerAttributes, ApiFootballTeamRosterCache, SyncState, SyncError and ClubOfficialLineupSnapshot. Only confirmed selected Player.apiFootballId + updatedAt and one new matched attempt per confirmed player may differ. Every other Player field, every unselected Player and every pre-existing attempt must be identical. Persisted audit adapters and the real dispatcher remain for a separately authorized write phase.

## Tests and validation

Deterministic node:test/tsx tests cover ranking, global-vs-grouped ordering, malformed/mutated plans, bounded non-consumable envelopes, 20 successes, failures at 1/5/6/10/11/15/16/20, indeterminate at 1/10/20, club boundaries, all global STOP causes, nine-area audit scope, eligibility loss without refill and fresh matcher ALREADY_MATCHED/idempotency.

Gates use placeholder DB URLs and no real database/API: npm test, TypeScript, lint, production build, prisma validate, git diff --check. Real preflight is a separately invoked read-only step after commit on the final HEAD. No migration, real Player/Attempt write, refresh, API-Football/EA request, merge to master or Production deploy.
