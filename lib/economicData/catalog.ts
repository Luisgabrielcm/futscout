import { Prisma } from "../../app/generated/prisma/client"

// Mirrors readEconomicMarketValue: EUR, HIGH identity, explicit valid amount.
export function marketValueWhere(min?: number, max?: number): Prisma.PlayerWhereInput {
  return { economicCurrents: { some: { field: "MARKET_VALUE", observation: { is: { state: { is: {
    field: "MARKET_VALUE", context: "REAL_WORLD", presence: "VALUE", status: "VALID",
    confidence: "HIGH", matchState: "MATCHED", currency: "EUR",
    amount: { gte: min ?? 0, lte: max ?? Number.MAX_SAFE_INTEGER },
  } } } } } } }
}

// Scalar current lookup uses the existing (playerId, field) primary key.
export const marketValueSql = Prisma.sql`(SELECT s.amount FROM "PlayerEconomicCurrent" ec
  JOIN "PlayerEconomicObservation" o ON o.id=ec."observationId" AND o."playerId"=ec."playerId" AND o.field=ec.field
  JOIN "PlayerEconomicState" s ON s.id=o."stateId" AND s."playerId"=o."playerId" AND s.field=o.field
  WHERE ec."playerId"=p.id AND ec.field='MARKET_VALUE' AND s.field='MARKET_VALUE'
    AND s.context='REAL_WORLD' AND s.presence='VALUE' AND s.status='VALID'
    AND s.confidence='HIGH' AND s."matchState"='MATCHED' AND s.currency='EUR'
    AND s.amount BETWEEN 0 AND 9007199254740991)`

export const economicBargainsSql = Prisma.sql`SELECT p.id FROM "Player" p
  JOIN "PlayerAttributes" a ON a."playerId"=p.id
  WHERE p."officialOverall">=80 AND ${marketValueSql}<=50000000
  ORDER BY p."officialOverall" DESC,${marketValueSql} ASC,p.name ASC,p.id ASC LIMIT 4`
