import type { Locale } from "./config"

const messages = {
  overview: ["Visão geral", "Overview"], squad: ["Elenco", "Squad"], statistics: ["Estatísticas", "Statistics"],
  fixtures: ["Calendário", "Fixtures"], transfers: ["Transferências", "Transfers"], trophies: ["Troféus", "Trophies"], history: ["História", "History"],
  soon: ["Em breve — dados ainda não disponíveis.", "Coming soon — data not yet available."],
  rating: ["Rating FutScout", "FutScout rating"], goalkeeper: ["Goleiros · média EA", "Goalkeepers · EA average"],
  method: ["Média do OVR EA dos jogadores de campo cadastrados, sem inferir titulares. Goleiros separados. Cada média exige ao menos um jogador com OVR válido na categoria; sem dados, fica indisponível. Não é um rating oficial da EA. Elencos incompletos podem afetar a comparação.", "Mean EA OVR of registered outfield players, without inferring starters. Goalkeepers are separate. Each average requires at least one player with valid OVR in its category; without data, it is unavailable. Not an official EA club rating. Incomplete squads may affect comparisons."],
  coverage: ["Jogadores com OVR válido", "Players with valid OVR"],
  positions: ["Elenco por posição", "Squad by position"],
  notLineup: ["Todos os jogadores cadastrados, agrupados pela posição principal. Não é uma escalação, formação ou indicação de titulares/reservas.", "All registered players, grouped by primary position. This is not a lineup, formation or designation of starters/substitutes."],
  best: ["Melhor time · Rating FutScout", "Best team · FutScout rating"],
  "name-asc": ["Nome A–Z", "Name A–Z"], "name-desc": ["Nome Z–A", "Name Z–A"],
  "overall-desc": ["OVR EA ↓", "EA OVR ↓"], "potential-desc": ["Potencial ↓", "Potential ↓"],
  "age-asc": ["Mais jovens", "Youngest"], "position-asc": ["Posição A–Z", "Position A–Z"], "value-desc": ["Valor de mercado ↓", "Market value ↓"],
  sort: ["Ordenação", "Sort by"], countries: ["Países / nacionalidades", "Countries / nationalities"],
  registered: ["Jogadores cadastrados", "Registered players"], notCallup: ["Agrupamento por nacionalidade no FutScout. Não representa uma convocação oficial nem elegibilidade internacional.", "Grouped by nationality in FutScout. This is not an official squad call-up or international eligibility statement."],
  potential: ["Potencial", "Potential"], age: ["Idade", "Age"], form: ["Forma", "Form"], value: ["Valor de mercado", "Market value"],
  minimumOverall: ["Explorar jogadores com este OVR EA mínimo", "Explore players with this minimum EA OVR"],
  exploreOverall: ["Explorar OVR EA ≥", "Explore EA OVR ≥"],
  minimumPotential: ["Explorar jogadores com este potencial mínimo", "Explore players with this minimum potential"],
  empty: ["Nenhum jogador encontrado.", "No players found."],
  missing: ["Dados não disponíveis", "Data unavailable"],
} as const
export type ClubMessage = keyof typeof messages
export function clubText(locale: Locale, key: ClubMessage) { return messages[key][locale === "pt" ? 0 : 1] }
export const CLUB_TABS = ["overview", "squad", "statistics", "fixtures", "transfers", "trophies", "history"] as const
export const SQUAD_SORTS = ["overall-desc", "potential-desc", "age-asc", "name-asc", "position-asc", "value-desc"] as const
