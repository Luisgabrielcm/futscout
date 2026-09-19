import "dotenv/config"

import { prisma } from "../lib/prisma"
import { mapEARatingsPlayer } from "../mappers/mapEARatingsPlayer"
import { normalizePlayer } from "../normalizers/normalizePlayer"
import { EARatingsProvider } from "../providers/eaRatingsProvider"
import { planEaGoalkeeperAttributes, type EaGoalkeeperPlayerState } from "../services/eaGoalkeeperAttributes"
import type { GoalkeeperAttributeValues } from "../types/goalkeeperAttributes"
import { parseEaGoalkeeperAuditOptions } from "./eaGoalkeeperAttributesRunnerOptions"

async function main() {
  const options = parseEaGoalkeeperAuditOptions(process.argv.slice(2))
  const provider = new EARatingsProvider()
  let offset = options.offset
  let requests = 0
  const reports = []

  for (let batchIndex = 0; batchIndex < options.maxBatches; batchIndex++) {
    requests++
    const batch = await provider.getPlayersBatch({ offset, limit: options.limit, locale: "en", gender: 0 })
    const normalized = batch.players.map((player) => normalizePlayer(mapEARatingsPlayer(player)))
    const goalkeepers = normalized.filter((player) => player.position === "GOL")
    const rows = await prisma.player.findMany({
      where: { externalId: { in: goalkeepers.map((player) => player.externalId) } },
      select: { id: true, externalId: true, position: true, goalkeeperAttributes: true },
    })
    const current = new Map(rows.flatMap((row) => row.externalId ? [[row.externalId, {
      playerId: row.id,
      externalId: row.externalId,
      position: row.position as EaGoalkeeperPlayerState["position"],
      attributes: row.goalkeeperAttributes ? {
        diving: row.goalkeeperAttributes.diving,
        handling: row.goalkeeperAttributes.handling,
        kicking: row.goalkeeperAttributes.kicking,
        positioning: row.goalkeeperAttributes.positioning,
        reflexes: row.goalkeeperAttributes.reflexes,
      } satisfies GoalkeeperAttributeValues : null,
    } satisfies EaGoalkeeperPlayerState] as const] : []))
    const plans = goalkeepers.map((player) => planEaGoalkeeperAttributes({
      externalId: player.externalId,
      position: player.position,
      incoming: player.goalkeeperAttributes,
      current: current.get(player.externalId) ?? null,
    }))
    const actions = Object.fromEntries(["CREATE", "UPDATE", "NO_OP", "INVALID", "CONFLICT"].map(
      (action) => [action, plans.filter((plan) => plan.action === action).length],
    ))
    reports.push({
      offset,
      limit: options.limit,
      received: batch.players.length,
      primaryGoalkeepers: goalkeepers.length,
      totalItems: batch.totalItems,
      observedAt: batch.provenance.observedAt,
      sourceUpdatedAt: batch.provenance.sourceUpdatedAt,
      actions,
      plans,
    })
    offset += batch.players.length
    if (batch.players.length < options.limit || offset >= batch.totalItems) break
  }

  console.log(JSON.stringify({
    mode: "dry-run",
    writesExecuted: 0,
    requests,
    initialOffset: options.offset,
    scannedOffset: offset,
    reports,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}).finally(async () => prisma.$disconnect())
