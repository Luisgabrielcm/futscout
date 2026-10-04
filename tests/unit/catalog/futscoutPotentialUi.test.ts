import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { potentialUiViews } from "../../helpers/futscoutPotentialUi"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { readFutscoutPotential } from "../../../lib/futscoutPotential/read"
import { createOfficialLineupReadStore } from "../../../services/officialLineupReadRepository"
import type { PrismaClient } from "../../../app/generated/prisma/client"

// Audited M3/M7 values, not targets for calibration.
const cases = [
  ["Lamine Yamal", 89, 95.89096342097743, 96], ["Pedri", 89, 91.38979545750449, 91],
  ["Jude Bellingham", 90, 92.83268596270206, 93], ["Kylian Mbappé", 91, 90.83334164506691, 91],
  ["Robert Lewandowski", 88, 86.57169692490992, 88], ["Wojciech Szczęsny", 84, 83.18890006929247, 84],
  ["Virgil van Dijk", 90, 88.70598121590186, 90],
] as const

function assertPotential(html: string, displayed: string) {
  assert.match(html, new RegExp(`(?:Potencial|POTENCIAL)</(?:span|dt|th)>[\\s\\S]*?(?:<strong>|<dd>|<td[^>]*>)(?:<a[^>]*>)?${displayed}(?:</a>)?(?:</strong>|</dd>|</td>)`))
  assert.doesNotMatch(html, /legacyPotential|potentialReadState|futurePeak|MISSING_CURRENT|EXPERIMENTAL/)
}
for (const [name, overall, raw, expected] of cases) {
  test(`${name}: every existing display receives careerCeiling ${overall}/${expected}`, () => {
    const row = catalogPlayer({ name, officialOverall: overall, potential: 17, currentFutscoutPotential: {
      estimate: { status: "EXPERIMENTAL", modelVersion: "potential-model-e-v1", inputOverall: overall, potentialRaw: raw },
    } })
    const player = { ...mapDatabasePlayer(row), ...readFutscoutPotential(row) }
    for (const html of Object.values(potentialUiViews(player))) {
      assertPotential(html, String(expected))
      assert.doesNotMatch(html, />17</)
    }
  })
}
test("every display preserves null even when legacy and futurePeak exist", () => {
  const player = { ...mapDatabasePlayer(catalogPlayer({ potential: 97 })),
    potential: null, legacyPotential: 97, potentialReadState: "MISSING_CURRENT" as const,
    futscoutPotential: { futurePeak: 98, modelVersion: "potential-model-e-v1", status: "EXPERIMENTAL" } }
  for (const html of Object.values(potentialUiViews(player))) {
    assertPotential(html, "—")
    assert.doesNotMatch(html, />97<|>98</)
  }
})
test("visual sources cannot read legacyPotential/futurePeak/technical state", () => {
  for (const file of ["PlayerCard", "PlayerHeader", "PlayerOverview", "PlayerComparison", "ClubExperience", "OfficialLineupPanel", "PlayersSearch"]) {
    assert.doesNotMatch(readFileSync(`app/components/${file}.tsx`, "utf8"), /legacyPotential|futurePeak|potentialReadState/)
  }
})
test("official bench repository projects current in one batched read, with no legacy fallback", async () => {
  let reads = 0
  const db = { player: { findMany: async (args: { select: Record<string, unknown> }) => {
    reads++; assert.ok(args.select.currentFutscoutPotential)
    return [{ id: "fixture", potential: 97, currentFutscoutPotential: { estimate: {
      status: "EXPERIMENTAL", modelVersion: "potential-model-e-v1", inputOverall: 88, potentialRaw: 86.57,
    } } }, { id: "absent", potential: 99, currentFutscoutPotential: null }]
  } } } as unknown as PrismaClient
  const rows = await createOfficialLineupReadStore(db, new Date("2026-09-30T00:00:00Z")).readPlayersByApiIds([1, 2])
  assert.equal(reads, 1)
  assert.equal(rows[0].potential, 88)
  assert.equal(rows[1].potential, null)
})
