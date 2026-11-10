// Exact, stage-only adapter to the existing economic writer. No ambient client,
// environment, API, training, provider rewrite or publication approval.
import { createHash } from 'node:crypto'
import type { PrismaClient } from '../app/generated/prisma/client'
import type { CoverageRecord } from '../experiments/futscout-value-v01/coverage-contract'
import { decideCoveragePublication } from '../experiments/futscout-value-v01/publication'
import { economicFingerprint, normalizeEstimateAmount, validInstant, type EconomicStateInput } from '../lib/economicData/value'
import { createPlayerEconomicWriter, type EconomicAuthorization, type EconomicWrite } from './playerEconomicPersistence'

export function activationHash(value: unknown): string {
  const canonical = (v: unknown): unknown => v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}
export type PreparedEstimate = { playerId: string; eaId: string; recordHash: string; contentHash: string; plan: EconomicWrite }
export function prepareValueActivation(records: CoverageRecord[], sourceHash: string, preparedAt: string) {
  if (!/^[a-f0-9]{64}$/.test(sourceHash) || !validInstant(preparedAt)) throw Error('ACTIVATION_SOURCE_OR_TIME_INVALID')
  const publication = decideCoveragePublication(records)
  const items: PreparedEstimate[] = records.filter(r => r.type === 'FUTSCOUT_ESTIMATE').map(record => {
    if (!record.eaId || !record.modelArtifactHash || !record.inputHash || record.valueEur === null) throw Error('ACTIVATION_IDENTITY_OR_ARTIFACT_MISSING')
    const amount = normalizeEstimateAmount(record.valueEur), recordHash = activationHash(record)
    if (Number(amount) !== record.valueEur) throw Error('ACTIVATION_AMOUNT_CHANGED')
    const state: EconomicStateInput = { playerId: record.playerId, field: 'MARKET_VALUE', provider: 'FUTSCOUT_VALUE',
      providerPlayerId: `EA_${record.eaId}`, context: 'REAL_WORLD', snapshotVersion: record.version,
      presence: 'VALUE', amount, currency: 'EUR', period: null, contractUntil: null, datePrecision: null,
      providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED', status: 'VALID', metadata: {
        source: 'FUTSCOUT_VALUE/offline', sourceVersion: record.version, evidenceRef: `record-${recordHash}`,
        estimate: { method: record.method as NonNullable<EconomicStateInput['metadata']['estimate']>['method'],
          modelVersion: record.version, recordHash, artifactHash: record.modelArtifactHash, inputHash: record.inputHash,
          quality: record.quality, qualityApproved: false, commercialRights: 'UNKNOWN', launchDecision: 'CONDITIONAL_OWNER_DECISION',
          context: record.context, uncertaintyHash: activationHash(record.uncertainty), provenanceHash: activationHash(record.provenance),
          retentionHash: activationHash(record.dataReview ?? null) },
      } }
    const plan: EconomicWrite = { state, observedAt: preparedAt, requestId: `fv-${recordHash}`, expectedEaId: record.eaId,
      selectCurrent: false, expectedRevision: null, selectionReason: 'PRIVATE_ESTIMATE_STAGING', policyVersion: 'value-activation-prep-v1' }
    return { playerId: record.playerId, eaId: record.eaId, recordHash, contentHash: economicFingerprint(state), plan }
  })
  const body = { version: 'value-activation-prep-v1', sourceHash, preparedAt, storage: 'NUMERIC_38_18_REQUIRED',
    mode: 'STAGE_ONLY', launchDecision: 'CONDITIONAL_OWNER_DECISION', externalRights: 'UNKNOWN',
    providerPlayersPreserved: records.filter(r => r.type === 'PROVIDER').map(r => r.playerId),
    publication: publication.summary, items }
  return { ...body, batchHash: activationHash(body) }
}
export type ValueActivationBundle = ReturnType<typeof prepareValueActivation>
export type ValueStagingReceipt = { batchHash: string; status: 'STAGED'; rows: {
  playerId: string; requestId: string; stateId: string; observationId: string; originalCurrentHash: string }[] }

export function verifyValueActivationBundle(bundle: ValueActivationBundle) {
  const { batchHash, ...body } = bundle
  if (activationHash(body) !== batchHash || body.mode !== 'STAGE_ONLY' || body.externalRights !== 'UNKNOWN') throw Error('ACTIVATION_BUNDLE_CHANGED')
  for (const item of body.items) if (item.plan.selectCurrent || item.plan.state.provider !== 'FUTSCOUT_VALUE' ||
    item.plan.state.playerId !== item.playerId || item.plan.expectedEaId !== item.eaId ||
    item.contentHash !== economicFingerprint(item.plan.state)) throw Error('ACTIVATION_PLAN_CHANGED')
}

export async function stageValueActivation(bundle: ValueActivationBundle, client: Pick<PrismaClient, '$transaction'>,
  grants: readonly EconomicAuthorization[], storage: { precision: number; scale: number },
  checkpoint: (row: ValueStagingReceipt['rows'][number]) => Promise<void> = async () => {},
  beforeWrite: (item: PreparedEstimate, index: number) => Promise<void> = async () => {}) {
  verifyValueActivationBundle(bundle)
  if (storage.precision !== 38 || storage.scale !== 18) throw Error('ACTIVATION_EXACT_STORAGE_NOT_PROVISIONED')
  const columns = await client.$transaction(tx => tx.$queryRaw<{ numeric_precision: number; numeric_scale: number }[]>`
    SELECT numeric_precision, numeric_scale FROM information_schema.columns
    WHERE table_schema='public' AND table_name='PlayerEconomicState' AND column_name='amount'`,
  { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 })
  if (columns.length !== 1 || columns[0].numeric_precision !== 38 || columns[0].numeric_scale !== 18)
    throw Error('ACTIVATION_EXACT_STORAGE_NOT_PROVISIONED')
  const write = createPlayerEconomicWriter(client, grants, { idempotentStaging: true })
  const rows: ValueStagingReceipt['rows'] = []
  // One Serializable transaction per observation. A failure stops the batch;
  // immutable request IDs permit an explicit resume without duplicates/retries.
  for (const [index, item] of bundle.items.entries()) {
    await beforeWrite(item, index)
    const result = await write(item.plan)
    const row = { playerId: item.playerId, requestId: item.plan.requestId, stateId: result.stateId,
      observationId: result.observationId, originalCurrentHash: activationHash(result.current) }
    await checkpoint(row); rows.push(row)
  }
  return { batchHash: bundle.batchHash, status: 'STAGED' as const, rows }
}

// Withdrawal never deletes immutable history. No Current was selected by staging.
// Verify every pointer before recording the withdrawal in the private journal.
export async function withdrawValueActivation(bundle: ValueActivationBundle, receipt: ValueStagingReceipt,
  client: Pick<PrismaClient, '$transaction'>) {
  verifyValueActivationBundle(bundle)
  if (receipt.batchHash !== bundle.batchHash || receipt.rows.length !== bundle.items.length ||
      new Set(receipt.rows.map(r => r.requestId)).size !== bundle.items.length) throw Error('ACTIVATION_RECEIPT_MISMATCH')
  const items = new Map(bundle.items.map(item => [item.plan.requestId, item]))
  for (const row of receipt.rows) {
    const item = items.get(row.requestId)
    if (!item || item.playerId !== row.playerId) throw Error('ACTIVATION_RECEIPT_MISMATCH')
    await client.$transaction(async tx => {
      const observation = await tx.playerEconomicObservation.findUnique({ where: { requestId: row.requestId } })
      const current = await tx.playerEconomicCurrent.findUnique({ where: { playerId_field: { playerId: row.playerId, field: 'MARKET_VALUE' } } })
      if (!observation || observation.id !== row.observationId || observation.stateId !== row.stateId ||
          activationHash(current) !== row.originalCurrentHash) throw Error('ACTIVATION_WITHDRAWAL_CONFLICT')
    }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 })
  }
  return { batchHash: bundle.batchHash, receiptHash: activationHash(receipt), status: 'WITHDRAWN' as const,
    currentsChanged: 0, observationsDeleted: 0 }
}
