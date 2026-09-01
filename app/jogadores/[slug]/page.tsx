import Link from "next/link"

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

  const player =
    await getPlayerBySlug(slug)

  if (!player) {
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
            Jogador não encontrado
          </h1>

          <p>
            O jogador solicitado não existe
            ou ainda não foi sincronizado.
          </p>
        </div>
      </main>
    )
  }

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

      <PlayerPositions
        player={player}
      />

      <PlayerPlayStyles
        player={player}
      />

      <ScoutAnalysis
        player={player}
      />

      <PlayerAttributes
        attributes={
          player.attributes
        }
      />
    </main>
  )
}