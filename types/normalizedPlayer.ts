import type {
  PlayerPosition,
} from "./player"
import type { GoalkeeperAttributePatch } from "./goalkeeperAttributes"

/* ========================================
   PLAYSTYLE NORMALIZADO
======================================== */

export type NormalizedPlayerPlayStyle = {
  code: string

  name?: string

  level:
    | "normal"
    | "plus"
}

/* ========================================
   ATRIBUTOS NORMALIZADOS
======================================== */

export type NormalizedPlayerAttributes = {
  /**
   * RITMO
   */

  pace?: number
  acceleration?: number
  sprintSpeed?: number

  /**
   * FINALIZAÇÃO
   */

  shooting?: number
  positioning?: number
  finishing?: number
  shotPower?: number
  longShots?: number
  volleys?: number
  penalties?: number

  /**
   * PASSE
   */

  passing?: number
  vision?: number
  crossing?: number
  freeKickAccuracy?: number
  shortPassing?: number
  longPassing?: number
  curve?: number

  /**
   * DRIBLE
   */

  dribbling?: number
  agility?: number
  balance?: number
  reactions?: number
  ballControl?: number
  dribblingStat?: number
  composure?: number

  /**
   * DEFESA
   */

  defending?: number
  interceptions?: number
  headingAccuracy?: number
  defensiveAwareness?: number
  standingTackle?: number
  slidingTackle?: number

  /**
   * FÍSICO
   */

  physical?: number
  jumping?: number
  stamina?: number
  strength?: number
  aggression?: number
}

/* ========================================
   PLAYER NORMALIZADO
======================================== */

export type NormalizedPlayer = {
  /**
   * IDENTIFICAÇÃO
   */

  externalId: string

  source: string

  name: string

  firstName?: string
  lastName?: string

  /**
   * DADOS PESSOAIS
   */

  dateOfBirth?: Date

  age?: number

  nationality?: string

  height?: number

  preferredFoot?:
    | "Direito"
    | "Esquerdo"

  /**
   * PERFIL TÉCNICO
   */

  skillMoves?: number

  weakFootAbility?: number

  /**
   * IMAGEM DO JOGADOR
   */

  imageUrl?: string

  /**
   * POSIÇÕES
   */

  position: PlayerPosition

  /**
   * Campo antigo.
   *
   * Vamos manter temporariamente
   * durante a migração.
   */
  secondaryPosition?: PlayerPosition

  /**
   * Todas as posições alternativas
   * fornecidas pela fonte.
   *
   * Exemplo:
   *
   * ["ME", "MEI", "PE"]
   */
  secondaryPositions: PlayerPosition[]

  /**
   * CLUBE
   */

  club?: {
    externalId?: string

    name: string

    /**
     * Escudo/logo do clube.
     */
    imageUrl?: string
  }

  /**
   * LIGA
   */

  league?: {
    externalId?: string

    name: string
  }

  /**
   * RATINGS
   */

  officialOverall: number

  potential?: number

  /**
   * ATRIBUTOS
   */

  attributes: NormalizedPlayerAttributes

  /** Present only when the EA primary position normalizes to GOL. */
  goalkeeperAttributes?: GoalkeeperAttributePatch

  /**
   * PLAYSTYLES
   */

  playStyles: NormalizedPlayerPlayStyle[]

  /**
   * CONTROLE DA FONTE
   */

  sourceUpdatedAt?: Date
}
