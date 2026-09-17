import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import type { ApprovedCurrentClub, CurrentClubProposal } from "../types/currentClubV2"
import type { PromotionExpectation } from "../lib/currentClubModelV2"
import type { CurrentClubPromotionAudit, CurrentClubPromotionSource, CurrentClubPromotionStore } from "./currentClubPromotion"

const iso = (value: Date | null) => value?.toISOString() ?? null

const proposal = (row: {
  id: string; playerId: string; providerPlayerId: number; revision: number; version: number; baseApprovedVersion: number
  proposedClubId: string | null; proposedProviderTeamId: number | null; effectiveSince: Date | null; decision: string
  evidenceHash: string; observationHashes: string[]; policyVersion: string; replacementPolicy: string; evidence: unknown
  warnings: string[]; supportingEvidence: unknown; contradictingEvidence: unknown; status: CurrentClubProposal["status"]
  statusReason: string; evaluatedAt: Date; createdAt: Date; updatedAt: Date; supersededById: string | null
  sourceLegacyStateId: string | null
}): CurrentClubProposal => ({
  id: row.id, playerId: row.playerId, providerPlayerId: row.providerPlayerId, revision: row.revision, version: row.version,
  baseApprovedVersion: row.baseApprovedVersion, proposedClubId: row.proposedClubId,
  proposedProviderTeamId: row.proposedProviderTeamId, effectiveSince: iso(row.effectiveSince), decision: row.decision,
  evidenceHash: row.evidenceHash, observationHashes: [...row.observationHashes], policyVersion: row.policyVersion,
  replacementPolicy: row.replacementPolicy, evidence: structuredClone(row.evidence) as CurrentClubProposal["evidence"],
  warnings: [...row.warnings], supportingEvidence: structuredClone(row.supportingEvidence) as CurrentClubProposal["supportingEvidence"],
  contradictingEvidence: structuredClone(row.contradictingEvidence) as CurrentClubProposal["contradictingEvidence"],
  status: row.status, statusReason: row.statusReason, evaluatedAt: row.evaluatedAt.toISOString(),
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), supersededById: row.supersededById,
  sourceLegacyStateId: row.sourceLegacyStateId,
})

const approved = (row: {
  playerId: string; approvedClubId: string | null; approvedProviderTeamId: number | null; effectiveSince: Date | null
  evidenceHash: string; approvedAt: Date; source: string; decision: string; metadata: unknown; version: number
  createdAt: Date; updatedAt: Date; sourceProposalId: string
} | null): ApprovedCurrentClub | null => row && ({
  playerId: row.playerId, approvedClubId: row.approvedClubId, approvedProviderTeamId: row.approvedProviderTeamId,
  effectiveSince: iso(row.effectiveSince), evidenceHash: row.evidenceHash, approvedAt: row.approvedAt.toISOString(),
  source: row.source, decision: row.decision, metadata: structuredClone(row.metadata) as Record<string, unknown>,
  version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  sourceProposalId: row.sourceProposalId,
})

async function readSource(tx: Prisma.TransactionClient, playerId: string): Promise<CurrentClubPromotionSource> {
  const row = await tx.player.findUnique({ where: { id: playerId }, select: {
    id: true, name: true, apiFootballId: true, clubId: true, updatedAt: true,
    approvedCurrentClub: true,
    currentClubProposals: { orderBy: { revision: "asc" }, include: {
      proposedClub: { select: { id: true, apiFootballId: true } },
    } },
    transferObservations: { select: { playerId: true, providerPlayerId: true, contentHash: true,
      toProviderTeamId: true, transferDate: true } },
  } })
  if (!row) throw new Error("PROMOTION_PLAYER_NOT_FOUND")
  return {
    player: { id: row.id, name: row.name, providerPlayerId: row.apiFootballId, eaClubId: row.clubId,
      updatedAt: row.updatedAt.toISOString() },
    aggregate: { playerId: row.id, approved: approved(row.approvedCurrentClub),
      proposals: row.currentClubProposals.map(proposal) },
    destinationClubs: row.currentClubProposals.flatMap(item => item.proposedClub
      ? [{ id: item.proposedClub.id, providerTeamId: item.proposedClub.apiFootballId }] : []),
    observations: row.transferObservations.map(item => ({ ...item, transferDate: iso(item.transferDate) })),
  }
}

const protectedTables = ["Player", "Club", "PlayerTransferObservation", "PlayerCurrentClubState", "PlayerTransfer",
  "BrandAssetIdentity", "BrandAsset"] as const

async function audit(db: Pick<PrismaClient, "$transaction">): Promise<CurrentClubPromotionAudit> {
  return withPrismaReadOnly(db, async tx => {
    const read = async (name: typeof protectedTables[number] | "PlayerCurrentClubProposal" | "PlayerApprovedCurrentClub") =>
      (await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
        `SELECT count(*)::text count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) hash FROM "${name}" t`))[0]
    return {
      protected: Object.fromEntries(await Promise.all(protectedTables.map(async name => [name, await read(name)]))) as CurrentClubPromotionAudit["protected"],
      proposals: await read("PlayerCurrentClubProposal"), approved: await read("PlayerApprovedCurrentClub"),
    }
  })
}

function transactionPort(tx: Prisma.TransactionClient) {
  return {
    read: (playerId: string) => readSource(tx, playerId),
    async promote(expected: PromotionExpectation, nextApproved: ApprovedCurrentClub, nextProposal: CurrentClubProposal) {
      let approvedWrites: number
      if (expected.approvedVersion === 0) {
        await tx.playerApprovedCurrentClub.create({ data: {
          playerId: nextApproved.playerId, approvedClubId: nextApproved.approvedClubId,
          approvedProviderTeamId: nextApproved.approvedProviderTeamId,
          effectiveSince: nextApproved.effectiveSince ? new Date(nextApproved.effectiveSince) : null,
          evidenceHash: nextApproved.evidenceHash, approvedAt: new Date(nextApproved.approvedAt), source: nextApproved.source,
          decision: nextApproved.decision, metadata: nextApproved.metadata as Prisma.InputJsonValue,
          version: nextApproved.version, createdAt: new Date(nextApproved.createdAt), updatedAt: new Date(nextApproved.updatedAt),
          sourceProposalId: nextApproved.sourceProposalId,
        } })
        approvedWrites = 1
      } else {
        const update = await tx.playerApprovedCurrentClub.updateMany({ where: {
          playerId: expected.playerId, version: expected.approvedVersion, approvedClubId: expected.approvedClubId,
        }, data: {
          approvedClubId: nextApproved.approvedClubId, approvedProviderTeamId: nextApproved.approvedProviderTeamId,
          effectiveSince: nextApproved.effectiveSince ? new Date(nextApproved.effectiveSince) : null,
          evidenceHash: nextApproved.evidenceHash, approvedAt: new Date(nextApproved.approvedAt), source: nextApproved.source,
          decision: nextApproved.decision, metadata: nextApproved.metadata as Prisma.InputJsonValue,
          version: nextApproved.version, updatedAt: new Date(nextApproved.updatedAt), sourceProposalId: nextApproved.sourceProposalId,
        } })
        approvedWrites = update.count
      }
      const proposalWrite = await tx.playerCurrentClubProposal.updateMany({ where: {
        id: expected.proposalId, playerId: expected.playerId, providerPlayerId: expected.providerPlayerId,
        version: expected.proposalVersion, status: "PROPOSED", evidenceHash: expected.evidenceHash,
        proposedClubId: expected.destinationClubId, proposedProviderTeamId: expected.destinationProviderTeamId,
        updatedAt: new Date(expected.proposalUpdatedAt),
      }, data: {
        status: "APPROVED", statusReason: nextProposal.statusReason, version: nextProposal.version,
        updatedAt: new Date(nextProposal.updatedAt),
      } })
      if (approvedWrites !== 1 || proposalWrite.count !== 1) throw new Error("CONCURRENT_MODIFICATION")
    },
  }
}

// Inert factory. It performs no work until a separately authorized caller invokes the writer.
export function createPrismaCurrentClubPromotionStore(db: Pick<PrismaClient, "$transaction">): CurrentClubPromotionStore {
  return {
    audit: () => audit(db),
    read: playerId => withPrismaReadOnly(db, tx => readSource(tx, playerId)),
    transaction: work => db.$transaction(tx => work(transactionPort(tx)),
      { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 }),
  }
}
