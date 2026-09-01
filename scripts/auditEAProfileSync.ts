import "dotenv/config"

import {
    prisma,
} from "../lib/prisma"

/* ========================================
   CONSTANTES
======================================== */

const EXPECTED_EA_PLAYERS =
  16228

const EA_SYNC_KEY =
  "ea-ratings-players"

/* ========================================
   HELPERS
======================================== */

function percentage(
  value: number,
  total: number
) {
  if (total === 0) {
    return "0.00%"
  }

  return `${(
    (value / total) *
    100
  ).toFixed(2)}%`
}

function printMetric(
  label: string,
  value: number,
  total?: number
) {
  if (
    total === undefined
  ) {
    console.log(
      `${label}: ${value}`
    )

    return
  }

  console.log(
    `${label}: ${value}/${total} (${percentage(
      value,
      total
    )})`
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
    "🔎 FUTSCOUT - AUDITORIA PÓS-SYNC EA"
  )

  console.log(
    "========================================"
  )

  /* ======================================
     SYNC STATE
  ====================================== */

  const syncState =
    await prisma.syncState.findUnique({
      where: {
        key:
          EA_SYNC_KEY,
      },
    })

  console.log(
    "\n========================================"
  )

  console.log(
    "🌍 SYNC STATE"
  )

  console.log(
    "========================================"
  )

  if (!syncState) {
    console.warn(
      "⚠️ SyncState da EA não encontrado."
    )
  } else {
    console.log({
      offset:
        syncState.offset,

      batchSize:
        syncState.batchSize,

      status:
        syncState.status,

      lastSuccessAt:
        syncState.lastSuccessAt,

      lastError:
        syncState.lastError,
    })
  }

  /* ======================================
     JOGADORES
  ====================================== */

  const totalPlayers =
    await prisma.player.count()

  const playersWithExternalId =
    await prisma.player.count({
      where: {
        externalId: {
          not:
            null,
        },
      },
    })

  const playersWithoutExternalId =
    await prisma.player.count({
      where: {
        externalId:
          null,
      },
    })

  console.log(
    "\n========================================"
  )

  console.log(
    "👤 JOGADORES"
  )

  console.log(
    "========================================"
  )

  printMetric(
    "Total",
    totalPlayers
  )

  printMetric(
    "Com externalId",
    playersWithExternalId,
    totalPlayers
  )

  printMetric(
    "Sem externalId",
    playersWithoutExternalId,
    totalPlayers
  )

  if (
    totalPlayers ===
    EXPECTED_EA_PLAYERS
  ) {
    console.log(
      `✅ Total esperado da EA: ${EXPECTED_EA_PLAYERS}`
    )
  } else {
    console.warn(
      `⚠️ Esperados ${EXPECTED_EA_PLAYERS}, encontrados ${totalPlayers}.`
    )
  }

  /* ======================================
     EXTERNAL ID DUPLICADOS
  ====================================== */

  /*
    O schema já possui:

    externalId String? @unique

    então o PostgreSQL não deveria permitir
    duplicação.

    Mesmo assim fazemos uma auditoria
    explícita para confirmar.
  */

  const externalIdGroups =
    await prisma.player.groupBy({
      by: [
        "externalId",
      ],

      where: {
        externalId: {
          not:
            null,
        },
      },

      _count: {
        externalId:
          true,
      },

      having: {
        externalId: {
          _count: {
            gt:
              1,
          },
        },
      },
    })

  console.log(
    "\nExternalId duplicados:",
    externalIdGroups.length
  )

  if (
    externalIdGroups.length ===
    0
  ) {
    console.log(
      "✅ Nenhum externalId duplicado."
    )
  } else {
    console.warn(
      "⚠️ Existem externalIds duplicados."
    )

    console.dir(
      externalIdGroups,
      {
        depth:
          null,
      }
    )
  }

  /* ======================================
     SLUGS DUPLICADOS
  ====================================== */

  const slugGroups =
    await prisma.player.groupBy({
      by: [
        "slug",
      ],

      _count: {
        slug:
          true,
      },

      having: {
        slug: {
          _count: {
            gt:
              1,
          },
        },
      },
    })

  console.log(
    "\nSlugs duplicados:",
    slugGroups.length
  )

  if (
    slugGroups.length ===
    0
  ) {
    console.log(
      "✅ Nenhum slug duplicado."
    )
  } else {
    console.warn(
      "⚠️ Existem slugs duplicados."
    )
  }

  /* ======================================
     PERFIL EA
  ====================================== */

  const playersWithSkillMoves =
    await prisma.player.count({
      where: {
        skillMoves: {
          not:
            null,
        },
      },
    })

  const playersWithWeakFoot =
    await prisma.player.count({
      where: {
        weakFootAbility: {
          not:
            null,
        },
      },
    })

  const playersWithPreferredFoot =
    await prisma.player.count({
      where: {
        preferredFoot: {
          not:
            null,
        },
      },
    })

  const playersWithHeight =
    await prisma.player.count({
      where: {
        height: {
          not:
            null,
        },
      },
    })

  const playersWithDateOfBirth =
    await prisma.player.count({
      where: {
        dateOfBirth: {
          not:
            null,
        },
      },
    })

  const playersWithNationality =
    await prisma.player.count({
      where: {
        nationality: {
          not:
            null,
        },
      },
    })

  console.log(
    "\n========================================"
  )

  console.log(
    "⭐ PERFIL EA"
  )

  console.log(
    "========================================"
  )

  printMetric(
    "Skill Moves",
    playersWithSkillMoves,
    totalPlayers
  )

  printMetric(
    "Weak Foot",
    playersWithWeakFoot,
    totalPlayers
  )

  printMetric(
    "Pé preferido",
    playersWithPreferredFoot,
    totalPlayers
  )

  printMetric(
    "Altura",
    playersWithHeight,
    totalPlayers
  )

  printMetric(
    "Data de nascimento",
    playersWithDateOfBirth,
    totalPlayers
  )

  printMetric(
    "Nacionalidade",
    playersWithNationality,
    totalPlayers
  )

  /* ======================================
     VALIDAÇÃO SKILL MOVES
  ====================================== */

  const invalidSkillMoves =
    await prisma.player.findMany({
      where: {
        OR: [
          {
            skillMoves: {
              lt:
                1,
            },
          },
          {
            skillMoves: {
              gt:
                5,
            },
          },
        ],
      },

      select: {
        externalId:
          true,

        name:
          true,

        skillMoves:
          true,
      },

      take:
        20,
    })

  console.log(
    "\nSkill Moves inválido(s):",
    invalidSkillMoves.length
  )

  if (
    invalidSkillMoves.length ===
    0
  ) {
    console.log(
      "✅ Valores de Skill Moves entre 1 e 5."
    )
  } else {
    console.warn(
      "⚠️ Existem valores inválidos de Skill Moves."
    )

    console.dir(
      invalidSkillMoves,
      {
        depth:
          null,
      }
    )
  }

  /* ======================================
     VALIDAÇÃO WEAK FOOT
  ====================================== */

  const invalidWeakFoot =
    await prisma.player.findMany({
      where: {
        OR: [
          {
            weakFootAbility: {
              lt:
                1,
            },
          },
          {
            weakFootAbility: {
              gt:
                5,
            },
          },
        ],
      },

      select: {
        externalId:
          true,

        name:
          true,

        weakFootAbility:
          true,
      },

      take:
        20,
    })

  console.log(
    "\nWeak Foot inválido(s):",
    invalidWeakFoot.length
  )

  if (
    invalidWeakFoot.length ===
    0
  ) {
    console.log(
      "✅ Valores de Weak Foot entre 1 e 5."
    )
  } else {
    console.warn(
      "⚠️ Existem valores inválidos de Weak Foot."
    )

    console.dir(
      invalidWeakFoot,
      {
        depth:
          null,
      }
    )
  }

  /* ======================================
     POSIÇÕES SECUNDÁRIAS
  ====================================== */

  /*
    Prisma + PostgreSQL String[].

    Para esta auditoria usamos consulta
    raw apenas para contar arrays não vazios.
  */

  const secondaryPositionsResult =
    await prisma.$queryRaw<
      Array<{
        count: bigint
      }>
    >`
      SELECT COUNT(*)::bigint AS count
      FROM "Player"
      WHERE cardinality("secondaryPositions") > 0
    `

  const playersWithSecondaryPositions =
    Number(
      secondaryPositionsResult[0]
        ?.count ??
        0
    )

  const legacySecondaryResult =
    await prisma.player.count({
      where: {
        secondaryPosition: {
          not:
            null,
        },
      },
    })

  console.log(
    "\n========================================"
  )

  console.log(
    "🧭 POSIÇÕES"
  )

  console.log(
    "========================================"
  )

  printMetric(
    "Com novas posições secundárias",
    playersWithSecondaryPositions,
    totalPlayers
  )

  printMetric(
    "Com secondaryPosition legado",
    legacySecondaryResult,
    totalPlayers
  )

  /* ======================================
     ARRAY COM POSIÇÃO PRINCIPAL DUPLICADA
  ====================================== */

  const primaryInsideSecondary =
    await prisma.$queryRaw<
      Array<{
        count: bigint
      }>
    >`
      SELECT COUNT(*)::bigint AS count
      FROM "Player"
      WHERE "position" = ANY("secondaryPositions")
    `

  const primaryInsideSecondaryCount =
    Number(
      primaryInsideSecondary[0]
        ?.count ??
        0
    )

  console.log(
    "\nPosição principal repetida no array:",
    primaryInsideSecondaryCount
  )

  if (
    primaryInsideSecondaryCount ===
    0
  ) {
    console.log(
      "✅ Nenhuma posição principal duplicada nas secundárias."
    )
  } else {
    console.warn(
      "⚠️ Existem jogadores cuja posição principal também aparece em secondaryPositions."
    )
  }

  /* ======================================
     CLUBES
  ====================================== */

  const totalClubs =
    await prisma.club.count()

  const clubsWithExternalId =
    await prisma.club.count({
      where: {
        externalId: {
          not:
            null,
        },
      },
    })

  const clubsWithImage =
    await prisma.club.count({
      where: {
        imageUrl: {
          not:
            null,
        },
      },
    })

  const playersWithClub =
    await prisma.player.count({
      where: {
        clubId: {
          not:
            null,
        },
      },
    })

  console.log(
    "\n========================================"
  )

  console.log(
    "🛡️ CLUBES"
  )

  console.log(
    "========================================"
  )

  printMetric(
    "Total de clubes",
    totalClubs
  )

  printMetric(
    "Clubes com externalId",
    clubsWithExternalId,
    totalClubs
  )

  printMetric(
    "Clubes com escudo",
    clubsWithImage,
    totalClubs
  )

  printMetric(
    "Jogadores vinculados a clube",
    playersWithClub,
    totalPlayers
  )

  /* ======================================
     LIGAS
  ====================================== */

  const totalLeagues =
    await prisma.league.count()

  const leaguesWithExternalId =
    await prisma.league.count({
      where: {
        externalId: {
          not:
            null,
        },
      },
    })

  console.log(
    "\n========================================"
  )

  console.log(
    "🏆 LIGAS"
  )

  console.log(
    "========================================"
  )

  printMetric(
    "Total de ligas",
    totalLeagues
  )

  printMetric(
    "Ligas com externalId",
    leaguesWithExternalId,
    totalLeagues
  )

  /* ======================================
     ATRIBUTOS
  ====================================== */

  const totalAttributes =
    await prisma.playerAttributes.count()

  console.log(
    "\n========================================"
  )

  console.log(
    "📊 ATTRIBUTES"
  )

  console.log(
    "========================================"
  )

  printMetric(
    "Players com attributes",
    totalAttributes,
    totalPlayers
  )

  if (
    totalAttributes ===
    totalPlayers
  ) {
    console.log(
      "✅ Todos os jogadores possuem PlayerAttributes."
    )
  } else {
    console.warn(
      `⚠️ ${
        totalPlayers -
        totalAttributes
      } jogador(es) sem PlayerAttributes.`
    )
  }

  /* ======================================
     PLAYSTYLES
  ====================================== */

  const totalPlayStyles =
    await prisma.playStyle.count()

  const totalPlayerPlayStyles =
    await prisma.playerPlayStyle.count()

  const playersWithPlayStyles =
    await prisma.player.count({
      where: {
        playStyles: {
          some: {},
        },
      },
    })

  const playStylesPlus =
    await prisma.playerPlayStyle.count({
      where: {
        level:
          "plus",
      },
    })

  const normalPlayStyles =
    await prisma.playerPlayStyle.count({
      where: {
        level:
          "normal",
      },
    })

  const invalidPlayStyleLevels =
    await prisma.playerPlayStyle.count({
      where: {
        level: {
          notIn: [
            "normal",
            "plus",
          ],
        },
      },
    })

  console.log(
    "\n========================================"
  )

  console.log(
    "✨ PLAYSTYLES"
  )

  console.log(
    "========================================"
  )

  printMetric(
    "PlayStyles cadastrados",
    totalPlayStyles
  )

  printMetric(
    "Relações Player ↔ PlayStyle",
    totalPlayerPlayStyles
  )

  printMetric(
    "Jogadores com PlayStyle",
    playersWithPlayStyles,
    totalPlayers
  )

  printMetric(
    "PlayStyles normais",
    normalPlayStyles,
    totalPlayerPlayStyles
  )

  printMetric(
    "PlayStyle+",
    playStylesPlus,
    totalPlayerPlayStyles
  )

  console.log(
    `Levels inválidos: ${invalidPlayStyleLevels}`
  )

  if (
    invalidPlayStyleLevels ===
    0
  ) {
    console.log(
      "✅ Todos os levels são normal ou plus."
    )
  } else {
    console.warn(
      "⚠️ Existem levels de PlayStyle inválidos."
    )
  }

  /* ======================================
     PLAYSTYLE NAME = CODE
  ====================================== */

  const rawPlayStyleNames =
  await prisma.$queryRaw<
    Array<{
      id: string
      code: string
      name: string
    }>
  >`
    SELECT
      "id",
      "code",
      "name"
    FROM "PlayStyle"
    WHERE TRIM("name") = TRIM("code")
    ORDER BY "code"
  `

  console.log(
    "\nPlayStyles com name = code:",
    rawPlayStyleNames.length
  )

  if (
    rawPlayStyleNames.length ===
    0
  ) {
    console.log(
      "✅ Nenhum PlayStyle usando code como nome."
    )
  } else {
    console.warn(
      "⚠️ Ainda existem PlayStyles usando code como name:"
    )

    console.dir(
      rawPlayStyleNames,
      {
        depth:
          null,
      }
    )
  }

  /* ======================================
     RELAÇÕES PLAYSTYLE DUPLICADAS
  ====================================== */

  /*
    O schema possui:

    @@unique([playerId, playStyleId])

    portanto duplicação não deveria ser
    possível.

    Ainda assim auditamos diretamente.
  */

  const duplicatePlayerPlayStyles =
    await prisma.playerPlayStyle.groupBy({
      by: [
        "playerId",
        "playStyleId",
      ],

      _count: {
        id:
          true,
      },

      having: {
        id: {
          _count: {
            gt:
              1,
          },
        },
      },
    })

  console.log(
    "\nRelações PlayStyle duplicadas:",
    duplicatePlayerPlayStyles.length
  )

  if (
    duplicatePlayerPlayStyles.length ===
    0
  ) {
    console.log(
      "✅ Nenhuma relação PlayerPlayStyle duplicada."
    )
  } else {
    console.warn(
      "⚠️ Existem relações PlayerPlayStyle duplicadas."
    )
  }

  /* ======================================
     SYNC ERRORS
  ====================================== */

  const totalSyncErrors =
    await prisma.syncError.count({
      where: {
        provider:
          "ea-ratings",
      },
    })

  const unresolvedSyncErrors =
    await prisma.syncError.count({
      where: {
        provider:
          "ea-ratings",

        resolved:
          false,
      },
    })

  console.log(
    "\n========================================"
  )

  console.log(
    "🚨 SYNC ERRORS"
  )

  console.log(
    "========================================"
  )

  console.log(
    `Total registrado: ${totalSyncErrors}`
  )

  console.log(
    `Não resolvidos: ${unresolvedSyncErrors}`
  )

  if (
    unresolvedSyncErrors ===
    0
  ) {
    console.log(
      "✅ Nenhum SyncError da EA pendente."
    )
  } else {
    console.warn(
      "⚠️ Existem SyncErrors não resolvidos."
    )
  }

  /* ======================================
     RESUMO DE INTEGRIDADE
  ====================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "🧪 RESUMO DE INTEGRIDADE"
  )

  console.log(
    "========================================"
  )

  const checks = [
    {
      label:
        `Total = ${EXPECTED_EA_PLAYERS}`,

      ok:
        totalPlayers ===
        EXPECTED_EA_PLAYERS,
    },

    {
      label:
        "Todos possuem externalId",

      ok:
        playersWithExternalId ===
        totalPlayers,
    },

    {
      label:
        "ExternalId duplicado = 0",

      ok:
        externalIdGroups.length ===
        0,
    },

    {
      label:
        "Slug duplicado = 0",

      ok:
        slugGroups.length ===
        0,
    },

    {
      label:
        "Todos possuem attributes",

      ok:
        totalAttributes ===
        totalPlayers,
    },

    {
      label:
        "Skill Moves inválido = 0",

      ok:
        invalidSkillMoves.length ===
        0,
    },

    {
      label:
        "Weak Foot inválido = 0",

      ok:
        invalidWeakFoot.length ===
        0,
    },

    {
      label:
        "Posição principal repetida = 0",

      ok:
        primaryInsideSecondaryCount ===
        0,
    },

    {
      label:
        "PlayerPlayStyle duplicado = 0",

      ok:
        duplicatePlayerPlayStyles
          .length ===
        0,
    },

    {
      label:
        "PlayStyle level inválido = 0",

      ok:
        invalidPlayStyleLevels ===
        0,
    },

    {
      label:
        "PlayStyle name = code = 0",

      ok:
        rawPlayStyleNames.length ===
        0,
    },

    {
      label:
        "SyncError pendente = 0",

      ok:
        unresolvedSyncErrors ===
        0,
    },

    {
      label:
        "SyncState completed",

      ok:
        syncState?.status ===
        "completed",
    },

    {
      label:
        `Sync offset = ${EXPECTED_EA_PLAYERS}`,

      ok:
        syncState?.offset ===
        EXPECTED_EA_PLAYERS,
    },
  ]

  let failedChecks =
    0

  for (
    const check
    of checks
  ) {
    if (
      check.ok
    ) {
      console.log(
        `✅ ${check.label}`
      )
    } else {
      failedChecks++

      console.log(
        `❌ ${check.label}`
      )
    }
  }

  /* ======================================
     RESULTADO FINAL
  ====================================== */

  console.log(
    "\n========================================"
  )

  if (
    failedChecks ===
    0
  ) {
    console.log(
      "✅ AUDITORIA FINALIZADA SEM ERROS DE INTEGRIDADE."
    )
  } else {
    console.warn(
      `⚠️ AUDITORIA FINALIZADA COM ${failedChecks} ALERTA(S) DE INTEGRIDADE.`
    )
  }

  console.log(
    "========================================"
  )
}

/* ========================================
   EXECUTAR
======================================== */

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "\n❌ AUDITORIA FALHOU:"
      )

      console.error(
        error
      )

      process.exitCode =
        1
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect()
    }
  )