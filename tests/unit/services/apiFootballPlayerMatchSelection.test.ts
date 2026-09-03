import assert from "node:assert/strict"
import test from "node:test"

import { buildApiFootballPlayerMatchSelectionArgs } from "../../../services/apiFootballPlayerMatchSelection"

const now = new Date("2026-09-03T12:00:00.000Z")

test("allow-list restringe a seleção aos IDs autorizados", () => {
  const selection = buildApiFootballPlayerMatchSelectionArgs({
    batchSize: 3,
    now,
    playerIds: ["player-a", "player-c"],
  })

  assert.deepEqual(selection.where.id, {
    in: ["player-a", "player-c"],
  })
})

test("allow-list continua combinada com todos os critérios de elegibilidade", () => {
  const selection = buildApiFootballPlayerMatchSelectionArgs({
    batchSize: 3,
    now,
    playerIds: ["ineligible-player"],
  })

  assert.equal(selection.where.apiFootballId, null)
  assert.deepEqual(selection.where.dateOfBirth, { not: null })
  assert.deepEqual(selection.where.clubId, { not: null })
  assert.deepEqual(selection.where.id, { in: ["ineligible-player"] })
  assert.deepEqual(selection.where.OR, [
    { apiFootballMatchAttempt: null },
    {
      apiFootballMatchAttempt: {
        is: {
          status: { not: "matched" },
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: now } },
          ],
        },
      },
    },
  ])
})

test("lista vazia constrói uma seleção que retorna zero jogadores", () => {
  const selection = buildApiFootballPlayerMatchSelectionArgs({
    batchSize: 3,
    now,
    playerIds: [],
  })

  assert.deepEqual(selection.where.id, { in: [] })
})

test("IDs duplicados são deduplicados antes da query", () => {
  const selection = buildApiFootballPlayerMatchSelectionArgs({
    batchSize: 3,
    now,
    playerIds: ["player-a", "player-a", "player-b", "player-a"],
  })

  assert.deepEqual(selection.where.id, {
    in: ["player-a", "player-b"],
  })
})

test("batchSize continua limitando a seleção autorizada", () => {
  const selection = buildApiFootballPlayerMatchSelectionArgs({
    batchSize: 1,
    now,
    playerIds: ["player-a", "player-b", "player-c"],
  })

  assert.equal(selection.take, 1)
})

test("orderBy operacional não segue a ordem da allow-list", () => {
  const selection = buildApiFootballPlayerMatchSelectionArgs({
    batchSize: 3,
    now,
    playerIds: ["player-c", "player-a", "player-b"],
  })

  assert.deepEqual(selection.orderBy, [
    { officialOverall: "desc" },
    { name: "asc" },
  ])
})

test("ausência de allow-list preserva a seleção operacional atual", () => {
  const selection = buildApiFootballPlayerMatchSelectionArgs({
    batchSize: 10,
    now,
  })

  assert.equal("id" in selection.where, false)
  assert.equal(selection.where.apiFootballId, null)
  assert.deepEqual(selection.where.dateOfBirth, { not: null })
  assert.deepEqual(selection.where.clubId, { not: null })
  assert.equal(selection.take, 10)
  assert.deepEqual(selection.orderBy, [
    { officialOverall: "desc" },
    { name: "asc" },
  ])
})
