import assert from "node:assert/strict"
import test from "node:test"
import { cache } from "react"

import { isVerifiedLegacyClubAlias, resolveEaClubSyncIdentity } from "../../../services/clubIdentityAliases"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import * as aliases from "../../../services/clubIdentityAliases"

const placeholder = { id: "placeholder", externalId: "mock-bayer-leverkusen", apiFootballId: null, leagueId: "bundesliga" }
const populated = { id: "populated", externalId: "32", apiFootballId: 168, leagueId: "bundesliga" }

test("Bayer legacy route alias requires the exact placeholder, EA identity, provider ID and league", () => {
  assert.equal(isVerifiedLegacyClubAlias({ requestedSlug: "bayer-leverkusen", placeholder, target: populated }), true)
  assert.equal(isVerifiedLegacyClubAlias({ requestedSlug: "bayer-leverkusen", placeholder, target: { ...populated, externalId: "168" } }), false)
  assert.equal(isVerifiedLegacyClubAlias({ requestedSlug: "bayer-leverkusen", placeholder, target: { ...populated, apiFootballId: 32 } }), false)
  assert.equal(isVerifiedLegacyClubAlias({ requestedSlug: "bayer-leverkusen", placeholder, target: { ...populated, leagueId: "other" } }), false)
  assert.equal(isVerifiedLegacyClubAlias({ requestedSlug: "leverkusen", placeholder, target: populated }), false)
})

test("EA sync resolves Bayer by EA externalId before the occupied legacy slug and preserves provider identity", () => {
  assert.deepEqual(resolveEaClubSyncIdentity({ eaExternalId: "32", identityOwner: populated,
    slugOwner: { id: "placeholder", externalId: "mock-bayer-leverkusen" } }), { kind: "MATCH", clubId: "populated" })
  assert.deepEqual(resolveEaClubSyncIdentity({ eaExternalId: "168", identityOwner: null,
    slugOwner: { id: "placeholder", externalId: "mock-bayer-leverkusen" } }),
  { kind: "CONFLICT", reason: "SLUG_OWNED_BY_DIFFERENT_IDENTITY" })
  assert.deepEqual(resolveEaClubSyncIdentity({ eaExternalId: null, identityOwner: null, slugOwner: null }),
    { kind: "CONFLICT", reason: "EA_ID_MISSING" })
})

test("the Bayer legacy club URL reads the populated roster without changing either Club row", async () => {
  const placeholderRow = { ...placeholder, name: "Bayer Leverkusen", slug: "bayer-leverkusen", imageUrl: null,
    league: { id: "bundesliga", name: "Bundesliga", slug: "bundesliga" }, _count: { players: 0 } }
  const populatedRow = { ...populated, name: "Leverkusen", slug: "leverkusen", imageUrl: null,
    league: { id: "bundesliga", name: "Bundesliga", slug: "bundesliga" }, _count: { players: 26 } }
  const lookups: unknown[] = []
  const rosterQueries: unknown[] = []
  const populatedRoster = Array.from({ length: 26 }, (_, index) => ({ id: `player-${index + 1}`, clubId: "populated" }))
  const service = loadCatalogModule<typeof import("../../../services/clubService")>("services/clubService.ts", {
    "server-only": {}, react: { cache }, "../lib/prisma": { prisma: {
      club: { findUnique: async (args: unknown) => {
        lookups.push(args)
        const where = (args as { where: Record<string, unknown> }).where
        return "slug" in where ? placeholderRow : populatedRow
      } },
      player: { findMany: async (args: unknown) => { rosterQueries.push(args); return populatedRoster } },
    } }, "../lib/directoryCatalogParams": {}, "./playerService": {}, "./clubIdentityAliases": aliases,
    "../lib/clubRating": {}, "./brandAssetReadService": { getBrandAssetsForEntities: async () => ({ clubs: new Map(), leagues: new Map() }) },
  })

  const result = await service.getClubBySlug("bayer-leverkusen")
  assert.equal(result?.id, "populated")
  assert.equal(result?.slug, "bayer-leverkusen")
  assert.equal(result?._count.players, 26)
  const roster = await service.getClubRoster(result!.id)
  assert.equal(roster.length, 26)
  assert.equal((rosterQueries[0] as { where: { clubId: string } }).where.clubId, "populated")
  assert.deepEqual(JSON.parse(JSON.stringify(lookups.map(args => (args as { where: unknown }).where))), [
    { slug: "bayer-leverkusen" }, { apiFootballId: 168 },
  ])
})
