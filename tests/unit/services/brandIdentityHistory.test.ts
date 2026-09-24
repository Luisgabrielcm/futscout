import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { createPrismaBrandAssetWriteStore } from "../../../services/prismaBrandAssetWriteStore"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import * as brackPolicy from "../../../lib/brackBrandSource"
import * as pipeline from "../../../lib/assetPipeline"

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

test("reader selects Red Star 104 while keeping blocked 4396 history and revoked images invisible", async () => {
  const asset = { assetType: "CREST", status: "ACTIVE", rightsStatus: "APPROVED",
    operationalDecision: "NOT_AUTHORIZED", displayPolicy: "DISPLAY_ALLOWED", version: 1,
    fetchedAt: new Date("2026-09-23T00:00:00Z"), storageUrl: null,
    sourceUrl: "https://media.api-sports.io/football/teams/104.png" }
  const active = { entityType: "CLUB", entityId: "red-star", provider: "api-football",
    providerEntityId: "104", status: "VERIFIED", assets: [asset] }
  const blocked = { ...active, providerEntityId: "4396", status: "BLOCKED",
    assets: [{ ...asset, sourceUrl: "https://media.api-sports.io/football/teams/4396.png",
      operationalDecision: "REVOKED", displayPolicy: "DISPLAY_BLOCKED" }] }
  let rows = [blocked, active]
  const reader = loadCatalogModule<typeof import("../../../services/brandAssetReadService")>(
    "services/brandAssetReadService.ts", {
      "server-only": {}, "../lib/brackBrandSource": brackPolicy, "../lib/assetPipeline": pipeline,
      "../lib/prisma": { prisma: { brandAssetIdentity: { findMany: async () => rows } } },
    })
  const selected = (await reader.getBrandAssetsForEntities({ clubIds: ["red-star"] })).clubs.get("red-star")!
  assert.equal(selected.identity.providerEntityId, "104")
  assert.equal(pipeline.resolveAssetSource(selected, "club"), asset.sourceUrl)
  for (const changes of [{ operationalDecision: "REVOKED" as const }, { displayPolicy: "DISPLAY_BLOCKED" as const }]) {
    assert.equal(pipeline.resolveAssetSource({ ...selected, ...changes }, "club"), null)
  }
  rows = [blocked]
  assert.equal((await reader.getBrandAssetsForEntities({ clubIds: ["red-star"] })).clubs.size, 0)
})
