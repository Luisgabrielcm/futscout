import { createHash } from "node:crypto"
import { canonicalJson } from "./clubContexts"

/** Preparation only: no database client, environment flag, scheduler or write operation. */
export type SquadReference = Readonly<{
  sourceId: string
  version: string
  contentHash: string
  observedAt: string
  effectiveAt: string | null
  fullRoster: boolean
  nationalLinksComplete: boolean
}>
export type SquadTeam = Readonly<{ eaTeamId: string; name: string }>
export type SquadTeamLink = SquadTeam & Readonly<{ role: "CLUB" | "NATIONAL" | "SPECIAL" | "UNKNOWN" }>
export type GameClubState = "CLUB" | "FREE_AGENT" | "UNKNOWN" | "NOT_IN_SQUAD"
export type SquadObservation = Readonly<{
  eaId: string
  name: string | null
  clubState: GameClubState
  club: SquadTeam | null
  nationalTeams: readonly SquadTeam[]
  nationalCoverage: "KNOWN" | "UNKNOWN" | "NOT_IN_SQUAD"
  links: readonly SquadTeamLink[]
  conflicts: readonly string[]
  reference: SquadReference
  membershipHash: string
  evidenceHash: string
}>
export type RealClubObservation = Readonly<{
  eaId: string
  status: "CLUB" | "FREE_AGENT" | "RETIRED" | "UNKNOWN"
  club: Readonly<{ name: string; eaId: string | null }> | null
  sourceUrl: string | null
  observedAt: string | null
  effectiveAt: string | null
  evidenceHash: string | null
}>
const digest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex")
const validId = (id: string) => /^\d+$/.test(id)
const byId = (a: SquadTeam, b: SquadTeam) => a.eaTeamId < b.eaTeamId ? -1 : a.eaTeamId > b.eaTeamId ? 1 : 0

export function normalizeSquadObservation(input: {
  eaId: string; name: string | null; present: boolean; links: readonly SquadTeamLink[]; reference: SquadReference
}): SquadObservation {
  const { eaId, name, present, reference } = input
  if (!validId(eaId) || typeof reference.sourceId !== "string" || !reference.sourceId ||
      typeof reference.version !== "string" || !reference.version ||
      typeof reference.fullRoster !== "boolean" || typeof reference.nationalLinksComplete !== "boolean" ||
      !/^[a-f0-9]{64}$/.test(reference.contentHash) || Number.isNaN(Date.parse(reference.observedAt)) ||
      reference.effectiveAt !== null && Number.isNaN(Date.parse(reference.effectiveAt))) throw new Error("SQUAD_REFERENCE_INVALID")
  if (!present && input.links.length) throw new Error("ABSENT_PLAYER_HAS_LINKS")
  const unique = new Map<string, SquadTeamLink>()
  for (const link of input.links) {
    if (!validId(link.eaTeamId) || !link.name.trim() ||
        !["CLUB", "NATIONAL", "SPECIAL", "UNKNOWN"].includes(link.role) ||
        link.eaTeamId === "111592" && link.role !== "SPECIAL") throw new Error("TEAM_LINK_INVALID")
    const prior = unique.get(link.eaTeamId)
    if (prior && canonicalJson(prior) !== canonicalJson(link)) throw new Error("TEAM_ROLE_CONFLICT")
    unique.set(link.eaTeamId, { ...link })
  }
  const links = [...unique.values()].sort(byId)
  const clubs = links.filter(t => t.role === "CLUB")
  const nationalTeams = links.filter(t => t.role === "NATIONAL").map(({ eaTeamId, name }) => ({ eaTeamId, name }))
  const explicitFreeAgent = links.some(t => t.role === "SPECIAL" && t.eaTeamId === "111592")
  const conflicts: string[] = []
  if (clubs.length > 1) conflicts.push("MULTIPLE_REGULAR_CLUBS")
  if (clubs.length && explicitFreeAgent) conflicts.push("CLUB_AND_FREE_AGENT_IN_SAME_SOURCE")
  if (nationalTeams.length > 1) conflicts.push("MULTIPLE_NATIONAL_TEAMS")
  if (links.some(t => t.role === "UNKNOWN")) conflicts.push("UNCLASSIFIED_TEAM_LINK")
  const clubState: GameClubState = !present ? "NOT_IN_SQUAD" : clubs.length > 1 || clubs.length && explicitFreeAgent ? "UNKNOWN"
    : clubs.length === 1 ? "CLUB" : explicitFreeAgent ? "FREE_AGENT" : "UNKNOWN"
  const club = clubState === "CLUB" ? { eaTeamId: clubs[0].eaTeamId, name: clubs[0].name } : null
  const nationalCoverage: SquadObservation["nationalCoverage"] = !present ? "NOT_IN_SQUAD" : reference.nationalLinksComplete && !links.some(t => t.role === "UNKNOWN") ? "KNOWN" : "UNKNOWN"
  const membership = { eaId, clubState, club, nationalTeams, nationalCoverage, links, conflicts }
  return { ...membership, name, reference: { ...reference }, membershipHash: digest(membership), evidenceHash: digest({ ...membership, reference }) }
}

/** Preserve existing NG_FA payloads/hashes. This adapter prepares new evidence, never updates it. */
export function prepareCompatibleGameFields(observation: SquadObservation) {
  return {
    status: observation.clubState === "FREE_AGENT" ? "NG_FA" as const : observation.clubState === "NOT_IN_SQUAD" ? "UNKNOWN" as const : observation.clubState,
    club: observation.club ? { eaId: observation.club.eaTeamId, name: observation.club.name } : null,
    nativeTeamIds: observation.links.map(t => t.eaTeamId),
    nativeClubTeamIds: observation.links.filter(t => t.role === "CLUB").map(t => t.eaTeamId),
    normalizedClubState: observation.clubState,
    squadPresence: observation.clubState === "NOT_IN_SQUAD" ? "ABSENT" as const : "PRESENT" as const,
    nationalTeams: observation.nationalTeams,
    nationalCoverage: observation.nationalCoverage,
  }
}

/** No legacy club or nationality input: those cannot supply a missing game membership. */
export function projectSquadPlayer(observation: SquadObservation, real: RealClubObservation | null = null) {
  if (real && real.eaId !== observation.eaId) throw new Error("REAL_CONTEXT_IDENTITY_MISMATCH")
  return {
    eaId: observation.eaId,
    name: observation.name,
    gameClubState: observation.clubState,
    gameClub: observation.club,
    gameClubLabel: observation.club?.name ?? ({ FREE_AGENT: "Agente livre", UNKNOWN: "Clube no jogo desconhecido", NOT_IN_SQUAD: "Não encontrado neste squad", CLUB: "Clube no jogo desconhecido" }[observation.clubState]),
    nationalTeams: observation.nationalTeams,
    nationalCoverage: observation.nationalCoverage,
    real,
    reference: observation.reference,
    conflicts: observation.conflicts,
  }
}
export type SquadReadFilter = {
  search?: string; gameClubEaId?: string; gameClubState?: GameClubState; nationalTeamEaId?: string; realClubEaId?: string
}
export function createSquadReadIndex(observations: readonly SquadObservation[], realByEaId: ReadonlyMap<string, RealClubObservation> = new Map()) {
  const byEaId = new Map<string, ReturnType<typeof projectSquadPlayer>>()
  const reference = observations[0]?.reference
  for (const observation of observations) {
    if (byEaId.has(observation.eaId)) throw new Error("DUPLICATE_PLAYER_EA_ID")
    if (canonicalJson(reference) !== canonicalJson(observation.reference)) throw new Error("MIXED_SQUAD_READ_INDEX")
    byEaId.set(observation.eaId, projectSquadPlayer(observation, realByEaId.get(observation.eaId) ?? null))
  }
  const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const select = (filter: SquadReadFilter = {}) => {
    const search = norm(filter.search?.trim() ?? "")
    return [...byEaId.values()].filter(row =>
      (!search || norm(`${row.name ?? ""} ${row.eaId}`).includes(search)) &&
      (!filter.gameClubEaId || row.gameClubState === "CLUB" && row.gameClub?.eaTeamId === filter.gameClubEaId) &&
      (!filter.gameClubState || row.gameClubState === filter.gameClubState) &&
      (!filter.nationalTeamEaId || row.nationalTeams.some(t => t.eaTeamId === filter.nationalTeamEaId)) &&
      (!filter.realClubEaId || row.real?.status === "CLUB" && row.real.club?.eaId === filter.realClubEaId))
  }
  return {
    byEaId,
    search: select,
    cards: select,
    nationalRoster: (eaTeamId: string) => select({ nationalTeamEaId: eaTeamId }),
    transferMarket: (filter: Omit<SquadReadFilter, "gameClubState"> = {}) => select({ ...filter, gameClubState: "FREE_AGENT" }),
  }
}

export type SquadSnapshot = { reference: SquadReference; observations: readonly SquadObservation[] }
function indexSnapshot(snapshot: SquadSnapshot) {
  const index = new Map<string, SquadObservation>()
  for (const observation of snapshot.observations) {
    if (index.has(observation.eaId)) throw new Error("DUPLICATE_PLAYER_EA_ID")
    if (canonicalJson(observation.reference) !== canonicalJson(snapshot.reference)) throw new Error("OBSERVATION_VERSION_MISMATCH")
    const normalized = normalizeSquadObservation({ eaId: observation.eaId, name: observation.name,
      present: observation.clubState !== "NOT_IN_SQUAD", links: observation.links, reference: snapshot.reference })
    if (normalized.evidenceHash !== observation.evidenceHash || normalized.membershipHash !== observation.membershipHash ||
        canonicalJson(normalized) !== canonicalJson(observation)) throw new Error("OBSERVATION_HASH_MISMATCH")
    index.set(observation.eaId, observation)
  }
  return index
}

/** Incremental, deterministic dry-run. A new file never silently becomes the canonical roster. */
export function prepareIncrementalSquadSync(input: {
  previous: SquadSnapshot; next: SquadSnapshot; expectedPreviousSourceHash: string
}) {
  if (input.previous.reference.contentHash !== input.expectedPreviousSourceHash) throw new Error("PREVIOUS_SOURCE_CHANGED")
  const before = indexSnapshot(input.previous), after = indexSnapshot(input.next)
  const lineageChanged = input.previous.reference.sourceId !== input.next.reference.sourceId
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort()
  const changes = ids.flatMap(eaId => {
    const previous = before.get(eaId), next = after.get(eaId)
    if (previous?.membershipHash === next?.membershipHash && next) return []
    const reasons: string[] = []
    if (!next) reasons.push("MISSING_FROM_NEXT_INPUT_KEEP_PREVIOUS")
    if (next?.clubState === "NOT_IN_SQUAD") reasons.push("NOT_IN_SQUAD_REQUIRES_REVIEW_KEEP_PREVIOUS")
    if (next?.clubState === "UNKNOWN") reasons.push("UNKNOWN_CLUB_REQUIRES_REVIEW_KEEP_PREVIOUS")
    if (next?.conflicts.length) reasons.push(...next.conflicts)
    if (lineageChanged) reasons.push("SOURCE_LINEAGE_CHANGED")
    if (!input.next.reference.fullRoster) reasons.push("PARTIAL_ROSTER_REQUIRES_REVIEW")
    if (previous?.nationalCoverage === "KNOWN" && next?.nationalCoverage !== "KNOWN") reasons.push("NATIONAL_COVERAGE_REGRESSION")
    return [{
      eaId, state: reasons.length ? "BLOCKED" as const : "PREPARED" as const, reasons,
      expectedPreviousEvidenceHash: previous?.evidenceHash ?? null,
      proposedEvidenceHash: next?.evidenceHash ?? null,
      proposedGame: next ? prepareCompatibleGameFields(next) : null,
      rollback: { expectedAppliedEvidenceHash: next?.evidenceHash ?? null,
        restorePreviousEvidenceHash: previous?.evidenceHash ?? null, compareAndSwapRequired: true as const },
    }]
  })
  const content = { previous: input.previous.reference, next: input.next.reference, changes }
  if (input.previous.reference.contentHash === input.next.reference.contentHash && changes.length)
    throw new Error("SOURCE_HASH_REUSED_WITH_DIFFERENT_MEMBERSHIP")
  const batchHash = digest(content)
  return { ...content, batchHash, idempotencyKey: `ea-squad-sync:${batchHash}`, mode: "PREPARE_ONLY" as const,
    executionAuthorized: false as const, canonicalReferenceChosen: false as const,
    ready: changes.filter(c => c.state === "PREPARED").length, blocked: changes.filter(c => c.state === "BLOCKED").length,
    unchanged: ids.length - changes.length, checkpoint: { sourceHash: input.next.reference.contentHash, batchHash, nextChangeIndex: 0 },
    forbiddenWriteTargets: ["Player.clubId", "REAL_CONTEXT", "ECONOMICS", "CONTRACTS", "MARKET_VALUE", "POTENTIAL", "MANUAL_EDITS"] }
}
