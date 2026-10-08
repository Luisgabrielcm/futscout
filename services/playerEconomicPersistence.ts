import type { PrismaClient } from "../app/generated/prisma/client"
import { economicFingerprint, validInstant, type EconomicStateInput } from "../lib/economicData/value"

export type EconomicAuthorization = Readonly<{ provider: string; context: EconomicStateInput["context"]; field: EconomicStateInput["field"]; evidenceRef: string }>
export type EconomicWrite = {
  state: EconomicStateInput; observedAt: string; requestId: string
  selectCurrent: boolean; expectedRevision: number | null; selectionReason: string; policyVersion: string
}
/** No ambient client, API, logs or retry. Empty authorization list denies every provider. */
export function createPlayerEconomicWriter(client: Pick<PrismaClient, "$transaction">, grants: readonly EconomicAuthorization[] = []) {
  const authorized = grants.map(grant => ({ ...grant }))
  return async (plan: EconomicWrite) => {
    const state = structuredClone(plan.state)
    const contentHash = economicFingerprint(state)
    if (state.confidence !== "HIGH" || state.matchState !== "MATCHED" || state.status === "REJECTED") throw new Error("ECONOMIC_IDENTITY_REJECTED")
    if (!authorized.some(grant => grant.provider === state.provider && grant.context === state.context && grant.field === state.field && /^[a-zA-Z0-9._/-]{1,160}$/.test(grant.evidenceRef))) throw new Error("ECONOMIC_PROVIDER_UNAUTHORIZED")
    if (!validInstant(plan.observedAt) || !/^[a-zA-Z0-9_-]{1,128}$/.test(plan.requestId) ||
        !/^[A-Z0-9_]{1,80}$/.test(plan.selectionReason) || !/^[a-zA-Z0-9._-]{1,64}$/.test(plan.policyVersion) ||
        (plan.expectedRevision !== null && (!Number.isSafeInteger(plan.expectedRevision) || plan.expectedRevision < 1))) throw new Error("ECONOMIC_PLAN_INVALID")
    const command = { ...plan }
    return client.$transaction(async tx => {
      const { providerEffectiveAt, contractUntil, ...scalars } = state
      const key = { playerId: state.playerId, provider: state.provider, providerPlayerId: state.providerPlayerId,
        context: state.context, field: state.field, snapshotVersion: state.snapshotVersion, contentHash }
      let persisted = await tx.playerEconomicState.findUnique({ where: { economicStateKey: key } })
      if (!persisted) persisted = await tx.playerEconomicState.create({ data: { ...scalars, contentHash,
        providerEffectiveAt: providerEffectiveAt ? new Date(providerEffectiveAt) : null,
        contractUntil: contractUntil ? new Date(`${contractUntil}T00:00:00Z`) : null } })
      // Every successful consultation is preserved, including repeated confirmations.
      const observation = await tx.playerEconomicObservation.create({ data: {
        stateId: persisted.id, playerId: state.playerId, field: state.field,
        observedAt: new Date(command.observedAt), requestId: command.requestId,
      } })
      let current = await tx.playerEconomicCurrent.findUnique({ where: { playerId_field: { playerId: state.playerId, field: state.field } } })
      if (command.selectCurrent) {
        if ((current?.revision ?? null) !== command.expectedRevision) throw new Error("ECONOMIC_CAS_CONFLICT")
        const data = { observationId: observation.id, selectedAt: new Date(command.observedAt), selectionReason: command.selectionReason, policyVersion: command.policyVersion }
        if (!current) current = await tx.playerEconomicCurrent.create({ data: { ...data, playerId: state.playerId, field: state.field, revision: 1 } })
        else {
          const result = await tx.playerEconomicCurrent.updateMany({ where: { playerId: state.playerId, field: state.field, revision: command.expectedRevision! }, data: { ...data, revision: { increment: 1 } } })
          if (result.count !== 1) throw new Error("ECONOMIC_CAS_CONFLICT")
          current = await tx.playerEconomicCurrent.findUniqueOrThrow({ where: { playerId_field: { playerId: state.playerId, field: state.field } } })
        }
        if (current.observationId !== observation.id) throw new Error("ECONOMIC_READ_BACK_CONFLICT")
      }
      return { stateId: persisted.id, observationId: observation.id, current, retries: 0 as const }
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 })
  }
}
