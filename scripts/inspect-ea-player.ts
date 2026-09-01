import {
    EARatingsProvider,
} from "../providers/eaRatingsProvider"

async function main() {
  console.log(
    "========================================"
  )

  console.log(
    "🔎 FUTSCOUT — EA RATINGS INSPECTOR"
  )

  console.log(
    "========================================"
  )

  const provider =
    new EARatingsProvider()

  const response =
    await provider.inspectPlayer()

  console.log(
    "\n📦 RESPOSTA COMPLETA DA EA:\n"
  )

  console.dir(
    response,
    {
      depth: null,
      colors: true,
    }
  )

  console.log(
    "\n========================================"
  )

  console.log(
    "✅ Inspeção concluída"
  )

  console.log(
    "========================================"
  )
}

main().catch(
  (error) => {
    console.error(
      "\n❌ Erro ao consultar a EA Ratings:"
    )

    console.error(
      error
    )

    process.exit(1)
  }
)