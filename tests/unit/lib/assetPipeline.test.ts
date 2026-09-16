import assert from "node:assert/strict"
import { test } from "node:test"
import {
  assetIdentityKey,
  deduplicateAssetReferences,
  normalizeAssetReference,
  resolveAssetByIdentity,
  resolveAssetSource,
  type AssetReference,
} from "../../../lib/assetPipeline"

const club: AssetReference = {
  identity: { kind: "club", provider: "api-football", providerAssetId: 50 },
  sourceUrl: "/clubs/real-madrid.svg", status: "LOCAL_APPROVED",
}

test("asset pipeline resolves clubs and leagues by provider identity only", () => {
  const league: AssetReference = { identity: { kind: "league", provider: "catalog", providerAssetId: "laliga" }, sourceUrl: "/leagues/laliga.svg", status: "LOCAL_APPROVED" }
  const registry = new Map([[assetIdentityKey(club.identity), club], [assetIdentityKey(league.identity), league]])
  assert.equal(resolveAssetByIdentity(club.identity, registry)?.sourceUrl, club.sourceUrl)
  assert.equal(resolveAssetByIdentity(league.identity, registry)?.sourceUrl, league.sourceUrl)
  assert.equal(resolveAssetByIdentity({ ...club.identity, providerAssetId: 999 }, registry), null)
})

test("invalid, unavailable, or rights-uncertain assets fall back safely", () => {
  assert.equal(resolveAssetSource("/player-shields/en/1.png", "club"), null)
  assert.equal(normalizeAssetReference({ ...club, sourceUrl: "javascript:bad" }), null)
  assert.equal(normalizeAssetReference({ ...club, status: "UNAVAILABLE" }), null)
  assert.equal(normalizeAssetReference({ ...club, status: "SOURCE_REVIEW_REQUIRED" }), null)
})

test("asset references are deduplicated by identity, preserving first occurrence", () => {
  const duplicate = { ...club, sourceUrl: "/clubs/updated.svg" }
  assert.deepEqual(deduplicateAssetReferences([club, duplicate]), [club])
})
