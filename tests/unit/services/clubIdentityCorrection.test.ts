import assert from "node:assert/strict"
import { test } from "node:test"
import { planClubCorrection, applyClubCorrection, reconcileClubCorrection, type ClubCorrectionSnapshot, type ClubCorrectionStore } from "../../../services/clubIdentityCorrection"

const old = "2020-01-01T00:00:00.000Z", at = "2021-01-01T00:00:00.000Z"
const pin = { clubId: "club", eaId: "123", leagueId: "league", oldId: 10, newId: 20, evidenceRef: "exact-provider-evidence" }
function fixture(): ClubCorrectionSnapshot {
  return { club: { id: "club", name: "Club", slug: "club", externalId: "123", apiFootballId: 10, leagueId: "league", imageUrl: null, createdAt: old, updatedAt: old },
    identities: [{ id: "identity", entityType: "CLUB", entityId: "club", provider: "api-football", providerEntityId: "10", status: "VERIFIED", evidence: { original: true }, version: 1, verifiedAt: old, createdAt: old, updatedAt: old,
      assets: [{ id: "asset", identityId: "identity", assetType: "CREST", sourceUrl: "https://media.api-sports.io/football/teams/10.png", storageUrl: null, contentHash: "a".repeat(64), version: 1, fetchedAt: old, rightsStatus: "REVIEW_REQUIRED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", displayPolicy: "DISPLAY_ALLOWED", operationalAuthorizedAt: old, operationalDecisionRef: "original", operatorRiskAccepted: true, riskAcceptedAt: old, riskAcceptedBy: "owner", riskReason: "risk", sourceTermsUrl: null, revocable: true, status: "ACTIVE", createdAt: old, updatedAt: old }] }], playerIds: ["p1", "p2"], conflicts: [], protectedHash: "protected" }
}
function fake(initial = fixture(), failure = "") {
  let state = structuredClone(initial), calls = 0
  const store: ClubCorrectionStore = {
    read: async () => { if (failure === "confirmation") throw new Error("offline"); return structuredClone(state) },
    transaction: async work => {
      calls++; let draft = structuredClone(state)
      const result = await work({ read: async () => structuredClone(draft), apply: async (_, after) => {
        draft = structuredClone(after)
        if (failure === "asset") throw new Error("asset failure")
        if (failure === "players") draft.playerIds.pop()
      } })
      state = draft
      if (failure === "unknown") throw new Error("commit connection lost")
      return result
    },
  }
  return { store, state: () => state, calls: () => calls }
}
test("correction preserves EA, league, all players and historical evidence; quarantines previous crest", async () => {
  const before = fixture(), after = planClubCorrection(pin, before, at, "decision"), f = fake()
  assert.equal((await applyClubCorrection(f.store, before, after)).status, "COMMITTED_INDEPENDENT_READ_CONFIRMED")
  assert.deepEqual(after.club, { ...before.club, apiFootballId: 20, updatedAt: at })
  assert.deepEqual(after.playerIds, before.playerIds); assert.equal(after.protectedHash, before.protectedHash)
  assert.equal(after.identities[0].status, "BLOCKED"); assert.equal(after.identities[0].version, 2)
  assert.equal(after.identities[0].assets[0].operationalDecision, "REVOKED")
  assert.equal(after.identities[0].assets[0].displayPolicy, "DISPLAY_BLOCKED")
  assert.equal(after.identities[0].assets[0].sourceUrl, before.identities[0].assets[0].sourceUrl)
  assert.equal(f.calls(), 1)
})
test("null-ID reserve assignment creates no identity or asset", () => {
  const before = fixture(); before.club.apiFootballId = null; before.identities = []
  const after = planClubCorrection({ ...pin, oldId: null }, before, at, "decision")
  assert.equal(after.club.apiFootballId, 20); assert.deepEqual(after.identities, [])
})
test("legacy image cannot bypass quarantine fallback", () => {
  const before = fixture(); before.club.imageUrl = "https://media.api-sports.io/football/teams/10.png"
  assert.throws(() => planClubCorrection(pin, before, at, "decision"), /LEGACY_IMAGE_WOULD_BYPASS_FALLBACK/)
})
for (const invalid of ["owner", "version", "ea", "league"]) test(`rejects ${invalid} precondition`, () => {
  const before = fixture()
  if (invalid === "owner") before.conflicts.push("occupied")
  if (invalid === "version") before.identities[0].version++
  if (invalid === "ea") before.club.externalId = "different"
  if (invalid === "league") before.club.leagueId = "different"
  assert.throws(() => planClubCorrection(pin, before, at, "decision"))
})
for (const failure of ["asset", "players"]) test(`rollback integral on ${failure}`, async () => {
  const before = fixture(), f = fake(before, failure)
  assert.equal((await applyClubCorrection(f.store, before, planClubCorrection(pin, before, at, "decision"))).status, "ROLLED_BACK")
  assert.deepEqual(f.state(), before); assert.equal(f.calls(), 1)
})
test("changed expected state never writes", async () => {
  const before = fixture(), current = fixture(); current.playerIds.push("new")
  const f = fake(current)
  assert.equal((await applyClubCorrection(f.store, before, planClubCorrection(pin, before, at, "decision"))).status, "ROLLED_BACK")
  assert.deepEqual(f.state(), current)
})
for (const failure of ["unknown", "confirmation"]) test(`${failure} is not retried; reconciliation is read only`, async () => {
  const before = fixture(), after = planClubCorrection(pin, before, at, "decision"), f = fake(before, failure)
  assert.equal((await applyClubCorrection(f.store, before, after)).status, failure === "unknown" ? "INDETERMINATE_COMMIT" : "CONFIRMATION_FAILED")
  assert.equal((await reconcileClubCorrection({ read: async () => f.state() }, before, after)).status, "MATCHES_EXPECTED")
  assert.equal(f.calls(), 1)
})
