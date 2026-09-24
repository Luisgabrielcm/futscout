import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { BRACK_SOURCE, ISL_SOURCE } from "../../../lib/brackBrandSource"
import { BRAND_ASSET_PILOT_ALLOWLIST, persistBrandAssetAtomically, prepareBrandAssetPilotDryRun,
  type BrandAssetAudit, type BrandAssetCandidate, type BrandAssetRow, type BrandAssetWriteStore,
  type BrandIdentityRow, type BrandAssetPilotIdentity } from "../../../services/brandAssetWrite"

const now = new Date("2026-09-17T15:00:00.000Z")
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

test("the 25 newly authorized leagues match the immutable owner-reviewed manifest", () => {
  const bytes = readFileSync("docs/league-logos-25-manifest-2026-09-23.json")
  assert.equal(createHash("sha256").update(bytes).digest("hex"),
    "b86f64b18714736d2911692c7d6f74e15e258bee598b0ef1acded0854ddeb401")
  const manifest = JSON.parse(bytes.toString("utf8")) as { entries: { leagueId: string; providerId: string }[] }
  assert.equal(manifest.entries.length, 25)
  assert.deepEqual(BRAND_ASSET_PILOT_ALLOWLIST.slice(584, 609), manifest.entries.map(entry => ({
    entityType: "LEAGUE", entityId: entry.leagueId, provider: "api-football",
    providerEntityId: entry.providerId, assetType: "LOGO",
  })))
})

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
function fakeStore(options: { failAsset?: boolean; unknownCommit?: boolean; mutateProtectedAfterCommit?: boolean; identityConflict?: string } = {}) {
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
      async hasLeaguePublicationBlock(entityId) {
        return draft.identities.some(identity => identity.entityType === "LEAGUE" && identity.entityId === entityId &&
          (identity.status === "BLOCKED" || draft.assets.some(asset => asset.identityId === identity.id &&
            (asset.rightsStatus === "BLOCKED" || asset.operationalDecision === "REVOKED" || asset.displayPolicy === "DISPLAY_BLOCKED"))))
      },
      async readLocalEntity(entityType, entityId) {
        const identity = BRAND_ASSET_PILOT_ALLOWLIST.find(item => item.entityType === entityType && item.entityId === entityId)
        return identity ? { id: entityId, providerEntityId: entityType === "CLUB" ? identity.providerEntityId : null } : null
      },
      async findIdentityByLocal(input) {
        return draft.identities.find(row => row.entityType === input.entityType && row.entityId === input.entityId && row.provider === input.provider && row.status !== "BLOCKED") ?? null
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
        if (options.identityConflict) throw Object.assign(new Error("simulated concurrent insert"), { code: options.identityConflict })
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

for (const source of [BRACK_SOURCE, ISL_SOURCE]) test(`synthetically authorized ${source.provider} uses existing atomic writer, rollback, conflict and indeterminate controls`, async () => {
  // In-memory authorization fixture only; the checked-in allowlist stays unchanged.
  const allowlist = BRAND_ASSET_PILOT_ALLOWLIST as unknown as BrandAssetPilotIdentity[]
  const identity: BrandAssetPilotIdentity = { entityType: "LEAGUE", entityId: source.entityId,
    provider: source.provider, providerEntityId: source.providerEntityId, assetType: "LOGO" }
  allowlist.push(identity)
  try {
    const official = candidate(allowlist.length - 1, { sourceUrl: source.sourceUrl, contentHash: source.contentHash,
      rightsStatus: "REVIEW_REQUIRED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE",
      operationalAuthorizedAt: now.toISOString(), operationalDecisionRef: "synthetic-only",
      operatorRiskAccepted: true, riskAcceptedAt: now.toISOString(), riskAcceptedBy: "test", riskReason: "test",
      sourceTermsUrl: source.evidenceUrl })
    for (const options of [{}, { failAsset: true }, { identityConflict: "P2002" }, { unknownCommit: true }]) {
      const f = fakeStore(options)
      const result = await persistBrandAssetAtomically(f.store, { candidate: official, expected: emptyExpected }, () => now)
      assert.equal(result.status, "failAsset" in options ? "ROLLED_BACK" : "identityConflict" in options ?
        "CONCURRENT_MODIFICATION" : "unknownCommit" in options ? "INDETERMINATE_COMMIT" : "CREATED")
      assert.equal(result.retries, 0)
      assert.equal(f.state().assets.length, "failAsset" in options || "identityConflict" in options ? 0 : 1)
    }
    const f = fakeStore()
    f.set({ identities: [{ id: "blocked-api", entityType: "LEAGUE", entityId: source.entityId,
      provider: "api-football", providerEntityId: "207", status: "BLOCKED", version: 2 }], assets: [] })
    const before = f.state()
    const blocked = await persistBrandAssetAtomically(f.store, { candidate: official, expected: emptyExpected }, () => now)
    assert.equal(blocked.status, "IDENTITY_CONFLICT")
    assert.deepEqual(f.state(), before)
  } finally { allowlist.pop() }
})


test("four independently verified league logos are the only new identities after Red Star", async () => {
  const rows = [
    ["cmt9d4pi304mtukucja4z7u2q", "141"], ["cmta7vu7o02496wucuxpwquwr", "41"],
    ["cmtad946t03lq9gucelzi806s", "80"], ["cmt9b3q3i00alukuc087t3u4x", "128"],
  ]
  assert.deepEqual(BRAND_ASSET_PILOT_ALLOWLIST.slice(610), rows.map(([entityId, providerEntityId]) => ({
    entityType: "LEAGUE", entityId, provider: "api-football", providerEntityId, assetType: "LOGO",
  })))
  assert.equal(BRAND_ASSET_PILOT_ALLOWLIST.filter(row => row.entityType === "LEAGUE" &&
    ["188", "207", "323", "318", "307"].includes(row.providerEntityId)).length, 0)
  for (let index = 610; index < 614; index++) {
    const f = fakeStore()
    const result = await persistBrandAssetAtomically(f.store, { candidate: candidate(index), expected: emptyExpected }, () => now)
    assert.equal(result.status, "CREATED"); assert.equal(result.retries, 0)
    assert.equal(f.state().identities[0].providerEntityId, rows[index - 610][1])
  }
})

test("closed 574-club and 40-league dry-run records owner authorization but stays blocked by unverified delivery", () => {
  const result = prepareBrandAssetPilotDryRun(currentPilot(), now)
  assert.equal(result.length, 614)
  assert.equal(result.filter(row => row.identity.entityType === "CLUB").length, 574)
  assert.equal(result.filter(row => row.identity.entityType === "LEAGUE").length, 40)
  assert.deepEqual(result.map(row => row.identity), [...BRAND_ASSET_PILOT_ALLOWLIST])
  assert.ok(result.every(row => !row.writable && row.action === "NOT_WRITABLE" && row.rightsStatus === "REVIEW_REQUIRED" &&
    row.displayPolicy === "DISPLAY_ALLOWED" &&
    row.riskAccepted && row.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" &&
    row.publicationDecision === "ALLOWED_AT_OPERATOR_RISK" && row.renderDecision === "FALLBACK" &&
    row.rollbackDecision === "REVOKE_ASSET" && row.deliveryStatus === "UNVERIFIED" &&
    !row.blockers.includes("RIGHTS_REVIEW_REQUIRED") && row.blockers.includes("DELIVERY_NOT_VALIDATED")))
})

test("allow-list rejects a 615th candidate, replacement, reordering and Club/League type mismatch", () => {
  const pilot = currentPilot()
  assert.throws(() => prepareBrandAssetPilotDryRun([...pilot, pilot[0]], now), /ALLOWLIST/)
  assert.throws(() => prepareBrandAssetPilotDryRun([pilot[1], pilot[0], ...pilot.slice(2)], now), /ALLOWLIST/)
  assert.throws(() => prepareBrandAssetPilotDryRun([{ ...pilot[0], providerEntityId: "999" }, ...pilot.slice(1)], now), /ALLOWLIST/)
  assert.throws(() => prepareBrandAssetPilotDryRun([{ ...pilot[0], assetType: "LOGO" }, ...pilot.slice(1)] as BrandAssetCandidate[], now), /ALLOWLIST/)
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

test("Red Star 4396 remains forbidden and 104 is authorized only for the exact local club", async () => {
  assert.deepEqual(BRAND_ASSET_PILOT_ALLOWLIST.filter(row => row.entityId === "cmt9g1wkq037v1sucum6ntyxn"), [{
    entityType: "CLUB", entityId: "cmt9g1wkq037v1sucum6ntyxn", provider: "api-football", providerEntityId: "104", assetType: "CREST",
  }])
  for (const [entityId, providerEntityId] of [["cmt9g1wkq037v1sucum6ntyxn", "4396"], ["other-club", "104"]]) {
    const f = fakeStore()
    const result = await persistBrandAssetAtomically(f.store, { expected: emptyExpected, candidate: candidate(0, {
      entityType: "CLUB", entityId, provider: "api-football", providerEntityId,
      assetType: "CREST", sourceUrl: `https://media.api-sports.io/football/teams/${providerEntityId}.png`,
    }) }, () => now)
    assert.equal(result.reason, "ALLOWLIST_MISMATCH")
    assert.equal(f.transactions(), 0)
  }
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

test("a different blocked provider identity and revoked crest remain untouched when creating the current identity", async () => {
  const base = existingState({ operationalDecision: "REVOKED", displayPolicy: "DISPLAY_BLOCKED", version: 2 })
  const historical = { ...base.identity, providerEntityId: "historical-provider", status: "BLOCKED" as const, version: 2 }
  const f = fakeStore(); f.set({ identities: [historical], assets: [base.asset] })
  const result = await persistBrandAssetAtomically(f.store, { candidate: base.input, expected: emptyExpected }, () => now)
  assert.equal(result.status, "CREATED")
  assert.deepEqual(f.state().identities[0], historical); assert.deepEqual(f.state().assets[0], base.asset)
  assert.equal(f.state().identities.length, 2); assert.equal(f.state().assets.length, 2)
  const second = await persistBrandAssetAtomically(f.store, { candidate: base.input, expected: emptyExpected }, () => now)
  assert.equal(second.status, "NO_OP")
})

for (const failAsset of [false, true]) test(`Red Star 104 remote authorization preserves 4396 history, asset failure=${failAsset}`, async () => {
  const index = BRAND_ASSET_PILOT_ALLOWLIST.findIndex(row => row.entityId === "cmt9g1wkq037v1sucum6ntyxn")
  const input = candidate(index, {
    contentHash: "b73f17d20d59d3bf0bb060afdd572b82f3e297a1910038657750ddfc4159f2f7",
    rightsStatus: "REVIEW_REQUIRED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE",
    operationalAuthorizedAt: "2026-09-17T14:30:00.000Z",
    operationalDecisionRef: "owner-decision:red-star-104-remote-crest-2026-09-23",
    operatorRiskAccepted: true, riskAcceptedAt: "2026-09-17T14:30:00.000Z", riskAcceptedBy: "FutScout owner",
    riskReason: "Exact remote crest authorization; not a trademark licence.", sourceTermsUrl: "https://www.api-football.com/terms",
  })
  const base = existingState({ sourceUrl: "https://media.api-sports.io/football/teams/4396.png",
    operationalDecision: "REVOKED", displayPolicy: "DISPLAY_BLOCKED", version: 2 })
  const historical = { ...base.identity, entityId: input.entityId, providerEntityId: "4396", status: "BLOCKED" as const, version: 2 }
  const state = { identities: [historical], assets: [base.asset] }, f = fakeStore({ failAsset })
  f.set(state)
  const result = await persistBrandAssetAtomically(f.store, { candidate: input, expected: emptyExpected }, () => now)
  assert.equal(result.retries, 0); assert.equal(f.transactions(), 1)
  assert.deepEqual(f.state().identities[0], historical); assert.deepEqual(f.state().assets[0], base.asset)
  if (failAsset) {
    assert.equal(result.status, "ROLLED_BACK"); assert.deepEqual(f.state(), state)
  } else {
    assert.equal(result.status, "CREATED"); assert.equal(result.transactionState, "COMMIT_CONFIRMED")
    assert.equal(f.state().identities[1].providerEntityId, "104"); assert.equal(f.state().identities[1].status, "VERIFIED")
    assert.equal(f.state().assets[1].rightsStatus, "REVIEW_REQUIRED"); assert.equal(f.state().assets[1].storageUrl, null)
    assert.equal(f.state().assets[1].displayPolicy, "DISPLAY_ALLOWED"); assert.equal(f.state().assets[1].revocable, true)
  }
})

for (const status of ["BLOCKED", "REVIEW_REQUIRED"] as const) test(`same-provider ${status} identity cannot be revived or duplicated`, async () => {
  const base = existingState(), f = fakeStore()
  const state = { identities: [{ ...base.identity, status }], assets: [base.asset] }
  f.set(state)
  const result = await persistBrandAssetAtomically(f.store, { candidate: base.input, expected: emptyExpected }, () => now)
  assert.equal(result.status, "IDENTITY_CONFLICT"); assert.equal(result.reason, "PROVIDER_IDENTITY_NOT_VERIFIED")
  assert.deepEqual(f.state(), state)
})

test("another nonblocked local identity, including REVIEW_REQUIRED, still occupies the local slot", async () => {
  for (const status of ["VERIFIED", "REVIEW_REQUIRED"] as const) {
    const base = existingState(), f = fakeStore()
    const state = { identities: [{ ...base.identity, providerEntityId: "other-current", status }], assets: [base.asset] }
    f.set(state)
    const result = await persistBrandAssetAtomically(f.store, { candidate: base.input, expected: emptyExpected }, () => now)
    assert.equal(result.status, "IDENTITY_CONFLICT"); assert.deepEqual(f.state(), state)
  }
})

test("failure creating the new crest rolls back its new identity without touching blocked history", async () => {
  const base = existingState({ operationalDecision: "REVOKED", displayPolicy: "DISPLAY_BLOCKED" }), f = fakeStore({ failAsset: true })
  const state = { identities: [{ ...base.identity, providerEntityId: "historical", status: "BLOCKED" as const }], assets: [base.asset] }
  f.set(state)
  const result = await persistBrandAssetAtomically(f.store, { candidate: base.input, expected: emptyExpected }, () => now)
  assert.equal(result.status, "ROLLED_BACK"); assert.deepEqual(f.state(), state)
})

for (const code of ["P2002", "23505", "P2034", "40001"]) test(`${code}: concurrent local/provider insert is rejected without retry`, async () => {
  const f = fakeStore({ identityConflict: code })
  const result = await persistBrandAssetAtomically(f.store, { candidate: candidate(), expected: emptyExpected }, () => now)
  assert.equal(result.status, "CONCURRENT_MODIFICATION"); assert.equal(result.retries, 0)
  assert.equal(f.transactions(), 1); assert.deepEqual(f.state(), { identities: [], assets: [] })
})

test("all 574 authorized club mappings keep the existing create and idempotent behavior", async () => {
  let checked = 0
  for (const [index, identity] of BRAND_ASSET_PILOT_ALLOWLIST.entries()) {
    if (identity.entityType !== "CLUB") continue
    const f = fakeStore(), request = { candidate: candidate(index), expected: emptyExpected }
    assert.equal((await persistBrandAssetAtomically(f.store, request, () => now)).status, "CREATED")
    assert.equal((await persistBrandAssetAtomically(f.store, request, () => now)).status, "NO_OP")
    checked++
  }
  assert.equal(checked, 574)
})

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
