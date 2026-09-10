import type {
  Player,
  PlayerForm,
  PlayerPlayStyle,
  PlayerPosition,
} from "../types/player"

/* ========================================
   DATABASE PLAYER
======================================== */

export type DatabasePlayer = {
  id: string
  slug: string
  name: string

  dateOfBirth: Date | null
  nationality: string | null

  position: string

  secondaryPosition:
    | string
    | null

  secondaryPositions:
    string[]

  preferredFoot:
    | string
    | null

  height:
    | number
    | null

  skillMoves:
    | number
    | null

  weakFootAbility:
    | number
    | null

  imageUrl:
    | string
    | null

  officialOverall:
    number

  dynamicOverall:
    | number
    | null

  potential:
    | number
    | null

  marketValue:
    | bigint
    | null

  marketCurrency:
    | string
    | null

  form:
    | string
    | null

  club: {
    slug?: string
    name: string

    imageUrl:
      | string
      | null

    league: {
      slug?: string
      name: string
    }
  } | null

  attributes: {
    pace: number
    acceleration: number
    sprintSpeed: number

    shooting: number
    positioning: number
    finishing: number
    shotPower: number
    longShots: number
    volleys: number
    penalties: number

    passing: number
    vision: number
    crossing: number
    freeKickAccuracy: number
    shortPassing: number
    longPassing: number
    curve: number

    dribbling: number
    agility: number
    balance: number
    reactions: number
    ballControl: number
    dribblingStat: number
    composure: number

    defending: number
    interceptions: number
    headingAccuracy: number
    defensiveAwareness: number
    standingTackle: number
    slidingTackle: number

    physical: number
    jumping: number
    stamina: number
    strength: number
    aggression: number
  } | null

  playStyles: {
    level: string

    playStyle: {
      code: string
      name: string
    }
  }[]
}

/* ========================================
   POSIÇÕES VÁLIDAS
======================================== */

const validPositions:
  PlayerPosition[] = [
    "GOL",
    "LD",
    "LE",
    "ZAG",
    "VOL",
    "MC",
    "MEI",
    "PD",
    "PE",
    "ATA",
  ]

/* ========================================
   IDADE
======================================== */

export function calculateAge(
  dateOfBirth:
    | Date
    | null
): number | null {
  if (!dateOfBirth) {
    return null
  }

  const today =
    new Date()

  let age =
    today.getFullYear() -
    dateOfBirth.getFullYear()

  const monthDifference =
    today.getMonth() -
    dateOfBirth.getMonth()

  if (
    monthDifference < 0 ||
    (
      monthDifference === 0 &&
      today.getDate() <
        dateOfBirth.getDate()
    )
  ) {
    age--
  }

  return age
}

/* ========================================
   POSIÇÃO PRINCIPAL
======================================== */

function mapPosition(
  position: string
): PlayerPosition {
  if (
    validPositions.includes(
      position as PlayerPosition
    )
  ) {
    return position as PlayerPosition
  }

  throw new Error(
    `Posição inválida encontrada no banco: ${position}`
  )
}

/* ========================================
   POSIÇÃO SECUNDÁRIA LEGADA
======================================== */

function mapOptionalPosition(
  position:
    | string
    | null
): PlayerPosition | undefined {
  if (!position) {
    return undefined
  }

  if (
    validPositions.includes(
      position as PlayerPosition
    )
  ) {
    return position as PlayerPosition
  }

  return undefined
}

/* ========================================
   POSIÇÕES SECUNDÁRIAS
======================================== */

function mapSecondaryPositions(
  positions: string[]
): PlayerPosition[] {
  return positions
    .filter(
      (
        position
      ) =>
        validPositions.includes(
          position as PlayerPosition
        )
    )
    .map(
      (
        position
      ) =>
        position as PlayerPosition
    )
}

/* ========================================
   PÉ PREFERIDO
======================================== */

function mapPreferredFoot(
  preferredFoot:
    | string
    | null
):
  | "Direito"
  | "Esquerdo"
  | null {
  if (
    preferredFoot ===
    "Direito"
  ) {
    return "Direito"
  }

  if (
    preferredFoot ===
    "Esquerdo"
  ) {
    return "Esquerdo"
  }

  return null
}

/* ========================================
   FORMA
======================================== */

function mapForm(
  form:
    | string
    | null
): PlayerForm | null {
  if (!form) {
    return null
  }

  const validForms:
    PlayerForm[] = [
      "Péssima",
      "Ruim",
      "Normal",
      "Boa",
      "Excelente",
    ]

  if (
    validForms.includes(
      form as PlayerForm
    )
  ) {
    return form as PlayerForm
  }

  return null
}

/* ========================================
   PLAYSTYLES
======================================== */

function mapPlayStyles(
  playStyles:
    DatabasePlayer["playStyles"]
): PlayerPlayStyle[] {
  return playStyles.map(
    (
      playerPlayStyle
    ) => ({
      id:
        playerPlayStyle
          .playStyle.code,

      name:
        playerPlayStyle
          .playStyle.name,

      level:
        playerPlayStyle
          .level === "plus"
          ? "plus"
          : "normal",
    })
  )
}

/* ========================================
   DATABASE → PLAYER
======================================== */

export type PlayerProfile =
  | { status: "ready"; player: Player }
  | { status: "incomplete"; name: string }

// Keep the complete catalog DTO strict; do not invent attributes for a partial row.
export function mapDatabasePlayerProfile(databasePlayer: DatabasePlayer): PlayerProfile {
  if (!databasePlayer.attributes) {
    return { status: "incomplete", name: databasePlayer.name }
  }
  return { status: "ready", player: mapDatabasePlayer(databasePlayer) }
}

export function mapDatabasePlayer(
  databasePlayer:
    DatabasePlayer
): Player {
  const attributes =
    databasePlayer.attributes

  if (!attributes) {
    throw new Error(
      `Jogador ${databasePlayer.name} não possui atributos cadastrados`
    )
  }

  return {
    id:
      databasePlayer.id,

    slug:
      databasePlayer.slug,

    name:
      databasePlayer.name,

    /* ======================================
       DADOS PESSOAIS
    ====================================== */

    age:
      calculateAge(
        databasePlayer.dateOfBirth
      ),

    nationality:
      databasePlayer.nationality,

    preferredFoot:
      mapPreferredFoot(
        databasePlayer.preferredFoot
      ),

    height:
      databasePlayer.height,

    image:
      databasePlayer.imageUrl ??
      undefined,

    /* ======================================
       PERFIL TÉCNICO
    ====================================== */

    skillMoves:
      databasePlayer.skillMoves,

    weakFootAbility:
      databasePlayer
        .weakFootAbility,

    /* ======================================
       POSIÇÕES
    ====================================== */

    position:
      mapPosition(
        databasePlayer.position
      ),

    secondaryPosition:
      mapOptionalPosition(
        databasePlayer
          .secondaryPosition
      ),

    secondaryPositions:
      mapSecondaryPositions(
        databasePlayer
          .secondaryPositions
      ),

    /* ======================================
       CLUBE / LIGA
    ====================================== */

    club:
      databasePlayer.club
        ? {
            slug: databasePlayer.club.slug ?? null,
            name:
              databasePlayer
                .club.name,

            imageUrl:
              databasePlayer
                .club.imageUrl,
          }
        : null,

    leagueSlug: databasePlayer.club?.league.slug ?? null,
    league:
      databasePlayer
        .club?.league.name ??
      null,

    /* ======================================
       OVERALL
    ====================================== */

    baseOverall:
      databasePlayer
        .officialOverall,

    dynamicOverall:
      databasePlayer
        .dynamicOverall,

    potential:
      databasePlayer.potential,

    /* ======================================
       FORMA
    ====================================== */

    form:
      mapForm(
        databasePlayer.form
      ),

    /* ======================================
       MERCADO
    ====================================== */

    marketValue:
      databasePlayer
        .marketValue !== null
        ? Number(
            databasePlayer
              .marketValue
          )
        : null,

    valueTrend: null,

    /* ======================================
       PLAYSTYLES
    ====================================== */

    playStyles:
      mapPlayStyles(
        databasePlayer.playStyles
      ),

    /* ======================================
       ATRIBUTOS
    ====================================== */

    attributes: {
      pace: {
        overall:
          attributes.pace,

        acceleration:
          attributes.acceleration,

        sprintSpeed:
          attributes.sprintSpeed,
      },

      shooting: {
        overall:
          attributes.shooting,

        positioning:
          attributes.positioning,

        finishing:
          attributes.finishing,

        shotPower:
          attributes.shotPower,

        longShots:
          attributes.longShots,

        volleys:
          attributes.volleys,

        penalties:
          attributes.penalties,
      },

      passing: {
        overall:
          attributes.passing,

        vision:
          attributes.vision,

        crossing:
          attributes.crossing,

        freeKickAccuracy:
          attributes
            .freeKickAccuracy,

        shortPassing:
          attributes.shortPassing,

        longPassing:
          attributes.longPassing,

        curve:
          attributes.curve,
      },

      dribbling: {
        overall:
          attributes.dribbling,

        agility:
          attributes.agility,

        balance:
          attributes.balance,

        reactions:
          attributes.reactions,

        ballControl:
          attributes.ballControl,

        dribbling:
          attributes.dribblingStat,

        composure:
          attributes.composure,
      },

      defending: {
        overall:
          attributes.defending,

        interceptions:
          attributes.interceptions,

        headingAccuracy:
          attributes.headingAccuracy,

        defensiveAwareness:
          attributes
            .defensiveAwareness,

        standingTackle:
          attributes.standingTackle,

        slidingTackle:
          attributes.slidingTackle,
      },

      physical: {
        overall:
          attributes.physical,

        jumping:
          attributes.jumping,

        stamina:
          attributes.stamina,

        strength:
          attributes.strength,

        aggression:
          attributes.aggression,
      },
    },
  }
}
