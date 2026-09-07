import Link from "next/link"
import { notFound } from "next/navigation"

import {
  getPlayerBySlug,
} from "../../../services/playerService"

import PlayerAttributes from "../../components/PlayerAttributes"
import PlayerHeader from "../../components/PlayerHeader"
import PlayerPlayStyles from "../../components/PlayerPlayStyles"
import PlayerPositions from "../../components/PlayerPositions"
import PlayerQuickProfile from "../../components/PlayerQuickProfile"
import ScoutAnalysis from "../../components/ScoutAnalysis"

type PlayerPageProps = {
  params: Promise<{
    slug: string
  }>
}

export default async function PlayerPage({
  params,
}: PlayerPageProps) {
  const { slug } = await params

  const profile =
    await getPlayerBySlug(slug)

  if (!profile) {
    notFound()
  }

  if (profile.status === "incomplete") {
    return (
      <main className="playerPage">
        <Link
          href="/jogadores"
          className="backButton"
        >
          ← Voltar
        </Link>

        <div className="playersEmpty">
          <h1>
            {profile.name}
          </h1>

          <p>
            Perfil incompleto: os atributos deste jogador ainda não estão disponíveis.
            Nenhuma estatística foi estimada para preencher esses dados.
          </p>
        </div>
      </main>
    )
  }

  const player = profile.player
  const isGoalkeeper = player.position === "GOL"

  return (
    <main className="playerPage">
      <Link
        href="/jogadores"
        className="backButton"
      >
        ← Voltar
      </Link>

      <PlayerHeader
        player={player}
      />

      <PlayerQuickProfile
        player={player}
      />

      {isGoalkeeper ? (
        <section className="playersEmpty">
          <h2>Análise FutScout</h2>
          <p>Análise específica para goleiros em desenvolvimento.</p>
        </section>
      ) : <PlayerPositions player={player} />}

      <PlayerPlayStyles
        player={player}
      />

      {!isGoalkeeper && <ScoutAnalysis
        player={player}
      />}

      {!isGoalkeeper && <PlayerAttributes
        attributes={
          player.attributes
        }
      />}
    </main>
  )
}
