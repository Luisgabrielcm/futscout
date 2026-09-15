import assert from "node:assert/strict"
import test from "node:test"
import { createApiFootballTransferReader, type TransferFetch } from "../../../services/apiFootballTransferReader"
import { parseTransferPilotArgs, requireTransferPilotGit, runTransferObservationPilot, TRANSFER_PILOT_PLAYERS } from "../../../services/transferObservationPilot"
import { transferNow, transferPayload, transferPilotFixture, transferEvent } from "../../fixtures/transferObservation"

const ids = TRANSFER_PILOT_PLAYERS.map(p => p.providerPlayerId)
const response = (body: unknown, status = 200) => ({ status, text: async () => JSON.stringify(body) })
const reader = (fetch: TransferFetch, timeoutMs?: number) => createApiFootballTransferReader({ allowedPlayerIds: ids, apiKey: "fixture-secret-do-not-log", now: () => transferNow, fetch, timeoutMs })
test("six requests allowed; seventh rejected before transport, exact HTTPS endpoint and GET only", async () => {
  const calls: string[] = []
  const r = reader(async (url, init) => {
    const u = new URL(url); calls.push(url)
    assert.equal(u.origin, "https://v3.football.api-sports.io"); assert.equal(u.pathname, "/transfers")
    assert.deepEqual([...u.searchParams.keys()], ["player"]); assert.equal(init.method, "GET")
    assert.equal(init.redirect, "error"); assert.ok(init.signal); assert.equal(init.body, undefined)
    return response(transferPayload(Number(u.searchParams.get("player"))))
  })
  for (const id of ids) { const result = await r.read(id); assert.equal(result.requestedPlayerId, id) }
  await assert.rejects(r.read(999), /TRANSFER_REQUEST_BUDGET/); assert.equal(calls.length, 6)
  assert.deepEqual(r.counters(), { requests: 6, stopped: true, retry: 0 })
  assert.equal(JSON.stringify(r.requestLog()).includes("fixture-secret"), false)
  assert.ok(r.requestLog().every(l => l.status === 200 && l.durationMs >= 0 && l.validation === "VALID_IDENTITY"))
})
test("allow-list rejects outsider and repeated player, never fetches a retry", async () => {
  let calls = 0; const fetch: TransferFetch = async () => { calls++; return response(transferPayload()) }
  const outside = reader(fetch); await assert.rejects(outside.read(900), /NOT_ALLOWED/); assert.equal(calls, 0)
  const duplicate = reader(fetch); await duplicate.read(306); await assert.rejects(duplicate.read(306), /RETRY_FORBIDDEN/); assert.equal(calls, 1)
  assert.throws(() => createApiFootballTransferReader({ allowedPlayerIds: [...ids, 900], apiKey: "fake", fetch, now: () => transferNow }), /CONFIGURATION/)
})
for (const [name, fetch, code] of [
  ["HTTP429", async () => response({}, 429), "RATE_LIMIT_429"],
  ["quota200", async () => response({ errors: { requests: "You have reached the requests limit" } }), "RATE_LIMIT_429"],
  ["quota message", async () => response({ message: "Quota exhausted", errors: [] }), "RATE_LIMIT_429"],
  ["5xx", async () => response({}, 503), "HTTP_ERROR"],
  ["redirect", async () => response({}, 302), "HTTP_ERROR"],
  ["network", async () => { throw new Error("secret URL must not leak") }, "NETWORK_ERROR"],
  ["invalid JSON", async () => ({ status: 200, text: async () => "not json" }), "MALFORMED_TRANSFER_JSON"],
  ["wrong identity", async () => response(transferPayload(999)), "INVALID_PROVIDER_IDENTITY"],
  ["malformed envelope", async () => response({ response: {} }), "MALFORMED_TRANSFER_PAYLOAD"],
] as const) {
  test(`${name} stops the reader with zero retry and no next request`, async () => {
    let calls = 0; const r = reader(async (u, i) => { calls++; return (fetch as TransferFetch)(u, i) })
    await assert.rejects(r.read(306), new RegExp(code)); await assert.rejects(r.read(44), /STOPPED/)
    assert.equal(calls, 1); assert.equal(r.counters().retry, 0); assert.equal(r.requestLog().length, 1)
    assert.equal(JSON.stringify(r.requestLog()).includes("secret URL"), false)
  })
}
test("timeout covers transport/body; no hanging request can enable another fetch", async () => {
  let calls = 0; const r = reader(async () => { calls++; return { status: 200, text: () => new Promise<string>(() => {}) } }, 5)
  await assert.rejects(r.read(306), /TRANSFER_TIMEOUT/); await assert.rejects(r.read(44), /STOPPED/); assert.equal(calls, 1)
})
test("concurrent second request stops the first without opening a second transport", async () => {
  let release!: (v: Awaited<ReturnType<TransferFetch>>) => void, calls = 0
  const r = reader(async () => { calls++; return new Promise(resolve => { release = resolve }) })
  const first = r.read(306); await assert.rejects(r.read(44), /STOPPED/)
  release(response(transferPayload())); await assert.rejects(first, /STOPPED/); assert.equal(calls, 1)
})
test("fake pilot of exact six is observable, complete, read-only and not real transfer data", async () => {
  const evidence = transferPilotFixture(), before = structuredClone(evidence); let calls = 0, gitChecks = 0
  const report = await runTransferObservationPilot({ evidence, now: transferNow, apiKey: "fake" }, {
    beforeRequest: () => { gitChecks++ }, fetch: async url => { calls++; const id = Number(new URL(url).searchParams.get("player"))
      return response(transferPayload(id, [transferEvent(), transferEvent("2026-09-01", "Loan")])) },
  })
  assert.equal(report.complete, true); assert.equal(calls, 6); assert.equal(gitChecks, 6); assert.equal(report.writes, 0)
  assert.deepEqual(report.rows.map(r => r.localIdentity.providerPlayerId), ids)
  assert.ok(report.rows.every(r => r.status === "COMPLETED" && r.decision?.writable === false))
  assert.ok(report.evidence.warnings.includes("SYNTHETIC_FIXTURE_NOT_REAL_TRANSFER_DATA")); assert.deepEqual(evidence, before)
})
for (const failure of ["identity", "quota", "network", "malformed"]) {
  test(`third ${failure} failure preserves 1–2 completed, 3 failed, 4–6 not started`, async () => {
    let calls = 0
    const r = await runTransferObservationPilot({ evidence: transferPilotFixture(), now: transferNow, apiKey: "fake" }, {
      beforeRequest: () => {}, fetch: async url => {
        calls++; const id = Number(new URL(url).searchParams.get("player"))
        if (calls !== 3) return response(transferPayload(id))
        if (failure === "network") throw new Error("secret")
        return response(failure === "identity" ? transferPayload(999) : failure === "quota" ? { errors: ["quota"] } : {})
      },
    })
    assert.equal(r.complete, false); assert.equal(calls, 3); assert.equal(r.writes, 0)
    assert.deepEqual(r.rows.map(r => r.status), ["COMPLETED", "COMPLETED", "FAILED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED"])
    assert.equal(r.requestLog.length, 3); assert.ok(r.rows[0].observation); assert.ok(r.rows[1].observation)
    assert.equal(r.rows[2].observation, null); assert.equal(JSON.stringify(r).includes("secret"), false)
  })
}
test("changed local cohort fails before reader/fetch; beforeRequest guard failure stops all later players", async () => {
  let calls = 0; const fetch: TransferFetch = async () => { calls++; return response(transferPayload()) }
  const evidence = transferPilotFixture(); evidence.players[0] = { ...evidence.players[0], clubId: "changed" }
  await assert.rejects(runTransferObservationPilot({ evidence, now: transferNow, apiKey: "fake" }, { fetch, beforeRequest: () => {} }), /IDENTITY_CHANGED/)
  const r = await runTransferObservationPilot({ evidence: transferPilotFixture(), now: transferNow, apiKey: "fake" }, { fetch, beforeRequest: () => { throw new Error("dirty git") } })
  assert.equal(calls, 0); assert.equal(r.rows[0].status, "FAILED"); assert.ok(r.rows.slice(1).every(r => r.status === "NOT_STARTED"))
})
test("CLI accepts only exact six/order and read-only modes; write/endpoint/name/budget overrides rejected", () => {
  const list = ids.join(",")
  assert.equal(parseTransferPilotArgs(["--dry-run", "--player-ids", list]), "DRY_RUN")
  assert.equal(parseTransferPilotArgs(["--preflight", "--player-ids", list]), "PREFLIGHT")
  for (const args of [[], ["--write", "--player-ids", list], ["--dry-run", "--player-ids", `${list},999`],
    ["--dry-run", "--player-ids", [...ids].reverse().join(",")], ["--dry-run", "--player-ids", list, "--team", "40"],
    ["--dry-run", "--search", "Salah"]]) assert.throws(() => parseTransferPilotArgs(args))
})
test("branch, clean tree, HEAD format and stable HEAD guards", () => {
  const state = { branch: "beta-next", status: "", head: "a".repeat(40) }
  requireTransferPilotGit(state)
  for (const invalid of [{ ...state, branch: "master" }, { ...state, status: "?? file" }, { ...state, head: "short" }]) assert.throws(() => requireTransferPilotGit(invalid))
  assert.throws(() => requireTransferPilotGit(state, "b".repeat(40)))
})
