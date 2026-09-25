import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { inspectAleaguePng } from "../../../lib/aleaguePngDiagnostic"
import { fetchOfficialLeagueBytes } from "../../../services/brackBrandDelivery"
import { ALEAGUE_SOURCE as A } from "../../../lib/brackBrandSource"

const original = readFileSync("tests/fixtures/brand-assets/aleague.png")
const metadata = Buffer.alloc(110)
metadata.writeUInt32BE(98, 0); metadata.write("tEXt", 4); metadata.write("not-for-logs", 8)
// Synthetic CRC intentionally invalid: diagnostics are not image validation/authorization.
const changed = Buffer.concat([original.subarray(0, -12), metadata, original.subarray(-12)])
test("PNG diagnostics distinguish extra metadata without accepting or exposing it", () => {
  const baseline = inspectAleaguePng(original)
  assert.equal(baseline.sha256, A.contentHash)
  const result = inspectAleaguePng(changed)
  assert.equal(result.receivedBytes, 15498)
  assert.notEqual(result.sha256, A.contentHash)
  assert.equal(result.validStructure, true)
  assert.equal("originalChunkSetSha256" in result && result.originalChunkSetSha256, A.contentHash)
  assert.equal("width" in result && result.width, A.width); assert.equal("height" in result && result.height, A.height)
  assert.doesNotMatch(JSON.stringify(result), /not-for-logs/)
  assert.equal(inspectAleaguePng(Buffer.alloc(15499)).validStructure, false)
  assert.equal(inspectAleaguePng(changed.subarray(0, -2)).validStructure, false)
})
test("observed A-League variant is diagnosed once but still rejected; oversized stream is cancelled", async () => {
  const events: unknown[] = []
  let calls = 0
  const fetcher = async () => {
    calls++
    const response = new Response(changed, { headers: { "Content-Type": "image/png", "Content-Length": "15498" } })
    Object.defineProperty(response, "url", { value: A.sourceUrl })
    return response
  }
  await assert.rejects(fetchOfficialLeagueBytes(A, fetcher, event => events.push(event)), /BRACK_DELIVERY_REJECTED/)
  assert.equal(calls, 1)
  assert.ok(JSON.stringify(events).includes('"originalChunkSetSha256":"' + A.contentHash + '"'))
  let cancelled = false
  const oversized = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(15499)) },
    cancel() { cancelled = true } }), { headers: { "Content-Type": "image/png", "Content-Length": "15498" } })
  Object.defineProperty(oversized, "url", { value: A.sourceUrl })
  await assert.rejects(fetchOfficialLeagueBytes(A, async () => oversized), /BRACK_SIZE_REJECTED/)
  assert.equal(cancelled, true)
})
