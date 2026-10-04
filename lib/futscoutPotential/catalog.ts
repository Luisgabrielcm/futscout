import { Prisma } from "../../app/generated/prisma/client"
import type { GetPlayersParams } from "../playerCatalogParams"

// Same validity and display semantics as readFutscoutPotential. Not futurePeak ordering.
export const careerCeilingSql = Prisma.sql`CASE WHEN e."modelVersion"='potential-model-e-v1'
  AND e.status='EXPERIMENTAL' AND e."inputOverall" BETWEEN 1 AND 99
  AND e."potentialRaw" BETWEEN 1 AND 99
  THEN FLOOR(GREATEST(e."inputOverall",e."potentialRaw") + 0.5)::integer END`

export function potentialWhere(min?: number, max?: number): Prisma.PlayerWhereInput {
  const constraints: Prisma.PlayerFutscoutPotentialEstimateWhereInput[] = []
  if (min !== undefined) constraints.push({ OR: [
    { inputOverall: { gte: min - 0.5 } }, { potentialRaw: { gte: min - 0.5 } },
  ] })
  if (max !== undefined) constraints.push({ inputOverall: { lt: max + 0.5 }, potentialRaw: { lt: max + 0.5 } })
  return { currentFutscoutPotential: { is: { estimate: { is: {
    modelVersion: "potential-model-e-v1", status: "EXPERIMENTAL",
    inputOverall: { gte: 1, lte: 99 }, potentialRaw: { gte: 1, lte: 99 }, AND: constraints,
  } } } } }
}

// Only ranking needs SQL: Prisma cannot order by the derived rounded career ceiling.
// All candidates/filtering/pagination stay in PostgreSQL; only page IDs leave it.
export function potentialPageSql(params: GetPlayersParams, scope?: { clubId?: string; nationalities?: string[] }, birthDate?: Date) {
  const conditions = [Prisma.sql`a.id IS NOT NULL`]
  if (scope?.clubId) conditions.push(Prisma.sql`p."clubId"=${scope.clubId}`)
  if (scope?.nationalities) conditions.push(scope.nationalities.length
    ? Prisma.sql`p.nationality IN (${Prisma.join(scope.nationalities)})` : Prisma.sql`FALSE`)
  if (params.search) {
    // Match the existing Prisma contains/ILIKE semantics, including %/_ patterns.
    const pattern = `%${params.search}%`
    conditions.push(Prisma.sql`(p.name ILIKE ${pattern} OR p.nationality ILIKE ${pattern} OR c.name ILIKE ${pattern})`)
  }
  if (params.position) conditions.push(Prisma.sql`(p.position=${params.position} OR p."secondaryPosition"=${params.position} OR ${params.position}=ANY(p."secondaryPositions"))`)
  if (params.league) conditions.push(Prisma.sql`l.slug=${params.league}`)
  if (birthDate) conditions.push(Prisma.sql`p."dateOfBirth">=${birthDate}`)
  if (params.minOverall !== undefined) conditions.push(Prisma.sql`p."officialOverall">=${params.minOverall}`)
  if (params.maxValue !== undefined) conditions.push(Prisma.sql`p."marketValue"<=${BigInt(params.maxValue)}`)
  for (const [key, column] of [["minPace", "pace"], ["minShooting", "shooting"], ["minPassing", "passing"], ["minDribbling", "dribbling"], ["minDefending", "defending"], ["minPhysical", "physical"]] as const) {
    if (params[key] !== undefined) conditions.push(Prisma.sql`a.${Prisma.raw(`"${column}"`)}>=${params[key]}`)
  }
  if (params.playStyle) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "PlayerPlayStyle" ps JOIN "PlayStyle" s ON s.id=ps."playStyleId"
    WHERE ps."playerId"=p.id AND s.code=${params.playStyle}${params.playStyleLevel ? Prisma.sql` AND ps.level=${params.playStyleLevel}` : Prisma.empty})`)
  const bounds = []
  if (params.minPotential !== undefined) bounds.push(Prisma.sql`score>=${params.minPotential}`)
  if (params.maxPotential !== undefined) bounds.push(Prisma.sql`score<=${params.maxPotential}`)
  return Prisma.sql`WITH candidates AS (
    SELECT p.id,p.name,p."officialOverall",${careerCeilingSql} AS score
    FROM "Player" p LEFT JOIN "Club" c ON c.id=p."clubId" LEFT JOIN "League" l ON l.id=c."leagueId"
    JOIN "PlayerAttributes" a ON a."playerId"=p.id
    LEFT JOIN "PlayerFutscoutPotentialCurrent" cur ON cur."playerId"=p.id
    LEFT JOIN "PlayerFutscoutPotentialEstimate" e ON e.id=cur."estimateId" AND e."playerId"=p.id
    WHERE ${Prisma.join(conditions, " AND ")})
    SELECT id,score FROM candidates ${bounds.length ? Prisma.sql`WHERE ${Prisma.join(bounds, " AND ")}` : Prisma.empty}
    ORDER BY score ${params.sort === "potential-asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`} NULLS LAST,
    "officialOverall" DESC,name ASC,id ASC
    LIMIT ${params.pageSize ?? 24} OFFSET ${((params.page ?? 1) - 1) * (params.pageSize ?? 24)}`
}
