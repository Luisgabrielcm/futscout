import type {
  ExternalPlayer,
  ExternalPlayerPlayStyle,
} from "../types/externalPlayer"

import type {
  NormalizedPlayer,
  NormalizedPlayerPlayStyle,
} from "../types/normalizedPlayer"

import {
  normalizePosition,
} from "./normalizePosition"

import {
  normalizePreferredFoot,
} from "./normalizePreferredFoot"

/* ========================================
   NORMALIZA PLAYSTYLE CODE
======================================== */

function normalizePlayStyleCode(
  playStyle: string
) {
  return playStyle
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
   NORMALIZA PLAYSTYLES
======================================== */

function normalizePlayStyles(
  playStyles: ExternalPlayerPlayStyle[] = []
): NormalizedPlayerPlayStyle[] {
  const playStyleMap =
    new Map<
      string,
      NormalizedPlayerPlayStyle
    >()

  for (
    const playStyle
    of playStyles
  ) {
    const code =
      normalizePlayStyleCode(
        playStyle.code
      )

    if (!code) {
      continue
    }

    const existing =
      playStyleMap.get(
        code
      )

    /*
      Se o mesmo PlayStyle aparecer
      duas vezes, o PlayStyle+
      tem prioridade.
    */

    if (
      !existing ||
      playStyle.level === "plus"
    ) {
      playStyleMap.set(
        code,
        {
          code,

          name:
            playStyle.name?.trim(),

          level:
            playStyle.level === "plus"
              ? "plus"
              : "normal",
        }
      )
    }
  }

  return Array.from(
    playStyleMap.values()
  )
}

/* ========================================
   NORMALIZA DATA
======================================== */

function normalizeDate(
  value?: string
) {
  if (!value) {
    return undefined
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return undefined
  }

  return date
}

/* ========================================
   NORMALIZA JOGADOR
======================================== */

export function normalizePlayer(
  player: ExternalPlayer
): NormalizedPlayer {
  /* ======================================
     POSIÇÃO PRINCIPAL
  ====================================== */

  const position =
    normalizePosition(
      player.position
    )

  /* ======================================
     POSIÇÕES SECUNDÁRIAS
  ====================================== */

  const secondaryPositions =
    Array.from(
      new Set(
        (
          player.secondaryPositions ??
          []
        )
          .map(
            (
              secondaryPosition
            ) =>
              normalizePosition(
                secondaryPosition
              )
          )
          .filter(
            (
              secondaryPosition
            ) =>
              secondaryPosition !==
              position
          )
      )
    )

  /*
    Compatibilidade temporária.

    Enquanto partes antigas do FutScout
    ainda utilizarem secondaryPosition,
    mantemos a primeira posição da lista.
  */

  const secondaryPosition =
    secondaryPositions[0]

  /* ======================================
     PLAYER NORMALIZADO
  ====================================== */

  return {
    /* ====================================
       IDENTIFICAÇÃO
    ==================================== */

    externalId:
      player.externalId,

    source:
      player.source,

    name:
      player.commonName.trim(),

    firstName:
      player.firstName?.trim(),

    lastName:
      player.lastName?.trim(),

    /* ====================================
       DADOS PESSOAIS
    ==================================== */

    dateOfBirth:
      normalizeDate(
        player.dateOfBirth
      ),

    age:
      player.age,

    nationality:
      player.nationality?.trim(),

    height:
      player.height,

    preferredFoot:
      normalizePreferredFoot(
        player.preferredFoot
      ),

    /* ====================================
       IMAGEM DO JOGADOR
    ==================================== */

    imageUrl:
      player.imageUrl,

    /* ====================================
       PERFIL TÉCNICO
    ==================================== */

    skillMoves:
      player.skillMoves,

    weakFootAbility:
      player.weakFoot,

    /* ====================================
       POSIÇÕES
    ==================================== */

    position,

    /*
      Campo antigo mantido
      temporariamente.
    */

    secondaryPosition,

    /*
      Nova estrutura com todas
      as posições alternativas.
    */

    secondaryPositions,

    /* ====================================
       CLUBE
    ==================================== */

    club:
      player.clubName
        ? {
            externalId:
              player.clubExternalId,

            name:
              player.clubName.trim(),

            imageUrl:
              player.clubImageUrl,
          }
        : undefined,

    /* ====================================
       LIGA
    ==================================== */

    league:
      player.leagueName
        ? {
            externalId:
              player.leagueExternalId,

            name:
              player.leagueName.trim(),
          }
        : undefined,

    /* ====================================
       RATINGS
    ==================================== */

    officialOverall:
      player.overall,

    potential:
      player.potential,

    /* ====================================
       ATRIBUTOS
    ==================================== */

    attributes: {
      /* RITMO */

      pace:
        player.pace,

      acceleration:
        player.attributes
          .acceleration,

      sprintSpeed:
        player.attributes
          .sprintSpeed,

      /* FINALIZAÇÃO */

      shooting:
        player.shooting,

      positioning:
        player.attributes
          .positioning,

      finishing:
        player.attributes
          .finishing,

      shotPower:
        player.attributes
          .shotPower,

      longShots:
        player.attributes
          .longShots,

      volleys:
        player.attributes
          .volleys,

      penalties:
        player.attributes
          .penalties,

      /* PASSE */

      passing:
        player.passing,

      vision:
        player.attributes
          .vision,

      crossing:
        player.attributes
          .crossing,

      freeKickAccuracy:
        player.attributes
          .freeKickAccuracy,

      shortPassing:
        player.attributes
          .shortPassing,

      longPassing:
        player.attributes
          .longPassing,

      curve:
        player.attributes
          .curve,

      /* DRIBLE */

      dribbling:
        player.dribbling,

      agility:
        player.attributes
          .agility,

      balance:
        player.attributes
          .balance,

      reactions:
        player.attributes
          .reactions,

      ballControl:
        player.attributes
          .ballControl,

      dribblingStat:
        player.attributes
          .dribbling,

      composure:
        player.attributes
          .composure,

      /* DEFESA */

      defending:
        player.defending,

      interceptions:
        player.attributes
          .interceptions,

      headingAccuracy:
        player.attributes
          .headingAccuracy,

      defensiveAwareness:
        player.attributes
          .defensiveAwareness,

      standingTackle:
        player.attributes
          .standingTackle,

      slidingTackle:
        player.attributes
          .slidingTackle,

      /* FÍSICO */

      physical:
        player.physical,

      jumping:
        player.attributes
          .jumping,

      stamina:
        player.attributes
          .stamina,

      strength:
        player.attributes
          .strength,

      aggression:
        player.attributes
          .aggression,
    },

    goalkeeperAttributes:
      position === "GOL"
        ? player.goalkeeperAttributes
        : undefined,

    /* ====================================
       PLAYSTYLES
    ==================================== */

    playStyles:
      normalizePlayStyles(
        player.playStyles
      ),

    /* ====================================
       CONTROLE DA FONTE
    ==================================== */

    sourceUpdatedAt:
      normalizeDate(
        player.sourceUpdatedAt
      ),
  }
}
