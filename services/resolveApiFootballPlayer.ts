import "dotenv/config"
import { prisma } from "../lib/prisma"
import { getApiFootballTeamPlayers } from "./getApiFootballTeamPlayers"
import { resolveApiFootballClub } from "./resolveApiFootballClub"
import {
  evaluateApiFootballPlayerCandidateRanking,
  evaluateApiFootballPlayerRoster,
} from "./apiFootballPlayerMatcherCore"
import { evaluateCandidate, formatDate, type ApiFootballPlayerMatch } from "./apiFootballPlayerCandidate"
export type { ApiFootballPlayerMatch } from "./apiFootballPlayerCandidate"

const DEFAULT_SEASON = 2024

/* ========================================
   RESOLVER JOGADOR
======================================== */

export async function resolveApiFootballPlayer({
  playerId,
  season = DEFAULT_SEASON,
  save = false,
  cacheOnly = false,
}: {
  playerId: string
  season?: number
  save?: boolean
  cacheOnly?: boolean
}): Promise<
  ApiFootballPlayerMatch | null
> {
  /* ======================================
     1. JOGADOR FUTSCOUT
  ====================================== */

  const player =
    await prisma.player.findUnique({
      where: {
        id: playerId,
      },

      select: {
        id: true,
        name: true,

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
    throw new Error(
      `Jogador não encontrado no FutScout: ${playerId}`
    )
  }

  /* ======================================
     2. ID JÁ SALVO
  ====================================== */

  if (
    player.apiFootballId !==
    null
  ) {
    return {
      futScoutPlayerId:
        player.id,

      futScoutPlayerName:
        player.name,

      apiFootballId:
        player.apiFootballId,

      apiName:
        player.name,

      apiFullName:
        player.name,

      apiBirthDate:
        formatDate(
          player.dateOfBirth
        ),

      apiNationality:
        player.nationality,

      apiTeams:
        player.club
          ? [
              player.club.name,
            ]
          : [],

      nameScore:
        100,

      birthMatches:
        true,

      nationalityMatches:
        true,

      clubMatches:
        true,

      confidence:
        100,

      classification:
        "MATCH FORTE",

      source:
        "database",

      canAutoSave:
        true,

      saved:
        false,
    }
  }

  /* ======================================
     3. SEM CLUBE
  ====================================== */

  if (!player.club) {
    return null
  }

  /* ======================================
     4. RESOLVER CLUBE
  ====================================== */

  const resolvedClub =
    await resolveApiFootballClub({
      clubId:
        player.club.id,

      /*
       * IDs de clubes já foram validados
       * anteriormente.
       */
      save:
        true,

      cacheOnly,
    })

  if (
    !resolvedClub
  ) {
    return null
  }

  /* ======================================
     5. CARREGAR ELENCO
  ====================================== */

  const teamPlayers =
    await getApiFootballTeamPlayers({
      teamId:
        resolvedClub.apiFootballId,

      season,

      cacheOnly,
    })

  if (
    teamPlayers.length ===
    0
  ) {
    return null
  }

  /* ======================================
     6. CANDIDATOS
  ====================================== */

  const evaluated =
    evaluateApiFootballPlayerRoster(
      teamPlayers,
      (candidate) =>
        evaluateCandidate({
            player: {
              id:
                player.id,

              name:
                player.name,

              dateOfBirth:
                player.dateOfBirth,

              nationality:
                player.nationality,

              club: {
                name:
                  player.club!.name,
              },
            },

            candidate,

            apiTeamId:
              resolvedClub.apiFootballId,
        })
    )

  const candidateRanking =
    evaluateApiFootballPlayerCandidateRanking(
      evaluated
    )

  const best =
    candidateRanking.top1

  if (!best) {
    return null
  }

  const safeBest = {
    ...best,

    canAutoSave:
      candidateRanking.canAutoSave,
  }

  /* ======================================
     8. NÃO SALVAR?
  ====================================== */

  if (!save) {
    return safeBest
  }

  /* ======================================
     9. NÃO PASSOU NA REGRA DE SEGURANÇA
  ====================================== */

  if (
    !safeBest.canAutoSave
  ) {
    return safeBest
  }

  /* ======================================
     10. VERIFICAR CONFLITO
  ====================================== */

  const existingPlayer =
    await prisma.player.findUnique({
      where: {
        apiFootballId:
          safeBest.apiFootballId,
      },

      select: {
        id: true,
        name: true,
      },
    })

  if (
    existingPlayer &&
    existingPlayer.id !==
      player.id
  ) {
    throw new Error(
      `Conflito de apiFootballId=${best.apiFootballId}. ` +
        `Esse ID já está associado a ${existingPlayer.name}.`
    )
  }

  /* ======================================
     11. GRAVAR
  ====================================== */

  await prisma.player.update({
    where: {
      id:
        player.id,
    },

    data: {
      apiFootballId:
        safeBest.apiFootballId,
    },
  })

  /* ======================================
     12. RETORNO
  ====================================== */

  return {
    ...safeBest,

    saved:
      true,
  }
}
