# Transfer history and current club — Lote 11 / Phase C

Prepared infrastructure, **not operational write authorization**. No new HTTP request,
real database mutation, migration application or current-club promotion belongs to this
phase. The six `/transfers` results from Phase B are reused in audited fixtures.

## Source ownership and compatibility

| Dimension | Authority | Storage / responsibility |
| --- | --- | --- |
| EA identity and Career Mode club | EA `externalId` | Existing `Player.clubId` remains EA/catalog membership |
| Ratings, attributes, positions, PlayStyles, game metadata | EA | Existing sync, unchanged |
| Real-life player/team identity | Exact separately validated API-Football IDs | `apiFootballId`; no name-based reassignment |
| Transfers, seasonal rosters, dated lineups | API-Football source facts | Immutable observation proposals; existing caches/snapshots |
| Real-life current-club assessment | FutScout temporal policy | Separate `PlayerCurrentClubState`, initially PROPOSED |
| Current market value | TransferRoom, planned | Never derived from transfer `typeRaw` or fee text |
| Dynamic overall, review, audit | FutScout | Derived products; not provider ratings masquerading as official EA data |

Audit: `services/syncPlayers.ts` passes EA's normalized club into `updateData.clubId`.
`playerService.ts`, `clubService.ts`, catalog filters and `mapDatabasePlayer.ts` consume
that same relation. Reinterpreting this scalar as real-life membership would allow an
EA sync to undo reconciliation and would change Career Mode catalogs/ratings silently.

Decision: retain that meaning and add a **separate table**, rather than new scalar
columns in Player. Optional relations alone do not change old default scalar selects.
No public query includes the new relations. Existing pages, filters, club ratings,
lineup participants and PT/EN links continue using their current contracts. The unit
suite executes the actual EA sync with a fake store: EA A is preserved and a separate
real-life B is not touched. This is not a real sync invocation.

Future player header: approved real-life club, EA/catalog club as a separate label,
and transfer timeline. Future club page: explicit real-life roster vs Career Mode
roster; never silently mix populations in ratings. `separatePlayerClubDimensions`
requires a separately approved real-life value; even CURRENT_CLUB_CONFIRMED does not
automatically promote an engine proposal. No public UI was switched in Phase C.

## Immutable history and persistence boundary

`PlayerTransferObservation` preserves provider/player identity, raw provider name,
dateRaw plus parsed nullable date, raw team names and nullable exact provider IDs,
typeRaw, payloadVersion, contentHash, source position, fetchedAt and createdAt.

- Content hash: SHA-256 over canonical JSON (ordinal key ordering), version and raw
  facts. Fetch timestamp and payload position are deliberately excluded: fetching the
  same fact again is a no-op, not a new historical event.
- Logical event key: grouping hint over provider/player/date/route, **not a provider
  event ID** and not a uniqueness constraint. Missing dates/routes may be ambiguous.
- Exact content: no-op via unique `(playerId, provider, contentHash)`.
- Possible correction: append new content with previous hashes in revision links.
  Preserve all prior content; no UPDATE/upsert-by-name, DELETE or overwrite.
- Distinct routes/dates: distinct records. Same-day latest nonidentical events block
  a current-club conclusion; source order does not establish intraday chronology.
- Invalid/missing dates remain historical observations but block current-club ordering.
  Future status is recomputed at evaluation time, not frozen as a permanent fact.

`persistTransferObservations` is implemented against a narrow injected transactional
store and tested with fakes. It rechecks unique Player ownership inside the transaction.
The port has only identity reads, history reads and atomic insert-if-absent. It has no
Player update, Club update, delete, HTTP or default Prisma dependency.

**A real Prisma store adapter is intentionally not wired yet.** Before authorizing
persistence, implement that adapter with SERIALIZABLE transaction isolation, atomic
ON CONFLICT DO NOTHING against the unique key and rollback on any failure. A serialization
or ownership conflict must stop for review (no hidden retries). Test real concurrency
and trigger behavior in an explicitly authorized disposable PostgreSQL database first.
Fake rollback/race tests document the required contract, not proof of real database locking.

The prepared migration creates only PlayerTransferObservation and PlayerCurrentClubState,
their indexes/FKs, and append-only triggers on the new observation table (UPDATE/DELETE/
TRUNCATE rejected). It does not alter existing scalar columns, backfill, delete or
rewrite any Player/Club/PlayerTransfer. Application credentials must not own permission
to disable triggers. Schema diff tools do not model the custom triggers.

The three legacy PlayerTransfer rows remain intact and continue serving the current
UI. No automatic backfill: legacy name-keyed events lack equivalent provenance. Future
presentation may show a labeled legacy section; merging requires separate reconciliation.

## Temporal policy `temporal-current-club-v2`

Inputs: confirmed unique player identity, explicit clock, normalized events, exact
team resolutions and independently validated roster/lineup snapshots. Every output is
`writable: false`, including strong candidates. Output includes decision, candidate,
effectiveSince, evidenceState, supporting/contradicting evidence, policyVersion and hash.
Evidence records carry source, observedAt, effectiveAt where known, team, kind and strength.
For lineup evidence, observedAt is the supplied bundle observation time, not an invented
fixture-fetch timestamp; fixtureDate is the dated fact. EA/local state are context only.

1. Require confirmed identity; reject foreign player observations and unorderable dates.
2. Only latest effective nonfuture transfer can suggest today's destination. Future
   events remain visible as warnings. Latest same-day revision/ambiguity => CONFLICT.
3. Resolve destination only through exact Club.apiFootballId ownership. Unknown =>
   TEAM_IDENTITY_UNRESOLVED; duplicate ownership => CONFLICT. Raw names/IDs survive.
4. Require a current destination seasonal roster containing the player **or** a strictly
   later dated destination lineup. A lineup is not mandatory when roster corroborates.
   Destination roster absence of the player => ROSTER_MISMATCH, even with a lineup.
5. An opposing dated lineup on/after the transfer is a conflict (same-day time unknown).
   Earlier lineups are history; lineups are not proof of membership forever.
6. Contemporary positive seasonal presence at a third team is conflict. Presence at
   the explicit origin is also conflict unless a strictly later destination lineup
   corroborates the event. In that narrow case retain the origin roster in
   `contradictingEvidence` and emit SEASONAL_ORIGIN_ROSTER_OUTWEIGHED_BY_LATER_LINEUP.
7. No event: absence alone is insufficient; positive another club is STALE_LOCAL_CLUB;
   multiple clubs are CONFLICT. Local corroboration is observational confirmation,
   never authorization to overwrite membership.

Policy windows: transfer observation age <=7 days for batch reuse; current calendar
season roster, fetchedAt not future, unexpired, age and TTL <=7 days; nonfuture lineup
age <=30 days. These are explicit conservative windows, not a contract inference.
Season transitions require a future explicit policy, not an implicit request/refresh.

Season roster participation is not membership at fetch time. Roster absence is not
transfer proof. A lineup represents a team on fixtureDate; it cannot settle all later
history. Exact `Loan` and `Return from loan` labels produce hints/candidate categories;
other raw labels do not prove permanent movement. `Free agent` with a destination still
has a destination. Unknown type remains unknown, without inventing a fee or marketValue.

### Audited Phase B cases (fixtures, not production hardcodes)

| Case | v2 result | Reason |
| --- | --- | --- |
| Salah / 306 | TEAM_IDENTITY_UNRESOLVED | Team 998 has no local exact provider link; same-name Club is insufficient |
| Rodri / 44 | TRANSFER_CANDIDATE | Effective event + resolved Barcelona + positive roster/lineup |
| Konaté / 1145 | TRANSFER_CANDIDATE | Effective event + resolved Real Madrid + corroboration |
| Cucurella / 47380 | TRANSFER_CANDIDATE | Same generic policy; raw € 55M remains raw |
| Bernardo / 636 | TRANSFER_CANDIDATE | Destination roster sufficient without a lineup |
| Enzo / 5996 | TRANSFER_CANDIDATE + warning | Aug 31 event, Sep 8 City lineup; Chelsea seasonal presence retained as contrary evidence |

Generic tests also remove/move that lineup to before/on Aug 31: Enzo remains CONFLICT.
No player-specific branch exists. Salah becomes a candidate in a **hypothetical fixture**
only after exact team resolution plus positive destination evidence; no real Club ID changes.

Team identity review is separate: exact existing ownership first; otherwise a proposal
requires unique unowned local candidate, exact normalized nonshort name, independently
verified country, league, season and men's first-team evidence. Name alone, missing
context, youth/reserve/women or ambiguity cannot AUTO_MATCH. No candidate is saved.

## Incremental orchestration and review

```text
EA catalog sync -> confirmed Player identity -> divergence signals -> bounded queue
  -> cached / explicitly authorized transfer reader -> normalization + immutable history plan
  -> exact team resolution -> temporal decision -> review / proposed real-life projection
  -> future separate authorization + transactional persistence + AFTER audit
```

Typed review kinds: TEAM_IDENTITY_REVIEW, CURRENT_CLUB_REVIEW, TRANSFER_REVISION_REVIEW,
CONFLICT. No extra review table is needed yet. Raw unknown team references are retained.

`transferSignalsFromIdentityReports` consumes existing identity reports automatically.
The observed 54 stale cases contain only five confirmed IDs; the other 49 must resolve
identity first. Never promote a provider candidate to confirmed identity just to fill a
transfer queue. Queue priority: stale, absent with external evidence, recent window
change, manual, background. Deduplicate by exact player/provider/evidence hash; respect
nextEligibleAt, processed keys and conflicting owners. Maximum selection 100, no 16k sweep.

`runTransferHistoryBatch`: DRY_RUN only, maxPlayers 1..100, maxRequests 0..50, explicit
remainingQuota and zeroRetry. Both cached/request capabilities are injected; no default
fetch, DB, env or persistence. Cache-only miss/budget exhaustion stops before request;
each actual request attempt consumes budget. Failure (429/quota, generic, invalid identity,
malformed evidence) stops before any later player; preserve completed results and mark
failed/not-started separately. Errors are sanitized, no credentials/raw messages logged.

Resume checkpoint binds ordered identities, evidence context, policy and original ceilings;
completed raw observations are revalidated/re-evaluated, not stored decisions trusted.
Integrity checksum detects accidental corruption, **not a signature/authorization**.
Only budget/cache stops resume automatically; failed runs require manual review. Quota
can be replenished but total maxRequests remains bound. Expired observations fail closed.
This is returned in-memory checkpointing, not crash-durable scheduling: a crash during
a request requires operator reconciliation, not replay of an older checkpoint.

Future orchestrator must maintain durable attempts, cross-batch quota and ownership
snapshots, and pass an explicitly approved transport. The existing six-request pilot
reader is not silently expanded or re-executed. No scheduler/CLI or operational adapter
for the new batch is enabled by this phase.

## Promotion gates, deferred on purpose

- Review/authorize/apply additive migration separately; NEVER `migrate deploy` here.
- Implement and validate physical append-only adapter with separate authorization.
- Real-life projection writer needs fresh ownership/evidence, policy version, conditional
  expected previous projection/version, explicit allowed transitions and audit trail.
  Never write EA Player.clubId or substitute a transfer fee for marketValue.
- Proposed states must not become public authority until separately approved. Future
  UI rollout requires page/filter/links/SSR/PT-EN tests for the new chosen dimension.
- Audit BEFORE/AFTER all existing tables; old history/lineups/attempts remain unchanged.

Phase C gates use fakes and nonworking localhost URL placeholders: sequential npm tests,
TypeScript, lint, production build after a memory check, Prisma validate and diff check.
No real API was needed to test this architecture. See ignored audit/reports artifacts
for read-only database baseline and final preflight; no secrets belong in source control.
