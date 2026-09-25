import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { ALEAGUE_SOURCE as A } from "../../../lib/brackBrandSource"
import { serveAleagueAsset } from "../../../services/brackBrandDelivery"
import type { AssetReference } from "../../../lib/assetPipeline"

const at = "2026-09-25T00:00:00Z"
const asset: AssetReference = { ...A, storageUrl: null,
  identity: { entityType: "league", provider: A.provider, providerEntityId: A.providerEntityId, assetType: "LOGO" },
  version: 1, fetchedAt: at, rightsStatus: "REVIEW_REQUIRED", status: "ACTIVE", displayPolicy: "DISPLAY_ALLOWED",
  operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", operationalAuthorizedAt: at, operationalDecisionRef: "synthetic",
  operatorRiskAccepted: true, riskAcceptedAt: at, riskAcceptedBy: "test", riskReason: "test", sourceTermsUrl: A.evidenceUrl,
  revocable: true, publicationAllowedByServer: true }
const request = new Request("https://local.test" + A.deliveryPath)
const admit = () => () => {}
const bytes = readFileSync("tests/fixtures/brand-assets/aleague.png")
const response = () => new Response(bytes, { headers: { "Content-Type": "image/png", "Content-Length": String(bytes.length) } })

test("diagnostics distinguish phases without exposing error messages, URLs, credentials or response text", async context => {
  const messages: unknown[][] = []
  context.mock.method(console, "error", (...args: unknown[]) => { messages.push(args) })
  const secret = "postgres://user:secret-token@private.invalid/database"
  const readFailure = async () => { throw Object.assign(new Error(secret), { code: "P1001" }) }
  assert.equal((await serveAleagueAsset(request, readFailure, async () => response(), admit, true)).status, 502)
  assert.equal((messages.at(-1)?.[1] as Record<string, unknown>).phase, "read-before")
  assert.equal((messages.at(-1)?.[1] as Record<string, unknown>).errorCode, "DATABASE_CONNECTION_ERROR")
  assert.equal((await serveAleagueAsset(request, async () => asset, async () => { throw new TypeError(secret) }, admit, true)).status, 502)
  assert.equal((messages.at(-1)?.[1] as Record<string, unknown>).phase, "fetch-headers")
  assert.equal((messages.at(-1)?.[1] as Record<string, unknown>).errorCode, "TYPE_OR_TRANSPORT_ERROR")
  assert.equal((await serveAleagueAsset(request, async () => asset, async () => {
    throw new TypeError(secret, { cause: Object.assign(new Error(secret), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }) })
  }, admit, true)).status, 502)
  assert.equal((messages.at(-1)?.[1] as Record<string, unknown>).errorCode, "TRANSPORT_UNABLE_TO_VERIFY_LEAF_SIGNATURE")
  assert.equal((await serveAleagueAsset(request, async () => asset, async () => new Response(secret,
    { status: 403, headers: { "Content-Type": "text/html; secret=" + secret, "Content-Encoding": "secret-token" } }), admit, true)).status, 502)
  const rejected = messages.at(-1)?.[1] as Record<string, unknown>
  assert.equal(rejected.httpStatus, 403); assert.equal(rejected.mime, "text/html"); assert.equal(rejected.encoding, "other")
  assert.equal(rejected.errorCode, "BRACK_DELIVERY_REJECTED")
  let reads = 0
  assert.equal((await serveAleagueAsset(request, async () => ++reads === 1 ? asset : readFailure(), async () => response(), admit, true)).status, 502)
  const after = messages.at(-1)?.[1] as Record<string, unknown>
  assert.equal(after.phase, "read-after"); assert.equal(after.receivedBytes, A.bytes); assert.equal(after.httpStatus, 200)
  assert.ok(Number.isInteger(after.elapsedMs))
  assert.doesNotMatch(JSON.stringify(messages), /secret-token|postgres:|private\.invalid|sourceUrl|stack|\"body\"/)
})

test("diagnostic validation records byte count while keeping changed bytes blocked", async context => {
  const messages: unknown[][] = []
  context.mock.method(console, "error", (...args: unknown[]) => { messages.push(args) })
  const changed = Buffer.from(bytes); changed[100] ^= 1
  const result = await serveAleagueAsset(request, async () => asset,
    async () => new Response(changed, { headers: { "Content-Type": "image/png" } }), admit, true)
  assert.equal(result.status, 502)
  const diagnostic = messages[0][1] as Record<string, unknown>
  assert.equal(diagnostic.phase, "validate"); assert.equal(diagnostic.errorCode, "BRACK_BYTES_REJECTED")
  assert.equal(diagnostic.receivedBytes, A.bytes)
  const count = messages.length
  assert.equal((await serveAleagueAsset(request, async () => asset, async () => response(), admit, false)).status, 404)
  assert.equal((await serveAleagueAsset(request, async () => asset, async () => response(), admit, true)).status, 200)
  assert.equal(messages.length, count)
})
