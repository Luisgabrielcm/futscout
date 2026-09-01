import "dotenv/config"

import {
  MockPlayerProvider,
} from "../providers/mockPlayerProvider"

import {
  normalizePlayer,
} from "../normalizers/normalizePlayer"

import {
  syncPlayers,
} from "../services/syncPlayers"

async function main() {
  console.log(
    "🔄 Iniciando sincronização de teste..."
  )

  const provider =
    new MockPlayerProvider()

  const externalPlayers =
    await provider.getPlayers()

  console.log(
    `📥 ${externalPlayers.length} jogador(es) recebido(s)`
  )

  const normalizedPlayers =
    externalPlayers.map(
      normalizePlayer
    )

  console.log(
    "🧹 Dados normalizados"
  )

  const result =
    await syncPlayers(
      normalizedPlayers
    )

  console.log(
    "✅ Sincronização concluída"
  )

  console.log({
    processed:
      result.processed,

    success:
      result.success,

    failed:
      result.failed,
  })
}

main()
  .catch((error) => {
    console.error(
      "❌ Erro na sincronização:"
    )

    console.error(error)

    process.exit(1)
  })