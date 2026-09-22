import { isDeepStrictEqual } from "node:util"
import { getVisualAssetSrc } from "../lib/visualAssets"

export type BrandEntityType = "CLUB" | "LEAGUE"
export type BrandAssetType = "CREST" | "LOGO"
export type BrandRightsStatus = "APPROVED" | "REMOTE_ONLY" | "CACHE_ALLOWED" | "REVIEW_REQUIRED" | "BLOCKED"
export type BrandOperationalDecision = "NOT_AUTHORIZED" | "OWNER_AUTHORIZED_REMOTE_USE" | "REVOKED"
export type BrandDisplayPolicy = "DISPLAY_ALLOWED" | "DISPLAY_BLOCKED"
export type BrandDeliveryStatus = "VALIDATED" | "UNVERIFIED" | "FAILED"
export type BrandIdentityStatus = "VERIFIED" | "REVIEW_REQUIRED" | "BLOCKED"
export type BrandAssetLifecycle = "DISCOVERED" | "VALIDATED" | "ACTIVE" | "STALE" | "REMOVED" | "ERROR"

export type BrandAssetPilotIdentity = Readonly<{
  entityType: BrandEntityType
  entityId: string
  provider: "api-football"
  providerEntityId: string
  assetType: BrandAssetType
}>

export const BRAND_ASSET_PILOT_ALLOWLIST = [
  { entityType: "CLUB", entityId: "cmt7hnsah0004z0ucqy6yoeqz", provider: "api-football", providerEntityId: "541", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt94sq79001l5guc4g4zj7y3", provider: "api-football", providerEntityId: "529", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt94sibe001a5guc60z2rphl", provider: "api-football", providerEntityId: "50", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt92ovai0001hwucqa7za5jj", provider: "api-football", providerEntityId: "40", assetType: "CREST" },
  { entityType: "LEAGUE", entityId: "cmt94rzm4000b5gucw3hp7cx7", provider: "api-football", providerEntityId: "140", assetType: "LOGO" },
  { entityType: "LEAGUE", entityId: "cmt92ouaa0000hwuc3mmpqdvt", provider: "api-football", providerEntityId: "39", assetType: "LOGO" },
] as const satisfies readonly BrandAssetPilotIdentity[]

export type BrandAssetCandidate = BrandAssetPilotIdentity & Readonly<{
  identityStatus: BrandIdentityStatus
  sourceUrl: string
  storageUrl: string | null
  contentHash: string | null
  fetchedAt: string
  rightsStatus: BrandRightsStatus
  displayPolicy: BrandDisplayPolicy
  operationalDecision: BrandOperationalDecision
  operationalAuthorizedAt: string | null
  operationalDecisionRef: string | null
  operatorRiskAccepted: boolean
  riskAcceptedAt: string | null
  riskAcceptedBy: string | null
  riskReason: string | null
  sourceTermsUrl: string | null
  revocable: boolean
  deliveryStatus: BrandDeliveryStatus
}>

export type BrandAssetDryRunRow = Readonly<{
  identity: BrandAssetPilotIdentity
  sourceUrl: string
  rightsStatus: BrandRightsStatus
  displayPolicy: BrandDisplayPolicy
  riskAccepted: boolean
  operationalDecision: BrandOperationalDecision
  publicationDecision: "ALLOWED_AT_OPERATOR_RISK" | "NOT_ALLOWED" | "REVOKED"
  deliveryStatus: BrandDeliveryStatus
  renderDecision: "REMOTE_WHEN_GLOBAL_ENABLED" | "FALLBACK"
  rollbackDecision: "REVOKE_ASSET" | "NOT_APPLICABLE"
  plannedStatus: Exclude<BrandAssetLifecycle, "STALE" | "REMOVED" | "ERROR">
  action: "CREATE_ACTIVE" | "NOT_WRITABLE"
  blockers: readonly string[]
  writable: boolean
}>

const identityKey = (value: BrandAssetPilotIdentity) => [value.entityType, value.entityId, value.provider,
  value.providerEntityId, value.assetType].join(":")
const kind = (entityType: BrandEntityType) => entityType === "CLUB" ? "club" as const : "league" as const
const expectedSourceUrl = (candidate: BrandAssetPilotIdentity) =>
  `https://media.api-sports.io/football/${candidate.entityType === "CLUB" ? "teams" : "leagues"}/${candidate.providerEntityId}.png`
const validHash = (value: string | null) => value !== null && /^[a-f0-9]{64}$/.test(value)
const validHttpsUrl = (value: string | null) => {
  try {
    const url = new URL(value ?? "")
    return url.protocol === "https:" && !url.username && !url.password
  } catch { return false }
}

function validateCandidate(candidate: BrandAssetCandidate, now: Date) {
  const compatible = candidate.entityType === "CLUB" ? candidate.assetType === "CREST" : candidate.assetType === "LOGO"
  if (!compatible || candidate.provider !== "api-football" || candidate.sourceUrl !== expectedSourceUrl(candidate) ||
      !getVisualAssetSrc(candidate.sourceUrl, kind(candidate.entityType)) ||
      (candidate.storageUrl !== null && !getVisualAssetSrc(candidate.storageUrl, kind(candidate.entityType))) ||
      !Number.isFinite(Date.parse(candidate.fetchedAt)) || Date.parse(candidate.fetchedAt) > now.getTime() ||
      (candidate.operationalAuthorizedAt !== null && (!Number.isFinite(Date.parse(candidate.operationalAuthorizedAt)) ||
        Date.parse(candidate.operationalAuthorizedAt) > now.getTime())) ||
      (candidate.riskAcceptedAt !== null && (!Number.isFinite(Date.parse(candidate.riskAcceptedAt)) ||
        Date.parse(candidate.riskAcceptedAt) > now.getTime()))) {
    throw new Error("BRAND_ASSET_CANDIDATE_INVALID")
  }
}

function blockers(candidate: BrandAssetCandidate) {
  const values: string[] = []
  const decisionRef = candidate.operationalDecisionRef?.trim() ?? ""
  const riskAcceptedBy = candidate.riskAcceptedBy?.trim() ?? ""
  const riskReason = candidate.riskReason?.trim() ?? ""
  const operationallyAuthorized = candidate.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" &&
    candidate.operationalAuthorizedAt !== null && decisionRef.length > 0 && candidate.operatorRiskAccepted &&
    candidate.riskAcceptedAt !== null && riskAcceptedBy.length > 0 && riskReason.length > 0 &&
    validHttpsUrl(candidate.sourceTermsUrl) && candidate.revocable
  if (candidate.identityStatus !== "VERIFIED") values.push("IDENTITY_NOT_VERIFIED")
  if (candidate.displayPolicy === "DISPLAY_BLOCKED") values.push("DISPLAY_BLOCKED")
  if (candidate.operationalDecision === "REVOKED") values.push("OPERATIONAL_AUTHORIZATION_REVOKED")
  if (candidate.rightsStatus === "REVIEW_REQUIRED" && candidate.displayPolicy === "DISPLAY_ALLOWED" &&
      !operationallyAuthorized) values.push("OPERATIONAL_AUTHORIZATION_INVALID")
  if (candidate.rightsStatus === "BLOCKED") values.push("RIGHTS_BLOCKED")
  if (candidate.operationalDecision === "NOT_AUTHORIZED" &&
      (candidate.operationalAuthorizedAt !== null || candidate.operationalDecisionRef !== null ||
       candidate.operatorRiskAccepted || candidate.riskAcceptedAt !== null || candidate.riskAcceptedBy !== null ||
       candidate.riskReason !== null || candidate.sourceTermsUrl !== null || !candidate.revocable)) {
    values.push("OPERATIONAL_AUTHORIZATION_INVALID")
  }
  if (candidate.operationalDecision !== "NOT_AUTHORIZED" &&
      !operationallyAuthorized) values.push("OPERATIONAL_AUTHORIZATION_INVALID")
  if (candidate.deliveryStatus !== "VALIDATED" || !validHash(candidate.contentHash)) values.push("DELIVERY_NOT_VALIDATED")
  if (candidate.rightsStatus === "REMOTE_ONLY" && candidate.storageUrl !== null) values.push("REMOTE_ONLY_STORAGE_FORBIDDEN")
  if (candidate.rightsStatus === "CACHE_ALLOWED" && candidate.storageUrl === null) values.push("CACHE_STORAGE_REQUIRED")
  if (operationallyAuthorized && candidate.storageUrl !== null) values.push("OWNER_AUTHORIZED_REMOTE_STORAGE_FORBIDDEN")
  return values
}

export function prepareBrandAssetPilotDryRun(candidates: readonly BrandAssetCandidate[], now = new Date()): BrandAssetDryRunRow[] {
  if (candidates.length !== BRAND_ASSET_PILOT_ALLOWLIST.length || candidates.some((candidate, index) =>
    identityKey(candidate) !== identityKey(BRAND_ASSET_PILOT_ALLOWLIST[index]))) throw new Error("BRAND_ASSET_ALLOWLIST_MISMATCH")
  return candidates.map(candidate => {
    validateCandidate(candidate, now)
    const blocked = blockers(candidate)
    const writable = blocked.length === 0
    return { identity: BRAND_ASSET_PILOT_ALLOWLIST.find(item => identityKey(item) === identityKey(candidate))!,
      sourceUrl: candidate.sourceUrl, rightsStatus: candidate.rightsStatus, displayPolicy: candidate.displayPolicy,
      riskAccepted: candidate.operatorRiskAccepted, operationalDecision: candidate.operationalDecision,
      publicationDecision: candidate.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" ? "ALLOWED_AT_OPERATOR_RISK" :
        candidate.operationalDecision === "REVOKED" ? "REVOKED" : "NOT_ALLOWED",
      deliveryStatus: candidate.deliveryStatus,
      renderDecision: writable && candidate.displayPolicy === "DISPLAY_ALLOWED" ? "REMOTE_WHEN_GLOBAL_ENABLED" : "FALLBACK",
      rollbackDecision: operationallyAuthorizedForRollback(candidate) ? "REVOKE_ASSET" : "NOT_APPLICABLE",
      plannedStatus: writable ? "ACTIVE" : candidate.deliveryStatus === "VALIDATED" ? "VALIDATED" : "DISCOVERED",
      action: writable ? "CREATE_ACTIVE" : "NOT_WRITABLE", blockers: blocked, writable }
  })
}

function operationallyAuthorizedForRollback(candidate: BrandAssetCandidate) {
  return candidate.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" && candidate.operatorRiskAccepted && candidate.revocable
}

export type BrandIdentityRow = Readonly<{
  id: string; entityType: BrandEntityType; entityId: string; provider: string; providerEntityId: string
  status: BrandIdentityStatus; version: number
}>
export type BrandAssetRow = Readonly<{
  id: string; identityId: string; assetType: BrandAssetType; sourceUrl: string; storageUrl: string | null
  contentHash: string | null; version: number; fetchedAt: string; rightsStatus: BrandRightsStatus
  displayPolicy: BrandDisplayPolicy
  operationalDecision: BrandOperationalDecision; operationalAuthorizedAt: string | null; operationalDecisionRef: string | null
  operatorRiskAccepted: boolean; riskAcceptedAt: string | null; riskAcceptedBy: string | null; riskReason: string | null
  sourceTermsUrl: string | null; revocable: boolean
  status: BrandAssetLifecycle
}>
export type BrandExpectedState = Readonly<{
  identity: BrandIdentityRow | null
  latestAsset: BrandAssetRow | null
  activeAssetId: string | null
}>
export type BrandAssetWriteRequest = Readonly<{ candidate: BrandAssetCandidate; expected: BrandExpectedState }>
export type BrandAssetAudit = Readonly<{
  protected: Readonly<{ Club: Readonly<{ count: string; hash: string }>; League: Readonly<{ count: string; hash: string }> }>
  registry: Readonly<{ BrandAssetIdentity: Readonly<{ count: string; hash: string }>; BrandAsset: Readonly<{ count: string; hash: string }> }>
}>

export type BrandAssetWriteTransaction = {
  readLocalEntity(entityType: BrandEntityType, entityId: string): Promise<{ id: string; providerEntityId: string | null } | null>
  findIdentityByLocal(input: BrandAssetPilotIdentity): Promise<BrandIdentityRow | null>
  findIdentityByProvider(input: BrandAssetPilotIdentity): Promise<BrandIdentityRow | null>
  latestAsset(identityId: string, assetType: BrandAssetType): Promise<BrandAssetRow | null>
  activeAsset(identityId: string, assetType: BrandAssetType): Promise<BrandAssetRow | null>
  createIdentity(input: BrandAssetCandidate): Promise<BrandIdentityRow>
  markActiveStale(id: string, version: number): Promise<number>
  createAsset(identityId: string, version: number, input: BrandAssetCandidate): Promise<BrandAssetRow>
}
export type BrandAssetWriteStore = {
  audit(): Promise<BrandAssetAudit>
  transaction<T>(work: (tx: BrandAssetWriteTransaction) => Promise<T>): Promise<T>
}

export type BrandAssetWriteStatus = "CREATED" | "NO_OP" | "NOT_WRITABLE" | "AUTHORIZATION_MISMATCH" |
  "IDENTITY_CONFLICT" | "CONCURRENT_MODIFICATION" | "ROLLED_BACK" | "INDETERMINATE_COMMIT" | "AUDIT_MISMATCH"
export type BrandAssetWriteResult = Readonly<{
  status: BrandAssetWriteStatus; entityId: string; providerEntityId: string; assetId: string | null
  transactionState: "NOT_STARTED" | "ROLLED_BACK" | "COMMIT_CONFIRMED" | "COMMIT_INDETERMINATE"
  retries: 0; reason: string
}>

class BrandWriteAbort extends Error {
  constructor(readonly status: BrandAssetWriteStatus, readonly safeReason: string) { super(safeReason) }
}
const errorCode = (error: unknown) => typeof error === "object" && error !== null && "code" in error &&
  typeof error.code === "string" ? error.code : null
const result = (request: BrandAssetWriteRequest, status: BrandAssetWriteStatus, transactionState: BrandAssetWriteResult["transactionState"],
  reason: string, assetId: string | null = null): BrandAssetWriteResult => ({ status, entityId: request.candidate.entityId,
    providerEntityId: request.candidate.providerEntityId, assetId, transactionState, retries: 0, reason })

function sameProtected(before: BrandAssetAudit, after: BrandAssetAudit) {
  return isDeepStrictEqual(before.protected, after.protected)
}
function expectedRegistryDelta(before: BrandAssetAudit, after: BrandAssetAudit, identityCreated: boolean, assetCreated: boolean) {
  return Number(after.registry.BrandAssetIdentity.count) - Number(before.registry.BrandAssetIdentity.count) === (identityCreated ? 1 : 0) &&
    Number(after.registry.BrandAsset.count) - Number(before.registry.BrandAsset.count) === (assetCreated ? 1 : 0)
}
const sameAsset = (row: BrandAssetRow, candidate: BrandAssetCandidate) => row.assetType === candidate.assetType &&
  row.sourceUrl === candidate.sourceUrl && row.storageUrl === candidate.storageUrl && row.contentHash === candidate.contentHash &&
  row.rightsStatus === candidate.rightsStatus && row.operationalDecision === candidate.operationalDecision &&
  row.displayPolicy === candidate.displayPolicy &&
  row.operationalAuthorizedAt === candidate.operationalAuthorizedAt &&
  row.operationalDecisionRef === candidate.operationalDecisionRef &&
  row.operatorRiskAccepted === candidate.operatorRiskAccepted && row.riskAcceptedAt === candidate.riskAcceptedAt &&
  row.riskAcceptedBy === candidate.riskAcceptedBy && row.riskReason === candidate.riskReason &&
  row.sourceTermsUrl === candidate.sourceTermsUrl && row.revocable === candidate.revocable && row.status === "ACTIVE"

// No env, network, retry loop or singleton. A future authorized runner must supply the store and fresh expected state.
export async function persistBrandAssetAtomically(store: BrandAssetWriteStore, request: BrandAssetWriteRequest,
  clock: () => Date = () => new Date()): Promise<BrandAssetWriteResult> {
  const candidate = structuredClone(request.candidate)
  const pin = structuredClone(request.expected)
  const allowed = BRAND_ASSET_PILOT_ALLOWLIST.some(item => identityKey(item) === identityKey(candidate))
  if (!allowed) return result(request, "AUTHORIZATION_MISMATCH", "NOT_STARTED", "ALLOWLIST_MISMATCH")
  try { validateCandidate(candidate, clock()) } catch { return result(request, "AUTHORIZATION_MISMATCH", "NOT_STARTED", "CANDIDATE_INVALID") }
  const blocked = blockers(candidate)
  if (blocked.length) return result(request, "NOT_WRITABLE", "NOT_STARTED", blocked.join("+"))

  const before = await store.audit()
  let entered = false, callbackReturned = false, commitConfirmed = false, identityCreated = false, assetCreated = false
  try {
    const committed = await store.transaction(async tx => {
      entered = true
      const local = await tx.readLocalEntity(candidate.entityType, candidate.entityId)
      if (!local || (candidate.entityType === "CLUB" && local.providerEntityId !== candidate.providerEntityId)) {
        throw new BrandWriteAbort("IDENTITY_CONFLICT", "LOCAL_IDENTITY_MISMATCH")
      }
      const providerOwner = await tx.findIdentityByProvider(candidate)
      if (providerOwner && providerOwner.entityId !== candidate.entityId) throw new BrandWriteAbort("IDENTITY_CONFLICT", "PROVIDER_OCCUPIED")
      let identity = await tx.findIdentityByLocal(candidate)
      if (identity && (identity.providerEntityId !== candidate.providerEntityId || identity.status !== "VERIFIED" ||
          identity.entityType !== candidate.entityType)) throw new BrandWriteAbort("IDENTITY_CONFLICT", "IDENTITY_STATE_CONFLICT")
      const latest = identity ? await tx.latestAsset(identity.id, candidate.assetType) : null
      const active = identity ? await tx.activeAsset(identity.id, candidate.assetType) : null
      if (identity && active && sameAsset(active, candidate)) {
        callbackReturned = true
        return { status: "NO_OP" as const, assetId: active.id }
      }
      if (!isDeepStrictEqual(identity, pin.identity) || !isDeepStrictEqual(latest, pin.latestAsset) ||
          (active?.id ?? null) !== pin.activeAssetId) throw new BrandWriteAbort("CONCURRENT_MODIFICATION", "EXPECTED_STATE_CHANGED")
      if (!identity) { identity = await tx.createIdentity(candidate); identityCreated = true }
      if (active && await tx.markActiveStale(active.id, active.version) !== 1) {
        throw new BrandWriteAbort("CONCURRENT_MODIFICATION", "ACTIVE_ASSET_CHANGED")
      }
      const created = await tx.createAsset(identity.id, (latest?.version ?? 0) + 1, candidate)
      assetCreated = true
      const readBack = await tx.activeAsset(identity.id, candidate.assetType)
      if (!readBack || readBack.id !== created.id || !sameAsset(readBack, candidate)) {
        throw new BrandWriteAbort("ROLLED_BACK", "READ_BACK_MISMATCH")
      }
      callbackReturned = true
      return { status: "CREATED" as const, assetId: created.id }
    })
    commitConfirmed = true
    let after: BrandAssetAudit
    try { after = await store.audit() } catch {
      return result(request, "AUDIT_MISMATCH", "COMMIT_CONFIRMED", "AFTER_AUDIT_FAILED", committed.assetId)
    }
    if (!sameProtected(before, after) || !expectedRegistryDelta(before, after, identityCreated, assetCreated)) {
      return result(request, "AUDIT_MISMATCH", "COMMIT_CONFIRMED", "AFTER_AUDIT_MISMATCH", committed.assetId)
    }
    return result(request, committed.status, "COMMIT_CONFIRMED", committed.status === "NO_OP" ? "IDEMPOTENT_NO_OP" : "CREATED", committed.assetId)
  } catch (error) {
    if (error instanceof BrandWriteAbort) return result(request, error.status, entered ? "ROLLED_BACK" : "NOT_STARTED", error.safeReason)
    const code = errorCode(error)
    if (callbackReturned && !commitConfirmed && !["P2034", "40001", "40P01"].includes(code ?? "")) {
      return result(request, "INDETERMINATE_COMMIT", "COMMIT_INDETERMINATE", "COMMIT_ACKNOWLEDGEMENT_UNKNOWN")
    }
    const concurrent = ["P2002", "23505", "P2034", "40001", "40P01"].includes(code ?? "")
    return result(request, concurrent ? "CONCURRENT_MODIFICATION" : "ROLLED_BACK", entered ? "ROLLED_BACK" : "NOT_STARTED",
      concurrent ? "DATABASE_CONCURRENCY_CONFLICT" : "TRANSACTION_FAILED")
  }
}
