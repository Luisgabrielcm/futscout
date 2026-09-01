import "dotenv/config"

import { prisma } from "../lib/prisma"

import {
    resolveApiFootballPlayer,
} from "../services/resolveApiFootballPlayer"

/* ========================================
   CONFIGURAÇÃO
======================================== */

/*
 * Vamos testar alguns jogadores
 * conhecidos.
 *
 * Se algum deles já tiver apiFootballId
 * salvo, o serviço deve retornar
 * source: "database".
 */

const PLAYER_SLUGS = [
  "kylian-mbappe",
  "jamal-musiala",
  "pedri",
]

const SEASON = 2024

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "\n========================================"
  )

  console.log(
    "TESTE DO RESOLVEDOR DE JOGADORES"
  )

  console.log(
    "========================================"
  )

  console.log(
    `Temporada: ${SEASON}`
  )

  console.log(
    "Modo: SOMENTE LEITURA"
  )

  console.log(
    "Nenhum apiFootballId será salvo."
  )

  let success = 0
  let failed = 0

  for (
    const slug of
      PLAYER_SLUGS
  ) {
    console.log(
      "\n----------------------------------------"
    )

    console.log(
      `JOGADOR: ${slug}`
    )

    const player =
      await prisma.player.findUnique({
        where: {
          slug,
        },

        select: {
          id: true,
          name: true,
          slug: true,
          apiFootballId:
            true,
          dateOfBirth:
            true,
          nationality:
            true,

          club: {
            select: {
              id: true,
              name: true,
              apiFootballId:
                true,
            },
          },
        },
      })

    if (!player) {
      console.log(
        "Jogador não encontrado no FutScout."
      )

      failed++

      continue
    }

    console.log(
      "\nFUTSCOUT"
    )

    console.log({
      id:
        player.id,

      name:
        player.name,

      apiFootballIdAtual:
        player.apiFootballId,

      dateOfBirth:
        player.dateOfBirth
          ?.toISOString()
          .slice(0, 10) ??
        null,

      nationality:
        player.nationality,

      club:
        player.club?.name ??
        null,

      clubApiFootballId:
        player.club
          ?.apiFootballId ??
        null,
    })

    try {
      const result =
        await resolveApiFootballPlayer({
          playerId:
            player.id,

          season:
            SEASON,

          /*
           * IMPORTANTE:
           *
           * Ainda não vamos gravar.
           */
          save:
            false,
        })

      if (!result) {
        console.log(
          "\nRESULTADO: NÃO RESOLVIDO"
        )

        failed++

        continue
      }

      console.log(
        "\nRESULTADO"
      )

      console.log({
        futScoutPlayer:
          result.futScoutPlayerName,

        apiFootballId:
          result.apiFootballId,

        apiName:
          result.apiName,

        apiFullName:
          result.apiFullName,

        apiBirthDate:
          result.apiBirthDate,

        apiNationality:
          result.apiNationality,

        apiTeams:
          result.apiTeams,

        nameScore:
          `${result.nameScore}%`,

        birthMatches:
          result.birthMatches,

        nationalityMatches:
          result.nationalityMatches,

        clubMatches:
          result.clubMatches,

        confidence:
          `${result.confidence}%`,

        classification:
          result.classification,

        source:
          result.source,
      })

      success++
    } catch (
      error
    ) {
      if (
        error instanceof
          Error &&
        error.message ===
          "RATE_LIMIT_429"
      ) {
        console.log(
          "\nAPI-FOOTBALL: HTTP 429"
        )

        console.log(
          "Limite de requisições atingido."
        )

        console.log(
          "Teste interrompido para preservar a cota."
        )

        break
      }

      console.error(
        "\nERRO:",
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

  console.log({
    jogadoresDoTeste:
      PLAYER_SLUGS.length,

    resolvidos:
      success,

    naoResolvidosOuErros:
      failed,
  })

  console.log(
    "\nNenhum apiFootballId de jogador foi salvo."
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