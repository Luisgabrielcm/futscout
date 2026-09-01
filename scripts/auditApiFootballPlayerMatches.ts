import "dotenv/config"

import { prisma } from "../lib/prisma"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const LIMIT = 20

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "\n========================================"
  )

  console.log(
    "AUDITORIA - API-FOOTBALL PLAYER IDs"
  )

  console.log(
    "========================================"
  )

  /* ======================================
     1. JOGADORES ASSOCIADOS
  ====================================== */

  const players =
    await prisma.player.findMany({
      where: {
        apiFootballId: {
          not: null,
        },
      },

      select: {
        id: true,
        externalId: true,
        name: true,
        slug: true,
        apiFootballId: true,
        dateOfBirth: true,
        nationality: true,
        officialOverall: true,

        club: {
          select: {
            name: true,
            apiFootballId: true,
          },
        },
      },

      orderBy: {
        officialOverall: "desc",
      },

      take: LIMIT,
    })

  /* ======================================
     2. CONTAGEM TOTAL
  ====================================== */

  const totalWithApiFootballId =
    await prisma.player.count({
      where: {
        apiFootballId: {
          not: null,
        },
      },
    })

  const totalWithoutApiFootballId =
    await prisma.player.count({
      where: {
        apiFootballId: null,
      },
    })

  const totalPlayers =
    await prisma.player.count()

  /* ======================================
     3. MOSTRAR JOGADORES
  ====================================== */

  console.log(
    `\nPrimeiros ${players.length} jogadores associados:`
  )

  for (const player of players) {
    console.log(
      "\n----------------------------------------"
    )

    console.log({
      name:
        player.name,

      slug:
        player.slug,

      eaExternalId:
        player.externalId,

      apiFootballId:
        player.apiFootballId,

      birth:
        player.dateOfBirth
          ?.toISOString()
          .slice(0, 10) ??
        null,

      nationality:
        player.nationality,

      overall:
        player.officialOverall,

      club:
        player.club?.name ??
        null,

      clubApiFootballId:
        player.club
          ?.apiFootballId ??
        null,
    })
  }

  /* ======================================
     4. VERIFICAR DUPLICADOS
  ====================================== */

  const duplicatedIds =
    await prisma.$queryRaw<
      Array<{
        apiFootballId: number
        total: bigint
      }>
    >`
      SELECT
        "apiFootballId",
        COUNT(*) AS "total"
      FROM "Player"
      WHERE "apiFootballId" IS NOT NULL
      GROUP BY "apiFootballId"
      HAVING COUNT(*) > 1
    `

  /* ======================================
     5. JOGADORES ASSOCIADOS SEM CLUBE ID
  ====================================== */

  const playersWithUnmappedClub =
    await prisma.player.findMany({
      where: {
        apiFootballId: {
          not: null,
        },

        club: {
          apiFootballId: null,
        },
      },

      select: {
        name: true,
        apiFootballId: true,

        club: {
          select: {
            name: true,
            apiFootballId: true,
          },
        },
      },
    })

  /* ======================================
     6. RESUMO
  ====================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "RESUMO DA AUDITORIA"
  )

  console.log(
    "========================================"
  )

  console.log({
    totalPlayers,

    comApiFootballId:
      totalWithApiFootballId,

    semApiFootballId:
      totalWithoutApiFootballId,

    apiFootballIdsDuplicados:
      duplicatedIds.length,

    jogadoresAssociadosComClubeSemApiId:
      playersWithUnmappedClub.length,
  })

  /* ======================================
     7. DUPLICADOS
  ====================================== */

  if (
    duplicatedIds.length > 0
  ) {
    console.log(
      "\n⚠️ DUPLICADOS ENCONTRADOS:"
    )

    for (
      const duplicated of
        duplicatedIds
    ) {
      console.log({
        apiFootballId:
          duplicated.apiFootballId,

        quantidade:
          Number(
            duplicated.total
          ),
      })
    }
  } else {
    console.log(
      "\n✅ Nenhum apiFootballId duplicado."
    )
  }

  /* ======================================
     8. CLUBES NÃO MAPEADOS
  ====================================== */

  if (
    playersWithUnmappedClub.length >
    0
  ) {
    console.log(
      "\n⚠️ Jogadores associados com clube sem apiFootballId:"
    )

    for (
      const player of
        playersWithUnmappedClub
    ) {
      console.log({
        player:
          player.name,

        apiFootballId:
          player.apiFootballId,

        club:
          player.club?.name ??
          null,
      })
    }
  } else {
    console.log(
      "✅ Todos os jogadores associados possuem clube mapeado."
    )
  }

  console.log(
    "\n========================================"
  )

  console.log(
    "AUDITORIA FINALIZADA"
  )

  console.log(
    "========================================"
  )
}

main()
  .catch((error) => {
    console.error(
      "Erro na auditoria:",
      error
    )

    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })