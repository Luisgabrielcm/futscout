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
      potential: 88,
      stats: { gkDiving: { value: 10 } },
      salary: 100,
      contract: { endDate: "2028-06-30" },
    },
    {
      id: 2,
      position: { label: "LM" },
      alternatePositions: [{ label: "RM" }],
      loanClub: { id: 20 },
    },
  ] as unknown as EARatingsPlayer[]

  const audit = auditEaRatingsSourceBatch(players)

  assert.deepEqual(audit.positions, [
    { sourceCode: "CF", normalizedCode: "SA", primaryOccurrences: 0, alternateOccurrences: 1 },
    { sourceCode: "LM", normalizedCode: "ME", primaryOccurrences: 1, alternateOccurrences: 0 },
    { sourceCode: "RM", normalizedCode: "MD", primaryOccurrences: 1, alternateOccurrences: 1 },
  ])
  assert.equal(audit.coverage.potential, 1)
  assert.deepEqual(audit.coverage.salary, { players: 1, paths: ["salary"] })
  assert.deepEqual(audit.coverage.contract, { players: 1, paths: ["contract"] })
  assert.deepEqual(audit.coverage.loan, { players: 1, paths: ["loanClub"] })
  assert.deepEqual(audit.coverage.goalkeeperSpecificAttributes, {
    players: 1,
    fields: ["stats.gkDiving"],
  })
})

test("reports unavailable source fields as empty coverage", () => {
  const audit = auditEaRatingsSourceBatch([{ id: 1 }] as EARatingsPlayer[])

  assert.deepEqual(audit.positions, [])
  assert.equal(audit.coverage.potential, 0)
  assert.deepEqual(audit.coverage.salary, { players: 0, paths: [] })
  assert.deepEqual(audit.coverage.contract, { players: 0, paths: [] })
  assert.deepEqual(audit.coverage.loan, { players: 0, paths: [] })
  assert.deepEqual(audit.coverage.goalkeeperSpecificAttributes, { players: 0, fields: [] })
})
