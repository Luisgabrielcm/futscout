import assert from "node:assert/strict"
import test from "node:test"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { runAdminDatabaseIdentityDiagnostic } from "../../../lib/adminDatabaseIdentityDiagnostic.server"

const env = { NODE_ENV: "production" as const, VERCEL_ENV: "preview", CLUB_CONTEXTS_PREVIEW_READ_ONLY: "1", FUTSCOUT_ADMIN_DATABASE_URL: "must-not-be-used", DATABASE_URL: "must-not-be-used" }

test("admin entrypoint cannot create or reuse a direct pool in reader Preview", () => {
  let opened = 0
  const service = loadCatalogModule<typeof import("../../../services/adminAuth.server")>("services/adminAuth.server.ts", {
    "server-only": {}, "pg": { Pool: class { constructor() { opened++ } } }, "../lib/adminAuth": {},
  }, { process: { env } })
  assert.throws(() => service.adminPool(), /ALTERNATE_DATABASE_DISABLED/)
  assert.equal(opened, 0)
})

test("admin identity diagnostic cannot open an auxiliary pool outside the Preview adapter", async () => {
  let opened = 0
  await assert.rejects(runAdminDatabaseIdentityDiagnostic({ env,
    createRuntimePool: () => { opened++; throw Error("MUST_NOT_OPEN") },
    connectAdmin: async () => { opened++; throw Error("MUST_NOT_OPEN") },
  }), /ALTERNATE_DATABASE_DISABLED/)
  assert.equal(opened, 0)
})
