import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import * as brackPolicy from "../../../lib/brackBrandSource"
import * as pipeline from "../../../lib/assetPipeline"
import { BRACK_SOURCE as B, selectBrandIdentities } from "../../../lib/brackBrandSource"
import { resolveAssetSource, type AssetReference } from "../../../lib/assetPipeline"
import { createBrackRequestGate, fetchBrackBytes, serveBrackAsset as serveConfiguredBrackAsset } from "../../../services/brackBrandDelivery"
import { BRAND_ASSET_PILOT_ALLOWLIST, validateBrandAssetCandidate,
  type BrandAssetCandidate } from "../../../services/brandAssetWrite"

const bytes = readFileSync("tests/fixtures/brand-assets/brack.png")
const at = "2026-09-24T02:02:15.450Z"
function reference(changes: Partial<AssetReference> = {}): AssetReference {
  return { identity: { entityType: "league", provider: B.provider, providerEntityId: B.providerEntityId, assetType: "LOGO" },
    entityId: B.entityId, sourceUrl: B.sourceUrl, contentHash: B.contentHash, storageUrl: null,
    fetchedAt: at, version: 1, status: "ACTIVE", rightsStatus: "REVIEW_REQUIRED", displayPolicy: "DISPLAY_ALLOWED",
    operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", operationalAuthorizedAt: at,
    operationalDecisionRef: "synthetic-test-only", operatorRiskAccepted: true, riskAcceptedAt: at,
    riskAcceptedBy: "test", riskReason: "synthetic", sourceTermsUrl: B.evidenceUrl, revocable: true,
    publicationAllowedByServer: true, ...changes }
}
function candidate(): BrandAssetCandidate {
  const r = reference()
  return { ...r, ...r.identity, entityType: "LEAGUE", provider: B.provider, providerEntityId: B.providerEntityId,
    identityStatus: "VERIFIED", deliveryStatus: "VALIDATED", storageUrl: null, contentHash: B.contentHash,
    operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", operationalAuthorizedAt: at,
    operationalDecisionRef: "synthetic-test-only", operatorRiskAccepted: true, riskAcceptedAt: at,
    riskAcceptedBy: "test", riskReason: "synthetic", sourceTermsUrl: B.evidenceUrl, revocable: true }
}
function response(body: Uint8Array = bytes, headers: Record<string, string> = {}) {
  return new Response(new Uint8Array(body), { headers: { "content-type": "image/png", ...headers } })
}
const request = () => new Request(`https://futscout.test${B.deliveryPath}`)
// Existing delivery tests explicitly opt in; production defaults to disabled.
function serveBrackAsset(...args: Parameters<typeof serveConfiguredBrackAsset>) {
  return serveConfiguredBrackAsset(args[0], args[1], args[2], args[3], true)
}

test("release gate defaults off and denies even an authorized asset before DB, admission or network", async () => {
  const previous = process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED
  let reads = 0, downloads = 0, admissions = 0
  const read = async () => { reads++; return reference() }
  const fetcher: typeof fetch = async () => { downloads++; return response() }
  const admit = () => { admissions++; return () => {} }
  try {
    for (const value of [undefined, "false", "TRUE", "1", ""]) {
      if (value === undefined) delete process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED
      else process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED = value
      const result = await serveConfiguredBrackAsset(request(), read, fetcher, admit)
      assert.equal(result.status, 404)
      assert.equal((await result.arrayBuffer()).byteLength, 0)
      assert.match(result.headers.get("cache-control")!, /no-store/)
    }
    assert.deepEqual([reads, downloads, admissions], [0, 0, 0])
    process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED = "true"
    assert.equal((await serveConfiguredBrackAsset(request(), read, fetcher, admit)).status, 200)
    assert.deepEqual([reads, downloads, admissions], [2, 1, 1])
    assert.equal((await serveConfiguredBrackAsset(request(), async () => undefined, fetcher, admit)).status, 404)
    assert.equal(downloads, 1)
  } finally {
    if (previous === undefined) delete process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED
    else process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED = previous
  }
})

test("actual GET returns 404 with release disabled or with enabled release and no Registry asset", async () => {
  const previous = process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED
  let reads = 0
  const route = loadCatalogModule<typeof import("../../../app/api/brand-assets/brack/route")>(
    "app/api/brand-assets/brack/route.ts", {
      "../../../../lib/brackBrandSource": brackPolicy,
      "../../../../services/brackBrandDelivery": { serveBrackAsset: serveConfiguredBrackAsset },
      "../../../../services/brandAssetReadService": { getBrandAssetsForEntities: async () => {
        reads++; return { leagues: new Map(), clubs: new Map() }
      } },
    })
  try {
    delete process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED
    assert.equal((await route.GET(request())).status, 404)
    assert.equal(reads, 0)
    process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED = "true"
    assert.equal((await route.GET(request())).status, 404)
    assert.equal(reads, 1)
  } finally {
    if (previous === undefined) delete process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED
    else process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED = previous
  }
})
function row(provider: string = B.provider, changes = {}) {
  return { entityType: "LEAGUE", entityId: B.entityId, provider,
    providerEntityId: provider === B.provider ? B.providerEntityId : "207", status: "VERIFIED",
    assets: [{ assetType: "LOGO", status: "ACTIVE", rightsStatus: "REVIEW_REQUIRED",
      operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", displayPolicy: "DISPLAY_ALLOWED" }], ...changes }
}

test("exact owner-approved Brack tuple is allowlisted without changing the 40 API leagues", () => {
  validateBrandAssetCandidate(candidate(), new Date(at))
  assert.equal(BRAND_ASSET_PILOT_ALLOWLIST.length, 622)
  assert.equal(BRAND_ASSET_PILOT_ALLOWLIST.filter(i => i.entityType === "LEAGUE" && i.provider === "api-football").length, 40)
  assert.deepEqual(BRAND_ASSET_PILOT_ALLOWLIST.filter(i => i.provider === B.provider), [
    { entityType: "LEAGUE", entityId: B.entityId, provider: B.provider, providerEntityId: B.providerEntityId, assetType: "LOGO" },
  ])
})

test("writer and presentation reject wrong identity, provider, hash, storage and rights", () => {
  for (const changes of [
    { entityId: "other" }, { providerEntityId: "207" }, { provider: "api-football" as const },
    { contentHash: "a".repeat(64) }, { storageUrl: "/copied.png" }, { rightsStatus: "APPROVED" as const },
    { entityType: "CLUB" as const },
  ]) assert.throws(() => validateBrandAssetCandidate({ ...candidate(), ...changes }, new Date(at)))
  assert.equal(resolveAssetSource(reference(), "league"), B.deliveryPath)
  for (const changes of [{ entityId: "other" }, { contentHash: "a".repeat(64) }, { storageUrl: "/copy.png" },
    { rightsStatus: "BLOCKED" as const }, { operationalDecision: "REVOKED" as const },
    { displayPolicy: "DISPLAY_BLOCKED" as const }, { publicationAllowedByServer: false },
    { revocable: false }, { operationalDecision: "NOT_AUTHORIZED" as const }]) {
    assert.equal(resolveAssetSource(reference(changes), "league"), null)
  }
  assert.equal(resolveAssetSource(reference({ identity: { ...reference().identity, provider: "api-football" } }), "league"), null)
})

test("URL pin includes scheme, host, port, complete path, query and fragment; raw URL cannot bypass provenance", () => {
  for (const url of [B.sourceUrl.replace("https:", "http:"), B.sourceUrl.replace(".net/", ".net:443/"),
    B.sourceUrl.replace(".net/", ".net.evil/"), B.sourceUrl.replace("69864/", "69865/"),
    B.sourceUrl + "&x=1", B.sourceUrl + "#x", B.sourceUrl.replace("?download=1", ""),
    B.sourceUrl.replace("https://", "https://user:pass@")]) {
    assert.throws(() => validateBrandAssetCandidate({ ...candidate(), sourceUrl: url }, new Date(at)))
    assert.equal(resolveAssetSource(reference({ sourceUrl: url }), "league"), null)
  }
  assert.equal(resolveAssetSource(B.sourceUrl, "league"), null)
})

test("provider coexistence selects only official Brack regardless of order and never falls back", () => {
  const official = row(), api = row("api-football")
  for (const rows of [[official, api], [api, official]]) assert.deepEqual(selectBrandIdentities(rows), [official])
  assert.deepEqual(selectBrandIdentities([api]), [])
  assert.deepEqual(selectBrandIdentities([official, official]), [])
  assert.deepEqual(selectBrandIdentities([row(B.provider, { status: "REVIEW_REQUIRED" }), api]), [])
  for (const negative of [row("api-football", { status: "BLOCKED" }),
    ...[{ operationalDecision: "REVOKED" }, { rightsStatus: "BLOCKED" }, { displayPolicy: "DISPLAY_BLOCKED" }]
      .map(change => row("api-football", { assets: [{ ...api.assets[0], status: "STALE", ...change }] }))]) {
    for (const rows of [[official, negative], [negative, official]]) assert.deepEqual(selectBrandIdentities(rows), [])
  }
})

test("40 existing API-Football league selections and unknown-provider coexistence remain deterministic", () => {
  for (const identity of BRAND_ASSET_PILOT_ALLOWLIST.filter(i => i.entityType === "LEAGUE")) {
    const api = { ...row("api-football"), ...identity }
    const other = { ...api, provider: "unapproved-provider" }
    assert.deepEqual(selectBrandIdentities([other, api]), [api])
    assert.deepEqual(selectBrandIdentities([api, other]), [api])
  }
})

test("delivery fetches exactly once with redirects disabled and validates archived PNG bytes", async () => {
  let calls = 0
  const result = await fetchBrackBytes(async (url, options) => {
    calls++
    assert.equal(url, B.sourceUrl); assert.equal(options?.redirect, "manual"); assert.equal(options?.cache, "no-store")
    assert.ok(options?.signal)
    return response(bytes, { "content-length": String(B.bytes) })
  })
  assert.equal(calls, 1)
  assert.deepEqual(Buffer.from(result), bytes)
})

test("redirects, HTTP errors, MIME, length, dimensions and changed hash fail without retry", async () => {
  const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1
  const wrongDimensions = Buffer.from(bytes); wrongDimensions.writeUInt32BE(1, 16)
  for (const factory of [
    () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }),
    () => new Response(null, { status: 429 }), () => new Response(null, { status: 500 }),
    () => response(bytes, { "content-type": "image/svg+xml" }),
    () => response(bytes, { "content-length": "999999999" }),
    () => response(bytes.subarray(0, 15)), () => response(Buffer.concat([bytes, Buffer.from([0])])),
    () => response(changed), () => response(wrongDimensions),
  ]) {
    let calls = 0
    await assert.rejects(fetchBrackBytes(async () => { calls++; return factory() }))
    assert.equal(calls, 1)
  }
  let calls = 0
  await assert.rejects(fetchBrackBytes(async () => { calls++; throw Error("network") }))
  assert.equal(calls, 1)
})

test("route gates every response, rechecks after fetch, sends no-store and never writes or stores bytes", async () => {
  let reads = 0, calls = 0
  const fetcher: typeof fetch = async () => { calls++; return response() }
  const result = await serveBrackAsset(request(), async () => { reads++; return reference() }, fetcher)
  assert.equal(result.status, 200); assert.equal(reads, 2); assert.equal(calls, 1)
  assert.match(result.headers.get("cache-control")!, /no-store/)
  assert.equal(result.headers.get("content-type"), "image/png")
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes)
  reads = 0
  const revoked = await serveBrackAsset(request(), async () => ++reads === 1 ? reference() :
    reference({ operationalDecision: "REVOKED" }), fetcher)
  assert.equal(revoked.status, 404); assert.equal((await revoked.arrayBuffer()).byteLength, 0)
  const noFetch: typeof fetch = async () => { throw Error("must not fetch") }
  assert.equal((await serveBrackAsset(request(), async () => undefined, noFetch)).status, 404)
  assert.equal((await serveBrackAsset(new Request(`https://x${B.deliveryPath}?url=https://evil`),
    async () => reference(), noFetch)).status, 404)
  assert.equal((await serveBrackAsset(request(), async () => reference(), async () => { throw Error("timeout") })).status, 502)
})

test("actual reader retrieves blocked identities and revoked history and does not select an alternate source", async () => {
  const r = reference()
  const asset = { ...r, assetType: "LOGO", fetchedAt: new Date(at), operationalAuthorizedAt: new Date(at), riskAcceptedAt: new Date(at) }
  let rows = [{ ...row(), assets: [asset] }]
  const reader = loadCatalogModule<typeof import("../../../services/brandAssetReadService")>("services/brandAssetReadService.ts", {
    "server-only": {}, "../lib/brackBrandSource": brackPolicy, "../lib/assetPipeline": pipeline,
    "../lib/prisma": { prisma: { brandAssetIdentity: { findMany: async (query: {
      where: { AND: { OR: unknown[] }[] }; select: { assets: { where?: unknown } };
    }) => {
      assert.ok(JSON.stringify(query.where.AND).includes(B.entityId))
      assert.equal(query.select.assets.where, undefined)
      return rows
    } } } },
  })
  assert.equal((await reader.getBrandAssetsForEntities({ leagueIds: [B.entityId] })).leagues.get(B.entityId)?.sourceUrl, B.sourceUrl)
  rows = [rows[0], { ...row("api-football", { status: "BLOCKED" }), assets: [] }]
  assert.equal((await reader.getBrandAssetsForEntities({ leagueIds: [B.entityId] })).leagues.size, 0)
})

test("league UI uses only the checked internal delivery route and revocation retains the neutral fallback", () => {
  const { default: LeagueLogo } = loadCatalogModule<typeof import("../../../app/components/LeagueLogo")>(
    "app/components/LeagueLogo.tsx", { react: React })
  for (const size of ["small", "medium", "large"] as const) {
    const html = renderToStaticMarkup(React.createElement(LeagueLogo, {
      locale: "pt", name: "Brack Super League", size, asset: reference(),
    }))
    assert.match(html, /src="\/api\/brand-assets\/brack"/)
    assert.doesNotMatch(html, /cloudfront|_next\/image/)
  }
  const revoked = renderToStaticMarkup(React.createElement(LeagueLogo, {
    locale: "en", name: "Brack", asset: reference({ operationalDecision: "REVOKED" }),
  }))
  assert.doesNotMatch(revoked, /<img/)
  assert.match(revoked, /brandAssetFallback-league/)
  for (const policy of [
    { publicationEnabled: true, blockedProviders: new Set([B.provider]), blockedEntityIds: new Set<string>() },
    { publicationEnabled: true, blockedProviders: new Set<string>(), blockedEntityIds: new Set([B.entityId]) },
  ]) assert.equal(resolveAssetSource(reference(), "league", policy), null)
})

test("stream limit cancels at the first excess chunk, with no whole-body buffering", async () => {
  let pulls = 0, cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++
      controller.enqueue(pulls === 1 ? bytes : new Uint8Array(1))
    },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  await assert.rejects(fetchBrackBytes(async () => new Response(stream, {
    headers: { "content-type": "image/png" },
  })), /BRACK_SIZE_REJECTED/)
  assert.equal(pulls, 2)
  assert.equal(cancelled, true)
})

test("invalid declared size rejects before reading the body", async () => {
  let reads = 0, cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { reads++; controller.enqueue(bytes) },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  await assert.rejects(fetchBrackBytes(async () => new Response(stream, {
    headers: { "content-type": "image/png", "content-length": String(B.bytes + 1) },
  })), /BRACK_DELIVERY_REJECTED/)
  assert.equal(reads, 0); assert.equal(cancelled, true)
})

test("8-second deadline covers headers and body, including a chunk arriving after abort", async context => {
  for (const phase of ["headers", "body"]) {
    const abort = new AbortController()
    const mock = context.mock.method(AbortSignal, "timeout", (ms: number) => {
      assert.equal(ms, 8000)
      return abort.signal
    })
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        abort.abort(new Error("TEST_DEADLINE"))
        controller.enqueue(bytes)
      },
      cancel() { cancelled = true },
    }, { highWaterMark: 0 })
    await assert.rejects(fetchBrackBytes(async (_url, options) => {
      assert.equal(options?.signal, abort.signal)
      if (phase === "headers") abort.abort()
      return new Response(stream, { headers: { "content-type": "image/png" } })
    }))
    assert.equal(cancelled, true)
    mock.mock.restore()
  }
})

test("concurrency gate stops a fifth request before DB/network and releases on failure", async () => {
  const gate = createBrackRequestGate(() => 0)
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  let reads = 0, fetches = 0
  const read = async () => { reads++; await pending; return undefined }
  const fetcher: typeof fetch = async () => { fetches++; throw Error("must not fetch") }
  const four = Array.from({ length: 4 }, () => serveBrackAsset(request(), read, fetcher, gate))
  const denied = await serveBrackAsset(request(), read, fetcher, gate)
  assert.equal(denied.status, 429); assert.match(denied.headers.get("cache-control")!, /no-store/)
  assert.equal(reads, 4); assert.equal(fetches, 0)
  finish()
  assert.ok((await Promise.all(four)).every(result => result.status === 404))
  assert.equal((await serveBrackAsset(request(), async () => { throw Error("DB failure") }, fetcher, gate)).status, 502)
  assert.equal((await serveBrackAsset(request(), async () => undefined, fetcher, gate)).status, 404)
})

test("sliding-minute gate limits sequential requests without caching image bytes or authorization", async () => {
  let now = 0, reads = 0
  const gate = createBrackRequestGate(() => now)
  const read = async () => { reads++; return undefined }
  const noFetch: typeof fetch = async () => { throw Error("must not fetch") }
  for (let i = 0; i < 60; i++) assert.equal((await serveBrackAsset(request(), read, noFetch, gate)).status, 404)
  assert.equal((await serveBrackAsset(request(), read, noFetch, gate)).status, 429)
  assert.equal(reads, 60)
  now = 59_999
  assert.equal((await serveBrackAsset(request(), read, noFetch, gate)).status, 429)
  now = 60_000
  assert.equal((await serveBrackAsset(request(), read, noFetch, gate)).status, 404)
  assert.equal(reads, 61)
  let fetches = 0
  const fetcher: typeof fetch = async () => { fetches++; return response() }
  for (let i = 0; i < 2; i++) assert.equal((await serveBrackAsset(request(), async () => reference(), fetcher, gate)).status, 200)
  assert.equal(fetches, 2) // Completed downloads are never reused.
})
