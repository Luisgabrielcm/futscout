import assert from "node:assert/strict"
import test from "node:test"

import { mapEARatingsPlayer } from "../../../mappers/mapEARatingsPlayer"
import {
  EARatingsProvider,
  EA_RATINGS_VERSION_CONTEXT,
} from "../../../providers/eaRatingsProvider"

test("EA batch records FC27 as official-page context, never as player payload metadata", async () => {
  const originalFetch = globalThis.fetch
  const before = new Date()

  globalThis.fetch = async () => new Response(JSON.stringify({
    items: [{ id: 231866, commonName: "Rodri", team: { id: 10, label: "Manchester City" } }],
    totalItems: 1,
  }), {
    status: 200,
    headers: {
      date: "Thu, 17 Sep 2026 16:46:16 GMT",
      etag: "fixture-etag",
      "content-type": "application/json",
    },
  })

  try {
    const batch = await new EARatingsProvider().getPlayersBatch({ limit: 1, offset: 0 })
    assert.equal(batch.provenance.eaGameVersion, "FC27")
    assert.equal(batch.provenance.gameVersionEvidence, "OFFICIAL_PAGE_CONTEXT")
    assert.equal(batch.provenance.gameVersionEvidenceUrl, EA_RATINGS_VERSION_CONTEXT.evidenceUrl)
    assert.equal(batch.provenance.catalogVersion, null)
    assert.equal(batch.provenance.sourceUpdatedAt, null)
    assert.equal(batch.provenance.responseDate?.toISOString(), "2026-09-17T16:46:16.000Z")
    assert.equal(batch.provenance.etag, "fixture-etag")
    assert.equal(batch.provenance.lastModified, null)
    assert.equal(batch.provenance.requestOffset, 0)
    assert.equal(batch.provenance.requestLimit, 1)
    assert.equal(batch.provenance.totalItems, 1)
    assert.ok(batch.provenance.observedAt >= before)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("EA mapper does not invent sourceUpdatedAt", () => {
  const mapped = mapEARatingsPlayer({
    id: 231866,
    commonName: "Rodri",
    position: { label: "CDM" },
  })
  assert.equal(mapped.sourceUpdatedAt, undefined)
})
