import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { Prisma } from "../../../app/generated/prisma/client"

// Static schema/SQL contracts only. No client instance, SQL execution or calculation.
const schema = readFileSync("prisma/schema.prisma", "utf8")
const sql = readFileSync("prisma/migrations/20260929120000_futscout_potential_estimates/migration.sql", "utf8")
const model = (name: string) => {
  const body = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1]
  assert.ok(body, name)
  return body
}
const estimate = model("PlayerFutscoutPotentialEstimate")
const current = model("PlayerFutscoutPotentialCurrent")

test("separate append-only model registry, many evaluations and one nullable selection per player", () => {
  assert.match(model("FutscoutPotentialModel"), /version\s+String @id/)
  assert.match(model("FutscoutPotentialModel"), /artifactHash\s+String/)
  assert.match(model("FutscoutPotentialModel"), /inputContractVersion\s+String/)
  assert.match(estimate, /modelVersion\s+String/)
  assert.match(estimate, /playerId\s+String\s*\n/)
  assert.doesNotMatch(estimate, /playerId\s+String\s+@(?:id|unique)/)
  assert.match(current, /playerId\s+String @id/)
  assert.match(current, /estimateId\s+String\? @unique/)
  assert.match(current, /@@unique\(\[estimateId, playerId\]/)
  assert.doesNotMatch(estimate, /@updatedAt|monthly|trajectory/)
})

test("same input/model is unique while different versions and input hashes can coexist", () => {
  assert.match(estimate, /@@unique\(\[playerId, modelVersion, inputHash\]/)
  assert.match(sql, /CREATE UNIQUE INDEX "futscout_potential_input_key"\s+ON "PlayerFutscoutPotentialEstimate"\("playerId", "modelVersion", "inputHash"\)/)
  const keys = [
    { playerId: "test-player", modelVersion: "potential-model-e-v1", inputHash: "a".repeat(64) },
    { playerId: "test-player", modelVersion: "potential-model-e-v2", inputHash: "a".repeat(64) },
    { playerId: "test-player", modelVersion: "potential-model-e-v1", inputHash: "b".repeat(64) },
  ] satisfies Prisma.PlayerFutscoutPotentialEstimatePlayerIdModelVersionInputHashCompoundUniqueInput[]
  // Conceptual key contract, not a simulated PostgreSQL constraint test.
  assert.equal(new Set(keys.map(k => JSON.stringify(k))).size, 3)
})

test("FKs restrict orphan/cross-player selection and neither cascade nor mutate Player", () => {
  assert.match(current, /fields: \[estimateId, playerId\], references: \[id, playerId\]/)
  assert.match(estimate, /@@unique\(\[id, playerId\]/)
  assert.match(sql, /FOREIGN KEY \("estimateId", "playerId"\) REFERENCES "PlayerFutscoutPotentialEstimate"\("id", "playerId"\)/)
  assert.equal((sql.match(/ON DELETE RESTRICT ON UPDATE RESTRICT/g) || []).length, 4)
  assert.match(sql, /CREATE UNIQUE INDEX "futscout_potential_current_identity_key"/)
  assert.doesNotMatch(sql, /CASCADE/)
})

test("metadata checks reject blank version/contract and non-SHA256 hash shapes", () => {
  assert.match(sql, /length\(btrim\("version"\)\) > 0/)
  assert.match(sql, /length\(btrim\("inputContractVersion"\)\) > 0/)
  assert.ok(sql.includes('"artifactHash" ~ \'^[0-9a-f]{64}$\''))
  assert.ok(sql.includes('"inputHash" ~ \'^[0-9a-f]{64}$\''))
  assert.match(sql, /"provenance"->>'kind' = 'FUTSCOUT_ESTIMATE'/)
})

test("EXPERIMENTAL requires bounded results; INVALID carries a reason and no numbers", () => {
  assert.match(sql, /"potentialRaw" IS NOT NULL AND "potentialRaw" BETWEEN 1 AND 99/)
  assert.match(sql, /"potentialRounded" IS NOT NULL AND "potentialRounded" BETWEEN 1 AND 99/)
  assert.match(sql, /"peakSeason" IS NOT NULL AND "peakSeason" BETWEEN 1 AND 10/)
  assert.match(sql, /"potentialRounded" = floor\("potentialRaw" \+ 0\.5\)/)
  assert.match(sql, /"status" = 'INVALID'[\s\S]*?"potentialRaw" IS NULL AND "potentialRounded" IS NULL AND "peakSeason" IS NULL/)
  assert.match(sql, /"invalidReason" IS NOT NULL AND length\(btrim\("invalidReason"\)\) > 0/)
  assert.equal((sql.match(/\) IS TRUE\)/g) || []).length, 3)
})

test("snapshot numeric projection checks retain IEEE double precision and fail closed on absent keys", () => {
  for (const field of ["inputAge", "inputOverall", "potentialRaw"]) assert.ok(sql.includes(`"${field}" DOUBLE PRECISION`))
  for (const key of ["age", "overall"]) {
    assert.ok(sql.includes(`jsonb_typeof("inputSnapshot"->'${key}') = 'number'`))
    assert.ok(sql.includes(`("inputSnapshot"->>'${key}')::DOUBLE PRECISION`))
  }
  assert.match(sql, /"inputSnapshot"->>'position' = "inputPosition"/)
  for (const field of ["inputSnapshot", "referenceAt", "computedAt", "provenance"]) assert.ok(estimate.includes(field))
})

test("SQL guards historical UPDATE/DELETE/TRUNCATE and prevents resetting a current revision", () => {
  for (const table of ["FutscoutPotentialModel", "PlayerFutscoutPotentialEstimate"]) {
    assert.ok(sql.includes(`BEFORE UPDATE OR DELETE ON "${table}"`))
    assert.ok(sql.includes(`BEFORE TRUNCATE ON "${table}"`))
  }
  assert.match(sql, /BEFORE DELETE ON "PlayerFutscoutPotentialCurrent"/)
  assert.match(sql, /BEFORE TRUNCATE ON "PlayerFutscoutPotentialCurrent"/)
  assert.match(sql, /NEW\."version" <> 1/)
  assert.match(sql, /NEW\."version" <> OLD\."version" \+ 1/)
  assert.match(sql, /NEW\."estimateId" IS NOT DISTINCT FROM OLD\."estimateId"/)
  assert.match(sql, /NEW\."playerId" IS DISTINCT FROM OLD\."playerId"/)
})

test("selection rejects INVALID; supports withdrawal and typed CAS without invoking any writer", () => {
  assert.match(sql, /NEW\."estimateId" IS NOT NULL AND NOT EXISTS/)
  assert.match(sql, /"id" = NEW\."estimateId" AND "playerId" = NEW\."playerId" AND "status" = 'EXPERIMENTAL'/)
  const cas = {
    where: { playerId: "test-player", version: 7, estimateId: "old-evaluation" },
    data: { estimateId: null, version: 8, selectedAt: new Date("2026-09-29T00:00:00Z"), decisionRef: "test-only-withdrawal" },
  } satisfies Prisma.PlayerFutscoutPotentialCurrentUpdateManyArgs
  assert.equal(cas.data.estimateId, null)
  assert.equal(cas.data.version, cas.where.version + 1)
})

test("migration only creates structure and never registers a model, backfills or changes legacy potential", () => {
  const executable = sql.replace(/^\s*--.*$/gm, "")
  assert.match(sql, /PREPARED ONLY/)
  assert.match(executable, /^\s*BEGIN;/)
  assert.match(executable, /COMMIT;\s*$/)
  assert.doesNotMatch(executable, /^\s*(?:INSERT INTO|UPDATE "|DELETE FROM|TRUNCATE TABLE|DROP )/im)
  assert.doesNotMatch(executable, /ALTER TABLE "(?:Player|PlayerAttributes|PlayerGoalkeeperAttributes|Club|League)"/)
  assert.match(model("Player"), /\n\s+potential\s+Int\?\s*\n/)
  assert.match(model("Player"), /@@index\(\[potential\]\)/)
  const selection = { potential: true, officialOverall: true } satisfies Prisma.PlayerSelect
  assert.deepEqual(selection, { potential: true, officialOverall: true })
})
