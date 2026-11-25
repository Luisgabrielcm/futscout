import type { ManualEconomic } from "../services/adminEconomic.server"
import type { ResearchEconomic } from "../services/researchEconomicRead.server"
import type { ClausePayload } from "./adminEconomic"
import { formatResearchContract, type ResearchContract } from "./researchEconomic"
import type { ClubContexts } from "./clubContexts"
import type { JointTransferViews } from "./jointTransferContexts"

export type PublicEconomicOverlay = { contract?: ResearchContract; clause?: ClausePayload }

/** Display-only GAME rule. Never overwrite the REAL economic record or infer free agency from a missing club. */
export function zeroGameFreeAgentEconomics(player: {
  transferContexts?: JointTransferViews; clubContexts?: ClubContexts; transferContext?: "GAME" | "REAL"
}, context = player.transferContext ?? "GAME"): boolean {
  if (context !== "GAME") return false
  const views = player.transferContexts
  if (views?.game) return views.game.clubState === "FREE_AGENT" && views.game.playingClub === null &&
    views.real?.clubState === "CLUB" && views.real.playingClub !== null
  return player.clubContexts?.game.status === "NG_FA" && player.clubContexts.real?.status === "CLUB" && player.clubContexts.real.club !== null
}

export function publicEconomicOverlay(manual: ManualEconomic | undefined, research: ResearchEconomic | undefined): PublicEconomicOverlay {
  return {
    contract: manual?.contract ? manual.contract.until ? { until: manual.contract.until, precision: "DAY" } : undefined : research?.contract,
    clause: manual?.clause ?? research?.clause,
  }
}

export function publicContractUntil(overlay: PublicEconomicOverlay | undefined, locale: "pt" | "en") {
  return overlay?.contract ? formatResearchContract(overlay.contract, locale) : "—"
}

export function publicClause(overlay: PublicEconomicOverlay | undefined, locale: "pt" | "en") {
  const clause = overlay?.clause
  if (clause?.status === "YES" && clause.amount && clause.currency)
    return new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-GB", { style: "currency", currency: clause.currency }).format(Number(clause.amount))
  return clause?.status === "NO" ? locale === "pt" ? "Sem cláusula" : "No clause" : "—"
}
