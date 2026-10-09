import type { EconomicWrite } from '../../services/playerEconomicPersistence'
import { economicFingerprint } from '../../lib/economicData/value'
import { hash, validateDate, type Context } from './contract'
import { ImmutableEvidenceCatalog } from './evidence-catalog'
import { assertRegistry, ensure, identifier, operationGate, type Registry } from './source-registry'

export const bridgeVersion = 'contract-economic-bridge-v0.1'
export type BridgeReview = Context & {
  evidenceRecordHash: string; providerPlayerId: string; identityConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
  identityProofRef: string; clubProofRef: string; providerIdentityProofRef: string
  observationProofRef: string; observedAt: string
  temporalLink: 'CONSISTENT' | 'UNKNOWN' | 'CONFLICTED'; reviewedAt: string
}
export type Proposal = { bridgeVersion: typeof bridgeVersion; command: EconomicWrite; contentHash: string; reviewHash: string; proposalHash: string }
function instant(value: string) {
  ensure(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value), 'INVALID_TIMESTAMP')
  validateDate({ value: value.slice(0,10), datePrecision: 'DAY' })
  ensure(Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,19) === value.slice(0,19), 'INVALID_TIMESTAMP')
  return new Date(value).toISOString()
}
export function proposeContractWrite(input: {
  catalogJson: string; catalogHash: string; registry: Registry; evidenceId: string; evidenceRef: string; review: BridgeReview
}): Proposal {
  assertRegistry(input.registry)
  const catalog = ImmutableEvidenceCatalog.restore(input.catalogJson, input.registry, input.catalogHash)
  const e = catalog.get(input.evidenceId), r = input.review
  ensure(e, 'EVIDENCE_MISSING')
  ensure(input.evidenceRef === catalog.evidenceRef(e.evidenceId).evidenceRef && r.evidenceRecordHash === e.recordHash, 'EVIDENCE_REF_MISMATCH')
  const source = input.registry.entries.find(s => s.source.id === e.sourceId)?.source
  ensure(source && operationGate(source, 'INTERNAL').enabled, 'SOURCE_NOT_AUTHORIZED')
  ensure(source.policyVersion === e.sourcePolicyVersion && source.sourceVersion === e.sourceVersion, 'SOURCE_VERSION_MISMATCH')
  ensure(e.identityConfidence === 'HIGH' && r.identityConfidence === 'HIGH', 'IDENTITY_NOT_HIGH')
  for (const key of ['playerId','clubId','context','season'] as const) ensure(e[key] === r[key], 'IDENTITY_CONTEXT_MISMATCH')
  for (const ref of [r.identityProofRef,r.clubProofRef,r.providerIdentityProofRef,r.observationProofRef]) identifier(ref)
  ensure(r.temporalLink === 'CONSISTENT', 'TEMPORAL_LINK_UNPROVEN')
  ensure(r.observationProofRef === e.observationProofRef && instant(r.observedAt) === e.observedAt, 'OBSERVATION_NOT_PROVEN')
  ensure(instant(r.reviewedAt) >= e.observedAt, 'REVIEW_PRECEDES_OBSERVATION')
  ensure(!catalog.conflicts().some(c => c.evidenceIds.includes(e.evidenceId)), 'EVIDENCE_CONFLICT')
  ensure(['CONTRACT','RENEWAL'].includes(e.eventType), 'UNSUPPORTED_EVENT')
  ensure(e.facts.contractUntil.datePrecision === 'DAY', 'DAY_PRECISION_REQUIRED')
  ensure(e.evidenceStatus === 'OFFICIAL_EXPLICIT' && e.facts.contractStatus !== 'INACTIVE', 'INSUFFICIENT_TERMS')
  ensure(e.providerEffectiveAt === null || e.providerEffectiveAt <= instant(r.reviewedAt), 'FUTURE_EFFECTIVE_TERMS')
  const command: EconomicWrite = {
    state: { playerId: e.playerId, field: 'CONTRACT_UNTIL', provider: source.provider, providerPlayerId: r.providerPlayerId,
      context: e.context, snapshotVersion: bridgeVersion, presence: 'VALUE', amount: null, currency: null, period: null,
      contractUntil: e.facts.contractUntil.value, datePrecision: 'DAY', providerEffectiveAt: e.providerEffectiveAt,
      confidence: 'HIGH', matchState: 'MATCHED', status: 'VALID',
      metadata: { source: e.sourceId, sourceVersion: e.sourceVersion, evidenceRef: input.evidenceRef } },
    observedAt: e.observedAt,
    requestId: `contract_${hash({ bridgeVersion, recordHash: e.recordHash, providerPlayerId: r.providerPlayerId })}`,
    selectCurrent: false, expectedRevision: null, selectionReason: 'EXPERIMENTAL_HISTORY_ONLY', policyVersion: bridgeVersion,
  }
  const body: Omit<Proposal, 'proposalHash'> = { bridgeVersion, command, contentHash: economicFingerprint(command.state), reviewHash: hash(r) }
  return { ...body, proposalHash: hash(body) }
}
function validateProposal(p: Proposal) {
  const { proposalHash, ...body } = p
  ensure(proposalHash === hash(body) && p.bridgeVersion === bridgeVersion, 'PROPOSAL_CHANGED')
  ensure(p.command.selectCurrent === false && p.command.expectedRevision === null && p.command.state.field === 'CONTRACT_UNTIL' &&
    p.command.state.datePrecision === 'DAY' && p.command.state.presence === 'VALUE' && p.command.state.confidence === 'HIGH' &&
    p.command.state.matchState === 'MATCHED', 'UNSAFE_WRITE')
  ensure(economicFingerprint(p.command.state) === p.contentHash, 'CONTENT_HASH_MISMATCH')
}
export type ReadBack =
  | { kind: 'ABSENT'; transactionsSettled: true }
  | { kind: 'INDETERMINATE' }
  | { kind: 'FOUND'; stateId: string; observationId: string; requestId: string; observedAt: string;
      state: EconomicWrite['state']; contentHash: string }
export type Reconciliation = { status: 'NOT_PROCESSED' | 'CONFIRMED' | 'INDETERMINATE' | 'CONFLICT'; stateId?: string; observationId?: string }
export function reconcileContractWrite(p: Proposal, result: ReadBack): Reconciliation {
  validateProposal(p)
  if (result.kind === 'INDETERMINATE') return { status: 'INDETERMINATE' }
  if (result.kind === 'ABSENT') return { status: result.transactionsSettled === true ? 'NOT_PROCESSED' : 'INDETERMINATE' }
  try {
    if (result.kind !== 'FOUND' || !result.stateId || !result.observationId || result.requestId !== p.command.requestId ||
      instant(result.observedAt) !== p.command.observedAt || economicFingerprint(result.state) !== p.contentHash ||
      result.contentHash !== p.contentHash) return { status: 'CONFLICT' }
  } catch { return { status: 'CONFLICT' } }
  return { status: 'CONFIRMED', stateId: result.stateId, observationId: result.observationId }
}
// Dependency injection only: this module never imports a runtime client, credentials or the writer implementation.
export type BridgePorts = {
  readBack(requestId: string): Promise<ReadBack>
  writer(command: EconomicWrite): Promise<{ stateId: string; observationId: string }>
}
export async function runContractProposal(proposal: Proposal, ports: BridgePorts): Promise<Reconciliation> {
  const p = structuredClone(proposal); validateProposal(p)
  const read = async () => {
    try { return reconcileContractWrite(p, await ports.readBack(p.command.requestId)) }
    catch { return { status: 'INDETERMINATE' as const } }
  }
  const before = await read()
  if (before.status !== 'NOT_PROCESSED') return before
  let receipt: { stateId: string; observationId: string } | null = null
  try { receipt = await ports.writer(structuredClone(p.command)) }
  catch { /* Any error, including uniqueness, requires read-back. Never retry here. */ }
  const after = await read()
  if (receipt && after.status === 'CONFIRMED' &&
    (receipt.stateId !== after.stateId || receipt.observationId !== after.observationId)) return { status: 'CONFLICT' }
  // An acknowledged write followed by absence is a divergence, not permission to resubmit.
  if (receipt && after.status === 'NOT_PROCESSED') return { status: 'CONFLICT' }
  return after
}
