import { isDeepStrictEqual } from "node:util"
import type { Club, BrandAssetIdentity, BrandAsset } from "../app/generated/prisma/client"
import { getVisualAssetSrc } from "../lib/visualAssets"

type Wire<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] }
export type ClubCorrectionPin = { clubId: string; eaId: string; leagueId: string; oldId: number | null; newId: number; evidenceRef: string }
export type ClubCorrectionSnapshot = {
  club: Wire<Club>; identities: (Wire<BrandAssetIdentity> & { assets: Wire<BrandAsset>[] })[]
  playerIds: string[]; conflicts: string[]; protectedHash: string
}
export type ClubCorrectionStore = {
  read(): Promise<ClubCorrectionSnapshot>
  transaction<T>(work: (tx: { read(): Promise<ClubCorrectionSnapshot>; apply(before: ClubCorrectionSnapshot, after: ClubCorrectionSnapshot): Promise<void> }) => Promise<T>): Promise<T>
}
function requireState(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
export function planClubCorrection(pin: ClubCorrectionPin, before: ClubCorrectionSnapshot, at: string, decisionRef: string): ClubCorrectionSnapshot {
  requireState(before.club.id === pin.clubId && before.club.externalId === pin.eaId && before.club.leagueId === pin.leagueId && before.club.apiFootballId === pin.oldId, "CLUB_PIN_MISMATCH")
  requireState(Number.isSafeInteger(pin.newId) && pin.newId > 0 && pin.newId !== pin.oldId && pin.evidenceRef.trim() && decisionRef.trim(), "INVALID_SCOPE")
  requireState(!before.conflicts.length, "PROVIDER_OCCUPIED")
  requireState(getVisualAssetSrc(before.club.imageUrl, "club") === null, "LEGACY_IMAGE_WOULD_BYPASS_FALLBACK")
  requireState(new Set(before.playerIds).size === before.playerIds.length, "PLAYER_SET_INVALID")
  requireState(new Date(at).toISOString() === at && Date.parse(at) <= Date.now() && Date.parse(at) > Date.parse(before.club.updatedAt), "INVALID_TIME")
  if (pin.oldId === null) requireState(before.identities.length === 0, "UNEXPECTED_REGISTRY_HISTORY")
  else {
    requireState(before.identities.length === 1, "UNEXPECTED_REGISTRY_HISTORY")
    const identity = before.identities[0]
    requireState(identity.entityType === "CLUB" && identity.entityId === pin.clubId && identity.provider === "api-football" && identity.providerEntityId === String(pin.oldId) && identity.status === "VERIFIED" && identity.version === 1, "IDENTITY_STATE")
    requireState(identity.assets.length === 1, "UNEXPECTED_ASSET_HISTORY")
    const asset = identity.assets[0]
    requireState(asset.identityId === identity.id && asset.assetType === "CREST" && asset.version === 1 && asset.status === "ACTIVE" && asset.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" && asset.displayPolicy === "DISPLAY_ALLOWED" && asset.rightsStatus === "REVIEW_REQUIRED" && asset.storageUrl === null && asset.revocable && asset.sourceUrl === `https://media.api-sports.io/football/teams/${pin.oldId}.png`, "ASSET_STATE")
    requireState(Date.parse(at) > Date.parse(identity.updatedAt) && Date.parse(at) > Date.parse(asset.updatedAt), "INVALID_TIME")
  }
  const after = structuredClone(before)
  after.club.apiFootballId = pin.newId
  after.club.updatedAt = at
  for (const identity of after.identities) {
    identity.status = "BLOCKED"; identity.version++; identity.updatedAt = at
    identity.evidence = JSON.parse(JSON.stringify({ previousEvidence: identity.evidence, correction: { pin, at, decisionRef, before, action: "CORRECT_PROVIDER_ID_PRESERVE_HISTORY" } }))
    for (const asset of identity.assets) { asset.operationalDecision = "REVOKED"; asset.displayPolicy = "DISPLAY_BLOCKED"; asset.version++; asset.updatedAt = at }
  }
  return after
}
export async function applyClubCorrection(store: ClubCorrectionStore, before: ClubCorrectionSnapshot, after: ClubCorrectionSnapshot) {
  let callbackReturned = false
  try {
    await store.transaction(async tx => {
      requireState(isDeepStrictEqual(await tx.read(), before), "EXPECTED_STATE_CHANGED")
      await tx.apply(before, after)
      requireState(isDeepStrictEqual(await tx.read(), after), "TRANSACTION_READBACK_MISMATCH")
      callbackReturned = true
    })
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""
    return { status: callbackReturned && !["P2034", "40001", "40P01", "P2002", "23505"].includes(code) ? "INDETERMINATE_COMMIT" : "ROLLED_BACK", retries: 0 }
  }
  try { requireState(isDeepStrictEqual(await store.read(), after), "CONFIRMATION_MISMATCH") }
  catch { return { status: "CONFIRMATION_FAILED", retries: 0 } }
  return { status: "COMMITTED_INDEPENDENT_READ_CONFIRMED", retries: 0 }
}
export async function reconcileClubCorrection(store: Pick<ClubCorrectionStore, "read">, before: ClubCorrectionSnapshot, after: ClubCorrectionSnapshot) {
  const current = await store.read()
  return { status: isDeepStrictEqual(current, after) ? "MATCHES_EXPECTED" : isDeepStrictEqual(current, before) ? "MATCHES_BEFORE" : "DIVERGED", retries: 0 }
}
