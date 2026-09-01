import { syncApiFootballPlayer } from "../services/syncApiFootballPlayer"

async function main() {
  await syncApiFootballPlayer({
    slug: "kylian-mbappe",
    apiFootballId: 278,
  })
}

main().catch((error) => {
  console.error(
    "Erro na sincronização:",
    error
  )

  process.exitCode = 1
})