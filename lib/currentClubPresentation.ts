import type { CurrentClubEvaluation } from "../types/currentClub"
import type { NormalizedTransferObservation, TransferClub } from "../types/transferObservation"
import { orderTransfers, resolveTransferTeamObservation } from "./transferObservations"

type ClubLink = { id: string; name: string; slug: string }
// Future DTO, deliberately NOT wired into existing public routes until schema/product promotion.
export function separatePlayerClubDimensions(eaCatalogClub: ClubLink | null, evaluated: CurrentClubEvaluation | null,
  clubs: readonly ClubLink[], approvedRealLifeClub: ClubLink | null = null) {
  const candidate = evaluated?.currentClubCandidate
  // Even a corroborated engine result is not a separately authorized projection.
  return { eaCatalogClub, realLifeClub: approvedRealLifeClub, proposedRealLifeClub: candidate ? clubs.find(c => c.id === candidate.clubId) ?? null : null,
    decision: evaluated?.decision ?? "INSUFFICIENT_EVIDENCE", source: "futscout-derived", writable: false as const }
}
export function transferTimeline(events: readonly NormalizedTransferObservation[], clubs: readonly (TransferClub & { slug: string })[], locale: "pt" | "en") {
  const team = (id: number | null, name: string | null) => {
    const resolved = resolveTransferTeamObservation(id, name, clubs)
    const club = resolved.clubId ? clubs.find(c => c.id === resolved.clubId) : null
    return { providerTeamId: id, rawName: name, label: club?.name ?? name ?? (locale === "pt" ? "Não informado" : "Not available"),
      href: club ? `/${locale}/clubes/${encodeURIComponent(club.slug)}` : null, resolution: resolved.status }
  }
  return orderTransfers(events, "desc").map(e => ({ date: e.transferDate, dateRaw: e.dateRaw,
    from: team(e.fromProviderTeamId, e.fromTeamNameRaw), to: team(e.toProviderTeamId, e.toTeamNameRaw),
    typeRaw: e.typeRaw, warnings: [...e.warnings], sourceIndex: e.sourceIndex }))
}
