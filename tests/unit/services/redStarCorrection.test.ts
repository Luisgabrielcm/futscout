import assert from "node:assert/strict"
import { test } from "node:test"
import { RED_STAR, correctRedStar, reverseRedStarClubId, plannedRedStarCorrection, reconcileRedStar, type RedStarSnapshot, type RedStarStore } from "../../../services/redStarCorrection"
import { resolveAssetSource } from "../../../lib/assetPipeline"
import { publishRedStarReceipt, writeExclusiveDurable, reconciliationStates } from "../../../services/redStarReceipt"
import { mkdtemp, readFile, writeFile, rename, readdir, unlink, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const old = "2020-01-01T00:00:00.000Z", at = "2021-01-01T00:00:00.000Z"
function fixture(): RedStarSnapshot {
  return {
    club: { id: RED_STAR.clubId, externalId: RED_STAR.eaId, apiFootballId: 4396, name: "Red Star FC", slug: "red-star-fc",
      imageUrl: "https://ratings-images-prod.pulse.ea.com/FC25/full/player-shields/en/72139.png?width=250", leagueId: RED_STAR.leagueId, createdAt: old, updatedAt: old },
    identity: { id: RED_STAR.identityId, entityType: "CLUB", entityId: RED_STAR.clubId, provider: "api-football",
      providerEntityId: "4396", status: "VERIFIED", evidence: { source: "guarded-brand-asset-write" }, version: 1,
      verifiedAt: old, createdAt: old, updatedAt: old },
    asset: { id: RED_STAR.assetId, identityId: RED_STAR.identityId, assetType: "CREST",
      sourceUrl: "https://media.api-sports.io/football/teams/4396.png", storageUrl: null, contentHash: "a".repeat(64),
      version: 1, fetchedAt: old, rightsStatus: "REVIEW_REQUIRED", displayPolicy: "DISPLAY_ALLOWED",
      operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", operationalAuthorizedAt: old,
      operationalDecisionRef: "original-owner-decision", operatorRiskAccepted: true, riskAcceptedAt: old,
      riskAcceptedBy: "FutScout owner", riskReason: "Original risk", sourceTermsUrl: "https://www.api-football.com/terms",
      revocable: true, status: "ACTIVE", createdAt: old, updatedAt: old },
    playerIds: Array.from({ length: 25 }, (_, i) => `player-${i}`), assetIds: [RED_STAR.assetId],
    protectedHash: "unchanged-protected-data", otherClubOwners: [], otherIdentityOwners: [],
  }
}
function fake(initial = fixture(), options: { fail?: string; unknownCommit?: boolean; postReadFails?: boolean } = {}) {
  let state = structuredClone(initial), calls = 0
  const store: RedStarStore = {
    async read() { if (options.postReadFails) throw new Error("read failed"); return structuredClone(state) },
    async transaction(work) {
      calls++
      const draft = structuredClone(state)
      let reads = 0
      const result = await work({
        async read() { reads++; const value = structuredClone(draft)
          if (options.fail === "readback" && reads === 2) value.playerIds.pop()
          return value },
        async changeClub(before, after) { assert.deepEqual(draft.club, before); draft.club = structuredClone(after); return 1 },
        async changeIdentity(before, after) { if (options.fail === "identity") return 0
          assert.deepEqual(draft.identity, before); draft.identity = structuredClone(after); return 1 },
        async changeAsset(before, after) { if (options.fail === "asset") throw new Error("write failed")
          assert.deepEqual(draft.asset, before); draft.asset = structuredClone(after); return 1 },
      })
      state = draft
      if (options.unknownCommit) throw new Error("connection lost after callback")
      return result
    },
  }
  return { store, state: () => state, calls: () => calls }
}
const request = (expected = fixture()) => ({ expected, at, actor: "test operator", decisionRef: "test:correction" })

test("corrects only ID and quarantine, preserves history, league and all players; revoked crest resolves to fallback", async () => {
  const f = fake(), before = fixture(), result = await correctRedStar(f.store, request())
  assert.equal(result.status, "COMMITTED")
  assert.equal(f.calls(), 1)
  const after = f.state()
  assert.equal(after.club.apiFootballId, 104)
  assert.deepEqual(after.club, { ...before.club, apiFootballId: 104, updatedAt: at })
  assert.deepEqual(after.playerIds, before.playerIds)
  assert.equal(after.protectedHash, before.protectedHash)
  assert.equal(after.identity.status, "BLOCKED")
  assert.equal(after.identity.providerEntityId, "4396")
  assert.equal(after.identity.version, 2)
  assert.deepEqual(after.asset, { ...before.asset, operationalDecision: "REVOKED", displayPolicy: "DISPLAY_BLOCKED", version: 2, updatedAt: at })
  assert.deepEqual((after.identity.evidence as { correction: { before: unknown } }).correction.before,
    { club: before.club, identity: before.identity, asset: before.asset })
  assert.equal(resolveAssetSource({ ...after.asset, entityId: RED_STAR.clubId, publicationAllowedByServer: true,
    identity: { entityType: "club", provider: "api-football", providerEntityId: "4396", assetType: "CREST" } }, "club"), null)
  assert.equal(resolveAssetSource(after.club.imageUrl, "club"), null)
})

for (const field of ["otherClubOwners", "otherIdentityOwners"] as const) {
  test(`rejects 104 occupied through ${field}`, async () => {
    const expected = fixture(); expected[field] = ["conflicting-owner"]
    const f = fake(expected), result = await correctRedStar(f.store, request(expected))
    assert.equal(result.status, "REJECTED"); assert.equal(result.reason, "PROVIDER_OCCUPIED"); assert.equal(f.calls(), 0)
  })
}
for (const drift of ["version", "club", "players", "protected", "new-owner"] as const) {
  test(`rejects preflight drift: ${drift}`, async () => {
    const current = fixture()
    if (drift === "version") current.identity.version++
    if (drift === "club") current.club.updatedAt = at
    if (drift === "players") current.playerIds[0] = "replacement"
    if (drift === "protected") current.protectedHash = "changed"
    if (drift === "new-owner") current.otherClubOwners.push("104-owner")
    const f = fake(current), result = await correctRedStar(f.store, request())
    assert.equal(result.status, "ROLLED_BACK"); assert.deepEqual(f.state(), current)
  })
}
for (const fail of ["identity", "asset", "readback"]) {
  test(`integral rollback when ${fail} fails`, async () => {
    const f = fake(fixture(), { fail }), result = await correctRedStar(f.store, request())
    assert.equal(result.status, "ROLLED_BACK"); assert.deepEqual(f.state(), fixture()); assert.equal(f.calls(), 1)
  })
}
test("unknown commit and failed independent confirmation never trigger retries or claim rollback", async () => {
  for (const options of [{ unknownCommit: true }, { postReadFails: true }]) {
    const f = fake(fixture(), options), result = await correctRedStar(f.store, request())
    assert.equal(result.status, options.unknownCommit ? "INDETERMINATE_COMMIT" : "CONFIRMATION_FAILED")
    assert.equal(f.calls(), 1); assert.equal(result.retries, 0); assert.equal(f.state().club.apiFootballId, 104)
  }
})
test("explicit reversal clears provider ID and never restores 4396 or its crest; refuses drift", async () => {
  const f = fake(), receipt = await correctRedStar(f.store, request())
  const audit = { at: "2022-01-01T00:00:00.000Z", actor: "operator", decisionRef: "test:reversal" }
  const result = await reverseRedStarClubId(f.store, receipt, audit)
  assert.equal(result.status, "COMMITTED"); assert.equal(f.state().club.apiFootballId, null)
  assert.deepEqual(f.state().club, { ...fixture().club, apiFootballId: null, updatedAt: audit.at })
  assert.equal(f.state().identity.status, "BLOCKED"); assert.equal(f.state().identity.version, 3)
  assert.equal(f.state().asset.operationalDecision, "REVOKED"); assert.equal(f.state().asset.version, 2)
  assert.deepEqual(f.state().playerIds, fixture().playerIds)
  const rerun = await reverseRedStarClubId(f.store, receipt, audit)
  assert.equal(rerun.status, "ROLLED_BACK")
})

for (const phase of ["write", "publish", "success"] as const) {
  test(`receipt ${phase}: pending evidence survives until complete atomic publication`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "red-star-receipt-test-"))
    const path = join(directory, "receipt.json")
    const before = fixture(), after = plannedRedStarCorrection(request(before))
    const pending = JSON.stringify({ kind: "red-star-pending-v2", before, after })
    const final = JSON.stringify({ kind: "red-star-receipt-v1", result: { status: "COMMITTED", before, after } })
    try {
      await writeExclusiveDurable(path, pending)
      const operation = publishRedStarReceipt(path, final, {
        async write(temporary, bytes) {
          assert.equal(await readFile(path, "utf8"), pending)
          if (phase === "write") { await writeFile(temporary, bytes.slice(0, 15)); throw new Error("INJECTED_WRITE_FAILURE") }
          await writeExclusiveDurable(temporary, bytes)
        },
        async publish(temporary, target) {
          assert.equal(await readFile(path, "utf8"), pending)
          assert.equal(await readFile(temporary, "utf8"), final)
          if (phase === "publish") throw new Error("INJECTED_PUBLICATION_FAILURE")
          await rename(temporary, target)
        },
      })
      if (phase === "success") await operation
      else await assert.rejects(operation, /INJECTED_/)
      const persisted = await readFile(path, "utf8")
      assert.equal(persisted, phase === "success" ? final : pending)
      const states = reconciliationStates(JSON.parse(persisted))
      assert.equal((await reconcileRedStar({ read: async () => after }, states)).status, "MATCHES_EXPECTED")
      assert.equal((await reconcileRedStar({ read: async () => before }, states)).status, "MATCHES_BEFORE")
      assert.equal(await readFile(path, "utf8"), persisted)
    } finally {
      for (const file of await readdir(directory)) await unlink(join(directory, file))
      await rmdir(directory)
    }
  })
}

for (const status of ["INDETERMINATE_COMMIT", "CONFIRMATION_FAILED"] as const) {
  test(`reconciliation of ${status} compares every snapshot field and never writes`, async () => {
    const before = fixture(), after = plannedRedStarCorrection(request(before))
    const receipt = { kind: "red-star-receipt-v1", result: { status, before, after } }
    const original = JSON.stringify(receipt), states = reconciliationStates(receipt)
    for (const actual of [before, after]) {
      const f = fake(actual)
      const result = await reconcileRedStar(f.store, states)
      assert.equal(result.status, actual === before ? "MATCHES_BEFORE" : "MATCHES_EXPECTED")
      assert.equal(f.calls(), 0); assert.deepEqual(f.state(), actual)
    }
    for (const field of ["club", "identity", "asset", "playerIds", "protectedHash", "otherClubOwners"] as const) {
      const actual = structuredClone(after)
      if (field === "club") actual.club.externalId = "different-ea-id"
      if (field === "identity") actual.identity.version++
      if (field === "asset") actual.asset.version++
      if (field === "playerIds") actual.playerIds[0] = "replacement"
      if (field === "protectedHash") actual.protectedHash = "changed"
      if (field === "otherClubOwners") actual.otherClubOwners.push("conflict")
      const result = await reconcileRedStar({ read: async () => actual }, states)
      assert.equal(result.status, "DIVERGED"); assert.equal(result.matches[field].after, false)
    }
    assert.equal(JSON.stringify(receipt), original)
    await assert.rejects(reconcileRedStar({ read: async () => { throw new Error("READ_FAILED") } }, states), /READ_FAILED/)
  })
}

test("legacy pending markers without snapshots cannot be falsely reconciled", () => {
  assert.throws(() => reconciliationStates({ kind: "red-star-pending-v1", inputHash: "hash" }), /STATES_REQUIRED/)
})
