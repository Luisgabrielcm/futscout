import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dispatchClubIdentityRunner, parseClubIdentityRunnerArgs } from "../../../services/clubIdentityRunner"
import { barcelonaClubIdentityDryRunConfig } from "../../../services/clubIdentityPilotConfig"
import type { ClubIdentityConfig } from "../../../services/clubPlayerIdentityPipeline"
import { clubIdentityWriteToken, createClubIdentityAuthorizationSummary } from "../../../services/clubIdentityAuthorization"
import { clubWriteFixture } from "../../fixtures/clubIdentityWrite"

function dispatchFixture() {
  // Only the dispatcher envelope is synthesized here; matching/transaction tests use real cores.
  const f = clubWriteFixture(), report = f.input().report
  report.config = barcelonaClubIdentityDryRunConfig(); report.totalProviderPlayers = 27
  report.rows[0].providerPlayerId = 619; report.rows[0].localCandidate!.playerId = "cmt9c25m202a8ukucx37nek1p"
  report.rows[0].localCandidate!.slug = "eric-garcia"
  report.rows[1].providerPlayerId = 182718; report.rows[1].decision = "REVIEW"
  const envelope = { head: f.git.head, report, authorization: createClubIdentityAuthorizationSummary(report) }
  const args = ["--write", "--club", "fc-barcelona", "--season", "2026", "--summary-file", "audit/reports/eric.json",
    "--confirmation", clubIdentityWriteToken(report), "--expected-head", f.git.head]
  const events: string[] = []
  const deps = {
    git: (...args: string[]) => args[0] === "branch" ? f.git.branch : args[0] === "status" ? f.git.clean ? "" : " M x" : f.git.head,
    clock: () => f.clock.now, blockHttp: () => { events.push("block-http") },
    readSummary: () => { events.push("summary"); return envelope },
    readOnly: async () => { events.push("read-only") },
    loadWrite: async () => { events.push("load-write"); return async () => { events.push("write-fake") } },
  }
  return { ...f, envelope, args, events, deps }
}

for (const mode of ["--dry-run", "--preflight"]) test(`${mode} never loads write dependencies`, async () => {
  const f = dispatchFixture()
  await dispatchClubIdentityRunner([mode, "--club", "fc-barcelona", "--season", "2026"], f.deps)
  assert.deepEqual(f.events, ["block-http", "read-only"])
})
test("write dispatcher validates explicit summary/token/Git before loading write factory", async () => {
  const f = dispatchFixture(); await dispatchClubIdentityRunner(f.args, f.deps)
  assert.deepEqual(f.events, ["summary", "block-http", "load-write", "write-fake"])
})
for (const kind of ["token", "head", "branch", "dirty", "envelope-head", "expired", "Joan", "extra-auto", "other-club", "path", "missing-token"]) {
  test(`CLI blocks ${kind} before write factory`, async () => {
    const f = dispatchFixture()
    if (kind === "token") f.args[8] = "AUTHORIZE_CLUB_IDENTITY_V1:" + "b".repeat(64)
    if (kind === "head") f.args[10] = "b".repeat(40)
    if (kind === "branch") f.git.branch = "master"
    if (kind === "dirty") f.git.clean = false
    if (kind === "envelope-head") f.envelope.head = "b".repeat(40)
    if (kind === "expired") f.clock.now = new Date("2026-09-13")
    if (kind === "Joan" || kind === "extra-auto") f.envelope.report.rows[1].decision = "AUTO_MATCH"
    if (kind === "other-club") f.args[2] = "manchester-city"
    if (kind === "path") f.args[6] = ".env"
    if (kind === "missing-token") f.args.splice(7, 2)
    await assert.rejects(dispatchClubIdentityRunner(f.args, f.deps))
    assert.equal(f.events.includes("load-write"), false); assert.equal(f.events.includes("write-fake"), false)
  })
}
test("only explicit future command enables mode; parser never has a default write", () => {
  assert.throws(() => parseClubIdentityRunnerArgs([]))
  assert.throws(() => parseClubIdentityRunnerArgs(["--write", "--club", "fc-barcelona", "--season", "2026"]))
  assert.equal(parseClubIdentityRunnerArgs(["--dry-run", "--club", "fc-barcelona", "--season", "2026"]).config.writePolicy.maxAutoWrites, 1)
  const source = readFileSync("scripts/runClubPlayerIdentityPipeline.ts", "utf8")
  assert.match(source, /dispatchClubIdentityRunner/)
  const readOnly = source.slice(source.indexOf("readOnly: async"), source.indexOf("loadWrite: async"))
  assert.doesNotMatch(readOnly, /executeClubIdentityAutoWrite|createPrismaClubIdentityWriteDependencies/)
  assert.match(source, /HTTP_FORBIDDEN/)
})

for (const [slug, team] of [["manchester-city", 50], ["real-madrid", 541]] as const) {
  test(`${slug} expansion forwards only READ ONLY config with limit five and pinned snapshot`, async () => {
    const f = dispatchFixture(), configs: ClubIdentityConfig[] = []
    const args = ["--dry-run", "--club", slug, "--season", "2026"]
    await dispatchClubIdentityRunner(args, { ...f.deps,
      readOnly: async (_mode, _head, _tree, config) => { configs.push(config); f.events.push("read-only") } })
    assert.deepEqual(f.events, ["block-http", "read-only"])
    assert.equal(configs.length, 1); assert.equal(configs[0].apiFootballTeamId, team)
    assert.equal(configs[0].clubSlug, slug); assert.equal(configs[0].season, 2026)
    assert.equal(configs[0].mode, "DRY_RUN"); assert.equal(configs[0].writePolicy.maxAutoWrites, 5)
    assert.equal(configs[0].snapshot.required, true); assert.equal(configs[0].snapshot.requireParticipation, false)
    assert.match(configs[0].snapshot.expectedHash!, /^[a-f0-9]{64}$/)
    if (slug === "real-madrid") assert.throws(() => parseClubIdentityRunnerArgs(["--preflight", ...args.slice(1)]))
    else assert.equal(parseClubIdentityRunnerArgs(["--preflight", ...args.slice(1)]).config.orderedBatchCandidates?.length, 5)
    assert.throws(() => parseClubIdentityRunnerArgs([...args.slice(0, 4), "2024"]))
    f.args[2] = slug
    await assert.rejects(dispatchClubIdentityRunner(f.args, f.deps))
    assert.equal(f.events.includes("load-write"), false)
  })
}

test("expansion parser rejects unknown clubs and extra flags", () => {
  assert.throws(() => parseClubIdentityRunnerArgs(["--dry-run", "--club", "another", "--season", "2026"]))
  assert.throws(() => parseClubIdentityRunnerArgs(["--dry-run", "--club", "real-madrid", "--season", "2026", "--max-auto-writes", "6"]))
})
