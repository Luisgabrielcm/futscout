/* ========================================
   EA RATINGS - VALUE STAT
======================================== */

export type EARatingsValueStat = {
  value?: number
  diff?: number
}

/* ========================================
   EA RATINGS - GENERIC ENTITY
======================================== */

export type EARatingsEntity = {
  id?: string | number

  label?: string

  name?: string

  imageUrl?: string
}

/* ========================================
   EA RATINGS - POSITION
======================================== */

export type EARatingsPosition = {
  id?: string | number

  label?: string

  positionType?: {
    id?: string
    label?: string
  }
}

/* ========================================
   EA RATINGS - PLAYSTYLE / ABILITY
======================================== */

export type EARatingsPlayerAbility = {
  id?: string | number

  label?: string

  name?: string

  description?: string

  imageUrl?: string

  type?: {
    id?: string
    label?: string
  }
}

/* ========================================
   EA RATINGS - STATS
======================================== */

export type EARatingsPlayerStats = {
  /*
    FACE STATS
  */

  pac?: EARatingsValueStat
  sho?: EARatingsValueStat
  pas?: EARatingsValueStat
  dri?: EARatingsValueStat
  def?: EARatingsValueStat
  phy?: EARatingsValueStat

  /*
    PACE
  */

  acceleration?: EARatingsValueStat
  sprintSpeed?: EARatingsValueStat

  /*
    SHOOTING
  */

  positioning?: EARatingsValueStat
  finishing?: EARatingsValueStat
  shotPower?: EARatingsValueStat
  longShots?: EARatingsValueStat
  volleys?: EARatingsValueStat
  penalties?: EARatingsValueStat

  /*
    PASSING
  */

  vision?: EARatingsValueStat
  crossing?: EARatingsValueStat
  freeKickAccuracy?: EARatingsValueStat
  shortPassing?: EARatingsValueStat
  longPassing?: EARatingsValueStat
  curve?: EARatingsValueStat

  /*
    DRIBBLING
  */

  agility?: EARatingsValueStat
  balance?: EARatingsValueStat
  reactions?: EARatingsValueStat
  ballControl?: EARatingsValueStat
  dribbling?: EARatingsValueStat
  composure?: EARatingsValueStat

  /*
    DEFENDING
  */

  interceptions?: EARatingsValueStat
  headingAccuracy?: EARatingsValueStat
  defensiveAwareness?: EARatingsValueStat
  standingTackle?: EARatingsValueStat
  slidingTackle?: EARatingsValueStat

  /*
    PHYSICAL
  */

  jumping?: EARatingsValueStat
  stamina?: EARatingsValueStat
  strength?: EARatingsValueStat
  aggression?: EARatingsValueStat

  /*
    GOALKEEPER

    Ainda não usamos no PlayerAttributes
    atual, mas a EA envia esses dados.
  */

  gkDiving?: EARatingsValueStat
  gkHandling?: EARatingsValueStat
  gkKicking?: EARatingsValueStat
  gkPositioning?: EARatingsValueStat
  gkReflexes?: EARatingsValueStat

  /*
    Permite que a EA adicione novos stats
    sem quebrar imediatamente nossa tipagem.
  */

  [key: string]:
    | EARatingsValueStat
    | undefined
}

/* ========================================
   EA RATINGS - PREFERRED FOOT
======================================== */

export type EARatingsPreferredFoot =
  | number
  | string
  | {
      id?: string | number
      label?: string
    }

/* ========================================
   EA RATINGS - PLAYER
======================================== */

export type EARatingsPlayer = {
  /* IDENTIFICAÇÃO */

  id: string | number

  rank?: number

  firstName?: string

  lastName?: string

  commonName?: string | null

  /* DADOS PESSOAIS */

  birthdate?: string

  height?: number

  weight?: number

  nationality?: EARatingsEntity

  /* PERFIL TÉCNICO */

  skillMoves?: number

  weakFootAbility?: number

  preferredFoot?: EARatingsPreferredFoot

  /* CLUBE / LIGA */

  team?: EARatingsEntity

  leagueName?: string

  /*
    A EA também fornece o escudo
    diretamente no jogador.
  */

  shieldUrl?: string

  /* POSIÇÕES */

  position?: EARatingsPosition

  /*
    Posições alternativas recebidas
    pelo payload da EA.
  */

  alternatePositions?: EARatingsPosition[]

  /* RATINGS */

  overallRating?: number

  potential?: number

  /* IMAGEM */

  avatarUrl?: string

  /* ATRIBUTOS */

  stats?: EARatingsPlayerStats

  /* PLAYSTYLES */

  playerAbilities?: EARatingsPlayerAbility[]

  /*
    Mantemos estes campos porque outras
    versões/payloads da EA podem utilizá-los.
  */

  playStyles?: EARatingsPlayerAbility[]

  playStylePlus?: EARatingsPlayerAbility[]
}

/* ========================================
   EA RATINGS - RESPONSE
======================================== */

export type EARatingsResponse = {
  items?: EARatingsPlayer[]

  totalItems?: number

  campaignOverview?: unknown
}