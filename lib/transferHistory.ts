import { createHash } from "node:crypto"
import { compareTransferObservations, parseTransferResponse, transferDateState } from "./transferObservations"
import type { NormalizedTransferObservation } from "../types/transferObservation"
import type { TransferHistoryInput, TransferObservationRecord } from "../types/currentClub"

// Canonical JSON recursively sorts object keys, but deliberately preserves array order.
export function transferEvidenceHash(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, canonical(x)]))
    return v
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")
}

export function requireConfirmedTransferPlayer(p: TransferHistoryInput["player"]) {
  if (!p.playerId || p.identityConfirmed !== true || p.ownershipUnique !== true || !Number.isSafeInteger(p.providerPlayerId) || p.providerPlayerId < 1) {
    throw new Error("CONFIRMED_UNIQUE_TRANSFER_IDENTITY_REQUIRED")
  }
}

export function prepareTransferHistory(input: TransferHistoryInput, now: Date): TransferObservationRecord[] {
  requireConfirmedTransferPlayer(input.player)
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(Date.parse(input.fetchedAt)) || Date.parse(input.fetchedAt) > now.getTime()) throw new Error("INVALID_OBSERVATION_CLOCK")
  if (input.events.length > 1000) throw new Error("TRANSFER_EVENT_LIMIT")
  return input.events.map(t => {
    if (t.provider !== "api-football" || t.providerPlayerId !== input.player.providerPlayerId ||
        [t.sourceIndex, t.sourceGroup, t.sourceOrder].some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("INVALID_PROVIDER_IDENTITY")
    // Revalidate external/raw facts; no caller-supplied hash, parsed date or kind is trusted.
    const parsed = parseTransferResponse({ errors: [], results: 1, response: [{ player: { id: t.providerPlayerId, name: t.providerPlayerName },
      transfers: [{ date: t.dateRaw, type: t.typeRaw, teams: { out: { id: t.fromProviderTeamId, name: t.fromTeamNameRaw },
        in: { id: t.toProviderTeamId, name: t.toTeamNameRaw } } }] }] }, t.providerPlayerId, now).transfers[0]
    const facts = { provider: t.provider, providerPlayerId: t.providerPlayerId, providerPlayerNameRaw: t.providerPlayerName,
      dateRaw: parsed.dateRaw, fromProviderTeamId: parsed.fromProviderTeamId, fromTeamNameRaw: parsed.fromTeamNameRaw,
      toProviderTeamId: parsed.toProviderTeamId, toTeamNameRaw: parsed.toTeamNameRaw, typeRaw: parsed.typeRaw }
    const contentHash = transferEvidenceHash({ payloadVersion: 1, ...facts })
    return { ...facts, id: "pto_" + transferEvidenceHash([input.player.playerId, contentHash]), playerId: input.player.playerId,
      transferDate: parsed.transferDate, payloadVersion: 1, contentHash,
      // A grouping hint, NOT an authoritative event ID or a uniqueness constraint.
      logicalEventKey: transferEvidenceHash([t.provider, t.providerPlayerId, parsed.dateRaw, parsed.fromProviderTeamId, parsed.toProviderTeamId]),
      possibleRevisionHashes: [], fetchedAt: new Date(input.fetchedAt).toISOString(), createdAt: now.toISOString(),
      sourceIndex: t.sourceIndex, sourceGroup: t.sourceGroup, sourceOrder: t.sourceOrder,
      warnings: parsed.warnings.filter(w => w !== "FUTURE_TRANSFER") }
  })
}

export function observationEvent(row: TransferObservationRecord, now: Date): NormalizedTransferObservation {
  const kind = row.typeRaw?.trim().toLowerCase()
  return { ...row, providerPlayerName: row.providerPlayerNameRaw, dateState: transferDateState(row.dateRaw, now),
    kindHint: kind === "loan" ? "LOAN_HINT" : kind === "return from loan" ? "RETURN_FROM_LOAN_HINT" : "UNKNOWN_TRANSFER_KIND" }
}

export function planTransferObservationAppend(existing: readonly TransferObservationRecord[], incoming: readonly TransferObservationRecord[], now: Date) {
  const seen = [...existing], append: TransferObservationRecord[] = [], duplicateHashes: string[] = []
  for (const row of incoming) {
    const samePlayer = seen.filter(x => x.playerId === row.playerId && x.providerPlayerId === row.providerPlayerId && x.provider === row.provider)
    if (samePlayer.some(x => x.contentHash === row.contentHash)) { duplicateHashes.push(row.contentHash); continue }
    const possibleRevisionHashes = samePlayer.filter(x => compareTransferObservations(observationEvent(x, now), observationEvent(row, now)) === "POSSIBLE_REVISION" ||
      // A corrected provider player name also deserves a revision trail, not silent replacement.
      x.logicalEventKey === row.logicalEventKey).map(x => x.contentHash).sort()
    const next = { ...row, possibleRevisionHashes: [...new Set(possibleRevisionHashes)] }
    seen.push(next); append.push(next)
  }
  return { append, duplicateHashes }
}
