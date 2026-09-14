# Multi-club identity — Phase A

This is preparation and read-only evaluation, not write authorization. The new CLI
has no write mode, persistence adapter, HTTP loader, token generation or refresh.
Existing single-club write pilots and matcher heuristics are unchanged.

## Layers and limits

- `multiClubIdentityPipeline.ts`: pure matching orchestration with injected reads
  and audit; per-club reports, deterministic hashes and a finite fake simulation.
- `multiClubIdentityReadRepository.ts`: PostgreSQL RepeatableRead / READ ONLY
  transactions. Existing `loadClubIdentityEvidence` bulk loader is reused.
- `runMultiClubPlayerIdentityPipeline.ts`: explicit dry-run CLI, `beta-next` only,
  process-local fetch blocker, sanitized failures and JSON stdout. No file writes.

```sh
npx tsx scripts/runMultiClubPlayerIdentityPipeline.ts --dry-run --clubs atletico-de-madrid,arsenal,chelsea,liverpool,man-utd --season 2026
```

One to five distinct clubs; config >5 rejects, never truncates. Barcelona, City and
Real are excluded by the Phase A CLI (inventory regression reads only).
Defaults / hard ceilings: 5 clubs, 5 simulated candidates per club, 20 globally.
Invalid/noninteger limits reject before reads. All club configs must agree with
the per-club limit, use 2026 and DRY_RUN, and cannot import old pilot cohorts.

AUTO_MATCH rows are ranked by confidence descending, snapshot presence first,
margin descending, provider ID ascending. First five are explicitly selected;
the rest are deferred. All AUTO_MATCH rows remain in each complete report.
If the selected total exceeds 20, the batch is STOPPED and cannot be simulated:
there is no silent cross-club trimming, substitution or priority redistribution.

## Evidence and hashes

Each club has its own identity, season, cache pin, optional snapshot pin, complete
report and dry-run-only summary. Missing snapshots do not prevent evaluation;
present snapshots must be valid and corroborate without changing matcher rules.
Absent, expired or invalid-timing caches are NEEDS_FRESH_ROSTER. Their counts and
candidate results are null/unavailable, **not a successful zero-candidate match**.
No fallback to 2024. No provider/fixture/lineup request. Malformed present payloads
and evidence drift fail closed globally, rather than being disguised as absence.

`dryRunHash` binds club config, status, cache/snapshot, input hash (all loaded
local evidence including updatedAt), decisions, counts, ordered selected and
deferred candidates. Generation time is excluded so unchanged reads hash equally.
`batchHash` binds the ordered club identities, limits, per-club summary/hash and
stop reason. These hashes are evidence, not cryptographic permissions. No final
write token is issued; summaries use MULTI_CLUB_DRY_RUN_ONLY / writeEnabled=false.

A changed candidate, order, updatedAt, cache or snapshot invalidates comparison
against a reviewed plan. A fresh plan may differ, but never silently amends a
reviewed cohort or grants authorization. Before future writes, a separate adapter
must recompute the reviewed plan and refuse drift, not select replacements.

## Stops, audits and performance

Structural CONFLICT (including existing local associations), cross-club provider
or Player claims, audit mismatch, invalid/drifting evidence or read errors stop
the entire batch: later clubs are not loaded. Earlier reports remain visible.
Absent/expired roster skips that club and can continue. After all evaluated clubs,
global limit enforcement may reject the complete plan before any simulation.

Each club's full report is in memory; global provider owners, local players,
same-birth candidates, attempts and latest snapshot use the existing bulk loader.
No query runs per provider/player. Prisma may implement included relations as
multiple bulk queries; this is O(1) query groups, not necessarily one SQL command.

The CLI counts Prisma query events without printing SQL or parameters. It reports
per-club counts (evidence plus audit) and total SQL events. Fixed-cost inventory
reads and global audits are included in total. No-cache clubs load zero matcher
evidence queries; they still receive a global audit. Valid-cache clubs add the
same bounded bulk query groups regardless of roster size. Fake tests compare
2 vs 20 players. Per-club audit scans all nine tables: deliberately conservative
for <=5 clubs, not a performance claim for unbounded production scale.

BEFORE and independent fresh READ ONLY transactions after each club and at the
end compare full-row deterministic hashes/counts for Player, MatchAttempt, Club,
League, PlayerAttributes, RosterCache, SyncState, SyncError and lineup snapshots.
Any concurrent external modification is a stop (not silently attributed to us).
No data writes occur even when an audit detects drift. The review queue combines
club/provider/candidate/decision/reason; REVIEW_STALE_CLUB is a subset of REVIEW,
not an additional category to double-count. No new table.

## Future write design — NOT implemented/enabled

Batch dry-run -> review -> separate short-lived authorization -> club 1 player
transactions -> audit -> club 2 -> ... . One Serializable transaction per Player,
conditional expectedUpdatedAt and identity checks plus corresponding matched
attempt. No cross-club DB transaction. Only authorized apiFootballId/updatedAt
may change; all other Player fields, old attempts and protected tables stay equal.

If club 3/player 2 fails: preserve clubs 1/2 and club 3/player 1; do not execute the
remaining players or clubs 4/5. Audit mismatch also stops globally. An indeterminate
commit stops globally, is never assumed committed/rolled back, requires independent
audit and never retries. The pure simulation accepts only a finite failure
description, no executable writer callbacks; its 'committed' list is synthetic.
Already matched identities become no-ops on new dry-runs. Real retry/idempotency
still requires the existing atomic per-player guards plus future reviewed batch
authorization; deterministic simulation alone is not proof of production safety.

## Initial selection and operational next step

Read-only inventory on 2026-09-14 confirmed baseline 16228 Players, 92 associated,
91 attempts; Barcelona 17/23, City 12/26, Real 13/26.

| New club | Provider team | Coverage | Attributes | Cache 2026 | Old cache |
|---|---:|---:|---:|---|---|
| Atlético de Madrid | 530 | 5/24 | 24/24 | ABSENT | 2024, 71 players, expired |
| Arsenal | 42 | 10/24 | 24/24 | ABSENT | 2024, 59 players, expired |
| Chelsea | 49 | 6/30 | 30/30 | ABSENT | 2024, 86 players, expired |
| Liverpool | 40 | 10/28 | 28/28 | ABSENT | 2024, 64 players, expired |
| Man Utd | 33 | 5/27 | 27/27 | ABSENT | 2024, 77 players, expired |

Selection prioritizes LaLiga/Premier League, persisted IDs, complete local attribute
coverage, lower/mid identity coverage and clubs not previously used as principal
proof. Season 2026 provider availability is **not confirmed** without authorized
API access. All five lack a local official snapshot. Bayern is not required to
fill a list with a club outside the two preferred leagues.

The next operation requires separate authorization for bounded roster-only 2026
refreshes (team-scoped pagination, quotas, 429 stop, completeness and TTL audits).
Do not fetch now. After fresh caches exist, rerun dry-run and review its real
candidates before preparing any write authorization. No five-club write readiness
can be claimed while 0/5 new rosters have actually been evaluated.
