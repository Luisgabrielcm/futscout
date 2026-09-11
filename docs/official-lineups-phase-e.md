# Official lineups — Phase E: preparation, not execution

Audit date: 2026-09-11. Starting baseline: `827aa92`, branch `beta-next`, clean.
Real database access in this phase was SELECT-only, in READ ONLY transactions with rollback.
No real API request, runner execution, ID association, migration or database write is authorized by this preparation.

## Persisted Barcelona snapshot

Global snapshots: 1. Barcelona: 1. Manchester City: 0. Real Madrid: 0.
Fixture 1635628, 2026-09-09 16:45 UTC, Barcelona versus Feyenoord, UEFA Champions League.
Formation 4-3-3, payloadVersion 1, revision 1; 11 starters and 12 substitutes.
Content hash: `1d82442da572f610d2565dec8010d44afbb044737dd5b6d4c31ff80068d1dd11`.
Snapshot decoding and content validation passed. Six starters and one substitute resolve by exact API ID; five and eleven do not.
The raw pg audit must interpret Prisma timestamp-without-timezone columns as UTC, not local Windows time. This is an audit-reader concern, not a persisted-data correction.

## Coverage (registered catalogue, not claimed current official squad)

| Scope | Players | API ID present | Missing | Coverage |
| --- | ---: | ---: | ---: | ---: |
| Global | 16,228 | 74 | 16,154 | 0.456% |
| Barcelona | 23 | 9 | 14 | 39.13% |
| Manchester City | 26 | 7 | 19 | 26.92% |
| Real Madrid | 26 | 8 | 18 | 30.77% |

There are 73 attempts: 62 matched, 7 not_resolved, 4 weak; no review/conflict/error.
16,155 players have no attempt. The dominant observed explanation is limited operational matching coverage, not a regression in exact-ID lineup resolution.
The 74 linked records and 62 matched attempts are different populations; this audit does not infer provenance for every historical association.

## Barcelona unresolved — diagnostic candidates ONLY

All 16 source IDs have no exact local Player.apiFootballId match. Names, initials and cache names below are evidence for investigation, NEVER a persistible mapping.
A = plausible local candidate with null ID; B = different existing ID; C = no candidate located; D = ambiguous; E = possible club change/stale data; F = other.

| Group | Provider ID / source name | Local candidate / slug / EA externalId | Registered club | Category |
| --- | --- | --- | --- | --- |
| XI | 182718 J. Garcia | Joan García / joan-garcia / 259532 | Barcelona | A |
| XI | 396623 P. Cubarsi | Pau Cubarsí / pau-cubarsi / 278046 | Barcelona | A |
| XI | 2282 A. Christensen | Andreas Christensen / andreas-christensen / 213661 | Barcelona | A |
| XI | 855 J. Cancelo | João Cancelo / joao-cancelo / 210514 | Al Hilal | E |
| XI | 7334 K. Adeyemi | Karim Adeyemi / karim-adeyemi / 251852 | Borussia Dortmund | E |
| Bench | 851 W. Szczesny | Wojciech Szczęsny / wojciech-szczesny / 186153 | Barcelona | A |
| Bench | 1305 D. Livakovic | Dominik Livaković / dominik-livakovic / 241671 | Girona FC | E |
| Bench | 181701 G. Martin | Gerard Martín / gerard-martin / 74462 | Barcelona | A |
| Bench | 161928 A. Balde | Balde / balde / 263578 | Barcelona | A |
| Bench | 568001 X. Espart | None located | — | C |
| Bench | 296667 Gavi | Gavi / gavi / 264240 | Barcelona | A |
| Bench | 574799 B. Farinas | None located | — | C |
| Bench | 340626 Fermín | Fermín / fermin / 277179 | Barcelona | A |
| Bench | 643 Gabriel Jesus | Gabriel Jesus / gabriel-jesus / 230666 | Arsenal | E |
| Bench | 138787 A. Gordon | Anthony Gordon / anthony-gordon / 242964 OR Ashton Gordon / ashton-gordon / 76453 | Newcastle United OR Atlanta United | D |
| Bench | 550547 H. Abdelkarim | None located | — | C |

Totals: A=8, B=0, C=3, D=1, E=4, F=0. All listed local candidates have null API IDs.
J. Garcia initials alone yield several players; persisted ID 182718 cache full name Joan García Pons supports the diagnostic candidate.
A. Balde initials alone also yield an unrelated Aliou Baldé. Cache ID 161928 gives Alejandro Balde / Balde Martínez and supports investigating the Barcelona player named only Balde. It does NOT authorize an association.
Absent candidates mean not found by available IDs/names/slugs, not proof that no alternate-named record exists.
E records must not be moved or matched to Barcelona by name: the snapshot may reflect newer transfers or source inconsistencies. This phase cannot distinguish those possibilities without later authorized evidence.

## Existing pipeline and next player-ID strategy

`resolveApiFootballPlayer` already uses conservative scoring, birth date, nationality, club, duplicate-ID checks and candidate ambiguity protection. Auto-save still requires strong >=90, correct birth date and club, nameScore >=80, and the existing candidate-selection policy.
`syncApiFootballPlayerMatches` supports explicit playerIds, cacheOnly and failFast; it writes attempts/SyncState and is NOT a read-only diagnostic even in cacheOnly mode.
The resolver can save club resolution even when player save=false. Do not run it for a read-only audit.
Retry eligibility respects nextRetryAt: not_resolved 7d, review 14d, weak/conflict 30d, error 1d; matched is not retried.
Rate limit/cache miss stop the batch without an attempt for the interrupted player.
The general manual sync script defaults to season 2024 and does not enable the restricted pilot flags: do not use it unchanged for the next controlled pilot.

All 15 persistent roster caches are season 2024 and expired at audit time. City has 66 cached players, Barcelona 56, Real 62; fetched September 2, expired September 9. A recently fetched historical-season cache is not a current-season squad.
Barcelona's cache contains 9 unresolved IDs (Joan, Pau, Christensen, Cancelo, Szczęsny, Gerard, Balde, Gavi, Fermín). Arsenal's contains Gabriel Jesus. This supports diagnosis, not bypassing expiration or safe matching.

Recommended sequence: **C first, then A**.

- C: separately authorize a bounded current-season roster/cache preflight and refresh where appropriate. Do not delete historical caches, change the global default season or reset sync.
- A: prepare explicit-playerIds pilots using the existing safe matcher with cacheOnly + failFast, audited writes and conservative birth/club checks. This requires separate write authorization.
- B: only if concrete evidence shows existing mechanisms cannot address a case; no new name-only resolution pipeline now.
- D: not appropriate before broader rollout; coverage is demonstrably incomplete.

## Independent future runners

| Target | Local identity | API team | Script |
| --- | --- | ---: | --- |
| Manchester City | cmt94sibe001a5guc60z2rphl / manchester-city | 50 | scripts/runOfficialLineupManchesterCityPilot.ts |
| Real Madrid | cmt7hnsah0004z0ucqy6yoeqz / real-madrid | 541 | scripts/runOfficialLineupRealMadridPilot.ts |

Both identities and empty snapshot sets were confirmed READ ONLY. The future runner rechecks id, slug, name and API ID and rejects ambiguous records before HTTP.
These are operational entrypoints, not npm scripts or public routes. No combined runner exists.
Each checks its exact single execution flag BEFORE importing runtime/env/DB dependencies.

**Prepared commands; NOT executed in Phase E; each needs its own explicit authorization:**

```powershell
npx tsx scripts/runOfficialLineupManchesterCityPilot.ts --execute-manchester-city-official-lineup
```

```powershell
npx tsx scripts/runOfficialLineupRealMadridPilot.ts --execute-real-madrid-official-lineup
```

Future operation uses DIRECT_URL only for administration and API_FOOTBALL_KEY through the existing isolated fetch guard. Never print either value.
One fixtures request (`last=5`, UTC); up to three distinct eligible fixture lineups; total <=4. Only GET HTTPS to the official host, matching team and fixtures returned by that source. Redirects denied, timeout bounded, no retry; quota/HTTP/network/JSON failure latches transport stopped.
Selection retains the approved policy: recent completed fixtures, newest first, up to three eligible candidates. An invalid lineup is never written; selection may examine the next eligible fixture within budget. Exhaustion fails without write.
Exact API-ID resolution only; unresolved is allowed, duplicate local identities fail-stop. No matcher, roster fetch, Player updates or automatic names are used.

### Write and audit boundary

Eight protected tables: Player, Club, League, PlayerAttributes, ApiFootballTeamRosterCache, ApiFootballPlayerMatchAttempt, SyncState, SyncError.
Before/pre-write/final audits hash full rows and count these tables plus ALL non-target snapshots in READ ONLY RepeatableRead transactions.
Barcelona's known fixture/revision/payloadVersion/formation/contentHash is pinned as an additional precondition; any changed baseline needs operator review, not an automatic rewrite.
Only target snapshot 0 -> 1 is permitted. The approved repository has a small opt-in `requireEmptyClub` precondition INSIDE its existing Serializable transaction. Existing callers retain their old behavior. Duplicate target, concurrency/serialization conflict or uncertain write outcome is fail-stop with no retry.
The repository still contains only snapshot.create; no update/delete/upsert. The adapter rejects any non-target write. Total snapshots must increase exactly one; other snapshot hashes/counts and protected tables must remain equal.
Concurrent external changes can be detected, not prevented by audit hashes. A final-audit failure after commit does not undo the snapshot: STOP, audit manually, never rerun automatically. Do not run either pilot alongside other writers.

## UI and validation

The current club page/read service/ClubPitch are club-generic: with the official-lineup capability enabled, City and Real can consume their own persisted snapshot, Barcelona its existing one, and clubs without an eligible snapshot retain the labeled FutScout fallback.
No visual change or OVR-based substitution into an official XI was introduced. Official source players without local IDs remain unresolved; the full registered EA squad remains separate.

Deterministic tests use synthetic fixtures, fake fetch, fake catalogue, fake audits and fake transactions. They do not execute either entrypoint and do not connect to PostgreSQL or API-Football.
Coverage includes both target identities, independent authorization, successful isolated writes, unresolved/conflict handling, fifth-request denial, invalid lineup/foreign team, duplicate snapshot, pinned Barcelona baseline, League/non-target drift, post-write failure and READ ONLY audit SQL. Existing persistence, guard, rendering and matcher regressions remain in the full suite.

Gates completed: npm test **461 PASS / 0 FAIL / 8 skipped (469 total)**, including 22 new tests; npx tsc --noEmit PASS; npm run lint PASS (0 errors/warnings); npm run build PASS; git diff --check PASS; npx prisma validate PASS.
The eight skipped cases are the existing opt-in HTTP SSR 404 suite; no production server or real HTTP smoke was run in this preparation.
Build/validation use non-routable local placeholders, no real database credentials. The known sandbox tsx ENOMEM requires authorized execution outside the sandbox, not a code workaround.

## Decision

Preparation can be accepted after gates pass; neither pilot has run. Recommend authorizing City alone first, auditing its result, then authorizing Real separately. Low player-ID coverage does not invalidate a correctly sourced official snapshot, but must be improved before broad expansion.
No Player ID, schema, migration, production UI, master branch or Production deployment change belongs to this phase.
