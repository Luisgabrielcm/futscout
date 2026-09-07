import Link from "next/link"
import PlayerImage from "./PlayerImage"
import PlayerActions from "./PlayerActions"
import type { SelectedPlayer } from "../../types/playerSelection"
import { comparisonAttribute, higherValue } from "../../lib/playerComparison"
import { formatCurrency } from "../../utils/formatCurrency"

export default function PlayerComparison({ players }: { players: [SelectedPlayer, SelectedPlayer] }) {
  const [left, right] = players
  const goalkeeper = players.some((player) => player.position === "GOL")
  const rows: { label: string; values: [number | null, number | null]; currency?: boolean }[] = [
    { label: "Idade", values: [left.age, right.age] },
    { label: "OVR EA", values: [left.baseOverall, right.baseOverall] },
    ...(players.some((player) => player.dynamicOverall !== null)
      ? [{ label: "OVR FutScout", values: [left.dynamicOverall, right.dynamicOverall] as [number | null, number | null] }] : []),
    { label: "Potencial", values: [left.potential, right.potential] },
    { label: "Valor de mercado", values: [left.marketValue, right.marketValue], currency: true },
    ...(["pace", "shooting", "passing", "dribbling", "defending", "physical"] as const).map((key, i) => ({
      label: ["Ritmo", "Finalização", "Passe", "Drible", "Defesa", "Físico"][i],
      values: players.map((player) => comparisonAttribute(players, player, key)) as [number | null, number | null],
    })),
  ]
  return <section className="comparisonPanel" aria-label="Comparação de dois jogadores">
    {goalkeeper && <p className="comparisonNotice">Há um goleiro nesta comparação. Os atributos de linha não são equivalentes e não serão comparados. Atributos específicos de goleiro ainda não estão disponíveis.</p>}
    <table className="comparisonTable">
      <caption>Valores disponíveis · ↑ indica apenas o maior valor numérico, não uma recomendação.</caption>
      <thead><tr>
        <th scope="col">Indicador</th>
        {players.map((player) => <th scope="col" key={player.id}>
          <PlayerImage src={player.image} alt={player.name} className="comparisonPhoto" fallbackClassName="comparisonPhoto directoryBadgeFallback" />
          <Link href={`/jogadores/${encodeURIComponent(player.slug)}`}>{player.name}</Link>
          <span>{player.club ?? "Sem clube"}</span><span>{player.position}</span>
        </th>)}
      </tr></thead>
      <tbody>{rows.map(({ label, values, currency }) => {
        const winner = higherValue(...values)
        return <tr key={label}><th scope="row">{label}</th>
          {values.map((value, index) => <td key={index} className={winner === index ? "comparisonHigher" : undefined}>
            {value === null ? "—" : currency ? formatCurrency(value) : value}
            {winner === index && <span aria-label="Maior valor"> ↑</span>}
          </td>)}
        </tr>
      })}</tbody>
    </table>
    <div className="comparisonActionGrid">
      {players.map((player) => <section key={player.id} aria-label={`Ações de ${player.name}`}>
        <h2>{player.name}</h2><PlayerActions slug={player.slug} name={player.name} />
      </section>)}
    </div>
  </section>
}
