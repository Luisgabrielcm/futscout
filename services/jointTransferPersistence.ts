import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { canonicalJson } from "../lib/clubContexts"
import { jointHash, validateJointTransferPayload, type JointTransferPayload } from "../lib/jointTransferContexts"
import { inspectLoanBatch } from "../lib/jointTransferLoanSync"
import { prepareJointTransferSynchronization } from "./jointTransferSyncPreparation"
import { isRealOnlyTransferDecision } from "../lib/transferReadScope"
import { preservedGameHash, validateRealOnlyMovement } from "../lib/realOnlyTransfers"

type Db = Pick<PrismaClient, "$transaction">
type Selection = { revisionId: string; version: number; decisionReference: string }
export type JointCommitItem = { payload: JointTransferPayload; expectedSelection: Selection | null;
  expectedLegacyClubId: string | null; expectedPlayerUpdatedAt: string; expectedGameBaselineHash?: string }
export function prepareJointTransferCommit(items: readonly JointCommitItem[], decisionReference: string) {
  if (!items.length || !decisionReference.trim() || new Set(items.map(i => i.payload.eaPlayerId)).size !== items.length) throw new Error("JOINT_COMMIT_SCOPE_INVALID")
  for (const item of items) validateJointTransferPayload(item.payload)
  if (isRealOnlyTransferDecision(decisionReference)) for (const item of items) {
    if (item.expectedSelection !== null || item.expectedGameBaselineHash !== preservedGameHash(item.payload)) throw new Error("REAL_ONLY_NEW_SELECTION_AND_GAME_BASELINE_REQUIRED")
    validateRealOnlyMovement(item.payload, new Date().toISOString().slice(0, 10))
  }
  const inspected = inspectLoanBatch(items.flatMap(i => [i.payload.jointTransfer.game.loan, i.payload.jointTransfer.real?.loan,
    ...i.payload.jointTransfer.history].filter(r => r != null)), new Date().toISOString().slice(0, 10))
  if (inspected.review || inspected.rejected.length) throw new Error("JOINT_COMMIT_LOAN_REVIEW_REQUIRED")
  const content = { items, decisionReference }
  return { ...content, batchHash: jointHash(content) }
}
export type JointCommit = ReturnType<typeof prepareJointTransferCommit>
export type JointReceipt = { batchHash: string; decisionReference: string; entries: {
  eaId: string; previous: Selection | null; applied: Selection; contentHash: string
}[] }
async function playerAndClubs(tx: Prisma.TransactionClient, item: JointCommitItem) {
  const id = item.payload.eaPlayerId
  await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `joint-transfer:${id}`)
  await tx.$queryRawUnsafe('SELECT "externalId" FROM "Player" WHERE "externalId"=$1 FOR SHARE', id)
  const player = await tx.player.findUnique({ where: { externalId: id }, select: { clubId: true, updatedAt: true, eaImportVisibility: true } })
  if (!player || player.eaImportVisibility !== "PUBLIC" || player.clubId !== item.expectedLegacyClubId || player.updatedAt.toISOString() !== item.expectedPlayerUpdatedAt)
    throw new Error("JOINT_PLAYER_BASELINE_CHANGED")
  const refs = [...[item.payload.jointTransfer.game, item.payload.jointTransfer.real, item.payload.jointTransfer.futscoutProjection?.membership].flatMap(m => m ? [m.club, m.parentClub].filter(c => c !== null) : []),
    ...item.payload.jointTransfer.movements.flatMap(m => m.route ? [m.route.fromClub, m.route.toClub].filter(c => c !== null) : [])]
  const clubs = await tx.club.findMany({ where: { id: { in: refs.map(c => c.id) } }, select: { id: true, externalId: true, name: true, slug: true, league: { select: { id: true, name: true, slug: true } } } })
  for (const c of refs) {
    const actual = clubs.find(a => a.id === c.id)
    if (!actual || actual.externalId !== c.eaId || actual.name !== c.name || c.slug !== null && actual.slug !== c.slug ||
      c.league && (actual.league.id !== c.league.id || actual.league.name !== c.league.name || c.league.slug !== null && actual.league.slug !== c.league.slug)) throw new Error("JOINT_CLUB_BINDING_CHANGED")
  }
}
/** Explicit operator API only. Not imported by public readers, builds, sync startup or routes. */
export async function commitJointTransfers(db: Db, plan: JointCommit, authorization: { approvedBatchHash: string; target: "DISPOSABLE" | "PRODUCTION" }): Promise<JointReceipt> {
  plan = structuredClone(plan)
  if (authorization.approvedBatchHash !== plan.batchHash || !["DISPOSABLE", "PRODUCTION"].includes(authorization.target) ||
    prepareJointTransferCommit(plan.items, plan.decisionReference).batchHash !== plan.batchHash) throw new Error("JOINT_WRITE_NOT_AUTHORIZED")
  return db.$transaction(async tx => {
    const entries: JointReceipt["entries"] = []
    for (const item of [...plan.items].sort((a, b) => a.payload.eaPlayerId.localeCompare(b.payload.eaPlayerId))) {
      await playerAndClubs(tx, item)
      const payload = item.payload, eaId = payload.eaPlayerId, contentHash = jointHash(payload), revisionId = `joint-transfer:${eaId}:${contentHash}`
      const current = await tx.playerClubContextSelection.findUnique({ where: { eaPlayerId: eaId } })
      if (current?.revisionId === revisionId && current.decisionReference === plan.decisionReference) {
        if (current.version !== (item.expectedSelection?.version ?? 0) + 1) throw new Error("JOINT_REPLAY_VERSION_CHANGED")
        const revision = await tx.playerClubContextRevision.findUnique({ where: { id: revisionId } })
        if (!revision || revision.contentHash !== contentHash || jointHash(revision.payload) !== contentHash) throw new Error("JOINT_REPLAY_REVISION_MISMATCH")
        entries.push({ eaId, previous: item.expectedSelection, applied: { revisionId: current.revisionId, version: current.version, decisionReference: current.decisionReference }, contentHash }); continue
      }
      const selection = current ? { revisionId: current.revisionId, version: current.version, decisionReference: current.decisionReference } : null
      if (canonicalJson(selection) !== canonicalJson(item.expectedSelection)) throw new Error("JOINT_SELECTION_CAS_CONFLICT")
      if (current) {
        const priorRevision = await tx.playerClubContextRevision.findUnique({ where: { id: current.revisionId } })
        if (!priorRevision || jointHash(priorRevision.payload) !== priorRevision.contentHash) throw new Error("JOINT_PREVIOUS_REVISION_INVALID")
        const prior = priorRevision.payload as unknown as Partial<JointTransferPayload>
        if (prior.jointTransfer) {
          const transition = prepareJointTransferSynchronization({ before: [prior as JointTransferPayload], candidates: [payload],
            expectedBeforeHash: jointHash([prior]), asOf: new Date().toISOString().slice(0, 10), unverifiedRealEaIds: [] })
          if (transition.review.length) throw new Error("JOINT_CURRENT_LOAN_TRANSITION_REQUIRES_REVIEW")
        }
      }
      const snapshot = payload.game.snapshot
      const existingRef = await tx.eaRosterReference.findUnique({ where: { id: snapshot.id } })
      if (existingRef && (existingRef.contentHash !== snapshot.contentHash || canonicalJson(existingRef.metadata) !== canonicalJson(snapshot))) throw new Error("JOINT_REFERENCE_CONFLICT")
      if (!existingRef) await tx.eaRosterReference.create({ data: { id: snapshot.id, contentHash: snapshot.contentHash, metadata: snapshot as unknown as Prisma.InputJsonValue } })
      const existingRevision = await tx.playerClubContextRevision.findUnique({ where: { id: revisionId } })
      if (existingRevision && (existingRevision.eaPlayerId !== eaId || existingRevision.contentHash !== contentHash || canonicalJson(existingRevision.payload) !== canonicalJson(payload))) throw new Error("JOINT_REVISION_CONFLICT")
      if (!existingRevision) await tx.playerClubContextRevision.create({ data: { id: revisionId, eaPlayerId: eaId, rosterReferenceId: snapshot.id, contentHash, payload: payload as unknown as Prisma.InputJsonValue } })
      const applied = { revisionId, version: (current?.version ?? 0) + 1, decisionReference: plan.decisionReference }
      if (current) {
        const result = await tx.playerClubContextSelection.updateMany({ where: { eaPlayerId: eaId, ...selection! }, data: applied })
        if (result.count !== 1) throw new Error("JOINT_SELECTION_CAS_CONFLICT")
      } else await tx.playerClubContextSelection.create({ data: { eaPlayerId: eaId, ...applied } })
      entries.push({ eaId, previous: selection, applied, contentHash })
    }
    return { batchHash: plan.batchHash, decisionReference: plan.decisionReference, entries }
  }, { isolationLevel: "Serializable" })
}

/** History is retained. Rollback only restores pointers; version always increases per existing trigger. */
export async function rollbackJointTransfers(db: Db, receipt: JointReceipt, approvedReceiptHash: string) {
  if (jointHash(receipt) !== approvedReceiptHash) throw new Error("JOINT_ROLLBACK_NOT_AUTHORIZED")
  return db.$transaction(async tx => {
    for (const entry of [...receipt.entries].sort((a, b) => a.eaId.localeCompare(b.eaId))) {
      await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `joint-transfer:${entry.eaId}`)
      const current = await tx.playerClubContextSelection.findUnique({ where: { eaPlayerId: entry.eaId } })
      const expectedRollback = entry.previous ? { ...entry.previous, version: entry.applied.version + 1 } : null
      const actual = current ? { revisionId: current.revisionId, version: current.version, decisionReference: current.decisionReference } : null
      if (canonicalJson(actual) === canonicalJson(expectedRollback)) continue
      if (canonicalJson(actual) !== canonicalJson(entry.applied)) throw new Error("JOINT_ROLLBACK_INTERVENING_EDIT")
      if (expectedRollback) {
        const changed = await tx.playerClubContextSelection.updateMany({ where: { eaPlayerId: entry.eaId, ...entry.applied }, data: expectedRollback })
        if (changed.count !== 1) throw new Error("JOINT_ROLLBACK_INTERVENING_EDIT")
      } else {
        const changed = await tx.playerClubContextSelection.deleteMany({ where: { eaPlayerId: entry.eaId, ...entry.applied } })
        if (changed.count !== 1) throw new Error("JOINT_ROLLBACK_INTERVENING_EDIT")
      }
    }
    return { rolledBack: receipt.entries.length, preservedEvidence: true }
  }, { isolationLevel: "Serializable" })
}
