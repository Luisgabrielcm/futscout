import { syncApiFootballPlayer } from "../services/syncApiFootballPlayer"

async function main() {
  await syncApiFootballPlayer({
    slug: "jamal-musiala",
    apiFootballId: 181812,
  })
}

main().catch((error) => {
  console.error(
    "Erro na sincronização:",
    error
  )

  process.exitCode = 1
})