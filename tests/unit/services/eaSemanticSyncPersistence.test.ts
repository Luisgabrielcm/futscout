import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

import * as semanticSync from "../../../lib/eaCatalogSemanticSync"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import type { NormalizedPlayer } from "../../../types/normalizedPlayer"

const attributeNames = (
  "pace acceleration sprintSpeed shooting positioning finishing shotPower longShots volleys penalties passing vision " +
  "crossing freeKickAccuracy shortPassing longPassing curve dribbling agility balance reactions ballControl dribblingStat " +
  "composure defending interceptions headingAccuracy defensiveAwareness standingTackle slidingTackle physical jumping stamina strength aggression"
).split(" ")

const normalized: NormalizedPlayer = {
  externalId: "231866", source: "ea-ratings", name: "Rodri", position: "VOL",
  secondaryPositions: [], officialOverall: 90, potential: 90,
  attributes: Object.fromEntries(attributeNames.map(name => [name, 80])), playStyles: [],
  club: { externalId: "10", name: "Manchester City" }, league: { name: "Premier League" },
}

function storedRow() {
  const snapshot = semanticSync.normalizedPlayerSnapshot(normalized)
  return {
    id: "player", slug: "rodri", externalId: snapshot.externalId, name: snapshot.name,
    dateOfBirth: null, nationality: null, position: snapshot.position, secondaryPosition: null,
    secondaryPositions: [], preferredFoot: null, height: null, skillMoves: null, weakFootAbility: null,
    imageUrl: null, officialOverall: snapshot.officialOverall, potential: snapshot.potential,
    club: { externalId: "10", name: "Manchester City", imageUrl: null,
      league: { externalId: null, name: "Premier League" } },
    attributes: { id: "attributes", playerId: "player", createdAt: new Date(0), updatedAt: new Date(0), ...snapshot.attributes },
    playStyles: [],
  }
}

function loadSync(prisma: object) {
  return loadCatalogModule<typeof import("../../../services/syncPlayers")>("services/syncPlayers.ts", {
    "../lib/prisma": { prisma },
    "../lib/databaseRetry": { databaseRetry: <T>(run: () => Promise<T>) => run() },
    "../lib/eaCatalogSemanticSync": semanticSync,
  })
}

test("NO_OP records provenance without touching Player, Club, League or Current Club V2", async () => {
  const writes: unknown[] = []
  const prisma = new Proxy({
    player: { findMany: async () => [storedRow()] },
    $transaction: async (work: (tx: object) => Promise<unknown>) => work({
      eaCatalogObservation: { create: async (input: unknown) => { writes.push(input); return { id: "observation" } } },
    }),
  }, { get(target, key) {
    if (!(key in target)) throw new Error(`Forbidden domain access: ${String(key)}`)
    return Reflect.get(target, key)
  } })

  const result = await loadSync(prisma).syncPlayers([normalized], { provenance: {
    provider: "ea-ratings", endpoint: "https://drop-api.ea.com/rating/ea-sports-fc",
    eaGameVersion: "FC27", gameVersionEvidence: "OFFICIAL_PAGE_CONTEXT",
    gameVersionEvidenceUrl: "https://www.ea.com/games/ea-sports-fc/ratings",
    catalogVersion: null, sourceUpdatedAt: null, observedAt: new Date("2026-09-17T16:46:16.000Z"),
    responseDate: new Date("2026-09-17T16:46:16.000Z"), etag: "etag", lastModified: null,
    locale: "en", gender: 0, requestOffset: 0, requestLimit: 1, totalItems: 1,
  } })

  assert.equal(result.noOp, 1)
  assert.equal(result.updated, 0)
  assert.equal(result.items[0].action, "NO_OP")
  assert.equal(writes.length, 1)
})

test("invalid batch never records provenance, allowing checkpoint to remain blocked", async () => {
  let provenanceWrites = 0
  const prisma = {
    player: { findMany: async () => [] },
    league: { upsert: async () => ({ id: "league" }) },
    club: { upsert: async () => ({ id: "club" }) },
    $transaction: async () => { provenanceWrites++; return { id: "unexpected" } },
  }
  const failures: unknown[] = []
  const result = await loadSync(prisma).syncPlayers([{ ...normalized, name: "" }], {
    onError: ({ error }) => { failures.push(error) },
    provenance: {
      provider: "ea-ratings", endpoint: "endpoint", eaGameVersion: "FC27",
      gameVersionEvidence: "OFFICIAL_PAGE_CONTEXT", gameVersionEvidenceUrl: "context",
      catalogVersion: null, sourceUpdatedAt: null, observedAt: new Date(), responseDate: null,
      etag: null, lastModified: null, locale: "en", gender: 0,
      requestOffset: 0, requestLimit: 1, totalItems: 1,
    },
  })
  assert.equal(result.failed, 1)
  assert.equal(provenanceWrites, 0)
  assert.equal(failures.length, 1)
})

test("attribute-only change updates attributes without touching Player, Club or League", async () => {
  const operations: string[] = []
  const changed: NormalizedPlayer = {
    ...normalized,
    attributes: { ...normalized.attributes, passing: 91 },
  }
  const prisma = new Proxy({
    player: { findMany: async () => [storedRow()] },
    playerAttributes: {
      upsert: async () => { operations.push("attributes"); return { id: "attributes" } },
    },
  }, { get(target, key) {
    if (!(key in target)) throw new Error(`Forbidden domain touch: ${String(key)}`)
    return Reflect.get(target, key)
  } })

  const result = await loadSync(prisma).syncPlayers([changed])
  assert.equal(result.updated, 1)
  assert.deepEqual(result.items[0].changedFields, ["attributes.passing"])
  assert.deepEqual(operations, ["attributes"])
})

test("explicit dry-run reports domain fields without invoking domain or provenance writers", async () => {
  const prisma = new Proxy({
    player: { findMany: async () => [storedRow()] },
  }, { get(target, key) {
    if (!(key in target)) throw new Error(`Dry-run attempted write access: ${String(key)}`)
    return Reflect.get(target, key)
  } })

  const result = await loadSync(prisma).syncPlayers([{ ...normalized, officialOverall: 91 }], {
    dryRun: true,
    provenance: {
      provider: "ea-ratings", endpoint: "endpoint", eaGameVersion: "FC27",
      gameVersionEvidence: "OFFICIAL_PAGE_CONTEXT", gameVersionEvidenceUrl: "context",
      catalogVersion: null, sourceUpdatedAt: null, observedAt: new Date(), responseDate: null,
      etag: null, lastModified: null, locale: "en", gender: 0,
      requestOffset: 0, requestLimit: 1, totalItems: 1,
    },
  })

  assert.equal(result.dryRun, true)
  assert.equal(result.updated, 1)
  assert.equal(result.items[0].action, "UPDATE")
  assert.deepEqual(result.items[0].changedFields, ["officialOverall"])
})

test("league-only change updates League and Club without touching Player", async () => {
  const operations: string[] = []
  const failures: unknown[] = []
  const prisma = new Proxy({
    player: { findMany: async () => [storedRow()] },
    league: { upsert: async () => { operations.push("league"); return { id: "new-league" } } },
    club: { upsert: async () => { operations.push("club"); return { id: "player-club" } } },
  }, { get(target, key) {
    if (!(key in target)) throw new Error(`Unexpected layer touch: ${String(key)}`)
    return Reflect.get(target, key)
  } })

  const result = await loadSync(prisma).syncPlayers([{
    ...normalized,
    league: { externalId: "53", name: "LALIGA EA SPORTS" },
  }], { onError: ({ error }) => { failures.push(error) } })

  assert.deepEqual(failures, [])
  assert.equal(result.updated, 1)
  assert.deepEqual(result.items[0].changedFields, ["league.externalId", "league.name"])
  assert.deepEqual(operations, ["league", "club"])
})

test("automatic CREATE rejects ambiguous legacy slug instead of silently attaching EA identity", async () => {
  const legacy = { ...storedRow(), externalId: null, semanticSnapshot: undefined }
  const prisma = new Proxy({
    player: { findMany: async () => [legacy] },
  }, { get(target, key) {
    if (!(key in target)) throw new Error(`Unexpected write for ambiguous identity: ${String(key)}`)
    return Reflect.get(target, key)
  } })

  const result = await loadSync(prisma).syncPlayers([normalized], {
    dryRun: true,
    requireResolvedCreateContext: true,
  })
  assert.equal(result.conflicts, 1)
  assert.equal(result.items[0].action, "CONFLICT")
  assert.equal(result.items[0].reason, "AMBIGUOUS_LEGACY_SLUG")
})

test("automatic CREATE requires resolvable club and league context", async () => {
  const prisma = { player: { findMany: async () => [] } }
  const result = await loadSync(prisma).syncPlayers([{ ...normalized, club: undefined }], {
    dryRun: true,
    requireResolvedCreateContext: true,
  })
  assert.equal(result.invalid, 1)
  assert.equal(result.items[0].reason, "CREATE_CONTEXT_UNRESOLVED")
})

test("write-mode identity conflict is counted and remains non-persisted", async () => {
  const legacy = { ...storedRow(), externalId: null, semanticSnapshot: undefined }
  const failures: unknown[] = []
  const prisma = new Proxy({
    player: { findMany: async () => [legacy] },
  }, { get(target, key) {
    if (!(key in target)) throw new Error(`Unexpected persistence for conflict: ${String(key)}`)
    return Reflect.get(target, key)
  } })

  const result = await loadSync(prisma).syncPlayers([normalized], {
    requireResolvedCreateContext: true,
    onError: ({ error }) => { failures.push(error) },
  })
  assert.equal(result.conflicts, 1)
  assert.equal(result.failed, 1)
  assert.equal(result.success, 0)
  assert.equal(result.items[0].action, "CONFLICT")
  assert.equal(failures.length, 1)
})

test("provenance migration is additive and Current Club V2 remains outside EA sync", () => {
  const sql = readFileSync("prisma/migrations/20260919000000_ea_catalog_provenance/migration.sql", "utf8")
  assert.doesNotMatch(sql, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+"|INSERT\s+INTO)\b/im)
  assert.doesNotMatch(sql, /ALTER TABLE "(?:Player|Club|League|PlayerApprovedCurrentClub|PlayerCurrentClubProposal|PlayerTransferObservation|PlayerCurrentClubState)"/)
  assert.deepEqual([...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(match => match[1]), [
    "EaCatalogObservation", "EaPlayerCatalogObservation",
  ])

  const source = readFileSync("services/syncPlayers.ts", "utf8")
  for (const forbidden of ["playerApprovedCurrentClub", "playerCurrentClubProposal", "playerTransferObservation", "playerCurrentClubState"]) {
    assert.equal(source.includes(forbidden), false)
  }
  assert.match(source, /plan\.action === "NO_OP"/)
  assert.match(source, /result\.failed === 0/)
})
