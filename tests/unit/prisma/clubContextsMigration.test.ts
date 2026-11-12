import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim()
const candidate = normalize(readFileSync("prisma/club-contexts.candidate.sql", "utf8"))
const migration = normalize(readFileSync("prisma/migrations/20261112001000_club_contexts/migration.sql", "utf8"))

test("versioned migration preserves the entire validated candidate inside an explicit transaction", () => {
  assert.equal(migration, `BEGIN;\n\n${candidate}\n\nCOMMIT;`)
})

test("club context migration cannot backfill or modify legacy player, club or economic data", () => {
  assert.doesNotMatch(migration, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|DROP\s+TABLE)\s+"(?:Player|Club|League|PlayerEconomic\w*|AdminEconomic\w*|ResearchEconomic\w*)"/i)
  assert.doesNotMatch(migration, /\b(?:COPY|CALL)\s/i)
})
