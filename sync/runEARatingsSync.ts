import "dotenv/config"

import {
  EARatingsProvider,
} from "../providers/eaRatingsProvider"

import {
  mapEARatingsPlayer,
} from "../mappers/mapEARatingsPlayer"

import {
  normalizePlayer,
} from "../normalizers/normalizePlayer"

import {
  syncPlayers,
} from "../services/syncPlayers"

async function main() {
  console.log(
    "================================"
  )

  console.log(
    "🔄 FUTSCOUT - EA RATINGS SYNC TEST"
  )

  console.log(
    "================================"
  )

  const provider =
    new EARatingsProvider()

  const response =
    await provider.inspectPlayer()

  const eaPlayer =
    response.items?.[0]

  if (!eaPlayer) {
    throw new Error(
      "Nenhum jogador recebido da EA"
    )
  }

  console.log(
    "\n📥 Jogador recebido:"
  )

  console.log({
    id: eaPlayer.id,
    commonName:
      eaPlayer.commonName,
    overall:
      eaPlayer.overallRating,
    avatarUrl:
      eaPlayer.avatarUrl,
  })

  const externalPlayer =
    mapEARatingsPlayer(
      eaPlayer
    )

  console.log(
    "\n🧩 ExternalPlayer criado"
  )

  const normalizedPlayer =
    normalizePlayer(
      externalPlayer
    )

  console.log(
    "\n🧹 Jogador normalizado:"
  )

  console.log({
    externalId:
      normalizedPlayer.externalId,

    name:
      normalizedPlayer.name,

    position:
      normalizedPlayer.position,

    preferredFoot:
      normalizedPlayer.preferredFoot,

    imageUrl:
      normalizedPlayer.imageUrl,
  })

  const result =
    await syncPlayers([
      normalizedPlayer,
    ])

  console.log(
    "\n✅ Resultado:"
  )

  console.log(result)
}

main().catch((error) => {
  console.error(
    "\n❌ Erro no sync real da EA:"
  )

  console.error(error)

  process.exit(1)
})