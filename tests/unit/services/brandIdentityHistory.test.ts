import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { createPrismaBrandAssetWriteStore } from "../../../services/prismaBrandAssetWriteStore"

test("adapter looks up only nonblocked local identities but reserves every provider ID including history", async () => {
  const input = { entityType: "CLUB" as const, entityId: "local", provider: "api-football" as const, providerEntityId: "104", assetType: "CREST" as const }
  const seen: unknown[] = []
  const db = { async $transaction(work: (tx: unknown) => unknown, options: unknown) {
    seen.push(options)
    return work({ brandAssetIdentity: {
      async findFirst(query: unknown) { seen.push(query); return null },
      async findUnique(query: unknown) { seen.push(query); return null },
    } })
  } } as unknown as Pick<PrismaClient, "$transaction">
  await createPrismaBrandAssetWriteStore(db).transaction(async tx => {
    await tx.findIdentityByLocal(input)
    await tx.findIdentityByProvider(input)
  })
  assert.equal((seen[0] as { isolationLevel: string }).isolationLevel, "Serializable")
  assert.deepEqual((seen[1] as { where: unknown }).where,
    { entityType: "CLUB", entityId: "local", provider: "api-football", status: { not: "BLOCKED" } })
  assert.deepEqual((seen[2] as { where: unknown }).where,
    { entityType_provider_providerEntityId: { entityType: "CLUB", provider: "api-football", providerEntityId: "104" } })
})

test("prepared SQL atomically replaces only local uniqueness, keeps review reserved, never mutates rows", () => {
  const sql = readFileSync("prisma/migrations/20260923170000_brand_identity_blocked_history/migration.sql", "utf8")
  assert.match(sql, /BEGIN;/); assert.match(sql, /COMMIT;/)
  assert.match(sql, /LOCK TABLE "BrandAssetIdentity" IN SHARE ROW EXCLUSIVE MODE/)
  assert.match(sql, /WHERE "status" <> 'BLOCKED'/)
  assert.ok(sql.indexOf("CREATE UNIQUE INDEX") < sql.indexOf("DROP INDEX"))
  assert.deepEqual([...sql.matchAll(/DROP INDEX "([^"]+)"/g)].map(m => m[1]), ["BrandAssetIdentity_entityType_entityId_provider_key"])
  assert.doesNotMatch(sql, /(?:^|\n)\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER TABLE|DROP TABLE)\b/i)
  const schema = readFileSync("prisma/schema.prisma", "utf8")
  assert.match(schema, /@@unique\(\[entityType, provider, providerEntityId\]\)/)
  assert.doesNotMatch(schema, /@@unique\(\[entityType, entityId, provider\]\)/)
})

test("reader never selects BLOCKED history and revocation still denies image delivery", () => {
  const reader = readFileSync("services/brandAssetReadService.ts", "utf8")
  assert.match(reader, /where:\s*\{\s*status: "VERIFIED"/)
  const pipeline = readFileSync("lib/assetPipeline.ts", "utf8")
  assert.match(pipeline, /operationalDecision === "REVOKED"\) return null/)
  assert.match(pipeline, /displayPolicy !== "DISPLAY_ALLOWED"\) return null/)
})
