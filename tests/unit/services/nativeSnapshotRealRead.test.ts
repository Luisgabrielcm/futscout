import test from "node:test"
import assert from "node:assert/strict"
import { nativeSnapshotRealDecision, transferDecisionReadScope } from "../../../lib/transferReadScope"
import { freeAgentFixture, city, benfica } from "../../fixtures/jointTransfer"
import { jointHash } from "../../../lib/jointTransferContexts"
import { realGamePolicyHash } from "../../../lib/realGameProjection"
import { canonicalJson } from "../../../lib/clubContexts"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

test("native snapshot plus REAL requires an explicit valid decision; existing scopes remain unchanged", () => {
  assert.deepEqual(transferDecisionReadScope(nativeSnapshotRealDecision("a".repeat(64))), { contexts: ["REAL", "GAME"], gameView: "EA_SNAPSHOT" })
  assert.throws(() => nativeSnapshotRealDecision("invalid"), /HASH_INVALID/)
  for (const bad of ["ea-snapshot-real:v2:" + "a".repeat(64), "ea-snapshot-real:v1:invalid", "ea-snapshot-real:v1:" + "A".repeat(64)])
    assert.throws(() => transferDecisionReadScope(bad), /DECISION_INVALID/)
  assert.deepEqual(transferDecisionReadScope("real-only-transfer:v1:" + "b".repeat(64)), { contexts: ["REAL"], gameView: "EA_SNAPSHOT" })
  assert.deepEqual(transferDecisionReadScope("previous-paired-approval"), { contexts: ["REAL", "GAME"], gameView: "FUTSCOUT_PROJECTED" })
})
function fixture() {
  const payload = freeAgentFixture(), contentHash = jointHash(payload), decisionReference = nativeSnapshotRealDecision(contentHash)
  const revisionId = "native:" + contentHash, snapshot = payload.game.snapshot
  const row = { eaPlayerId: payload.eaPlayerId, revisionId, version: 1, decisionReference,
    revision: { eaPlayerId: payload.eaPlayerId, payload, contentHash, rosterReferenceId: snapshot.id,
      rosterReference: { id: snapshot.id, contentHash: snapshot.contentHash, metadata: snapshot } } }
  const index = { version: 2, policyHash: realGamePolicyHash, entries: [{ eaId: payload.eaPlayerId, selectionVersion: 1,
    revisionId, decisionReference, payloadHash: contentHash, snapshotId: snapshot.id, snapshotHash: snapshot.contentHash }] }
  const env = { VERCEL_ENV: "preview", CLUB_CONTEXTS_PREVIEW_READ_ONLY: "1", JOINT_TRANSFER_READ_ENABLED: "1",
    JOINT_REAL_GAME_PROJECTION_READ_ENABLED: "1", JOINT_REAL_GAME_POLICY_SHA256: realGamePolicyHash,
    JOINT_TRANSFER_READ_MANIFEST_SOURCE: "DATABASE_INDEX", JOINT_TRANSFER_READ_EA_IDS: payload.eaPlayerId,
    JOINT_TRANSFER_READ_MANIFEST_SHA256: jointHash(index) }
  let queries = 0
  const db = { playerClubContextSelection: { findMany: async () => { queries++; return [row] } },
    club: { findMany: async () => { queries++; return [city, benfica].map(c => ({ ...c, externalId: c.eaId })) } } }
  const reader = loadCatalogModule<typeof import("../../../services/jointTransferRead.server")>("services/jointTransferRead.server.ts", {
    "server-only": {}, "../lib/prisma": { prisma: db }, "../lib/clubContexts": { canonicalJson },
  })
  return { row, env, reader, db: db as unknown as Parameters<typeof reader.readJointTransferSelections>[1], queries: () => queries }
}
test("authenticated native readers keep GAME free agent, national side and REAL employment independent", async () => {
  const f = fixture(), before = structuredClone(f.row.revision.payload)
  const selections = await f.reader.readJointTransferSelections([f.row.eaPlayerId], f.db, f.env, "2026-11-25")
  const s = selections.get(f.row.eaPlayerId)!
  assert.equal(s.views.game?.clubState, "FREE_AGENT")
  assert.deepEqual(s.views.game?.nationalTeams, before.jointTransfer.game.nationalTeams)
  assert.equal(s.views.real?.playingClub?.id, benfica.id)
  assert.equal(s.payload.jointTransfer.futscoutProjection, undefined)
  assert.deepEqual(f.row.revision.payload, before)
  assert.equal(f.queries(), 3)
})
test("native readers remain disabled by default and unselected players cause no database reads", async () => {
  const f = fixture()
  assert.equal((await f.reader.readJointTransferSelections(undefined, f.db, {})).size, 0)
  assert.equal((await f.reader.readJointTransferSelections(["999999"], f.db, f.env)).size, 0)
  assert.equal(f.queries(), 0)
})
test("native membership still rejects payload tampering against the authenticated index", async () => {
  const f = fixture(); f.row.revision.payload.jointTransfer.game.state = "UNKNOWN"
  await assert.rejects(f.reader.readJointTransferSelections(undefined, f.db, f.env), /MISMATCH|PROVENANCE|INVALID/)
})
