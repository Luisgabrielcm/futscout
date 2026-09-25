import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { PUNJAB_SOURCE as P, matchesPunjabSource } from "../../../lib/punjabBrandSource"
import { isReviewedPunjabSvg } from "../../../lib/punjabSvgPolicy"
import { selectBrandIdentities } from "../../../lib/brackBrandSource"
import { resolveAssetSource, type AssetReference } from "../../../lib/assetPipeline"
import { fetchOfficialLeagueBytes, servePunjabAsset } from "../../../services/brackBrandDelivery"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

const bytes = readFileSync("tests/fixtures/brand-assets/punjab.svg")
const at = "2026-09-25T00:00:00Z"
const reference = (): AssetReference => ({ ...P, storageUrl: null,
  identity: { entityType: "club", provider: P.provider, providerEntityId: P.providerEntityId, assetType: "CREST" },
  version: 1, fetchedAt: at, rightsStatus: "REVIEW_REQUIRED", status: "ACTIVE", displayPolicy: "DISPLAY_ALLOWED",
  operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", operationalAuthorizedAt: at, operationalDecisionRef: "synthetic",
  operatorRiskAccepted: true, riskAcceptedAt: at, riskAcceptedBy: "test", riskReason: "test", sourceTermsUrl: P.evidenceUrl,
  revocable: true, publicationAllowedByServer: true })
const response = () => new Response(bytes, { headers: { "Content-Type": "image/svg+xml" } })
const request = new Request("https://local.test" + P.deliveryPath)

test("Punjab exact official source pins SVG hash, closed grammar and provider identity", async () => {
  assert.equal(bytes.length, P.bytes)
  assert.equal(createHash("sha256").update(bytes).digest("hex"), P.contentHash)
  assert.equal(isReviewedPunjabSvg(bytes), true)
  for (const addition of ['<script>alert(1)</script>', '<image href="https://evil"/>', '<use xlink:href="#x"/>',
    '<foreignObject/>', '<path onclick="alert(1)" d="M0,0"/>', '<path style="fill:url(https://evil)" d="M0,0"/>']) {
    assert.equal(isReviewedPunjabSvg(Buffer.from(bytes.toString().replace("</svg>", addition + "</svg>"))), false)
  }
  assert.equal(matchesPunjabSource({ ...reference(), ...reference().identity }), true)
  assert.equal(matchesPunjabSource({ ...reference(), ...reference().identity, providerEntityId: "3466" }), false)
  assert.equal(resolveAssetSource(reference(), "club"), P.deliveryPath)
  assert.equal(resolveAssetSource(P.sourceUrl, "club"), null)
  assert.equal(resolveAssetSource({ ...reference(), identity: { ...reference().identity, provider: "api-football" } }, "club"), null)
  assert.deepEqual(await fetchOfficialLeagueBytes(P, async (url, options) => {
    assert.equal(url, P.sourceUrl); assert.equal(options?.redirect, "manual"); return response()
  }), bytes)
  const changed = Buffer.from(bytes); changed[100] ^= 1
  await assert.rejects(fetchOfficialLeagueBytes(P, async () => new Response(changed, { headers: { "Content-Type": "image/svg+xml" } })))
  await assert.rejects(fetchOfficialLeagueBytes(P, async () => new Response(null, { status: 302 })))
  await assert.rejects(fetchOfficialLeagueBytes(P, async () => new Response(Buffer.alloc(P.bytes + 1), { headers: { "Content-Type": "image/svg+xml" } })))
})

test("Punjab flag denies before read; delivery rechecks revocation and fails safely", async () => {
  let reads = 0, calls = 0
  const read = async () => { reads++; return reference() }
  const fetcher: typeof fetch = async () => { calls++; return response() }
  const admit = () => () => {}
  assert.equal((await servePunjabAsset(request, read, fetcher, admit, false)).status, 404)
  assert.deepEqual([reads, calls], [0, 0])
  assert.equal((await servePunjabAsset(new Request(request.url + "?url=https://evil"), read, fetcher, admit, true)).status, 404)
  const result = await servePunjabAsset(request, read, fetcher, admit, true)
  assert.equal(result.status, 200); assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes)
  assert.equal(result.headers.get("Content-Security-Policy"), "default-src 'none'; sandbox")
  assert.equal(result.headers.get("Content-Disposition"), 'attachment; filename="punjab.svg"')
  assert.deepEqual([reads, calls], [2, 1])
  reads = 0
  assert.equal((await servePunjabAsset(request, async () => ++reads === 1 ? reference() :
    { ...reference(), operationalDecision: "REVOKED" }, fetcher, admit, true)).status, 404)
  assert.equal((await servePunjabAsset(request, read, async () => { throw Error("offline") }, admit, true)).status, 502)
})

test("Punjab historical wrong identity remains blocked without hiding correct replacement; official revocation vetoes fallback", () => {
  const asset = { assetType: "CREST", status: "ACTIVE", rightsStatus: "REVIEW_REQUIRED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", displayPolicy: "DISPLAY_ALLOWED" }
  const correct = { ...P, entityType: "CLUB", status: "VERIFIED", assets: [asset] }
  const wrong = { ...correct, provider: "api-football", providerEntityId: "7179", status: "BLOCKED",
    assets: [{ ...asset, operationalDecision: "REVOKED", displayPolicy: "DISPLAY_BLOCKED" }] }
  assert.deepEqual(selectBrandIdentities([wrong, correct]), [correct])
  assert.deepEqual(selectBrandIdentities([wrong]), [])
  const alternative = { ...correct, provider: "api-football", providerEntityId: "3466" }
  assert.deepEqual(selectBrandIdentities([wrong, alternative, { ...correct, status: "BLOCKED" }]), [])
  assert.deepEqual(selectBrandIdentities([wrong, alternative, { ...correct, assets: [{ ...asset, operationalDecision: "REVOKED" }] }]), [])
})

test("actual reader includes Punjab official negative history while preserving blocked API history semantics", async () => {
  const r = reference()
  const asset = { ...r, assetType: "CREST", fetchedAt: new Date(at), operationalAuthorizedAt: new Date(at), riskAcceptedAt: new Date(at) }
  let status = "VERIFIED"
  const reader = loadCatalogModule<typeof import("../../../services/brandAssetReadService")>("services/brandAssetReadService.ts", {
    "server-only": {}, "../lib/prisma": { prisma: { brandAssetIdentity: { findMany: async (query: {
      where: { AND: { OR: unknown[] }[] }; select: { assets: { where?: unknown } };
    }) => {
      assert.ok(JSON.stringify(query.where.AND).includes(P.entityId))
      assert.ok(JSON.stringify(query.where.AND).includes(P.provider))
      assert.equal(query.select.assets.where, undefined)
      return [{ ...P, entityType: "CLUB", status, assets: [asset] }]
    } } } },
  })
  assert.equal((await reader.getBrandAssetsForEntities({ clubIds: [P.entityId] })).clubs.get(P.entityId)?.sourceUrl, P.sourceUrl)
  status = "BLOCKED"
  assert.equal((await reader.getBrandAssetsForEntities({ clubIds: [P.entityId] })).clubs.size, 0)
})
