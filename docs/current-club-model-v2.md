# Lote 11 F.1 — independent EA, approved real club and proposals

Prepared from `bbaeca1`, branch `beta-next`. **No migration application, data backfill,
real promotion, API call or runtime cutover is authorized by this preparation.**

## Ownership and storage

| Dimension | Canonical storage | Authority |
| --- | --- | --- |
| EA/catalog | `Player.clubId` / `Player.club` | EA sync, unchanged |
| Approved real club | `PlayerApprovedCurrentClub.approvedClubId` and `approvedProviderTeamId` | Future separately authorized promotion |
| Pending/history | `PlayerCurrentClubProposal.proposedClubId` and `proposedProviderTeamId` | Current Club evaluation, never public membership |
| Immutable source history | `PlayerTransferObservation` | Raw API-Football observations/revisions |
| Legacy projection | `PlayerCurrentClubState` | Phase E proposal snapshot, not approved authority |
| Legacy transfers | `PlayerTransfer` | Unchanged; never populated by promotion |

`Player.clubId` is already EA/catalog, not a temporary alias for the real-life
dimension. No rename, reinterpretation, scalar addition to Player, or membership
backfill. New relation fields do not change existing scalar selects.

Per Player: zero or one approved row (absence means **not established**), and
zero to many proposals. Approved nullable club/provider fields reserve explicit
unknown-state representation; the future first promotion requires a resolved
destination and must not create an approved row from EA alone.

Approved state has source proposal, evidenceHash, effectiveSince, approvedAt,
version, timestamps and source/decision/metadata. Proposal has revision, version,
baseApprovedVersion, evaluation hash, observation hashes, full evaluation, warnings,
supporting and contradicting evidence. Composite FKs bind approved-source and
supersession links to the same Player. `(playerId, revision)` is unique.

## Consumer audit and transition

Repository search covered `app`, `services`, `lib`, `mappers`, `sync`, `normalizers`,
`providers`, `scripts`, `types` (generated Prisma excluded). Uses are not all Player
membership: many `clubId` parameters identify a Club, lineup or matching scope.

- EA writer: `services/syncPlayers.ts` resolves EA Club and writes `Player.clubId`
  in the player data. This is the membership authority currently wired in production.
- Catalog reads: `services/playerService.ts` selects `Player.club`, filters by
  clubId/name and supplies profile/catalog/compare/favorites; `mappers/mapDatabasePlayer.ts`
  converts that relation into the public player DTO. They remain EA-based.
- `services/playerSelectionService.ts` also selects the legacy Club name for
  compare/favorites; `PlayersSearch`, `PlayerComparison` and `ClubExperience`
  render the catalog relation. None consume proposals or approved V2 membership.
- Club catalog: `services/clubService.ts` uses Player.clubId for roster, pagination,
  aggregate ratings and Club.players counts. `services/leagueService.ts` follows
  Club/League associations, not a new approved membership.
- Public consumers: `app/[locale]/clubes/[slug]/page.tsx`, club/league directories,
  `DirectoryCatalog`, `PlayerHeader` and downstream player cards continue using
  those DTOs. No UI or filter meaning changes here.
- Identity/matcher: `apiFootballPlayerMatchSelection`, `syncApiFootballPlayerMatches`,
  `resolveApiFootballPlayer`, `apiFootballPlayerCandidate`, `clubPlayerIdentityPipeline`,
  `clubPlayerIdentityReadRepository`, `playerIdentityAtomicPersistence`,
  `playerIdentityWritePilot`, `barcelonaIdentityWritePolicy`, `barcelonaIdentityWriteRunner`,
  `clubIdentityAuthorization`, `clubIdentityAutoWrite`, `clubIdentityPilotConfig`,
  all `multiClubIdentity*` and `firstMultiClubIdentity*` services retain EA roster
  scope and their existing identity/CAS gates. No reinterpretation for real rosters.
- `resolveApiFootballClub` resolves Club.apiFootballId, not player real membership.
- Lineup services/repositories/pilots and `lib/officialLineupSnapshot.ts` use clubId
  as snapshot ownership/local team identity; they do not approve player membership.
- Transfer read repository/pilot/persistence/engine and types already distinguish
  EA context from optional realLifeTeamId. `currentClubProposalV2` derives that
  optional signal only from the separately supplied approved state, ignoring
  caller hints. Existing Phase E runner and persistence remain legacy/disconnected.
- Manual audit/test scripts (`auditEAProfileSync`, `testPlayerSync`,
  `testPlayerBatchSync`, `testApiFootballMatcherBatch`, `saveApiFootballPlayerMatchesTest`,
  `testResolveApiFootballClub`, `testResolveApiFootballPlayerUnmatched`, and identity/
  lineup pilot scripts) retain their existing scope. None were executed.
- `playerIdentityCoverage`, `clubIdentityRunner` and `multiClubIdentityRunner`
  consume the same EA relation/scope. `sync/runEARatingsBatchSync.ts` uses EA Club
  context for logs. The historical `prisma/seed.ts` writes illustrative catalog
  associations and is not real-life authority; it was neither changed nor run.
- `lib/currentClubPresentation.ts` remains a future DTO helper, not a new DB reader.

Future real-life pages filter by approved membership; Career Mode pages continue
filtering by EA. Do not silently switch existing endpoints. `getPlayerRealCurrentClub`
is a pure helper: unknown by default; optional `EA_CATALOG_LABELED` returns
`source=EA_CATALOG_FALLBACK,isFallback=true`. A broken/missing approved Club relation
does not fall back to EA. `getPlayerEaClub` is independent. Neither helper queries DB.
Player label: "Clube atual" = approved real; "FC 27" = EA when different.
Club "Elenco atual" = approved real; Career Mode roster = EA. Equal dimensions may
avoid duplicate UI. Transfer timeline remains observations, not invented transfers.

## Lifecycle and versioned replacement

Policy: `current-club-proposal-v2.1` layered on the unchanged temporal engine.

- `PROPOSED`: exact destination, corroborated nonfuture effective event, no warnings,
  no contradictory evidence or possible source revisions.
- `REVIEW`: missing identity/evidence, warnings, revision uncertainty or replacement
  without strictly later chronology. `CONFLICT`: engine conflict or same-date
  different destination. These statuses never change the approved state.
- New clean proposal C supersedes active B only if effective date **and** evaluation
  time are strictly later. Old row becomes `SUPERSEDED`, links to C, increments
  version; all evaluation facts/hash/source evidence remain unchanged.
- Ambiguous replacement retains both rows, demotes old automatic candidate to
  REVIEW/CONFLICT, and blocks automatic promotion until reviewed.
- `APPROVED` and `REJECTED` are terminal historical outcomes; no overwrite or
  reactivation. Same evaluation+baseApprovedVersion+observation hashes is a NO-OP,
  including after rejection. New evidence gets a new revision, never deletes history.
- Older evaluation clocks fail closed. Snapshot hash includes approved state and
  all proposal versions/timestamps, not only the destination.

Example: EA X / approved A / proposal B coexist. Future authorized promotion makes
approved B and proposal B APPROVED atomically, with EA still X. Later proposal C
leaves B public; rejection/review/conflict of C leaves B unchanged. EA sync X→Y
touches neither approved B nor C. Simulations/fakes cover this, not a real promotion.

## Prepared services and future writer boundary

`planCurrentClubProposal` reuses `evaluateTransferHistory`/Current Club engine,
returns an append/lifecycle plan, never an approved-state write.
`persistCurrentClubProposal` uses an injected transaction port, rereads the aggregate,
checks a snapshot CAS, requires count=1 and exact read-back. The port exposes only
proposal persistence, no Player/Club/observation/approved writes. A future adapter
must INSERT new revisions and conditionally UPDATE lifecycle fields only, never
delete/recreate the history despite the aggregate-shaped `replaceProposals` port.

**No V2 Prisma persistence adapter, CLI or public query is wired in this phase.**
This avoids queries to unapplied tables. The old Phase E adapter remains unchanged,
including its insert-only limitation; future orchestration must explicitly switch
to V2 after migration + authorized data transition. It must not dual-write blindly.

`simulateCurrentClubPromotion` is a pure **model simulation**, not a guarded writer
and not authorization. It proves the atomic target shape, snapshot/version/destination/
identity comparisons, idempotence and separate EA dimension. No operational token
is generated. A real writer remains a later task and MUST add:

1. Explicit unexpired authorization, closed selected set, expected HEAD/baseline.
2. Serializable transaction per Player; fresh persisted observations, roster/lineup
   evidence, unique Player/provider ownership and exact Club/provider resolution.
3. Player.updatedAt/identity, expected approved version/club, proposal id/version/
   updatedAt/status PROPOSED/hash/destination/baseApprovedVersion and source hashes CAS.
4. No competing unresolved proposals; no future/stale/review/conflicting evidence.
5. Atomic approved row create/update + proposal APPROVED + audit metadata. Absent
   approved state is version 0; unique player PK protects concurrent first creation.
6. count=0 or serialization conflict: stop, no retry. Unknown commit: audit before
   resume. Same already-consumed proposal and exact approved source => NO-OP; a
   historical approval that is no longer current must never roll back newer state.

## Six-player behavior and separate data-transition plan

Fixtures only (no fresh DB claim): Rodri→Barcelona; Konaté/Cucurella/Bernardo→Real
Madrid remain clean proposals. Cucurella's raw €55M remains only a transfer fact.
Salah→provider998 remains REVIEW/TEAM_IDENTITY_UNRESOLVED, proposedClubId null;
no approved Trabzonspor. Enzo→City remains REVIEW with Chelsea contradiction and
warning retained. All six start with no established approved real state. In
particular neither Barcelona nor the EA club is invented as Rodri's approved club.

Structural migration creates two tables, one enum, indexes and FKs **only**.
It does not touch the existing six PlayerCurrentClubState rows, 31 observations,
Player, Club, legacy transfers or observation immutability triggers. SQL was
generated/compared offline from baseline schema to V2 schema with Prisma migrate
diff; ALTER TABLE statements add FKs only to the two newly created tables.

Future, separately authorized steps:

1. Backup, DB/schema identity and pending migration review; apply only authorized
   additive migration; audit zero legacy row changes.
2. Read/hash six legacy states and all supporting persisted facts. Refuse unknown
   legacy statuses or evidence mismatch. Do not assume the old hash alone is enough.
3. Explicitly authorized **data** migration copies each verified legacy proposal
   into a new revision (sourceLegacyStateId unique for repeat safety), preserving
   original evidence/times and classifying review/conflict conservatively. Keep
   the source table intact. Do not insert approved state or silently refresh proof.
4. Re-read six copied proposals and original rows, validate hashes/counts and
   idempotence; switch only the authorized pipeline to V2.
5. Fresh preflight/authorization for the future guarded writer. Any previously
   approved club must come from independently audited approval evidence, not EA.

No data migration SQL or backfill is bundled with this structural migration.
Public runtime remains compatible before application because it does not query
either new table. Client generation is local and is not a migration.
