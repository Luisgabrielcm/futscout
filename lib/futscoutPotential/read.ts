import type { Prisma } from "../../app/generated/prisma/client"

// Compact, batched relation selection. No calculation of E, clock or DB effects.
export const futscoutPotentialReadSelect = {
  select: { estimate: { select: {
    modelVersion: true, status: true, inputOverall: true, potentialRaw: true,
  } } },
} satisfies Prisma.PlayerFutscoutPotentialCurrentDefaultArgs

type CurrentRead = Prisma.PlayerFutscoutPotentialCurrentGetPayload<typeof futscoutPotentialReadSelect>

export type FutscoutPotentialRead = {
  potential: number | null
  legacyPotential: number | null
  futscoutPotential: { futurePeak: number | null; modelVersion: string; status: string } | null
  potentialReadState: "READY" | "MISSING_CURRENT" | "INVALID_CURRENT" | "UNSUPPORTED_MODEL"
}

export function readFutscoutPotential(player: {
  potential: number | null
  currentFutscoutPotential?: CurrentRead | null
}): FutscoutPotentialRead {
  const estimate = player.currentFutscoutPotential?.estimate
  const metadata = estimate ? {
    futurePeak: estimate.potentialRaw, modelVersion: estimate.modelVersion, status: estimate.status,
  } : null
  const base = { legacyPotential: player.potential, futscoutPotential: metadata }
  if (!estimate) return { ...base, potential: null, potentialReadState: "MISSING_CURRENT" }
  if (estimate.modelVersion !== "potential-model-e-v1") {
    return { ...base, potential: null, potentialReadState: "UNSUPPORTED_MODEL" }
  }
  const { inputOverall, potentialRaw } = estimate
  if (estimate.status !== "EXPERIMENTAL" || inputOverall === null || potentialRaw === null ||
      !Number.isFinite(inputOverall) || !Number.isFinite(potentialRaw) ||
      inputOverall < 1 || inputOverall > 99 || potentialRaw < 1 || potentialRaw > 99) {
    return { ...base, potential: null, potentialReadState: "INVALID_CURRENT" }
  }
  return { ...base, potential: Math.round(Math.max(inputOverall, potentialRaw)), potentialReadState: "READY" }
}
