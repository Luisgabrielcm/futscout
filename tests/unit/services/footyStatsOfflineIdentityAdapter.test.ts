import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { assessFootyStatsOfflineIdentity as assess, type FootyIdentityInput } from "../../../services/footyStatsOfflineIdentityAdapter"

function fixture(): FootyIdentityInput {
  const person = { name: "Synthetic Player", birth: "2000-01-02", nationality: "Spain", position: "MID" }
  const contents = JSON.stringify({ records: [{ ...person, eaId: "ea-1", apiFootballId: 42 },
    { ...person, name: "Other Person", eaId: "ea-2", apiFootballId: 43 }],
    clubs: [{ footyClubId: 9, eaClubId: "club-1", season: "2026" }] })
  return {
    source: { ...person, footyStatsId: 7, clubId: 9, season: "2026" },
    catalog: [{ ...person, playerId: "local-1", eaId: "ea-1", apiFootballId: 42, clubId: "club-1", season: "2026" }],
    sources: [], owners: [], documents: [{ id: "synthetic", contents }],
    evidence: [{ eaId: "ea-1", origin: "API_FOOTBALL", reference: { documentId: "synthetic",
      sha256: createHash("sha256").update(contents).digest("hex"), pointer: "/records/0" } }],
    corrections: [], clubMaps: [{ footyClubId: 9, eaClubId: "club-1", season: "2026", reference: {
      documentId: "synthetic", sha256: createHash("sha256").update(contents).digest("hex"), pointer: "/clubs/0" } }],
  }
}

test("independent identity is HIGH without granting salary eligibility or mutating inputs", () => {
  const i = fixture(), before = structuredClone(i), r = assess(i)[0]
  assert.equal(r.classification, "HIGH")
  assert.equal(r.sportingContext.state, "CORROBORATED")
  assert.equal(r.salaryEligibility.trainingAllowed, false)
  assert.equal(r.writable, false)
  assert.deepEqual(i, before)
})
test("name, birth and collective club agreement cannot produce HIGH", () => {
  for (const origin of ["COHORT", "FOOTYSTATS"] as const) {
    const i = fixture(); i.evidence = [{ ...i.evidence[0], origin }]
    assert.equal(assess(i)[0].classification, "MEDIUM")
  }
  const i = fixture(); i.evidence = []
  assert.equal(assess(i)[0].classification, "MEDIUM")
})
test("homonyms with same or unknown birth require conflict review", () => {
  for (const birth of ["2000-01-02", null]) {
    const i = fixture(); i.catalog = [...i.catalog, { ...i.catalog[0], eaId: "ea-2", playerId: "local-2", apiFootballId: null, birth }]
    assert(assess(i).every(r => r.classification === "CONFLICT"))
  }
})
test("conflicting owners and shared API IDs fail closed", () => {
  const i = fixture(); i.owners = [{ footyStatsId: 7, eaId: "another" }]
  assert.equal(assess(i)[0].classification, "CONFLICT")
  i.owners = [{ footyStatsId: 8, eaId: "ea-1" }]
  assert.equal(assess(i)[0].classification, "CONFLICT")
  const j = fixture(); j.catalog = [...j.catalog, { ...j.catalog[0], eaId: "other", playerId: "other", name: "Different Name" }]
  assert(assess(j)[0].reasons.includes("ID_OWNERSHIP_CONFLICT"))
})
test("document pointing to another person conflicts even with valid hash", () => {
  const i = fixture(); i.evidence[0].reference.pointer = "/records/1"
  assert(assess(i)[0].reasons.includes("DOCUMENT_PERSON_CONFLICT"))
})
test("wrong hash, missing document and invalid pointer are rejected", () => {
  for (const change of [{ sha256: "a".repeat(64) }, { documentId: "absent" }, { pointer: "/records/99" }, { pointer: "/records/~3" }]) {
    const i = fixture(); Object.assign(i.evidence[0].reference, change)
    assert.equal(assess(i)[0].classification, "CONFLICT")
  }
})
test("external correction preserves originals and needs independent evidence", () => {
  const i = fixture(), correct = { ...i.evidence[0].reference }
  i.evidence[0].reference.pointer = "/records/1"
  i.corrections = [{ original: { ...i.evidence[0].reference }, replacement: correct, reason: "Wrong array index", approvedBy: "synthetic-reviewer" }]
  const before = structuredClone(i)
  assert.equal(assess(i)[0].classification, "HIGH")
  assert.equal(assess(i)[0].rectifications.length, 1)
  assert.deepEqual(i, before)
  i.evidence[0].origin = "COHORT"
  assert.equal(assess(i)[0].classification, "MEDIUM")
  i.corrections = [...i.corrections, i.corrections[0]]
  assert.equal(assess(i)[0].classification, "CONFLICT")
})
test("club and season conflicts do not invent transfers or invalidate proven personal identity", () => {
  const i = fixture(); i.catalog[0].clubId = "other"
  assert.equal(assess(i)[0].sportingContext.state, "INCOMPATIBLE")
  assert.equal(assess(i)[0].classification, "HIGH")
  i.catalog[0].season = "2025"
  assert.equal(assess(i)[0].sportingContext.state, "INCOMPATIBLE")
  assert.equal(assess(i)[0].sportingContext.transferProven, false)
})
test("missing club evidence remains unknown and missing birth LOW", () => {
  const i = fixture(); i.clubMaps = []
  assert.equal(assess(i)[0].sportingContext.state, "UNKNOWN")
  i.source.birth = null; i.evidence = []
  assert.equal(assess(i)[0].classification, "LOW")
})
test("club map must agree with its actual document", () => {
  const i = fixture(); i.clubMaps[0].reference.pointer = "/records/0"
  assert(assess(i)[0].reasons.includes("CLUB_MAP_DOCUMENT_CONFLICT"))
  assert.equal(assess(i)[0].classification, "CONFLICT")
})
test("birth conflict, duplicate source ID and duplicate catalog row are rejected", () => {
  const i = fixture(); i.source.birth = "2001-01-02"
  assert.equal(assess(i)[0].classification, "CONFLICT")
  const j = fixture(); j.sources = [{ ...j.source, name: "Another" }]
  assert.equal(assess(j)[0].classification, "CONFLICT")
  const k = fixture(); k.catalog = [...k.catalog, k.catalog[0]]
  assert(assess(k).every(r => r.classification === "CONFLICT"))
})
test("API evidence requires an explicitly matching API identity", () => {
  const i = fixture(); i.catalog[0].apiFootballId = null
  assert.equal(assess(i)[0].classification, "MEDIUM")
})
test("deterministic ordering, repeated runs and unmatched source", () => {
  const i = fixture(); i.catalog = [...i.catalog, { ...i.catalog[0], playerId: "local-2", eaId: "ea-2", apiFootballId: 43 }]
  assert.deepEqual(assess(i), assess({ ...i, catalog: [...i.catalog].reverse() }))
  assert.deepEqual(assess(i), assess(i))
  i.source.name = "Unmatched"
  assert.deepEqual(assess(i), [])
})

function spacedFixture() {
  const i = fixture()
  i.source.name = "Synthetic Play er"
  i.evidence = []
  return i
}

test("secondary spacing requires exact valid birth and remains MEDIUM without corroboration", () => {
  const i = spacedFixture(), before = structuredClone(i), r = assess(i)[0]
  assert.equal(r.classification, "MEDIUM")
  assert(r.reasons.includes("SECONDARY_SPACING_MATCH"))
  assert.equal(r.personalIdentity.independentEvidence, false)
  assert.equal(r.salaryEligibility.trainingAllowed, false)
  assert.deepEqual(i, before)
  for (const birth of [null, "1999-01-02", "2000-02-30"]) {
    assert.deepEqual(assess({ ...i, source: { ...i.source, birth } }), [])
    assert.deepEqual(assess({ ...i, catalog: [{ ...i.catalog[0], birth }] }), [])
  }
})

test("compact-name collisions on either side block secondary matches regardless of DOB", () => {
  for (const birth of ["2000-01-02", "1999-01-02", null]) {
    const i = spacedFixture()
    const rival = { ...i.catalog[0], playerId: "rival", eaId: "rival", apiFootballId: null, name: "SyntheticPlayer", birth }
    assert.deepEqual(assess({ ...i, catalog: [...i.catalog, rival] }), [])
    assert.deepEqual(assess({ ...i, sources: [{ ...i.source, name: "SyntheticPlayer", footyStatsId: 8, birth }] }), [])
  }
})

test("secondary match preserves ownership checks and document conflicts", () => {
  const i = spacedFixture()
  i.owners = [{ footyStatsId: 7, eaId: "other" }]
  assert.equal(assess(i)[0].classification, "CONFLICT")
  i.owners = []
  i.evidence = fixture().evidence
  i.evidence[0].reference.pointer = "/records/1"
  assert(assess(i)[0].reasons.includes("DOCUMENT_PERSON_CONFLICT"))
})

test("secondary match still needs independently validated evidence for HIGH", () => {
  const i = spacedFixture()
  i.evidence = fixture().evidence
  assert.equal(assess(i)[0].classification, "HIGH")
  i.evidence[0].origin = "COHORT"
  assert.equal(assess(i)[0].classification, "MEDIUM")
})

test("secondary matching is deterministic and primary homonym protection is preserved", () => {
  const i = spacedFixture()
  i.catalog = [...i.catalog, { ...i.catalog[0], playerId: "other", eaId: "other", name: "Unrelated", apiFootballId: null }]
  assert.deepEqual(assess(i), assess({ ...i, catalog: [...i.catalog].reverse() }))
  assert.deepEqual(assess(i), assess(i))
  const primary = fixture()
  primary.catalog = [...primary.catalog, { ...primary.catalog[0], playerId: "rival", eaId: "rival", apiFootballId: null }]
  assert(assess(primary).every(r => r.classification === "CONFLICT"))
})

test("rectification cannot hide a wrong destination or a changed source document", () => {
  const i = fixture(), correct = { ...i.evidence[0].reference }
  i.evidence[0].reference.pointer = "/records/1"
  i.corrections = [{ original: { ...i.evidence[0].reference }, replacement: { ...correct, pointer: "/records/1" },
    reason: "Proposed pointer", approvedBy: "synthetic-reviewer" }]
  assert(assess(i)[0].reasons.includes("DOCUMENT_PERSON_CONFLICT"))
  i.corrections[0].replacement = correct
  i.documents[0].contents += " "
  assert(assess(i)[0].reasons.includes("INVALID_RECTIFICATION"))
})
