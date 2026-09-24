import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import * as sources from "../../../lib/brackBrandSource"
import * as pipeline from "../../../lib/assetPipeline"
import { ISL_SOURCE as I, BRACK_SOURCE as B, matchesOfficialLeagueSource, selectBrandIdentities } from "../../../lib/brackBrandSource"
import { isReviewedIslSvg } from "../../../lib/islSvgPolicy"
import { fetchOfficialLeagueBytes, serveIslAsset, serveBrackAsset } from "../../../services/brackBrandDelivery"
import { PREPARED_OFFICIAL_LEAGUE_ALLOWLIST } from "../../../services/officialLeaguePreparation"
import { BRAND_ASSET_PILOT_ALLOWLIST, validateBrandAssetCandidate, persistBrandAssetAtomically,
  type BrandAssetCandidate, type BrandAssetWriteStore } from "../../../services/brandAssetWrite"

const bytes = readFileSync("tests/fixtures/brand-assets/isl.svg")
const at = "2026-09-24T02:02:15.758Z"
const request = () => new Request("https://futscout.test" + I.deliveryPath)
function reference(changes: Partial<pipeline.AssetReference> = {}) {
  return { identity: { entityType: "league", provider: I.provider, providerEntityId: I.providerEntityId, assetType: "LOGO" },
    entityId: I.entityId, sourceUrl: I.sourceUrl, contentHash: I.contentHash, storageUrl: null, fetchedAt: at, version: 1,
    status: "ACTIVE", rightsStatus: "REVIEW_REQUIRED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE",
    displayPolicy: "DISPLAY_ALLOWED", operationalAuthorizedAt: at, operationalDecisionRef: "synthetic-only",
    operatorRiskAccepted: true, riskAcceptedAt: at, riskAcceptedBy: "test", riskReason: "synthetic-only",
    sourceTermsUrl: I.evidenceUrl, revocable: true, publicationAllowedByServer: true, ...changes } as const
}
const response = (body: Uint8Array = bytes, mime = "image/svg+xml") => new Response(new Uint8Array(body), { headers: { "content-type": mime } })

test("only Brack and ISL have a prepared allowlist; neither is yet authorized in the writer", async () => {
  assert.deepEqual(PREPARED_OFFICIAL_LEAGUE_ALLOWLIST.map(row => row.entityId), [B.entityId, I.entityId])
  assert.equal(BRAND_ASSET_PILOT_ALLOWLIST.length, 614)
  assert.equal(BRAND_ASSET_PILOT_ALLOWLIST.filter(row => row.entityType === "LEAGUE").length, 40)
  const r = reference()
  const candidate: BrandAssetCandidate = { ...r, ...r.identity, entityType: "LEAGUE", provider: I.provider,
    providerEntityId: I.providerEntityId, identityStatus: "VERIFIED", contentHash: I.contentHash,
    storageUrl: null, deliveryStatus: "VALIDATED" }
  validateBrandAssetCandidate(candidate, new Date(at))
  const store: BrandAssetWriteStore = { audit: async () => { throw Error("must not audit") },
    transaction: async () => { throw Error("must not write") } }
  assert.equal((await persistBrandAssetAtomically(store, { candidate,
    expected: { identity: null, latestAsset: null, activeAssetId: null } })).status, "AUTHORIZATION_MISMATCH")
  for (const change of [{ provider: "api-football" as const }, { sourceUrl: I.sourceUrl + "#x" },
    { providerEntityId: "323" }, { entityId: B.entityId }, { rightsStatus: "APPROVED" as const }]) {
    assert.throws(() => validateBrandAssetCandidate({ ...candidate, ...change }, new Date(at)))
  }
})

test("reviewed SVG has exact bytes/hash and only the closed svg/path grammar", () => {
  assert.equal(bytes.length, I.bytes)
  assert.equal(createHash("sha256").update(bytes).digest("hex"), I.contentHash)
  assert.equal(isReviewedIslSvg(bytes), true)
  const svg = bytes.toString("utf8")
  for (const hostile of [
    svg.replace('<path ', '<path onload="alert(1)" '), svg.replace('<path ', '<path href="https://evil" '),
    svg.replace('</svg>', '<script>alert(1)</script></svg>'),
    svg.replace('</svg>', '<foreignObject><div>bad</div></foreignObject></svg>'),
    svg.replace('</svg>', '<image href="https://evil"/></svg>'),
    svg.replace('</svg>', '<use href="#x"/></svg>'),
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + svg,
    svg.replace('fill="white"', 'fill="url(https://evil)"'),
    svg.replace('fill="white"', 'fill="&#119;hite"'),
    svg.replace('width="74"', 'width="75000"'),
    svg.replace('<path ', '<path style="fill:red" '), svg.replace('<path ', '<path d="M0 0" '),
  ]) assert.equal(isReviewedIslSvg(Buffer.from(hostile)), false)
})

test("ISL fetch pins URL, MIME, bytes and hash; rejects redirects, changed bytes and raster without retry", async () => {
  let calls = 0
  const good = await fetchOfficialLeagueBytes(I, async (url, init) => {
    calls++; assert.equal(url, I.sourceUrl); assert.equal(init?.redirect, "manual")
    assert.equal(init?.cache, "no-store"); assert.ok(init?.signal); return response()
  })
  assert.equal(calls, 1); assert.deepEqual(Buffer.from(good), bytes)
  const changed = Buffer.from(bytes); changed[200] ^= 1
  for (const make of [() => response(changed), () => response(bytes, "image/png"),
    () => response(Buffer.concat([bytes, Buffer.from(" ")])),
    () => new Response(null, { status: 302, headers: { location: I.sourceUrl } }),
    () => new Response(null, { status: 429 })]) {
    calls = 0
    await assert.rejects(fetchOfficialLeagueBytes(I, async () => { calls++; return make() }))
    assert.equal(calls, 1)
  }
  await assert.rejects(fetchOfficialLeagueBytes({ ...I }, async () => { throw Error("no fetch for unpinned source object") }))
})

test("SVG streaming cancels at the first oversized chunk", async () => {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(I.bytes + 1)) },
    cancel() { cancelled = true } })
  await assert.rejects(fetchOfficialLeagueBytes(I, async () => new Response(body, { headers: { "content-type": "image/svg+xml" } })))
  assert.equal(cancelled, true)
})

test("independent flags deny by default; enabled SVG has restrictive headers and rereads revocation", async () => {
  const oldB = process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED, oldI = process.env.ISL_BRAND_ASSET_DELIVERY_ENABLED
  let reads = 0, downloads = 0
  const read = async () => { reads++; return reference() }
  const fetcher: typeof fetch = async () => { downloads++; return response() }
  try {
    process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED = "true"
    delete process.env.ISL_BRAND_ASSET_DELIVERY_ENABLED
    assert.equal((await serveIslAsset(request(), read, fetcher)).status, 404)
    assert.deepEqual([reads, downloads], [0, 0])
    process.env.ISL_BRAND_ASSET_DELIVERY_ENABLED = "true"
    process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED = "false"
    const result = await serveIslAsset(request(), read, fetcher)
    assert.equal(result.status, 200); assert.deepEqual([reads, downloads], [2, 1])
    assert.equal(result.headers.get("content-type"), "image/svg+xml")
    assert.match(result.headers.get("content-disposition")!, /^attachment/)
    assert.equal(result.headers.get("content-security-policy"), "default-src 'none'; sandbox")
    assert.equal(result.headers.get("x-content-type-options"), "nosniff")
    assert.match(result.headers.get("cache-control")!, /no-store/)
    assert.equal((await serveBrackAsset(request(), read, fetcher)).status, 404)
    assert.deepEqual([reads, downloads], [2, 1])
    reads = 0
    const revoked = await serveIslAsset(request(), async () => ++reads === 1 ? reference() : reference({ operationalDecision: "REVOKED" }), fetcher)
    assert.equal(revoked.status, 404); assert.equal((await revoked.arrayBuffer()).byteLength, 0)
    assert.equal((await serveIslAsset(new Request('https://x/api/brand-assets/isl?url=https://evil'), read, fetcher)).status, 404)
    assert.equal((await serveIslAsset(request(), read, async () => { throw Error("origin unavailable") })).status, 502)
  } finally {
    if (oldB === undefined) delete process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED
    else process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED = oldB
    if (oldI === undefined) delete process.env.ISL_BRAND_ASSET_DELIVERY_ENABLED
    else process.env.ISL_BRAND_ASSET_DELIVERY_ENABLED = oldI
  }
})

test("ISL has a single deterministic source and any provider's blocked or revoked history vetoes it", () => {
  const r = reference()
  const official = { ...r.identity, providerEntityId: I.providerEntityId, entityType: "LEAGUE", entityId: I.entityId, status: "VERIFIED", assets: [{ ...r, assetType: "LOGO" }] }
  const api = { ...official, provider: "api-football", providerEntityId: "323" }
  for (const rows of [[official, api], [api, official]]) assert.deepEqual(selectBrandIdentities(rows), [official])
  assert.deepEqual(selectBrandIdentities([official, official]), [])
  for (const negative of [{ ...api, status: "BLOCKED" },
    ...[{ operationalDecision: "REVOKED" }, { displayPolicy: "DISPLAY_BLOCKED" }, { rightsStatus: "BLOCKED" }]
      .map(change => ({ ...api, assets: [{ ...api.assets[0], ...change, status: "STALE" }] }))]) {
    assert.deepEqual(selectBrandIdentities([official, negative]), [])
    assert.deepEqual(selectBrandIdentities([negative, official]), [])
  }
  assert.equal(pipeline.resolveAssetSource(I.sourceUrl, "league"), null)
  assert.equal(matchesOfficialLeagueSource({ ...r, ...r.identity }), true)
  assert.equal(pipeline.resolveAssetSource(reference({ identity: { ...r.identity, provider: B.provider } }), "league"), null)
})

test("actual reader includes ISL negative history; UI uses controlled img, never an SVG optimizer", async () => {
  const r = reference()
  const official = { ...r.identity, entityType: "LEAGUE", entityId: I.entityId, status: "VERIFIED",
    assets: [{ ...r, assetType: "LOGO", fetchedAt: new Date(at), operationalAuthorizedAt: new Date(at), riskAcceptedAt: new Date(at) }] }
  let rows = [official]
  const reader = loadCatalogModule<typeof import("../../../services/brandAssetReadService")>("services/brandAssetReadService.ts", {
    "server-only": {}, "../lib/brackBrandSource": sources, "../lib/assetPipeline": pipeline,
    "../lib/prisma": { prisma: { brandAssetIdentity: { findMany: async (query: unknown) => {
      assert.ok(JSON.stringify(query).includes(I.entityId)); return rows
    } } } },
  })
  assert.equal((await reader.getBrandAssetsForEntities({ leagueIds: [I.entityId] })).leagues.get(I.entityId)?.identity.provider, I.provider)
  rows = [official, { ...official, provider: "api-football", status: "BLOCKED", assets: [] }]
  assert.equal((await reader.getBrandAssetsForEntities({ leagueIds: [I.entityId] })).leagues.size, 0)
  const { default: Logo } = loadCatalogModule<typeof import("../../../app/components/LeagueLogo")>("app/components/LeagueLogo.tsx", { react: React })
  const html = renderToStaticMarkup(React.createElement(Logo, { locale: "pt", name: "ISL", asset: r }))
  assert.match(html, /src="\/api\/brand-assets\/isl"/); assert.doesNotMatch(html, /_next\/image|indiansuperleague.com/)
  const fallback = renderToStaticMarkup(React.createElement(Logo, { locale: "pt", name: "ISL", asset: reference({ displayPolicy: "DISPLAY_BLOCKED" }) }))
  assert.doesNotMatch(fallback, /<img/); assert.match(fallback, /brandAssetFallback-league/)
})
