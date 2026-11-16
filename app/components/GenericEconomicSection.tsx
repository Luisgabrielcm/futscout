import { readGenericEconomicView } from "../../services/genericEconomicRead.server"
import type { Locale } from "../../lib/i18n/config"
import GenericEconomicPanel from "./GenericEconomicPanel"

export default async function GenericEconomicSection({ playerId, locale }: { playerId: string; locale: Locale }) {
  const view = await readGenericEconomicView(playerId)
  return view ? <GenericEconomicPanel view={view} locale={locale} /> : null
}
