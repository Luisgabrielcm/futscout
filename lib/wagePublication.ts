// Public presentation contract. No file-system, experimental or provider payload imports.
import { isWageClassification, legacyWageClassification, type WageClassification } from "./wageClassification"
export type PublishedWage = Readonly<{
  playerId: string
  weeklyEur: number
  kind: "ESTIMATE" | "HISTORICAL_REFERENCE" | "MANUAL" | "RESEARCHED"
  source: "FutScout" | "FootyStats" | "Official" | "External"
  sourceName?: string
  sourceUrl?: string
  classification?: WageClassification
  period: string | null
  confidence: "LOW"
  contractVerified: false
}>

export function wagePresentation(wage: PublishedWage | undefined, playerId: string, locale: "pt" | "en") {
  if (!wage || wage.playerId !== playerId || !Number.isFinite(wage.weeklyEur) || wage.weeklyEur <= 0 ||
      wage.weeklyEur > Number.MAX_SAFE_INTEGER || wage.confidence !== "LOW" || wage.contractVerified !== false ||
      !["ESTIMATE", "HISTORICAL_REFERENCE", "MANUAL", "RESEARCHED"].includes(wage.kind)) return null
  const classification = wage.classification ?? legacyWageClassification(wage.kind === "HISTORICAL_REFERENCE" ? "RECENT_HISTORICAL_REFERENCE" : "WAGE_V2")
  if (!isWageClassification(classification)) return null
  const official = classification.method === "OFFICIAL_REFERENCE"
  const external = wage.source === "External" && classification.method === "HISTORICAL_REFERENCE"
  const manual = wage.kind === "MANUAL" && classification.method === "MANUAL_ENTRY" && wage.source === "FutScout"
  const researched = wage.kind === "RESEARCHED" && classification.method === "RESEARCHED_REFERENCE" &&
    wage.source === "External" && classification.taxType === "GROSS" && classification.composition === "TOTAL"
  const reference = ["OFFICIAL_REFERENCE", "HISTORICAL_REFERENCE"].includes(classification.method)
  if ((!manual && !researched && reference !== (wage.kind === "HISTORICAL_REFERENCE")) ||
      (wage.kind === "MANUAL" && !manual) ||
      wage.source !== (researched ? "External" : official ? "Official" : external ? "External" : reference ? "FootyStats" : "FutScout") ||
      ((official || external) && (typeof wage.sourceName !== "string" || !wage.sourceName.trim() || wage.sourceName.length > 160 || !wage.period))) return null
  if ((external || researched) && !wage.sourceUrl) return null
  if (wage.sourceUrl) {
    try {
      const url = new URL(wage.sourceUrl)
      if (url.protocol !== "https:" || url.username || url.password) return null
    } catch { return null }
  }
  const pt = locale === "pt"
  const value = new Intl.NumberFormat(pt ? "pt-BR" : "en-GB", { maximumFractionDigits: 0 }).format(wage.weeklyEur)
  const composition = { BASE: pt ? "Base" : "Base", GUARANTEED: pt ? "Garantido" : "Guaranteed", TOTAL: pt ? "Total" : "Total",
    MIXED_UNCLASSIFIED: pt ? "Composição não confirmada" : "Composition unconfirmed", UNKNOWN: pt ? "Composição não confirmada" : "Composition unconfirmed" }[classification.composition]
  return {
    title: classification.taxType === "NET" ? (pt ? "Salário líquido" : "Net salary")
      : classification.taxType === "GROSS" ? (pt ? "Salário bruto" : "Gross salary")
      : manual ? (pt ? "Salário cadastrado — composição não confirmada" : "Entered salary — composition unconfirmed")
      : reference ? (pt ? "Referência salarial — composição não confirmada" : "Salary reference — composition unconfirmed")
      : (pt ? "Salário estimado — composição não confirmada" : "Estimated salary — composition unconfirmed"),
    value: `€ ${value}/${pt ? "semana" : "week"}`,
    label: manual ? (pt ? "Valor cadastrado — contrato não verificado" : "Entered value — contract unverified")
      : researched ? (pt ? "Valor pesquisado — baixa confiança" : "Researched value — low confidence")
      : official ? (pt ? "Referência oficial histórica — baixa confiança" : "Official historical reference — low confidence")
      : external ? (pt ? "Estimativa da fonte — baixa confiança" : "Source estimate — low confidence")
      : wage.kind === "HISTORICAL_REFERENCE"
      ? (pt ? "Referência histórica — baixa confiança" : "Historical reference — low confidence")
      : (pt ? "Estimado — baixa confiança" : "Estimated — low confidence"),
    sourceUrl: wage.sourceUrl,
    detail: `${official || external || researched ? wage.sourceName : wage.source}${wage.period ? ` · ${wage.period}` : ""} · ${composition} · ${pt ? "Vigência contratual não comprovada" : "Current contract not verified"}`,
    comparisonNotice: pt ? "Líquido, bruto e composições diferentes não são diretamente comparáveis." : "Net, gross and different compositions are not directly comparable.",
  }
}
