import "server-only"
import { prisma } from "../lib/prisma"
import { parseResearchPayload, type ResearchContract, type ResearchClassification } from "../lib/researchEconomic"
import type { ClausePayload, SalaryPayload } from "../lib/adminEconomic"

export type ResearchEconomic = {
  salary?: { value: SalaryPayload; classification: ResearchClassification; sourceUrl: string; sourcePublishedOn: string | null }
  contract?: ResearchContract
  clause?: ClausePayload
}

export async function readResearchEconomics(playerIds: readonly string[]): Promise<Map<string, ResearchEconomic>> {
  const result = new Map<string, ResearchEconomic>()
  const ids = [...new Set(playerIds)]
  if (!ids.length) return result
  try {
    const rows = await prisma.$queryRaw<Array<{ playerId: string; field: "SALARY" | "CONTRACT" | "CLAUSE";
      payload: unknown; classification: ResearchClassification; sourceUrl: string; sourcePublishedOn: string | null }>>`
      SELECT "playerId",field,payload,classification,"sourceUrl","sourcePublishedOn"
      FROM "ResearchEconomicPublic" WHERE "playerId"=ANY(${ids}::text[])`
    for (const row of rows) {
      try {
        const payload = parseResearchPayload(row.field, "PUBLISH", row.payload)
        const entry = result.get(row.playerId) ?? {}
        if (row.field === "SALARY") entry.salary = { value: payload as SalaryPayload,
          classification: row.classification, sourceUrl: row.sourceUrl, sourcePublishedOn: row.sourcePublishedOn }
        if (row.field === "CONTRACT") entry.contract = payload as ResearchContract
        if (row.field === "CLAUSE") entry.clause = payload as ClausePayload
        result.set(row.playerId, entry)
      } catch { /* Invalid research stays private. */ }
    }
  } catch (error) {
    // The site remains readable before installation of the additive research migration.
    const code = (error as { code?: string; meta?: { code?: string } }).meta?.code ?? (error as { code?: string }).code
    if (code !== "42P01" && code !== "P2021") throw error
  }
  return result
}
