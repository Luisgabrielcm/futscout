import type { Locale } from "./config"
const messages = {
  title: ["Escalação oficial", "Official lineup"],
  latest: ["Último jogo com escalação disponível", "Latest match with an available lineup"],
  formation: ["Formação", "Formation"],
  substitutes: ["Banco da partida", "Match substitutes"],
  unavailable: ["Dado indisponível", "Data unavailable"],
  unresolved: ["Sem associação ao catálogo", "Not linked to the catalogue"],
  date: ["Última escalação disponível", "Latest available lineup"],
  stale: ["Escalação antiga: pode não representar o time atual.", "Older lineup: may not represent the current team."],
  rating: ["OVR EA do catálogo atual, não uma nota da partida.", "EA OVR from the current catalogue, not a match rating."],
  placement: ["Posicionamento indisponível; titulares na ordem da fonte.", "Placement unavailable; starters in source order."],
  positionG: ["GOL", "GK"], positionD: ["DEF", "DEF"], positionM: ["MEI", "MID"], positionF: ["ATA", "FWD"],
} as const
export function lineupText(locale: Locale, key: keyof typeof messages) { return messages[key][locale === "pt" ? 0 : 1] }
