import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import type { CurrentClubProposal } from "../types/currentClubV2"
import { CURRENT_CLUB_V1_MIGRATION_ALLOWLIST, type CurrentClubV1MigrationAudit,
  type CurrentClubV1MigrationSnapshot, type CurrentClubV1MigrationStore, type LegacyCurrentClubSource } from "./currentClubV1Migration"

const iso = (value: Date | null) => value?.toISOString() ?? null

async function readSnapshot(tx: Prisma.TransactionClient): Promise<CurrentClubV1MigrationSnapshot> {
  const ids = CURRENT_CLUB_V1_MIGRATION_ALLOWLIST.map(item => item.playerId)
  const [states, observations, proposals, approvedCount] = await Promise.all([
    tx.playerCurrentClubState.findMany({ include: {
      player: { select: { id: true, name: true, apiFootballId: true } } } }),
    tx.playerTransferObservation.findMany({ where: { playerId: { in: ids } },
      select: { playerId: true, providerPlayerId: true, contentHash: true, toProviderTeamId: true, transferDate: true } }),
    tx.playerCurrentClubProposal.findMany({ where: { playerId: { in: ids } }, orderBy: [{ playerId: "asc" }, { revision: "asc" }] }),
    tx.playerApprovedCurrentClub.count(),
  ])
  const sources: LegacyCurrentClubSource[] = states.map(row => ({
    player: { id: row.player.id, name: row.player.name, providerPlayerId: row.player.apiFootballId },
    state: { playerId: row.playerId, clubId: row.clubId, providerTeamId: row.providerTeamId,
      effectiveSince: iso(row.effectiveSince), decision: row.decision, evidenceHash: row.evidenceHash,
      policyVersion: row.policyVersion, evidence: structuredClone(row.evidence), evaluatedAt: row.evaluatedAt.toISOString(), status: row.status },
    observations: observations.filter(item => item.playerId === row.playerId).map(item => {
      if (item.providerPlayerId !== row.player.apiFootballId) throw new Error("OBSERVATION_PLAYER_MISMATCH")
      return { ...item, transferDate: iso(item.transferDate) }
    }),
  }))
  return { sources, approvedCount, proposals: proposals.map(row => ({ id: row.id, playerId: row.playerId,
    providerPlayerId: row.providerPlayerId, revision: row.revision, version: row.version,
    baseApprovedVersion: row.baseApprovedVersion, proposedClubId: row.proposedClubId,
    proposedProviderTeamId: row.proposedProviderTeamId, effectiveSince: iso(row.effectiveSince), decision: row.decision,
    evidenceHash: row.evidenceHash, observationHashes: [...row.observationHashes], policyVersion: row.policyVersion,
    replacementPolicy: row.replacementPolicy, evidence: structuredClone(row.evidence) as CurrentClubProposal["evidence"],
    warnings: [...row.warnings], supportingEvidence: structuredClone(row.supportingEvidence) as CurrentClubProposal["supportingEvidence"],
    contradictingEvidence: structuredClone(row.contradictingEvidence) as CurrentClubProposal["contradictingEvidence"],
    status: row.status, statusReason: row.statusReason, evaluatedAt: row.evaluatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), supersededById: row.supersededById,
    sourceLegacyStateId: row.sourceLegacyStateId })) }
}

const tables = ["Player", "Club", "PlayerTransferObservation", "PlayerCurrentClubState", "PlayerApprovedCurrentClub",
  "PlayerTransfer", "BrandAssetIdentity", "BrandAsset"] as const

async function audit(db: Pick<PrismaClient, "$transaction">): Promise<CurrentClubV1MigrationAudit> {
  return withPrismaReadOnly(db, async tx => {
    const read = async (name: typeof tables[number] | "PlayerCurrentClubProposal") =>
      (await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
        `SELECT count(*)::text count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) hash FROM "${name}" t`))[0]
    return { protected: Object.fromEntries(await Promise.all(tables.map(async name => [name, await read(name)]))) as CurrentClubV1MigrationAudit["protected"],
      proposals: await read("PlayerCurrentClubProposal") }
  })
}

function transactionPort(tx: Prisma.TransactionClient) {
  return { read: () => readSnapshot(tx), async create(proposal: CurrentClubProposal) {
    await tx.playerCurrentClubProposal.create({ data: { id: proposal.id, playerId: proposal.playerId,
      providerPlayerId: proposal.providerPlayerId, revision: proposal.revision, version: proposal.version,
      baseApprovedVersion: proposal.baseApprovedVersion, proposedClubId: proposal.proposedClubId,
      proposedProviderTeamId: proposal.proposedProviderTeamId,
      effectiveSince: proposal.effectiveSince ? new Date(proposal.effectiveSince) : null, decision: proposal.decision,
      evidenceHash: proposal.evidenceHash, observationHashes: [...proposal.observationHashes],
      policyVersion: proposal.policyVersion, replacementPolicy: proposal.replacementPolicy,
      evidence: proposal.evidence as unknown as Prisma.InputJsonValue, warnings: [...proposal.warnings],
      supportingEvidence: proposal.supportingEvidence as unknown as Prisma.InputJsonValue,
      contradictingEvidence: proposal.contradictingEvidence as unknown as Prisma.InputJsonValue,
      status: proposal.status, statusReason: proposal.statusReason, evaluatedAt: new Date(proposal.evaluatedAt),
      createdAt: new Date(proposal.createdAt), updatedAt: new Date(proposal.updatedAt),
      supersededById: proposal.supersededById, sourceLegacyStateId: proposal.sourceLegacyStateId } })
  } }
}

// Inert factory: no singleton, env, CLI, network or automatic execution.
export function createPrismaCurrentClubV1MigrationStore(db: Pick<PrismaClient, "$transaction">): CurrentClubV1MigrationStore {
  return { audit: () => audit(db), read: () => withPrismaReadOnly(db, readSnapshot),
    transaction: work => db.$transaction(tx => work(transactionPort(tx)),
      { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 }) }
}
