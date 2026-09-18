import assert from "node:assert/strict"
import test from "node:test"

import { auditEaRatingsSourceBatch } from "../../../sync/eaAutoSyncSourceAudit"
import type { EARatingsPlayer } from "../../../types/eaRatingsPlayer"

test("audits real position codes and source field coverage without inference", () => {
  const players = [
    {
      id: 1,
      position: { label: "RM" },
      alternatePositions: [{ label: "CF" }],
      overallRating: 88,
      potential: 88,
      stats: { pac: { value: 90 }, acceleration: { value: 91 }, gkDiving: { value: 10 } },
      playerAbilities: [{ label: "Rapid", type: { id: "playStyle" } }],
      team: { id: 10, label: "Club" },
      leagueName: "League",
      salary: 100,
      contract: { endDate: "2028-06-30" },
    },
    {
      id: 2,
      position: { label: "LM" },
      alternatePositions: [{ label: "RM" }],
      stats: { gkHandling: { value: 5 } },
      loanClub: { id: 20 },
    },
    {
      id: 3,
      position: { label: "Goalkeeper" },
      overallRating: 80,
      team: { id: 20, label: "GK Club" },
      leagueName: "GK League",
      stats: {
        gkDiving: { value: 80 },
        gkHandling: { value: 81 },
      },
    },
  ] as unknown as EARatingsPlayer[]

  const audit = auditEaRatingsSourceBatch(players)

  assert.deepEqual(audit.positions, [
    { sourceCode: "CF", normalizedCode: "SA", primaryOccurrences: 0, alternateOccurrences: 1 },
    { sourceCode: "Goalkeeper", normalizedCode: "GOL", primaryOccurrences: 1, alternateOccurrences: 0 },
    { sourceCode: "LM", normalizedCode: "ME", primaryOccurrences: 1, alternateOccurrences: 0 },
    { sourceCode: "RM", normalizedCode: "MD", primaryOccurrences: 1, alternateOccurrences: 1 },
  ])
  assert.equal(audit.coverage.potential, 1)
  assert.equal(audit.coverage.players, 3)
  assert.equal(audit.coverage.officialOverall, 2)
  assert.equal(audit.coverage.lineAttributes.players, 1)
  assert.equal(audit.coverage.lineAttributes.fields.pac, 1)
  assert.equal(audit.coverage.lineAttributes.fields.acceleration, 1)
  assert.equal(audit.coverage.primaryPosition, 3)
  assert.equal(audit.coverage.secondaryPositions, 2)
  assert.deepEqual(audit.coverage.playStyles, { players: 1, normal: 1, plus: 0 })
  assert.equal(audit.coverage.club, 2)
  assert.equal(audit.coverage.league, 2)
  assert.deepEqual(audit.coverage.salary, { players: 1, paths: ["salary"] })
  assert.deepEqual(audit.coverage.contract, { players: 1, paths: ["contract"] })
  assert.deepEqual(audit.coverage.loan, { players: 1, paths: ["loanClub"] })
  assert.deepEqual(audit.coverage.goalkeeperSpecificAttributes, {
    players: 1,
    fields: ["stats.gkDiving", "stats.gkHandling"],
    fieldPlayers: { "stats.gkDiving": 1, "stats.gkHandling": 1 },
  })
})

test("ignores goalkeeper-shaped stats on an outfield player", () => {
  const audit = auditEaRatingsSourceBatch([{
    id: 1,
    position: { label: "Center Midfielder" },
    stats: {
      gkDiving: { value: 12 },
      gkHandling: { value: 8 },
    },
  }])

  assert.deepEqual(audit.coverage.goalkeeperSpecificAttributes, {
    players: 0,
    fields: [],
    fieldPlayers: {},
  })
})

test("reports unavailable source fields as empty coverage", () => {
  const audit = auditEaRatingsSourceBatch([{ id: 1 }] as EARatingsPlayer[])

  assert.deepEqual(audit.positions, [])
  assert.equal(audit.coverage.potential, 0)
  assert.deepEqual(audit.coverage.salary, { players: 0, paths: [] })
  assert.deepEqual(audit.coverage.contract, { players: 0, paths: [] })
  assert.deepEqual(audit.coverage.loan, { players: 0, paths: [] })
  assert.equal(audit.coverage.players, 1)
  assert.equal(audit.coverage.officialOverall, 0)
  assert.equal(audit.coverage.lineAttributes.players, 0)
  assert.equal(audit.coverage.primaryPosition, 0)
  assert.equal(audit.coverage.secondaryPositions, 0)
  assert.deepEqual(audit.coverage.playStyles, { players: 0, normal: 0, plus: 0 })
  assert.equal(audit.coverage.club, 0)
  assert.equal(audit.coverage.league, 0)
  assert.deepEqual(audit.coverage.goalkeeperSpecificAttributes, { players: 0, fields: [], fieldPlayers: {} })
})
