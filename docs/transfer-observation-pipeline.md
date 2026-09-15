# Transfer observation pilot — Lote 11 / B-PREP

Preparation only. No real API request is authorized by this document or its fixtures.
No player identity, club membership, transfer history, schema or migration is changed.
The CLI is operationally gated; its dry-run means **no database writes**, not no HTTP.
Only `--preflight` guarantees zero HTTP. Execution of `--dry-run` requires a separate
human authorization for the six requests after reviewing a fresh preflight.

## Boundaries

```text
CLI arguments + Git guard
  -> READ ONLY DB snapshot / identity ownership / table hashes / rollback
  -> isolated GET /transfers transport (not part of public routes)
  -> pure response identity validation + normalization
  -> exact provider-team lookup in the read snapshot
  -> pure chronological current-club evidence evaluation
  -> observational report + READ ONLY AFTER hashes / rollback
```

- `lib/transferObservations.ts`: pure parser, date validation, ordering, comparison,
  team lookup. No Prisma, env, network or persistence.
- `services/apiFootballTransferReader.ts`: injected transport and clock, closed
  HTTPS endpoint, bounded requests, timeout, zero retry, redacted request log.
- `services/currentClubEvidence.ts`: pure conservative decisions; every result has
  `writable: false`. No WRITE decision or persistence callback exists.
- `services/transferObservationPilot.ts`: frozen six-player cohort, argument/Git
  guards and sequential execution preserving partial results.
- `services/transferObservationReadRepository.ts`: only findMany and SELECT hash
  queries, within verified READ ONLY transactions and forced rollback using
  `lib/prismaReadOnly.ts`. Does not call an operational resolver or roster service.
- `scripts/runTransferObservationPilot.ts`: explicit local orchestration; no write
  mode, no mutable legacy imports, no automatic API call when imported by the tests.
  Tests inspect the script as source; it must not be imported as a test helper.

The legacy `services/syncApiFootballPlayer.ts` is deliberately untouched and excluded:
it updates Player.apiFootballId, then upserts statistics, transfers and trophies.
Its private HTTP client and `ApiTransferGroup` cast are not reused. Pure centralized
rate-limit helpers are reused from `apiFootballErrors.ts`; they have no I/O.

## Frozen identities and preflight

The six IDs come from the READ ONLY Fase A audit on 2026-09-15, not an API name search.
The config also freezes local Player ID, slug, name, clubId, club name and club provider
ID. The repository rejects drift in any field, duplicate provider ownership, missing
rows or an inconsistent Attempt. Legacy identity without Attempt remains acceptable;
the reader never creates an Attempt to repair that historical gap.

| Order | Player | Slug | Provider ID | Expected local club |
|---:|---|---|---:|---|
| 1 | Mohamed Salah | mohamed-salah | 306 | Liverpool / 40 |
| 2 | Rodri | rodri | 44 | Manchester City / 50 |
| 3 | Ibrahima Konaté | ibrahima-konate | 1145 | Liverpool / 40 |
| 4 | Marc Cucurella | marc-cucurella | 47380 | Chelsea / 49 |
| 5 | Bernardo Silva | bernardo-silva | 636 | Manchester City / 50 |
| 6 | Enzo Fernández | enzo-fernandez | 5996 | Chelsea / 49 |

The full exact local IDs are in `TRANSFER_PILOT_PLAYERS`. No refill, discovery,
name-based resolution, reordered/subset allow-list or seventh identity is accepted.

Preflight only (reads PostgreSQL, zero HTTP):

```sh
npx tsx scripts/runTransferObservationPilot.ts --preflight --player-ids 306,44,1145,47380,636,5996
```

Future authorized observation (up to six HTTP GET requests, zero DB writes):

```sh
# DO NOT RUN until the separate operational authorization is given.
npx tsx scripts/runTransferObservationPilot.ts --dry-run --player-ids 306,44,1145,47380,636,5996
```

Both require beta-next, a clean tree including untracked files, a valid full HEAD,
and stable HEAD throughout the run. Each request rechecks Git and the five-minute
preflight age. After implementation, the old Fase A HEAD is not hardcoded as the
only executable HEAD: the invocation freezes the clean reviewed current commit.
No flags for write, URL, endpoint, host, search, team, league, retry or max budget.
CLI reads DIRECT_URL for the local administrative READ ONLY connection and
API_FOOTBALL_KEY only for authorized dry-run transport; neither is logged.

## Reader, response identity and normalization

Only HTTPS `https://v3.football.api-sports.io/transfers?player=<exact numeric ID>`.
GET only; redirects rejected; no request body; no built-in retry or global-fetch
fallback. Global fetch is blocked by the CLI; the saved transport capability is
passed only to the isolated reader (and never used in preflight).

The whole envelope is validated before any event is returned. All response groups
must have `player.id === requestedPlayerId`, nonempty string player name and an
array of transfers. Name does not establish identity. A wrong ID in even the last
group rejects the entire response as INVALID_PROVIDER_IDENTITY. An empty response
is EMPTY_NO_EVIDENCE with no fabricated returned identity. Multiple names for the
same exact ID are preserved and warned, not used to reassign identity.

Validate results versus group count, empty errors, optional single-page pagination,
team ID types and text types. Fail closed on unexpected pagination; never fetch an
extra page silently. Bounds: 20 groups, 1,000 events and 2,000,000 text characters
after body read. The latter is an after-read validation, not a streaming memory cap.
Timeout (15 seconds) covers both transport and body consumption; a timeout stops
the reader even if a fake/misbehaving transport ignores its abort signal.

Normalized events contain provider, providerPlayerId, providerPlayerName,
transferDate/dateRaw/dateState, nullable from/to provider IDs and raw names,
typeRaw, kindHint, sourceIndex/sourceGroup/sourceOrder and warnings. Unknown extra
fields are not promoted into operational data. There is no raw-payload DB storage.
Required raw values are preserved verbatim in memory; fixture payloads are synthetic.

Dates require round-trippable YYYY-MM-DD calendar dates, compared using UTC dates:
VALID, FUTURE_TRANSFER, INVALID_DATE, MISSING_DATE. Invalid/missing date values are
retained with warnings; they are semantic incompleteness, not silently dropped.
They block a current-club conclusion because the latest relevant event cannot be
ordered safely. Structural corruption, non-string dates/types and malformed JSON
are fail-stop errors. Date-only events do not prove intra-day ordering.

typeRaw is never trimmed or converted into a numeric fee/marketValue. Only hints
use trimmed case-insensitive exact labels `Loan` and `Return from loan`. The latter
is an explicitly supported observational label, NOT a claim that the provider has
already returned it for these players. Any other label, including Free, N/A, textual
fee or a reverse route without an explicit return label, remains UNKNOWN_TRANSFER_KIND.
No permanent-transfer conclusion is inferred from fee text.
TransferRoom marketValue remains a separate planned concern.

## Chronology, duplicates and revisions

Preserve all events and source order. Return asc/desc chronological views without
mutating input; same-date ties use sourceIndex, invalid/missing dates sort last.
Never treat tie ordering as evidence that one transfer occurred later that day.

The canonical comparison key is a deterministic JSON tuple of provider, player ID,
raw date, source/destination provider IDs/raw names and typeRaw. It is not a database
key and does not cause dedupe writes.

- Exact tuple: EXACT_DUPLICATE (retained in report; harmless for decision).
- Same player/date, compatible from/to IDs but changed name/type: POSSIBLE_REVISION.
  Missing IDs are ambiguous, not proof of distinctness.
- Different dates/player or incompatible known routes: DISTINCT_EVENT, even on
  the same date. Multiple non-identical latest same-day events block current-club
  selection because there is no intraday ordering or trusted event ID.

Never overwrite a historical event to resolve a possible revision. Future persistence
needs a stable logical-event key plus immutable revisions/content hashes, with manual
review for collisions that the real payload cannot disambiguate.

## Exact team resolution

`resolveTransferTeamObservation` checks Club.apiFootballId only. Zero match gives
UNKNOWN_TEAM; exactly one gives RESOLVED and its local ID; more than one gives
CONFLICT. Preserve raw ID/name and nullable relation. A matching name with a different
or missing ID is not resolved. No fuzzy match, create Club, remote lookup or league
mutation is reachable.

## Current-club evidence policy (observational v1)

Inputs are identity, local club, normalized events, read-only roster/lineup evidence,
resolved teams and an explicit clock. No I/O or implicit current date. Decisions:

- CURRENT_CLUB_CONFIRMED
- TRANSFER_CANDIDATE / LOAN_CANDIDATE / RETURN_FROM_LOAN_CANDIDATE
- TRANSFER_CANDIDATE_NEEDS_DESTINATION_ROSTER
- STALE_LOCAL_CLUB / ROSTER_MISMATCH / INSUFFICIENT_EVIDENCE / CONFLICT

No decision constitutes write authorization. Confirmed identity is mandatory.
Foreign-player observations cause CONFLICT. Date-invalid history is insufficient.
Only the most recent effective nonfuture event can suggest a destination; future
events remain visible as FUTURE_TRANSFER warnings and cannot move today's club.
Ambiguous latest revisions/same-day routes cause CONFLICT.

Exact destination resolution plus an explicit relevant event is required. A valid
destination roster with the player adds corroboration; absent destination cache gives
NEEDS_DESTINATION_ROSTER, not CONFLICT. An available destination roster lacking the
player gives ROSTER_MISMATCH, not proof of a different club. Unknown local destination
gives INSUFFICIENT_EVIDENCE and no invented relation.

Current positive evidence at another team after/on the event date causes CONFLICT.
Earlier lineup at the former club is historical and is ignored as a contradiction.
Same-day contradictory lineup remains review/conflict because the event has no time.
Pilot policy: rosters must match the clock's calendar season, age/TTL at most seven
days, fetched no later than now and unexpired. Lineups must be nonfuture and at most
30 days old. These conservative observational windows are not ownership guarantees
and differ intentionally from the UI's 90-day display window. Season transitions
will need an explicit policy extension, never an implicit refresh here.

Without transfer chronology: another positive club is STALE_LOCAL_CLUB; multiple
clubs are CONFLICT; local corroboration can confirm the local club; absence alone
is INSUFFICIENT_EVIDENCE. `/players` rosters represent seasonal participation, not an
authoritative current contract. fetchedAt is not the effective date of membership.

### Required control scenarios

- Salah / 306: absent Liverpool roster, no transfers -> INSUFFICIENT_EVIDENCE.
- Synthetic Salah -> destination X event, no destination roster -> NEEDS_DESTINATION_ROSTER.
- Same synthetic event plus destination roster -> TRANSFER_CANDIDATE, writable=false.
- Enzo / 5996: Chelsea and City rosters plus earlier City lineup, no transfer
  chronology -> CONFLICT. Never select a club by newest fetch timestamp.
- Local A + roster B only -> STALE_LOCAL_CLUB, no transfer.
- A -> B event + B roster -> candidate; A -> B + contemporary C -> conflict.

Fixtures with the six known identities contain explicitly **synthetic** transfer
events (destination 900001). They test plumbing, not the real outcome of /transfers.

## Budget, fail-stop and reports

One request per allow-listed player, maximum six, sequential, zero retry. Failed
requests consume budget. Seventh request, outsider, duplicate/retry or concurrent
request is rejected before a second/unauthorized fetch. Concurrent misuse also
stops the in-flight result from being accepted.

HTTP429, quota in HTTP200 errors/message, non-200 (including 5xx), transport failure,
timeout, invalid identity or structurally malformed payload: STOP. No subsequent
player is fetched. No Attempt/SyncError is written. Empty valid response completes
an observation with NO_TRANSFER_EVIDENCE; it is not a transfer conclusion.

If player 3 fails, report rows are COMPLETED, COMPLETED, FAILED, NOT_STARTED,
NOT_STARTED, NOT_STARTED and complete=false; CLI exit status is nonzero. Earlier
observations remain in the report. Request log records ordinal, ID, endpoint,
GET, HTTP status if received, duration and sanitized validation/error code, never
headers/key or raw error messages. CLI preserves the report even if AFTER verification
fails, with unchanged=null and AFTER_VERIFICATION_FAILED, not a false success.

Both modes compare full-row hashes/counts of all 14 application tables before/after.
An external concurrent DB change can fail this audit; never retry or overwrite to
make hashes match. Core/pilot have no Prisma capability. Repository uses READ ONLY
on the server and forced rollback, including when it encounters a guard failure.

No transfer-response cache is persisted in B-PREP. The initial closed run has no
repeated player requests; observations are returned in memory/stdout. A later run
must not be automatically replayed. Persistent response-cache policy and safe reuse
of previous artifacts need a separately reviewed contract; old PlayerTransfer rows
are not treated as a fresh provider envelope.

## Tests and validation

New unit tests cover parser, dates, raw values, chronology, revisions, exact team
lookup, Salah/Enzo, core decisions, six-player fake run, request guard and failure
matrix, partial reports, Git/CLI guards, mocked read-only transactions, ownership
drift and forbidden Prisma model operations. An AST traversal checks the runner's
local dependency graph for mutable legacy reachability and model-like writes;
crypto.Hash.update is explicitly distinguished from Prisma.Model.update.

All DB tests use fakes. All reader tests inject fake transport. No real runner
dry-run is part of npm test. Gate environment uses nonworking localhost database
placeholders, not real credentials. No dependencies were added.

```sh
npm test -- --test-concurrency=1
npx tsc --noEmit
npm run lint
# Check available memory before this command; do not start a dev server.
npm run build
npx prisma validate
git diff --check
```

## Future persistence — not implemented

Existing PlayerTransfer is mutable upsert-by-names history. Future changes must
preserve provider identity, raw values, source timestamps, content hash, logical
event/revision identity and nullable local team links. Never derive marketValue.
Authorized current-club update/history persistence would need a separate audited
transaction and conditional expectedUpdatedAt/oldClubId checks. The EA sync currently
reassigns clubId: approve source precedence before implementing ANY such update.
Historical lineup snapshots must remain unchanged. No schema, current club, existing
matcher, retry policy, transfer history or UI behavior is changed by B-PREP.
