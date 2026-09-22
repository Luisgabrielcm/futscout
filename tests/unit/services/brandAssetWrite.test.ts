import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { BRAND_ASSET_PILOT_ALLOWLIST, persistBrandAssetAtomically, prepareBrandAssetPilotDryRun,
  type BrandAssetAudit, type BrandAssetCandidate, type BrandAssetRow, type BrandAssetWriteStore,
  type BrandIdentityRow } from "../../../services/brandAssetWrite"

const now = new Date("2026-09-17T15:00:00.000Z")
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

function candidate(index = 0, changes: Partial<BrandAssetCandidate> = {}): BrandAssetCandidate {
  const identity = BRAND_ASSET_PILOT_ALLOWLIST[index]
  const folder = identity.entityType === "CLUB" ? "teams" : "leagues"
  return { ...identity, identityStatus: "VERIFIED", sourceUrl: `https://media.api-sports.io/football/${folder}/${identity.providerEntityId}.png`,
    storageUrl: null, contentHash: "a".repeat(64), fetchedAt: "2026-09-17T14:00:00.000Z",
    rightsStatus: "APPROVED", displayPolicy: "DISPLAY_ALLOWED", operationalDecision: "NOT_AUTHORIZED", operationalAuthorizedAt: null,
    operationalDecisionRef: null, operatorRiskAccepted: false, riskAcceptedAt: null, riskAcceptedBy: null,
    riskReason: null, sourceTermsUrl: null, revocable: true, deliveryStatus: "VALIDATED", ...changes }
}

function currentPilot() {
  return BRAND_ASSET_PILOT_ALLOWLIST.map((_identity, index) => candidate(index, {
    identityStatus: "VERIFIED",
    rightsStatus: "REVIEW_REQUIRED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE",
    operationalAuthorizedAt: "2026-09-17T14:30:00.000Z", operationalDecisionRef: "owner-decision:brand-assets-phase-j",
    operatorRiskAccepted: true, riskAcceptedAt: "2026-09-17T14:30:00.000Z", riskAcceptedBy: "FutScout owner",
    riskReason: "Controlled remote beta pilot; trademark rights remain unverified.",
    sourceTermsUrl: "https://www.api-football.com/terms", revocable: true,
    deliveryStatus: "UNVERIFIED", contentHash: null,
  }))
}

type State = { identities: BrandIdentityRow[]; assets: BrandAssetRow[] }
function fakeStore(options: { failAsset?: boolean; unknownCommit?: boolean; mutateProtectedAfterCommit?: boolean } = {}) {
  let state: State = { identities: [], assets: [] }, transactions = 0, audits = 0
  const retries = 0
  const protectedState = { Club: { count: "582", hash: "club-safe" }, League: { count: "45", hash: "league-safe" } }
  const audit = (): BrandAssetAudit => {
    audits++
    const changed = options.mutateProtectedAfterCommit && audits > 1
    return { protected: { ...protectedState, ...(changed ? { Club: { count: "582", hash: "club-changed" } } : {}) },
      registry: { BrandAssetIdentity: { count: String(state.identities.length), hash: digest(state.identities) },
        BrandAsset: { count: String(state.assets.length), hash: digest(state.assets) } } }
  }
  const store: BrandAssetWriteStore = { audit: async () => audit(), async transaction(work) {
    transactions++
    const draft = structuredClone(state)
    const result = await work({
      async readLocalEntity(entityType, entityId) {
        const identity = BRAND_ASSET_PILOT_ALLOWLIST.find(item => item.entityType === entityType && item.entityId === entityId)
        return identity ? { id: entityId, providerEntityId: entityType === "CLUB" ? identity.providerEntityId : null } : null
      },
      async findIdentityByLocal(input) {
        return draft.identities.find(row => row.entityType === input.entityType && row.entityId === input.entityId && row.provider === input.provider) ?? null
      },
      async findIdentityByProvider(input) {
        return draft.identities.find(row => row.entityType === input.entityType && row.provider === input.provider &&
          row.providerEntityId === input.providerEntityId) ?? null
      },
      async latestAsset(identityId, assetType) {
        return draft.assets.filter(row => row.identityId === identityId && row.assetType === assetType)
          .sort((a, b) => b.version - a.version)[0] ?? null
      },
      async activeAsset(identityId, assetType) {
        return draft.assets.find(row => row.identityId === identityId && row.assetType === assetType && row.status === "ACTIVE") ?? null
      },
      async createIdentity(input) {
        const row: BrandIdentityRow = { id: `identity-${draft.identities.length + 1}`, entityType: input.entityType,
          entityId: input.entityId, provider: input.provider, providerEntityId: input.providerEntityId, status: "VERIFIED", version: 1 }
        draft.identities.push(row); return row
      },
      async markActiveStale(id, version) {
        const row = draft.assets.find(item => item.id === id && item.version === version && item.status === "ACTIVE")
        if (!row) return 0
        draft.assets = draft.assets.map(item => item.id === id ? { ...item, status: "STALE" } : item)
        return 1
      },
      async createAsset(identityId, version, input) {
        if (options.failAsset) throw new Error("FAKE_SECOND_INSERT_FAILURE")
        const row: BrandAssetRow = { id: `asset-${draft.assets.length + 1}`, identityId, assetType: input.assetType,
          sourceUrl: input.sourceUrl, storageUrl: input.storageUrl, contentHash: input.contentHash, version,
          fetchedAt: input.fetchedAt, rightsStatus: input.rightsStatus, displayPolicy: input.displayPolicy,
          operationalDecision: input.operationalDecision,
          operationalAuthorizedAt: input.operationalAuthorizedAt, operationalDecisionRef: input.operationalDecisionRef,
          operatorRiskAccepted: input.operatorRiskAccepted, riskAcceptedAt: input.riskAcceptedAt,
          riskAcceptedBy: input.riskAcceptedBy, riskReason: input.riskReason, sourceTermsUrl: input.sourceTermsUrl,
          revocable: input.revocable,
          status: "ACTIVE" }
        draft.assets.push(row); return row
      },
    })
    state = draft
    if (options.unknownCommit) throw Object.assign(new Error("hidden transport detail"), { code: "ECONNRESET" })
    return result
  } }
  return { store, state: () => structuredClone(state), set: (value: State) => { state = structuredClone(value) },
    transactions: () => transactions, retries: () => retries }
}

const emptyExpected = { identity: null, latestAsset: null, activeAssetId: null }

test("closed six-candidate dry-run records owner authorization but stays blocked by unverified delivery", () => {
  const result = prepareBrandAssetPilotDryRun(currentPilot(), now)
  assert.equal(result.length, 6)
  assert.deepEqual(result.map(row => row.identity), [...BRAND_ASSET_PILOT_ALLOWLIST])
  assert.ok(result.every(row => !row.writable && row.action === "NOT_WRITABLE" && row.rightsStatus === "REVIEW_REQUIRED" &&
    row.displayPolicy === "DISPLAY_ALLOWED" &&
    row.riskAccepted && row.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" &&
    row.publicationDecision === "ALLOWED_AT_OPERATOR_RISK" && row.renderDecision === "FALLBACK" &&
    row.rollbackDecision === "REVOKE_ASSET" && row.deliveryStatus === "UNVERIFIED" &&
    !row.blockers.includes("RIGHTS_REVIEW_REQUIRED") && row.blockers.includes("DELIVERY_NOT_VALIDATED")))
})

test("allow-list rejects a seventh candidate, replacement, reordering and Club/League type mismatch", () => {
  const six = currentPilot()
  assert.throws(() => prepareBrandAssetPilotDryRun([...six, six[0]], now), /ALLOWLIST/)
  assert.throws(() => prepareBrandAssetPilotDryRun([six[1], six[0], ...six.slice(2)], now), /ALLOWLIST/)
  assert.throws(() => prepareBrandAssetPilotDryRun([{ ...six[0], providerEntityId: "999" }, ...six.slice(1)], now), /ALLOWLIST/)
  assert.throws(() => prepareBrandAssetPilotDryRun([{ ...six[0], assetType: "LOGO" }, ...six.slice(1)] as BrandAssetCandidate[], now), /ALLOWLIST/)
})

test("pilot source URL is bound to the exact API-Football provider identity", async () => {
  const changed = candidate(0, { sourceUrl: "https://media.api-sports.io/football/teams/999.png" })
  assert.throws(() => prepareBrandAssetPilotDryRun([changed, ...currentPilot().slice(1)], now), /CANDIDATE_INVALID/)
  const f = fakeStore(), result = await persistBrandAssetAtomically(f.store,
    { candidate: changed, expected: emptyExpected }, () => now)
  assert.equal(result.status, "AUTHORIZATION_MISMATCH")
  assert.equal(result.reason, "CANDIDATE_INVALID")
  assert.equal(f.transactions(), 0)
})

test("future approved, delivered candidate creates identity and ACTIVE asset atomically", async () => {
  const f = fakeStore(), input = candidate()
  const result = await persistBrandAssetAtomically(f.store, { candidate: input, expected: emptyExpected }, () => now)
  assert.equal(result.status, "CREATED"); assert.equal(result.transactionState, "COMMIT_CONFIRMED"); assert.equal(result.retries, 0)
  assert.equal(f.state().identities.length, 1); assert.equal(f.state().assets.length, 1)
  assert.equal(f.state().assets[0].status, "ACTIVE"); assert.equal(f.state().assets[0].version, 1)
})

test("exact repetition is an idempotent no-op even with the original empty-state authorization", async () => {
  const f = fakeStore(), request = { candidate: candidate(), expected: emptyExpected }
  assert.equal((await persistBrandAssetAtomically(f.store, request, () => now)).status, "CREATED")
  const second = await persistBrandAssetAtomically(f.store, request, () => now)
  assert.equal(second.status, "NO_OP"); assert.equal(f.transactions(), 2)
  assert.equal(f.state().identities.length, 1); assert.equal(f.state().assets.length, 1)
})

test("coherent existing identity is reused and does not create a duplicate", async () => {
  const f = fakeStore(), input = candidate()
  const identity: BrandIdentityRow = { id: "identity-existing", entityType: input.entityType, entityId: input.entityId,
    provider: input.provider, providerEntityId: input.providerEntityId, status: "VERIFIED", version: 1 }
  f.set({ identities: [identity], assets: [] })
  const result = await persistBrandAssetAtomically(f.store, { candidate: input,
    expected: { identity, latestAsset: null, activeAssetId: null } }, () => now)
  assert.equal(result.status, "CREATED"); assert.equal(f.state().identities.length, 1); assert.equal(f.state().assets.length, 1)
})

test("provider occupied by another local entity is a conflict with zero mutation", async () => {
  const f = fakeStore(), input = candidate()
  f.set({ identities: [{ id: "occupied", entityType: "CLUB", entityId: "another-club", provider: "api-football",
    providerEntityId: input.providerEntityId, status: "VERIFIED", version: 1 }], assets: [] })
  const before = f.state(), result = await persistBrandAssetAtomically(f.store, { candidate: input, expected: emptyExpected }, () => now)
  assert.equal(result.status, "IDENTITY_CONFLICT"); assert.deepEqual(f.state(), before); assert.equal(result.retries, 0)
})

function existingState(overrides: Partial<BrandAssetRow> = {}) {
  const input = candidate(), identity: BrandIdentityRow = { id: "identity-existing", entityType: input.entityType,
    entityId: input.entityId, provider: input.provider, providerEntityId: input.providerEntityId, status: "VERIFIED", version: 1 }
  const asset: BrandAssetRow = { id: "asset-existing", identityId: identity.id, assetType: input.assetType,
    sourceUrl: "https://media.api-sports.io/football/teams/541-old.png", storageUrl: null, contentHash: "b".repeat(64),
    version: 1, fetchedAt: "2026-09-16T14:00:00.000Z", rightsStatus: "APPROVED", displayPolicy: "DISPLAY_ALLOWED",
    operationalDecision: "NOT_AUTHORIZED", operationalAuthorizedAt: null, operationalDecisionRef: null,
    operatorRiskAccepted: false, riskAcceptedAt: null, riskAcceptedBy: null, riskReason: null, sourceTermsUrl: null,
    revocable: true,
    status: "ACTIVE", ...overrides }
  return { input, identity, asset }
}

for (const scenario of ["active", "version", "rights"] as const) test(`${scenario} concurrent drift is rejected by CAS`, async () => {
  const f = fakeStore(), base = existingState(), expectedAsset = structuredClone(base.asset)
  const actual = scenario === "active" ? { ...base.asset, id: "asset-concurrent" } :
    scenario === "version" ? { ...base.asset, version: 2 } : { ...base.asset, rightsStatus: "CACHE_ALLOWED" as const }
  f.set({ identities: [base.identity], assets: [actual] })
  const result = await persistBrandAssetAtomically(f.store, { candidate: base.input, expected: {
    identity: base.identity, latestAsset: expectedAsset, activeAssetId: expectedAsset.id } }, () => now)
  assert.equal(result.status, "CONCURRENT_MODIFICATION"); assert.deepEqual(f.state().assets, [actual]); assert.equal(result.retries, 0)
})

test("a new version stales the previous ACTIVE and leaves exactly one ACTIVE", async () => {
  const f = fakeStore(), base = existingState()
  f.set({ identities: [base.identity], assets: [base.asset] })
  const result = await persistBrandAssetAtomically(f.store, { candidate: base.input, expected: {
    identity: base.identity, latestAsset: base.asset, activeAssetId: base.asset.id } }, () => now)
  assert.equal(result.status, "CREATED")
  assert.deepEqual(f.state().assets.map(row => [row.version, row.status]), [[1, "STALE"], [2, "ACTIVE"]])
})

for (const changes of [
  { rightsStatus: "REVIEW_REQUIRED" as const }, { rightsStatus: "BLOCKED" as const },
  { deliveryStatus: "UNVERIFIED" as const, contentHash: null }, { deliveryStatus: "FAILED" as const, contentHash: null },
]) test(`rights/delivery gate blocks ${JSON.stringify(changes)} before transaction`, async () => {
  const f = fakeStore(), result = await persistBrandAssetAtomically(f.store,
    { candidate: candidate(0, changes), expected: emptyExpected }, () => now)
  assert.equal(result.status, "NOT_WRITABLE"); assert.equal(result.transactionState, "NOT_STARTED")
  assert.equal(f.transactions(), 0); assert.deepEqual(f.state(), { identities: [], assets: [] })
})

test("delivered REVIEW_REQUIRED asset becomes writable only with explicit owner remote authorization", async () => {
  const input = candidate(0, { rightsStatus: "REVIEW_REQUIRED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE",
    operationalAuthorizedAt: "2026-09-17T14:30:00.000Z", operationalDecisionRef: "owner-decision:brand-assets-phase-j",
    operatorRiskAccepted: true, riskAcceptedAt: "2026-09-17T14:30:00.000Z", riskAcceptedBy: "FutScout owner",
    riskReason: "Controlled remote beta pilot; trademark rights remain unverified.",
    sourceTermsUrl: "https://www.api-football.com/terms", revocable: true })
  const f = fakeStore(), result = await persistBrandAssetAtomically(f.store,
    { candidate: input, expected: emptyExpected }, () => now)
  assert.equal(result.status, "CREATED")
  assert.equal(f.state().assets[0].rightsStatus, "REVIEW_REQUIRED")
  assert.equal(f.state().assets[0].operationalDecision, "OWNER_AUTHORIZED_REMOTE_USE")
  assert.equal(f.state().assets[0].storageUrl, null)
})

test("incomplete or non-revocable risk acceptance never becomes writable", async () => {
  const accepted = { rightsStatus: "REVIEW_REQUIRED" as const, operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE" as const,
    operationalAuthorizedAt: "2026-09-17T14:30:00.000Z", operationalDecisionRef: "owner-decision:brand-assets-phase-j",
    operatorRiskAccepted: true, riskAcceptedAt: "2026-09-17T14:30:00.000Z", riskAcceptedBy: "FutScout owner",
    riskReason: "Controlled remote beta pilot; trademark rights remain unverified.",
    sourceTermsUrl: "https://www.api-football.com/terms", revocable: true }
  for (const incomplete of [{ ...accepted, riskAcceptedBy: null }, { ...accepted, riskReason: "" },
    { ...accepted, sourceTermsUrl: "http://insecure.test/terms" }, { ...accepted, revocable: false }]) {
    const f = fakeStore(), result = await persistBrandAssetAtomically(f.store,
      { candidate: candidate(0, incomplete), expected: emptyExpected }, () => now)
    assert.equal(result.status, "NOT_WRITABLE")
    assert.match(result.reason, /OPERATIONAL_AUTHORIZATION_INVALID/)
    assert.equal(f.transactions(), 0)
  }
})

test("BLOCKED remains absolute even with owner authorization", async () => {
  const f = fakeStore(), result = await persistBrandAssetAtomically(f.store, { candidate: candidate(0, {
    rightsStatus: "BLOCKED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE",
    operationalAuthorizedAt: "2026-09-17T14:30:00.000Z", operationalDecisionRef: "owner-decision:brand-assets-phase-j",
    operatorRiskAccepted: true, riskAcceptedAt: "2026-09-17T14:30:00.000Z", riskAcceptedBy: "FutScout owner",
    riskReason: "Controlled remote beta pilot; trademark rights remain unverified.",
    sourceTermsUrl: "https://www.api-football.com/terms", revocable: true,
  }), expected: emptyExpected }, () => now)
  assert.equal(result.status, "NOT_WRITABLE")
  assert.match(result.reason, /RIGHTS_BLOCKED/)
  assert.equal(f.transactions(), 0)
})

test("failure on the second insert rolls the identity back and never retries", async () => {
  const f = fakeStore({ failAsset: true })
  const result = await persistBrandAssetAtomically(f.store, { candidate: candidate(), expected: emptyExpected }, () => now)
  assert.equal(result.status, "ROLLED_BACK"); assert.equal(result.transactionState, "ROLLED_BACK"); assert.equal(result.retries, 0)
  assert.deepEqual(f.state(), { identities: [], assets: [] }); assert.equal(f.transactions(), 1); assert.equal(f.retries(), 0)
})

test("lost commit acknowledgement is indeterminate, never retried or claimed rolled back", async () => {
  const f = fakeStore({ unknownCommit: true })
  const result = await persistBrandAssetAtomically(f.store, { candidate: candidate(), expected: emptyExpected }, () => now)
  assert.equal(result.status, "INDETERMINATE_COMMIT"); assert.equal(result.transactionState, "COMMIT_INDETERMINATE")
  assert.equal(result.retries, 0); assert.equal(f.transactions(), 1); assert.equal(f.state().assets.length, 1)
})

test("AFTER audit protects Club and League and reports a confirmed registry commit separately", async () => {
  const f = fakeStore({ mutateProtectedAfterCommit: true })
  const result = await persistBrandAssetAtomically(f.store, { candidate: candidate(), expected: emptyExpected }, () => now)
  assert.equal(result.status, "AUDIT_MISMATCH"); assert.equal(result.transactionState, "COMMIT_CONFIRMED")
  assert.equal(f.state().identities.length, 1); assert.equal(f.state().assets.length, 1)
})

test("Prisma adapter is inert, Serializable and exposes no Club/League mutation or network path", () => {
  const source = readFileSync("services/prismaBrandAssetWriteStore.ts", "utf8")
  assert.match(source, /isolationLevel:\s*"Serializable"/)
  assert.doesNotMatch(source, /\.(?:club|league)\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/)
  assert.doesNotMatch(source, /\b(?:fetch|API_FOOTBALL_KEY|process\.env|setTimeout|retry)\b/)
  assert.doesNotMatch(readFileSync("services/brandAssetWrite.ts", "utf8"), /\b(?:fetch|process\.env|PrismaClient)\b/)
})
