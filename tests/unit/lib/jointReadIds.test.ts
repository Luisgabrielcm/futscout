import test from "node:test"
import assert from "node:assert/strict"
import { deflateRawSync } from "node:zlib"
import { decodeJointReadIds, encodeJointReadIds, jointReadIdLimit } from "../../../lib/jointReadIds"

test("compact ID transport preserves exact order and accepts the existing plain transport", () => {
  const ids = Array.from({ length: 5500 }, (_, i) => String(800001 + i))
  const encoded = encodeJointReadIds(ids)
  assert.deepEqual(decodeJointReadIds(encoded), ids); assert.deepEqual(decodeJointReadIds(ids.join(",")), ids)
  assert(Buffer.byteLength(encoded) < Buffer.byteLength(ids.join(",")) / 2)
  const boundary = Array.from({ length: jointReadIdLimit }, (_, i) => String(800001 + i))
  assert.deepEqual(decodeJointReadIds(encodeJointReadIds(boundary)), boundary)
  assert.throws(() => encodeJointReadIds([...boundary, "999999"]), /IDS_INVALID/)
})
test("invalid IDs, unsupported codecs, non-ASCII and oversized compressed output fail closed", () => {
  for (const value of ["", "1,1", "0", "01", "1, 2", "1\n", "deflate:v2:anything", "deflate:v1:bad!", "deflate:v1:AA==",
    "deflate:v1:" + deflateRawSync(Buffer.from("é")).toString("base64url"),
    "deflate:v1:" + deflateRawSync(Buffer.from("1".repeat(jointReadIdLimit * 13 + 1))).toString("base64url")])
    assert.equal(decodeJointReadIds(value), null)
  assert.throws(() => encodeJointReadIds(["1", "1"]), /IDS_INVALID/)
})

test("delta transport preserves unsorted IDs and rejects noncanonical numbers and overflow", () => {
  const ids = ["999999999999", "1", "543210", "22", "999999999998"]
  assert.deepEqual(decodeJointReadIds(encodeJointReadIds(ids)), ids)
  const packed = (text: string) => "deflate-delta:v1:" + deflateRawSync(Buffer.from(text)).toString("base64url")
  assert.deepEqual(decodeJointReadIds(packed("10,5,-14")), ["10", "15", "1"])
  for (const text of ["0", "1,0", "1,-1", "01", "1,-0", "999999999999,1", "1,1000000000000", "1,1.5", "1,+1"])
    assert.equal(decodeJointReadIds(packed(text)), null)
})


test("expanded cohorts preserve prior IDs and appended IDs across the previous transport limit", () => {
  const existing = Array.from({ length: 7789 }, (_, i) => String(800001 + i))
  const added = Array.from({ length: 571 }, (_, i) => String(900001 + i)).reverse()
  const ids = [...existing, ...added]
  assert(ids.length > 8192 && ids.length <= jointReadIdLimit)
  const decoded = decodeJointReadIds(encodeJointReadIds(ids))
  assert.deepEqual(decoded, ids)
  assert.deepEqual(decoded?.slice(0, existing.length), existing)
  assert.deepEqual(decoded?.slice(existing.length), added)
  assert.deepEqual(decodeJointReadIds(ids.join(",")), ids)
})
