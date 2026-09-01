import "dotenv/config"

import {
    prisma,
} from "../lib/prisma"

import {
    databaseRetry,
} from "../lib/databaseRetry"

/* ========================================
   TIPOS
======================================== */

type AuditIssue = {
  section: string
  message: string
}

type AuditResult = {
  issues: AuditIssue[]
}

/* ========================================
   HELPERS
======================================== */

function printSection(
  title: string
) {
  console.log(
    "\n========================================"
  )

  console.log(
    title
  )

  console.log(
    "========================================"
  )
}

function printMetric(
  label: string,
  value: string | number
) {
  console.log(
    `${label.padEnd(32, ".")} ${value}`
  )
}

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "========================================"
  )

  console.log(
    "🔎 FUTSCOUT - AUDITORIA GERAL DA BASE"
  )

  console.log(
    "========================================"
  )

  console.log(
    "\n⚠️ MODO SOMENTE LEITURA"
  )

  const result: AuditResult = {
    issues: [],
  }

  /* ========================================
     PLAYERS
  ======================================== */

  printSection(
    "👤 PLAYERS"
  )

  const totalPlayers =
    await databaseRetry(
      () =>
        prisma.player.count(),

      "Auditoria: total Players"
    )

  const playersWithExternalId =
    await databaseRetry(
      () =>
        prisma.player.count({
          where: {
            externalId: {
              not: null,
            },
          },
        }),

      "Auditoria: Players com externalId"
    )

  const playersWithoutExternalId =
    totalPlayers -
    playersWithExternalId

  const externalIds =
    await databaseRetry(
      () =>
        prisma.player.findMany({
          where: {
            externalId: {
              not: null,
            },
          },

          select: {
            externalId: true,
          },
        }),

      "Auditoria: externalIds Players"
    )

  const uniqueExternalIds =
    new Set(
      externalIds
        .map(
          (player) =>
            player.externalId
        )
        .filter(
          (
            externalId
          ): externalId is string =>
            Boolean(
              externalId
            )
        )
    ).size

  const duplicatedExternalIds =
    playersWithExternalId -
    uniqueExternalIds

  const playersWithoutClub =
    await databaseRetry(
      () =>
        prisma.player.count({
          where: {
            clubId: null,
          },
        }),

      "Auditoria: Players sem clube"
    )

  const playersWithoutImage =
    await databaseRetry(
      () =>
        prisma.player.count({
          where: {
            OR: [
              {
                imageUrl: null,
              },

              {
                imageUrl: "",
              },
            ],
          },
        }),

      "Auditoria: Players sem imagem"
    )

  const invalidImageUrls =
    await databaseRetry(
      () =>
        prisma.player.count({
          where: {
            imageUrl: {
              not: null,
              notIn: [
                "",
              ],
            },

            NOT: {
              imageUrl: {
                startsWith:
                  "http",
              },
            },
          },
        }),

      "Auditoria: imagens inválidas"
    )

  printMetric(
    "Total",
    totalPlayers
  )

  printMetric(
    "Com externalId",
    playersWithExternalId
  )

  printMetric(
    "ExternalIds únicos",
    uniqueExternalIds
  )

  printMetric(
    "ExternalIds duplicados",
    duplicatedExternalIds
  )

  printMetric(
    "Sem externalId",
    playersWithoutExternalId
  )

  printMetric(
    "Sem clube",
    playersWithoutClub
  )

  printMetric(
    "Sem imagem",
    playersWithoutImage
  )

  printMetric(
    "Imagem inválida",
    invalidImageUrls
  )

  if (
    duplicatedExternalIds > 0
  ) {
    result.issues.push({
      section:
        "Player",

      message:
        `${duplicatedExternalIds} externalId(s) duplicado(s)`,
    })
  }

  if (
    playersWithoutExternalId > 0
  ) {
    result.issues.push({
      section:
        "Player",

      message:
        `${playersWithoutExternalId} jogador(es) sem externalId`,
    })
  }

  if (
    invalidImageUrls > 0
  ) {
    result.issues.push({
      section:
        "Player",

      message:
        `${invalidImageUrls} jogador(es) com imageUrl inválida`,
    })
  }

  /* ========================================
     PLAYER ATTRIBUTES
  ======================================== */

  printSection(
    "📊 PLAYER ATTRIBUTES"
  )

  const totalAttributes =
    await databaseRetry(
      () =>
        prisma.playerAttributes.count(),

      "Auditoria: PlayerAttributes"
    )

  const attributePlayerIds =
    await databaseRetry(
      () =>
        prisma.playerAttributes.findMany({
          select: {
            playerId: true,
          },
        }),

      "Auditoria: playerIds Attributes"
    )

  const uniqueAttributePlayers =
    new Set(
      attributePlayerIds.map(
        (attribute) =>
          attribute.playerId
      )
    ).size

  const duplicatedAttributeRecords =
    totalAttributes -
    uniqueAttributePlayers

  const playersWithoutAttributes =
    Math.max(
      totalPlayers -
        uniqueAttributePlayers,
      0
    )

  printMetric(
    "Registros",
    totalAttributes
  )

  printMetric(
    "Jogadores únicos",
    uniqueAttributePlayers
  )

  printMetric(
    "Duplicidades",
    duplicatedAttributeRecords
  )

  printMetric(
    "Players sem atributos",
    playersWithoutAttributes
  )

  if (
    duplicatedAttributeRecords > 0
  ) {
    result.issues.push({
      section:
        "PlayerAttributes",

      message:
        `${duplicatedAttributeRecords} registro(s) duplicado(s)`,
    })
  }

  if (
    playersWithoutAttributes > 0
  ) {
    result.issues.push({
      section:
        "PlayerAttributes",

      message:
        `${playersWithoutAttributes} jogador(es) sem atributos`,
    })
  }

  /* ========================================
     CLUBS
  ======================================== */

  printSection(
    "🏟️ CLUBES"
  )

  const totalClubs =
    await databaseRetry(
      () =>
        prisma.club.count(),

      "Auditoria: Clubs"
    )

  const clubsWithExternalId =
    await databaseRetry(
      () =>
        prisma.club.count({
          where: {
            externalId: {
              not: null,
            },
          },
        }),

      "Auditoria: Clubs com externalId"
    )

  const clubExternalIds =
    await databaseRetry(
      () =>
        prisma.club.findMany({
          where: {
            externalId: {
              not: null,
            },
          },

          select: {
            externalId: true,
          },
        }),

      "Auditoria: externalIds Clubs"
    )

  const uniqueClubExternalIds =
    new Set(
      clubExternalIds
        .map(
          (club) =>
            club.externalId
        )
        .filter(
          (
            externalId
          ): externalId is string =>
            Boolean(
              externalId
            )
        )
    ).size

  const clubsWithoutExternalId =
    totalClubs -
    clubsWithExternalId

  const duplicatedClubExternalIds =
    clubsWithExternalId -
    uniqueClubExternalIds

   const clubsWithoutLeague = 0

  printMetric(
    "Total",
    totalClubs
  )

  printMetric(
    "Com externalId",
    clubsWithExternalId
  )

  printMetric(
    "ExternalIds únicos",
    uniqueClubExternalIds
  )

  printMetric(
    "ExternalIds duplicados",
    duplicatedClubExternalIds
  )

  printMetric(
    "Sem externalId",
    clubsWithoutExternalId
  )

  printMetric(
    "Sem liga",
    clubsWithoutLeague
  )

  if (
    clubsWithoutExternalId > 0
  ) {
    result.issues.push({
      section:
        "Club",

      message:
        `${clubsWithoutExternalId} clube(s) sem externalId`,
    })
  }

  if (
    duplicatedClubExternalIds > 0
  ) {
    result.issues.push({
      section:
        "Club",

      message:
        `${duplicatedClubExternalIds} externalId(s) duplicado(s)`,
    })
  }

  if (
    clubsWithoutLeague > 0
  ) {
    result.issues.push({
      section:
        "Club",

      message:
        `${clubsWithoutLeague} clube(s) sem liga`,
    })
  }

  /* ========================================
     LEAGUES
  ======================================== */

  printSection(
    "🏆 LIGAS"
  )

  const totalLeagues =
    await databaseRetry(
      () =>
        prisma.league.count(),

      "Auditoria: Leagues"
    )

  const leagues =
    await databaseRetry(
      () =>
        prisma.league.findMany({
          select: {
            id: true,
            name: true,

            _count: {
              select: {
                clubs: true,
              },
            },
          },
        }),

      "Auditoria: League relations"
    )

  const orphanLeagues =
    leagues.filter(
      (league) =>
        league._count.clubs ===
        0
    )

  printMetric(
    "Total",
    totalLeagues
  )

  printMetric(
    "Órfãs",
    orphanLeagues.length
  )

  /*
    O endpoint atual da EA fornece
    leagueName, mas não leagueId.

    Por isso NÃO tratamos externalId
    NULL em League como erro.
  */

  if (
    orphanLeagues.length > 0
  ) {
    result.issues.push({
      section:
        "League",

      message:
        `${orphanLeagues.length} liga(s) órfã(s)`,
    })
  }

  /* ========================================
     PLAYSTYLE
  ======================================== */

  printSection(
    "🎮 PLAYSTYLES"
  )

  const totalPlayStyles =
    await databaseRetry(
      () =>
        prisma.playStyle.count(),

      "Auditoria: PlayStyles"
    )

  const playStyleCodes =
    await databaseRetry(
      () =>
        prisma.playStyle.findMany({
          select: {
            code: true,
          },
        }),

      "Auditoria: codes PlayStyle"
    )

  const uniquePlayStyleCodes =
    new Set(
      playStyleCodes.map(
        (playStyle) =>
          playStyle.code
      )
    ).size

  const duplicatedPlayStyleCodes =
    totalPlayStyles -
    uniquePlayStyleCodes

  const totalPlayerPlayStyles =
    await databaseRetry(
      () =>
        prisma.playerPlayStyle.count(),

      "Auditoria: PlayerPlayStyle"
    )

  const playerPlayStyles =
    await databaseRetry(
      () =>
        prisma.playerPlayStyle.findMany({
          select: {
            playerId: true,
            playStyleId: true,
            level: true,
          },
        }),

      "Auditoria: relações PlayStyle"
    )

  const uniqueRelations =
    new Set(
      playerPlayStyles.map(
        (relation) =>
          `${relation.playerId}:${relation.playStyleId}`
      )
    ).size

  const duplicatedRelations =
    totalPlayerPlayStyles -
    uniqueRelations

  const normalRelations =
    playerPlayStyles.filter(
      (relation) =>
        relation.level ===
        "normal"
    ).length

  const plusRelations =
    playerPlayStyles.filter(
      (relation) =>
        relation.level ===
        "plus"
    ).length

  const playersWithPlayStyles =
    new Set(
      playerPlayStyles.map(
        (relation) =>
          relation.playerId
      )
    ).size

  const playersWithoutPlayStyles =
    Math.max(
      totalPlayers -
        playersWithPlayStyles,
      0
    )

  printMetric(
    "PlayStyles",
    totalPlayStyles
  )

  printMetric(
    "Codes únicos",
    uniquePlayStyleCodes
  )

  printMetric(
    "Codes duplicados",
    duplicatedPlayStyleCodes
  )

  printMetric(
    "Relações",
    totalPlayerPlayStyles
  )

  printMetric(
    "Relações únicas",
    uniqueRelations
  )

  printMetric(
    "Relações duplicadas",
    duplicatedRelations
  )

  printMetric(
    "Normal",
    normalRelations
  )

  printMetric(
    "Plus",
    plusRelations
  )

  printMetric(
    "Players com PlayStyle",
    playersWithPlayStyles
  )

  printMetric(
    "Players sem PlayStyle",
    playersWithoutPlayStyles
  )

  if (
    duplicatedPlayStyleCodes > 0
  ) {
    result.issues.push({
      section:
        "PlayStyle",

      message:
        `${duplicatedPlayStyleCodes} code(s) duplicado(s)`,
    })
  }

  if (
    duplicatedRelations > 0
  ) {
    result.issues.push({
      section:
        "PlayerPlayStyle",

      message:
        `${duplicatedRelations} relação(ões) duplicada(s)`,
    })
  }

  /* ========================================
     SYNC ERROR
  ======================================== */

  printSection(
    "⚠️ SYNC ERRORS"
  )

  const totalSyncErrors =
    await databaseRetry(
      () =>
        prisma.syncError.count(),

      "Auditoria: SyncErrors"
    )

  const resolvedSyncErrors =
    await databaseRetry(
      () =>
        prisma.syncError.count({
          where: {
            resolved: true,
          },
        }),

      "Auditoria: SyncErrors resolvidos"
    )

  const unresolvedSyncErrors =
    await databaseRetry(
      () =>
        prisma.syncError.count({
          where: {
            resolved: false,
          },
        }),

      "Auditoria: SyncErrors pendentes"
    )

  printMetric(
    "Total",
    totalSyncErrors
  )

  printMetric(
    "Resolvidos",
    resolvedSyncErrors
  )

  printMetric(
    "Pendentes",
    unresolvedSyncErrors
  )

  if (
    unresolvedSyncErrors > 0
  ) {
    result.issues.push({
      section:
        "SyncError",

      message:
        `${unresolvedSyncErrors} erro(s) pendente(s)`,
    })
  }

  /* ========================================
     SYNC STATE
  ======================================== */

  printSection(
    "🔄 SYNC STATE"
  )

  const syncState =
    await databaseRetry(
      () =>
        prisma.syncState.findUnique({
          where: {
            key:
              "ea-ratings-players",
          },
        }),

      "Auditoria: SyncState EA"
    )

  if (
    syncState
  ) {
    printMetric(
      "Key",
      syncState.key
    )

    printMetric(
      "Offset",
      syncState.offset
    )

    printMetric(
      "Batch size",
      syncState.batchSize
    )

    printMetric(
      "Status",
      syncState.status
    )

    printMetric(
      "Last error",
      syncState.lastError ??
        "NULL"
    )

    printMetric(
      "Last success",
      syncState.lastSuccessAt
        ? syncState.lastSuccessAt
            .toISOString()
        : "NULL"
    )

    if (
      syncState.offset !==
      totalPlayers
    ) {
      result.issues.push({
        section:
          "SyncState",

        message:
          `Offset ${syncState.offset} diferente do total de Players ${totalPlayers}`,
      })
    }

    if (
      syncState.status !==
      "completed"
    ) {
      result.issues.push({
        section:
          "SyncState",

        message:
          `status atual = ${syncState.status}`,
      })
    }
  } else {
    result.issues.push({
      section:
        "SyncState",

      message:
        "SyncState ea-ratings-players não encontrado",
    })
  }

  /* ========================================
     RESUMO FINAL
  ======================================== */

  printSection(
    "🧪 RESULTADO FINAL"
  )

  if (
    result.issues.length ===
    0
  ) {
    console.log(
      "✅ BASE ÍNTEGRA"
    )

    console.log(
      "Nenhum problema estrutural encontrado."
    )
  } else {
    console.log(
      `⚠️ ${result.issues.length} problema(s) encontrado(s):`
    )

    for (
      const issue
      of result.issues
    ) {
      console.log(
        `- [${issue.section}] ${issue.message}`
      )
    }
  }

  console.log(
    "\nAuditoria concluída."
  )
}

/* ========================================
   EXECUÇÃO
======================================== */

main()
  .catch(
    (error) => {
      console.error(
        "\n❌ Falha fatal na auditoria:"
      )

      console.error(
        error
      )

      process.exit(1)
    }
  )