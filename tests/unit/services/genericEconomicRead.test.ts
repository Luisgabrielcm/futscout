import assert from "node:assert/strict"
import test from "node:test"
import * as publication from "../../../lib/genericEconomicPublication"
import { withPrismaReadOnly } from "../../../lib/prismaReadOnly"
import { syntheticGenericEconomicRelease, syntheticGenericEconomicEnvironment } from "../../fixtures/genericEconomicSynthetic"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { readFileSync } from "node:fs"

const release = syntheticGenericEconomicRelease()
const pilot = release.artifact.rows[0]
const env = syntheticGenericEconomicEnvironment(release)

function fixture({ conflict = false, failRead = false, failRollback = false, readOnly = "on", missing = false } = {}) {
  const calls: { kind: string; sql?: string; args?: unknown[] }[] = []
  const state = { record: { id: pilot.playerId, externalId: pilot.eaId, eaImportVisibility: "PUBLIC", marketValue: null, apiFootballId: null },
    club: null, hasExistingEconomics: conflict, hasClubContexts: false, readOnly: "on" }
  // The positive unit fixture pins synthetic rows, not a Production backup or credentials.
  const selected = { ...pilot, identityClassification: "UNKNOWN", status: "ESTIMATED", confidence: "LOW",
    expectedPlayerHash: publication.genericEconomicHash(state.record), expectedClubHash: publication.genericEconomicHash(state.club) }
  const fakePrisma = { $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    calls.push({ kind: "BEGIN" })
    try { return await callback({
      $executeRawUnsafe: async (sql: string) => { calls.push({ kind: "EXEC", sql }); assert.equal(sql, "SET TRANSACTION READ ONLY"); },
      $queryRawUnsafe: async (sql: string) => { calls.push({ kind: "SHOW", sql }); assert.equal(sql, "SHOW transaction_read_only"); return [{ transaction_read_only: readOnly }]; },
      $queryRaw: async (strings: TemplateStringsArray, ...args: unknown[]) => {
        const sql = strings.join("?"); calls.push({ kind: "SELECT", sql, args });
        assert.match(sql, /^\s*SELECT /); assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\b/i)
        assert.deepEqual(args, [pilot.playerId, pilot.eaId]); if (failRead) throw Error("FAKE_READ_FAILURE")
        return missing ? [] : [state]
      },
    }) } catch (e) { calls.push({ kind: "ROLLBACK" }); if (failRollback) throw Error("FAKE_ROLLBACK_FAILURE"); throw e }
  } }
  const service = loadCatalogModule<typeof import("../../../services/genericEconomicRead.server")>("services/genericEconomicRead.server.ts", {
    "server-only": {}, "../lib/genericEconomicRelease.server": { readGenericEconomicRelease: () => release },
    "../lib/prismaReadOnly": { withPrismaReadOnly }, "../lib/prisma": { prisma: fakePrisma },
    "../lib/genericEconomicPublication": { ...publication, selectedGenericEconomicRecord: (id: string, flags: typeof env) =>
      publication.selectedGenericEconomicRecord(id, flags, release) ? selected : undefined },
  })
  return { service, calls, state }
}

test("disabled and out-of-scope profiles perform no database operations", async () => {
  const f = fixture()
  assert.equal((await f.service.inspectGenericEconomicRead(pilot.playerId, {})).status, "DISABLED")
  assert.equal((await f.service.inspectGenericEconomicRead("outside", env)).status, "DISABLED")
  assert.equal((await f.service.inspectGenericEconomicRead(pilot.playerId, { ...env, VERCEL_ENV: "production" })).status, "DISABLED")
  assert.equal(f.calls.length, 0)
})

test("successful point read uses EA ID, enforces READ ONLY, rolls back and preserves the source", async () => {
  const f = fixture(); const before = JSON.stringify(f.state)
  const result = await f.service.inspectGenericEconomicRead(pilot.playerId, env)
  assert.equal(result.status, "READY")
  if (result.status === "READY") { assert.equal(result.view.eaId, pilot.eaId); assert.equal(result.view.weeklyWageEur, pilot.weeklyWageEur) }
  assert.deepEqual(f.calls.map(c => c.kind), ["BEGIN", "EXEC", "SHOW", "SELECT", "ROLLBACK"])
  assert.equal(JSON.stringify(f.state), before)
  assert.match(f.calls.find(c => c.kind === "SELECT")!.sql!, /AdminEconomicHead/)
  assert.match(f.calls.find(c => c.kind === "SELECT")!.sql!, /ResearchEconomicHead/)
})

test("existing economics and absent identities stop the projection without changing legacy data", async () => {
  for (const config of [{ conflict: true }, { missing: true }]) {
    const f = fixture(config); const before = JSON.stringify(f.state)
    assert.equal((await f.service.inspectGenericEconomicRead(pilot.playerId, env)).status, "CONFLICT")
    assert.equal(JSON.stringify(f.state), before); assert.equal(f.calls.at(-1)?.kind, "ROLLBACK")
  }
})

test("READ ONLY, SELECT and rollback failures return unavailable, never a partial success", async () => {
  for (const config of [{ failRead: true }, { failRollback: true }, { readOnly: "off" }]) {
    const f = fixture(config)
    assert.equal((await f.service.inspectGenericEconomicRead(pilot.playerId, env)).status, "UNAVAILABLE")
    if (config.readOnly === "off") assert(!f.calls.some(c => c.kind === "SELECT"))
  }
})

test("the new reader exposes no database writer and no shared-connection fallback", () => {
  const source = readFileSync("services/genericEconomicRead.server.ts", "utf8")
  assert.doesNotMatch(source, /DIRECT_URL|\b(insert|update|delete|create|upsert|migrate)\s*\(/i)
  assert.match(source, /withPrismaReadOnly\(prisma/)
})
