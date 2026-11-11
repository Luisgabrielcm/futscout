import type { ManualEconomic } from "../services/adminEconomic.server"
import type { ResearchEconomic } from "../services/researchEconomicRead.server"
import type { ClausePayload } from "./adminEconomic"
import { formatResearchContract, type ResearchContract } from "./researchEconomic"

export type PublicEconomicOverlay = { contract?: ResearchContract; clause?: ClausePayload }

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
