import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../app/generated/prisma/client"

const connectionString = process.env.DIRECT_URL

if (!connectionString) {
  throw new Error(
    "DIRECT_URL não encontrada no .env"
  )
}

const adapter = new PrismaPg({
  connectionString,
})

const prisma = new PrismaClient({
  adapter,
})

async function main() {
  console.log("🌱 Iniciando seed do FutScout...")

  /* ========================================
     LIGAS
  ======================================== */

  const bundesliga =
    await prisma.league.upsert({
      where: {
        slug: "bundesliga",
      },

      update: {
        name: "Bundesliga",
        country: "Alemanha",
      },

      create: {
        name: "Bundesliga",
        slug: "bundesliga",
        country: "Alemanha",
      },
    })

  const laLiga =
    await prisma.league.upsert({
      where: {
        slug: "laliga",
      },

      update: {
        name: "LaLiga",
        country: "Espanha",
      },

      create: {
        name: "LaLiga",
        slug: "laliga",
        country: "Espanha",
      },
    })

  console.log("✅ Ligas sincronizadas")

  /* ========================================
     CLUBES
  ======================================== */

  const bayern =
    await prisma.club.upsert({
      where: {
        slug: "bayern-munchen",
      },

      update: {
        name: "Bayern München",
        leagueId: bundesliga.id,
      },

      create: {
        name: "Bayern München",
        slug: "bayern-munchen",
        leagueId: bundesliga.id,
      },
    })

  const barcelona =
    await prisma.club.upsert({
      where: {
        slug: "barcelona",
      },

      update: {
        name: "Barcelona",
        leagueId: laLiga.id,
      },

      create: {
        name: "Barcelona",
        slug: "barcelona",
        leagueId: laLiga.id,
      },
    })

  const realMadrid =
    await prisma.club.upsert({
      where: {
        slug: "real-madrid",
      },

      update: {
        name: "Real Madrid",
        leagueId: laLiga.id,
      },

      create: {
        name: "Real Madrid",
        slug: "real-madrid",
        leagueId: laLiga.id,
      },
    })

  console.log("✅ Clubes sincronizados")

  /* ========================================
     JOGADORES
  ======================================== */

  const musiala =
    await prisma.player.upsert({
      where: {
        slug: "jamal-musiala",
      },

      update: {
        name: "Jamal Musiala",
        dateOfBirth: new Date("2003-02-26"),
        nationality: "Alemanha",

        position: "MEI",
        secondaryPosition: "PE",

        preferredFoot: "Direito",
        height: 184,

        imageUrl: "/players/musiala.png",

        clubId: bayern.id,

        officialOverall: 86,
        dynamicOverall: 88,
        potential: 91,

        marketValue: BigInt(112000000),
        marketCurrency: "EUR",

        form: "Excelente",
      },

      create: {
        slug: "jamal-musiala",
        name: "Jamal Musiala",

        dateOfBirth: new Date("2003-02-26"),

        nationality: "Alemanha",

        position: "MEI",
        secondaryPosition: "PE",

        preferredFoot: "Direito",
        height: 184,

        imageUrl: "/players/musiala.png",

        clubId: bayern.id,

        officialOverall: 86,
        dynamicOverall: 88,
        potential: 91,

        marketValue: BigInt(112000000),
        marketCurrency: "EUR",

        form: "Excelente",
      },
    })

  const pedri =
    await prisma.player.upsert({
      where: {
        slug: "pedri",
      },

      update: {
        name: "Pedri",
        dateOfBirth: new Date("2002-11-25"),
        nationality: "Espanha",

        position: "MC",
        secondaryPosition: "MEI",

        preferredFoot: "Direito",
        height: 174,

        imageUrl: "/players/pedri.png",

        clubId: barcelona.id,

        officialOverall: 86,
        dynamicOverall: 85,
        potential: 92,

        marketValue: BigInt(105000000),
        marketCurrency: "EUR",

        form: "Normal",
      },

      create: {
        slug: "pedri",
        name: "Pedri",

        dateOfBirth: new Date("2002-11-25"),

        nationality: "Espanha",

        position: "MC",
        secondaryPosition: "MEI",

        preferredFoot: "Direito",
        height: 174,

        imageUrl: "/players/pedri.png",

        clubId: barcelona.id,

        officialOverall: 86,
        dynamicOverall: 85,
        potential: 92,

        marketValue: BigInt(105000000),
        marketCurrency: "EUR",

        form: "Normal",
      },
    })

  const bellingham =
    await prisma.player.upsert({
      where: {
        slug: "jude-bellingham",
      },

      update: {
        name: "Jude Bellingham",
        dateOfBirth: new Date("2003-06-29"),
        nationality: "Inglaterra",

        position: "MC",
        secondaryPosition: "MEI",

        preferredFoot: "Direito",
        height: 186,

        imageUrl:
          "/players/bellingham.png",

        clubId: realMadrid.id,

        officialOverall: 88,
        dynamicOverall: 90,
        potential: 94,

        marketValue: BigInt(145000000),
        marketCurrency: "EUR",

        form: "Excelente",
      },

      create: {
        slug: "jude-bellingham",
        name: "Jude Bellingham",

        dateOfBirth: new Date("2003-06-29"),

        nationality: "Inglaterra",

        position: "MC",
        secondaryPosition: "MEI",

        preferredFoot: "Direito",
        height: 186,

        imageUrl:
          "/players/bellingham.png",

        clubId: realMadrid.id,

        officialOverall: 88,
        dynamicOverall: 90,
        potential: 94,

        marketValue: BigInt(145000000),
        marketCurrency: "EUR",

        form: "Excelente",
      },
    })

  const vinicius =
    await prisma.player.upsert({
      where: {
        slug: "vinicius-junior",
      },

      update: {
        name: "Vinícius Júnior",
        dateOfBirth: new Date("2000-07-12"),
        nationality: "Brasil",

        position: "PE",
        secondaryPosition: "ATA",

        preferredFoot: "Direito",
        height: 176,

        imageUrl:
          "/players/vinicius.png",

        clubId: realMadrid.id,

        officialOverall: 89,
        dynamicOverall: 91,
        potential: 93,

        marketValue: BigInt(150000000),
        marketCurrency: "EUR",

        form: "Excelente",
      },

      create: {
        slug: "vinicius-junior",
        name: "Vinícius Júnior",

        dateOfBirth: new Date("2000-07-12"),

        nationality: "Brasil",

        position: "PE",
        secondaryPosition: "ATA",

        preferredFoot: "Direito",
        height: 176,

        imageUrl:
          "/players/vinicius.png",

        clubId: realMadrid.id,

        officialOverall: 89,
        dynamicOverall: 91,
        potential: 93,

        marketValue: BigInt(150000000),
        marketCurrency: "EUR",

        form: "Excelente",
      },
    })

  console.log("✅ Jogadores sincronizados")

  /* ========================================
     ATRIBUTOS — MUSIALA
  ======================================== */

  await prisma.playerAttributes.upsert({
    where: {
      playerId: musiala.id,
    },

    update: {
      pace: 84,
      acceleration: 88,
      sprintSpeed: 80,

      shooting: 82,
      positioning: 86,
      finishing: 84,
      shotPower: 79,
      longShots: 81,
      volleys: 78,
      penalties: 75,

      passing: 85,
      vision: 89,
      crossing: 81,
      freeKickAccuracy: 78,
      shortPassing: 88,
      longPassing: 83,
      curve: 84,

      dribbling: 92,
      agility: 94,
      balance: 93,
      reactions: 88,
      ballControl: 93,
      dribblingStat: 94,
      composure: 89,

      defending: 63,
      interceptions: 66,
      headingAccuracy: 58,
      defensiveAwareness: 60,
      standingTackle: 64,
      slidingTackle: 61,

      physical: 71,
      jumping: 69,
      stamina: 77,
      strength: 66,
      aggression: 72,
    },

    create: {
      playerId: musiala.id,

      pace: 84,
      acceleration: 88,
      sprintSpeed: 80,

      shooting: 82,
      positioning: 86,
      finishing: 84,
      shotPower: 79,
      longShots: 81,
      volleys: 78,
      penalties: 75,

      passing: 85,
      vision: 89,
      crossing: 81,
      freeKickAccuracy: 78,
      shortPassing: 88,
      longPassing: 83,
      curve: 84,

      dribbling: 92,
      agility: 94,
      balance: 93,
      reactions: 88,
      ballControl: 93,
      dribblingStat: 94,
      composure: 89,

      defending: 63,
      interceptions: 66,
      headingAccuracy: 58,
      defensiveAwareness: 60,
      standingTackle: 64,
      slidingTackle: 61,

      physical: 71,
      jumping: 69,
      stamina: 77,
      strength: 66,
      aggression: 72,
    },
  })

  /* ========================================
     ATRIBUTOS — PEDRI
  ======================================== */

  await prisma.playerAttributes.upsert({
    where: {
      playerId: pedri.id,
    },

    update: {
      pace: 80,
      acceleration: 84,
      sprintSpeed: 76,

      shooting: 77,
      positioning: 81,
      finishing: 78,
      shotPower: 74,
      longShots: 79,
      volleys: 72,
      penalties: 71,

      passing: 86,
      vision: 91,
      crossing: 82,
      freeKickAccuracy: 79,
      shortPassing: 91,
      longPassing: 88,
      curve: 84,

      dribbling: 88,
      agility: 91,
      balance: 90,
      reactions: 87,
      ballControl: 91,
      dribblingStat: 88,
      composure: 91,

      defending: 70,
      interceptions: 75,
      headingAccuracy: 55,
      defensiveAwareness: 72,
      standingTackle: 71,
      slidingTackle: 68,

      physical: 74,
      jumping: 61,
      stamina: 88,
      strength: 65,
      aggression: 75,
    },

    create: {
      playerId: pedri.id,

      pace: 80,
      acceleration: 84,
      sprintSpeed: 76,

      shooting: 77,
      positioning: 81,
      finishing: 78,
      shotPower: 74,
      longShots: 79,
      volleys: 72,
      penalties: 71,

      passing: 86,
      vision: 91,
      crossing: 82,
      freeKickAccuracy: 79,
      shortPassing: 91,
      longPassing: 88,
      curve: 84,

      dribbling: 88,
      agility: 91,
      balance: 90,
      reactions: 87,
      ballControl: 91,
      dribblingStat: 88,
      composure: 91,

      defending: 70,
      interceptions: 75,
      headingAccuracy: 55,
      defensiveAwareness: 72,
      standingTackle: 71,
      slidingTackle: 68,

      physical: 74,
      jumping: 61,
      stamina: 88,
      strength: 65,
      aggression: 75,
    },
  })

  /* ========================================
     ATRIBUTOS — BELLINGHAM
  ======================================== */

  await prisma.playerAttributes.upsert({
    where: {
      playerId: bellingham.id,
    },

    update: {
      pace: 80,
      acceleration: 82,
      sprintSpeed: 79,

      shooting: 87,
      positioning: 91,
      finishing: 88,
      shotPower: 86,
      longShots: 85,
      volleys: 82,
      penalties: 84,

      passing: 86,
      vision: 89,
      crossing: 80,
      freeKickAccuracy: 77,
      shortPassing: 91,
      longPassing: 88,
      curve: 82,

      dribbling: 88,
      agility: 85,
      balance: 83,
      reactions: 92,
      ballControl: 91,
      dribblingStat: 88,
      composure: 94,

      defending: 78,
      interceptions: 82,
      headingAccuracy: 81,
      defensiveAwareness: 79,
      standingTackle: 80,
      slidingTackle: 74,

      physical: 85,
      jumping: 88,
      stamina: 92,
      strength: 84,
      aggression: 85,
    },

    create: {
      playerId: bellingham.id,

      pace: 80,
      acceleration: 82,
      sprintSpeed: 79,

      shooting: 87,
      positioning: 91,
      finishing: 88,
      shotPower: 86,
      longShots: 85,
      volleys: 82,
      penalties: 84,

      passing: 86,
      vision: 89,
      crossing: 80,
      freeKickAccuracy: 77,
      shortPassing: 91,
      longPassing: 88,
      curve: 82,

      dribbling: 88,
      agility: 85,
      balance: 83,
      reactions: 92,
      ballControl: 91,
      dribblingStat: 88,
      composure: 94,

      defending: 78,
      interceptions: 82,
      headingAccuracy: 81,
      defensiveAwareness: 79,
      standingTackle: 80,
      slidingTackle: 74,

      physical: 85,
      jumping: 88,
      stamina: 92,
      strength: 84,
      aggression: 85,
    },
  })

  /* ========================================
     ATRIBUTOS — VINÍCIUS
  ======================================== */

  await prisma.playerAttributes.upsert({
    where: {
      playerId: vinicius.id,
    },

    update: {
      pace: 95,
      acceleration: 97,
      sprintSpeed: 94,

      shooting: 85,
      positioning: 91,
      finishing: 88,
      shotPower: 82,
      longShots: 80,
      volleys: 78,
      penalties: 77,

      passing: 83,
      vision: 85,
      crossing: 86,
      freeKickAccuracy: 72,
      shortPassing: 86,
      longPassing: 77,
      curve: 84,

      dribbling: 92,
      agility: 96,
      balance: 91,
      reactions: 90,
      ballControl: 92,
      dribblingStat: 95,
      composure: 88,

      defending: 29,
      interceptions: 28,
      headingAccuracy: 55,
      defensiveAwareness: 26,
      standingTackle: 24,
      slidingTackle: 20,

      physical: 68,
      jumping: 72,
      stamina: 82,
      strength: 61,
      aggression: 63,
    },

    create: {
      playerId: vinicius.id,

      pace: 95,
      acceleration: 97,
      sprintSpeed: 94,

      shooting: 85,
      positioning: 91,
      finishing: 88,
      shotPower: 82,
      longShots: 80,
      volleys: 78,
      penalties: 77,

      passing: 83,
      vision: 85,
      crossing: 86,
      freeKickAccuracy: 72,
      shortPassing: 86,
      longPassing: 77,
      curve: 84,

      dribbling: 92,
      agility: 96,
      balance: 91,
      reactions: 90,
      ballControl: 92,
      dribblingStat: 95,
      composure: 88,

      defending: 29,
      interceptions: 28,
      headingAccuracy: 55,
      defensiveAwareness: 26,
      standingTackle: 24,
      slidingTackle: 20,

      physical: 68,
      jumping: 72,
      stamina: 82,
      strength: 61,
      aggression: 63,
    },
  })

  console.log("✅ Atributos sincronizados")

  /* ========================================
     CATÁLOGO DE PLAYSTYLES
  ======================================== */

  const playStyles = [
    {
      code: "finesse-shot",
      name: "Chute Colocado",
      category: "Finalização",
      description:
        "Especialidade em finalizações colocadas.",
    },

    {
      code: "power-shot",
      name: "Superchute",
      category: "Finalização",
      description:
        "Especialidade em chutes potentes.",
    },

    {
      code: "dead-ball",
      name: "Bola Parada",
      category: "Finalização",
      description:
        "Especialidade em cobranças de bola parada.",
    },

    {
      code: "chip-shot",
      name: "Cavadinha",
      category: "Finalização",
      description:
        "Especialidade em finalizações por cobertura.",
    },

    {
      code: "precision-header",
      name: "Cabeceio Preciso",
      category: "Finalização",
      description:
        "Especialidade em cabeceios ofensivos precisos.",
    },

    {
      code: "gamechanger",
      name: "Vanguarda",
      category: "Finalização",
      description:
        "Estilo voltado a ações ofensivas especiais.",
    },

    {
      code: "incisive-pass",
      name: "Passe Incisivo",
      category: "Passe",
      description:
        "Especialidade em passes que quebram linhas.",
    },

    {
      code: "pinged-pass",
      name: "Passe Forte",
      category: "Passe",
      description:
        "Especialidade em passes rápidos e fortes.",
    },

    {
      code: "long-ball-pass",
      name: "Passe Longo",
      category: "Passe",
      description:
        "Especialidade em lançamentos e passes longos.",
    },

    {
      code: "tiki-taka",
      name: "Tiki Taka",
      category: "Passe",
      description:
        "Especialidade em passes curtos e rápidos.",
    },

    {
      code: "whipped-pass",
      name: "Cruzamento Rápido",
      category: "Passe",
      description:
        "Especialidade em cruzamentos rápidos.",
    },

    {
      code: "inventive",
      name: "Criativo",
      category: "Passe",
      description:
        "Especialidade em soluções criativas de passe.",
    },

    {
      code: "technical",
      name: "Técnico",
      category: "Controle de bola",
      description:
        "Especialidade em condução e drible técnico.",
    },

    {
      code: "rapid",
      name: "Rápido",
      category: "Controle de bola",
      description:
        "Especialidade em condução em velocidade.",
    },

    {
      code: "quick-step",
      name: "Passo Rápido",
      category: "Controle de bola",
      description:
        "Especialidade em explosão nos primeiros metros.",
    },

    {
      code: "first-touch",
      name: "Primeiro Toque",
      category: "Controle de bola",
      description:
        "Especialidade no domínio da bola.",
    },

    {
      code: "press-proven",
      name: "Resistente à Pressão",
      category: "Controle de bola",
      description:
        "Especialidade em controlar e proteger a bola sob pressão.",
    },

    {
      code: "intercept",
      name: "Interceptação",
      category: "Defesa",
      description:
        "Especialidade em interceptar passes.",
    },

    {
      code: "anticipate",
      name: "Antecipação",
      category: "Defesa",
      description:
        "Especialidade na execução de desarmes.",
    },

    {
      code: "jockey",
      name: "Cercar",
      category: "Defesa",
      description:
        "Especialidade no acompanhamento defensivo.",
    },

    {
      code: "block",
      name: "Bloqueio",
      category: "Defesa",
      description:
        "Especialidade em bloquear chutes e passes.",
    },

    {
      code: "slide-tackle",
      name: "Carrinho",
      category: "Defesa",
      description:
        "Especialidade em carrinhos defensivos.",
    },

    {
      code: "enforcer",
      name: "Solidez",
      category: "Defesa",
      description:
        "Especialidade em imposição física defensiva.",
    },

    {
      code: "relentless",
      name: "Incansável",
      category: "Físico",
      description:
        "Especialidade relacionada à resistência.",
    },

    {
      code: "acrobatic",
      name: "Acrobático",
      category: "Físico",
      description:
        "Especialidade em ações acrobáticas.",
    },

    {
      code: "long-throw",
      name: "Arremesso Longo",
      category: "Físico",
      description:
        "Especialidade em cobranças de lateral longas.",
    },

    {
      code: "aerial-fortress",
      name: "Força Aérea",
      category: "Físico",
      description:
        "Especialidade em disputas aéreas.",
    },
  ]

  for (const playStyle of playStyles) {
    await prisma.playStyle.upsert({
      where: {
        code: playStyle.code,
      },

      update: {
        name: playStyle.name,
        category: playStyle.category,
        description:
          playStyle.description,
      },

      create: {
        code: playStyle.code,
        name: playStyle.name,
        category: playStyle.category,
        description:
          playStyle.description,
      },
    })
  }

  console.log(
    `✅ ${playStyles.length} PlayStyles sincronizados`
  )

  console.log(
    "✅ Seed do FutScout concluído!"
  )
}

main()
  .catch((error) => {
    console.error(
      "❌ Erro ao executar seed:"
    )

    console.error(error)

    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })