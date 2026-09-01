export type ExternalPlayerPlayStyle = {
  code: string
  name?: string
  level: "normal" | "plus"
}

export type ExternalPlayer = {
  /* IDENTIFICAÇÃO */

  externalId: string
  source: string

  firstName?: string
  lastName?: string
  commonName: string

  /* DADOS PESSOAIS */

  dateOfBirth?: string
  age?: number

  nationality?: string
  nationalityExternalId?: string
  nationalityImageUrl?: string

  height?: number
  preferredFoot?: string

  imageUrl?: string

  /* FUTEBOL */

  position: string
  secondaryPositions?: string[]

  clubExternalId?: string
  clubName?: string
  clubImageUrl?: string

  leagueExternalId?: string
  leagueName?: string

  /* RATINGS */

  overall: number
  potential?: number

  weakFoot?: number
  skillMoves?: number

  /* ATRIBUTOS */

  pace?: number
  shooting?: number
  passing?: number
  dribbling?: number
  defending?: number
  physical?: number

  attributes: {
    acceleration?: number
    sprintSpeed?: number

    positioning?: number
    finishing?: number
    shotPower?: number
    longShots?: number
    volleys?: number
    penalties?: number

    vision?: number
    crossing?: number
    freeKickAccuracy?: number
    shortPassing?: number
    longPassing?: number
    curve?: number

    agility?: number
    balance?: number
    reactions?: number
    ballControl?: number
    dribbling?: number
    composure?: number

    interceptions?: number
    headingAccuracy?: number
    defensiveAwareness?: number
    standingTackle?: number
    slidingTackle?: number

    jumping?: number
    stamina?: number
    strength?: number
    aggression?: number
  }

  /* PLAYSTYLES */

  playStyles?: ExternalPlayerPlayStyle[]

  sourceUpdatedAt?: string
}