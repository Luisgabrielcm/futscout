# Guarded multi-club partial resume v1

This is technical enablement, not operational authorization. No real write or
consumable authorization is performed by a readiness command.

## Separate contract

`MULTI_CLUB_IDENTITY_RESUME_V1` / `mode: RESUME` binds the original batch policy,
original authorization summary hash and original HEAD, the complete selected
set, an audit-only confirmed set and the remaining set. The sets must be a
disjoint exhaustive partition of the original selection. Remaining order is
the original execution order filtered by membership, never a new ranking.

The configuration registry is versioned code, not an arbitrary CLI JSON policy.
`first-multi-club-resume-v1` references the original20 identities,16 confirmed
commits and4 pending candidates. Only Liverpool40 and Manchester United33 need
roster evidence. Atletico, Arsenal and Chelsea are audit-only. Numeric counts
and concrete identities are configuration, never branches in the generic core.

Original92 associations/91 attempts plus16 confirmed commits must equal the
resume108/107 baseline. Player count and protected-table fingerprints are
unchanged. Exact current nine-table fingerprints are pinned to the F.2 audit.

## Readiness only

```text
npx tsx scripts/runGuardedMultiClubIdentityBatch.ts --resume-preflight --resume-config first-multi-club-resume-v1 --expected-head <FULL_REVIEWED_HEAD>
```

The CLI checks clean beta-next and exact HEAD, blocks fetch, and uses DIRECT_URL
without printing it. The repository uses the existing withPrismaReadOnly helper:
BEGIN / SET TRANSACTION READ ONLY / SHOW verification / SELECTs / ROLLBACK.
Rollback also occurs on success, early return and error. Output contains a
readiness summary/hash, not an envelope, confirmation or consumable token.

All confirmed identities are checked in bulk for exact slug/club, provider
ownership and a unique matched attempt. Pending players must have null provider,
no attempt, no owner conflict, pinned updatedAt and unchanged AUTO_MATCH evidence.
Complete rosters remain in the pure matcher: no evidence filtering or deferred
promotion. Changes require audit and a new reviewed configuration, not silent
shrinking, refilling or replay. All-already-matched with an old configuration
fails closed without writing; a fully reconciled configuration with zero pending
members can produce readiness but cannot produce a consumable envelope.

## Future authorized write

Only after a separate operational authorization and fresh readiness:

```text
npx tsx scripts/runGuardedMultiClubIdentityBatch.ts --resume-write --resume-config first-multi-club-resume-v1 --summary-file audit/reports/<NAME>.json --confirmation <RESUME_CONFIRMATION> --expected-head <FULL_REVIEWED_HEAD>
```

The pure envelope constructor is available for a separately authorized operation.
The prefix is `AUTHORIZE_MULTI_CLUB_IDENTITY_RESUME_V1`. Expiry is at most15
minutes and no later than any required cache expiry. Summary and envelope bind
all original/confirmed/remaining hashes, current baseline, cache/dry-run hashes,
timestamps, ordered candidates, HEAD and limits. Pristine, single-club,
preparation-only, expired and mutated authorizations are rejected. Hashes are
integrity bindings, not secrets or substitutes for operator permission.

The original pristine CLI remains closed to its original five-club20-player
policy. The resume entrypoint has its own validation, then reuses exactly the
same guarded loop, Prisma persistence adapter and persistPlayerIdentityWithPolicy.
No second update/create implementation exists. Only pending identities reach
the transactional allow-list. Serializable,15 seconds and zero retries remain.

Every successful candidate has an independent global audit; every club has a
second boundary audit before the next club starts. Previously confirmed players
and attempts must remain unchanged. The existing complete Player/Attempt audit
protects deferred/unselected players and all seven other tables. A failure or
indeterminate commit stops globally, preserves earlier commits and leaves later
candidates NOT_STARTED. F.2 events, typed diagnostics, candidate reports and
read-only indeterminate reconciliation are shared unchanged.

## Cost and future resumes

Safety still includes global Player/Attempt scans and nine-table hashes. The
current resume reads two roster evidence sets instead of five and adds one bulk
identity read for original members. This deliberately retains the expensive
in-transaction revalidation; no timeout optimization or retry was introduced.

A later partial result needs an independent audit and explicitly versioned
configuration: e.g.18 confirmed plus2 pending, both derived from the SAME
original selected set. Baseline arithmetic uses all confirmed original commits.
The current registry does not automatically enable that next operation.
