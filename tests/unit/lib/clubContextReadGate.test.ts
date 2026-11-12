import assert from "node:assert/strict"
import test from "node:test"
import { canReadClubContexts, clubContextReadPilot, clubContextReadEaIds } from "../../../lib/clubContextReadGate"

const preview = { VERCEL_ENV: "preview", CLUB_CONTEXTS_READ_ENABLED: "1",
  CLUB_CONTEXTS_READ_EA_IDS: clubContextReadEaIds.join(","), CLUB_CONTEXTS_READ_PILOT_HASH: clubContextReadPilot.manifestHash }
test("reader scope is disabled by default; general flag alone never enables it", () => {
  assert.equal(canReadClubContexts("218191"), false)
  assert.equal(canReadClubContexts("218191", { CLUB_CONTEXTS_READ_ENABLED: "1" }), false)
})
test("Preview permits exactly four identities and rejects missing/expanded/duplicated or wrong-hash scopes", () => {
  for (const id of clubContextReadEaIds) assert.equal(canReadClubContexts(id, preview), true)
  assert.equal(canReadClubContexts("999999999", preview), false)
  assert.equal(canReadClubContexts(null, preview), false)
  for (const scope of ["", "*", "218191", preview.CLUB_CONTEXTS_READ_EA_IDS + ",999999999", "218191,218191,225964,83924"])
    assert.equal(canReadClubContexts("218191", { ...preview, CLUB_CONTEXTS_READ_EA_IDS: scope }), false)
  assert.equal(canReadClubContexts("218191", { ...preview, CLUB_CONTEXTS_READ_PILOT_HASH: "unapproved" }), false)
})
test("Production requires a separate explicit switch even with all Preview flags present", () => {
  const production = { ...preview, VERCEL_ENV: "production" }
  assert.equal(canReadClubContexts("218191", production), false)
  assert.equal(canReadClubContexts("218191", { ...production, CLUB_CONTEXTS_READ_PRODUCTION_ENABLED: "0" }), false)
  assert.equal(canReadClubContexts("218191", { ...production, CLUB_CONTEXTS_READ_PRODUCTION_ENABLED: "1" }), true)
  assert.equal(canReadClubContexts("999999999", { ...production, CLUB_CONTEXTS_READ_PRODUCTION_ENABLED: "1" }), false)
})
