import type { Locale } from "./config"

const copy = {
  profileNav: ["Navegar pelo perfil", "Profile sections"],
  overview: ["Visão geral", "Overview"],
  realLife: ["Vida Real", "Real Life"],
  realLeague: ["Liga real", "Real-world league"],
  attributes: ["Atributos", "Attributes"],
  statistics: ["Estatísticas", "Statistics"],
  history: ["Histórico", "History"],
  lastTransfer: ["Última transferência", "Latest transfer"],
  catalogLeague: ["Liga no catálogo EA FC", "EA FC catalog league"],
  realStatsMissing: ["Estatísticas do futebol real ainda não disponíveis neste perfil.", "Real-world statistics are not yet available on this profile."],
  nationality: ["Nacionalidade", "Nationality"],
  countrySearch: ["Buscar país ou nacionalidade...", "Search country or nationality..."],
  popular: ["Mais populares", "Most popular"],
  all: ["Todos", "All"],
  alphabet: ["Filtrar por inicial", "Filter by initial"],
  countryResults: ["países encontrados", "countries found"],
  countryResult: ["país encontrado", "country found"],
  noCountries: ["Nenhum país encontrado. Limpe a busca ou escolha outra faixa.", "No countries found. Clear your search or choose another range."],
  withinRange: ["A busca considera a faixa selecionada.", "Search applies within the selected range."],
  career: ["Carreira e contrato", "Career and contract"],
  currentClub: ["Clube atual confirmado", "Confirmed current club"],
  catalogClub: ["Clube no catálogo EA FC", "EA FC catalog club"],
  catalogNote: ["O clube do catálogo não confirma o clube atual no futebol real.", "The catalog club does not confirm the current real-world club."],
  salary: ["Salário", "Salary"],
  week: ["semana", "week"],
  year: ["ano", "year"],
  contractUntil: ["Contrato até", "Contract until"],
  shirt: ["Número da camisa", "Shirt number"],
  since: ["Desde", "Since"],
  contractStatus: ["Situação contratual", "Contract status"],
  nationalTeam: ["Seleção representada", "National team represented"],
  transfers: ["Transferências", "Transfers"],
  noTransfers: ["Histórico verificado ainda não disponível neste perfil.", "Verified history is not yet available on this profile."],
  transferNote: ["Valores de transferências não representam salário nem valor de mercado atual.", "Transfer fees are neither salary nor current market value."],
} as const

export function visualText(locale: Locale, key: keyof typeof copy): string {
  return copy[key][locale === "pt" ? 0 : 1]
}
