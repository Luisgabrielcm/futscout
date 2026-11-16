import { createHash } from "node:crypto"
import type { GenericEconomicRecord, GenericEconomicView, GenericEconomicRelease, GenericEconomicArtifact } from "./genericEconomicTypes"

export const genericEconomicPublicBlocker = "MODEL_B_CONSENT_GAP"
export type GenericEconomicEnvironment = Readonly<Record<string, string | undefined>>
const digest = /^[a-f0-9]{64}$/
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128
const hash = (value: unknown): value is string => typeof value === "string" && digest.test(value)

export function genericEconomicHash(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return v
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (Array.isArray(v)) return v.map(canonical)
    if (object(v)) return Object.fromEntries(Object.entries(v)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, canonical(x)]))
    throw Error("INVALID_GENERIC_ECONOMIC_HASH_INPUT")
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")
}

export function validGenericEconomicRecord(row: unknown): row is GenericEconomicRecord {
  if (!object(row) || !object(row.contractReference) || !object(row.simulation)) return false
  const contract = row.contractReference, simulation = row.simulation
  return typeof row.eaId === "string" && /^\d+$/.test(row.eaId) && identifier(row.playerId) && identifier(row.clubId) &&
    typeof row.clubEaId === "string" && /^\d+$/.test(row.clubEaId) &&
    [row.expectedPlayerHash, row.expectedClubHash, row.sourceRecordHash].every(hash) &&
    row.status === "ESTIMATED" && row.confidence === "LOW" && row.identityClassification === "UNKNOWN" &&
    [row.weeklyWageEur, row.marketValueEur, simulation.releaseClauseEur]
      .every(n => typeof n === "number" && Number.isSafeInteger(n) && n > 0) &&
    typeof row.marketValueEur === "number" && simulation.releaseClauseEur === row.marketValueEur * 2 &&
    [1, 3].includes(simulation.durationYears as number) && simulation.actualClauseStatus === "UNKNOWN" &&
    simulation.actualClauseEur === null && contract.endYear === 2029 && contract.precision === "YEAR" &&
    contract.realContractConfirmed === false && contract.effectiveRosterDate === null &&
    hash(contract.sourceFileSha256) && typeof contract.sourceCommit === "string" && /^[a-f0-9]{40}$/.test(contract.sourceCommit)
}

export function validGenericEconomicRelease(value: unknown): value is GenericEconomicRelease {
  if (!object(value) || value.version !== "generic-economic-private-release-v1" ||
      !object(value.artifact) || !object(value.approval)) return false
  const a = value.artifact, p = value.approval
  if (a.version !== "generic-economic-projection-v1" || !hash(a.sourceBatchHash) || a.publicDisplayRightsApproval !== null ||
      typeof a.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(a.asOf) ||
      ![a.sourceVersion, a.simulationModel, a.salaryModel, a.marketModel].every(identifier) ||
      !Array.isArray(a.rows) || a.rows.length !== 231 || !a.rows.every(validGenericEconomicRecord) ||
      !Array.isArray(a.excludedEaIds) || a.excludedEaIds.length !== 62 ||
      !a.excludedEaIds.every(id => typeof id === "string" && /^\d+$/.test(id))) return false
  const excludedEaIds = a.excludedEaIds
  if (new Set(a.rows.map(r => r.eaId)).size !== 231 || new Set(a.rows.map(r => r.playerId)).size !== 231 ||
      new Set(excludedEaIds).size !== 62 || a.rows.some(r => excludedEaIds.includes(r.eaId))) return false
  return p.version === "generic-economic-public-approval-v1" && p.sourceBatchHash === a.sourceBatchHash &&
    p.projectionHash === genericEconomicHash(a) &&
    (p.modelPublicReuseReviewSha256 === null || hash(p.modelPublicReuseReviewSha256)) &&
    (p.publicActivationDecisionSha256 === null || hash(p.publicActivationDecisionSha256)) &&
    p.supplierConsentStatus === "MODEL_B_CONSENT_GAP" && p.supplierConsentVerified === false
}

export function genericEconomicStageIds(stage: string | undefined, release?: GenericEconomicRelease): readonly string[] {
  if (!release || !validGenericEconomicRelease(release)) return []
  if (stage === "pilot") return ["230430"]
  if (stage === "club") return release.artifact.rows.filter(r => r.clubEaId === "1043").map(r => r.eaId).sort()
  if (stage === "batch") return release.artifact.rows.map(r => r.eaId).sort()
  return []
}

export function selectedGenericEconomicRecord(playerId: string, env: GenericEconomicEnvironment = {},
  release?: GenericEconomicRelease): GenericEconomicRecord | undefined {
  if (!release || env.GENERIC_ECONOMICS_READ_ENABLED !== "1" || !validGenericEconomicRelease(release) ||
      env.GENERIC_ECONOMICS_BATCH_HASH !== release.artifact.sourceBatchHash ||
      env.GENERIC_ECONOMICS_PROJECTION_HASH !== genericEconomicHash(release.artifact)) return undefined
  const approval = release.approval
  // Evidence and operator authorization remain distinct from unresolved supplier rights.
  if (env.VERCEL_ENV === "production") {
    if (!hash(approval.modelPublicReuseReviewSha256) || !hash(approval.publicActivationDecisionSha256) ||
        env.GENERIC_ECONOMICS_PRODUCTION_ENABLED !== "1" ||
        env.GENERIC_ECONOMICS_PUBLIC_APPROVAL_HASH !== genericEconomicHash(approval)) return undefined
  } else if (env.VERCEL_ENV !== "preview" || env.GENERIC_ECONOMICS_PRIVATE_PREVIEW !== "1") return undefined
  const ids = genericEconomicStageIds(env.GENERIC_ECONOMICS_STAGE, release)
  const supplied = (env.GENERIC_ECONOMICS_EA_IDS ?? "").split(",").map(s => s.trim()).sort()
  if (!ids.length || supplied.length !== ids.length || supplied.some((id, i) => id !== ids[i])) return undefined
  const row = release.artifact.rows.find(r => r.playerId === playerId)
  return row && ids.includes(row.eaId) ? row : undefined
}

export type GenericEconomicCurrentState = Readonly<{
  record: Record<string, unknown>; club: Record<string, unknown> | null
  hasExistingEconomics: boolean; hasClubContexts: boolean; readOnly: string
}>

export function genericEconomicConflict(row: GenericEconomicRecord, state: GenericEconomicCurrentState): string | null {
  if (state.readOnly !== "on") return "READ_ONLY_REQUIRED"
  if (state.record.id !== row.playerId || state.record.externalId !== row.eaId ||
      state.record.eaImportVisibility !== "PUBLIC") return "EA_IDENTITY_CONFLICT"
  if (state.record.apiFootballId !== null) return "REAL_IDENTITY_REVIEW_REQUIRED"
  if (state.hasExistingEconomics || state.record.marketValue !== null) return "EXISTING_ECONOMIC_DATA"
  if (state.hasClubContexts) return "CLUB_CONTEXT_REVIEW_REQUIRED"
  if (genericEconomicHash(state.record) !== row.expectedPlayerHash ||
      genericEconomicHash(state.club) !== row.expectedClubHash) return "PROTECTED_BASELINE_CHANGED"
  return null
}

export function genericEconomicView(row: GenericEconomicRecord, artifact: GenericEconomicArtifact): GenericEconomicView {
  return { eaId: row.eaId, status: row.status, confidence: row.confidence,
    identityClassification: row.identityClassification, weeklyWageEur: row.weeklyWageEur,
    marketValueEur: row.marketValueEur, asOf: artifact.asOf, contractReference: row.contractReference,
    simulation: row.simulation, batchHash: artifact.sourceBatchHash, sourceRecordHash: row.sourceRecordHash,
    simulationModel: artifact.simulationModel, salaryModel: artifact.salaryModel }
}
