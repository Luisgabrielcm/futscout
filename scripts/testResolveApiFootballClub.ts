import "dotenv/config"

import { prisma } from "../lib/prisma"

import {
    clearApiFootballClubCache,
    resolveApiFootballClub,
} from "../services/resolveApiFootballClub"

const CLUB_SLUGS = [
  "real-madrid",
  "fc-barcelona",
  "fc-bayern-munchen",
]

async function main() {
  console.log(
    "\n========================================"
  )

  console.log(
    "TESTE DO RESOLVEDOR DE CLUBES"
  )

  console.log(
    "========================================"
  )

  console.log(
    "MODO: SOMENTE LEITURA"
  )

  console.log(
    "Nenhum apiFootballId será salvo."
  )

  clearApiFootballClubCache()

  let success = 0
  let failed = 0

  for (
    const slug of
      CLUB_SLUGS
  ) {
    console.log(
      "\n----------------------------------------"
    )

    console.log(
      `CLUBE: ${slug}`
    )

    const club =
      await prisma.club.findUnique({
        where: {
          slug,
        },

        select: {
          id: true,
          name: true,
          slug: true,
          apiFootballId: true,
        },
      })

    if (!club) {
      console.log(
        "Clube não encontrado no FutScout."
      )

      failed++

      continue
    }

    console.log({
      futScoutId:
        club.id,

      futScoutName:
        club.name,

      currentApiFootballId:
        club.apiFootballId,
    })

    try {
      const result =
        await resolveApiFootballClub({
          clubId:
            club.id,

          /*
           * IMPORTANTE:
           *
           * Ainda não gravaremos.
           */

          save:
            true,
        })

      if (!result) {
        console.log(
          "RESULTADO: NÃO RESOLVIDO"
        )

        failed++

        continue
      }

      console.log(
        "\nRESULTADO"
      )

      console.log({
        futScoutClub:
          result.futScoutClubName,

        apiFootballId:
          result.apiFootballId,

        apiFootballName:
          result.apiFootballName,

        country:
          result.apiCountry,

        confidence:
          `${result.confidence}%`,

        source:
          result.source,
      })

      success++
    } catch (
      error
    ) {
      console.error(
        "ERRO:",
        error
      )

      failed++
    }
  }

  console.log(
    "\n========================================"
  )

  console.log(
    "RESUMO"
  )

  console.log(
    "========================================"
  )

  console.log(
    `Clubes testados: ${CLUB_SLUGS.length}`
  )

  console.log(
    `Resolvidos: ${success}`
  )

  console.log(
    `Não resolvidos/erros: ${failed}`
  )

  console.log(
    "\nNenhum ID foi salvo no banco."
  )

  console.log(
    "\n========================================"
  )

  console.log(
    "TESTE FINALIZADO"
  )

  console.log(
    "========================================"
  )
}

main()
  .catch(
    (error) => {
      console.error(
        "Erro geral:",
        error
      )

      process.exitCode = 1
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect()
    }
  )