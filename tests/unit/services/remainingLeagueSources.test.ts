import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { ALEAGUE_SOURCE, CYPRUS_SOURCE, selectBrandIdentities } from "../../../lib/brackBrandSource"
import { fetchOfficialLeagueBytes, serveAleagueAsset, serveCyprusAsset } from "../../../services/brackBrandDelivery"
import { jpegDimensions } from "../../../lib/reviewedJpeg"
import type { AssetReference } from "../../../lib/assetPipeline"

for (const [source, file, mime, serve] of [
  [ALEAGUE_SOURCE, "aleague.png", "image/png", serveAleagueAsset],
  [CYPRUS_SOURCE, "cyprus.jpg", "image/jpeg", serveCyprusAsset],
] as const) {
  const bytes = readFileSync(`tests/fixtures/brand-assets/${file}`)
  const reference = (): AssetReference => ({ ...source, storageUrl: null,
    identity: { entityType: "league", provider: source.provider, providerEntityId: source.providerEntityId, assetType: "LOGO" },
    version: 1, fetchedAt: "2026-09-25T00:00:00Z", rightsStatus: "REVIEW_REQUIRED", status: "ACTIVE",
    displayPolicy: "DISPLAY_ALLOWED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", operationalAuthorizedAt: "2026-09-25T00:00:00Z",
    operationalDecisionRef: "synthetic", operatorRiskAccepted: true, riskAcceptedAt: "2026-09-25T00:00:00Z",
    riskAcceptedBy: "test", riskReason: "test", sourceTermsUrl: source.evidenceUrl, revocable: true, publicationAllowedByServer: true })
  const response = () => new Response(bytes, { headers: { "Content-Type": mime } })
  const request = new Request(`https://local.test${source.deliveryPath}`)
  test(`${source.provider}: fixed URL, pinned bytes and actual MIME`, async () => {
    assert.deepEqual(await fetchOfficialLeagueBytes(source, async (url, options) => {
      assert.equal(url, source.sourceUrl); assert.equal(options?.redirect, "manual"); return response()
    }), bytes)
    const changed = Buffer.from(bytes); changed[100] ^= 1
    await assert.rejects(fetchOfficialLeagueBytes(source, async () => new Response(changed, { headers: { "Content-Type": mime } })))
    await assert.rejects(fetchOfficialLeagueBytes(source, async () => new Response(bytes, { headers: { "Content-Type": "image/svg+xml" } })))
    await assert.rejects(fetchOfficialLeagueBytes(source, async () => new Response(null, { status: 302 })))
    await assert.rejects(fetchOfficialLeagueBytes(source, async () => new Response(Buffer.alloc(source.bytes + 1), { headers: { "Content-Type": mime } })))
  })
  test(`${source.provider}: disabled flag, query rejection, delivery and revocation`, async () => {
    let reads = 0, calls = 0
    const read = async () => { reads++; return reference() }
    const fetcher: typeof fetch = async () => { calls++; return response() }
    const admit = () => () => {}
    assert.equal((await serve(request, read, fetcher, admit, false)).status, 404)
    assert.deepEqual([reads, calls], [0, 0])
    assert.equal((await serve(new Request(request.url + "?url=https://evil"), read, fetcher, admit, true)).status, 404)
    const result = await serve(request, read, fetcher, admit, true)
    assert.equal(result.status, 200); assert.equal(result.headers.get("Content-Type"), mime)
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes)
    assert.deepEqual([reads, calls], [2, 1])
    reads = 0
    assert.equal((await serve(request, async () => ++reads === 1 ? reference() : { ...reference(), operationalDecision: "REVOKED" }, fetcher, admit, true)).status, 404)
    assert.equal((await serve(request, read, async () => { throw Error("offline") }, admit, true)).status, 502)
    const asset = { assetType: "LOGO", status: "ACTIVE", rightsStatus: "REVIEW_REQUIRED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", displayPolicy: "DISPLAY_ALLOWED" }
    const identity = { ...source, entityType: "LEAGUE", status: "VERIFIED", assets: [asset] }
    assert.deepEqual(selectBrandIdentities([identity]), [identity])
    assert.deepEqual(selectBrandIdentities([identity, { ...identity, provider: "api-football", status: "BLOCKED" }]), [])
  })
}

test("JPEG parser bounds malformed segments and distinguishes PNG and truncated JPEG", () => {
  const jpeg = readFileSync("tests/fixtures/brand-assets/cyprus.jpg")
  assert.deepEqual(jpegDimensions(jpeg), { width: 800, height: 337 })
  assert.equal(jpegDimensions(jpeg.subarray(0, jpeg.length - 1)), null)
  assert.equal(jpegDimensions(Uint8Array.from([255,216,255,224,255,255,255,217])), null)
  assert.equal(jpegDimensions(readFileSync("tests/fixtures/brand-assets/aleague.png")), null)
})
