import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const migration = readFileSync("prisma/migrations/20260918000000_brand_asset_registry/migration.sql", "utf8")
const schema = readFileSync("prisma/schema.prisma", "utf8")

test("brand asset migration is additive, prepared-only and contains no data mutation", () => {
  assert.match(migration, /PREPARED ONLY/)
  assert.match(migration, /CREATE TABLE "BrandAssetIdentity"/)
  assert.match(migration, /CREATE TABLE "BrandAsset"/)
  assert.doesNotMatch(migration, /(?:^|\n)\s*(?:INSERT INTO|UPDATE "|DELETE FROM|TRUNCATE TABLE)/i)
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Club|League)"/)
  assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN|TYPE|INDEX)/i)
})

test("schema separates provider identity, asset lifecycle and rights policy", () => {
  for (const token of [
    "model BrandAssetIdentity",
    "model BrandAsset",
    "enum BrandAssetRightsStatus",
    "APPROVED",
    "REMOTE_ONLY",
    "CACHE_ALLOWED",
    "REVIEW_REQUIRED",
    "BLOCKED",
  ]) assert.ok(schema.includes(token), token)

  assert.match(migration, /BrandAsset_one_active_per_identity_type_key/)
  assert.match(migration, /futscout_validate_brand_asset_identity/)
  assert.match(migration, /futscout_validate_brand_asset_type/)
})
