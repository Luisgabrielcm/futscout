import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { runClubPlayerIdentityPipeline, clubIdentityHash } from "../../../services/clubPlayerIdentityPipeline"
import { createClubIdentityAuthorizationSummary, planClubIdentityAutoWrite } from "../../../services/clubIdentityAuthorization"
import { parseClubIdentityPilotArgs } from "../../../services/clubIdentityPilotConfig"
import { clubIdentityFixture, identityNow, addIdentitySnapshot } from "../../fixtures/clubIdentity"

const run = (f = clubIdentityFixture()) => runClubPlayerIdentityPipeline(f.config, f.evidence, identityNow)
test("whole roster dry-run uses the real matcher without mutation, I/O or mandatory lineup participation", () => {
  const f = clubIdentityFixture(529, "fc-barcelona", 12), before = structuredClone(f)
  const r = run(f)
  assert.equal(r.totalProviderPlayers, 12); assert.equal(r.counts.AUTO_MATCH, 12)
  assert.equal(r.coverage.projected, 12); assert.equal(r.apiCalls, 0); assert.equal(r.writes, 0)
  assert.deepEqual(f, before)
})
for (const [team, slug] of [[50, "manchester-city"], [541, "real-madrid"]] as const) {
  test(`${slug} fixture: generic core has no Barcelona identity, team or season coupling`, () => {
    const f = clubIdentityFixture(team, slug, 2); f.config.season = 2027; f.evidence.cache!.season = 2027
    f.roster.forEach(r => r.statistics[0].league.season = 2027)
    const r = run(f); assert.equal(r.counts.AUTO_MATCH, 2); assert.equal(r.config.apiFootballTeamId, team)
  })
}
test("seven calibrated matches remain ALREADY_MATCHED, not pending writes", () => {
  const f = clubIdentityFixture(529, "fc-barcelona", 7)
  const ids = [396623, 2282, 851, 181701, 296667, 340626, 161928]
  f.players.forEach((p, i) => { p.apiFootballId = ids[i]; f.roster[i].player.id = ids[i]
    p.attempt = { status: "matched", lastApiFootballId: ids[i], nextRetryAt: null } })
  const r = run(f); assert.equal(r.counts.ALREADY_MATCHED, 7); assert.equal(r.counts.AUTO_MATCH, 0)
  assert.equal(r.localAssociations.length, 7); assert.deepEqual(createClubIdentityAuthorizationSummary(r).summary.orderedAutoMatchCandidates, [])
})
test("local already-associated player absent from current roster is separate, not a fabricated provider row", () => {
  const f = clubIdentityFixture(); f.players[0].apiFootballId = 9999
  f.players[0].attempt = { status: "matched", lastApiFootballId: 9999, nextRetryAt: null }
  const r = run(f); assert.equal(r.totalProviderPlayers, 1); assert.equal(r.localAssociations.length, 1)
  assert.equal(r.localAssociations[0].reason, "PROVIDER_NOT_IN_CURRENT_ROSTER"); assert.equal(r.localAssociations[0].inRoster, false)
  assert.equal(r.rows[0].decision, "CONFLICT")
})
test("legacy association without attempt is a reported no-op, never silently repaired", () => {
  const f = clubIdentityFixture(); f.players[0].apiFootballId = 1000
  assert.equal(run(f).rows[0].reason, "EXISTING_ID_LEGACY_WITHOUT_ATTEMPT")
})
test("same-name, same-birth Joan-style competing identity across clubs remains REVIEW", () => {
  const f = clubIdentityFixture(); f.players[0].name = "Joan García"
  Object.assign(f.roster[0].player, { name: "Joan García", firstname: "Joan", lastname: "García Pons" })
  f.players.push({ ...f.players[0], id: "rival", slug: "rival", clubId: "other", club: { name: "Other", apiFootballId: 50 } })
  const row = run(f).rows[0]
  assert.equal(row.decision, "REVIEW"); assert.equal(row.reason, "AMBIGUOUS_ROSTER_OR_LOCAL_IDENTITY")
  assert.equal(row.competingLocals.length, 1); assert.equal(row.competingLocals[0]!.confidence, 100)
})
test("two strong provider candidates at margin 10 remain REVIEW; reverse search cannot mask it", () => {
  const f = clubIdentityFixture(); const second = structuredClone(f.roster[0]); second.player.id = 1001; second.player.nationality = "France"
  f.roster.push(second); f.evidence.cache!.playerCount = 2
  const r = run(f); assert.equal(r.rows[0].margin, 10); assert.equal(r.rows[0].top2?.confidence, 90)
  assert.equal(r.rows[0].decision, "REVIEW"); assert.equal(r.counts.AUTO_MATCH, 0)
})
test("same-name different-birth local does not erase a unique safe match", () => {
  const f = clubIdentityFixture(); f.players.push({ ...f.players[0], id: "other", dateOfBirth: new Date("1990-01-01") })
  assert.equal(run(f).rows[0].decision, "AUTO_MATCH")
})
test("no local name evidence is UNRESOLVED without creating a Player", () => {
  const f = clubIdentityFixture(); f.players[0].name = "Entirely Unrelated"
  const r = run(f); assert.equal(r.rows[0].decision, "UNRESOLVED"); assert.equal(r.rows[0].localCandidate, null)
  assert.deepEqual(r.providerPlayersWithoutLocalCandidate, [1000])
})
test("name alone without birth is never AUTO_MATCH", () => {
  const f = clubIdentityFixture(); f.roster[0].player.birth.date = null
  assert.equal(run(f).rows[0].decision, "REVIEW")
})
test("occupied provider with another strong local identity is CONFLICT", () => {
  const f = clubIdentityFixture(); f.players.push({ ...f.players[0], id: "owner", apiFootballId: 1000,
    clubId: "other", club: { name: "Other", apiFootballId: 50 } })
  assert.equal(run(f).rows[0].reason, "PROVIDER_OWNED_BY_OTHER_PLAYER")
})
test("exact provider owner at another club is REVIEW_STALE_CLUB, never moved", () => {
  const f = clubIdentityFixture(); f.players[0].clubId = "other"; f.players[0].club = { name: "Other", apiFootballId: 50 }; f.players[0].apiFootballId = 1000
  const before = structuredClone(f); assert.equal(run(f).rows[0].reason, "REVIEW_STALE_CLUB"); assert.deepEqual(f, before)
})
test("unassociated strong identity at another club is stale review", () => {
  const f = clubIdentityFixture(); f.players[0].clubId = "other"; f.players[0].club = { name: "Other", apiFootballId: 50 }
  assert.equal(run(f).rows[0].reason, "REVIEW_STALE_CLUB")
})

test("weak shared token in local club cannot hide a strong stale-club identity", () => {
  const f = clubIdentityFixture(); f.players[0].name = "Frenkie de Jong"; f.players[0].apiFootballId = 538
  Object.assign(f.roster[0].player, { name: "Gabriel Jesus", firstname: "Gabriel Fernando", lastname: "de Jesus",
    birth: { date: "1997-04-03", place: null, country: null }, nationality: "Brazil" })
  f.players.push({ ...f.players[0], id: "external", slug: "gabriel-jesus", name: "Gabriel Jesus", apiFootballId: null,
    nationality: "Brazil", dateOfBirth: new Date("1997-04-03T04:00:00Z"), clubId: "other", club: { name: "Other", apiFootballId: 42 } })
  const row = run(f).rows[0]
  assert.equal(row.decision, "REVIEW"); assert.equal(row.reason, "REVIEW_STALE_CLUB")
  assert.equal(row.localCandidate?.slug, "gabriel-jesus"); assert.equal(row.confidence, 100)
  assert.equal(row.localTop1?.nameScore, 50)
})

test("Joan remains REVIEW with same-birth Fabrício Garcia at 82, even though roster margin is safe", () => {
  const f = clubIdentityFixture(); f.players[0].name = "Joan García"; f.players[0].position = "GOL"
  Object.assign(f.roster[0].player, { name: "Joan García", firstname: "Joan", lastname: "García Pons" })
  f.roster[0].statistics[0].games!.position = "Goalkeeper"
  f.players.push({ ...f.players[0], id: "rival", slug: "fabricio-garcia", name: "Fabrício Garcia", nationality: "Portugal",
    clubId: "other", club: { name: "Other", apiFootballId: 50 } })
  const row = run(f).rows[0]
  assert.equal(row.confidence, 100); assert.equal(row.decision, "REVIEW")
  assert.equal(row.reason, "AMBIGUOUS_ROSTER_OR_LOCAL_IDENTITY")
  assert.equal(row.competingLocals[0]!.confidence, 82); assert.equal(row.competingLocals[0]!.nameScore, 80)
})
test("duplicate provider ownership is CONFLICT and future plan is blocked", () => {
  const f = clubIdentityFixture(); f.players[0].apiFootballId = 1000
  f.players.push({ ...f.players[0], id: "duplicate" })
  const r = run(f); assert.equal(r.rows[0].reason, "DUPLICATE_PROVIDER_OWNER"); assert.ok(planClubIdentityAutoWrite(r).blockers.length)
})
test("contradictory attempt or birth on an existing ID is CONFLICT, not ALREADY_MATCHED", () => {
  const f = clubIdentityFixture(); f.players[0].apiFootballId = 1000
  f.players[0].attempt = { status: "matched", lastApiFootballId: 999, nextRetryAt: null }
  assert.equal(run(f).rows[0].decision, "CONFLICT")
  f.players[0].attempt = null; f.players[0].dateOfBirth = new Date("1980-01-01")
  assert.equal(run(f).rows[0].decision, "CONFLICT")
  assert.equal(run(f).localAssociations[0].decision, "CONFLICT")
})
test("future retry and due attempts remain reports, not a retry engine", () => {
  const f = clubIdentityFixture(); f.players[0].attempt = { status: "review", lastApiFootballId: 1000, nextRetryAt: new Date("2027-01-01") }
  assert.equal(run(f).rows[0].reason, "ATTEMPT_RETRY_BLOCKED")
  f.players[0].attempt.nextRetryAt = null; assert.equal(run(f).rows[0].reason, "EXISTING_ATTEMPT_REQUIRES_REVIEW")
})
test("a matched attempt with a null identity is a conflict, not a repair", () => {
  const f = clubIdentityFixture(); f.players[0].attempt = { status: "matched", lastApiFootballId: 1000, nextRetryAt: null }
  assert.equal(run(f).rows[0].reason, "MATCHED_ATTEMPT_WITHOUT_ID")
})
test("position mismatch and roster club mismatch cannot be rescued by score", () => {
  const f = clubIdentityFixture(); f.players[0].position = "GOL"
  assert.equal(run(f).rows[0].reason, "POSITION_NOT_CORROBORATED")
  f.roster[0].statistics[0].team.id = 50; assert.equal(run(f).rows[0].reason, "REVIEW_STALE_CLUB")
})
test("auxiliary snapshot absence/bench omission does not invent a participation prerequisite", () => {
  const f = clubIdentityFixture(); addIdentitySnapshot(f, false)
  assert.equal(run(f).rows[0].decision, "AUTO_MATCH"); assert.equal(run(f).rows[0].lineupEvidence.present, false)
  f.config.snapshot.requireParticipation = true; assert.equal(run(f).rows[0].reason, "REQUIRED_LINEUP_EVIDENCE_MISSING")
})
test("present snapshot corroborates exact provider ID; forged payload is rejected", () => {
  const f = clubIdentityFixture(); addIdentitySnapshot(f)
  assert.equal(run(f).rows[0].lineupEvidence.nameScore, 100)
  f.evidence.snapshot!.formation = "4-4-2"; assert.throws(() => run(f), /INVALID_SNAPSHOT/)
})
for (const [label, change, error] of [
  ["expired", (f: ReturnType<typeof clubIdentityFixture>) => { f.evidence.cache!.expiresAt = identityNow }, /VALID_ROSTER/],
  ["changed hash", (f: ReturnType<typeof clubIdentityFixture>) => { f.evidence.cacheRowHash = "different" }, /CACHE_HASH_CHANGED/],
  ["wrong club", (f: ReturnType<typeof clubIdentityFixture>) => { f.evidence.club.apiFootballId = 50 }, /CLUB_IDENTITY/],
  ["wrong cache team", (f: ReturnType<typeof clubIdentityFixture>) => { f.evidence.cache!.apiTeamId = 50 }, /VALID_ROSTER/],
  ["wrong season", (f: ReturnType<typeof clubIdentityFixture>) => { f.evidence.cache!.season = 2025 }, /VALID_ROSTER/],
  ["wrong statistics season", (f: ReturnType<typeof clubIdentityFixture>) => { f.roster[0].statistics[0].league.season = 2025 }, /INVALID_ROSTER/],
  ["duplicate provider", (f: ReturnType<typeof clubIdentityFixture>) => { f.roster.push(structuredClone(f.roster[0])); f.evidence.cache!.playerCount = 2 }, /DUPLICATE_ROSTER/],
  ["budget", (f: ReturnType<typeof clubIdentityFixture>) => { f.config.budget.maxRelevantPlayers = 0 }, /INVALID_CLUB/],
  ["AUTO_WRITE", (f: ReturnType<typeof clubIdentityFixture>) => { f.config.mode = "AUTO_WRITE" }, /AUTO_WRITE_DISABLED/],
] as const) test(`rejects ${label} before classification`, () => { const f = clubIdentityFixture(); change(f); assert.throws(() => run(f), error) })

test("candidate/summary hashes are deterministic and policy property insertion order is irrelevant", () => {
  const f = clubIdentityFixture(529, "fc-barcelona", 2), r = run(f)
  const a = createClubIdentityAuthorizationSummary(r)
  assert.deepEqual(a, createClubIdentityAuthorizationSummary(run(f))); assert.equal(a.writeEnabled, false)
  assert.equal(a.summary.validUntil, "2026-09-12T12:15:00.000Z")
  assert.equal(a.summary.candidateListHash, clubIdentityHash(a.summary.orderedAutoMatchCandidates))
  assert.equal(a.summaryHash, clubIdentityHash(a.summary))
  r.config.writePolicy = { zeroRetry: true, stopOnIndeterminateCommit: true, stopOnAuditMismatch: true,
    stopOnConflict: true, maxAutoWrites: 10 }
  assert.equal(createClubIdentityAuthorizationSummary(r).summaryHash, a.summaryHash)
})
for (const key of ["order", "updatedAt", "provider", "confidence", "margin", "cache", "snapshot", "club", "season", "budget"] as const) {
  test(`authorization hash binds ${key}`, () => {
    const r = run(clubIdentityFixture(529, "fc-barcelona", 2)), old = createClubIdentityAuthorizationSummary(r)
    if (key === "order") r.rows.reverse()
    if (key === "updatedAt") r.rows[0].localCandidate!.expectedUpdatedAt = "2026-09-10T00:00:00.001Z"
    if (key === "provider") r.rows[0].providerPlayerId++
    if (key === "confidence") r.rows[0].confidence!--
    if (key === "margin") r.rows[0].margin!--
    if (key === "cache") r.cache.rowHash = "changed"
    if (key === "snapshot") r.snapshotHash = "changed"
    if (key === "club") r.config.clubId = "another-club"
    if (key === "season") r.config.season++
    if (key === "budget") r.config.writePolicy.maxAutoWrites--
    assert.notEqual(createClubIdentityAuthorizationSummary(r).summaryHash, old.summaryHash)
  })
}
test("future plan caps ten candidates and skips non-auto outcomes without enabling persistence", () => {
  const r = run(clubIdentityFixture(529, "fc-barcelona", 12)), plan = planClubIdentityAutoWrite(r)
  assert.equal(plan.writeEnabled, false); assert.equal(plan.selectedAutoMatches, 10)
  assert.equal(plan.actions.filter(a => a.action === "DEFER_BUDGET").length, 2)
})
test("CLI is exact Barcelona READ ONLY; no write or other real club can be selected", () => {
  const args = ["--dry-run", "--club", "fc-barcelona", "--season", "2026"]
  assert.equal(parseClubIdentityPilotArgs(args).mode, "DRY_RUN")
  for (const bad of [["--write", ...args.slice(1)], [...args, "--confirmation", "x"],
    ["--dry-run", "--club", "manchester-city", "--season", "2026"], ["--dry-run", "--club", "real-madrid", "--season", "2026"]]) {
    assert.throws(() => parseClubIdentityPilotArgs(bad))
  }
  const source = readFileSync("scripts/runClubPlayerIdentityPipeline.ts", "utf8")
  assert.ok(source.indexOf("parseClubIdentityPilotArgs(process.argv") < source.indexOf('import("dotenv/config")'))
  assert.match(source, /HTTP_FORBIDDEN/); assert.doesNotMatch(source, /persist|\.create\(|\.update\(|--write/)
  const core = readFileSync("services/clubPlayerIdentityPipeline.ts", "utf8")
  assert.doesNotMatch(core, /529|Barcelona|dotenv|process\.env|fetch\(|Prisma/)
})
