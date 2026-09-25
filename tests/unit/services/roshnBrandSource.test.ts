import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { ROSHN_SOURCE as R, selectBrandIdentities } from "../../../lib/brackBrandSource"
import { fetchOfficialLeagueBytes, serveRoshnAsset } from "../../../services/brackBrandDelivery"
import { approvedCandidate, operationSource } from "../../../scripts/officialLeagueOperation"
import { resolveAssetSource, type AssetReference } from "../../../lib/assetPipeline"
import { validateBrandAssetCandidate } from "../../../services/brandAssetWrite"

const bytes = readFileSync("tests/fixtures/brand-assets/roshn.png")
const at = "2026-09-24T14:21:36.000Z"
const candidate = () => approvedCandidate("roshn", { ...R, approved: true,
  databaseId: "rknsog8tmbl5u4xqbogxfux5", decisionRef: "synthetic", approvedAt: at,
  approvedBy: "test", riskReason: "synthetic" }, at)
const reference = (): AssetReference => ({ ...candidate(), entityId: R.entityId,
  identity: { entityType: "league", provider: R.provider, providerEntityId: R.providerEntityId, assetType: "LOGO" },
  version: 1, status: "ACTIVE", publicationAllowedByServer: true })
const request = () => new Request("https://futscout.test" + R.deliveryPath)
const response = () => new Response(bytes, { headers: { "Content-Type": "image/png" } })

test("ROSHN pins current 2026/27 official identity and PNG independently of API 307", async () => {
  assert.equal(operationSource("roshn"), R)
  assert.equal(R.season, "2026/27")
  validateBrandAssetCandidate(candidate(), new Date(at))
  assert.equal(resolveAssetSource(reference(), "league"), R.deliveryPath)
  assert.deepEqual(await fetchOfficialLeagueBytes(R, async (url, options) => {
    assert.equal(url, R.sourceUrl); assert.equal(options?.redirect, "manual"); return response()
  }), bytes)
  for (const changes of [{ providerEntityId: "307" }, { sourceUrl: R.sourceUrl + "?x=1" },
    { contentHash: "0".repeat(64) }, { storageUrl: "/copy.png" }]) {
    assert.throws(() => validateBrandAssetCandidate({ ...candidate(), ...changes }, new Date(at)))
  }
})

test("ROSHN release flag denies before reads; enabled delivery rechecks revocation", async () => {
  let reads = 0, calls = 0
  const read = async () => { reads++; return reference() }
  const fetcher: typeof fetch = async () => { calls++; return response() }
  const admit = () => () => {}
  assert.equal((await serveRoshnAsset(request(), read, fetcher, admit, false)).status, 404)
  assert.deepEqual([reads, calls], [0, 0])
  const allowed = await serveRoshnAsset(request(), read, fetcher, admit, true)
  assert.equal(allowed.status, 200); assert.deepEqual([reads, calls], [2, 1])
  assert.deepEqual(Buffer.from(await allowed.arrayBuffer()), bytes)
  assert.equal(allowed.headers.get("Cache-Control"), "private, no-store, max-age=0")
  reads = 0
  assert.equal((await serveRoshnAsset(request(), async () => ++reads === 1 ? reference() :
    { ...reference(), operationalDecision: "REVOKED" }, fetcher, admit, true)).status, 404)
  assert.equal((await serveRoshnAsset(new Request(request().url + "?url=https://evil"), read, fetcher, admit, true)).status, 404)
  assert.equal((await serveRoshnAsset(request(), read, async () => new Response(null, { status: 302 }), admit, true)).status, 502)
  const changed = Buffer.from(bytes); changed[100] ^= 1
  await assert.rejects(fetchOfficialLeagueBytes(R, async () => new Response(changed, { headers: { "Content-Type": "image/png" } })))
})

test("negative ROSHN history vetoes all providers without bypassing Brack or ISL", () => {
  const asset = { assetType: "LOGO", status: "ACTIVE", rightsStatus: "REVIEW_REQUIRED",
    operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", displayPolicy: "DISPLAY_ALLOWED" }
  const official = { ...R, entityType: "LEAGUE", status: "VERIFIED", assets: [asset] }
  const api = { ...official, provider: "api-football", providerEntityId: "307" }
  assert.deepEqual(selectBrandIdentities([api, official]), [official])
  assert.deepEqual(selectBrandIdentities([api]), [])
  assert.deepEqual(selectBrandIdentities([official, { ...api, status: "BLOCKED" }]), [])
  assert.deepEqual(selectBrandIdentities([official, { ...api, assets: [{ ...asset, operationalDecision: "REVOKED" }] }]), [])
})
