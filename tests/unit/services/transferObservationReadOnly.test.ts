import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import ts from "typescript"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { readTransferAuditHashes, readTransferPilotEvidence } from "../../../services/transferObservationReadRepository"
import { transferNow, transferPilotFixture } from "../../fixtures/transferObservation"

function fakeDatabase() {
  const fixture = transferPilotFixture()
  const catalog = fixture.players.map(p => ({ id: p.playerId, slug: p.slug, name: p.name, apiFootballId: p.providerPlayerId, clubId: p.clubId,
    club: { name: p.clubName, apiFootballId: p.localTeamId }, apiFootballMatchAttempt: null as { status: string; lastApiFootballId: number } | null }))
  const operations: string[] = [], counters = { rollbacks: 0, mutations: 0, readOnly: false }
  const forbidden = new Set(["create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany", "createManyAndReturn", "updateManyAndReturn"])
  const model = (data: unknown[]) => new Proxy({}, { get(_, key) {
    if (forbidden.has(String(key))) { counters.mutations++; throw new Error("MUTATION_FORBIDDEN") }
    if (key !== "findMany") throw new Error(`UNEXPECTED_MODEL_OPERATION:${String(key)}`)
    return async () => { assert.equal(counters.readOnly, true); operations.push("findMany"); return structuredClone(data) }
  } })
  const cache = [{ apiTeamId: 40, season: 2026, playerCount: 1, fetchedAt: new Date("2026-09-14"), expiresAt: new Date("2026-09-21"),
    players: [{ player: { id: 1 }, statistics: [{ team: { id: 40 }, league: { season: 2026 } }] }] }]
  const tx = new Proxy({
    player: model(catalog), club: model(fixture.clubs), apiFootballTeamRosterCache: model(cache), clubOfficialLineupSnapshot: model([]),
    $executeRawUnsafe: async (sql: string) => { assert.equal(sql, "SET TRANSACTION READ ONLY"); counters.readOnly = true; operations.push(sql); return 0 },
    $queryRawUnsafe: async (sql: string) => {
      assert.equal(counters.readOnly, true); operations.push(sql)
      if (sql === "SHOW transaction_read_only") return [{ transaction_read_only: "on" }]
      assert.match(sql, /^SELECT count\(\*\)::text/); assert.match(sql, /FROM "[A-Za-z]+" t$/)
      return [{ count: "1", hash: "fixture-unchanged" }]
    },
  }, { get(target, key) { if (!(key in target)) throw new Error(`UNEXPECTED_TX_CAPABILITY:${String(key)}`); return Reflect.get(target, key) } })
  const db = { $transaction: async (fn: (t: typeof tx) => Promise<unknown>, options: { isolationLevel: string }) => {
    assert.equal(options.isolationLevel, "RepeatableRead"); counters.readOnly = false
    try { return await fn(tx) } catch (e) { counters.rollbacks++; throw e }
  } } as unknown as PrismaClient
  return { db, counters, operations, catalog, cache }
}
test("repository uses only reads, verifies READ ONLY, forced rollback, full hashes and no Prisma model mutation", async () => {
  const f = fakeDatabase(), before = structuredClone(f.catalog)
  const read = await readTransferPilotEvidence(f.db, transferNow), after = await readTransferAuditHashes(f.db)
  assert.equal(read.evidence.players.length, 6); assert.equal(Object.keys(read.hashes).length, 14)
  assert.deepEqual(read.hashes, after); assert.equal(f.counters.mutations, 0); assert.equal(f.counters.rollbacks, 2)
  assert.deepEqual(f.catalog, before); assert.equal(f.operations[0], "SET TRANSACTION READ ONLY")
  assert.equal(f.operations[1], "SHOW transaction_read_only")
})
test("changed local ID, slug, club or inconsistent attempt block preflight and roll back", async () => {
  for (const mutate of [(f: ReturnType<typeof fakeDatabase>) => { f.catalog[0].apiFootballId = 777 },
    (f: ReturnType<typeof fakeDatabase>) => { f.catalog[0].slug = "someone-else" },
    (f: ReturnType<typeof fakeDatabase>) => { f.catalog[0].clubId = "changed" },
    (f: ReturnType<typeof fakeDatabase>) => { f.catalog[0].apiFootballMatchAttempt = { status: "matched", lastApiFootballId: 999 } },
    (f: ReturnType<typeof fakeDatabase>) => { f.catalog.push({ ...f.catalog[0], id: "duplicate" }) }]) {
    const f = fakeDatabase(); mutate(f)
    await assert.rejects(readTransferPilotEvidence(f.db, transferNow), /IDENTITY_CHANGED/)
    assert.equal(f.counters.rollbacks, 1); assert.equal(f.counters.mutations, 0)
  }
})
test("expired/malformed cached roster is excluded with warning and no external fallback", async () => {
  const f = fakeDatabase(); f.cache[0].expiresAt = new Date("2026-09-14")
  const r = await readTransferPilotEvidence(f.db, transferNow)
  assert.deepEqual(r.evidence.rosters, []); assert.deepEqual(r.evidence.warnings, ["IGNORED_ROSTER:40:2026"])
  assert.equal(f.counters.mutations, 0)
})

test("runner dependency graph cannot reach legacy sync, mutable identity services or runtime Prisma singleton", () => {
  const root = process.cwd(), seen = new Set<string>()
  const visit = (path: string) => {
    if (seen.has(path)) return
    seen.add(path)
    assert.doesNotMatch(path, /syncApiFootballPlayer|syncPlayers|AutoWrite|lib[\\/]prisma\.ts$/)
    // Generated client is constructed only at CLI boundary; do not traverse generated internals.
    if (path.includes(`${resolve(root, "app/generated/prisma")}`)) return
    const text = readFileSync(path, "utf8"), ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
    const load = (specifier: string) => {
      if (!specifier.startsWith(".")) return
      const next = resolve(dirname(path), specifier + ".ts")
      assert.ok(existsSync(next), next); visit(next)
    }
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          /^(create|update|upsert|delete|createMany|updateMany|deleteMany|createManyAndReturn|updateManyAndReturn)$/.test(node.expression.name.text)) {
        const receiver = node.expression.expression
        // crypto.Hash.update is pure hashing, not Prisma.Model.update. No blanket .update exemption.
        const hashUpdate = node.expression.name.text === "update" && ts.isCallExpression(receiver) &&
          ts.isIdentifier(receiver.expression) && receiver.expression.text === "createHash"
        assert.ok(hashUpdate, `Forbidden model-like operation: ${node.getText(ast)}`)
      }
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) load(node.moduleSpecifier.text)
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) load(node.arguments[0].text)
      ts.forEachChild(node, walk)
    }
    walk(ast)
  }
  visit(resolve(root, "scripts/runTransferObservationPilot.ts"))
  assert.ok([...seen].some(p => p.endsWith("transferObservationReadRepository.ts")))
  assert.ok([...seen].some(p => p.endsWith("lib/prismaReadOnly.ts") || p.endsWith("lib\\prismaReadOnly.ts")))
})
test("parser/core/reader are independent from env, database and global network", () => {
  for (const path of ["lib/transferObservations.ts", "services/currentClubEvidence.ts", "services/apiFootballTransferReader.ts"]) {
    const source = readFileSync(path, "utf8")
    assert.doesNotMatch(source, /from ["'][^"']*(prisma|dotenv|syncApiFootballPlayer)/i)
    assert.doesNotMatch(source, /process\.env|globalThis\.fetch/)
  }
})
