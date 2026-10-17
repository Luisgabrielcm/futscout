import type { PrismaClient, Prisma } from '../../app/generated/prisma/client'

/** Experimental composition only: delegates every economic operation to the existing writer. */
export function generationClient(client: PrismaClient, generation: string, token: number,
  afterWrite?: () => Promise<void>, profile: 'proof' | 'candidate' = 'proof'): Pick<PrismaClient, '$transaction'> {
  if (!/^g[1-9][0-9]*$/.test(generation) || !Number.isSafeInteger(token) || token < 1) throw Error('INVALID_FENCE_CONTEXT')
  return {
    $transaction: (async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) =>
      client.$transaction(async tx => {
        const prefix = profile === 'candidate' ? 'futscout' : 'proof'
        await tx.$queryRaw`SELECT set_config(${`${prefix}.generation`},${generation},true),set_config(${`${prefix}.token`},${String(token)},true)`
        const delegated = new Proxy(tx, {
          get(target, key) {
            if (key === 'playerEconomicObservation') return new Proxy(target.playerEconomicObservation, {
              get(model, operation) {
                if (operation === 'create') return async (args: Parameters<typeof model.create>[0]) => {
                  const observation = await model.create(args)
                  if (observation.field !== 'MARKET_VALUE') throw Error('GENERATION_FIELD_UNSUPPORTED')
                  if (profile === 'candidate') await tx.$executeRaw`INSERT INTO "EconomicObservationGeneration"(observation_id,generation) VALUES (${observation.id},${generation})`
                  else await tx.$executeRaw`INSERT INTO proof_membership(observation_id,generation) VALUES (${observation.id},${generation})`
                  return observation
                }
                const value = Reflect.get(model, operation)
                return typeof value === 'function' ? value.bind(model) : value
              },
            })
            const value = Reflect.get(target, key)
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
        const result = await callback(delegated)
        await afterWrite?.() // Test coordination only; still before commit.
        return result
      }, options as Parameters<PrismaClient['$transaction']>[1])) as PrismaClient['$transaction'],
  }
}
