import { canonicalJson } from "../lib/clubContexts"
import { jointHash, validateJointTransferPayload, type JointTransferPayload } from "../lib/jointTransferContexts"
import { prepareIncrementalLoanSync } from "../lib/jointTransferLoanSync"
import { prepareIncrementalSquadSync } from "../lib/eaSquadSync"

/** Joins existing deterministic planners; no provider call, scheduler, writer or runtime activation. */
export function prepareJointTransferSynchronization(input: {
  before: readonly JointTransferPayload[]; candidates: readonly JointTransferPayload[]; expectedBeforeHash: string; asOf: string;
  unverifiedRealEaIds: readonly string[];
  squadChange?: Parameters<typeof prepareIncrementalSquadSync>[0]
}) {
  if (jointHash(input.before) !== input.expectedBeforeHash) throw new Error("JOINT_SYNC_BASELINE_CHANGED")
  const before = new Map(input.before.map(p => [p.eaPlayerId, p]))
  if (before.size !== input.before.length || new Set(input.candidates.map(p => p.eaPlayerId)).size !== input.candidates.length) throw new Error("JOINT_SYNC_DUPLICATE_ID")
  for (const p of input.before) validateJointTransferPayload(p)
  const review: { eaId: string; reasons: string[] }[] = [], valid: JointTransferPayload[] = []
  for (const p of input.candidates) {
    try { validateJointTransferPayload(p); valid.push(p) }
    catch (error) { review.push({ eaId: p.eaPlayerId, reasons: [error instanceof Error ? error.message : "INVALID_JOINT_PAYLOAD"] }) }
  }
  const currentLoans = (rows: readonly JointTransferPayload[]) => rows.flatMap(p => [p.jointTransfer.game.loan, p.jointTransfer.real?.loan].filter(l => l != null))
  const loansBefore = currentLoans(input.before)
  const loans = prepareIncrementalLoanSync({ before: loansBefore,
    next: [...currentLoans(valid), ...valid.flatMap(p => p.jointTransfer.history)], asOf: input.asOf, expectedBeforeHash: jointHash(loansBefore) })
  const squad = input.squadChange ? prepareIncrementalSquadSync(input.squadChange) : null
  const updates = valid.flatMap(payload => {
    const previous = before.get(payload.eaPlayerId), reasons: string[] = []
    const changedGame = !previous || canonicalJson(previous.game) !== canonicalJson(payload.game) || canonicalJson(previous.jointTransfer.game) !== canonicalJson(payload.jointTransfer.game)
    const changedReal = !!payload.jointTransfer.real && (!previous || canonicalJson(previous.real) !== canonicalJson(payload.real) || canonicalJson(previous.jointTransfer.real) !== canonicalJson(payload.jointTransfer.real))
    if (changedReal && input.unverifiedRealEaIds.includes(payload.eaPlayerId)) reasons.push("UNVERIFIED_REAL_SIGNAL_EXCLUDED")
    reasons.push(...loans.review.filter(r => r.eaId === payload.eaPlayerId).flatMap(r => r.reasons), ...loans.rejected.filter(r => r.eaId === payload.eaPlayerId).map(r => r.reason))
    if (changedGame) reasons.push(...squad?.changes.filter(c => c.eaId === payload.eaPlayerId && c.state === "BLOCKED").flatMap(c => c.reasons) ?? [])
    // Clearing an active loan needs a terminal observation for that exact episode.
    for (const context of ["game", "real"] as const) {
      const old = previous?.jointTransfer[context]?.loan, next = payload.jointTransfer[context]?.loan
      if (old && ["ACTIVE", "ACTIVE_IN_SNAPSHOT"].includes(old.state) && !next &&
        !payload.jointTransfer.history.some(h => h.context === old.context && h.loanKey === old.loanKey && ["ENDED_CONFIRMED", "RETURN_CONFIRMED", "PERMANENT_CONFIRMED"].includes(h.state))) reasons.push("ACTIVE_LOAN_CANNOT_DISAPPEAR_WITHOUT_CLOSURE")
    }
    if (reasons.length) { review.push({ eaId: payload.eaPlayerId, reasons: [...new Set(reasons)] }); return [] }
    if (previous && jointHash(previous) === jointHash(payload)) return []
    return [{ eaId: payload.eaPlayerId, payload, payloadHash: jointHash(payload), expectedPreviousPayloadHash: previous ? jointHash(previous) : null,
      contexts: [...changedGame ? ["GAME" as const] : [], ...changedReal ? ["REAL" as const] : []],
      rollback: { compareAndSwapRequired: true, restorePreviousPayloadHash: previous ? jointHash(previous) : null },
      publicActivationAllowed: false, requiresSourceRightsAndChronologyReview: changedGame }]
  })
  const content = { beforeHash: input.expectedBeforeHash, updates, review, loans, squad }
  const batchHash = jointHash(content)
  return { ...content, batchHash, idempotencyKey: `joint-transfer:${batchHash}`, checkpoint: { batchHash, nextUpdateIndex: 0 },
    mode: "PREPARE_ONLY" as const, executionAuthorized: false, projectedRosterEnabled: false,
    canonicalReferenceChosen: false, unknownRealSignalsProcessed: 0, paidCalls: 0 }
}
