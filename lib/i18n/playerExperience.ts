import type { Locale } from "./config"

const copy = {
  navigation: ["Experiência do jogador", "Player experience"],
  realLife: ["VIDA REAL", "REAL LIFE"],
  realContext: ["Futebol real", "Real-world football"],
  approvedClub: ["Clube atual confirmado", "Confirmed current club"],
  noApprovedClub: ["Clube atual ainda não confirmado", "Current club not yet confirmed"],
  approvedClubNote: [
    "Esta informação usa somente o estado aprovado do Current Club V2.",
    "This information uses only the approved Current Club V2 state.",
  ],
  realLeague: ["Liga atual", "Current league"],
  marketValue: ["Valor de mercado real", "Real market value"],
  marketValueMissing: ["Fonte de valor real ainda não conectada.", "Real-world value source is not connected yet."],
  realDataMissing: ["Dado real verificado ainda não disponível.", "Verified real-world data is not yet available."],
  eaContext: ["Dados do catálogo EA SPORTS FC", "EA SPORTS FC catalog data"],
  careerModeValue: ["VALOR CAREER MODE", "CAREER MODE VALUE"],
} as const

export function playerExperienceText(locale: Locale, key: keyof typeof copy): string {
  return copy[key][locale === "en" ? 1 : 0]
}
