import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync(
  "prisma/migrations/20260919120000_add_goalkeeper_attributes/migration.sql",
  "utf8",
)

test("goalkeeper migration is additive, empty and isolated from outfield attributes", () => {
  assert.match(sql, /CREATE TABLE "PlayerGoalkeeperAttributes"/)
  assert.match(sql, /UNIQUE INDEX "PlayerGoalkeeperAttributes_playerId_key"/)
  assert.match(sql, /REFERENCES "Player"\("id"\)/)
  assert.match(sql, /REFERENCES "EaCatalogObservation"\("id"\)/)
  const executableSql = sql.replace(/^\s*--.*$/gm, "")
  assert.doesNotMatch(executableSql, /^\s*(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/im)
  assert.doesNotMatch(sql, /ALTER TABLE "PlayerAttributes"/)
})
