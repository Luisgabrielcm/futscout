// Explicit disposable PostgreSQL 17 test. Never reads project connection env.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import net from "node:net"
import { spawn } from "node:child_process"
import { randomUUID, scryptSync } from "node:crypto"
import { Pool, Client } from "pg"
import { loadCatalogModule } from "../helpers/loadCatalogModule"
import * as crypto from "node:crypto"
import * as domain from "../../lib/adminEconomic"
import { wagePresentation } from "../../lib/wagePublication"
import * as auth from "../../lib/adminAuth"
import { compareDatabaseSessions } from "../../lib/adminDatabaseIdentityDiagnostic.server"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { catalogPlayer } from "../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../mappers/mapDatabasePlayer"
import { getPlayerProfilePositions } from "../../lib/playerProfilePositions"
import { formatCurrency } from "../../utils/formatCurrency"
import { getOverallDifference } from "../../utils/getOverallDifference"

assert(process.argv.includes("--disposable-authorized"))
const root = path.resolve("audit/output")
const cluster = fs.mkdtempSync(path.join(root, "admin-economic-disposable-"))
assert(cluster.startsWith(root + path.sep))
const bin = path.resolve(process.env.FUTSCOUT_PG17_BIN || "audit/output/postgres17-portable-01/distribution/pgsql/bin")
const env: NodeJS.ProcessEnv = { NODE_ENV: "test" }
for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE"]) if (process.env[key]) env[key] = process.env[key]
const command = (name: string, args: string[]) => new Promise<void>((resolve, reject) => {
  const proc = spawn(path.join(bin, name + ".exe"), args, { env, windowsHide: true, stdio: "ignore" })
  proc.once("error", reject); proc.once("exit", code => code === 0 ? resolve() : reject(Error(name + ":" + code)))
})
let started = false, owner: Client | undefined, db: Pool | undefined, publicDb: Pool | undefined
try {
  const server = net.createServer()
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  await command("initdb", ["-D", cluster, "-U", "admin_rehearsal", "-A", "trust", "--no-locale", "-E", "UTF8"])
  await command("pg_ctl", ["-D", cluster, "-l", path.join(cluster, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"])
  started = true
  const config = { host: "127.0.0.1", port, user: "admin_rehearsal", database: "postgres", ssl: false as const }
  owner = new Client(config); await owner.connect()
  const proof = (await owner.query("SELECT current_setting('data_directory') dir,current_setting('server_version') version")).rows[0]
  assert.equal(path.resolve(proof.dir).toLowerCase(), cluster.toLowerCase()); assert.match(proof.version, /^17\./)
  await owner.query('CREATE TABLE "Player" (id text PRIMARY KEY,"externalId" text UNIQUE,name text,slug text)')
  await owner.query('INSERT INTO "Player" VALUES ($1,$2,$3,$4)', ["test-mbappe", "231747", "Kylian Mbappé", "kylian-mbappe"])
  await owner.query(fs.readFileSync("prisma/migrations/20261106000000_manual_economic_admin/migration.sql", "utf8"))
  await owner.query(fs.readFileSync("prisma/admin-economic-role.candidate.sql", "utf8"))
  await owner.query("CREATE ROLE admin_test_login LOGIN; GRANT futscout_admin_economic TO admin_test_login")
  await owner.query('CREATE ROLE public_test_login LOGIN; GRANT USAGE ON SCHEMA public TO public_test_login; GRANT SELECT ON "Player","AdminEconomicPublic" TO public_test_login')
  await owner.query("CREATE ROLE sync_test_login LOGIN; GRANT USAGE ON SCHEMA public TO sync_test_login; GRANT SELECT ON \"Player\" TO sync_test_login")
  db = new Pool({ ...config, user: "admin_test_login", max: 3 })
  publicDb = new Pool({ ...config, user: "public_test_login", max: 3 })
  const publicProbe = await publicDb.connect(), adminProbe = await db.connect()
  try {
    assert.deepEqual(await compareDatabaseSessions(publicProbe, adminProbe), { identity: "VERIFIED", code: "VERIFIED" })
    await owner.query("CREATE DATABASE identity_other")
    const otherDatabase = new Client({ ...config, database: "identity_other" })
    await otherDatabase.connect()
    try { await assert.rejects(compareDatabaseSessions(publicProbe, otherDatabase)) }
    finally { await otherDatabase.end() }
  } finally { publicProbe.release(); adminProbe.release() }
  const pool = db
  const readerPool = publicDb
  const salt = "b".repeat(32), password = "disposable owner password"
  const envBefore = { ...process.env }
  process.env.FUTSCOUT_ADMIN_DATABASE_URL = `postgresql://admin_test_login@127.0.0.1:${port}/postgres`
  process.env.FUTSCOUT_ADMIN_OWNER_LOGIN = "owner@test.invalid"
  process.env.FUTSCOUT_ADMIN_PASSWORD_HASH = salt + ":" + scryptSync(password, Buffer.from(salt, "hex"), 32).toString("hex")
  const authService = loadCatalogModule<{
    adminPool: () => Pool
    loginOwner: (request: Request, input: { owner: string; password: string }) => Promise<{ token: string; csrf: string } | null>
    ownerSession: (request: Request, mutation?: boolean) => Promise<{ owner: string; tokenHash: string } | null>
    revokeSession: (tokenHash: string) => Promise<void>
  }>("services/adminAuth.server.ts", { "server-only": {}, pg: { Pool: class { constructor() { return pool } } }, "../lib/adminAuth": auth }, { process, URL })
  process.env.FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC = "1"
  await assert.rejects(authService.loginOwner(new Request("https://futscout.test/admin/api/login"),
    { owner: "owner@test.invalid", password }), /ADMIN_DISABLED_DURING_IDENTITY_DIAGNOSTIC/)
  assert.equal(await authService.ownerSession(new Request("https://futscout.test/admin/api/players")), null)
  delete process.env.FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC
  process.env.DATABASE_URL = process.env.FUTSCOUT_ADMIN_DATABASE_URL!.replace("127.0.0.1", "localhost")
  assert.throws(() => authService.adminPool(), /ADMIN_CONNECTION_NOT_DEDICATED/)
  delete process.env.DATABASE_URL
  const request = new Request("https://futscout.test/admin/api/login", { headers: { "x-forwarded-for": "127.0.0.1" } })
  assert.equal(await authService.loginOwner(request, { owner: "other@test.invalid", password }), null)
  assert.equal(await authService.loginOwner(request, { owner: "owner@test.invalid", password: "incorrect password" }), null)
  const logged = await authService.loginOwner(request, { owner: "owner@test.invalid", password })
  assert(logged)
  const rateRequest = new Request("https://futscout.test/admin/api/login", { headers: { "x-forwarded-for": "127.0.0.2" } })
  for (let attempt = 0; attempt < 5; attempt++)
    assert.equal(await authService.loginOwner(rateRequest, { owner: "owner@test.invalid", password: "incorrect password" }), null)
  assert.equal(await authService.loginOwner(rateRequest, { owner: "owner@test.invalid", password }), null)
  const cookie = `fs_owner_session=${logged.token}; fs_owner_csrf=${logged.csrf}`
  const authorized = await authService.ownerSession(new Request("https://futscout.test/admin/api/players", {
    headers: { cookie, origin: "https://futscout.test", "x-csrf-token": logged.csrf } }), true)
  assert.equal(authorized?.owner, "owner@test.invalid")
  assert.equal(await authService.ownerSession(new Request("https://futscout.test/admin/api/players", {
    headers: { cookie, origin: "https://attacker.test", "x-csrf-token": logged.csrf } }), true), null)
  await authService.revokeSession(authorized!.tokenHash)
  assert.equal(await authService.ownerSession(new Request("https://futscout.test/admin/api/players", { headers: { cookie } })), null)
  process.env = envBefore
  const fakePrisma = { $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let sql = strings[0]
    for (let i = 0; i < values.length; i++) sql += "$" + (i + 1) + strings[i + 1]
    return (await readerPool.query(sql, values)).rows
  } }
  const service = loadCatalogModule<{
    saveManualEconomic: (input: { playerId: string; eaId: string; section: domain.ManualSection; payload?: unknown;
      rollbackTo?: string; expectedRevision: number; requestId: string; actor: string }) => Promise<{ revision: number }>
    readManualEconomics: (ids: string[]) => Promise<Map<string, { salary?: domain.SalaryPayload; contract?: domain.ContractPayload;
      clause?: domain.ClausePayload; revisions: Partial<Record<domain.ManualSection, number>> }>>
    manualWage: (id: string, value: unknown) => Parameters<typeof wagePresentation>[0]
  }>("services/adminEconomic.server.ts", {
    "server-only": {}, "node:crypto": crypto, "../lib/prisma": { prisma: fakePrisma },
    "../lib/adminEconomic": domain, "./adminAuth.server": { adminPool: () => pool },
  })
  const base = { playerId: "test-mbappe", eaId: "231747", actor: "owner" }
  const salaryInput = { ...base, section: "SALARY" as const, expectedRevision: 0, requestId: randomUUID(),
    payload: { weeklyEur: "123456.78", taxType: "GROSS", composition: "BASE" } }
  assert.equal((await service.saveManualEconomic(salaryInput)).revision, 1)
  const manual = (await service.readManualEconomics(["test-mbappe"])).get("test-mbappe")
  assert.equal(manual?.salary?.weeklyEur, "123456.78")
  assert.match(wagePresentation(service.manualWage("test-mbappe", manual), "test-mbappe", "pt")?.value ?? "", /123.457/)
  assert.equal((await service.saveManualEconomic({ ...base, section: "CONTRACT", expectedRevision: 0, requestId: randomUUID(),
    payload: { start: "2026-07-01", until: "2029-06-30", renewed: null } })).revision, 1)
  assert.equal((await service.saveManualEconomic({ ...base, section: "CLAUSE", expectedRevision: 0, requestId: randomUUID(),
    payload: { status: "YES", amount: "100000000", currency: "EUR", conditions: null, validUntil: "2029-06-30" } })).revision, 1)
  const publicValues = (await service.readManualEconomics(["test-mbappe"])).get("test-mbappe")
  assert.equal(publicValues?.contract?.until, "2029-06-30")
  assert.equal(publicValues?.clause?.amount, "100000000")
  const { default: Header } = loadCatalogModule<typeof import("../../app/components/PlayerHeader")>(
    "app/components/PlayerHeader.tsx", {
      "./PlayerImage": () => null, "./CountryFlag": () => null,
      "../../lib/playerProfilePositions": { getPlayerProfilePositions },
      "../../utils/formatCurrency": { formatCurrency },
      "../../utils/getOverallDifference": { getOverallDifference },
    })
  const publicPlayer = { ...mapDatabasePlayer(catalogPlayer()), id: "test-mbappe", name: "Kylian Mbappé" }
  const publicHtml = renderToStaticMarkup(createElement(Header, {
    player: publicPlayer, locale: "pt", wage: service.manualWage(publicPlayer.id, publicValues), manualEconomic: publicValues,
  }))
  assert.match(publicHtml, /123\.457/)
  assert.match(publicHtml, /30\/06\/2029/)
  assert.match(publicHtml, /100\.000\.000/)
  const { default: Card } = loadCatalogModule<typeof import("../../app/components/PlayerCard")>("app/components/PlayerCard.tsx", {
    "./PlayerActions": () => null, "../../utils/formatCurrency": { formatCurrency },
  })
  const cardHtml = renderToStaticMarkup(createElement(Card, { ...publicPlayer, club: null, locale: "pt",
    wage: service.manualWage(publicPlayer.id, publicValues) }))
  assert.match(cardHtml, /123\.457/)
  await assert.rejects(readerPool.query('UPDATE "AdminEconomicHead" SET revision=2'), /permission denied/)
  await assert.rejects(readerPool.query('SELECT actor FROM "AdminEconomicRevision"'), /permission denied/)
  await assert.rejects(service.saveManualEconomic({ ...salaryInput, requestId: randomUUID() }), /ADMIN_REVISION_CONFLICT/)
  assert.equal((await service.saveManualEconomic(salaryInput)).revision, 1)
  await assert.rejects(owner.query('UPDATE "AdminEconomicRevision" SET "actor"=$1', ["attacker"]), /IMMUTABLE/)
  await assert.rejects(owner.query('DELETE FROM "AdminEconomicRevision"'), /IMMUTABLE/)
  const sync = new Client({ ...config, user: "sync_test_login" }); await sync.connect()
  try { await assert.rejects(sync.query('UPDATE "AdminEconomicHead" SET revision=2'), /permission denied/) }
  finally { await sync.end() }
  const salaryId = (await db.query<{ id: string }>('SELECT id FROM "AdminEconomicRevision" WHERE "playerId"=$1 AND section=$2', ["test-mbappe", "SALARY"])).rows[0].id
  assert.equal((await service.saveManualEconomic({ ...base, section: "SALARY", expectedRevision: 1, requestId: randomUUID(),
    payload: { weeklyEur: "200000", taxType: "GROSS", composition: "BASE" } })).revision, 2)
  assert.equal((await service.saveManualEconomic({ ...base, section: "SALARY", expectedRevision: 2, requestId: randomUUID(),
    rollbackTo: salaryId })).revision, 3)
  assert.equal((await service.readManualEconomics(["test-mbappe"])).get("test-mbappe")?.salary?.weeklyEur, "123456.78")
  assert.equal((await db.query('SELECT id FROM "AdminEconomicRevision"')).rowCount, 5)
  console.log("PG17 ADMIN_ECONOMIC_PASS: Mbappé salary/contract/clause public read, precedence, CAS, restart read, rollback, immutable history, restricted sync role")
} finally {
  await publicDb?.end(); await db?.end(); await owner?.end()
  if (started) await command("pg_ctl", ["-D", cluster, "-m", "immediate", "-w", "stop"])
  assert(cluster.startsWith(root + path.sep))
  fs.rmSync(cluster, { recursive: true, force: true })
}
