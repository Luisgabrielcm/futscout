import type { NormalizedTransferObservation, TransferClub, TransferDateState, TransferTeamResolution } from "../types/transferObservation"

export class TransferObservationError extends Error {
  constructor(readonly code: string) { super(code); this.name = "TransferObservationError" }
}
export const transferRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
export const positiveTransferId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0
const fail = (): never => { throw new TransferObservationError("MALFORMED_TRANSFER_PAYLOAD") }
function nullableText(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (typeof v !== "string" || v.length > 2000) return fail()
  return v // Preserve whitespace, spelling, currency and semantics verbatim.
}
function team(v: unknown) {
  if (v === undefined || v === null) return { id: null, name: null }
  if (!transferRecord(v)) return fail()
  if (v.id !== undefined && v.id !== null && !positiveTransferId(v.id)) return fail()
  return { id: (v.id ?? null) as number | null, name: nullableText(v.name) }
}
export function transferDateState(raw: string | null, now: Date): TransferDateState {
  if (!Number.isFinite(now.getTime())) throw new TransferObservationError("INVALID_CLOCK")
  if (raw === null || !raw.trim()) return "MISSING_DATE"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw) return "INVALID_DATE"
  return raw > now.toISOString().slice(0, 10) ? "FUTURE_TRANSFER" : "VALID"
}

// Entire response identity is checked before any events can escape this pure parser.
export function parseTransferResponse(body: unknown, requestedPlayerId: number, now: Date) {
  if (!positiveTransferId(requestedPlayerId) || !Number.isFinite(now.getTime())) throw new TransferObservationError("INVALID_TRANSFER_INPUT")
  if (!transferRecord(body) || !Array.isArray(body.response) || body.response.length > 20 ||
      body.results !== body.response.length || (!transferRecord(body.errors) && !Array.isArray(body.errors)) ||
      Object.keys(body.errors).length) return fail()
  if (body.paging !== undefined && (!transferRecord(body.paging) || body.paging.current !== 1 || body.paging.total !== 1)) {
    throw new TransferObservationError("UNEXPECTED_TRANSFER_PAGINATION")
  }
  const groups = body.response.map(group => {
    if (!transferRecord(group) || !transferRecord(group.player) || group.player.id !== requestedPlayerId) {
      throw new TransferObservationError("INVALID_PROVIDER_IDENTITY")
    }
    const name = nullableText(group.player.name)
    if (!name?.trim() || !Array.isArray(group.transfers)) return fail()
    return { name, transfers: group.transfers }
  })
  if (groups.reduce((n, g) => n + g.transfers.length, 0) > 1000) throw new TransferObservationError("TRANSFER_EVENT_LIMIT")
  let index = 0
  const transfers: NormalizedTransferObservation[] = groups.flatMap((g, sourceGroup) => g.transfers.map((raw, sourceOrder) => {
    if (!transferRecord(raw) || (raw.teams != null && !transferRecord(raw.teams))) return fail()
    const teams = raw.teams as Record<string, unknown> | null | undefined
    const from = team(teams?.out), to = team(teams?.in), dateRaw = nullableText(raw.date), typeRaw = nullableText(raw.type)
    const dateState = transferDateState(dateRaw, now)
    const kind = typeRaw?.trim().toLowerCase()
    const warnings = [dateState !== "VALID" ? dateState : null, from.id === null ? "MISSING_FROM_TEAM_ID" : null,
      to.id === null ? "MISSING_TO_TEAM_ID" : null, typeRaw === null ? "MISSING_TRANSFER_TYPE" : null].filter((v): v is string => v !== null)
    return { provider: "api-football", providerPlayerId: requestedPlayerId, providerPlayerName: g.name,
      transferDate: dateState === "VALID" || dateState === "FUTURE_TRANSFER" ? dateRaw : null, dateRaw, dateState,
      fromProviderTeamId: from.id, fromTeamNameRaw: from.name, toProviderTeamId: to.id, toTeamNameRaw: to.name, typeRaw,
      kindHint: kind === "loan" ? "LOAN_HINT" : kind === "return from loan" ? "RETURN_FROM_LOAN_HINT" : "UNKNOWN_TRANSFER_KIND",
      sourceIndex: index++, sourceGroup, sourceOrder, warnings }
  }))
  const namesRaw = [...new Set(groups.map(g => g.name))]
  return { provider: "api-football" as const, requestedPlayerId,
    returnedPlayerIdentity: groups.length ? { id: requestedPlayerId, namesRaw } : null,
    transfers, chronologicalAsc: orderTransfers(transfers, "asc"), chronologicalDesc: orderTransfers(transfers, "desc"),
    validation: groups.length ? "VALID_IDENTITY" as const : "EMPTY_NO_EVIDENCE" as const,
    warnings: [...new Set([...transfers.flatMap(t => t.warnings), ...(namesRaw.length > 1 ? ["MULTIPLE_PROVIDER_NAMES"] : []),
      ...(!transfers.length ? ["NO_TRANSFER_EVIDENCE"] : [])])] }
}

export function orderTransfers(events: readonly NormalizedTransferObservation[], order: "asc" | "desc") {
  return [...events].sort((a, b) => {
    if (a.transferDate === null || b.transferDate === null) return a.transferDate === b.transferDate ? a.sourceIndex - b.sourceIndex : a.transferDate === null ? 1 : -1
    const cmp = a.transferDate < b.transferDate ? -1 : a.transferDate > b.transferDate ? 1 : 0
    return (order === "asc" ? cmp : -cmp) || a.sourceIndex - b.sourceIndex
  })
}
export function transferCanonicalKey(t: NormalizedTransferObservation) {
  return JSON.stringify([t.provider, t.providerPlayerId, t.dateRaw, t.fromProviderTeamId, t.fromTeamNameRaw,
    t.toProviderTeamId, t.toTeamNameRaw, t.typeRaw])
}
export function compareTransferObservations(a: NormalizedTransferObservation, b: NormalizedTransferObservation) {
  if (transferCanonicalKey(a) === transferCanonicalKey(b)) return "EXACT_DUPLICATE" as const
  if (a.providerPlayerId !== b.providerPlayerId || !a.transferDate || a.transferDate !== b.transferDate) return "DISTINCT_EVENT" as const
  // Renamed teams or corrected type with same IDs can be revisions. Unknown IDs are ambiguous.
  const compatible = (x: number | null, y: number | null) => x === null || y === null || x === y
  return compatible(a.fromProviderTeamId, b.fromProviderTeamId) && compatible(a.toProviderTeamId, b.toProviderTeamId)
    ? "POSSIBLE_REVISION" as const : "DISTINCT_EVENT" as const
}
export function resolveTransferTeamObservation(providerTeamId: number | null, rawName: string | null, clubs: readonly TransferClub[]): TransferTeamResolution {
  const matches = positiveTransferId(providerTeamId) ? clubs.filter(c => c.apiFootballId === providerTeamId) : []
  return { providerTeamId, rawName, status: matches.length > 1 ? "CONFLICT" : matches.length === 1 ? "RESOLVED" : "UNKNOWN_TEAM",
    clubId: matches.length === 1 ? matches[0].id : null }
}
