import assert from "node:assert/strict"
import { test } from "node:test"
import {
  assetIdentityKey,
  brandAssetPublicationPolicyFromEnvironment,
  deduplicateAssetReferences,
  normalizeAssetReference,
  resolveAssetByIdentity,
  resolveAssetSource,
  type AssetReference,
} from "../../../lib/assetPipeline"

const club: AssetReference = {
  identity: { entityType: "club", provider: "api-football", providerEntityId: 50, assetType: "CREST" },
  entityId: "club-manchester-city",
  sourceUrl: "https://media.example.test/teams/50.png",
  storageUrl: "/clubs/manchester-city.svg",
  contentHash: "sha256:fixture",
  version: 1,
  fetchedAt: "2026-09-16T12:00:00.000Z",
  rightsStatus: "APPROVED",
  status: "ACTIVE",
}

const publicationDisabled = { reviewPublicationEnabled: false, blockedProviders: new Set<string>(),
  blockedEntityIds: new Set<string>() } as const
const publicationEnabled = { reviewPublicationEnabled: true, blockedProviders: new Set<string>(),
  blockedEntityIds: new Set<string>() } as const

function riskAcceptedReview(changes: Partial<AssetReference> = {}): AssetReference {
  return { ...club, storageUrl: null, rightsStatus: "REVIEW_REQUIRED",
    operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", operationalAuthorizedAt: "2026-09-21T18:00:00.000Z",
    operationalDecisionRef: "owner-decision:brand-assets-phase-j", operatorRiskAccepted: true,
    riskAcceptedAt: "2026-09-21T18:00:00.000Z", riskAcceptedBy: "FutScout owner",
    riskReason: "Controlled remote beta pilot; trademark rights remain unverified.",
    sourceTermsUrl: "https://www.api-football.com/terms", revocable: true, ...changes }
}

test("asset registry resolves only an exact provider identity and asset type", () => {
  const league: AssetReference = {
    ...club,
    identity: { entityType: "league", provider: "api-football", providerEntityId: 39, assetType: "LOGO" },
    entityId: "league-premier-league",
    sourceUrl: "https://media.example.test/leagues/39.png",
    storageUrl: "/leagues/premier-league.svg",
  }
  const registry = new Map([
    [assetIdentityKey(club.identity), club],
    [assetIdentityKey(league.identity), league],
  ])

  assert.equal(resolveAssetByIdentity(club.identity, registry), club)
  assert.equal(resolveAssetByIdentity(league.identity, registry), league)
  assert.equal(resolveAssetByIdentity({ ...club.identity, providerEntityId: 999 }, registry), null)
  assert.equal(resolveAssetByIdentity({ ...club.identity, assetType: "LOGO" }, registry), null)
  const forged = new Map([[assetIdentityKey(club.identity), { ...club, identity: { ...club.identity, providerEntityId: 541 } }]])
  assert.equal(resolveAssetByIdentity(club.identity, forged), null)
})

test("rights gate chooses only the URL allowed by the explicit policy", () => {
  assert.equal(resolveAssetSource(club, "club"), "/clubs/manchester-city.svg")
  assert.equal(resolveAssetSource({ ...club, rightsStatus: "REMOTE_ONLY" }, "club"), club.sourceUrl)
  assert.equal(resolveAssetSource({ ...club, rightsStatus: "CACHE_ALLOWED" }, "club"), club.storageUrl)
  assert.equal(resolveAssetSource({ ...club, rightsStatus: "REVIEW_REQUIRED" }, "club", publicationDisabled), null)
  assert.equal(resolveAssetSource({ ...club, rightsStatus: "BLOCKED" }, "club", publicationEnabled), null)
})

test("controlled publication defaults off and requires complete per-asset risk acceptance", () => {
  const review = { ...club, storageUrl: "/clubs/must-not-be-used.svg", rightsStatus: "REVIEW_REQUIRED" as const }
  assert.deepEqual(brandAssetPublicationPolicyFromEnvironment(undefined), publicationDisabled)
  assert.deepEqual(brandAssetPublicationPolicyFromEnvironment("false"), publicationDisabled)
  assert.deepEqual(brandAssetPublicationPolicyFromEnvironment("true"), publicationEnabled)
  assert.deepEqual(brandAssetPublicationPolicyFromEnvironment("TRUE"), publicationDisabled)
  assert.equal(resolveAssetSource(review, "club", publicationDisabled), null)
  assert.equal(resolveAssetSource(review, "club", publicationEnabled), null)
  assert.equal(resolveAssetSource(riskAcceptedReview(), "club", publicationDisabled), null)
  assert.equal(resolveAssetSource(riskAcceptedReview(), "club", publicationEnabled), club.sourceUrl)
  assert.equal(resolveAssetSource({ ...review, rightsStatus: "BLOCKED" }, "club", publicationEnabled), null)
  assert.equal(resolveAssetSource({ ...review, operationalDecision: "REVOKED" }, "club", publicationEnabled), null)
  assert.equal(resolveAssetSource({ ...review, sourceUrl: "javascript:bad" }, "club", publicationEnabled), null)
})

test("owner-authorized remote use is separate from REVIEW_REQUIRED evidence", () => {
  const authorized = riskAcceptedReview()
  assert.equal(resolveAssetSource(authorized, "club", publicationEnabled), club.sourceUrl)
  assert.equal(resolveAssetSource({ ...authorized, operationalDecisionRef: null }, "club", publicationEnabled), null)
  assert.equal(resolveAssetSource({ ...authorized, operationalAuthorizedAt: null }, "club", publicationEnabled), null)
  assert.equal(resolveAssetSource({ ...authorized, riskAcceptedBy: null }, "club", publicationEnabled), null)
  assert.equal(resolveAssetSource({ ...authorized, sourceTermsUrl: "http://insecure.test/terms" }, "club", publicationEnabled), null)
  assert.equal(resolveAssetSource({ ...authorized, revocable: false }, "club", publicationEnabled), null)
  assert.equal(resolveAssetSource({ ...authorized, operationalDecision: "REVOKED" }, "club"), null)
  assert.equal(resolveAssetSource({ ...authorized, rightsStatus: "BLOCKED" }, "club"), null)
})

test("provider and entity kill switches force immediate fallback", () => {
  const authorized = riskAcceptedReview()
  assert.equal(resolveAssetSource(authorized, "club", { ...publicationEnabled,
    blockedProviders: new Set(["api-football"]) }), null)
  assert.equal(resolveAssetSource(authorized, "club", { ...publicationEnabled,
    blockedEntityIds: new Set([authorized.entityId]) }), null)
})

test("non-active, malformed and wrong-context assets retain the FutScout fallback", () => {
  assert.equal(resolveAssetSource({ ...club, status: "VALIDATED" }, "club"), null)
  assert.equal(resolveAssetSource({ ...club, sourceUrl: "javascript:bad", storageUrl: null }, "club"), null)
  assert.equal(resolveAssetSource({ ...club, fetchedAt: "invalid" }, "club"), null)
  assert.equal(resolveAssetSource({ ...club, version: 0 }, "club"), null)
  assert.equal(resolveAssetSource({ ...club, identity: { ...club.identity, assetType: "LOGO" } }, "club"), null)
  assert.equal(resolveAssetSource(club, "league"), null)
  assert.equal(resolveAssetSource("/player-shields/en/1.png", "club"), null)
  assert.equal(normalizeAssetReference({ ...club, entityId: "" }), null)
})

test("remote-only never leaks a cached copy and approved assets can fall back to source", () => {
  assert.equal(resolveAssetSource({ ...club, rightsStatus: "REMOTE_ONLY", storageUrl: "/clubs/forbidden.svg" }, "club"), club.sourceUrl)
  assert.equal(resolveAssetSource({ ...club, storageUrl: null }, "club"), club.sourceUrl)
})

test("asset references are deduplicated by provider identity while preserving first occurrence", () => {
  const duplicate = { ...club, sourceUrl: "https://media.example.test/teams/50-v2.png" }
  const otherVersion = { ...club, identity: { ...club.identity, providerEntityId: 541 }, entityId: "club-real-madrid" }
  assert.deepEqual(deduplicateAssetReferences([club, duplicate, otherVersion]), [club, otherVersion])
})
