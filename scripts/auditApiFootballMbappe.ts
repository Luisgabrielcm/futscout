import "dotenv/config"

import { prisma } from "../lib/prisma"

async function main() {
  const player =
    await prisma.player.findUnique({
      where: {
        slug: "kylian-mbappe",
      },

      include: {
        realLifeStats: {
          orderBy: [
            {
              season: "desc",
            },
            {
              competitionName:
                "asc",
            },
          ],
        },

        transfers: {
          orderBy: {
            transferDate: "asc",
          },
        },

        trophies: {
          orderBy: [
            {
              season: "asc",
            },
            {
              competition:
                "asc",
            },
          ],
        },
      },
    })

  if (!player) {
    throw new Error(
      "Kylian Mbappé não encontrado."
    )
  }

  console.log(
    "\n========================================"
  )

  console.log(
    "AUDITORIA API-FOOTBALL - MBAPPÉ"
  )

  console.log(
    "========================================"
  )

  console.log(
    `Jogador: ${player.name}`
  )

  console.log(
    `FutScout ID: ${player.id}`
  )

  console.log(
    `API-Football ID: ${player.apiFootballId}`
  )

  /* ========================================
     ESTATÍSTICAS
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "ESTATÍSTICAS"
  )

  console.log(
    "========================================"
  )

  console.log(
    `Total de registros: ${player.realLifeStats.length}`
  )

  const seasons =
    new Map<
      number,
      number
    >()

  for (
    const stat of
      player.realLifeStats
  ) {
    seasons.set(
      stat.season,
      (seasons.get(
        stat.season
      ) ?? 0) + 1
    )
  }

  for (
    const [
      season,
      total,
    ] of seasons
  ) {
    console.log(
      `${season}: ${total} competições`
    )
  }

  /* ========================================
     TRANSFERÊNCIAS
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "TRANSFERÊNCIAS"
  )

  console.log(
    "========================================"
  )

  console.log(
    `Total: ${player.transfers.length}`
  )

  for (
    const transfer of
      player.transfers
  ) {
    console.log(
      "\n----------------------------------------"
    )

    console.log(
      `Data: ${transfer.transferDate
        .toISOString()
        .slice(0, 10)}`
    )

    console.log(
      `De: ${transfer.fromTeamName}`
    )

    console.log(
      `Para: ${transfer.toTeamName}`
    )

    console.log(
      `Tipo/valor: ${transfer.rawTransferType ?? "Não informado"}`
    )

    console.log(
      `From Team ID: ${transfer.fromTeamApiId ?? "—"}`
    )

    console.log(
      `To Team ID: ${transfer.toTeamApiId ?? "—"}`
    )
  }

  /* ========================================
     CONQUISTAS
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "CONQUISTAS / CAMPANHAS"
  )

  console.log(
    "========================================"
  )

  console.log(
    `Total: ${player.trophies.length}`
  )

  const winners =
    player.trophies.filter(
      (trophy) =>
        trophy.place ===
        "Winner"
    )

  const runnerUps =
    player.trophies.filter(
      (trophy) =>
        trophy.place ===
        "2nd Place"
    )

  console.log(
    `Campeão: ${winners.length}`
  )

  console.log(
    `Vice: ${runnerUps.length}`
  )

  /* ========================================
     DUPLICAÇÕES
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "VERIFICAÇÃO DE DUPLICAÇÕES"
  )

  console.log(
    "========================================"
  )

  const statKeys =
    new Set<string>()

  let duplicatedStats =
    0

  for (
    const stat of
      player.realLifeStats
  ) {
    const key =
      [
        stat.season,
        stat.apiTeamId,
        stat.apiLeagueId,
      ].join("|")

    if (
      statKeys.has(key)
    ) {
      duplicatedStats++
    }

    statKeys.add(key)
  }

  const transferKeys =
    new Set<string>()

  let duplicatedTransfers =
    0

  for (
    const transfer of
      player.transfers
  ) {
    const key =
      [
        transfer.transferDate
          .toISOString()
          .slice(0, 10),
        transfer.fromTeamName,
        transfer.toTeamName,
      ].join("|")

    if (
      transferKeys.has(
        key
      )
    ) {
      duplicatedTransfers++
    }

    transferKeys.add(
      key
    )
  }

  const trophyKeys =
    new Set<string>()

  let duplicatedTrophies =
    0

  for (
    const trophy of
      player.trophies
  ) {
    const key =
      [
        trophy.country,
        trophy.competition,
        trophy.season,
        trophy.place,
      ].join("|")

    if (
      trophyKeys.has(key)
    ) {
      duplicatedTrophies++
    }

    trophyKeys.add(key)
  }

  console.log(
    `Estatísticas duplicadas: ${duplicatedStats}`
  )

  console.log(
    `Transferências duplicadas: ${duplicatedTransfers}`
  )

  console.log(
    `Conquistas duplicadas: ${duplicatedTrophies}`
  )

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
  .catch(
    (error) => {
      console.error(
        "Erro na auditoria:",
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