import { isDeepStrictEqual } from "node:util"
import { transferEvidenceHash } from "../lib/transferHistory"
import type { CurrentClubEvaluation } from "../types/currentClub"
import type { CurrentClubProposal, ProposalStatus } from "../types/currentClubV2"

export const CURRENT_CLUB_V1_MIGRATION_POLICY = "current-club-v1-to-v2.1"

export const CURRENT_CLUB_V1_MIGRATION_ALLOWLIST = [
  { playerId: "cmt92ovep0002hwucv4tw8ioi", providerPlayerId: 306, name: "Mohamed Salah" },
  { playerId: "cmt954zui000y14ucsq41525y", providerPlayerId: 44, name: "Rodri" },
  { playerId: "cmt99dftr001qvsucoleqh6z0", providerPlayerId: 1145, name: "Ibrahima Konaté" },
  { playerId: "cmt99m82g001hugucwa5q4qqz", providerPlayerId: 47380, name: "Marc Cucurella" },
  { playerId: "cmt99nkx9004euguczxq553wo", providerPlayerId: 636, name: "Bernardo Silva" },
  { playerId: "cmt99mh4l0023ugucamjeah3u", providerPlayerId: 5996, name: "Enzo Fernández" },
] as const

export type LegacyCurrentClubState = Readonly<{
  playerId: string
  clubId: string | null
  providerTeamId: number | null
  effectiveSince: string | null
  decision: string
  evidenceHash: string
  policyVersion: string
  evidence: unknown
  evaluatedAt: string
  status: string
}>

export type LegacyCurrentClubSource = Readonly<{
  player: Readonly<{ id: string; name: string; providerPlayerId: number | null }>
  state: LegacyCurrentClubState
  observations: readonly Readonly<{ playerId: string; providerPlayerId: number; contentHash: string
    toProviderTeamId: number | null; transferDate: string | null }>[]
}>

export type CurrentClubV1MigrationSnapshot = Readonly<{
  sources: readonly LegacyCurrentClubSource[]
  proposals: readonly CurrentClubProposal[]
  approvedCount: number
}>

export type CurrentClubV1MigrationAction = "CREATE" | "NO_OP" | "REVIEW" | "BLOCKED" | "CONFLICT"
export type CurrentClubV1MigrationRow = Readonly<{
  playerId: string
  playerName: string
  providerPlayerId: number
  action: CurrentClubV1MigrationAction
  reason: string
  wouldCreate: boolean
  proposal: CurrentClubProposal | null
}>

export type CurrentClubV1MigrationPlan = Readonly<{
  snapshotHash: string
  summaryHash: string
  rows: readonly CurrentClubV1MigrationRow[]
  creates: number
  reviews: number
  blocked: number
  conflicts: number
  noOps: number
}>

export type CurrentClubV1MigrationAudit = Readonly<{
  protected: Readonly<Record<"Player" | "Club" | "PlayerTransferObservation" | "PlayerCurrentClubState" |
    "PlayerApprovedCurrentClub" | "PlayerTransfer" | "BrandAssetIdentity" | "BrandAsset", Readonly<{ count: string; hash: string }>>>
  proposals: Readonly<{ count: string; hash: string }>
}>

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LEGACY_EVIDENCE_INVALID")
  return value as Record<string, unknown>
}
const strings = (value: unknown) => {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) throw new Error("LEGACY_EVIDENCE_INVALID")
  return [...value] as string[]
}
const records = (value: unknown) => {
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new Error("LEGACY_EVIDENCE_INVALID")
  }
  return structuredClone(value) as CurrentClubEvaluation["supportingEvidence"]
}
const date = (value: string | null) => value === null ? null : Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const validHash = (value: string) => /^[a-f0-9]{64}$/.test(value)

function decodeEvidence(value: unknown): CurrentClubEvaluation {
  const row = object(value)
  const current = row.currentClubCandidate === null ? null : object(row.currentClubCandidate)
  const candidateTeamId = row.candidateTeamId
  if (typeof row.decision !== "string" || typeof row.reason !== "string" ||
      (candidateTeamId !== null && (!Number.isSafeInteger(candidateTeamId) || Number(candidateTeamId) < 1)) ||
      (row.effectiveSince !== null && typeof row.effectiveSince !== "string") ||
      !["CORROBORATED", "REVIEW_REQUIRED", "INSUFFICIENT"].includes(String(row.evidenceState)) ||
      typeof row.policyVersion !== "string" || typeof row.evidenceHash !== "string" || !validHash(row.evidenceHash) ||
      typeof row.evaluatedAt !== "string" || date(row.evaluatedAt) === null || row.writable !== false ||
      (current !== null && (typeof current.clubId !== "string" || !Number.isSafeInteger(current.providerTeamId)))) {
    throw new Error("LEGACY_EVIDENCE_INVALID")
  }
  return { decision: row.decision as CurrentClubEvaluation["decision"], reason: row.reason,
    candidateTeamId: candidateTeamId === null ? null : Number(candidateTeamId),
    currentClubCandidate: current === null ? null : { clubId: String(current.clubId), providerTeamId: Number(current.providerTeamId) },
    effectiveSince: row.effectiveSince as string | null,
    evidenceState: row.evidenceState as CurrentClubEvaluation["evidenceState"],
    supportingEvidence: records(row.supportingEvidence), contradictingEvidence: records(row.contradictingEvidence),
    warnings: strings(row.warnings), policyVersion: row.policyVersion as CurrentClubEvaluation["policyVersion"],
    evidenceHash: row.evidenceHash, evaluatedAt: row.evaluatedAt, writable: false }
}

function proposalStatus(evidence: CurrentClubEvaluation): ProposalStatus {
  if (evidence.decision === "CONFLICT") return "CONFLICT"
  return evidence.evidenceState === "CORROBORATED" && evidence.currentClubCandidate !== null &&
    evidence.effectiveSince !== null && evidence.warnings.length === 0 && evidence.contradictingEvidence.length === 0
    ? "PROPOSED" : "REVIEW"
}

export function mapLegacyCurrentClubState(source: LegacyCurrentClubSource): CurrentClubProposal {
  const allowed = CURRENT_CLUB_V1_MIGRATION_ALLOWLIST.find(item => item.playerId === source.player.id)
  if (!allowed || source.state.playerId !== source.player.id || source.player.providerPlayerId !== allowed.providerPlayerId ||
      source.player.name !== allowed.name || source.state.status !== "PROPOSED" ||
      !validHash(source.state.evidenceHash) || !Number.isFinite(Date.parse(source.state.evaluatedAt)) ||
      source.observations.length === 0 || new Set(source.observations.map(item => item.contentHash)).size !== source.observations.length ||
      source.observations.some(item => item.playerId !== source.player.id || item.providerPlayerId !== allowed.providerPlayerId ||
        !validHash(item.contentHash))) throw new Error("LEGACY_SOURCE_MISMATCH")
  const evidence = decodeEvidence(source.state.evidence)
  if (evidence.decision !== source.state.decision || evidence.evidenceHash !== source.state.evidenceHash ||
      evidence.policyVersion !== source.state.policyVersion || date(evidence.evaluatedAt) !== date(source.state.evaluatedAt) ||
      date(evidence.effectiveSince) !== date(source.state.effectiveSince) ||
      evidence.currentClubCandidate?.clubId !== (source.state.clubId ?? undefined) ||
      (evidence.currentClubCandidate !== null && evidence.currentClubCandidate.providerTeamId !== source.state.providerTeamId)) {
    throw new Error("LEGACY_EVIDENCE_MISMATCH")
  }
  const transferTeamIds = evidence.supportingEvidence.filter(item => item.kind === "TRANSFER_EVENT").map(item => item.teamId)
  if (source.state.providerTeamId !== evidence.candidateTeamId && !transferTeamIds.includes(source.state.providerTeamId)) {
    throw new Error("LEGACY_DESTINATION_MISMATCH")
  }
  const destinationObservations = source.observations.filter(item => item.toProviderTeamId === source.state.providerTeamId)
  if (!destinationObservations.length || (source.state.effectiveSince !== null && !destinationObservations.some(item =>
    date(item.transferDate)?.slice(0, 10) === date(source.state.effectiveSince)?.slice(0, 10)))) {
    throw new Error("LEGACY_OBSERVATION_MISMATCH")
  }
  const evaluatedAt = new Date(source.state.evaluatedAt).toISOString()
  const status = proposalStatus(evidence)
  const identity = { playerId: source.player.id, providerPlayerId: allowed.providerPlayerId,
    evidenceHash: source.state.evidenceHash, sourceLegacyStateId: source.state.playerId }
  return { id: "ccp_" + transferEvidenceHash(identity), playerId: source.player.id,
    providerPlayerId: allowed.providerPlayerId, revision: 1, version: 1, baseApprovedVersion: 0,
    proposedClubId: source.state.clubId, proposedProviderTeamId: source.state.providerTeamId,
    effectiveSince: date(source.state.effectiveSince), decision: source.state.decision,
    evidenceHash: source.state.evidenceHash, observationHashes: source.observations.map(item => item.contentHash).sort(),
    policyVersion: source.state.policyVersion, replacementPolicy: CURRENT_CLUB_V1_MIGRATION_POLICY,
    evidence: structuredClone(evidence), warnings: [...evidence.warnings],
    supportingEvidence: structuredClone(evidence.supportingEvidence),
    contradictingEvidence: structuredClone(evidence.contradictingEvidence), status,
    statusReason: evidence.reason, evaluatedAt, createdAt: evaluatedAt, updatedAt: evaluatedAt,
    supersededById: null, sourceLegacyStateId: source.state.playerId }
}

const proposalFacts = (proposal: CurrentClubProposal) => ({ ...proposal,
  observationHashes: [...proposal.observationHashes].sort() })
export const currentClubV1SnapshotHash = (snapshot: CurrentClubV1MigrationSnapshot) => transferEvidenceHash({
  approvedCount: snapshot.approvedCount,
  sources: [...snapshot.sources].sort((a, b) => a.player.id.localeCompare(b.player.id)).map(source => ({ ...source,
    observations: [...source.observations].sort((a, b) => a.contentHash.localeCompare(b.contentHash)) })),
  proposals: [...snapshot.proposals].sort((a, b) => a.playerId.localeCompare(b.playerId) || a.revision - b.revision),
})

export function planCurrentClubV1Migration(snapshot: CurrentClubV1MigrationSnapshot): CurrentClubV1MigrationPlan {
  const snapshotHash = currentClubV1SnapshotHash(snapshot)
  const sourceIds = snapshot.sources.map(source => source.player.id)
  const exactCohort = sourceIds.length === CURRENT_CLUB_V1_MIGRATION_ALLOWLIST.length && new Set(sourceIds).size === sourceIds.length &&
    sourceIds.every(id => CURRENT_CLUB_V1_MIGRATION_ALLOWLIST.some(item => item.playerId === id))
  const rows = CURRENT_CLUB_V1_MIGRATION_ALLOWLIST.map(allowed => {
    const identity = { playerId: allowed.playerId, playerName: allowed.name, providerPlayerId: allowed.providerPlayerId }
    const matches = snapshot.sources.filter(source => source.player.id === allowed.playerId)
    if (!exactCohort) return { ...identity, action: "BLOCKED" as const, reason: "LEGACY_COHORT_MISMATCH",
      wouldCreate: false, proposal: null }
    if (snapshot.approvedCount !== 0) return { ...identity, action: "BLOCKED" as const, reason: "APPROVED_STATE_NOT_EMPTY",
      wouldCreate: false, proposal: null }
    if (matches.length !== 1) return { ...identity, action: "BLOCKED" as const, reason: "LEGACY_SOURCE_CARDINALITY",
      wouldCreate: false, proposal: null }
    let proposal: CurrentClubProposal
    try { proposal = mapLegacyCurrentClubState(matches[0]) } catch (error) {
      return { ...identity, action: "BLOCKED" as const,
        reason: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "LEGACY_MAPPING_FAILED",
        wouldCreate: false, proposal: null }
    }
    const byLegacy = snapshot.proposals.filter(item => item.sourceLegacyStateId === allowed.playerId)
    const sameRevision = snapshot.proposals.filter(item => item.playerId === allowed.playerId && item.revision === 1)
    if (byLegacy.length === 1 && isDeepStrictEqual(proposalFacts(byLegacy[0]), proposalFacts(proposal))) {
      return { ...identity, action: "NO_OP" as const, reason: "IDEMPOTENT_LEGACY_PROPOSAL", wouldCreate: false, proposal }
    }
    if (byLegacy.length || sameRevision.length) return { ...identity, action: "CONFLICT" as const,
      reason: "EXISTING_PROPOSAL_CONFLICT", wouldCreate: false, proposal }
    const action = proposal.status === "PROPOSED" ? "CREATE" as const : proposal.status === "REVIEW" ? "REVIEW" as const : "CONFLICT" as const
    return { ...identity, action, reason: proposal.statusReason, wouldCreate: action !== "CONFLICT", proposal }
  })
  const summary = rows.map(row => ({ playerId: row.playerId, providerPlayerId: row.providerPlayerId, action: row.action,
    reason: row.reason, wouldCreate: row.wouldCreate, proposal: row.proposal && proposalFacts(row.proposal) }))
  return { snapshotHash, summaryHash: transferEvidenceHash(summary), rows,
    creates: rows.filter(row => row.wouldCreate).length, reviews: rows.filter(row => row.action === "REVIEW").length,
    blocked: rows.filter(row => row.action === "BLOCKED").length,
    conflicts: rows.filter(row => row.action === "CONFLICT").length,
    noOps: rows.filter(row => row.action === "NO_OP").length }
}

export type CurrentClubV1MigrationStore = {
  audit(): Promise<CurrentClubV1MigrationAudit>
  read(): Promise<CurrentClubV1MigrationSnapshot>
  transaction<T>(work: (tx: {
    read(): Promise<CurrentClubV1MigrationSnapshot>
    create(proposal: CurrentClubProposal): Promise<void>
  }) => Promise<T>): Promise<T>
}

export type CurrentClubV1MigrationWriteResult = Readonly<{
  status: "CREATED" | "NO_OP" | "STATE_MISMATCH" | "CONCURRENT_MODIFICATION" | "ROLLED_BACK" |
    "INDETERMINATE_COMMIT" | "AUDIT_MISMATCH"
  created: number
  retries: 0
  transactionState: "NOT_STARTED" | "ROLLED_BACK" | "COMMIT_CONFIRMED" | "COMMIT_INDETERMINATE"
  reason: string
}>

const sameProtected = (before: CurrentClubV1MigrationAudit, after: CurrentClubV1MigrationAudit) =>
  isDeepStrictEqual(before.protected, after.protected)
const errorCode = (error: unknown) => typeof error === "object" && error !== null && "code" in error &&
  typeof error.code === "string" ? error.code : null

// No authorization token is issued in Phase A. This reusable writer remains disconnected from the dry-run runner.
export async function persistCurrentClubV1Migration(store: CurrentClubV1MigrationStore,
  expectedSnapshotHash: string, expectedSummaryHash: string): Promise<CurrentClubV1MigrationWriteResult> {
  const before = await store.audit()
  let callbackReturned = false
  try {
    const committed = await store.transaction(async tx => {
      const snapshot = await tx.read()
      const plan = planCurrentClubV1Migration(snapshot)
      if (plan.snapshotHash !== expectedSnapshotHash || plan.summaryHash !== expectedSummaryHash || plan.blocked || plan.conflicts) {
        throw new Error("STATE_MISMATCH")
      }
      for (const row of plan.rows) if (row.wouldCreate && row.proposal) await tx.create(row.proposal)
      const readBack = planCurrentClubV1Migration(await tx.read())
      if (readBack.rows.some(row => row.action !== "NO_OP")) throw new Error("READ_BACK_MISMATCH")
      callbackReturned = true
      return plan.creates
    })
    let after: CurrentClubV1MigrationAudit
    try { after = await store.audit() } catch {
      return { status: "AUDIT_MISMATCH", created: committed, retries: 0, transactionState: "COMMIT_CONFIRMED", reason: "AFTER_AUDIT_FAILED" }
    }
    const delta = Number(after.proposals.count) - Number(before.proposals.count)
    if (!sameProtected(before, after) || delta !== committed) {
      return { status: "AUDIT_MISMATCH", created: committed, retries: 0, transactionState: "COMMIT_CONFIRMED", reason: "AFTER_AUDIT_MISMATCH" }
    }
    return { status: committed ? "CREATED" : "NO_OP", created: committed, retries: 0,
      transactionState: "COMMIT_CONFIRMED", reason: committed ? "MIGRATION_CREATED" : "IDEMPOTENT_NO_OP" }
  } catch (error) {
    const code = errorCode(error)
    const concurrent = ["P2002", "23505", "P2034", "40001", "40P01"].includes(code ?? "")
    if (callbackReturned && !concurrent) return { status: "INDETERMINATE_COMMIT", created: 0, retries: 0,
      transactionState: "COMMIT_INDETERMINATE", reason: "COMMIT_ACKNOWLEDGEMENT_UNKNOWN" }
    if (concurrent) return { status: "CONCURRENT_MODIFICATION", created: 0, retries: 0,
      transactionState: "ROLLED_BACK", reason: "DATABASE_CONCURRENCY_CONFLICT" }
    const reason = error instanceof Error && ["STATE_MISMATCH", "READ_BACK_MISMATCH"].includes(error.message)
      ? error.message : "TRANSACTION_FAILED"
    return { status: reason === "STATE_MISMATCH" ? "STATE_MISMATCH" : "ROLLED_BACK", created: 0, retries: 0,
      transactionState: "ROLLED_BACK", reason }
  }
}
