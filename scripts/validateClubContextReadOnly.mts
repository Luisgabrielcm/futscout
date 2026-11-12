/** Negative writes are LOCAL ONLY. --pooled executes only existing-profile reads. */
import assert from "node:assert/strict"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../app/generated/prisma/client"
import { readOnlyPgAdapter } from "../lib/readOnlyPgAdapter"
import { clubContextReadEaIds, clubContextReadPilot } from "../lib/clubContextReadGate"

const folder = "audit/output/club-contexts-readonly-runtime"
await mkdir(folder, { recursive: true })
if (process.argv[2] === "--pooled") {
  const url = new URL(process.env.PILOT_READ_ONLY_POOLED_URL!)
  assert.equal(url.hostname, "pooled.db.prisma.io"); assert.equal(url.searchParams.has("options"), false)
  Object.assign(process.env, { DATABASE_URL: url.toString(), VERCEL_ENV: "preview", CLUB_CONTEXTS_PREVIEW_READ_ONLY: "1",
    CLUB_CONTEXTS_READ_ENABLED: "1", CLUB_CONTEXTS_READ_EA_IDS: clubContextReadEaIds.join(","),
    CLUB_CONTEXTS_READ_PILOT_HASH: clubContextReadPilot.manifestHash, CLUB_CONTEXTS_READ_PRODUCTION_ENABLED: "0" })
  const { prisma } = await import("../lib/prisma")
  try {
    const identity = await prisma.$queryRawUnsafe<{ cluster: string; oid: string; readonly: string }[]>(`SELECT (pg_control_system()).system_identifier::text AS cluster,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,current_setting('transaction_read_only') AS readonly`)
    assert.equal(identity[0].cluster, "7677620954387669023"); assert.equal(identity[0].oid, "5"); assert.equal(identity[0].readonly, "on")
    async function protectedState() {
      const result: Record<string, unknown> = {}
      result.players = await prisma.$queryRawUnsafe('SELECT id,md5(to_jsonb(p)::text) AS hash FROM "Player" p WHERE "externalId"=ANY($1::text[]) ORDER BY id', clubContextReadEaIds)
      const ids = (result.players as { id: string }[]).map(row => row.id)
      const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='playerId' AND table_name ~ '(Economic|Wage|Potential)' ORDER BY table_name`)
      for (const { table_name: table } of tables) {
        assert.match(table, /^[A-Za-z_][A-Za-z0-9_]*$/)
        result[table] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) h FROM "${table}" t WHERE "playerId"=ANY($1::text[])) x`, ids)
      }
      return result
    }
    const before = await protectedState()
    const { getPlayerBySlug } = await import("../services/playerService")
    const { getPlayerRealLifeBySlug } = await import("../services/playerRealLifeService")
    const players = await prisma.player.findMany({ where: { externalId: { in: clubContextReadEaIds } }, select: { externalId: true, slug: true } })
    assert.equal(players.length, 4)
    for (const player of players) {
      const game = await getPlayerBySlug(player.slug)
      const real = await getPlayerRealLifeBySlug(player.slug)
      assert.equal(game?.status, "ready")
      assert.equal(game?.status === "ready" && game.player.clubContexts?.game.status, "NG_FA")
      assert.equal(real?.clubContexts?.game.status, "NG_FA")
    }
    const other = await prisma.player.findFirstOrThrow({ where: { eaImportVisibility: "PUBLIC", externalId: { notIn: clubContextReadEaIds }, attributes: { isNot: null } }, select: { slug: true } })
    const game = await getPlayerBySlug(other.slug), real = await getPlayerRealLifeBySlug(other.slug)
    assert.equal(game?.status === "ready" && game.player.clubContexts !== undefined, false)
    assert.equal(real?.clubContexts, undefined)
    assert.deepEqual(await protectedState(), before)
    await writeFile(`${folder}/pooled.private.json`, JSON.stringify({ status: "POOLED_READ_ONLY_PROFILES_VALIDATED", identity: identity[0], profiles: 4, pagesPerProfile: 2, controlOutsideAllowlist: true, protectedHashesUnchanged: true, protectedTableCount: Object.keys(before).length, productionWrites: 0 }, null, 2))
    console.log("POOLED_READ_ONLY_PROFILES_VALIDATED: four EA/real profiles, auxiliary queries and legacy control; zero write attempts")
  } finally { await prisma.$disconnect() }
} else {
  assert.equal(process.env.CLUB_CONTEXT_READ_ONLY_LOCAL_TEST, "1", "LOCAL_OPT_IN_REQUIRED")
  const source = JSON.parse(await readFile("../club-contexts-readers-preview/audit/output/club-contexts-readers-preview/target.private.json", "utf8"))
  assert.match(source.database, /^clubctxreadpreview_\d+$/)
  const admin = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:54339/postgres", max: 1 })
  const cluster = (await admin.query("SELECT (pg_control_system()).system_identifier::text AS cluster")).rows[0].cluster
  assert.equal(cluster, "7707306283703531240"); assert.notEqual(cluster, "7677620954387669023")
  const database = `clubctxreadonly_${Date.now()}`
  await admin.query(`CREATE DATABASE "${database}" TEMPLATE "${source.database}"`); await admin.end()
  const url = `postgresql://postgres@127.0.0.1:54339/${database}`
  const fixture = new Pool({ connectionString: url, max: 1 })
  await fixture.query('CREATE TABLE "ReadOnlyProbe" (id integer PRIMARY KEY,value text); INSERT INTO "ReadOnlyProbe" VALUES (1,\'original\')')
  async function hashes() {
    const result: Record<string, unknown> = {}
    const tables = (await fixture.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows
    for (const { tablename: table } of tables) {
      assert.match(table, /^[A-Za-z_][A-Za-z0-9_]*$/)
      result[table] = (await fixture.query(`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) h FROM "${table}" t) x`)).rows[0]
    }
    return result
  }
  const before = await hashes()
  const db = new PrismaClient({ adapter: readOnlyPgAdapter(new PrismaPg({ connectionString: url, max: 2 })) })
  const rejection = (error: unknown) => /25006|read.only|read-only|CONTROL_SQL_DENIED/i.test(String(error) + JSON.stringify(error))
  const writes = ["INSERT INTO \"ReadOnlyProbe\" VALUES (2,'new')", "UPDATE \"ReadOnlyProbe\" SET value='changed' WHERE id=1", "DELETE FROM \"ReadOnlyProbe\" WHERE id=1"]
  try {
    for (const statement of writes) await assert.rejects(db.$executeRawUnsafe(statement), rejection)
    for (const statement of writes) await assert.rejects(db.$transaction(tx => tx.$executeRawUnsafe(statement)), rejection)
    await assert.rejects(db.player.updateMany({ where: { externalId: "218191" }, data: { name: "MUST_NOT_PERSIST" } }), rejection)
    await assert.rejects(db.$executeRawUnsafe("SET TRANSACTION READ WRITE"), /CONTROL_SQL_DENIED/)
    await assert.rejects(db.$queryRawUnsafe("SELECT 1; COMMIT; DELETE FROM \"ReadOnlyProbe\""), /CONTROL_SQL_DENIED/)
    await assert.rejects(db.$queryRawUnsafe("SELECT set_config('transaction_read_only','off',true)"), /CONTROL_SQL_DENIED/)
    // Independent PostgreSQL enforcement: each DML is rejected by SQLSTATE 25006.
    for (const statement of writes) {
      const c = await fixture.connect()
      try { await c.query("BEGIN READ ONLY"); await assert.rejects(c.query(statement), { code: "25006" }) }
      finally { await c.query("ROLLBACK"); c.release() }
    }
    const states = await Promise.all(Array.from({ length: 8 }, () => db.$queryRawUnsafe<{ readonly: string }[]>("SELECT current_setting('transaction_read_only') AS readonly")))
    assert.ok(states.every(rows => rows[0].readonly === "on"))
    await db.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe<{ readonly: string }[]>("SELECT current_setting('transaction_read_only') AS readonly")
      assert.equal(rows[0].readonly, "on")
      assert.equal(await tx.player.count(), 5)
    })
    const batch = await db.$transaction([
      db.$queryRawUnsafe<{ readonly: string }[]>("SELECT current_setting('transaction_read_only') AS readonly"),
      db.player.count(),
    ])
    assert.equal(batch[0][0].readonly, "on"); assert.equal(batch[1], 5)
    const profiles = await db.player.findMany({ where: { externalId: { in: clubContextReadEaIds } }, include: { attributes: true, club: { include: { league: true } }, realLifeStats: true, approvedCurrentClub: { include: { approvedClub: true } } } })
    assert.equal(profiles.length, 4)
    assert.equal(await db.playerClubContextSelection.count(), 4)
    assert.deepEqual(await hashes(), before)
    await writeFile(`${folder}/local.private.json`, JSON.stringify({ status: "LOCAL_READ_ONLY_RUNTIME_VALIDATED", database, negativeDml: ["INSERT", "UPDATE", "DELETE"], rootAndInteractiveTransactions: true, nativePostgres25006: true, concurrentTransactions: 8, allTableHashesUnchanged: true, productionConnections: 0 }, null, 2))
    console.log("LOCAL_READ_ONLY_RUNTIME_VALIDATED: DML denied, controls denied, concurrent reads, full profile relations and all hashes unchanged")
  } finally { await db.$disconnect(); await fixture.end() }
}
