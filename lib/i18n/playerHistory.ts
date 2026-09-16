import type { Locale } from "./config"

const copy = {
  fullHistory: ["Ver histórico completo →", "View full history →"],
  back: ["← Voltar ao perfil", "← Back to profile"],
  history: ["Histórico", "History"],
  description: ["Carreira, temporadas e transferências. Apenas informações de fontes verificadas.", "Career, seasons and transfers. Information from verified sources only."],
  summary: ["Resumo da carreira", "Career summary"],
  appearances: ["Jogos", "Appearances"],
  goals: ["Gols", "Goals"],
  assists: ["Assistências", "Assists"],
  minutes: ["Minutos", "Minutes"],
  starts: ["Titularidades", "Starts"],
  seasons: ["Temporadas", "Seasons"],
  season: ["Temporada", "Season"],
  club: ["Clube", "Club"],
  competition: ["Competição", "Competition"],
  clubs: ["Clubes", "Clubs"],
  trophies: ["Títulos", "Trophies"],
  international: ["Seleção", "International career"],
  team: ["Clube ou seleção", "Club or national team"],
  period: ["Período", "Period"],
  summaryMissing: ["Totais verificados da carreira ainda não disponíveis. Ausência de dados não significa zero.", "Verified career totals are not yet available. Missing data does not mean zero."],
  seasonsMissing: ["Estatísticas por temporada ainda não disponíveis.", "Season statistics are not yet available."],
  clubsMissing: ["Histórico verificado de clubes e períodos ainda não disponível.", "Verified club and period history is not yet available."],
  trophiesMissing: ["Títulos verificados ainda não disponíveis.", "Verified trophies are not yet available."],
  internationalMissing: ["Histórico de seleção ainda não disponível. Nacionalidade não confirma seleção representada.", "International history is not yet available. Nationality does not confirm the national team represented."],
  statistics: ["Estatísticas", "Statistics"],
  current: ["Resumo atual · futebol real", "Current summary · real-world football"],
  statsMissing: ["Estatísticas ainda não disponíveis.", "Statistics are not yet available."],
  realSummary: ["Resumo · Vida Real", "Summary · Real Life"],
} as const

export function historyText(locale: Locale, key: keyof typeof copy): string {
  return copy[key][locale === "en" ? 1 : 0]
}

// Never coerce missing/invalid counts into zero or infer career totals from a subset.
export function displayCareerCount(value: number | null | undefined): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : "—"
}
