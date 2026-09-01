import "dotenv/config"

import { prisma } from "../lib/prisma"
import { resolveApiFootballClub } from "../services/resolveApiFootballClub"

import {
  ApiFootballTeamPlayer,
  clearApiFootballTeamPlayersCache,
  getApiFootballTeamPlayers,
  hasApiFootballTeamPlayersCache,
} from "../services/getApiFootballTeamPlayers"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const SEASON = 2024
const PLAYER_LIMIT = 10

/*
 * Ainda não vamos salvar o
 * apiFootballId dos jogadores.
 */
const SAVE_PLAYER_IDS = false

/* ========================================
   TIPOS
======================================== */

type MatchEvaluation = {
  apiFootballId: number

  apiName: string

  apiFullName: string

  apiBirthDate: string | null

  apiNationality: string | null

  apiTeams: string[]

  nameScore: number

  birthMatches: boolean

  nationalityMatches: boolean

  clubMatches: boolean

  confidence: number

  classification:
    | "MATCH FORTE"
    | "REVISAR"
    | "MATCH FRACO"
}

/* ========================================
   NORMALIZAÇÃO DE TEXTO
======================================== */

function normalizeText(
  value:
    | string
    | null
    | undefined
) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9\s]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
}

/* ========================================
   NACIONALIDADES
======================================== */

const NATIONALITY_ALIASES: Record<
  string,
  string
> = {
  holland: "netherlands",
}

function normalizeNationality(
  value:
    | string
    | null
    | undefined
) {
  const normalized =
    normalizeText(value)

  return (
    NATIONALITY_ALIASES[
      normalized
    ] ?? normalized
  )
}

/* ========================================
   CLUBES
======================================== */

function normalizeClubName(
  value:
    | string
    | null
    | undefined
) {
  const normalized =
    normalizeText(value)

  const ignoredWords =
    new Set([
      "fc",
      "cf",
      "sc",
      "ac",
      "afc",
      "club",
      "football",
      "futbol",
      "futebol",
    ])

  const parts =
    normalized
      .split(" ")
      .filter(
        (part) =>
          part &&
          !ignoredWords.has(
            part
          )
      )
      .map(
        (part) => {
          if (
            part === "munchen"
          ) {
            return "munich"
          }

          return part
        }
      )

  return parts.join(" ")
}

/* ========================================
   DATA
======================================== */

function formatDate(
  value:
    | Date
    | null
    | undefined
) {
  if (!value) {
    return null
  }

  return value
    .toISOString()
    .slice(0, 10)
}

/* ========================================
   NOME COMPLETO DA API
======================================== */

function getApiFullName(
  candidate:
    ApiFootballTeamPlayer
) {
  return [
    candidate.player
      ?.firstname,
    candidate.player
      ?.lastname,
  ]
    .filter(Boolean)
    .join(" ")
}

/* ========================================
   SCORE DE NOME
======================================== */

function calculateNameScore(
  futScoutName: string,
  candidate:
    ApiFootballTeamPlayer
) {
  const target =
    normalizeText(
      futScoutName
    )

  const apiName =
    normalizeText(
      candidate.player
        ?.name
    )

  const apiFullName =
    normalizeText(
      getApiFullName(
        candidate
      )
    )

  if (
    !target
  ) {
    return 0
  }

  /*
   * Nome exatamente igual.
   */

  if (
    target === apiName ||
    target === apiFullName
  ) {
    return 100
  }

  /*
   * Um nome contém completamente
   * o outro.
   *
   * Exemplo:
   *
   * Jude Bellingham
   *
   * Jude Victor William Bellingham
   */

  if (
    apiFullName.includes(
      target
    ) ||
    target.includes(
      apiFullName
    )
  ) {
    return 90
  }

  const targetParts =
    target
      .split(" ")
      .filter(Boolean)

  const candidateParts =
    new Set(
      `${apiName} ${apiFullName}`
        .split(" ")
        .filter(Boolean)
    )

  const matchingParts =
    targetParts.filter(
      (part) =>
        candidateParts.has(
          part
        )
    )

  const ratio =
    matchingParts.length /
    targetParts.length

  if (
    ratio === 1
  ) {
    return 100
  }

  if (
    ratio >= 0.75
  ) {
    return 90
  }

  if (
    ratio >= 0.5
  ) {
    return 80
  }

  if (
    ratio > 0
  ) {
    return 50
  }

  return 0
}

/* ========================================
   FILTRO INICIAL POR NOME
======================================== */

/*
 * Como agora recebemos o elenco completo
 * do clube, não queremos calcular tudo
 * para jogadores completamente diferentes.
 *
 * Este filtro é local:
 * nenhuma chamada adicional à API.
 */

function getLocalPlayerCandidates({
  playerName,
  teamPlayers,
}: {
  playerName: string
  teamPlayers:
    ApiFootballTeamPlayer[]
}) {
  const normalizedTarget =
    normalizeText(
      playerName
    )

  const targetParts =
    normalizedTarget
      .split(" ")
      .filter(Boolean)

  const lastName =
    targetParts[
      targetParts.length - 1
    ] ?? ""

  const candidates =
    teamPlayers.filter(
      (candidate) => {
        const apiName =
          normalizeText(
            candidate.player
              ?.name
          )

        const apiFullName =
          normalizeText(
            getApiFullName(
              candidate
            )
          )

        const combined =
          `${apiName} ${apiFullName}`

        /*
         * Nome inteiro aparece.
         */

        if (
          normalizedTarget &&
          combined.includes(
            normalizedTarget
          )
        ) {
          return true
        }

        /*
         * Sobrenome aparece.
         */

        if (
          lastName &&
          combined
            .split(" ")
            .includes(
              lastName
            )
        ) {
          return true
        }

        /*
         * Pelo menos metade das
         * palavras do nome coincide.
         */

        if (
          targetParts.length >
          1
        ) {
          const combinedParts =
            new Set(
              combined
                .split(" ")
                .filter(Boolean)
            )

          const matches =
            targetParts.filter(
              (part) =>
                combinedParts.has(
                  part
                )
            ).length

          if (
            matches /
              targetParts.length >=
            0.5
          ) {
            return true
          }
        }

        return false
      }
    )

  /*
   * Se o filtro não encontrar ninguém,
   * devolvemos o elenco inteiro.
   *
   * Isso é importante para não perder
   * jogadores que usam abreviações
   * diferentes na API.
   */

  if (
    candidates.length ===
    0
  ) {
    return teamPlayers
  }

  return candidates
}

/* ========================================
   AVALIAR CANDIDATO
======================================== */

function evaluateCandidate({
  futScoutPlayer,
  candidate,
  apiTeamId,
}: {
  futScoutPlayer: {
    name: string

    dateOfBirth:
      | Date
      | null

    nationality:
      | string
      | null

    club: {
      name: string
    }
  }

  candidate:
    ApiFootballTeamPlayer

  apiTeamId: number
}): MatchEvaluation | null {
  const apiId =
    candidate.player?.id

  if (
    apiId === undefined
  ) {
    return null
  }

  const apiName =
    candidate.player
      ?.name ?? ""

  const apiFullName =
    getApiFullName(
      candidate
    )

  const apiBirthDate =
    candidate.player
      ?.birth?.date ??
    null

  const futScoutBirthDate =
    formatDate(
      futScoutPlayer
        .dateOfBirth
    )

  const birthMatches =
    Boolean(
      futScoutBirthDate &&
      apiBirthDate &&
      futScoutBirthDate ===
        apiBirthDate
    )

  const futScoutNationality =
    normalizeNationality(
      futScoutPlayer
        .nationality
    )

  const candidateNationality =
    normalizeNationality(
      candidate.player
        ?.nationality
    )

  const nationalityMatches =
    Boolean(
      futScoutNationality &&
      candidateNationality &&
      futScoutNationality ===
        candidateNationality
    )

  const statistics =
    candidate.statistics ??
    []

  const apiTeams =
    Array.from(
      new Set(
        statistics
          .map(
            (stat) =>
              stat.team?.name
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(value)
          )
      )
    )

  /*
   * Como o elenco foi buscado usando
   * team=apiTeamId, o próprio contexto
   * da busca já é uma evidência forte
   * do clube.
   *
   * Ainda verificamos statistics
   * quando disponíveis.
   */

  const hasMatchingTeamId =
    statistics.some(
      (stat) =>
        stat.team?.id ===
        apiTeamId
    )

  const futScoutClub =
    normalizeClubName(
      futScoutPlayer
        .club.name
    )

  const hasMatchingTeamName =
    apiTeams.some(
      (team) =>
        normalizeClubName(
          team
        ) ===
        futScoutClub
    )

  const clubMatches =
    hasMatchingTeamId ||
    hasMatchingTeamName

  const nameScore =
    calculateNameScore(
      futScoutPlayer.name,
      candidate
    )

  /*
   * PESOS
   *
   * Nome          40
   * Nascimento    35
   * Nacionalidade 10
   * Clube          15
   *
   * Total         100
   */

  const namePoints =
    Math.round(
      nameScore * 0.4
    )

  const birthPoints =
    birthMatches
      ? 35
      : 0

  const nationalityPoints =
    nationalityMatches
      ? 10
      : 0

  const clubPoints =
    clubMatches
      ? 15
      : 0

  const confidence =
    namePoints +
    birthPoints +
    nationalityPoints +
    clubPoints

  let classification:
    MatchEvaluation["classification"] =
      "MATCH FRACO"

  if (
    confidence >= 90
  ) {
    classification =
      "MATCH FORTE"
  } else if (
    confidence >= 75
  ) {
    classification =
      "REVISAR"
  }

  return {
    apiFootballId:
      apiId,

    apiName,

    apiFullName,

    apiBirthDate,

    apiNationality:
      candidate.player
        ?.nationality ??
      null,

    apiTeams,

    nameScore,

    birthMatches,

    nationalityMatches,

    clubMatches,

    confidence,

    classification,
  }
}

/* ========================================
   ESCOLHER MELHOR CANDIDATO
======================================== */

function chooseBestCandidate({
  futScoutPlayer,
  candidates,
  apiTeamId,
}: {
  futScoutPlayer: {
    name: string

    dateOfBirth:
      | Date
      | null

    nationality:
      | string
      | null

    club: {
      name: string
    }
  }

  candidates:
    ApiFootballTeamPlayer[]

  apiTeamId: number
}) {
  const evaluated =
    candidates
      .map(
        (candidate) =>
          evaluateCandidate({
            futScoutPlayer,
            candidate,
            apiTeamId,
          })
      )
      .filter(
        (
          result
        ): result is MatchEvaluation =>
          result !== null
      )
      .sort(
        (
          a,
          b
        ) =>
          b.confidence -
          a.confidence
      )

  return (
    evaluated[0] ??
    null
  )
}

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "\n========================================"
  )

  console.log(
    "TESTE BATCH - MATCHER COM CACHE DE ELENCO"
  )

  console.log(
    "========================================"
  )

  console.log(
    `Temporada: ${SEASON}`
  )

  console.log(
    `Jogadores: ${PLAYER_LIMIT}`
  )

  console.log(
    "Modo: SOMENTE LEITURA PARA JOGADORES"
  )

  console.log(
    "Nenhum apiFootballId de jogador será salvo."
  )

  /*
   * Cache começa vazio nesta execução.
   */

  clearApiFootballTeamPlayersCache()

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
        dateOfBirth: true,
        nationality: true,
        officialOverall: true,

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

  let strongMatches = 0
  let reviewMatches = 0
  let weakMatches = 0
  let notFound = 0
  let errors = 0

  let teamLoadsFromApi = 0
  let teamLoadsFromCache = 0

  let clubsFromDatabase = 0
  let clubsFromApi = 0

  let processedPlayers = 0

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
        formatDate(
          player.dateOfBirth
        ),

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

    if (
      !player.club
    ) {
      console.log(
        "SEM CLUBE."
      )

      notFound++

      continue
    }

    try {
      /* ==================================
         1. RESOLVER CLUBE
      ================================== */

      const resolvedClub =
        await resolveApiFootballClub({
          clubId:
            player.club.id,

          save:
            true,
        })

      if (
        !resolvedClub
      ) {
        console.log(
          "CLUBE NÃO RESOLVIDO."
        )

        notFound++

        continue
      }

      if (
        resolvedClub.source ===
        "database"
      ) {
        clubsFromDatabase++
      } else {
        clubsFromApi++
      }

      console.log(
        "\nCLUBE"
      )

      console.log({
        futScout:
          resolvedClub.futScoutClubName,

        apiFootball:
          resolvedClub.apiFootballName,

        apiFootballId:
          resolvedClub.apiFootballId,

        source:
          resolvedClub.source,

        confidence:
          `${resolvedClub.confidence}%`,
      })

      /* ==================================
         2. CARREGAR ELENCO
      ================================== */

      const wasCached =
        hasApiFootballTeamPlayersCache({
          teamId:
            resolvedClub.apiFootballId,

          season:
            SEASON,
        })

      const teamPlayers =
        await getApiFootballTeamPlayers({
          teamId:
            resolvedClub.apiFootballId,

          season:
            SEASON,
        })

      if (
        wasCached
      ) {
        teamLoadsFromCache++
      } else {
        teamLoadsFromApi++
      }

      console.log(
        "\nELENCO"
      )

      console.log({
        jogadoresNoElenco:
          teamPlayers.length,

        origem:
          wasCached
            ? "cache"
            : "api-football",
      })

      /* ==================================
         3. CANDIDATOS LOCAIS
      ================================== */

      const candidates =
        getLocalPlayerCandidates({
          playerName:
            player.name,

          teamPlayers,
        })

      console.log(
        `Candidatos locais: ${candidates.length}`
      )

      if (
        candidates.length ===
        0
      ) {
        console.log(
          "JOGADOR NÃO ENCONTRADO NO ELENCO."
        )

        notFound++

        processedPlayers++

        continue
      }

      /* ==================================
         4. MELHOR MATCH
      ================================== */

      const best =
        chooseBestCandidate({
          futScoutPlayer: {
            name:
              player.name,

            dateOfBirth:
              player.dateOfBirth,

            nationality:
              player.nationality,

            club: {
              name:
                player.club.name,
            },
          },

          candidates,

          apiTeamId:
            resolvedClub.apiFootballId,
        })

      if (
        !best
      ) {
        console.log(
          "NENHUM CANDIDATO VÁLIDO."
        )

        notFound++

        processedPlayers++

        continue
      }

      console.log(
        "\nMELHOR CANDIDATO"
      )

      console.log({
        apiFootballId:
          best.apiFootballId,

        apiName:
          best.apiName,

        apiFullName:
          best.apiFullName,

        birth:
          best.apiBirthDate,

        nationality:
          best.apiNationality,

        teams:
          best.apiTeams,

        nameScore:
          `${best.nameScore}%`,

        birthMatches:
          best.birthMatches,

        nationalityMatches:
          best.nationalityMatches,

        clubMatches:
          best.clubMatches,

        confidence:
          `${best.confidence}%`,

        classification:
          best.classification,
      })

      /* ==================================
         5. RESULTADO
      ================================== */

      if (
        best.classification ===
        "MATCH FORTE"
      ) {
        strongMatches++

        if (
          SAVE_PLAYER_IDS
        ) {
          /*
           * Ainda não implementamos a
           * gravação nesta etapa.
           */
          console.log(
            "SAVE_PLAYER_IDS ativo, mas gravação ainda desabilitada."
          )
        }
      } else if (
        best.classification ===
        "REVISAR"
      ) {
        reviewMatches++
      } else {
        weakMatches++
      }

      processedPlayers++
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
          "Execução interrompida para preservar a cota."
        )

        errors++

        break
      }

      console.error(
        "ERRO:",
        error
      )

      errors++

      processedPlayers++
    }
  }

  /* ========================================
     RESUMO
  ======================================== */

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

  naoEncontrado:
    notFound,

  erros:
    errors,

  clubesVindosDoBanco:
    clubsFromDatabase,

  clubesResolvidosPelaApi:
    clubsFromApi,

  elencosBuscadosNaApi:
    teamLoadsFromApi,

  elencosReutilizadosDoCache:
    teamLoadsFromCache,
})
  console.log(
    "\nIMPORTANTE:"
  )

  console.log(
    "Nenhum apiFootballId de jogador foi salvo."
  )

  console.log(
    "O cache evita repetir a consulta de um elenco dentro da mesma execução."
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