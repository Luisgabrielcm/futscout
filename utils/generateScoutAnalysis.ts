import { t, type Locale } from "../lib/i18n"
import type { Player } from "../types/player"

export type ScoutAnalysis = {
  strengths: string[]
  weaknesses: string[]
  roles: string[]
}

export function generateScoutAnalysis(
  player: Player,
  locale: Locale = "pt"
): ScoutAnalysis {
  const {
    pace,
    shooting,
    passing,
    dribbling,
    defending,
    physical,
  } = player.attributes

  const strengths: string[] = []
  const weaknesses: string[] = []
  const roles: string[] = []

  /* =========================
     PONTOS FORTES
  ========================= */

  if (dribbling.overall >= 88) {
    strengths.push(t(locale, "Drible de elite"))
  }

  if (
    passing.vision >= 88 &&
    passing.shortPassing >= 86
  ) {
    strengths.push(
      t(locale, "Excelente visão de jogo")
    )
  }

  if (
    dribbling.ballControl >= 88 &&
    dribbling.composure >= 86
  ) {
    strengths.push(
      t(locale, "Muito forte entre linhas")
    )
  }

  if (pace.overall >= 90) {
    strengths.push(t(locale, "Aceleração e velocidade de elite"))
  }

  if (
    shooting.finishing >= 86 &&
    shooting.positioning >= 86
  ) {
    strengths.push(
      t(locale, "Grande ameaça no último terço")
    )
  }

  if (
    defending.interceptions >= 80 &&
    defending.standingTackle >= 80
  ) {
    strengths.push(
      t(locale, "Boa leitura defensiva")
    )
  }

  if (
    physical.stamina >= 88
  ) {
    strengths.push(
      t(locale, "Excelente resistência")
    )
  }

  if (
    physical.strength >= 84
  ) {
    strengths.push(
      t(locale, "Boa presença física")
    )
  }

  /* =========================
     PONTOS DE ATENÇÃO
  ========================= */

  if (defending.overall < 65) {
    weaknesses.push(
      t(locale, "Contribuição defensiva limitada")
    )
  }

  if (physical.overall < 70) {
    weaknesses.push(
      t(locale, "Físico abaixo da média")
    )
  }

  if (shooting.overall < 75) {
    weaknesses.push(
      t(locale, "Pouca ameaça na finalização")
    )
  }

  if (pace.overall < 75) {
    weaknesses.push(
      t(locale, "Velocidade limitada")
    )
  }

  if (
    physical.strength < 65
  ) {
    weaknesses.push(
      t(locale, "Pode sofrer em duelos físicos")
    )
  }

  /* =========================
     FUNÇÕES IDEAIS
  ========================= */

  if (
    player.position === "MEI" ||
    player.secondaryPosition === "MEI"
  ) {
    if (
      passing.vision >= 86 &&
      dribbling.ballControl >= 86
    ) {
      roles.push(t(locale, "MEI criativo"))
    }
  }

  if (
    player.position === "MC" ||
    player.secondaryPosition === "MC"
  ) {
    if (
      passing.shortPassing >= 85 &&
      physical.stamina >= 80
    ) {
      roles.push(t(locale, "Meia organizador"))
    }
  }

  if (
    player.position === "PE" ||
    player.position === "PD" ||
    player.secondaryPosition === "PE" ||
    player.secondaryPosition === "PD"
  ) {
    if (
      pace.overall >= 85 &&
      dribbling.overall >= 85
    ) {
      roles.push(t(locale, "Ponta invertido"))
    }
  }

  if (
    player.position === "ATA" ||
    player.secondaryPosition === "ATA"
  ) {
    if (
      shooting.finishing >= 84
    ) {
      roles.push(t(locale, "Atacante móvel"))
    }
  }

  if (
    defending.overall >= 75 &&
    physical.overall >= 78 &&
    passing.shortPassing >= 80
  ) {
    roles.push(t(locale, "Meio-campista box-to-box"))
  }

  /* =========================
     FALLBACKS
  ========================= */

  if (strengths.length === 0) {
    strengths.push(
      t(locale, "Perfil equilibrado")
    )
  }

  if (weaknesses.length === 0) {
    weaknesses.push(
      t(locale, "Sem fraquezas claras no perfil atual")
    )
  }

  if (roles.length === 0) {
    roles.push(
      player.position
    )
  }

  return {
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 3),
    roles: roles.slice(0, 3),
  }
}
