import { createHash } from "node:crypto"
import { canonicalJson } from "./clubContexts"
import type { GameClubState } from "./eaSquadSync"

export type LoanContext = "REAL" | "GAME"
export type LoanClub = Readonly<{ id: string; name: string }>
export type LoanEvidence = Readonly<{
  url: string; evidenceDate: string | null; consultedAt: string; contentHash: string
  snapshot: Readonly<{ version: string; contentHash: string; effectiveAt: string | null }> | null
}>
export type LoanObservation = Readonly<{
  eaId: string; context: LoanContext; loanKey: string
  state: "ACTIVE" | "ACTIVE_IN_SNAPSHOT" | "ENDED_CONFIRMED" | "RETURN_CONFIRMED" | "PERMANENT_CONFIRMED" | "PENDING_VERIFICATION"
  parentClub: LoanClub; playingClub: LoanClub
  startsAt: string | null; endsAt: string | null; endSeason: string | null
  purchase: Readonly<{
    kind: "OPTION" | "OBLIGATION" | "CONDITIONAL_OBLIGATION" | "NONE_CONFIRMED" | "UNKNOWN"
    condition: string | null; evidenceUrl: string | null
    nativeFlag?: number; nativeAmountRaw?: number
  }>
  identityConfirmed: boolean; chronologyConfirmed: boolean; movementTypeConfirmed: boolean
  evidence: LoanEvidence
}>
export type MovementKind = "PERMANENT_TRANSFER" | "LOAN_START" | "LOAN_RETURN_CONFIRMED" | "LOAN_RECALL_CONFIRMED" | "LOAN_TO_PERMANENT" | "CURRENT_CLUB_CONFIRMED"
const hash = (v: unknown) => createHash("sha256").update(canonicalJson(v)).digest("hex")
const date = (value: string | null) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const https = (url: string) => { try { return new URL(url).protocol === "https:" } catch { return false } }

export function validateLoanObservation(row: LoanObservation): void {
  if (!/^\d+$/.test(row.eaId) || !row.loanKey || !["REAL", "GAME"].includes(row.context) ||
      !row.parentClub.id || !row.playingClub.id || !row.parentClub.name || !row.playingClub.name ||
      row.parentClub.id === row.playingClub.id) throw new Error("LOAN_IDENTITY_OR_CLUB_INVALID")
  if (!date(row.startsAt) || !date(row.endsAt) || !date(row.evidence.evidenceDate) ||
      row.startsAt && row.endsAt && row.startsAt > row.endsAt ||
      row.endSeason !== null && !/^(?:19|20)\d{2}$/.test(row.endSeason) && (!/^\d{4}\/\d{2}$/.test(row.endSeason) ||
        Number(row.endSeason.slice(5)) !== (Number(row.endSeason.slice(0, 4)) + 1) % 100)) throw new Error("LOAN_DATES_INVALID")
  if (!https(row.evidence.url) || !/^[a-f0-9]{64}$/.test(row.evidence.contentHash) ||
      Number.isNaN(Date.parse(row.evidence.consultedAt))) throw new Error("LOAN_EVIDENCE_INVALID")
  if ([row.identityConfirmed, row.chronologyConfirmed, row.movementTypeConfirmed].some(value => typeof value !== "boolean")) throw new Error("LOAN_CONFIRMATION_FLAGS_INVALID")
  if (!["ACTIVE", "ACTIVE_IN_SNAPSHOT", "ENDED_CONFIRMED", "RETURN_CONFIRMED", "PERMANENT_CONFIRMED", "PENDING_VERIFICATION"].includes(row.state) ||
      !["OPTION", "OBLIGATION", "CONDITIONAL_OBLIGATION", "NONE_CONFIRMED", "UNKNOWN"].includes(row.purchase.kind)) throw new Error("LOAN_STATE_INVALID")
  if (row.context === "GAME" && (!row.evidence.snapshot?.version || !/^[a-f0-9]{64}$/.test(row.evidence.snapshot.contentHash) ||
      !date(row.evidence.snapshot.effectiveAt))) throw new Error("GAME_LOAN_VERSION_REQUIRED")
  if (row.context === "REAL" && (row.evidence.snapshot !== null || row.state === "ACTIVE_IN_SNAPSHOT")) throw new Error("REAL_GAME_LOAN_CONTEXT_MIXED")
  if (row.context === "GAME" && row.state === "ACTIVE") throw new Error("GAME_LOAN_MUST_BE_SNAPSHOT_BOUND")
  if (row.purchase.kind !== "UNKNOWN" && (!row.purchase.evidenceUrl || !https(row.purchase.evidenceUrl))) throw new Error("PURCHASE_TERMS_EVIDENCE_REQUIRED")
  if (row.purchase.kind === "CONDITIONAL_OBLIGATION" && !row.purchase.condition) throw new Error("PURCHASE_CONDITION_REQUIRED")
}
export const loanObservationHash = (row: LoanObservation) => { validateLoanObservation(row); return hash(row) }
const isActive = (row: LoanObservation) => row.state === "ACTIVE" || row.state === "ACTIVE_IN_SNAPSHOT"
const scopeKey = (row: LoanObservation) => `${row.context}:${row.eaId}:${row.context === "GAME" ? row.evidence.snapshot!.contentHash : "REAL"}`

/** Expiration is a verification signal, never an implied return, purchase or change of parent club. */
export function loanEffectiveState(row: LoanObservation, asOf: string) {
  validateLoanObservation(row)
  if (!asOf || !date(asOf)) throw new Error("LOAN_CLOCK_INVALID")
  if (!row.identityConfirmed || !row.chronologyConfirmed || !row.movementTypeConfirmed)
    return "PENDING_VERIFICATION" as const
  if (row.context === "GAME" && isActive(row) && row.endsAt && row.evidence.snapshot?.effectiveAt && row.endsAt < row.evidence.snapshot.effectiveAt)
    return "PENDING_VERIFICATION" as const
  if (row.context === "REAL" && row.state === "ACTIVE" && row.endsAt && row.endsAt < asOf)
    return "PENDING_VERIFICATION" as const
  if (row.context === "REAL" && row.state === "ACTIVE" && row.startsAt && row.startsAt > asOf)
    return "PENDING_VERIFICATION" as const
  if (row.context === "REAL" && row.state === "ACTIVE" && row.endSeason && /^(?:19|20)\d{2}$/.test(row.endSeason) &&
      Number(asOf.slice(0, 4)) > Number(row.endSeason)) return "PENDING_VERIFICATION" as const
  return row.state
}

export function inspectLoanBatch(rows: readonly LoanObservation[], asOf: string) {
  const unique = new Map<string, LoanObservation>(), duplicateHashes: string[] = []
  const rejected: { eaId: string; context: LoanContext; reason: string }[] = []
  for (const row of rows) {
    try {
      const contentHash = loanObservationHash(row)
      if (unique.has(contentHash)) duplicateHashes.push(contentHash)
      else unique.set(contentHash, row)
    } catch (error) { rejected.push({ eaId: row.eaId, context: row.context, reason: error instanceof Error ? error.message : "INVALID_LOAN" }) }
  }
  const grouped = new Map<string, LoanObservation[]>()
  for (const row of unique.values()) { const key = scopeKey(row); grouped.set(key, [...grouped.get(key) ?? [], row]) }
  const results = [...grouped.entries()].map(([scope, observations]) => {
    const active = observations.filter(isActive), reasons: string[] = []
    if (active.length > 1) reasons.push("MULTIPLE_ACTIVE_LOANS")
    const byKey = new Map<string, LoanObservation[]>()
    for (const row of observations) byKey.set(row.loanKey, [...byKey.get(row.loanKey) ?? [], row])
    if ([...byKey.values()].some(versions => versions.length > 1)) reasons.push("SAME_LOAN_REVISION_REQUIRES_REVIEW")
    for (let i = 0; i < observations.length; i++) for (let j = i + 1; j < observations.length; j++) {
      const a = observations[i], b = observations[j]
      if (a.startsAt && a.endsAt && b.startsAt && b.endsAt && a.startsAt <= b.endsAt && b.startsAt <= a.endsAt)
        reasons.push("LOAN_PERIOD_OVERLAP")
    }
    for (const row of observations) {
      if (!row.identityConfirmed) reasons.push("IDENTITY_REVIEW_REQUIRED")
      if (!row.chronologyConfirmed) reasons.push("CHRONOLOGY_REVIEW_REQUIRED")
      if (!row.movementTypeConfirmed) reasons.push("MOVEMENT_TYPE_REVIEW_REQUIRED")
      if (loanEffectiveState(row, asOf) === "PENDING_VERIFICATION") reasons.push("CURRENT_STATUS_REQUIRES_VERIFICATION")
      if (row.context === "GAME" && isActive(row) && row.endsAt && row.evidence.snapshot?.effectiveAt && row.endsAt < row.evidence.snapshot.effectiveAt)
        reasons.push("LOAN_EXPIRED_BEFORE_SNAPSHOT_EFFECTIVE_DATE")
    }
    return { scope, eaId: observations[0].eaId, context: observations[0].context,
      state: reasons.length ? "REVIEW" as const : "PREPARED" as const, reasons: [...new Set(reasons)], observations }
  })
  return { results, duplicateHashes, rejected, ready: results.filter(r => r.state === "PREPARED").length,
    review: results.filter(r => r.state === "REVIEW").length }
}

export function classifyMovement(kind: MovementKind, evidenceConfirmed: boolean) {
  if (!evidenceConfirmed) throw new Error("MOVEMENT_EVIDENCE_REQUIRED")
  if (!["PERMANENT_TRANSFER", "LOAN_START", "LOAN_RETURN_CONFIRMED", "LOAN_RECALL_CONFIRMED", "LOAN_TO_PERMANENT", "CURRENT_CLUB_CONFIRMED"].includes(kind)) throw new Error("MOVEMENT_KIND_INVALID")
  return { kind, changesMainContractOwner: kind === "PERMANENT_TRANSFER" || kind === "LOAN_TO_PERMANENT",
    autoReturnOnEndDate: false, autoPurchaseOnOptionOrObligation: false }
}

export type LoanMembership = Readonly<{
  eaId: string; context: LoanContext; state: GameClubState; club: LoanClub | null
  nationalTeams: readonly { eaTeamId: string; name: string }[]
}>
export type ProjectedEligibility = {
  eaId: string; destinationId: string; policyVersion: string; policyHash: string; allowed: boolean
}

/** Shared view model for cards, profiles, searches and filters; economics deliberately absent. */
export function projectLoanMembership(input: {
  membership: LoanMembership; loan: LoanObservation | null; asOf: string;
  mode?: "NATIVE_CONTEXT" | "FUTSCOUT_PROJECTED"; eligibility?: ProjectedEligibility; approvedEligibilityPolicyHash?: string
}) {
  const { membership, loan, asOf } = input
  const projected = input.mode === "FUTSCOUT_PROJECTED"
  if (projected && (!input.eligibility?.allowed || input.eligibility.eaId !== membership.eaId ||
      input.eligibility.destinationId !== membership.club?.id || !input.eligibility.policyVersion ||
      !/^[a-f0-9]{64}$/.test(input.eligibility.policyHash) || input.eligibility.policyHash !== input.approvedEligibilityPolicyHash))
    throw new Error("APPROVED_PROJECTED_ELIGIBILITY_REQUIRED")
  if (loan) {
    validateLoanObservation(loan)
    if (loan.eaId !== membership.eaId || loan.context !== membership.context) throw new Error("LOAN_MEMBERSHIP_CONTEXT_MISMATCH")
    if (isActive(loan) && (membership.state !== "CLUB" || membership.club?.id !== loan.playingClub.id)) throw new Error("LOAN_PLAYING_CLUB_MISMATCH")
  }
  const state = loan ? loanEffectiveState(loan, asOf) : null
  const active = loan && isActive(loan) && state !== "PENDING_VERIFICATION" ? loan : null
  return {
    eaId: membership.eaId, context: membership.context, clubState: membership.state,
    playingClub: membership.club, parentClub: loan && isActive(loan) ? loan.parentClub : null,
    clubLabel: membership.club?.name ?? ({ FREE_AGENT: "Agente livre", UNKNOWN: "Clube desconhecido", NOT_IN_SQUAD: "Não encontrado neste squad", CLUB: "Clube desconhecido" }[membership.state]),
    loanBadge: active ? `Emprestado pelo ${active.parentClub.name}` : null,
    loanStatus: state, loanDates: loan ? { startsAt: loan.startsAt, endsAt: loan.endsAt, endSeason: loan.endSeason } : null,
    purchase: loan?.purchase ?? null, evidence: loan?.evidence ?? null,
    mainContractClub: loan && isActive(loan) ? loan.parentClub : null, mainContractEnd: null,
    loanParties: loan ? { parentClub: loan.parentClub, playingClub: loan.playingClub } : null,
    nationalTeams: membership.nationalTeams,
    provenanceLabel: projected ? "Elenco projetado FutScout — não corresponde a squad oficial" : membership.context === "GAME" ? "Snapshot EA consultado" : "Vida real — evidência própria",
    isOfficialSquadClaimed: false, displayContext: projected ? "FUTSCOUT_PROJECTED" : membership.context,
  }
}
export type LoanPresentation = ReturnType<typeof projectLoanMembership>
export function filterLoanPresentations(rows: readonly LoanPresentation[], filter: {
  context: LoanContext; playingClubId?: string; parentClubId?: string; state?: GameClubState; nationalTeamEaId?: string
}) {
  return rows.filter(row => row.context === filter.context &&
    (!filter.playingClubId || row.playingClub?.id === filter.playingClubId) &&
    (!filter.parentClubId || row.parentClub?.id === filter.parentClubId) &&
    (!filter.state || row.clubState === filter.state) &&
    (!filter.nationalTeamEaId || row.nationalTeams.some(t => t.eaTeamId === filter.nationalTeamEaId)))
}

export function prepareIncrementalLoanSync(input: {
  before: readonly LoanObservation[]; next: readonly LoanObservation[]; asOf: string; expectedBeforeHash: string
}) {
  const beforeHash = hash(input.before)
  if (beforeHash !== input.expectedBeforeHash) throw new Error("LOAN_BASELINE_CHANGED")
  for (const row of input.before) validateLoanObservation(row)
  const inspected = inspectLoanBatch(input.next, input.asOf), before = new Map(input.before.map(r => [scopeKey(r), r]))
  if (before.size !== input.before.length) throw new Error("LOAN_BASELINE_SCOPE_DUPLICATE")
  const transitionReview: typeof inspected.results = []
  const updates = inspected.results.filter(r => r.state === "PREPARED").flatMap(group => {
    // Different episodes and terminal events are retained as history; only the active pointer is selected.
    const active = group.observations.find(isActive), previous = before.get(group.scope)
    const priorClosed = previous && group.observations.some(row => row.loanKey === previous.loanKey && ["ENDED_CONFIRMED", "RETURN_CONFIRMED", "PERMANENT_CONFIRMED"].includes(row.state))
    const transitionReason = active && previous ? isActive(previous) && previous.loanKey !== active.loanKey && !priorClosed ? "PRIOR_ACTIVE_LOAN_NOT_CLOSED"
      : isActive(previous) && previous.loanKey === active.loanKey && (previous.parentClub.id !== active.parentClub.id || previous.playingClub.id !== active.playingClub.id) ? "LOAN_PARTIES_CHANGED_REVIEW"
      : !isActive(previous) && previous.loanKey === active.loanKey ? "REOPEN_CLOSED_LOAN_REQUIRES_REVIEW" : null : null
    if (transitionReason) { transitionReview.push({ ...group, state: "REVIEW", reasons: [transitionReason] }); return [] }
    // A terminal event may close only the same episode, never a later loan or another playing club.
    const terminal = previous && !active ? group.observations.find(row => row.loanKey === previous.loanKey &&
      ["ENDED_CONFIRMED", "RETURN_CONFIRMED", "PERMANENT_CONFIRMED"].includes(row.state)) : undefined
    const selected = active ?? terminal
    if (!selected) return []
    const nextHash = loanObservationHash(selected)
    if (previous && loanObservationHash(previous) === nextHash) return []
    return [{ eaId: selected.eaId, context: selected.context, scope: group.scope, next: selected,
      action: active ? "SELECT_LOAN" : "CLOSE_SAME_LOAN_WITHOUT_INFERRED_CLUB_CHANGE",
      expectedPreviousHash: previous ? loanObservationHash(previous) : null,
      nextHash, rollback: { expectedAppliedHash: nextHash, restorePreviousHash: previous ? loanObservationHash(previous) : null, compareAndSwapRequired: true } }]
  })
  const absentFromNext = input.before.filter(row => !inspected.results.some(r => r.scope === scopeKey(row))).map(row => ({ eaId: row.eaId, context: row.context, action: "PRESERVE_PREVIOUS_REVIEW_ABSENCE" }))
  const immutableHistory = [...new Map(inspected.results.flatMap(group => group.observations).map(row => [loanObservationHash(row), row])).entries()].map(([contentHash, observation]) => ({ contentHash, observation }))
  const content = { beforeHash, updates, immutableHistory, review: [...inspected.results.filter(r => r.state === "REVIEW"), ...transitionReview], rejected: inspected.rejected, absentFromNext }
  const batchHash = hash(content)
  return { ...content, batchHash, idempotencyKey: `joint-loan-sync:${batchHash}`, mode: "PREPARE_ONLY", executionAuthorized: false,
    checkpoint: { batchHash, nextUpdateIndex: 0 },
    forbiddenWriteTargets: ["Player.clubId", "NATIONAL_TEAMS", "SALARIES", "CONTRACTS", "MARKET_VALUES", "POTENTIAL", "MANUAL_EDITS"] }
}

export const emptyLoanBaselineHash = () => hash([])
