import assert from "node:assert/strict"
import test from "node:test"
import { createHmac, scryptSync } from "node:crypto"
import { parseManualPayload } from "../../../lib/adminEconomic"
import { sameOrigin, verifyPassword, verifyTotp } from "../../../lib/adminAuth"
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
test("password verifier, TOTP and origin check", () => {
  const salt = "a".repeat(32), password = "long owner password"
  const encoded = salt + ":" + scryptSync(password, Buffer.from(salt, "hex"), 32).toString("hex")
  assert.equal(verifyPassword(password, encoded), true)
  assert.equal(verifyPassword("wrong", encoded), false)
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
  const step = 123456
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac("sha1", Buffer.from("12345678901234567890")).update(counter).digest()
  const code = String((mac.readUInt32BE(mac[19] & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0")
  assert.equal(verifyTotp(code, secret, step * 30_000), step)
  assert.equal(verifyTotp("00000", secret, step * 30_000), null)
  assert.equal(sameOrigin(new Request("https://futscout.example/admin/api/login", { headers: { origin: "https://futscout.example" } })), true)
  assert.equal(sameOrigin(new Request("https://futscout.example/admin/api/login", { headers: { origin: "https://attacker.example" } })), false)
})

test("admin API never reports success without public read-back", async () => {
  let invalidations = 0
  const load = (visible: boolean) => loadCatalogModule<typeof import("../../../app/admin/api/players/[id]/route")>(
    "app/admin/api/players/[id]/route.ts", {
      "next/cache": { revalidatePath: () => { invalidations++ } },
      "../../../../../services/adminAuth.server": { ownerSession: async () => ({ owner: "owner" }) },
      "../../../../../services/adminEconomic.server": {
        readManualEconomics: async () => visible ? new Map([["player", { revisions: { SALARY: 1 } }]]) : new Map(),
        saveManualEconomic: async () => ({ revision: 1, replay: false }),
      },
    }, { Response })
  const request = () => new Request("https://futscout.test/admin/api/players/player", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ eaId: "1", section: "SALARY", payload: {}, expectedRevision: 0, requestId: "r" }),
  })
  assert.equal((await load(false).POST(request(), { params: Promise.resolve({ id: "player" }) })).status, 503)
  assert.equal(invalidations, 0)
  assert.equal((await load(true).POST(request(), { params: Promise.resolve({ id: "player" }) })).status, 200)
  assert.equal(invalidations, 2)
})
