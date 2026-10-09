import { hash, validateDate, type Context, type PartialDate } from './contract'
import type { TemporalInput } from './temporal-v02'
import { assertRegistry, ensure, identifier, syncVersion, type Registry } from './source-registry'

export type Candidate = {
  requestId: string; eventId: string; sourceId: string; sourceVersion: string
  expected: Context; input: TemporalInput
  temporalLink: 'CONSISTENT' | 'UNKNOWN' | 'CLUB_CONFLICT'
  signals: { newChange: boolean; conflict: boolean; missingContract: boolean }
}
export type Job = Candidate & { payloadHash: string; priority: number }
// Conservative triage only: partial periods may overlap the next six months.
// No inferred day/month is returned, and this never establishes contract validity.
function nearExpiry(date: PartialDate, day: string) {
  validateDate(date)
  if (date.value === null) return false
  const now = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1
  const firstMonth = Number(date.value.slice(0, 4)) * 12 + (date.datePrecision === 'YEAR' ? 0 : Number(date.value.slice(5, 7)) - 1)
  return firstMonth <= now + 6 // Also prioritize overdue periods, not just future ones.
}
export function freezePlan(candidates: Candidate[], registry: Registry, evaluationAt: string) {
  assertRegistry(registry)
  ensure(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(evaluationAt) &&
    Number.isFinite(Date.parse(evaluationAt)) && new Date(evaluationAt).toISOString() === evaluationAt, 'INVALID_EVALUATION_TIME')
  const sourceIndex = new Map(registry.entries.map(e => [e.source.id, e]))
  const unique = new Map<string, Job>(), events = new Map<string, string>()
  for (const candidate of candidates) {
    for (const key of ['requestId', 'eventId', 'sourceId', 'sourceVersion'] as const) identifier(candidate[key])
    for (const key of ['playerId', 'clubId', 'season'] as const) identifier(candidate.expected[key])
    ensure(['CONSISTENT', 'UNKNOWN', 'CLUB_CONFLICT'].includes(candidate.temporalLink), 'INVALID_LINK_STATE')
    ensure(Object.values(candidate.signals).length === 3 && ['newChange', 'conflict', 'missingContract'].every(k =>
      typeof candidate.signals[k as keyof Candidate['signals']] === 'boolean'), 'INVALID_SIGNALS')
    const payloadHash = hash({ syncVersion, candidate })
    const prior = unique.get(candidate.requestId)
    if (prior) { ensure(prior.payloadHash === payloadHash, 'REQUEST_ID_COLLISION'); continue }
    const eventKey = hash([candidate.sourceId, candidate.eventId, candidate.expected])
    ensure(!events.has(eventKey), 'EVENT_REASSIGNED_REQUEST_ID'); events.set(eventKey, candidate.requestId)
    const priority = candidate.signals.newChange ? 0 : candidate.signals.conflict || candidate.temporalLink === 'CLUB_CONFLICT' ? 1 :
      candidate.signals.missingContract ? 2 : nearExpiry(candidate.input.contract.contractUntil, evaluationAt.slice(0, 10)) ? 3 : 4
    unique.set(candidate.requestId, { ...structuredClone(candidate), payloadHash, priority })
  }
  const compare = (a: Job, b: Job) => a.priority - b.priority ||
    (a.expected.playerId < b.expected.playerId ? -1 : a.expected.playerId > b.expected.playerId ? 1 : 0) ||
    (a.requestId < b.requestId ? -1 : a.requestId > b.requestId ? 1 : 0)
  const queue: Job[] = [], blocked: { requestId: string; sourceId: string; playerId: string; payloadHash: string; reasons: string[] }[] = []
  for (const job of [...unique.values()].sort(compare)) {
    const entry = sourceIndex.get(job.sourceId)
    const reasons = !entry ? ['SOURCE_UNKNOWN'] : !entry.enabled ? entry.reasons :
      entry.source.sourceVersion !== job.sourceVersion ? ['SOURCE_VERSION_MISMATCH'] : []
    if (reasons.length) blocked.push({ requestId: job.requestId, sourceId: job.sourceId,
      playerId: job.expected.playerId, payloadHash: job.payloadHash, reasons: [...reasons] })
    else queue.push(job)
  }
  const body = { syncVersion, registryHash: registry.registryHash, evaluationAt, queue, blocked, batchSize: 100 as const, checkpointEvery: 25 as const }
  return { ...body, planHash: hash(body) }
}
export type Plan = ReturnType<typeof freezePlan>
export function assertPlan(plan: Plan) {
  const { planHash, ...body } = plan
  ensure(planHash === hash(body) && plan.syncVersion === syncVersion && plan.batchSize === 100 && plan.checkpointEvery === 25, 'PLAN_CHANGED')
}
export function nextBatch(plan: Plan, cursor: number) {
  assertPlan(plan)
  ensure(Number.isInteger(cursor) && cursor >= 0 && cursor <= plan.queue.length, 'INVALID_CURSOR')
  return structuredClone(plan.queue.slice(cursor, Math.min(plan.queue.length, (Math.floor(cursor / 100) + 1) * 100)))
}
