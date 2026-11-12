/** Server policy: explicit rollout scope, independent of game/real club interpretation. */
export const clubContextReadPilot = Object.freeze({
  manifestHash: "dd33d9a81f4c97a62de1bd7eaf739579966d0d7e3d67602f3970f0dd855b869e",
  payloads: Object.freeze({
    "218191": "edf76c9be349df24cab4d31a0d3ce83ec0c238c7e2acc4cdab42764acf5e7f17",
    "225964": "1755c2f83edcc999751b92383710320ed7a01828f6e0b3766580d509eee12b43",
    "261176": "aefea87610beeb06396b0ddbbd2d4d0ba81459799748fcfa793a805fd7410da4",
    "83924": "398d2cf2fa167a3429ac2681a2cf8bcd656ff0e6de95ffeec35bf9d2ee3f577a",
  } as Readonly<Record<string, string>>),
})
export const clubContextReadEaIds = Object.keys(clubContextReadPilot.payloads).sort()
export type ClubContextReadEnvironment = Readonly<Record<string, string | undefined>>

export function canReadClubContexts(eaId: string | null | undefined, env: ClubContextReadEnvironment = {}): boolean {
  if (!eaId || !Object.hasOwn(clubContextReadPilot.payloads, eaId) || env.CLUB_CONTEXTS_READ_ENABLED !== "1") return false
  if (env.VERCEL_ENV !== "preview" && env.VERCEL_ENV !== "production") return false
  if (env.VERCEL_ENV === "production" && env.CLUB_CONTEXTS_READ_PRODUCTION_ENABLED !== "1") return false
  if (env.CLUB_CONTEXTS_READ_PILOT_HASH !== clubContextReadPilot.manifestHash) return false
  const ids = (env.CLUB_CONTEXTS_READ_EA_IDS ?? "").split(",").map(id => id.trim()).sort()
  return ids.length === 4 && ids.every((id, i) => id === clubContextReadEaIds[i])
}
export function expectedClubContextPilotSelection(eaId: string) {
  const hash = clubContextReadPilot.payloads[eaId]
  if (!hash) return undefined
  return { revisionId: `club-context-pilot:${eaId}:${hash}`, contentHash: hash,
    decisionReference: `club-contexts-pilot:${clubContextReadPilot.manifestHash}`, version: 1 }
}
