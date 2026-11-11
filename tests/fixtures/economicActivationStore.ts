// In-memory fixture for the existing Prisma writer, never a second persistence
// backend. Transactions undo inserts on failure; Current writes are prohibited.
import type { PrismaClient } from '../../app/generated/prisma/client'

export type FixtureEconomicRow = Record<string, unknown> & { id: string }
export function economicActivationStore(options: { precision?: number; scale?: number; simulateDriverRounding?: boolean } = {}) {
  const players = new Map<string, string>(), states = new Map<string, FixtureEconomicRow>()
  const observations = new Map<string, FixtureEconomicRow>(), currents = new Map<string, Record<string, unknown>>()
  const stateKeys = new Map<string, string>(), requestKeys = new Map<string, string>()
  const key = (row: Record<string, unknown>) => JSON.stringify(['playerId', 'provider', 'providerPlayerId', 'context', 'field', 'snapshotVersion', 'contentHash'].map(k => row[k]))
  const currentKey = (playerId: string, field: string) => `${playerId}:${field}`
  let serial = 0, undo: (() => void)[] = [], active = false
  let failObservation = false
  const copy = <T>(row: T): T => structuredClone(row)
  const tx = {
    $queryRaw: async () => [{ numeric_precision: options.precision ?? 38, numeric_scale: options.scale ?? 18 }],
    player: { findUnique: async ({ where }: { where: { id: string } }) => players.has(where.id) ? { externalId: players.get(where.id) } : null },
    playerEconomicState: {
      findUnique: async ({ where }: { where: { id?: string; economicStateKey?: Record<string, unknown> } }) =>
        copy(states.get(where.id ?? stateKeys.get(key(where.economicStateKey!)) ?? '') ?? null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const k = key(data)
        if (stateKeys.has(k)) throw Error('FIXTURE_STATE_UNIQUE')
        if (typeof data.amount === 'string' && (data.amount.split('.')[1]?.length ?? 0) > (options.scale ?? 18)) throw Error('FIXTURE_PRECISION_LOSS')
        const row: FixtureEconomicRow = { ...copy(data), id: `state-${++serial}` }
        if (options.simulateDriverRounding && data.provider === 'FUTSCOUT_VALUE')
          row.amount = Number(data.amount).toFixed(2)
        states.set(row.id, row); stateKeys.set(k, row.id)
        undo.push(() => { states.delete(row.id); stateKeys.delete(k) })
        return copy(row)
      },
    },
    playerEconomicObservation: {
      findUnique: async ({ where }: { where: { requestId?: string; id?: string } }) =>
        copy(observations.get(where.id ?? requestKeys.get(where.requestId ?? '') ?? '') ?? null),
      create: async ({ data }: { data: Record<string, unknown> & { requestId: string } }) => {
        if (failObservation) { failObservation = false; throw Error('FIXTURE_INJECTED_FAILURE') }
        if (requestKeys.has(data.requestId)) throw Error('FIXTURE_REQUEST_UNIQUE')
        const row = { ...copy(data), id: `observation-${++serial}` }
        observations.set(row.id, row); requestKeys.set(data.requestId, row.id)
        undo.push(() => { observations.delete(row.id); requestKeys.delete(data.requestId) })
        return copy(row)
      },
    },
    playerEconomicCurrent: { findUnique: async ({ where }: { where: { playerId_field: { playerId: string; field: string } } }) =>
      copy(currents.get(currentKey(where.playerId_field.playerId, where.playerId_field.field)) ?? null) },
  }
  const client = { $transaction: async <T>(work: (tx: unknown) => Promise<T>, settings: { isolationLevel: string }) => {
    if (active || settings.isolationLevel !== 'Serializable') throw Error('FIXTURE_TRANSACTION_INVALID')
    active = true; undo = []
    try { return await work(tx) } catch (error) { for (const action of undo.reverse()) action(); throw error }
    finally { active = false; undo = [] }
  } } as unknown as Pick<PrismaClient, '$transaction'>
  return { client, players, states, observations, currents,
    seedState(row: FixtureEconomicRow) { states.set(row.id, copy(row)); stateKeys.set(key(row), row.id) },
    seedObservation(row: FixtureEconomicRow & { requestId: string }) { observations.set(row.id, copy(row)); requestKeys.set(row.requestId, row.id) },
    seedCurrent(row: Record<string, unknown> & { playerId: string; field: string }) { currents.set(currentKey(row.playerId, row.field), copy(row)) },
    failNextObservation() { failObservation = true },
  }
}
