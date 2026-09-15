import assert from "node:assert/strict"
import test from "node:test"
import { runClubPlayerIdentityPipeline } from "../../../services/clubPlayerIdentityPipeline"
import { runMultiClubIdentityPipeline } from "../../../services/multiClubIdentityPipeline"
import { clubIdentityFixture, identityNow } from "../../fixtures/clubIdentity"

function confirmedIdentity() {
  const f = clubIdentityFixture(700, "synthetic-club")
  f.players[0].apiFootballId = f.roster[0].player.id
  f.players[0].attempt = { status: "matched", lastApiFootballId: f.roster[0].player.id, nextRetryAt: null }
  const weak = structuredClone(f.roster[0])
  weak.player.id = 9000
  weak.player.birth.date = null
  weak.player.nationality = null
  f.roster.push(weak)
  f.evidence.cache!.playerCount = f.roster.length
  return f
}
const run = (f: ReturnType<typeof confirmedIdentity>) =>
  runClubPlayerIdentityPipeline(f.config, f.evidence, identityNow)
const second = (f: ReturnType<typeof confirmedIdentity>) =>
  run(f).rows.find(r => r.providerPlayerId === f.roster[1].player.id)!

test("weak candidate cannot dispute a uniquely owned, strongly confirmed existing identity", () => {
  const f = confirmedIdentity(), before = structuredClone(f), r = run(f)
  assert.equal(r.rows[0].decision, "ALREADY_MATCHED")
  assert.equal(r.rows[1].decision, "REVIEW")
  assert.equal(r.rows[1].reason, "WEAK_CANDIDATE_WITH_CONFIRMED_OTHER_ID")
  assert.equal(r.rows[1].confidence, 55)
  assert.equal(r.rows[1].localCandidate?.apiFootballId, 1000)
  assert.equal(r.counts.CONFLICT, 0); assert.equal(r.counts.AUTO_MATCH, 0)
  assert.equal(r.reviewQueue.length, 1)
  assert.equal(r.writes, 0); assert.equal(r.apiCalls, 0)
  assert.deepEqual(f, before)
})

test("strong candidate with another provider ID remains CONFLICT even with an incumbent", () => {
  const f = confirmedIdentity()
  f.roster[1].player.birth.date = f.roster[0].player.birth.date
  f.roster[1].player.nationality = f.roster[0].player.nationality
  assert.equal(second(f).confidence, 100)
  assert.equal(second(f).reason, "PLAYER_HAS_OTHER_PROVIDER_ID")
  assert.equal(second(f).decision, "CONFLICT")
})

test("exact provider ownership remains ALREADY_MATCHED with no new pending match", () => {
  const f = confirmedIdentity()
  f.roster.pop(); f.evidence.cache!.playerCount = 1
  assert.equal(run(f).rows[0].reason, "EXISTING_ID_AND_ATTEMPT_CONSISTENT")
  assert.equal(run(f).counts.AUTO_MATCH, 0)
})

test("strong candidate with provider owned by another player remains CONFLICT", () => {
  const f = confirmedIdentity()
  f.players.push({ ...f.players[0], id: "another-owner", clubId: "other-club",
    apiFootballId: 9000, attempt: { status: "matched", lastApiFootballId: 9000, nextRetryAt: null } })
  f.roster[1].player.birth.date = f.roster[0].player.birth.date
  f.roster[1].player.nationality = f.roster[0].player.nationality
  assert.equal(second(f).reason, "PROVIDER_OWNED_BY_OTHER_PLAYER")
})

test("weak ambiguous candidates with no incumbent stay REVIEW, never writable", () => {
  const f = confirmedIdentity()
  f.players[0].apiFootballId = null; f.players[0].attempt = null
  f.roster[0].player.birth.date = null; f.roster[0].player.nationality = null
  const r = run(f)
  assert.equal(r.rows[0].margin, 0)
  assert.ok(r.rows.every(row => row.decision === "REVIEW"))
  assert.equal(r.counts.AUTO_MATCH, 0)
})

test("no local candidate stays UNRESOLVED", () => {
  const f = confirmedIdentity()
  f.roster[1].player.name = "Unrelated Name"
  f.roster[1].player.firstname = null; f.roster[1].player.lastname = null
  assert.equal(second(f).decision, "UNRESOLVED")
  assert.equal(second(f).localCandidate, null)
})

for (const mutation of ["missing-incumbent", "weak-incumbent", "inconsistent-attempt",
  "duplicate-incumbent-owner", "strong-second-provider"] as const) {
  test(`weak candidate does not downgrade conflict with ${mutation}`, () => {
    const f = confirmedIdentity()
    if (mutation === "missing-incumbent") { f.roster.shift(); f.evidence.cache!.playerCount-- }
    if (mutation === "weak-incumbent") f.roster[0].player.birth.date = null
    if (mutation === "inconsistent-attempt") f.players[0].attempt!.lastApiFootballId = 999
    if (mutation === "duplicate-incumbent-owner") f.players.push({ ...f.players[0], id: "duplicate-owner" })
    if (mutation === "strong-second-provider") {
      const rival = structuredClone(f.roster[0]); rival.player.id = 8000; rival.player.nationality = "France"
      f.roster.push(rival); f.evidence.cache!.playerCount++
    }
    assert.equal(run(f).rows.find(r => r.providerPlayerId === 9000)!.decision, "CONFLICT")
  })
}

// Cached sports identity fields only. No database fixture loader, image fetch or real IDs in production.
function llorenteFixture() {
  const f = confirmedIdentity()
  f.players[0].name = "Marcos Llorente"; f.players[0].slug = "marcos-llorente"
  f.players[0].dateOfBirth = new Date("1995-01-30T03:00:00Z")
  f.players[0].position = "LD"; f.players[0].secondaryPositions = ["MC", "PD"]
  f.players[0].apiFootballId = 753; f.players[0].attempt!.lastApiFootballId = 753
  Object.assign(f.roster[0].player, { id: 753, name: "Marcos Llorente", firstname: "Marcos", lastname: "Llorente Moreno",
    age: 30, birth: { date: "1995-01-30", place: "Madrid", country: "Spain" }, nationality: "Spain",
    height: "183", weight: "74", injured: false })
  Object.assign(f.roster[1].player, { id: 548707, name: "M. Llorente", firstname: null, lastname: null,
    age: 17, birth: { date: null, place: null, country: null }, nationality: null, height: null, weight: null, injured: false })
  f.roster[1].statistics[0].games!.position = "Attacker"
  return f
}

test("Marcos/753 remains consistent while cached 548707 evidence scores 47 and requires REVIEW", () => {
  const f = llorenteFixture(), before = structuredClone(f), r = run(f)
  const incumbent = r.rows.find(row => row.providerPlayerId === 753)!, weak = r.rows.find(row => row.providerPlayerId === 548707)!
  assert.equal(incumbent.decision, "ALREADY_MATCHED")
  assert.equal(incumbent.nameScore, 100); assert.equal(incumbent.confidence, 100)
  assert.equal(weak.nameScore, 80); assert.equal(weak.confidence, 47); assert.equal(weak.margin, 53)
  assert.equal(weak.top1?.providerId, 753); assert.equal(weak.top2?.providerId, 548707)
  assert.equal(weak.decision, "REVIEW"); assert.equal(weak.reason, "WEAK_CANDIDATE_WITH_CONFIRMED_OTHER_ID")
  assert.equal(r.counts.AUTO_MATCH, 0); assert.equal(r.localAssociations[0].decision, "ALREADY_MATCHED")
  assert.deepEqual(f, before)
})

test("multi-club proceeds after non-writable weak review but still stops at a real identity conflict", async () => {
  const f = confirmedIdentity(), next = clubIdentityFixture(701, "next-club")
  const loaded: string[] = []
  const execute = () => runMultiClubIdentityPipeline({ mode: "DRY_RUN", clubs: [f.config, next.config] }, {
    load: async config => {
      loaded.push(config.clubSlug)
      return { status: "READY", evidence: config.clubId === f.config.clubId ? f.evidence : next.evidence }
    }, audit: async () => true,
  }, identityNow)
  const r = await execute()
  assert.equal(r.stopped, false); assert.deepEqual(loaded, ["synthetic-club", "next-club"])
  assert.equal(r.clubs[0].summary.candidateCount, 0); assert.equal(r.selectedCount, 1)
  f.roster[1].player.birth.date = f.roster[0].player.birth.date
  f.roster[1].player.nationality = f.roster[0].player.nationality
  loaded.length = 0
  const blocked = await execute()
  assert.equal(blocked.stopReason, "STRUCTURAL_CONFLICT")
  assert.deepEqual(loaded, ["synthetic-club"]); assert.deepEqual(blocked.notExecutedClubs, ["next-club"])
})
