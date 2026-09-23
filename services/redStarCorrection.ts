import { isDeepStrictEqual } from "node:util"
import type { Club, BrandAssetIdentity, BrandAsset } from "../app/generated/prisma/client"
import { getVisualAssetSrc } from "../lib/visualAssets"

type Wire<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] }
export const RED_STAR = {
  clubId: "cmt9g1wkq037v1sucum6ntyxn", leagueId: "cmt9ekar7005c1suckjql1hd7", eaId: "111273",
  identityId: "cmuczcaug0000dcuc8nlf6dn5", assetId: "cmuczcaz60001dcucwvus8unq",
  oldId: 4396, newId: 104,
} as const
export type RedStarSnapshot = {
  club: Wire<Club>; identity: Wire<BrandAssetIdentity>; asset: Wire<BrandAsset>
  playerIds: string[]; assetIds: string[]; protectedHash: string
  otherClubOwners: string[]; otherIdentityOwners: string[]
}
export type RedStarTransaction = {
  read(): Promise<RedStarSnapshot>
  changeClub(before: RedStarSnapshot["club"], after: RedStarSnapshot["club"]): Promise<number>
  changeIdentity(before: RedStarSnapshot["identity"], after: RedStarSnapshot["identity"]): Promise<number>
  changeAsset(before: RedStarSnapshot["asset"], after: RedStarSnapshot["asset"]): Promise<number>
}
export type RedStarStore = {
  read(): Promise<RedStarSnapshot>
  transaction<T>(work: (tx: RedStarTransaction) => Promise<T>): Promise<T>
}
export type RedStarRequest = {
  expected: RedStarSnapshot; decisionRef: string; actor: string; at: string
}
export type RedStarResult = {
  status: "COMMITTED" | "REJECTED" | "ROLLED_BACK" | "INDETERMINATE_COMMIT" | "CONFIRMATION_FAILED"
  reason: string; retries: 0; before: RedStarSnapshot; after?: RedStarSnapshot
}
class CorrectionAbort extends Error {}
const requireState = (ok: boolean, reason: string) => { if (!ok) throw new CorrectionAbort(reason) }

export function validateRedStarPreflight(s: RedStarSnapshot) {
  requireState(s.club.id === RED_STAR.clubId && s.club.externalId === RED_STAR.eaId &&
    s.club.leagueId === RED_STAR.leagueId && s.club.apiFootballId === RED_STAR.oldId, "CLUB_STATE")
  requireState(s.identity.id === RED_STAR.identityId && s.identity.entityId === RED_STAR.clubId &&
    s.identity.entityType === "CLUB" && s.identity.provider === "api-football" &&
    s.identity.providerEntityId === String(RED_STAR.oldId) && s.identity.status === "VERIFIED" &&
    s.identity.version === 1, "IDENTITY_STATE")
  requireState(s.asset.id === RED_STAR.assetId && s.asset.identityId === RED_STAR.identityId &&
    s.asset.assetType === "CREST" && s.asset.version === 1 && s.asset.status === "ACTIVE" &&
    s.asset.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" && s.asset.displayPolicy === "DISPLAY_ALLOWED" &&
    s.asset.rightsStatus === "REVIEW_REQUIRED" && s.asset.storageUrl === null && s.asset.revocable &&
    s.asset.sourceUrl === "https://media.api-sports.io/football/teams/4396.png", "ASSET_STATE")
  requireState(isDeepStrictEqual(s.assetIds, [RED_STAR.assetId]), "UNEXPECTED_ASSET_HISTORY")
  requireState(!s.otherClubOwners.length && !s.otherIdentityOwners.length, "PROVIDER_OCCUPIED")
  requireState(s.playerIds.length === 25 && new Set(s.playerIds).size === 25, "PLAYER_MEMBERSHIP")
  requireState(getVisualAssetSrc(s.club.imageUrl, "club") === null, "LEGACY_IMAGE_WOULD_BYPASS_FALLBACK")
}

export function plannedRedStarCorrection(request: RedStarRequest): RedStarSnapshot {
  validateRedStarPreflight(request.expected)
  requireState(Boolean(request.actor.trim()) && Boolean(request.decisionRef.trim()) &&
    Number.isFinite(Date.parse(request.at)) && new Date(request.at).toISOString() === request.at &&
    Date.parse(request.at) <= Date.now() && Date.parse(request.at) > Math.max(
      Date.parse(request.expected.club.updatedAt), Date.parse(request.expected.identity.updatedAt),
      Date.parse(request.expected.asset.updatedAt)), "AUDIT_METADATA")
  const after = structuredClone(request.expected)
  after.club.apiFootballId = RED_STAR.newId
  after.club.updatedAt = request.at
  after.identity.status = "BLOCKED"
  after.identity.version++
  after.identity.updatedAt = request.at
  // Retain the original evidence and full before-state in the database itself.
  after.identity.evidence = JSON.parse(JSON.stringify({ previousEvidence: request.expected.identity.evidence,
    correction: { decisionRef: request.decisionRef, actor: request.actor, at: request.at,
      before: { club: request.expected.club, identity: request.expected.identity, asset: request.expected.asset },
      playerIds: request.expected.playerIds, protectedHash: request.expected.protectedHash,
      action: "CORRECT_CLUB_ID_AND_QUARANTINE_WRONG_CREST" } }))
  after.asset.operationalDecision = "REVOKED"
  after.asset.displayPolicy = "DISPLAY_BLOCKED"
  after.asset.version++
  after.asset.updatedAt = request.at
  return after
}

/** Inert: no singleton, environment, network or retry. Caller supplies reviewed pins. */
export async function correctRedStar(store: RedStarStore, request: RedStarRequest): Promise<RedStarResult> {
  const before = structuredClone(request.expected)
  let planned: RedStarSnapshot
  try { planned = plannedRedStarCorrection({ ...request, expected: before }) }
  catch (error) { return { status: "REJECTED", reason: error instanceof CorrectionAbort ? error.message : "INVALID_REQUEST", retries: 0, before } }
  return applyTransition(store, before, planned)
}

/** Explicit compensation only: never republishes the known incorrect crest. */
export async function reverseRedStarClubId(store: RedStarStore, receipt: RedStarResult,
  audit: { actor: string; decisionRef: string; at: string }): Promise<RedStarResult> {
  const before = structuredClone(receipt.after ?? receipt.before)
  try {
    return applyTransition(store, before, plannedRedStarReversal(receipt, audit))
  } catch (error) {
    return { status: "REJECTED", reason: error instanceof CorrectionAbort ? error.message : "INVALID_RECEIPT", retries: 0, before }
  }
}

export function plannedRedStarReversal(receipt: RedStarResult,
  audit: { actor: string; decisionRef: string; at: string }): RedStarSnapshot {
    const before = structuredClone(receipt.after ?? receipt.before)
    validateRedStarPreflight(receipt.before)
    requireState(receipt.status === "COMMITTED" && !!receipt.after && before.club.apiFootballId === 104 &&
      before.identity.status === "BLOCKED" && before.identity.version === 2 &&
      before.asset.operationalDecision === "REVOKED" && before.asset.displayPolicy === "DISPLAY_BLOCKED" &&
      before.asset.version === 2 && !before.otherClubOwners.length && !before.otherIdentityOwners.length,
    "REVERSAL_STATE")
    requireState(!!audit.actor.trim() && !!audit.decisionRef.trim() &&
      Number.isFinite(Date.parse(audit.at)) && new Date(audit.at).toISOString() === audit.at &&
      Date.parse(audit.at) <= Date.now() && Date.parse(audit.at) > Date.parse(before.identity.updatedAt), "AUDIT_METADATA")
    const after = structuredClone(before)
    after.club.apiFootballId = null
    after.club.updatedAt = audit.at
    after.identity.version++
    after.identity.updatedAt = audit.at
    after.identity.evidence = JSON.parse(JSON.stringify({ previousEvidence: before.identity.evidence,
      reversal: { ...audit, action: "CLEAR_PROVIDER_ID_KEEP_CREST_QUARANTINED" } }))
    return after
}

/** Only a read capability is accepted; never promotes a receipt or repeats a write. */
export async function reconcileRedStar(store: Pick<RedStarStore, "read">,
  states: { before: RedStarSnapshot; after: RedStarSnapshot }) {
  const actual = await store.read()
  const matches = Object.fromEntries((Object.keys(states.before) as (keyof RedStarSnapshot)[]).map(key =>
    [key, { before: isDeepStrictEqual(actual[key], states.before[key]), after: isDeepStrictEqual(actual[key], states.after[key]) }]))
  const status = isDeepStrictEqual(actual, states.after) ? "MATCHES_EXPECTED"
    : isDeepStrictEqual(actual, states.before) ? "MATCHES_BEFORE" : "DIVERGED"
  return { status, matches, retries: 0 }
}

async function applyTransition(store: RedStarStore, before: RedStarSnapshot, planned: RedStarSnapshot): Promise<RedStarResult> {
  let callbackReturned = false
  try {
    await store.transaction(async tx => {
      requireState(isDeepStrictEqual(await tx.read(), before), "EXPECTED_STATE_CHANGED")
      requireState(await tx.changeClub(before.club, planned.club) === 1, "CLUB_CAS")
      requireState(await tx.changeIdentity(before.identity, planned.identity) === 1, "IDENTITY_CAS")
      requireState(await tx.changeAsset(before.asset, planned.asset) === 1, "ASSET_CAS")
      requireState(isDeepStrictEqual(await tx.read(), planned), "TRANSACTION_READBACK_MISMATCH")
      callbackReturned = true
    })
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""
    const knownRollback = ["P2034", "40001", "40P01", "P2002", "23505"].includes(code)
    return { status: callbackReturned && !knownRollback ? "INDETERMINATE_COMMIT" : "ROLLED_BACK",
      reason: error instanceof CorrectionAbort ? error.message : "TRANSACTION_FAILED", retries: 0, before, after: planned }
  }
  try {
    requireState(isDeepStrictEqual(await store.read(), planned), "POST_COMMIT_READBACK_MISMATCH")
    return { status: "COMMITTED", reason: "INDEPENDENT_READ_CONFIRMED", retries: 0, before, after: planned }
  } catch {
    return { status: "CONFIRMATION_FAILED", reason: "COMMIT_CONFIRMED_CHECK_DATABASE_DO_NOT_RETRY", retries: 0, before, after: planned }
  }
}
