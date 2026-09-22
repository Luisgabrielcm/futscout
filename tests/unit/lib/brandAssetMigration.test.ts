import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const migration = readFileSync("prisma/migrations/20260918000000_brand_asset_registry/migration.sql", "utf8")
const schema = readFileSync("prisma/schema.prisma", "utf8")
const operationalMigration = readFileSync(
  "prisma/migrations/20260921180000_brand_asset_operational_decision/migration.sql", "utf8")
const riskAcceptanceMigration = readFileSync(
  "prisma/migrations/20260921220000_brand_asset_risk_acceptance/migration.sql", "utf8")
const displayPolicyMigration = readFileSync(
  "prisma/migrations/20260922120000_brand_asset_display_policy/migration.sql", "utf8")

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

test("operational authorization migration is additive and keeps rights evidence separate", () => {
  assert.match(operationalMigration, /PREPARED ONLY/)
  assert.match(operationalMigration, /BrandAssetOperationalDecision/)
  assert.match(operationalMigration, /OWNER_AUTHORIZED_REMOTE_USE/)
  assert.match(operationalMigration, /operationalAuthorizedAt/)
  assert.match(operationalMigration, /operationalDecisionRef/)
  assert.doesNotMatch(operationalMigration, /(?:^|\n)\s*(?:INSERT INTO|UPDATE |DELETE FROM|TRUNCATE TABLE)/i)
  assert.doesNotMatch(operationalMigration, /ALTER TABLE "(?:Club|League|Player)"/)
  assert.doesNotMatch(operationalMigration, /DROP (?:TABLE|COLUMN|TYPE|INDEX)/i)
  assert.match(schema, /enum BrandAssetOperationalDecision/)
})

test("risk acceptance migration is structured, additive and contains no data mutation", () => {
  for (const token of ["operatorRiskAccepted", "riskAcceptedAt", "riskAcceptedBy", "riskReason", "sourceTermsUrl",
    "revocable", "BrandAsset_risk_acceptance_consistency_check"]) assert.match(riskAcceptanceMigration, new RegExp(token))
  assert.doesNotMatch(riskAcceptanceMigration, /(?:^|\n)\s*(?:INSERT INTO|UPDATE |DELETE FROM|TRUNCATE TABLE)/i)
  assert.doesNotMatch(riskAcceptanceMigration, /ALTER TABLE "(?:Club|League|Player)"/)
  assert.doesNotMatch(riskAcceptanceMigration, /DROP (?:TABLE|COLUMN|TYPE|INDEX)/i)
  assert.match(schema, /operatorRiskAccepted\s+Boolean/)
  assert.match(schema, /sourceTermsUrl\s+String\?/)
})

test("display policy migration is additive and keeps BLOCKED fail-closed", () => {
  for (const token of ["BrandAssetDisplayPolicy", "DISPLAY_ALLOWED", "DISPLAY_BLOCKED",
    "BrandAsset_display_policy_consistency_check", "BrandAsset_displayPolicy_status_idx"]) {
    assert.match(displayPolicyMigration, new RegExp(token))
  }
  assert.doesNotMatch(displayPolicyMigration, /(?:^|\n)\s*(?:INSERT INTO|UPDATE |DELETE FROM|TRUNCATE TABLE)/i)
  assert.doesNotMatch(displayPolicyMigration, /ALTER TABLE "(?:Club|League|Player)"/)
  assert.doesNotMatch(displayPolicyMigration, /DROP (?:TABLE|COLUMN|TYPE|INDEX)/i)
  assert.match(schema, /enum BrandAssetDisplayPolicy/)
  assert.match(schema, /displayPolicy\s+BrandAssetDisplayPolicy/)
})
