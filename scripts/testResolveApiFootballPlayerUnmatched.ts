import "dotenv/config"

import { prisma } from "../lib/prisma"

import {
    resolveApiFootballPlayer,
} from "../services/resolveApiFootballPlayer"

import {
    clearApiFootballTeamPlayersCache,
    hasApiFootballTeamPlayersCache,
} from "../services/getApiFootballTeamPlayers"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const SEASON = 2024

/*
 * Vamos começar com apenas 5.
 *
 * Isso reduz o consumo da API enquanto
 * validamos o matcher oficial.
 */
const PLAYER_LIMIT = 5

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "\n========================================"
  )

  console.log(
    "TESTE - JOGADORES AINDA NÃO ASSOCIADOS"
  )

  console.log(
    "========================================"
  )

  console.log({
    season: SEASON,
    playerLimit: PLAYER_LIMIT,
    save: false,
  })

  console.log(
    "\nNenhum apiFootballId de jogador será salvo."
  )

  /*
   * Começamos a execução com
   * cache de elenco vazio.
   */
  clearApiFootballTeamPlayersCache()

  /* ======================================
     1. SELECIONAR JOGADORES
  ====================================== */

  const players =
    await prisma.player.findMany({
      where: {
        apiFootballId: null,

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
        dateOfBirth: true,
        nationality: true,
        officialOverall: true,

        club: {
          select: {
            id: true,
            name: true,
            apiFootballId: true,
          },
        },
      },

      orderBy: {
        officialOverall: "desc",
      },

      take: PLAYER_LIMIT,
    })

  console.log(
    `\nJogadores selecionados: ${players.length}`
  )

  /* ======================================
     CONTADORES
  ====================================== */

  let strongMatches = 0
  let reviewMatches = 0
  let weakMatches = 0
  let notResolved = 0
  let errors = 0

  let teamCacheHits = 0
  let teamCacheMisses = 0

  let processedPlayers = 0

  /* ======================================
     2. PROCESSAR
  ====================================== */

  for (const player of players) {
    console.log(
      "\n----------------------------------------"
    )

    console.log(
      `JOGADOR: ${player.name}`
    )

    console.log({
      slug: player.slug,

      overall:
        player.officialOverall,

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

    if (!player.club) {
      console.log(
        "RESULTADO: SEM CLUBE"
      )

      notResolved++
      processedPlayers++

      continue
    }

    /*
     * Se o clube já tiver apiFootballId,
     * conseguimos saber antecipadamente
     * se o elenco já está no cache.
     */
    const cacheBefore =
      player.club.apiFootballId !==
        null &&
      hasApiFootballTeamPlayersCache({
        teamId:
          player.club.apiFootballId,

        season:
          SEASON,
      })

    try {
      const result =
        await resolveApiFootballPlayer({
          playerId:
            player.id,

          season:
            SEASON,

          /*
           * MUITO IMPORTANTE:
           *
           * ainda não vamos gravar
           * o ID do jogador.
           */
          save:
            false,
        })

      if (!result) {
        console.log(
          "\nRESULTADO: NÃO RESOLVIDO"
        )

        notResolved++
        processedPlayers++

        continue
      }

      /*
       * Como selecionamos somente jogadores
       * apiFootballId=null, normalmente
       * source será "matcher".
       */

      console.log(
        "\nMATCH"
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

      if (cacheBefore) {
        teamCacheHits++
      } else {
        teamCacheMisses++
      }

      if (
        result.classification ===
        "MATCH FORTE"
      ) {
        strongMatches++
      } else if (
        result.classification ===
        "REVISAR"
      ) {
        reviewMatches++
      } else {
        weakMatches++
      }

      processedPlayers++
    } catch (error) {
      if (
        error instanceof Error &&
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
      processedPlayers++
    }
  }

  /* ======================================
     3. RESUMO
  ====================================== */

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
    jogadoresSelecionados:
      players.length,

    jogadoresProcessados:
      processedPlayers,

    matchForte:
      strongMatches,

    revisar:
      reviewMatches,

    matchFraco:
      weakMatches,

    naoResolvido:
      notResolved,

    erros:
      errors,

    reutilizacoesDeElenco:
      teamCacheHits,

    primeirosCarregamentosDeElenco:
      teamCacheMisses,
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
  .catch((error) => {
    console.error(
      "Erro geral:",
      error
    )

    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })