import assert from "node:assert/strict"
import test from "node:test"
import { scryptSync } from "node:crypto"
import { parseManualPayload } from "../../../lib/adminEconomic"
import { normalizeOwnerLogin, passwordHashFormatValid, sameOrigin, verifyPassword } from "../../../lib/adminAuth"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

test("manual salary, contract and clause reject incompatible inputs", () => {
  assert.deepEqual(parseManualPayload("SALARY", { weeklyEur: "1234.56", taxType: "GROSS", composition: "BASE" }),
    { weeklyEur: "1234.56", taxType: "GROSS", composition: "BASE" })
  assert.throws(() => parseManualPayload("SALARY", { weeklyEur: "0", taxType: "GROSS", composition: "BASE" }))
  assert.throws(() => parseManualPayload("SALARY", { weeklyEur: "100", taxType: "GROSS", composition: "BONUS" }))
  assert.throws(() => parseManualPayload("CONTRACT", { start: "2027-01-01", until: "2026-01-01", renewed: null }))
  assert.throws(() => parseManualPayload("CLAUSE", { status: "NO", amount: "1", currency: "EUR", conditions: null, validUntil: null }))
  assert.deepEqual(parseManualPayload("CLAUSE", { status: "UNKNOWN", amount: null, currency: null, conditions: null, validUntil: null }),
    { status: "UNKNOWN", amount: null, currency: null, conditions: null, validUntil: null })
  assert.deepEqual(parseManualPayload("CLAUSE", { status: "YES", amount: null, currency: null, conditions: null, validUntil: null }),
    { status: "YES", amount: null, currency: null, conditions: null, validUntil: null })
  assert.throws(() => parseManualPayload("CLAUSE", { status: "YES", amount: "1", currency: null, conditions: null, validUntil: null }))
})
test("strong password verifier and origin check", () => {
  const salt = "a".repeat(32), password = "long owner password"
  const encoded = salt + ":" + scryptSync(password, Buffer.from(salt, "hex"), 32).toString("hex")
  assert.equal(passwordHashFormatValid(encoded), true)
  assert.equal(passwordHashFormatValid(` ${encoded}\r\n`), true)
  assert.equal(passwordHashFormatValid(encoded.slice(0, -1)), false)
  assert.equal(verifyPassword(password, encoded), true)
  assert.equal(verifyPassword(password, ` ${encoded}\r\n`), true)
  assert.equal(verifyPassword("wrong", encoded), false)
  assert.equal(normalizeOwnerLogin(" Owner@Test.Invalid \r\n"), "owner@test.invalid")
  const shortPassword = "short-pass-1234"
  const shortEncoded = salt + ":" + scryptSync(shortPassword, Buffer.from(salt, "hex"), 32).toString("hex")
  assert.equal(verifyPassword(shortPassword, shortEncoded), false)
  assert.equal(sameOrigin(new Request("https://futscout.example/admin/api/login", { headers: { origin: "https://futscout.example" } })), true)
  assert.equal(sameOrigin(new Request("https://futscout.example/admin/api/login", { headers: { origin: "https://attacker.example" } })), false)
})

test("admin API never reports success without public read-back", async () => {
  let invalidations = 0, saves = 0
  const load = (visible: boolean, authorized = true) => loadCatalogModule<typeof import("../../../app/admin/api/players/[id]/route")>(
    "app/admin/api/players/[id]/route.ts", {
      "next/cache": { revalidatePath: () => { invalidations++ } },
      "../../../../../services/adminAuth.server": { ownerSession: async () => authorized ? { owner: "owner" } : null },
      "../../../../../services/adminEconomic.server": {
        readManualEconomics: async () => visible ? new Map([["player", { revisions: { SALARY: 1 } }]]) : new Map(),
        saveManualEconomic: async () => { saves++; return { revision: 1, replay: false } },
      },
    }, { Response })
  const request = () => new Request("https://futscout.test/admin/api/players/player", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ eaId: "1", section: "SALARY", payload: {}, expectedRevision: 0, requestId: "r" }),
  })
  assert.equal((await load(true, false).POST(request(), { params: Promise.resolve({ id: "player" }) })).status, 403)
  assert.equal(saves, 0)
  assert.equal((await load(true, false).GET(request(), { params: Promise.resolve({ id: "player" }) })).status, 401)
  assert.equal((await load(false).POST(request(), { params: Promise.resolve({ id: "player" }) })).status, 503)
  assert.equal(invalidations, 0)
  assert.equal((await load(true).POST(request(), { params: Promise.resolve({ id: "player" }) })).status, 200)
  assert.equal(invalidations, 2)
})
