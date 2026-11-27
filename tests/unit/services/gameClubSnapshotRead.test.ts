import test from "node:test"
import assert from "node:assert/strict"
import { jointFixture, city, benfica } from "../../fixtures/jointTransfer"
import { canonicalJson } from "../../../lib/clubContexts"
import { jointHash } from "../../../lib/jointTransferContexts"
import { realGamePolicyHash } from "../../../lib/realGameProjection"
import { gameClubSnapshotDecision } from "../../../lib/transferReadScope"
import { encodeJointReadIds } from "../../../lib/jointReadIds"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { jointCatalogFilter } from "../../../lib/jointTransferCatalog"

test("1303 GAME snapshot selections use bulk queries, preserve REAL scope and filter before pagination", async () => {
  const rows = Array.from({ length: 1303 }, (_, i) => {
    const payload = jointFixture(String(800001 + i))
    if (i > 0) { payload.real = null; payload.jointTransfer.real = null }
    payload.gameClubSnapshot = { version: 1, snapshot: { ...payload.game.snapshot, id: "new-synthetic-source", contentHash: "e".repeat(64) },
      evidenceHash: "f".repeat(64), nativeTeamIds: ["234"], nativeClubTeamIds: ["234"], economicsZeroBefore: false,
      membership: { ...structuredClone(payload.jointTransfer.game), club: benfica } }
    const contentHash = jointHash(payload), revisionId = "synthetic:" + payload.eaPlayerId
    return { eaPlayerId: payload.eaPlayerId, revisionId, version: 2, decisionReference: gameClubSnapshotDecision("a".repeat(64), i === 0 ? "PAIRED_NATIVE" : "GAME"),
      revision: { eaPlayerId: payload.eaPlayerId, payload, contentHash, rosterReferenceId: payload.game.snapshot.id,
        rosterReference: { id: payload.game.snapshot.id, contentHash: payload.game.snapshot.contentHash, metadata: payload.game.snapshot } } }
  })
  const index = { version: 2, policyHash: realGamePolicyHash, entries: rows.map(r => ({ eaId: r.eaPlayerId, revisionId: r.revisionId,
    selectionVersion: r.version, decisionReference: r.decisionReference, payloadHash: r.revision.contentHash, snapshotId: r.revision.rosterReferenceId, snapshotHash: r.revision.rosterReference.contentHash })) }
  let calls = 0
  const db = { playerClubContextSelection: { findMany: async ({ where }: { where: { eaPlayerId: { in: string[] } } }) => {
    calls++; return structuredClone(rows.filter(r => where.eaPlayerId.in.includes(r.eaPlayerId)))
  } }, club: { findMany: async () => { calls++; return [city, benfica].map(c => ({ ...c, externalId: c.eaId })) } } }
  const reader = loadCatalogModule<typeof import("../../../services/jointTransferRead.server")>("services/jointTransferRead.server.ts", {
    "server-only": {}, "../lib/prisma": { prisma: db }, "../lib/clubContexts": { canonicalJson },
  })
  const env = { VERCEL_ENV: "production", JOINT_TRANSFER_READ_ENABLED: "1", JOINT_TRANSFER_READ_PRODUCTION_ENABLED: "1",
    JOINT_REAL_GAME_PROJECTION_READ_ENABLED: "1", JOINT_REAL_GAME_POLICY_SHA256: realGamePolicyHash,
    JOINT_TRANSFER_READ_MANIFEST_SOURCE: "DATABASE_INDEX", JOINT_TRANSFER_READ_EA_IDS: encodeJointReadIds(index.entries.map(e => e.eaId)),
    JOINT_TRANSFER_READ_MANIFEST_SHA256: jointHash(index) }
  const result = await reader.readJointTransferSelections(undefined, db as never, env, "2026-11-27")
  assert.equal(result.size, 1303); assert.equal(calls, 3)
  assert.equal(result.get("800001")!.views.real!.playingClub!.id, benfica.id)
  assert.equal(result.get("800002")!.views.real, null)
  assert([...result.values()].every(s => s.views.game!.playingClub!.id === benfica.id))
  assert([...result.values()].every(s => s.views.snapshotGame!.playingClub!.id === city.id))
  const filter = jointCatalogFilter([...result.values()].map(s => s.payload), { membershipContext: "GAME", currentClub: benfica.id } as never)
  assert(JSON.stringify(filter.where).includes("800001")); assert(JSON.stringify(filter.where).includes("801303"))
  const publicPlayer = reader.applyJointPlayerPresentation({ club: null as { id: string } | null, league: null, salary: 1234 }, result.get("800001"))
  assert.equal(publicPlayer.club!.id, benfica.id); assert.equal(publicPlayer.salary, 1234)
  calls = 0
  await reader.readJointTransferSelections(["800001"], db as never, env, "2026-11-27")
  assert.equal(calls, 2)
})
