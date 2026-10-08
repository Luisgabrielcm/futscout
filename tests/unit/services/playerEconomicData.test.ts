import assert from "node:assert/strict"
import { test } from "node:test"
import fs from "node:fs"
import { adaptLiveFootballMarketValue as adapt } from "../../../lib/economicData/liveFootball"
import { economicFingerprint, normalizeAmount, type EconomicStateInput } from "../../../lib/economicData/value"
import { createPlayerEconomicWriter } from "../../../services/playerEconomicPersistence"
import type { PrismaClient } from "../../../app/generated/prisma/client"

const input = { playerId: "p1", providerPlayerId: "lf1", field: "MARKET_VALUE" as const,
  marketValue: "220.000.000€", confidence: "HIGH" as const, matchState: "MATCHED" as const }
const state = () => adapt(input).state
test("Live Football normalizes EUR without floating point loss", () => {
  assert.equal(adapt(input).state.amount, "220000000.00")
  assert.equal(adapt(input).state.currency, "EUR")
  assert.equal(adapt(input).state.providerPlayerId, "lf1")
  assert.equal(adapt(input).state.providerEffectiveAt, null)
})
test("zero, explicit null and absent are three different states/hashes", () => {
  const values = [0, null, undefined].map(marketValue => adapt({ ...input, marketValue, currency: "EUR" }))
  assert.deepEqual(values.map(v => v.state.presence), ["VALUE", "NULL", "ABSENT"])
  assert.equal(new Set(values.map(v => v.contentHash)).size, 3)
})
test("explicit effective date is preserved, never inferred from consultation", () => {
  assert.equal(adapt({ ...input, providerEffectiveAt: "2026-07-01T00:00:00Z" }).state.providerEffectiveAt, "2026-07-01T00:00:00Z")
})
test("hash is deterministic with metadata in a different insertion order", () => {
  const s = state()
  assert.equal(economicFingerprint(s), economicFingerprint({ ...s, metadata: { sourceVersion: "adapter-v1", source: "LIVE_FOOTBALL/player" } }))
})
test("changed valuation changes hash", () => assert.notEqual(adapt(input).contentHash, adapt({ ...input, marketValue: "200.000.000€" }).contentHash))
test("consultation timestamp does not change content hash", () => {
  assert.equal(economicFingerprint(state()), economicFingerprint({ ...state(), observedAt: "2027-01-01T00:00:00Z" } as EconomicStateInput))
})
test("equivalent effective instants have the same hash", () => {
  assert.equal(economicFingerprint({ ...state(), providerEffectiveAt: "2026-07-01T00:00:00Z" }), economicFingerprint({ ...state(), providerEffectiveAt: "2026-07-01T00:00:00.000Z" }))
})
test("currency conflict rejected", () => assert.throws(() => adapt({ ...input, currency: "USD" })))
test("missing currency is not guessed for a bare amount", () => assert.throws(() => adapt({ ...input, marketValue: 100 })))
test("invalid amount precision/negative/nonfinite/abbreviation rejected", () => {
  for (const value of [-1, Infinity, NaN, "1.2345", "220M", "1,000", true]) assert.throws(() => normalizeAmount(value))
})
test("adapter rejects fields other than MARKET_VALUE", () => assert.throws(() => adapt({ ...input, field: "RELEASE_CLAUSE" } as unknown as Parameters<typeof adapt>[0])))
test("metadata cannot carry arbitrary payload or URL/token", () => {
  for (const metadata of [{ source: "https://provider?key=secret" }, { source: "ok", apiKey: "test" }, { source: "token" }])
    assert.throws(() => economicFingerprint({ ...state(), metadata }))
})
test("weekly wage/contract/release clause support remains provider independent", () => {
  const base = state()
  for (const s of [
    { ...base, field: "WAGE_WEEKLY", period: "WEEK", amount: "1500.00" },
    { ...base, field: "RELEASE_CLAUSE", amount: "100000.00" },
    { ...base, field: "CONTRACT_UNTIL", amount: null, currency: null, contractUntil: "2029-06-30", datePrecision: "DAY" },
  ] as EconomicStateInput[]) assert.match(economicFingerprint(s), /^[a-f0-9]{64}$/)
})
test("weekly period and date precision are enforced", () => {
  assert.throws(() => economicFingerprint({ ...state(), field: "WAGE_WEEKLY", period: "MONTH" }))
  assert.throws(() => economicFingerprint({ ...state(), field: "CONTRACT_UNTIL", amount: null, currency: null, contractUntil: "2029-02-30", datePrecision: "DAY" }))
})
const plan = () => ({ state: state(), observedAt: "2026-10-06T00:00:00Z", requestId: "request1", selectCurrent: true,
  expectedRevision: null, selectionReason: "PROVIDER_PRIMARY", policyVersion: "economic-selection-v1" })
const grants = [{ provider: "LIVE_FOOTBALL", field: "MARKET_VALUE" as const, context: "REAL_WORLD" as const, evidenceRef: "fixture-only" }]
test("unauthorized provider rejects before transaction", async () => {
  let calls = 0
  const client = { $transaction: async () => { calls++; throw new Error("not allowed") } } as unknown as PrismaClient
  await assert.rejects(createPlayerEconomicWriter(client)(plan()), /PROVIDER_UNAUTHORIZED/)
  assert.equal(calls, 0)
})
test("non-HIGH/ambiguous identity rejects before transaction", async () => {
  const client = { $transaction: () => { throw new Error("unexpected transaction") } } as unknown as PrismaClient
  await assert.rejects(createPlayerEconomicWriter(client, grants)({ ...plan(), state: { ...state(), confidence: "MEDIUM" } }), /IDENTITY_REJECTED/)
})
test("authorization is scoped by provider, context and field", async () => {
  const client = { $transaction: () => { throw new Error("unexpected transaction") } } as unknown as PrismaClient
  for (const change of [{ provider: "OTHER_PROVIDER" }, { context: "EA_CAREER" as const }, { field: "RELEASE_CLAUSE" as const }])
    await assert.rejects(createPlayerEconomicWriter(client, grants)({ ...plan(), state: { ...state(), ...change } }), /PROVIDER_UNAUTHORIZED/)
})
test("transaction is Serializable and failure is not retried", async () => {
  let calls = 0
  const client = { $transaction: async (_work: unknown, options: unknown) => {
    calls++; assert.deepEqual(options, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 }); throw new Error("40001")
  } } as unknown as PrismaClient
  await assert.rejects(createPlayerEconomicWriter(client, grants)(plan()), /40001/)
  assert.equal(calls, 1)
})
test("migration guards immutable history, identity, CAS and does not write legacy", () => {
  const sql = fs.readFileSync("prisma/migrations/20261006000000_player_economic_data_v1/migration.sql", "utf8")
  assert.match(sql, /BEFORE UPDATE OR DELETE ON "PlayerEconomicState"/)
  assert.match(sql, /BEFORE UPDATE OR DELETE ON "PlayerEconomicObservation"/)
  assert.match(sql, /BEFORE TRUNCATE/)
  assert.match(sql, /NEW\.revision<>OLD\.revision\+1/)
  assert.match(sql, /FOREIGN KEY \("observationId","playerId",field\)/)
  assert.doesNotMatch(sql, /(?:UPDATE|INSERT INTO|ALTER TABLE) "Player"/)
})
