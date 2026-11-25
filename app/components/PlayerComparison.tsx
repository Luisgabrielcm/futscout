import { t, localizedHref, type Locale } from "../../lib/i18n"
import EstimatedValueNote from './EstimatedValueNote'

import Link from "next/link"
import PlayerImage from "./PlayerImage"
import PlayerActions from "./PlayerActions"
import type { SelectedPlayer } from "../../types/playerSelection"
import { comparisonAttribute, higherValue } from "../../lib/playerComparison"
import { formatCurrency } from "../../utils/formatCurrency"
import ClubBadge from "./ClubBadge"
import { wagePresentation } from "../../lib/wagePublication"
import { zeroGameFreeAgentEconomics } from "../../lib/publicEconomicOverlay"

export default function PlayerComparison({ locale = "pt", players }: { locale?: Locale; players: [SelectedPlayer, SelectedPlayer] }) {
  const [left, right] = players
  const goalkeeper = players.some((player) => player.position === "GOL")
  const zeroGameEconomics = players.map(player => zeroGameFreeAgentEconomics(player))
  const wages = players.map((player, index) => zeroGameEconomics[index] ? null : wagePresentation(player.wage, player.id, locale))
  const rows: { label: string; values: [number | null, number | null]; currency?: boolean }[] = [
    { label: t(locale, "Idade"), values: [left.age, right.age] },
    { label: "OVR EA", values: [left.baseOverall, right.baseOverall] },
    ...(players.some((player) => player.dynamicOverall !== null)
      ? [{ label: "OVR FutScout", values: [left.dynamicOverall, right.dynamicOverall] as [number | null, number | null] }] : []),
    { label: t(locale, "Potencial"), values: [left.potential, right.potential] },
    { label: t(locale, "Valor de mercado"), values: [left.marketValue, right.marketValue], currency: true },
    ...(["pace", "shooting", "passing", "dribbling", "defending", "physical"] as const).map((key, i) => ({
      label: [t(locale, "Ritmo"), t(locale, "Finalização"), t(locale, "Passe"), t(locale, "Drible"), t(locale, "Defesa"), t(locale, "Físico")][i],
      values: players.map((player) => comparisonAttribute(players, player, key)) as [number | null, number | null],
    })),
  ]
  return <section className="comparisonPanel" aria-label={t(locale, "Comparação de dois jogadores")}>
    {goalkeeper && <p className="comparisonNotice">{t(locale, "Há um goleiro nesta comparação. Os atributos de linha não são equivalentes e não serão comparados. Atributos específicos de goleiro ainda não estão disponíveis.")}</p>}
    <table className="comparisonTable">
      <caption>{t(locale, "Valores disponíveis · ↑ indica apenas o maior valor numérico, não uma recomendação.")}</caption>
      <thead><tr>
        <th scope="col">{t(locale, "Indicador")}</th>
        {players.map((player, index) => <th scope="col" key={player.id}>
          <PlayerImage locale={locale} src={player.image} alt={player.name} className="comparisonPhoto" fallbackClassName="comparisonPhoto directoryBadgeFallback" />
          <Link href={localizedHref(locale, `/jogadores/${encodeURIComponent(player.slug)}`)}>{player.name}</Link>
          <span className="comparisonClub">{!zeroGameEconomics[index] && player.club && <ClubBadge locale={locale} name={player.club} asset={player.clubAsset} size="small" />}{zeroGameEconomics[index] ? locale === "pt" ? "Agente livre" : "Free agent" : player.club ?? t(locale, "Sem clube")}</span><span>{player.position}</span>
        </th>)}
      </tr></thead>
      <tbody>{rows.map(({ label, values, currency }) => {
        const winner = higherValue(...values)
        return <tr key={label}><th scope="row">{label}</th>
          {values.map((value, index) => <td key={index} className={winner === index ? "comparisonHigher" : undefined}>
            {value === null ? "—" : currency ? formatCurrency(value, locale) : value}
            {currency && <EstimatedValueNote provider={players[index].economicMarketValue?.provider} value={value} locale={locale} />}
            {winner === index && <span aria-label={t(locale, "Maior valor")}> ↑</span>}
          </td>)}
        </tr>
      })}{(wages.some(Boolean) || zeroGameEconomics.some(Boolean)) && <tr><th scope="row">{locale === "pt" ? "Remuneração semanal" : "Weekly remuneration"}</th>
        {wages.map((wage, index) => <td key={index} data-game-economics={zeroGameEconomics[index] ? "free-agent-zeroed" : undefined}>{zeroGameEconomics[index] ? <strong>{formatCurrency(0, locale)}</strong> : wage ? <><span>{wage.title}</span><br /><strong>{wage.value}</strong><br /><small>{wage.label}<br />{wage.detail}</small></> : "—"}</td>)}
      </tr>}</tbody>
    </table>
    {wages.some(Boolean) && <p className="comparisonNotice">{wages.find(Boolean)?.comparisonNotice}</p>}
    <div className="comparisonActionGrid">
      {players.map((player) => <section key={player.id} aria-label={t(locale, "actionsFor", { name: player.name })}>
        <h2>{player.name}</h2><PlayerActions locale={locale} slug={player.slug} name={player.name} />
      </section>)}
    </div>
  </section>
}
