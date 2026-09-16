import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import type { NormalizedPlayer } from "../../../types/normalizedPlayer"
import { separatePlayerClubDimensions } from "../../../lib/currentClubPresentation"

test("actual EA sync with fake storage keeps real-life B intact while EA/catalog becomes A", async () => {
  const realState = Object.freeze({ playerId: "player", clubId: "real-B", providerTeamId: 202, status: "APPROVED" })
  const pendingProposal = Object.freeze({ id: "proposal-C", playerId: "player", proposedClubId: "real-C", status: "PROPOSED" })
  const legacyPlayer: Record<string, unknown> = { id: "player", slug: "example", externalId: "ea-id", clubId: "old-ea" }
  const operations: string[] = []
  const prisma = new Proxy({
    league: { upsert: async () => { operations.push("EA league"); return { id: "ea-league" } } },
    club: { upsert: async () => { operations.push("EA club"); return { id: "ea-A" } } },
    player: {
      findMany: async () => [structuredClone(legacyPlayer)],
      update: async ({ data }: { data: Record<string, unknown> }) => { operations.push("EA player"); assert.equal("currentClubState" in data, false); Object.assign(legacyPlayer, data); return legacyPlayer },
    },
    playerAttributes: { upsert: async () => { operations.push("EA attributes"); return { id: "attributes" } } },
  }, { get(target, key) { if (!(key in target)) throw new Error(`Forbidden model: ${String(key)}`); return Reflect.get(target, key) } })
  const failures: unknown[] = []
  const eaSync = loadCatalogModule<{ syncPlayers(players: NormalizedPlayer[], options: { onError(context: { error: unknown }): void }): Promise<{ success: number; failed: number }> }>("services/syncPlayers.ts", {
    "../lib/prisma": { prisma }, "../lib/databaseRetry": { databaseRetry: <T>(fn: () => Promise<T>) => fn() },
  })
  const result = await eaSync.syncPlayers([{ externalId: "ea-id", source: "ea", name: "Example", position: "MC", secondaryPositions: [],
    officialOverall: 80, attributes: Object.fromEntries(("pace acceleration sprintSpeed shooting positioning finishing shotPower longShots volleys penalties " +
      "passing vision crossing freeKickAccuracy shortPassing longPassing curve dribbling agility balance reactions ballControl dribblingStat composure " +
      "defending interceptions headingAccuracy defensiveAwareness standingTackle slidingTackle physical jumping stamina strength aggression").split(" ").map(key => [key, 70])),
    playStyles: [], club: { name: "EA A", externalId: "ea-club" }, league: { name: "EA League", externalId: "ea-league-id" } }], { onError: ({ error }) => { failures.push(error) } })
  assert.deepEqual(failures, [])
  assert.equal(result.success, 1); assert.equal(result.failed, 0)
  assert.equal(legacyPlayer.clubId, "ea-A"); assert.equal(realState.clubId, "real-B")
  assert.equal(pendingProposal.proposedClubId, "real-C"); assert.equal(pendingProposal.status, "PROPOSED")
  assert.deepEqual(operations, ["EA league", "EA club", "EA player", "EA attributes"])
  const dto = separatePlayerClubDimensions({ id: "ea-A", name: "EA A", slug: "ea-a" }, null, [], { id: "real-B", name: "Real B", slug: "real-b" })
  assert.equal(dto.eaCatalogClub?.id, "ea-A"); assert.equal(dto.realLifeClub?.id, "real-B")
})

test("prepared migration adds isolated tables, never changes legacy Player/Club/PlayerTransfer columns or data", () => {
  const sql = readFileSync("prisma/migrations/20260916000000_transfer_observations_current_club/migration.sql", "utf8")
  assert.doesNotMatch(sql, /\b(?:DROP|ALTER|INSERT|UPDATE\s+"|DELETE\s+FROM|TRUNCATE\s+TABLE)\b/i)
  assert.deepEqual([...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(m => m[1]), ["PlayerTransferObservation", "PlayerCurrentClubState"])
  assert.match(sql, /BEFORE UPDATE OR DELETE/); assert.match(sql, /BEFORE TRUNCATE/)
  assert.match(sql, /transfer_observation_content_key/)
  const schema = readFileSync("prisma/schema.prisma", "utf8")
  assert.match(schema, /currentClubState\s+PlayerCurrentClubState\?/)
  for (const path of ["services/playerService.ts", "services/clubService.ts", "services/syncPlayers.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /playerCurrentClubState|playerTransferObservation|include:\s*\{\s*currentClubState/)
  }
})
