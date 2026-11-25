import { createHash } from "node:crypto"
import { canonicalJson, validateClubContexts, type ClubContexts } from "./clubContexts"
import { classifyMovement, projectLoanMembership, validateLoanObservation, type LoanObservation, type MovementKind, type LoanPresentation, type MembershipState } from "./jointTransferLoanSync"
import { validateRealGameProjection, realGameProjectionView, realGamePolicyHash, type RealGameProjection } from "./realGameProjection"
import { decodeJointReadIds, jointReadIdLimit } from "./jointReadIds"

export type BoundClub = { id: string; eaId: string | null; name: string; slug: string | null;
  league: { id: string; name: string; slug: string | null } | null }
export type BoundMembership = {
  context: "REAL" | "GAME"; state: MembershipState; club: BoundClub | null; parentClub: BoundClub | null
  loan: LoanObservation | null; nationalTeams: readonly { eaTeamId: string; name: string }[]
  nationalCoverage: "KNOWN" | "UNKNOWN" | "NOT_IN_SQUAD"
}
export type JointMovement = { eaId: string; context: "REAL" | "GAME"; kind: MovementKind; evidenceConfirmed: boolean;
  sourceUrl: string; evidenceHash: string; effectiveAt: string | null;
  route?: { fromState: "CLUB" | "FREE_AGENT"; fromClub: BoundClub | null; toClub: BoundClub } }
export type JointTransferPayload = ClubContexts & { jointTransfer: {
  version: 1; game: BoundMembership; real: BoundMembership | null; history: readonly LoanObservation[];
  movements: readonly JointMovement[]; projected: false
  futscoutProjection?: RealGameProjection
} }
export const jointHash = (v: unknown) => createHash("sha256").update(canonicalJson(v)).digest("hex")
const sha = /^[a-f0-9]{64}$/
const https = (v: string) => { try { return new URL(v).protocol === "https:" } catch { return false } }

export function validateJointTransferPayload(payload: JointTransferPayload, eaId = payload.eaPlayerId) {
  validateClubContexts(payload, eaId)
  const j = payload.jointTransfer
  if (!j || j.version !== 1 || j.projected !== false || j.game.context !== "GAME" || j.real && j.real.context !== "REAL")
    throw new Error("JOINT_CONTEXT_VERSION_OR_PROJECTION_INVALID")
  for (const member of [j.game, ...(j.real ? [j.real] : [])]) {
    if (!["CLUB", "FREE_AGENT", "UNKNOWN", "NOT_IN_SQUAD", ...(member.context === "REAL" ? ["RETIRED"] : [])].includes(member.state) ||
      (member.state === "CLUB") !== (member.club !== null) || !["KNOWN", "UNKNOWN", "NOT_IN_SQUAD"].includes(member.nationalCoverage)) throw new Error("JOINT_MEMBERSHIP_INVALID")
    for (const club of [member.club, member.parentClub].filter((c): c is BoundClub => c !== null))
      if (!club.id || !club.name || club.eaId === "111592" || club.eaId !== null && !/^\d+$/.test(club.eaId)) throw new Error("JOINT_CLUB_BINDING_INVALID")
    if (member.context === "REAL" && member.nationalTeams.length) throw new Error("GAME_NATIONALS_IN_REAL_CONTEXT")
    if (member.context === "GAME" && (member.state === "NOT_IN_SQUAD" && (member.nationalCoverage !== "NOT_IN_SQUAD" || member.nationalTeams.length > 0) ||
      member.state !== "NOT_IN_SQUAD" && member.nationalCoverage === "NOT_IN_SQUAD")) throw new Error("JOINT_ABSENT_NATIONAL_COVERAGE_INVALID")
    if (new Set(member.nationalTeams.map(t => t.eaTeamId)).size !== member.nationalTeams.length || member.nationalTeams.some(t =>
      !/^\d+$/.test(t.eaTeamId) || !t.name || !payload.game.nativeTeamIds.includes(t.eaTeamId) || payload.game.nativeClubTeamIds.includes(t.eaTeamId) || t.eaTeamId === "111592")) throw new Error("JOINT_NATIONAL_EVIDENCE_INVALID")
    if (member.loan) {
      const loan = member.loan
      validateLoanObservation(loan)
      if (loan.eaId !== eaId || loan.context !== member.context || !member.parentClub || !member.club ||
        loan.parentClub.id !== (member.context === "GAME" ? member.parentClub.eaId : member.parentClub.id) ||
        loan.playingClub.id !== (member.context === "GAME" ? member.club.eaId : member.club.id) ||
        member.context === "GAME" && loan.evidence.snapshot!.contentHash !== payload.game.snapshot.contentHash)
        throw new Error("JOINT_LOAN_BINDING_MISMATCH")
    } else if (member.parentClub) throw new Error("JOINT_PARENT_WITHOUT_LOAN")
  }
  const game = j.game
  if ((game.state === "CLUB" ? "CLUB" : game.state === "FREE_AGENT" ? "NG_FA" : "UNKNOWN") !== payload.game.status ||
    game.club?.eaId !== (payload.game.club?.eaId ?? undefined) && game.club !== null) throw new Error("JOINT_GAME_STATE_MISMATCH")
  if (j.real && ((j.real.state === "CLUB" ? "CLUB" : j.real.state === "FREE_AGENT" ? "FREE_AGENT" : j.real.state === "RETIRED" ? "RETIRED" : "UNKNOWN") !== payload.real?.status ||
    j.real.club && (j.real.club.name !== payload.real?.club?.name || j.real.club.eaId !== payload.real?.club?.eaId))) throw new Error("JOINT_REAL_STATE_MISMATCH")
  if (j.real && ["FREE_AGENT", "RETIRED"].includes(j.real.state)) {
    const latest = j.movements.filter(m => m.context === "REAL").at(-1)
    const expected = j.real.state === "RETIRED" ? "RETIREMENT_CONFIRMED" : "CURRENT_FREE_AGENT_CONFIRMED"
    if (latest?.kind !== expected || latest.evidenceHash !== payload.real?.evidenceHash || latest.sourceUrl !== payload.real?.sourceUrl || latest.route)
      throw new Error("JOINT_REAL_EMPLOYMENT_EVIDENCE_REQUIRED")
  }
  for (const row of j.history) { validateLoanObservation(row); if (row.eaId !== eaId) throw new Error("JOINT_HISTORY_IDENTITY_MISMATCH") }
  for (const row of j.movements) {
    classifyMovement(row.kind, row.evidenceConfirmed)
    if (["CURRENT_FREE_AGENT_CONFIRMED", "RETIREMENT_CONFIRMED"].includes(row.kind) && row.context !== "REAL")
      throw new Error("EMPLOYMENT_OBSERVATION_IS_REAL_ONLY")
    if (row.eaId !== eaId || !["REAL", "GAME"].includes(row.context) || !sha.test(row.evidenceHash) || !https(row.sourceUrl) ||
      row.effectiveAt !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(row.effectiveAt) || new Date(row.effectiveAt).toISOString().slice(0, 10) !== row.effectiveAt)) throw new Error("JOINT_MOVEMENT_INVALID")
    if (row.route) {
      const r = row.route
      if (row.context !== "REAL" || !["CLUB", "FREE_AGENT"].includes(r.fromState) ||
        (r.fromState === "CLUB") !== (r.fromClub !== null) || !r.toClub || r.fromClub?.id === r.toClub.id)
        throw new Error("REAL_MOVEMENT_ROUTE_INVALID")
      for (const c of [r.fromClub, r.toClub].filter((c): c is BoundClub => c !== null))
        if (!c.id || !c.name || c.eaId === "111592" || c.eaId !== null && !/^\d+$/.test(c.eaId)) throw new Error("REAL_MOVEMENT_CLUB_INVALID")
    }
  }
  validateRealGameProjection(payload)
}

/** Source observations retain their original IDs/hashes. Only the display adapter binds database club IDs. */
export function jointTransferViews(payload: JointTransferPayload, asOf: string, mode: "EA_SNAPSHOT" | "FUTSCOUT_PROJECTED" = "EA_SNAPSHOT"): JointTransferViews {
  validateJointTransferPayload(payload)
  const view = (m: BoundMembership) => {
    const value = projectLoanMembership({ asOf, membership: {
      eaId: payload.eaPlayerId, context: m.context, state: m.state, club: m.club, nationalTeams: m.nationalTeams,
    }, loan: m.loan ? { ...m.loan, parentClub: m.parentClub!, playingClub: m.club! } : null })
    if (!value.evidence && m.context === "GAME") value.evidence = {
      url: payload.game.snapshot.sourceUrl, evidenceDate: payload.game.snapshot.effectiveAt?.slice(0, 10) ?? null,
      consultedAt: payload.game.snapshot.observedAt, contentHash: payload.game.evidenceHash,
      snapshot: { version: payload.game.snapshot.rosterVersion ?? "FC 27 — arquivo consultado", contentHash: payload.game.snapshot.contentHash, effectiveAt: payload.game.snapshot.effectiveAt?.slice(0, 10) ?? null },
    }
    if (!value.evidence && m.context === "REAL" && payload.real) value.evidence = { url: payload.real.sourceUrl,
      evidenceDate: payload.real.effectiveAt?.slice(0, 10) ?? null, consultedAt: payload.real.observedAt, contentHash: payload.real.evidenceHash, snapshot: null }
    return value
  }
  const original = view(payload.jointTransfer.game)
  return { game: mode === "FUTSCOUT_PROJECTED" ? realGameProjectionView(payload, asOf) : original,
    real: payload.jointTransfer.real ? view(payload.jointTransfer.real) : null,
    ...(mode === "FUTSCOUT_PROJECTED" ? { snapshotGame: original,
      projectedRealLoanRoute: payload.jointTransfer.futscoutProjection?.representation === "FREE_AGENT" ? payload.jointTransfer.futscoutProjection.realLoanRoute : null } : {}),
  }
}
export type JointTransferViews = { game: LoanPresentation | null; real: LoanPresentation | null; snapshotGame?: LoanPresentation | null;
  projectedRealLoanRoute?: RealGameProjection["realLoanRoute"] }

export type JointReadManifest = { version: 1; decisionReference: string; entries: { eaId: string; payloadHash: string; snapshotHash: string; contexts: ("REAL" | "GAME")[];
  gameView?: "EA_SNAPSHOT" | "FUTSCOUT_PROJECTED" }[] }
function jointReadEnvironmentEnabled(env: Readonly<Record<string, string | undefined>>) {
  return env.JOINT_TRANSFER_READ_ENABLED === "1" && (env.VERCEL_ENV === "preview" && env.CLUB_CONTEXTS_PREVIEW_READ_ONLY === "1" ||
    env.VERCEL_ENV === "production" && env.JOINT_TRANSFER_READ_PRODUCTION_ENABLED === "1")
}
export function jointReadManifest(env: Readonly<Record<string, string | undefined>> = {}): JointReadManifest | null {
  if (!jointReadEnvironmentEnabled(env)) return null
  try {
    const value = JSON.parse(env.JOINT_TRANSFER_READ_MANIFEST ?? "null") as JointReadManifest
    if (!value || jointHash(value) !== env.JOINT_TRANSFER_READ_MANIFEST_SHA256 || value.version !== 1 || !value.decisionReference?.trim() ||
      !Array.isArray(value.entries) || !value.entries.length || value.entries.length > 1000 || new Set(value.entries.map(e => e.eaId)).size !== value.entries.length ||
      value.entries.some(e => !/^\d+$/.test(e.eaId) || !sha.test(e.payloadHash) || !sha.test(e.snapshotHash) ||
        !Array.isArray(e.contexts) || !e.contexts.length || new Set(e.contexts).size !== e.contexts.length || e.contexts.some(c => c !== "REAL" && c !== "GAME"))) return null
    if (value.entries.some(e => e.gameView && e.gameView !== "EA_SNAPSHOT" && e.gameView !== "FUTSCOUT_PROJECTED" || e.gameView === "FUTSCOUT_PROJECTED" &&
      (e.contexts.length !== 2 || !e.contexts.includes("REAL") || !e.contexts.includes("GAME") || env.JOINT_REAL_GAME_PROJECTION_READ_ENABLED !== "1" || env.JOINT_REAL_GAME_POLICY_SHA256 !== realGamePolicyHash))) return null
    return value
  } catch { return null }
}

export type JointReadConfiguration = { source: "INLINE"; manifest: JointReadManifest } | {
  source: "DATABASE"; eaIds: string[]; selectionVersion: number; manifestHash: string
} | {
  source: "DATABASE_INDEX"; eaIds: string[]; manifestHash: string; transitionHashes?: readonly [string, string]
}

export const jointReadIndexLimit = jointReadIdLimit
export type JointReadIndexEntry = { eaId: string; selectionVersion: number; revisionId: string; decisionReference: string;
  payloadHash: string; snapshotId: string; snapshotHash: string }
export type JointReadIndex = { version: 2; policyHash: string; entries: JointReadIndexEntry[] }

/** Only immutable revision/reference metadata is indexed. Each consumed payload is verified separately. */
export function verifyJointReadIndex(index: JointReadIndex, eaIds: readonly string[], expectedHash: string): void {
  if (index.version !== 2 || index.policyHash !== realGamePolicyHash || !sha.test(expectedHash) || jointHash(index) !== expectedHash ||
    !index.entries.length || index.entries.length > jointReadIndexLimit || index.entries.length !== eaIds.length ||
    new Set(index.entries.map(e => e.eaId)).size !== index.entries.length || index.entries.some((e, i) => e.eaId !== eaIds[i] ||
      !/^[1-9]\d{0,11}$/.test(e.eaId) || !Number.isSafeInteger(e.selectionVersion) || e.selectionVersion < 1 ||
      !e.revisionId?.trim() || !e.decisionReference?.trim() || !e.snapshotId?.trim() || !sha.test(e.payloadHash) || !sha.test(e.snapshotHash)))
    throw new Error("JOINT_APPROVED_INDEX_CHANGED")
}

/** Operator preparation cannot replace or omit a protected existing selection when extending its index. */
export function extendJointReadIndex(previous: JointReadIndex, expectedPreviousHash: string, additions: readonly JointReadIndexEntry[]): JointReadIndex {
  verifyJointReadIndex(previous, previous.entries.map(e => e.eaId), expectedPreviousHash)
  const entries = new Map(previous.entries.map(e => [e.eaId, e]))
  for (const row of additions) {
    const old = entries.get(row.eaId)
    if (old && canonicalJson(old) !== canonicalJson(row)) throw new Error("JOINT_PROTECTED_SELECTION_CHANGED")
    entries.set(row.eaId, structuredClone(row))
  }
  const index = { version: 2 as const, policyHash: previous.policyHash, entries: [...entries.values()] }
  verifyJointReadIndex(index, index.entries.map(e => e.eaId), jointHash(index))
  return index
}

/** The database transport carries no payloads. Its externally pinned manifest must be verified by the reader. */
export function jointReadConfiguration(env: Readonly<Record<string, string | undefined>> = {}): JointReadConfiguration | null {
  if (!jointReadEnvironmentEnabled(env)) return null
  const transitionEnabled = env.JOINT_TRANSFER_READ_TRANSITION_ENABLED
  const transitionRaw = env.JOINT_TRANSFER_READ_TRANSITION_SHA256S
  if (transitionEnabled !== undefined && transitionEnabled !== "0" && transitionEnabled !== "1" ||
    transitionRaw !== undefined && transitionEnabled !== "1" ||
    transitionEnabled === "1" && env.JOINT_TRANSFER_READ_MANIFEST_SOURCE !== "DATABASE_INDEX") return null
  if (env.JOINT_TRANSFER_READ_MANIFEST_SOURCE === undefined) {
    if (env.JOINT_TRANSFER_READ_EA_IDS !== undefined || env.JOINT_TRANSFER_READ_SELECTION_VERSION !== undefined) return null
    const manifest = jointReadManifest(env)
    return manifest ? { source: "INLINE", manifest } : null
  }
  if (!["DATABASE", "DATABASE_INDEX"].includes(env.JOINT_TRANSFER_READ_MANIFEST_SOURCE) || env.JOINT_TRANSFER_READ_MANIFEST !== undefined ||
    env.JOINT_REAL_GAME_PROJECTION_READ_ENABLED !== "1" || env.JOINT_REAL_GAME_POLICY_SHA256 !== realGamePolicyHash ||
    !sha.test(env.JOINT_TRANSFER_READ_MANIFEST_SHA256 ?? "")) return null
  const rawIds = env.JOINT_TRANSFER_READ_EA_IDS ?? "", rawVersion = env.JOINT_TRANSFER_READ_SELECTION_VERSION ?? ""
  if (env.JOINT_TRANSFER_READ_MANIFEST_SOURCE === "DATABASE_INDEX") {
    const eaIds = decodeJointReadIds(rawIds)
    if (env.JOINT_TRANSFER_READ_SELECTION_VERSION !== undefined || !eaIds) return null
    const hashes = transitionEnabled === "1" ? (transitionRaw ?? "").split(",") : []
    if (transitionEnabled === "1" && (hashes.length !== 2 || hashes.some(h => !sha.test(h)) ||
      new Set([env.JOINT_TRANSFER_READ_MANIFEST_SHA256!, ...hashes]).size !== 3)) return null
    return { source: "DATABASE_INDEX", eaIds, manifestHash: env.JOINT_TRANSFER_READ_MANIFEST_SHA256!,
      ...(transitionEnabled === "1" ? { transitionHashes: hashes as [string, string] } : {}) }
  }
  const eaIds = rawIds.split(","), selectionVersion = Number(rawVersion)
  if (rawIds.length > 200 || !eaIds.length || eaIds.length > 10 || new Set(eaIds).size !== eaIds.length ||
    eaIds.some(id => !/^[1-9]\d{0,11}$/.test(id)) || !/^[1-9]\d{0,9}$/.test(rawVersion) || !Number.isSafeInteger(selectionVersion)) return null
  return { source: "DATABASE", eaIds, selectionVersion, manifestHash: env.JOINT_TRANSFER_READ_MANIFEST_SHA256! }
}

/** Merge only explicitly supplied contexts. A REAL change never rewrites GAME or principal contracts. */
export function prepareJointContextPayload(base: ClubContexts, patch: {
  game?: BoundMembership; real?: { membership: BoundMembership; evidence: NonNullable<ClubContexts["real"]> };
  history?: readonly LoanObservation[]; movements?: readonly JointMovement[]
}): JointTransferPayload {
  const prior = (base as Partial<JointTransferPayload>).jointTransfer
  const game = patch.game ?? prior?.game
  if (!game) throw new Error("EXPLICIT_GAME_MEMBERSHIP_REQUIRED")
  const payload = { ...base, ...(patch.real ? { real: patch.real.evidence } : {}), jointTransfer: {
    version: 1 as const, game, real: patch.real?.membership ?? prior?.real ?? null,
    history: [...new Map([...(prior?.history ?? []), ...(patch.history ?? [])].map(r => [jointHash(r), r])).values()],
    movements: [...new Map([...(prior?.movements ?? []), ...(patch.movements ?? [])].map(r => [jointHash(r), r])).values()], projected: false as const,
    ...(prior?.futscoutProjection && !patch.real && !patch.game && !patch.movements ? { futscoutProjection: prior.futscoutProjection } : {}),
  } }
  validateJointTransferPayload(payload)
  return payload
}
