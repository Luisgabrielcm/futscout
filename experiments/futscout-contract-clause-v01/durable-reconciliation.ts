import { hash } from './contract'
import { JsonReceiptCheckpointStore } from './durable-store'
import { simulateReceipt } from './replay'
import { assertPlan, type Plan } from './planner'
import { assertRegistry, ensure, identifier, type Registry } from './source-registry'
import { reconcileContractWrite, type Proposal, type BridgePorts } from './economic-bridge'

export type DurableResult = { status: 'NOT_STARTED' | 'CONFIRMED' | 'UNKNOWN' | 'CONFLICT'; stateId?: string; observationId?: string }
export type SettlementProof = { requestId: string; reference: string; outcome: 'ROLLED_BACK_OR_NOT_DISPATCHED' }
// One immutable proposal per journal; catalog/plan/proposal must be retained independently.
export class DurableContractAttempt {
  private busy = false
  private constructor(private store: JsonReceiptCheckpointStore, private proposal: Proposal,
    private plan: Plan, private registry: Registry, private ports: BridgePorts) {}
  static runId(p: Proposal) { return `economic-${hash(p.command.requestId)}` }
  static async open(root: string, p: Proposal, plan: Plan, registry: Registry, ports: BridgePorts) {
    // Reuse bridge validation, including mandatory selectCurrent=false, without I/O.
    reconcileContractWrite(p, { kind: 'INDETERMINATE' }); assertPlan(plan); assertRegistry(registry)
    ensure(plan.queue.length === 1 && plan.blocked.length === 0, 'SINGLE_ATTEMPT_REQUIRED')
    const job = plan.queue[0], c = job.input.contract, s = p.command.state
    ensure(s.metadata.evidenceRef?.startsWith('catalog/') && p.command.requestId === `contract_${hash({
      bridgeVersion: p.bridgeVersion, recordHash: s.metadata.evidenceRef.slice(8), providerPlayerId: s.providerPlayerId,
    })}`, 'UNSTABLE_REQUEST_ID')
    ensure(job.requestId === p.command.requestId && c.playerId === s.playerId && c.context === s.context &&
      c.provider === s.provider && job.sourceId === s.metadata.source && job.sourceVersion === s.metadata.sourceVersion &&
      c.sourceReference === s.metadata.evidenceRef && c.provenance.evidenceReference === s.metadata.evidenceRef &&
      c.observedAt === p.command.observedAt && c.providerEffectiveAt === s.providerEffectiveAt &&
      c.contractUntil.value === s.contractUntil && c.contractUntil.datePrecision === 'DAY' && c.identityConfidence === 'HIGH' &&
      job.temporalLink === 'CONSISTENT' && !job.signals.conflict &&
      ['playerId','clubId','context','season'].every(k => c[k as keyof typeof c] === job.expected[k as keyof typeof job.expected]), 'PROPOSAL_PLAN_MISMATCH')
    const store = await JsonReceiptCheckpointStore.create(root, this.runId(p), plan, registry)
    return new DurableContractAttempt(store, structuredClone(p), structuredClone(plan), structuredClone(registry), ports)
  }
  private async exclusive<T>(work: () => Promise<T>) {
    ensure(!this.busy, 'CONCURRENT_ATTEMPT'); this.busy = true
    try { return await work() } finally { this.busy = false }
  }
  private async reconcile(proof?: SettlementProof, acknowledged?: { stateId: string; observationId: string }): Promise<DurableResult> {
    const local = this.store.recover()
    let result
    try { result = reconcileContractWrite(this.proposal, await this.ports.readBack(this.proposal.command.requestId)) }
    catch { return { status: 'UNKNOWN' } }
    if (result.status === 'INDETERMINATE') return { status: 'UNKNOWN' }
    if (result.status === 'CONFLICT') return { status: 'CONFLICT' }
    if (result.status === 'CONFIRMED') {
      if (acknowledged && (acknowledged.stateId !== result.stateId || acknowledged.observationId !== result.observationId)) return { status: 'CONFLICT' }
      identifier(result.stateId); identifier(result.observationId)
      const reference = `db/${result.stateId}/${result.observationId}`
      identifier(reference)
      if (local.cursor === 1) {
        const applied = local.reconciliations.find(r => r.outcome === 'APPLIED')
        if (applied?.reference !== reference) return { status: 'CONFLICT' }
      } else {
        if (!local.uncertain) await this.store.begin(this.proposal.command.requestId)
        // This is still an OFFLINE receipt. Only PostgreSQL read-back establishes DB confirmation.
        await this.store.confirm(simulateReceipt(this.plan, 0, this.registry), reference)
      }
      return { status: 'CONFIRMED', stateId: result.stateId, observationId: result.observationId }
    }
    if (acknowledged) return { status: 'CONFLICT' }
    if (local.cursor !== 0) return { status: 'CONFLICT' }
    if (local.uncertain) {
      if (!proof) return { status: 'UNKNOWN' } // Absence alone is not rollback proof.
      ensure(proof.requestId === this.proposal.command.requestId && proof.outcome === 'ROLLED_BACK_OR_NOT_DISPATCHED', 'INVALID_SETTLEMENT')
      identifier(proof.reference)
      await this.store.reconcileNotApplied(proof.requestId, proof.reference)
    }
    return { status: 'NOT_STARTED' }
  }
  async recover(proof?: SettlementProof) { return this.exclusive(() => this.reconcile(proof)) }
  // Explicit prepare is useful for handing off dispatch and for crash injection tests.
  async prepare() {
    return this.exclusive(async () => {
      const result = await this.reconcile()
      if (result.status === 'NOT_STARTED') await this.store.begin(this.proposal.command.requestId)
      return result.status === 'NOT_STARTED' ? { status: 'UNKNOWN' as const } : result
    })
  }
  async execute() {
    return this.exclusive(async () => {
      const before = await this.reconcile()
      if (before.status !== 'NOT_STARTED') return before
      await this.store.begin(this.proposal.command.requestId)
      let acknowledged: { stateId: string; observationId: string } | undefined
      try { acknowledged = await this.ports.writer(structuredClone(this.proposal.command)) }
      catch { /* Uniqueness/transport/rollback errors never prove success and never trigger retries. */ }
      return this.reconcile(undefined, acknowledged)
    })
  }
  binding() {
    return { requestId: this.proposal.command.requestId, evidenceRef: this.proposal.command.state.metadata.evidenceRef,
      economicContentHash: this.proposal.contentHash, proposalHash: this.proposal.proposalHash, selectionHash: this.plan.planHash,
      bindingHash: hash([this.proposal.proposalHash,this.plan.planHash]), selectCurrent: false as const }
  }
  async close() { ensure(!this.busy, 'CONCURRENT_ATTEMPT'); await this.store.close() }
}
