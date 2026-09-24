import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtempSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname, resolve } from "node:path"
import { approvedCandidate, operationSource, publishReceipt, candidateMatches } from "../../../scripts/officialLeagueOperation"

test("operation refuses unapproved or scope-mismatched decisions before any database access", () => {
  for (const key of ["brack", "isl"]) {
    const source = operationSource(key), at = new Date().toISOString()
    const approval = { ...source, approved: false, databaseId: "rknsog8tmbl5u4xqbogxfux5", decisionRef: "synthetic",
      approvedAt: at, approvedBy: "test", riskReason: "test" }
    assert.throws(() => approvedCandidate(key, approval, at), /OWNER_APPROVAL_REQUIRED/)
    const valid = { ...approval, approved: true }
    const candidate = approvedCandidate(key, valid, at)
    assert.equal(candidate.storageUrl, null); assert.equal(candidate.rightsStatus, "REVIEW_REQUIRED")
    assert.equal(candidate.revocable, true)
    const identity = { ...source, entityType: "LEAGUE", status: "VERIFIED", version: 1 }
    const asset = { ...candidate, fetchedAt: new Date(candidate.fetchedAt), status: "ACTIVE", version: 1 }
    assert.equal(candidateMatches(candidate, identity, asset), true)
    for (const change of [{ version: 2 }, { status: "STALE" }, { riskAcceptedBy: "another" }, { revocable: false },
      { contentHash: "changed" }, { storageUrl: "https://copy.test" }, { operationalDecision: "REVOKED" }])
      assert.equal(candidateMatches(candidate, identity, { ...asset, ...change }), false)
    assert.equal(candidateMatches(candidate, { ...identity, entityId: "another" }, asset), false)
    for (const change of [{ databaseId: "staging" }, { contentHash: "changed" }, { provider: "api-football" },
      { sourceUrl: source.sourceUrl + "#x" }, { approvedBy: null }, { approvedAt: null }]) {
      assert.throws(() => approvedCandidate(key, { ...valid, ...change }, at))
    }
  }
  assert.throws(() => operationSource("roshn"))
})

test("receipt publication preserves pending evidence on write failure and refuses overwrites", () => {
  const directory = mkdtempSync(join(tmpdir(), "futscout-official-receipt-"))
  try {
    const pending = join(directory, "pending.json"), final = join(directory, "final.json")
    publishReceipt(pending, { status: "PENDING" })
    assert.throws(() => publishReceipt(join(directory, "absent", "final.json"), {}))
    assert.equal(JSON.parse(readFileSync(pending, "utf8")).status, "PENDING")
    // Occupying the temporary destination rejects publication without touching the marker.
    mkdirSync(final + ".tmp")
    assert.throws(() => publishReceipt(final, {}))
    assert.equal(existsSync(final), false); assert.equal(existsSync(pending), true)
    publishReceipt(join(directory, "complete.json"), { status: "COMPLETE" })
    assert.equal(existsSync(pending), true)
    assert.throws(() => publishReceipt(pending, {}), /RECEIPT_EXISTS/)
  } finally { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); rmSync(directory, { recursive: true }) }
})
