import test from "node:test"
import assert from "node:assert/strict"
import { jointFixture, freeAgentFixture, city, benfica, fixtureDate, jointEnvironment } from "../../fixtures/jointTransfer"
import { jointHash, jointReadManifest, jointTransferViews, prepareJointContextPayload, validateJointTransferPayload } from "../../../lib/jointTransferContexts"
import { jointCatalogFilter } from "../../../lib/jointTransferCatalog"
import { potentialPageSql } from "../../../lib/futscoutPotential/catalog"
import { parsePlayerCatalogParams, playerCatalogQuery } from "../../../lib/playerCatalogParams"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { commitJointTransfers, prepareJointTransferCommit, rollbackJointTransfers, type JointCommitItem } from "../../../services/jointTransferPersistence"
import { preservedGameHash } from "../../../lib/realOnlyTransfers"
import { realOnlyTransferDecision } from "../../../lib/transferReadScope"

test("Echeverri: City in GAME, Benfica on loan in REAL; source observations and main contracts remain independent", () => {
  const payload = jointFixture(), before = structuredClone(payload)
  const views = jointTransferViews(payload, "2026-11-16")
  assert.equal(views.game?.clubLabel, "Manchester City"); assert.equal(views.game?.loanBadge, null)
  assert.equal(views.game?.evidence?.snapshot?.effectiveAt, null); assert.equal(views.game?.evidence?.url, payload.game.snapshot.sourceUrl)
  assert.equal(views.real?.clubLabel, "Benfica"); assert.equal(views.real?.parentClub?.name, "Manchester City")
  assert.equal(views.real?.mainContractEnd, null); assert.equal(views.real?.loanDates?.endsAt, null)
  const next = prepareJointContextPayload(payload, { movements: [{ eaId: payload.eaPlayerId, context: "REAL", kind: "LOAN_START", evidenceConfirmed: true,
    sourceUrl: "https://example.invalid/loan", evidenceHash: "e".repeat(64), effectiveAt: null }] })
  assert.deepEqual(next.game, payload.game); assert.deepEqual(payload, before)
  assert.equal(next.jointTransfer.game.loan, null); assert.equal(next.jointTransfer.movements[0].kind, "LOAN_START")
})

test("invalid bindings, mixed contexts, unsupported projections and national links fail closed", () => {
  for (const mutate of [
    (p: ReturnType<typeof jointFixture>) => { p.jointTransfer.real!.parentClub = benfica },
    (p: ReturnType<typeof jointFixture>) => { p.jointTransfer.game.nationalTeams = [{ eaTeamId: "10", name: "Not a national team" }] },
    (p: ReturnType<typeof jointFixture>) => { p.jointTransfer.real!.nationalTeams = [{ eaTeamId: "1370", name: "Brasil" }] },
    (p: ReturnType<typeof jointFixture>) => { Object.assign(p.jointTransfer, { projected: true }) },
  ]) { const p = jointFixture(); mutate(p); assert.throws(() => validateJointTransferPayload(p)) }
})

test("read gates require exact IDs, payload/snapshot hashes, independent context scope and Preview READ ONLY", () => {
  const p = jointFixture(), env = jointEnvironment([p], ["REAL"])
  assert.equal(jointReadManifest({}), null); assert.equal(jointReadManifest({ ...env, CLUB_CONTEXTS_PREVIEW_READ_ONLY: "0" }), null)
  assert.equal(jointReadManifest({ ...env, JOINT_TRANSFER_READ_MANIFEST_SHA256: "0".repeat(64) }), null)
  assert.equal(jointReadManifest({ ...env, VERCEL_ENV: "production" }), null)
  assert(jointReadManifest({ ...env, VERCEL_ENV: "production", JOINT_TRANSFER_READ_PRODUCTION_ENABLED: "1" }))
  assert.deepEqual(jointReadManifest(env)?.entries[0].contexts, ["REAL"])
  const unverified = jointFixture(); unverified.jointTransfer.real!.loan = { ...unverified.jointTransfer.real!.loan!, identityConfirmed: false }
  assert.throws(() => prepareJointTransferCommit([{ payload: unverified, expectedSelection: null, expectedLegacyClubId: city.id, expectedPlayerUpdatedAt: fixtureDate }], "not-approved"), /LOAN_REVIEW_REQUIRED/)
})

function readerFixture(p = jointFixture()) {
  let queries = 0
  const row = { eaPlayerId: p.eaPlayerId, decisionReference: "synthetic-approved-decision", revision: {
    eaPlayerId: p.eaPlayerId, payload: p, contentHash: jointHash(p), rosterReferenceId: p.game.snapshot.id,
    rosterReference: { contentHash: p.game.snapshot.contentHash, metadata: p.game.snapshot },
  } }
  const db = { playerClubContextSelection: { findMany: async () => { queries++; return [row] } }, club: { findMany: async () => [city, benfica].map(c => ({ ...c, externalId: c.eaId })) } }
  const reader = loadCatalogModule<typeof import("../../../services/jointTransferRead.server")>("services/jointTransferRead.server.ts", {
    "server-only": {}, "../lib/prisma": { prisma: db }, "../lib/clubContexts": { canonicalJson: (v: unknown) => JSON.stringify(v) },
  })
  return { module: reader, db: db as unknown as Parameters<typeof reader.readJointTransferSelections>[1], row, queries: () => queries }
}

test("bulk reader performs no DB query when disabled or outside allowlist; source tampering is rejected", async () => {
  const p = jointFixture(), f = readerFixture(p)
  assert.equal((await f.module.readJointTransferSelections(undefined, f.db, {})).size, 0); assert.equal(f.queries(), 0)
  assert.equal((await f.module.readJointTransferSelections(["999999"], f.db, jointEnvironment([p]))).size, 0); assert.equal(f.queries(), 0)
  const realOnly = await f.module.readJointTransferSelections(undefined, f.db, jointEnvironment([p], ["REAL"]), "2026-11-16")
  assert.equal(realOnly.get(p.eaPlayerId)?.views.game, null); assert(realOnly.get(p.eaPlayerId)?.views.real)
  f.row.revision.contentHash = "0".repeat(64)
  await assert.rejects(f.module.readJointTransferSelections(undefined, f.db, jointEnvironment([p])), /PROVENANCE_CHANGED/)
})

test("cards/profile projection changes only presentation, preserves wage/value/potential and leaves controls legacy", () => {
  const p = jointFixture(), f = readerFixture(p), selected = { payload: p, views: jointTransferViews(p, "2026-11-16") }
  const input = { club: { name: "Legacy" }, wage: { weekly: 123 }, marketValue: 456, potential: 78, manual: "keep", contract: "keep" }
  const out = f.module.applyJointPlayerPresentation(input, selected, "REAL")
  assert.equal(out.club?.name, "Benfica"); assert.equal(input.club.name, "Legacy")
  for (const key of ["wage", "marketValue", "potential", "manual", "contract"] as const) assert.deepEqual(out[key], input[key])
  assert.equal(f.module.applyJointPlayerPresentation(input, undefined), input)
  assert.equal(f.module.applyJointPlayerPresentation(input, { ...selected, views: { ...selected.views, game: null } }, "GAME"), input)
})

test("filters and SQL economic sorting share bound IDs before LIMIT/OFFSET, and do not retain stale legacy club filters", () => {
  const p = jointFixture(), filters = jointCatalogFilter([p], { membershipContext: "REAL", parentClub: city.id, currentClub: benfica.id, search: "City", league: "liga-portugal" })
  assert.match(JSON.stringify(filters.where), /276528/)
  const query = potentialPageSql({ search: "City", league: "liga-portugal", sort: "value-desc", page: 2, pageSize: 3 }, { clubId: "stale-legacy" }, undefined, filters.sql)
  assert(!query.values.includes("stale-legacy")); assert(query.values.includes("276528"))
  assert(query.text.indexOf('"externalId"') < query.text.indexOf("LIMIT"))
  const free = jointCatalogFilter([freeAgentFixture()], { clubState: "FREE_AGENT", nationalTeam: "1370" })
  assert.match(JSON.stringify(free.where), /233927/); assert.doesNotMatch(free.sql.text, /clubId.*IS NULL/)
  const params = parsePlayerCatalogParams({ membershipContext: "REAL", currentClub: benfica.id, parentClub: city.id, clubState: "FREE_AGENT", nationalTeam: "1370" })
  assert.match(playerCatalogQuery(params), /parentClub=fixture-city/)
})

function persistenceFixture() {
  let state = { refs: new Map<string, unknown>(), revisions: new Map<string, unknown>(), selections: new Map<string, Record<string, unknown>>() }
  const protectedState = { salary: 12, marketValue: 34, potential: 85, contract: "2029", manual: "untouched", clubId: city.id }
  const match = (row: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v)
  const db = { $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
    const draft = structuredClone(state)
    const tx = { $queryRawUnsafe: async () => [], player: { findUnique: async ({ where }: { where: { externalId: string } }) => where.externalId === "999999" ? null : { clubId: protectedState.clubId, eaImportVisibility: "PUBLIC", updatedAt: new Date(fixtureDate) } },
      club: { findMany: async () => [city, benfica].map(c => ({ ...c, externalId: c.eaId })) },
      eaRosterReference: { findUnique: async ({ where }: { where: { id: string } }) => draft.refs.get(where.id) ?? null, create: async ({ data }: { data: { id: string } }) => { draft.refs.set(data.id, data); return data } },
      playerClubContextRevision: { findUnique: async ({ where }: { where: { id: string } }) => draft.revisions.get(where.id) ?? null, create: async ({ data }: { data: { id: string } }) => { draft.revisions.set(data.id, data); return data } },
      playerClubContextSelection: { findUnique: async ({ where }: { where: { eaPlayerId: string } }) => draft.selections.get(where.eaPlayerId) ?? null,
        create: async ({ data }: { data: Record<string, unknown> & { eaPlayerId: string } }) => { assert(!draft.selections.has(data.eaPlayerId)); draft.selections.set(data.eaPlayerId, data); return data },
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => { const row = draft.selections.get(String(where.eaPlayerId)); if (!row || !match(row, where)) return { count: 0 }; assert.equal(data.version, Number(row.version) + 1); draft.selections.set(String(where.eaPlayerId), { ...row, ...data }); return { count: 1 } },
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => { const row = draft.selections.get(String(where.eaPlayerId)); if (!row || !match(row, where)) return { count: 0 }; draft.selections.delete(String(where.eaPlayerId)); return { count: 1 } },
      } }
    const result = await work(tx); state = draft; return result
  } }
  const item = (id = "276528"): JointCommitItem => ({ payload: jointFixture(id), expectedSelection: null, expectedLegacyClubId: city.id, expectedPlayerUpdatedAt: fixtureDate })
  return { db: db as unknown as Parameters<typeof commitJointTransfers>[0], state: () => state, protectedState, item }
}

test("REAL-only persistence replays safely and rollback retains GAME evidence and protected player fields", async () => {
  const f = persistenceFixture(), item = f.item(), before = structuredClone(f.protectedState), gameHash = preservedGameHash(item.payload)
  item.payload.jointTransfer.real!.loan = { ...item.payload.jointTransfer.real!.loan!, evidence: { ...item.payload.jointTransfer.real!.loan!.evidence, contentHash: item.payload.real!.evidenceHash } }
  item.payload = prepareJointContextPayload(item.payload, { movements: [{ eaId: item.payload.eaPlayerId, context: "REAL", kind: "LOAN_START",
    sourceUrl: item.payload.real!.sourceUrl, evidenceHash: item.payload.real!.evidenceHash, evidenceConfirmed: true, effectiveAt: null,
    route: { fromState: "CLUB", fromClub: city, toClub: benfica } }] })
  item.expectedGameBaselineHash = gameHash
  const plan = prepareJointTransferCommit([item], realOnlyTransferDecision("f".repeat(64)))
  const receipt = await commitJointTransfers(f.db, plan, { target: "DISPOSABLE", approvedBatchHash: plan.batchHash })
  assert.deepEqual(await commitJointTransfers(f.db, plan, { target: "DISPOSABLE", approvedBatchHash: plan.batchHash }), receipt)
  assert.equal(preservedGameHash(item.payload), gameHash)
  await rollbackJointTransfers(f.db, receipt, jointHash(receipt))
  assert.equal(f.state().selections.size, 0); assert.equal(f.state().revisions.size, 1); assert.deepEqual(f.protectedState, before)
})

test("atomic persisted context revisions are idempotent; rollback removes only selection and retains evidence/economics", async () => {
  const f = persistenceFixture(), before = structuredClone(f.protectedState), plan = prepareJointTransferCommit([f.item()], "approved-batch")
  const receipt = await commitJointTransfers(f.db, plan, { target: "DISPOSABLE", approvedBatchHash: plan.batchHash })
  const again = await commitJointTransfers(f.db, plan, { target: "DISPOSABLE", approvedBatchHash: plan.batchHash })
  assert.deepEqual(receipt, again); assert.equal(f.state().revisions.size, 1); assert.equal(f.state().selections.size, 1)
  await rollbackJointTransfers(f.db, again, jointHash(again)); await rollbackJointTransfers(f.db, receipt, jointHash(receipt))
  assert.equal(f.state().selections.size, 0); assert.equal(f.state().revisions.size, 1); assert.equal(f.state().refs.size, 1)
  assert.deepEqual(f.protectedState, before)
})

test("batch conflict rolls back every earlier insertion; tampered approval and intervening edits are rejected", async () => {
  const f = persistenceFixture(), bad = prepareJointTransferCommit([f.item(), f.item("999999")], "approved-batch")
  await assert.rejects(commitJointTransfers(f.db, bad, { target: "DISPOSABLE", approvedBatchHash: bad.batchHash }), /BASELINE_CHANGED/)
  assert.equal(f.state().revisions.size, 0); assert.equal(f.state().refs.size, 0)
  const plan = prepareJointTransferCommit([f.item()], "approved-batch")
  await assert.rejects(commitJointTransfers(f.db, plan, { target: "DISPOSABLE", approvedBatchHash: "0".repeat(64) }), /NOT_AUTHORIZED/)
  const receipt = await commitJointTransfers(f.db, plan, { target: "DISPOSABLE", approvedBatchHash: plan.batchHash })
  f.state().selections.get("276528")!.version = 10
  await assert.rejects(rollbackJointTransfers(f.db, receipt, jointHash(receipt)), /INTERVENING_EDIT/)
})

test("replacing an existing selection and rolling back keeps the monotonic SQL trigger version rule", async () => {
  const f = persistenceFixture(), item = f.item()
  f.state().selections.set("276528", { eaPlayerId: "276528", revisionId: "previous", version: 4, decisionReference: "old" })
  const previousPayload = structuredClone(item.payload); previousPayload.jointTransfer.real = null
  f.state().revisions.set("previous", { payload: previousPayload, contentHash: jointHash(previousPayload) })
  item.expectedSelection = { revisionId: "previous", version: 4, decisionReference: "old" }
  const plan = prepareJointTransferCommit([item], "approved-batch"), receipt = await commitJointTransfers(f.db, plan, { target: "DISPOSABLE", approvedBatchHash: plan.batchHash })
  await rollbackJointTransfers(f.db, receipt, jointHash(receipt))
  assert.equal(f.state().selections.get("276528")!.version, 6); assert.equal(f.state().selections.get("276528")!.revisionId, "previous")
})

test("the database adapter rechecks the actual active episode and rejects an unproven loan disappearance", async () => {
  const f = persistenceFixture(), item = f.item(), first = prepareJointTransferCommit([item], "approved-batch")
  const receipt = await commitJointTransfers(f.db, first, { target: "DISPOSABLE", approvedBatchHash: first.batchHash })
  const cleared = structuredClone(item.payload); cleared.jointTransfer.real!.loan = null; cleared.jointTransfer.real!.parentClub = null
  const changed = prepareJointTransferCommit([{ ...item, payload: cleared, expectedSelection: receipt.entries[0].applied }], "attempted-clear")
  await assert.rejects(commitJointTransfers(f.db, changed, { target: "DISPOSABLE", approvedBatchHash: changed.batchHash }), /TRANSITION_REQUIRES_REVIEW/)
  assert.equal(f.state().selections.get(item.payload.eaPlayerId)!.version, 1)
})
