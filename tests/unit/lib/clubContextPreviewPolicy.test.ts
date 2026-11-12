import test from "node:test"
import assert from "node:assert/strict"
import { clubContextPreviewReadOnly, previewPooledConnectionString, rejectPreviewAlternateDatabase } from "../../../lib/clubContextPreviewPolicy"
import { clubContextReadEaIds, clubContextReadPilot } from "../../../lib/clubContextReadGate"

test("reader Preview automatically isolates SQL; explicit off baseline is isolated too; public runtime stays unchanged", () => {
  const env = { VERCEL_ENV: "preview", CLUB_CONTEXTS_READ_ENABLED: "1", CLUB_CONTEXTS_READ_EA_IDS: clubContextReadEaIds.join(","), CLUB_CONTEXTS_READ_PILOT_HASH: clubContextReadPilot.manifestHash }
  assert.equal(clubContextPreviewReadOnly(env), true)
  assert.equal(clubContextPreviewReadOnly({ VERCEL_ENV: "preview", CLUB_CONTEXTS_PREVIEW_READ_ONLY: "1" }), true)
  assert.equal(clubContextPreviewReadOnly({ VERCEL_ENV: "production" }), false)
  assert.throws(() => clubContextPreviewReadOnly({ ...env, CLUB_CONTEXTS_READ_EA_IDS: "218191" }), /INVALID_PILOT_SCOPE/)
  assert.throws(() => clubContextPreviewReadOnly({ VERCEL_ENV: "production", CLUB_CONTEXTS_PREVIEW_READ_ONLY: "1" }), /REQUIRES_PREVIEW/)
  assert.throws(() => rejectPreviewAlternateDatabase(env), /ALTERNATE_DATABASE_DISABLED/)
})

test("only the deployment-local pooled URL drops the incompatible startup option; never falls back to direct", () => {
  const input = "postgresql://test:test@pooled.db.prisma.io/postgres?options=-c%20default_transaction_read_only%3Don&sslmode=require"
  const result = new URL(previewPooledConnectionString(input))
  assert.equal(result.hostname, "pooled.db.prisma.io")
  assert.equal(result.searchParams.has("options"), false)
  assert.equal(result.searchParams.get("sslmode"), "verify-full")
  assert.ok(input.includes("options="))
  assert.throws(() => previewPooledConnectionString("postgresql://test:test@db.prisma.io/postgres"), /REQUIRES_POOLED/)
  assert.throws(() => previewPooledConnectionString(input.replace("default_transaction_read_only", "other_setting")), /UNSUPPORTED_STARTUP_OPTIONS/)
})
