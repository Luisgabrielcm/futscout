import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { validateNationalTeamSource, type NationalTeamSourceRow } from "../../../services/nationalTeamStaging"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")

function source() {
  const rows: NationalTeamSourceRow[] = Array.from({ length: 51 }, (_, index) => {
    const playerEaIds = [String(index + 1000)]
    const base = {
      eaTeamId: String(index + 1), name: `Selection ${index + 1}`,
      countryName: `Country ${index + 1}`, countrySlug: `country-${index + 1}`,
      countryMatchStatus: "EXPLICIT_FLAG_ALIAS" as const, sourceCommit: "test",
      sourceBinarySha256: "a".repeat(64), rosterDate: null,
      rosterHash: hash(playerEaIds.join("\n")), playerEaIds,
      matchedPlayerCount: 1, absentPlayerCount: 0, publicationAllowed: false as const,
      teamType: "MALE_NATIONAL" as const,
    }
    return { ...base, contentHash: hash(JSON.stringify(base)) }
  })
  return { rows, manifestHash: hash(rows.map(row => row.contentHash).join("\n")) }
}

test("validates 51 male teams, roster IDs and provenance hashes", () => {
  const input = source()
  assert.doesNotThrow(() => validateNationalTeamSource(input.rows, input.manifestHash))
  input.rows[0].name = "Changed"
  assert.throws(() => validateNationalTeamSource(input.rows, input.manifestHash), /CONTENT_HASH_MISMATCH/)
})

test("does not infer a membership from nationality or accept duplicate players", () => {
  const input = source()
  input.rows[1].playerEaIds = [...input.rows[0].playerEaIds]
  input.rows[1].rosterHash = hash(input.rows[1].playerEaIds.join("\n"))
  const { contentHash: _old, ...content } = input.rows[1]
  void _old
  input.rows[1].contentHash = hash(JSON.stringify(content))
  assert.throws(() => validateNationalTeamSource(input.rows, input.manifestHash), /PLAYER_DUPLICATE/)
})

test("requires an official source for explicit country resolution", () => {
  const input = source()
  const { contentHash: _old, ...content } = input.rows[0]
  void _old
  content.countryMatchStatus = "OFFICIAL_ASSOCIATION"
  input.rows[0] = { ...content, contentHash: hash(JSON.stringify(content)) }
  assert.throws(() => validateNationalTeamSource(input.rows, input.manifestHash), /ROW_INVALID/)
})
