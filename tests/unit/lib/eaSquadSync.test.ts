import test from "node:test"
import assert from "node:assert/strict"
import { normalizeSquadObservation, prepareCompatibleGameFields, projectSquadPlayer, createSquadReadIndex,
  prepareIncrementalSquadSync, type SquadReference, type SquadTeamLink, type RealClubObservation } from "../../../lib/eaSquadSync"

const source: SquadReference = { sourceId: "synthetic-native-fixture", version: "v1", contentHash: "a".repeat(64),
  observedAt: "2026-11-16T00:00:00Z", effectiveAt: null, fullRoster: true, nationalLinksComplete: true }
const nextSource: SquadReference = { ...source, version: "v2", contentHash: "b".repeat(64) }
const brazil: SquadTeamLink = { eaTeamId: "1370", name: "Brazil", role: "NATIONAL" }
const free: SquadTeamLink = { eaTeamId: "111592", name: "NG - FA", role: "SPECIAL" }
const city: SquadTeamLink = { eaTeamId: "10", name: "Manchester City", role: "CLUB" }
const barcelona: SquadTeamLink = { eaTeamId: "241", name: "FC Barcelona", role: "CLUB" }
const observation = (links: SquadTeamLink[], reference = source, eaId = "233927", present = true) =>
  normalizeSquadObservation({ eaId, name: "Synthetic fixture", present, links, reference })
// Explicitly synthetic real context; this does not establish an actual Paqueta transfer.
const real: RealClubObservation = { eaId: "233927", status: "CLUB", club: { name: "Flamengo", eaId: "1043" },
  sourceUrl: "https://example.invalid/synthetic-fixture", observedAt: source.observedAt, effectiveAt: null, evidenceHash: "c".repeat(64) }

test("explicit FREE_AGENT and national membership coexist independently of real employment", () => {
  const row = observation([brazil, free])
  assert.equal(row.clubState, "FREE_AGENT"); assert.equal(row.club, null)
  assert.deepEqual(row.nationalTeams, [{ eaTeamId: "1370", name: "Brazil" }])
  const projection = projectSquadPlayer(row, real)
  assert.equal(projection.gameClubLabel, "Agente livre"); assert.equal(projection.real, real)
  assert.equal(projection.real.club?.name, "Flamengo")
})
test("national link alone means UNKNOWN club, not a club or a free agent", () => {
  const row = observation([brazil])
  assert.equal(row.clubState, "UNKNOWN"); assert.equal(row.club, null)
  assert.equal(row.nationalTeams.length, 1)
  assert.equal(createSquadReadIndex([row]).transferMarket().length, 0)
})
test("NOT_IN_SQUAD is distinct from UNKNOWN and explicit FREE_AGENT", () => {
  assert.equal(observation([], source, "1", false).clubState, "NOT_IN_SQUAD")
  assert.equal(observation([]).clubState, "UNKNOWN")
  assert.equal(observation([free]).clubState, "FREE_AGENT")
  assert.throws(() => observation([brazil], source, "1", false), /ABSENT_PLAYER_HAS_LINKS/)
})
test("unproven or malformed source coverage is rejected at ingestion", () => {
  assert.throws(() => observation([], { ...source, fullRoster: "true" } as unknown as SquadReference), /SQUAD_REFERENCE_INVALID/)
  assert.throws(() => observation([], { ...source, contentHash: "invalid" }), /SQUAD_REFERENCE_INVALID/)
})
test("club and selection do not replace each other; conflicting club evidence stops selection", () => {
  assert.equal(observation([city, brazil]).club?.eaTeamId, "10")
  assert.equal(observation([city, brazil]).nationalTeams.length, 1)
  assert.equal(observation([city, free, brazil]).clubState, "UNKNOWN")
  assert.equal(observation([city, barcelona]).clubState, "UNKNOWN")
  assert.throws(() => observation([{ ...free, role: "CLUB" }]), /TEAM_LINK_INVALID/)
  assert.throws(() => observation([city, { ...city, role: "NATIONAL" }]), /TEAM_ROLE_CONFLICT/)
  assert(observation([{ eaTeamId: "123", name: "Unclassified", role: "UNKNOWN" }]).conflicts.includes("UNCLASSIFIED_TEAM_LINK"))
})
test("cards, search, club filters, national roster and free-agent market share one projection", () => {
  const index = createSquadReadIndex([observation([free, brazil]), observation([city], source, "2"), observation([brazil], source, "3")], new Map([["233927", real]]))
  assert.equal(index.cards({ search: "233927" })[0].gameClubState, "FREE_AGENT")
  assert.equal(index.search({ gameClubEaId: "1043" }).length, 0)
  assert.equal(index.search({ realClubEaId: "1043" })[0].eaId, "233927")
  assert.deepEqual(index.nationalRoster("1370").map(r => r.eaId), ["233927", "3"])
  assert.deepEqual(index.transferMarket().map(r => r.eaId), ["233927"])
  assert.equal(index.search({ gameClubEaId: "10" })[0].eaId, "2")
})
test("EA ID identity is mandatory even for homonyms and real context cannot cross identities", () => {
  assert.throws(() => createSquadReadIndex([observation([]), observation([])]), /DUPLICATE_PLAYER_EA_ID/)
  const index = createSquadReadIndex([observation([city]), observation([barcelona], source, "2")])
  assert.equal(index.byEaId.size, 2)
  assert.throws(() => projectSquadPlayer(observation([free], source, "2"), real), /REAL_CONTEXT_IDENTITY_MISMATCH/)
  assert.throws(() => createSquadReadIndex([observation([city]), observation([city], nextSource, "2")]), /MIXED_SQUAD_READ_INDEX/)
})
test("compatible fields preserve existing NG_FA storage while retaining explicit presence and national links", () => {
  const stored = prepareCompatibleGameFields(observation([free, brazil]))
  assert.equal(stored.status, "NG_FA"); assert.equal(stored.normalizedClubState, "FREE_AGENT")
  assert.deepEqual(stored.nativeClubTeamIds, []); assert(stored.nativeTeamIds.includes("1370"))
  assert.equal(stored.nationalTeams[0].eaTeamId, "1370")
  const absent = prepareCompatibleGameFields(observation([], source, "1", false))
  assert.equal(absent.status, "UNKNOWN"); assert.equal(absent.normalizedClubState, "NOT_IN_SQUAD")
  assert.equal(absent.squadPresence, "ABSENT")
})
test("new source with identical memberships is a no-op, independent of link order", () => {
  const previous = { reference: source, observations: [observation([free, brazil])] }
  const next = { reference: nextSource, observations: [observation([brazil, free], nextSource)] }
  const plan = prepareIncrementalSquadSync({ previous, next, expectedPreviousSourceHash: source.contentHash })
  assert.equal(plan.unchanged, 1); assert.equal(plan.changes.length, 0)
})
test("incremental changes have deterministic idempotency, checkpoint and CAS rollback", () => {
  const input = { previous: { reference: source, observations: [observation([city, brazil])] },
    next: { reference: nextSource, observations: [observation([free, brazil], nextSource)] }, expectedPreviousSourceHash: source.contentHash }
  const plan = prepareIncrementalSquadSync(input)
  assert.deepEqual(plan, prepareIncrementalSquadSync(input)); assert.equal(plan.ready, 1)
  assert.equal(plan.executionAuthorized, false); assert.equal(plan.mode, "PREPARE_ONLY")
  assert.equal(plan.changes[0].proposedGame?.nationalTeams[0].eaTeamId, "1370")
  assert.equal(plan.changes[0].rollback.compareAndSwapRequired, true)
  assert(plan.forbiddenWriteTargets.includes("Player.clubId")); assert.equal(plan.checkpoint.batchHash, plan.batchHash)
})
test("absence, unknown club, partial source and coverage regression never erase prior knowledge", () => {
  const previous = { reference: source, observations: [observation([city, brazil])] }
  for (const next of [
    { reference: nextSource, observations: [] },
    { reference: nextSource, observations: [observation([], nextSource, "233927", false)] },
    { reference: nextSource, observations: [observation([brazil], nextSource)] },
  ]) {
    const plan = prepareIncrementalSquadSync({ previous, next, expectedPreviousSourceHash: source.contentHash })
    assert.equal(plan.blocked, 1); assert.equal(plan.ready, 0)
  }
  const partial = { ...nextSource, fullRoster: false, nationalLinksComplete: false }
  const plan = prepareIncrementalSquadSync({ previous, next: { reference: partial, observations: [observation([free], partial)] }, expectedPreviousSourceHash: source.contentHash })
  assert(plan.changes[0].reasons.includes("PARTIAL_ROSTER_REQUIRES_REVIEW"))
  assert(plan.changes[0].reasons.includes("NATIONAL_COVERAGE_REGRESSION"))
})
test("source conflicts and changed lineage remain review-only", () => {
  const previous = { reference: source, observations: [observation([city, brazil])] }
  for (const reference of [nextSource, { ...nextSource, sourceId: "other-provider" }]) {
    const plan = prepareIncrementalSquadSync({ previous, next: { reference, observations: [observation([city, free, brazil], reference)] }, expectedPreviousSourceHash: source.contentHash })
    assert.equal(plan.blocked, 1)
    assert(plan.changes[0].reasons.includes("CLUB_AND_FREE_AGENT_IN_SAME_SOURCE"))
  }
})
test("changed baseline and tampered evidence fail closed", () => {
  const previous = { reference: source, observations: [observation([city])] }
  const next = { reference: nextSource, observations: [observation([free], nextSource)] }
  assert.throws(() => prepareIncrementalSquadSync({ previous, next, expectedPreviousSourceHash: "f".repeat(64) }), /PREVIOUS_SOURCE_CHANGED/)
  assert.throws(() => prepareIncrementalSquadSync({ previous, next: { ...next, observations: [{ ...next.observations[0], evidenceHash: "f".repeat(64) }] }, expectedPreviousSourceHash: source.contentHash }), /OBSERVATION_HASH_MISMATCH/)
  assert.throws(() => prepareIncrementalSquadSync({ previous, next: { reference: source, observations: [observation([free])] }, expectedPreviousSourceHash: source.contentHash }), /SOURCE_HASH_REUSED_WITH_DIFFERENT_MEMBERSHIP/)
})
test("projection cannot overwrite economics, manual edits or legacy clubId", () => {
  const player = Object.freeze({ externalId: "233927", clubId: "legacy", salary: 123, contract: "existing", potential: 82, marketValue: 456, manualEdit: true })
  const before = JSON.stringify(player), row = projectSquadPlayer(observation([free, brazil]), real)
  assert.equal(JSON.stringify(player), before)
  for (const key of ["clubId", "salary", "contract", "potential", "marketValue", "manualEdit"]) assert(!(key in row))
})
