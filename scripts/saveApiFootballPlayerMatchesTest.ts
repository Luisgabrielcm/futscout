import "dotenv/config"

import { prisma } from "../lib/prisma"

import {
    resolveApiFootballPlayer,
} from "../services/resolveApiFootballPlayer"

import {
    clearApiFootballTeamPlayersCache,
} from "../services/getApiFootballTeamPlayers"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const SEASON = 2024

/*
 * Agora estámos com 20.
 */
const PLAYER_LIMIT = 20

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "\n========================================"
  )

  console.log(
    "GRAVAÇÃO CONTROLADA - API-FOOTBALL"
  )

  console.log(
    "========================================"
  )

  console.log({
    season:
      SEASON,

    playerLimit:
      PLAYER_LIMIT,

    save:
      true,
  })

  clearApiFootballTeamPlayersCache()

  /* ======================================
     1. PEGAR SOMENTE NÃO ASSOCIADOS
  ====================================== */

  const players =
    await prisma.player.findMany({
      where: {
        apiFootballId:
          null,

        dateOfBirth: {
          not: null,
        },

        clubId: {
          not: null,
        },
      },

      select: {
        id: true,
        name: true,
        slug: true,
        officialOverall:
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

      orderBy: {
        officialOverall:
          "desc",
      },

      take:
        PLAYER_LIMIT,
    })

  console.log(
    `\nJogadores selecionados: ${players.length}`
  )

  let saved = 0
  let strongNotSaved = 0
  let review = 0
  let weak = 0
  let notResolved = 0
  let errors = 0

  for (
    const player of
      players
  ) {
    console.log(
      "\n----------------------------------------"
    )

    console.log(
      `JOGADOR: ${player.name}`
    )

    console.log({
      slug:
        player.slug,

      overall:
        player.officialOverall,

      birth:
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

          save:
            true,
        })

      if (!result) {
        console.log(
          "\nRESULTADO: NÃO RESOLVIDO"
        )

        notResolved++

        continue
      }

      console.log(
        "\nMATCH"
      )

      console.log({
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

        canAutoSave:
          result.canAutoSave,

        saved:
          result.saved,

        source:
          result.source,
      })

      if (
        result.saved
      ) {
        saved++

        console.log(
          `✅ SALVO: ${player.name} → ${result.apiFootballId}`
        )

        continue
      }

      if (
        result.classification ===
        "MATCH FORTE"
      ) {
        strongNotSaved++

        console.log(
          "⚠️ Match forte, mas não passou por todas as regras de auto-save."
        )

        continue
      }

      if (
        result.classification ===
        "REVISAR"
      ) {
        review++

        continue
      }

      weak++
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
          "Execução interrompida para preservar a cota."
        )

        errors++

        break
      }

      console.error(
        "\nERRO:",
        error
      )

      errors++
    }
  }

  /* ======================================
     RESUMO
  ====================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "RESUMO DA GRAVAÇÃO"
  )

  console.log(
    "========================================"
  )

  console.log({
    jogadoresSelecionados:
      players.length,

    idsSalvos:
      saved,

    matchForteNaoSalvo:
      strongNotSaved,

    revisar:
      review,

    matchFraco:
      weak,

    naoResolvido:
      notResolved,

    erros:
      errors,
  })

  console.log(
    "\n========================================"
  )

  console.log(
    "GRAVAÇÃO FINALIZADA"
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