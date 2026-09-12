import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { evaluateCandidate } from "../../../services/apiFootballPlayerCandidate"
import { parseIdentityPilotArgs, planBarcelonaIdentityCoverage, requireIdentityRoster,
  type IdentityInput, type IdentityPlayer } from "../../../services/playerIdentityCoverage"
import type { ApiFootballTeamPlayer } from "../../../services/getApiFootballTeamPlayers"

function profile(id = 900, name = "Alex Example"): ApiFootballTeamPlayer {
  return { player: { id, name, firstname: "Alex", lastname: "Example", age: 26, birth: { date: "2000-01-01", place: null, country: null },
    nationality: "Spain", height: null, weight: null, injured: false, photo: null },
  statistics: [{ team: { id: 529, name: "Barcelona", logo: null }, league: { id: 140, name: "LaLiga", country: "Spain", logo: null, flag: null, season: 2026 },
    games: { position: "Midfielder" } }] }
}
function input(): IdentityInput {
  return { playerIds: ["local-a"], season: 2026, now: new Date("2026-09-11T12:00:00Z"), players: [{ id: "local-a", name: "Alex Example", apiFootballId: null,
    dateOfBirth: new Date("2000-01-01T08:00:00Z"), nationality: "Spain", position: "MC", secondaryPositions: [],
    club: { name: "FC Barcelona", apiFootballId: 529 }, attempt: null }],
  cache: { apiTeamId: 529, season: 2026, fetchedAt: new Date("2026-09-10T12:00:00Z"), expiresAt: new Date("2026-09-17T12:00:00Z"), playerCount: 1, players: [profile()] },
  lineup: { provider: "api-football", apiTeamId: 529, formation: "4-3-3", fetchedAt: "2026-09-10T12:00:00Z",
    fixture: { id: 100, date: "2026-09-09T19:00:00Z", status: "FT", home: { id: 529, name: "Barcelona" }, away: { id: 50, name: "City" }, competition: { id: 2, name: "Champions League" } },
    startXI: Array.from({ length: 11 }, (_, i) => ({ apiFootballId: 900 + i, name: i === 0 ? "A. Example" : `Other ${i}`, position: "M", grid: null, number: i + 1 })), substitutes: [] } }
}
const outcome = (i: IdentityInput) => planBarcelonaIdentityCoverage(i).rows[0]
const addLocal = (i: IdentityInput, changes: Partial<IdentityPlayer>) => i.players.push({ ...i.players[0], id: "local-b", ...changes })

test("unique null-ID candidate uses the existing score and exact roster/lineup ID; AUTO_MATCH without writes", () => {
  const i = input(), before = structuredClone(i), r = planBarcelonaIdentityCoverage(i)
  assert.equal(r.rows[0].decision, "AUTO_MATCH"); assert.equal(r.rows[0].sourcePlayerId, 900)
  assert.equal(r.rows[0].score, 100); assert.equal(r.rows[0].nameScore, 100)
  assert.deepEqual(r.counts, { AUTO_MATCH: 1, REVIEW: 0, UNRESOLVED: 0, CONFLICT: 0 })
  assert.equal(r.apiCalls, 0); assert.equal(r.writes, 0); assert.deepEqual(i, before)
})
test("extracted evaluator preserves normalization, birth, club and confidence contract", () => {
  const i = input(), candidate = profile(); candidate.player.nationality = "Netherlands"
  const r = evaluateCandidate({ player: { ...i.players[0], name: "ÁLEX Example", nationality: "Holland", club: { name: "FC Barcelona" } }, candidate, apiTeamId: 529 })!
  assert.equal(r.nameScore, 100); assert.equal(r.nationalityMatches, true); assert.equal(r.birthMatches, true)
  assert.equal(r.confidence, 100); assert.equal(r.classification, "MATCH FORTE"); assert.equal(r.canAutoSave, true); assert.equal(r.saved, false)
})
test("same name alone cannot auto-match without birth evidence", () => {
  const i = input(); i.players[0].dateOfBirth = null
  assert.equal(outcome(i).decision, "REVIEW"); assert.equal(outcome(i).birthMatches, false)
})
test("exact provider ID already owned by this player is not another write", () => {
  const i = input(); i.players[0].apiFootballId = 900
  assert.equal(outcome(i).reason, "ALREADY_ASSOCIATED_NO_WRITE")
})
test("conflicting existing local ID is CONFLICT and fail-fast skips the next player", () => {
  const i = input(); i.players[0].apiFootballId = 999; addLocal(i, { name: "Other Person", apiFootballId: null }); i.playerIds.push("local-b")
  const r = planBarcelonaIdentityCoverage(i)
  assert.equal(r.rows[0].decision, "CONFLICT"); assert.equal(r.failedFast, true)
  assert.equal(r.rows.length, 1); assert.deepEqual(r.remainingPlayerIds, ["local-b"]); assert.equal(r.writes, 0)
})
test("provider ID owned by another player is CONFLICT", () => {
  const i = input(); addLocal(i, { name: "Someone Else", apiFootballId: 900 })
  assert.equal(outcome(i).decision, "CONFLICT")
})
test("duplicate provider ID anywhere in catalog fails before processing", () => {
  const i = input(); i.players[0].apiFootballId = 999; addLocal(i, { apiFootballId: 999 })
  assert.throws(() => planBarcelonaIdentityCoverage(i), /DUPLICATE_CATALOG_PROVIDER_ID/)
})
test("club mismatch/stale local club requires REVIEW and fail-stop", () => {
  const i = input(); i.players[0].club = { name: "Other Club", apiFootballId: 50 }
  assert.equal(outcome(i).reason, "CLUB_MISMATCH_OR_STALE"); assert.equal(planBarcelonaIdentityCoverage(i).failedFast, true)
})
test("roster team mismatch cannot be rescued by a matching team name", () => {
  const i = input(), p = profile(); p.statistics[0].team.id = 50; i.cache!.players = [p]
  assert.equal(outcome(i).reason, "CLUB_MISMATCH_OR_STALE")
})
test("same-name, same-birth local candidates require REVIEW, even across clubs", () => {
  const i = input(); addLocal(i, { club: { name: "Other Club", apiFootballId: 50 } })
  assert.equal(outcome(i).reason, "AMBIGUOUS_ROSTER_OR_LOCAL_IDENTITY")
})
test("two strong provider candidates cannot bypass the existing margin", () => {
  const i = input(); i.cache!.players = [profile(), profile(901)]; i.cache!.playerCount = 2
  assert.equal(outcome(i).reason, "AMBIGUOUS_ROSTER_OR_LOCAL_IDENTITY"); assert.equal(outcome(i).margin, 0)
})
test("pilot rejects two strong candidates even at the general matcher margin boundary", () => {
  const i = input(), second = profile(901); second.player.nationality = "France"
  i.cache!.players = [profile(), second]; i.cache!.playerCount = 2
  assert.equal(outcome(i).margin, 10); assert.equal(outcome(i).decision, "REVIEW")
  assert.equal(planBarcelonaIdentityCoverage(i).failedFast, true)
})
test("same-name local player with different birth does not erase strong unique evidence", () => {
  const i = input(); addLocal(i, { dateOfBirth: new Date("1990-01-01"), club: { name: "Other Club", apiFootballId: 50 } })
  assert.equal(outcome(i).decision, "AUTO_MATCH")
})
test("roster and lineup disagree on ID: REVIEW, never name-based association", () => {
  const i = input(); i.lineup.startXI[0].apiFootballId = 999
  assert.equal(outcome(i).reason, "ROSTER_LINEUP_DISAGREEMENT")
})
test("roster and lineup same ID but incompatible names: REVIEW", () => {
  const i = input(); i.lineup.startXI[0].name = "Unrelated Person"
  assert.equal(outcome(i).reason, "ROSTER_LINEUP_DISAGREEMENT")
})
test("no name evidence produces UNRESOLVED", () => {
  const i = input(); i.players[0].name = "Unrelated Person"
  assert.equal(outcome(i).decision, "UNRESOLVED")
})
test("position mismatch is REVIEW without changing matcher weights", () => {
  const i = input(); i.players[0].position = "GOL"
  assert.equal(outcome(i).reason, "POSITION_NOT_CORROBORATED"); assert.equal(outcome(i).score, 100)
})
test("future retry is respected; no attempt created", () => {
  const i = input(); i.players[0].attempt = { status: "weak", nextRetryAt: new Date("2026-10-02T00:00:00Z") }
  assert.equal(outcome(i).reason, "ATTEMPT_RETRY_BLOCKED"); assert.equal(planBarcelonaIdentityCoverage(i).writes, 0)
})
test("matched attempt with null ID is not silently retried", () => {
  const i = input(); i.players[0].attempt = { status: "matched", nextRetryAt: null }
  assert.equal(outcome(i).reason, "ATTEMPT_RETRY_BLOCKED")
})
test("retry due now allows the existing matcher gates", () => {
  const i = input(); i.players[0].attempt = { status: "review", nextRetryAt: i.now }
  assert.equal(outcome(i).decision, "AUTO_MATCH")
})
test("missing, expired, future-dated or wrong-season roster cannot use the API", () => {
  const i = input()
  assert.throws(() => requireIdentityRoster(null, 2026, i.now), /FRESH_ROSTER_REQUIRED/)
  assert.throws(() => requireIdentityRoster({ ...i.cache!, expiresAt: i.now }, 2026, i.now), /FRESH_ROSTER_REQUIRED/)
  assert.throws(() => requireIdentityRoster({ ...i.cache!, fetchedAt: new Date("2026-09-12") }, 2026, i.now), /FRESH_ROSTER_REQUIRED/)
  assert.throws(() => requireIdentityRoster({ ...i.cache!, season: 2024 }, 2026, i.now), /FRESH_ROSTER_REQUIRED/)
})
test("empty, count-mismatched or malformed roster is rejected", () => {
  const i = input()
  for (const players of [[], [{ player: {} }], [null]]) assert.throws(() => requireIdentityRoster({ ...i.cache!, players }, 2026, i.now), /INVALID_ROSTER/)
  assert.throws(() => requireIdentityRoster({ ...i.cache!, playerCount: 2 }, 2026, i.now), /INVALID_ROSTER/)
})
test("duplicate roster IDs are not silently merged by the dry-run", () => {
  const i = input(); i.cache!.players = [profile(), profile()]; i.cache!.playerCount = 2
  assert.throws(() => planBarcelonaIdentityCoverage(i), /DUPLICATE_ROSTER_PROVIDER_ID/)
})
test("wrong season/statistics and invalid IDs fail closed", () => {
  const i = input(), p = profile(); p.statistics[0].league.season = 2024; i.cache!.players = [p]
  assert.throws(() => planBarcelonaIdentityCoverage(i), /INVALID_ROSTER/)
  p.statistics[0].league.season = 2026; p.player.id = -1
  assert.throws(() => planBarcelonaIdentityCoverage(i), /INVALID_ROSTER/)
})
test("old or non-Barcelona snapshot is not identity evidence for this pilot", () => {
  const i = input(); i.lineup.fixture.date = "2026-07-01T00:00:00Z"
  assert.throws(() => planBarcelonaIdentityCoverage(i), /RECENT_BARCELONA_SNAPSHOT_REQUIRED/)
  i.lineup.fixture.date = "2026-09-09T00:00:00Z"; i.lineup.apiTeamId = 541
  assert.throws(() => planBarcelonaIdentityCoverage(i), /RECENT_BARCELONA_SNAPSHOT_REQUIRED/)
})
test("duplicate lineup IDs fail before evaluation", () => {
  const i = input(); i.lineup.startXI[1].apiFootballId = 900
  assert.throws(() => planBarcelonaIdentityCoverage(i), /DUPLICATE_LINEUP_ID/)
})
test("explicit allowlist cannot be empty, duplicate, too large or missing from catalog", () => {
  for (const ids of [[], ["local-a", "local-a"], Array.from({ length: 6 }, (_, i) => `p${i}`)]) {
    assert.throws(() => planBarcelonaIdentityCoverage({ ...input(), playerIds: ids }), /MAX_FIVE/)
  }
  assert.throws(() => planBarcelonaIdentityCoverage({ ...input(), playerIds: ["absent"] }), /REQUESTED_PLAYER_NOT_FOUND/)
})
test("CLI requires exact dry-run, explicit 2026 season and bounded IDs; write never accepted", () => {
  const id = "c1234567890123456789012345", args = ["--dry-run", "--season", "2026", "--player-ids", id]
  assert.deepEqual(parseIdentityPilotArgs(args), { season: 2026, playerIds: [id] })
  for (const bad of [[], ["--write", ...args.slice(1)], [...args, "--write"], ["--dry-run", "--season", "2024", "--player-ids", id], [...args.slice(0, 4), `${id},${id}`]]) {
    assert.throws(() => parseIdentityPilotArgs(bad))
  }
})
test("runner source enforces READ ONLY and no operational imports/writes; it is not executed by tests", () => {
  const source = readFileSync("scripts/runBarcelonaPlayerIdentityPilot.ts", "utf8")
  assert.match(source, /SET TRANSACTION READ ONLY/); assert.match(source, /isolationLevel: "RepeatableRead"/)
  assert.ok(source.indexOf("dispatchBarcelonaIdentityRunner(process.argv") < source.indexOf('import("dotenv/config")'))
  assert.match(source, /HTTP_FORBIDDEN_IN_IDENTITY_PILOT/)
  assert.doesNotMatch(source, /\.(?:create|update|upsert|delete|updateMany|deleteMany)\s*\(/)
  assert.doesNotMatch(source, /import\([^)]*(?:resolveApiFootball|syncApiFootball|getApiFootballTeamPlayers)/)
})
