import { syncApiFootballPlayer } from "../services/syncApiFootballPlayer"

async function main() {
  await syncApiFootballPlayer({
    slug: "pedri",
    apiFootballId: 133609,
  })
}

main().catch((error) => {
  console.error(
    "Erro na sincronização:",
    error
  )

  process.exitCode = 1
})