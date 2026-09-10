import type { Locale } from "./config"

const messages = {
  goalkeeper: ["Atributos específicos de goleiro", "Goalkeeper-specific attributes"],
  missingGoalkeeper: ["Os atributos específicos de goleiro ainda não estão persistidos. Nenhum valor foi estimado.", "Goalkeeper-specific attributes are not yet persisted. No values have been estimated."],
  faceStats: ["Face stats EA persistidos", "Persisted EA face stats"],
  faceNotice: ["Códigos originais da EA guardados em colunas genéricas. Para goleiros, não devem ser lidos como notas de linha nem renomeados como atributos específicos sem confirmação da fonte.", "Original EA codes stored in generic columns. For goalkeepers, these must not be read as outfield ratings or renamed as specific goalkeeper attributes without source confirmation."],
  general: ["Subatributos gerais disponíveis", "Available general subattributes"],
} as const
export function profileText(locale: Locale, key: keyof typeof messages) {
  return messages[key][locale === "pt" ? 0 : 1]
}
