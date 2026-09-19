import type { PlayerGoalkeeperAttributes } from "./goalkeeperAttributes"

/* ========================================
   POSIÇÕES
======================================== */

export type PlayerPosition =
  | "GOL"
  | "LD"
  | "LE"
  | "ZAG"
  | "VOL"
  | "MC"
  | "MEI"
  | "MD"
  | "ME"
  | "PD"
  | "PE"
  | "SA"
  | "ATA"

/* ========================================
   FORMA
======================================== */

export type PlayerForm =
  | "Péssima"
  | "Ruim"
  | "Normal"
  | "Boa"
  | "Excelente"

/* ========================================
   PLAYSTYLES
======================================== */

export type PlayerPlayStyleLevel =
  | "normal"
  | "plus"

export type PlayerPlayStyle = {
  id: string

  name: string

  level: PlayerPlayStyleLevel
}

/* ========================================
   CLUBE
======================================== */

export type PlayerClub = {
  slug?: string | null
  name: string

  imageUrl: string | null
}

/* ========================================
   ATRIBUTOS
======================================== */

export type PlayerAttributes = {
  /* ======================================
     RITMO
  ====================================== */

  pace: {
    overall: number

    acceleration: number

    sprintSpeed: number
  }

  /* ======================================
     FINALIZAÇÃO
  ====================================== */

  shooting: {
    overall: number

    positioning: number

    finishing: number

    shotPower: number

    longShots: number

    volleys: number

    penalties: number
  }

  /* ======================================
     PASSE
  ====================================== */

  passing: {
    overall: number

    vision: number

    crossing: number

    freeKickAccuracy: number

    shortPassing: number

    longPassing: number

    curve: number
  }

  /* ======================================
     DRIBLE
  ====================================== */

  dribbling: {
    overall: number

    agility: number

    balance: number

    reactions: number

    ballControl: number

    dribbling: number

    composure: number
  }

  /* ======================================
     DEFESA
  ====================================== */

  defending: {
    overall: number

    interceptions: number

    headingAccuracy: number

    defensiveAwareness: number

    standingTackle: number

    slidingTackle: number
  }

  /* ======================================
     FÍSICO
  ====================================== */

  physical: {
    overall: number

    jumping: number

    stamina: number

    strength: number

    aggression: number
  }
}

/* ========================================
   PLAYER
======================================== */

export type Player = {
  id: string

  slug: string

  name: string

  /* ======================================
     DADOS PESSOAIS
  ====================================== */

  age: number | null

  nationality: string | null

  preferredFoot:
    | "Direito"
    | "Esquerdo"
    | null

  height: number | null

  image?: string

  /* ======================================
     PERFIL TÉCNICO
  ====================================== */

  skillMoves: number | null

  weakFootAbility: number | null

  /* ======================================
     POSIÇÕES
  ====================================== */

  position: PlayerPosition

  /*
    Campo antigo.

    Mantemos temporariamente para os
    componentes que ainda utilizam apenas
    uma posição secundária.
  */

  secondaryPosition?: PlayerPosition

  /*
    Nova estrutura oficial.

    Pode conter nenhuma, uma ou várias
    posições secundárias.
  */

  secondaryPositions: PlayerPosition[]

  /* ======================================
     CLUBE / LIGA
  ====================================== */

  club: PlayerClub | null

  league: string | null
  leagueSlug?: string | null
  // Optional supplied artwork; the current public reader does not provide it.
  leagueLogoUrl?: string | null

  /* ======================================
     OVERALL
  ====================================== */

  baseOverall: number

  dynamicOverall: number | null

  potential: number | null

  /* ======================================
     FORMA
  ====================================== */

  form: PlayerForm | null

  /* ======================================
     VALOR DE MERCADO
  ====================================== */

  marketValue: number | null

  valueTrend:
    | "up"
    | "down"
    | "stable"
    | null

  /* ======================================
     PLAYSTYLES
  ====================================== */

  playStyles: PlayerPlayStyle[]

  /* ======================================
     ATRIBUTOS
  ====================================== */

  attributes: PlayerAttributes

  goalkeeperAttributes?: PlayerGoalkeeperAttributes | null
}
