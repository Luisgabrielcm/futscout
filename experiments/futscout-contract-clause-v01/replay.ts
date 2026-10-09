import { hash } from './contract'
import { evaluateEligibility } from './eligibility'
import { assertPlan, type Plan } from './planner'
import { assertRegistry, ensure, identifier, syncVersion, type Registry } from './source-registry'

type Decision = ReturnType<typeof evaluateEligibility>
export type Receipt = {
  requestId: string; payloadHash: string; decision: Decision
  observation: { kind: 'OFFLINE_ONLY'; requestId: string; observedAt: string; stateHash: string; observationHash: string } | null
}
type Reconciliation = { requestId: string; reference: string; outcome: 'APPLIED' | 'NOT_APPLIED'; receiptHash: string | null }
type Body = {
  planHash: string; cursor: number; receipts: Receipt[]
  uncertain: { requestId: string; payloadHash: string } | null
  checkpoints: { cursor: number; prefixHash: string }[]; reconciliations: Reconciliation[]
}
export type Replay = Body & { replayHash: string }
function seal(body: Body): Replay { return { ...structuredClone(body), replayHash: hash(body) } }
export function startReplay(plan: Plan): Replay {
  assertPlan(plan)
  return seal({ planHash: plan.planHash, cursor: 0, receipts: [], uncertain: null,
    checkpoints: [{ cursor: 0, prefixHash: hash([]) }], reconciliations: [] })
}
function validate(plan: Plan, replay: Replay, registry: Registry) {
  assertPlan(plan); assertRegistry(registry)
  ensure(registry.registryHash === plan.registryHash, 'REGISTRY_CHANGED')
  const { replayHash, ...body } = replay
  ensure(replayHash === hash(body) && body.planHash === plan.planHash, 'REPLAY_CHANGED')
  ensure(Number.isInteger(body.cursor) && body.cursor === body.receipts.length && body.cursor <= plan.queue.length, 'INVALID_CURSOR')
  body.receipts.forEach((r, i) => ensure(r.requestId === plan.queue[i].requestId && r.payloadHash === plan.queue[i].payloadHash, 'RECEIPT_ORDER_MISMATCH'))
  for (const c of body.checkpoints) ensure(c.cursor <= body.cursor && c.prefixHash === hash(body.receipts.slice(0, c.cursor)), 'CHECKPOINT_CHANGED')
  if (body.uncertain) ensure(body.uncertain.requestId === plan.queue[body.cursor]?.requestId &&
    body.uncertain.payloadHash === plan.queue[body.cursor]?.payloadHash, 'UNCERTAIN_CONTEXT_MISMATCH')
}
// Deterministic receipt simulation from already captured evidence; not a writer.
export function simulateReceipt(plan: Plan, index: number, registry: Registry): Receipt {
  assertPlan(plan); assertRegistry(registry)
  ensure(plan.registryHash === registry.registryHash, 'REGISTRY_CHANGED')
  const job = plan.queue[index]
  ensure(job, 'INVALID_INDEX')
  const entry = registry.entries.find(e => e.source.id === job.sourceId)
  ensure(entry, 'SOURCE_UNKNOWN')
  const decision = evaluateEligibility(job, entry.source, plan.evaluationAt)
  const temporal = decision.temporal
  let observation: Receipt['observation'] = null
  if (decision.reviewEligible && temporal) {
    const { observedAt, ...facts } = temporal.data.contract
    const stateHash = hash({ syncVersion, sourceId: job.sourceId, sourceVersion: job.sourceVersion,
      contract: facts, publishedAt: temporal.data.publishedAt, periodQualifier: temporal.data.periodQualifier,
      competitionCalendar: temporal.data.competitionCalendar, evidenceStatus: temporal.data.evidenceStatus,
      events: temporal.data.events.map(e => {
        const { observedAt: eventObservedAt, ...eventFacts } = e
        void eventObservedAt
        return eventFacts
      }) })
    observation = { kind: 'OFFLINE_ONLY', requestId: job.requestId, observedAt, stateHash,
      observationHash: hash({ stateHash, requestId: job.requestId, observedAt, verification: temporal.data.verification }) }
  }
  return { requestId: job.requestId, payloadHash: job.payloadHash, decision,
    observation }
}
function advance(plan: Plan, replay: Replay, receipt: Receipt) {
  const { replayHash: _unused, ...body } = replay
  void _unused
  const next = structuredClone(body)
  next.receipts.push(structuredClone(receipt)); next.cursor++; next.uncertain = null
  if (next.cursor % plan.checkpointEvery === 0 || next.cursor === plan.queue.length)
    next.checkpoints.push({ cursor: next.cursor, prefixHash: hash(next.receipts) })
  return seal(next)
}
export function replayStep(plan: Plan, replay: Replay, registry: Registry,
  outcome: { kind: 'SUCCESS' | 'INTERRUPTED' | 'UNCERTAIN'; requestId: string; payloadHash: string }): Replay {
  validate(plan, replay, registry)
  ensure(['SUCCESS', 'INTERRUPTED', 'UNCERTAIN'].includes(outcome.kind), 'INVALID_OUTCOME')
  const previous = replay.receipts.find(r => r.requestId === outcome.requestId)
  if (previous) { ensure(previous.payloadHash === outcome.payloadHash, 'REQUEST_ID_COLLISION'); return structuredClone(replay) }
  ensure(replay.uncertain === null, 'RECONCILIATION_REQUIRED')
  const job = plan.queue[replay.cursor]
  ensure(job && job.requestId === outcome.requestId && job.payloadHash === outcome.payloadHash, 'OUT_OF_ORDER')
  if (outcome.kind === 'INTERRUPTED') return structuredClone(replay)
  if (outcome.kind === 'UNCERTAIN') {
    const { replayHash: _unused, ...body } = replay
    void _unused
    return seal({ ...body, uncertain: { requestId: job.requestId, payloadHash: job.payloadHash } })
  }
  return advance(plan, replay, simulateReceipt(plan, replay.cursor, registry))
}
export function reconcileReplay(plan: Plan, replay: Replay, registry: Registry,
  proof: { requestId: string; reference: string; outcome: 'APPLIED'; receipt: Receipt } |
    { requestId: string; reference: string; outcome: 'NOT_APPLIED' | 'STILL_UNKNOWN' }): Replay {
  validate(plan, replay, registry); identifier(proof.reference)
  ensure(replay.uncertain && proof.requestId === replay.uncertain.requestId, 'NO_MATCHING_UNCERTAIN_RESULT')
  ensure(['APPLIED', 'NOT_APPLIED', 'STILL_UNKNOWN'].includes(proof.outcome), 'INVALID_RECONCILIATION')
  if (proof.outcome === 'STILL_UNKNOWN') return structuredClone(replay)
  if (proof.outcome === 'APPLIED') ensure(hash(proof.receipt) === hash(simulateReceipt(plan, replay.cursor, registry)), 'RECONCILIATION_DIVERGENCE')
  const { replayHash: _unused, ...body } = replay
  void _unused
  const reconciled = seal({ ...body, uncertain: null, reconciliations: [...body.reconciliations,
    { requestId: proof.requestId, reference: proof.reference, outcome: proof.outcome, receiptHash: proof.outcome === 'APPLIED' ? hash(proof.receipt) : null }] })
  return proof.outcome === 'APPLIED' ? advance(plan, reconciled, proof.receipt) : reconciled
}
