import type {
  EARatingsPlayer,
  EARatingsPlayerStats,
  EARatingsValueStat,
} from "../types/eaRatingsPlayer"

import type {
  ExternalPlayer,
} from "../types/externalPlayer"
import { getVisualAssetSrc } from "../lib/visualAssets"

/* ========================================
   STAT VALUE
======================================== */

function statValue(
  stat:
    | EARatingsValueStat
    | number
    | undefined
): number | undefined {
  if (stat === undefined) {
    return undefined
  }

  if (typeof stat === "number") {
    return stat
  }

  return stat.value
}

/* ========================================
   NOME DO JOGADOR
======================================== */

function getPlayerName(
  player: EARatingsPlayer
): string {
  if (
    player.commonName &&
    player.commonName.trim()
  ) {
    return player.commonName.trim()
  }

  const fullName = [
    player.firstName,
    player.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()

  if (fullName) {
    return fullName
  }

  return `EA Player ${player.id}`
}

/* ========================================
   PÉ PREFERIDO
======================================== */

function getPreferredFoot(
  preferredFoot:
    EARatingsPlayer["preferredFoot"]
): string | undefined {
  if (preferredFoot === undefined) {
    return undefined
  }

  /*
    Payload real encontrado:

    Salah:
    preferredFoot = 2

    Salah é canhoto.

    Então:
    1 = Right
    2 = Left
  */

  if (
    typeof preferredFoot === "number"
  ) {
    if (preferredFoot === 1) {
      return "Right"
    }

    if (preferredFoot === 2) {
      return "Left"
    }

    return undefined
  }

  if (
    typeof preferredFoot === "string"
  ) {
    return preferredFoot
  }

  if (
    preferredFoot.label &&
    typeof preferredFoot.label ===
      "string"
  ) {
    return preferredFoot.label
  }

  if (
    preferredFoot.id !== undefined
  ) {
    const id =
      String(
        preferredFoot.id
      ).trim()

    if (id === "1") {
      return "Right"
    }

    if (id === "2") {
      return "Left"
    }
  }

  return undefined
}

/* ========================================
   POSIÇÃO
======================================== */

function getPosition(
  player: EARatingsPlayer
): string {
  const position =
    player.position

  if (!position) {
    throw new Error(
      `Jogador ${getPlayerName(
        player
      )} não possui posição`
    )
  }

  if (
    position.label &&
    position.label.trim()
  ) {
    return position.label.trim()
  }

  if (
    position.id !== undefined
  ) {
    return String(
      position.id
    )
  }

  throw new Error(
    `Posição inválida para ${getPlayerName(
      player
    )}`
  )
}

/* ========================================
   POSIÇÕES SECUNDÁRIAS
======================================== */

function getSecondaryPositions(
  player: EARatingsPlayer
): string[] {
  const positions =
    player.alternatePositions ??
    []

  return positions
    .map(
      (position) => {
        if (
          position.label &&
          position.label.trim()
        ) {
          return position.label.trim()
        }

        if (
          position.id !== undefined
        ) {
          return String(
            position.id
          )
        }

        return undefined
      }
    )
    .filter(
      (
        position
      ): position is string =>
        typeof position === "string" &&
        position.length > 0
    )
}

/* ========================================
   NACIONALIDADE
======================================== */

function getNationality(
  player: EARatingsPlayer
): string | undefined {
  return (
    player.nationality?.label ??
    player.nationality?.name
  )
}

/* ========================================
   NORMALIZA PLAYSTYLE CODE
======================================== */

function normalizePlayStyleCode(
  value: string
): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-|-$/g,
      ""
    )
}

/* ========================================
   PLAYSTYLES
======================================== */

function getPlayStyles(
  player: EARatingsPlayer
): ExternalPlayer["playStyles"] {
  const abilities =
    player.playerAbilities ?? []

  return abilities
    .filter(
      (ability) =>
        ability.type?.id ===
          "playStyle" ||
        ability.type?.id ===
          "playStylePlus"
    )
    .map(
      (ability) => {
        const rawName =
          ability.label ??
          ability.name

        if (
          !rawName ||
          !rawName.trim()
        ) {
          return undefined
        }

        const name =
          rawName
            .replace(/\+$/, "")
            .trim()

        const code =
          normalizePlayStyleCode(
            name
          )

        if (!code) {
          return undefined
        }

        return {
          code,

          name,

          level:
            ability.type?.id ===
            "playStylePlus"
              ? "plus" as const
              : "normal" as const,
        }
      }
    )
    .filter(
      (
        playStyle
      ): playStyle is NonNullable<
        typeof playStyle
      > =>
        playStyle !== undefined
    )
}

/* ========================================
   ATRIBUTOS
======================================== */

function getAttributes(
  stats:
    EARatingsPlayerStats | undefined
) {
  const data =
    stats ?? {}

  return {
    /* RITMO */

    acceleration:
      statValue(
        data.acceleration
      ),

    sprintSpeed:
      statValue(
        data.sprintSpeed
      ),

    /* FINALIZAÇÃO */

    positioning:
      statValue(
        data.positioning
      ),

    finishing:
      statValue(
        data.finishing
      ),

    shotPower:
      statValue(
        data.shotPower
      ),

    longShots:
      statValue(
        data.longShots
      ),

    volleys:
      statValue(
        data.volleys
      ),

    penalties:
      statValue(
        data.penalties
      ),

    /* PASSE */

    vision:
      statValue(
        data.vision
      ),

    crossing:
      statValue(
        data.crossing
      ),

    freeKickAccuracy:
      statValue(
        data.freeKickAccuracy
      ),

    shortPassing:
      statValue(
        data.shortPassing
      ),

    longPassing:
      statValue(
        data.longPassing
      ),

    curve:
      statValue(
        data.curve
      ),

    /* DRIBLE */

    agility:
      statValue(
        data.agility
      ),

    balance:
      statValue(
        data.balance
      ),

    reactions:
      statValue(
        data.reactions
      ),

    ballControl:
      statValue(
        data.ballControl
      ),

    dribbling:
      statValue(
        data.dribbling
      ),

    composure:
      statValue(
        data.composure
      ),

    /* DEFESA */

    interceptions:
      statValue(
        data.interceptions
      ),

    headingAccuracy:
      statValue(
        data.headingAccuracy
      ),

    defensiveAwareness:
      statValue(
        data.defensiveAwareness
      ),

    standingTackle:
      statValue(
        data.standingTackle
      ),

    slidingTackle:
      statValue(
        data.slidingTackle
      ),

    /* FÍSICO */

    jumping:
      statValue(
        data.jumping
      ),

    stamina:
      statValue(
        data.stamina
      ),

    strength:
      statValue(
        data.strength
      ),

    aggression:
      statValue(
        data.aggression
      ),
  }
}

/* ========================================
   EA RATINGS -> EXTERNAL PLAYER
======================================== */

export function mapEARatingsPlayer(
  player: EARatingsPlayer
): ExternalPlayer {
  const stats =
    player.stats ?? {}

  const name =
    getPlayerName(player)

  return {
    /* ====================================
       IDENTIFICAÇÃO
    ==================================== */

    externalId:
      String(player.id),

    source:
      "ea-ratings",

    firstName:
      player.firstName,

    lastName:
      player.lastName,

    commonName:
      name,

    /* ====================================
       DADOS PESSOAIS
    ==================================== */

    dateOfBirth:
      player.birthdate,

    nationality:
      getNationality(player),

    nationalityExternalId:
      player.nationality?.id !== undefined
        ? String(
            player.nationality.id
          )
        : undefined,

    nationalityImageUrl:
      player.nationality?.imageUrl,

    height:
      player.height,

    preferredFoot:
      getPreferredFoot(
        player.preferredFoot
      ),

    imageUrl:
      player.avatarUrl,

    /* ====================================
       FUTEBOL
    ==================================== */

    position:
      getPosition(player),

    secondaryPositions:
      getSecondaryPositions(
        player
      ),

    /* ====================================
       CLUBE
    ==================================== */

    clubExternalId:
      player.team?.id !== undefined
        ? String(
            player.team.id
          )
        : undefined,

    clubName:
      player.team?.label ??
      player.team?.name,

    clubImageUrl:
      getVisualAssetSrc(player.team?.imageUrl, "club") ?? undefined,

    /* ====================================
       LIGA
    ==================================== */

    leagueExternalId:
      undefined,

    leagueName:
      player.leagueName,

    /* ====================================
       RATINGS
    ==================================== */

    overall:
      player.overallRating ?? 0,

    potential:
      player.potential,

    weakFoot:
      player.weakFootAbility,

    skillMoves:
      player.skillMoves,

    /* ====================================
       FACE STATS
    ==================================== */

    pace:
      statValue(
        stats.pac
      ),

    shooting:
      statValue(
        stats.sho
      ),

    passing:
      statValue(
        stats.pas
      ),

    dribbling:
      statValue(
        stats.dri
      ),

    defending:
      statValue(
        stats.def
      ),

    physical:
      statValue(
        stats.phy
      ),

    /* ====================================
       SUBATRIBUTOS
    ==================================== */

    attributes:
      getAttributes(
        player.stats
      ),

    /* ====================================
       PLAYSTYLES
    ==================================== */

    playStyles:
      getPlayStyles(
        player
      ),

    /*
      A resposta atual da EA não fornece sourceUpdatedAt.
      observedAt pertence à provenance da request e nunca deve
      ser apresentado como se fosse atualização da fonte.
    */
  }
}
