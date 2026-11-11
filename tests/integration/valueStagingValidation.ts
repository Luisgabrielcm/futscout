// Opt-in native validation. Creates its own cluster; accepts no URL or dotenv.
// All catalogue imports use the existing economic writer/staging service.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { randomUUID, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import type { PrismaClient } from '../../app/generated/prisma/client'
import type { CoverageRecord } from '../../experiments/futscout-value-v01/coverage-contract'
import { economicFingerprint, normalizeAmount, type EconomicStateInput } from '../../lib/economicData/value'
import { canonicalEconomicDecimal } from '../../lib/economicData/decimal'
import { economicMarketValueReadSelect, readEconomicMarketValue } from '../../lib/economicData/read'
import { createPlayerEconomicWriter, type EconomicWrite } from '../../services/playerEconomicPersistence'
import { activationHash, stageValueActivation, type ValueActivationBundle } from '../../services/valueActivationPreparation'
import { frozenValueLexemes } from '../helpers/exactFrozenValue'
import { executeValueRelease, ValueReleaseJournal } from '../../services/valueReleaseExecution'
import { runValueRelease, type ValueReleaseTarget } from '../../scripts/runValueRelease'

type SourceState = EconomicStateInput & { id: string; contentHash: string }
type SourceObservation = { id: string; playerId: string; stateId: string; observedAt: string }
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')

async function main() {
  assert.equal(process.argv.length, 2, 'NATIVE_TEST_ACCEPTS_NO_CONNECTION_ARGUMENTS')
  const workspace = fs.realpathSync(process.cwd())
  assert.equal(workspace.toLowerCase(), fs.realpathSync(path.resolve(__dirname, '../..')).toLowerCase(), 'CHECKOUT_MISMATCH')
  const privateRoot = fs.realpathSync(path.join(workspace, 'audit/output'))
  const readPrivate = (file: string) => {
    const actual = fs.realpathSync(path.resolve(file)), rel = path.relative(privateRoot, actual)
    assert(rel && !rel.startsWith('..') && !path.isAbsolute(rel), 'PRIVATE_SOURCE_OUTSIDE_ROOT')
    return fs.readFileSync(actual)
  }
  const sourceManifest = JSON.parse(readPrivate('audit/output/value-final-activation-prep-01/output.manifest.private.json').toString())
  const coverageBytes = readPrivate('audit/output/value-benchmark-remediation-01/coverage.private.json')
  assert.equal(sha(coverageBytes), sourceManifest.sourceCoverageSha256)
  const coverage = JSON.parse(coverageBytes.toString()).rows as CoverageRecord[]
  const lexemes = frozenValueLexemes(coverageBytes.toString())
  assert.equal(coverage.length, 16228); assert.equal(lexemes.size, 16228)
  const expected = new Map(coverage.map(r => [r.playerId, canonicalEconomicDecimal(lexemes.get(r.playerId)!)]))
  const bundleBytes = readPrivate('audit/output/value-final-activation-prep-01/staging-bundle.private.json')
  assert.equal(sha(bundleBytes), sourceManifest.bundleHash)
  const bundle = JSON.parse(bundleBytes.toString()) as ValueActivationBundle
  assert.equal(bundle.sourceHash, sha(coverageBytes)); assert.equal(bundle.items.length, 12280)
  for (const item of bundle.items) assert.equal(canonicalEconomicDecimal(item.plan.state.amount!), expected.get(item.playerId), 'FROZEN_PLAN_DECIMAL_DIFFERS')
  const backupSource = coverage[0].provenance.economicsSource as { file: string; sha256: string }
  const backupBytes = readPrivate(backupSource.file)
  assert.equal(sha(backupBytes), backupSource.sha256); assert.equal(sha(backupBytes), sourceManifest.sourceBackupSha256)
  const backup = JSON.parse(backupBytes.toString()) as { tables: { PlayerEconomicState: string[]; PlayerEconomicObservation: string[] } }
  const sourceStates = new Map(backup.tables.PlayerEconomicState.map(s => { const r = JSON.parse(s) as SourceState; return [r.id, r] }))
  const sourceObservations = new Map(backup.tables.PlayerEconomicObservation.map(s => { const r = JSON.parse(s) as SourceObservation; return [r.id, r] }))
  const providers = coverage.filter(r => r.type === 'PROVIDER')
  assert.equal(providers.length, 3948)
  const providerPlans = providers.map(record => {
    const original = record.provenance.existingObservation as { observationId: string }
    const observation = sourceObservations.get(original.observationId)!
    assert(observation && observation.playerId === record.playerId)
    const s = sourceStates.get(observation.stateId)!
    assert(s && s.playerId === record.playerId && s.provider === 'LIVE_FOOTBALL')
    const state: EconomicStateInput = { playerId: s.playerId, field: s.field, provider: s.provider,
      providerPlayerId: s.providerPlayerId, context: s.context, snapshotVersion: s.snapshotVersion,
      presence: s.presence, amount: normalizeAmount(s.amount), currency: s.currency, period: s.period,
      contractUntil: s.contractUntil, datePrecision: s.datePrecision,
      providerEffectiveAt: s.providerEffectiveAt ? new Date(s.providerEffectiveAt).toISOString() : null,
      confidence: s.confidence, matchState: s.matchState, status: s.status, metadata: s.metadata }
    assert.equal(economicFingerprint(state), s.contentHash, 'PROVIDER_CONTENT_HASH_CHANGED')
    assert.equal(canonicalEconomicDecimal(state.amount!), expected.get(record.playerId), 'PROVIDER_DECIMAL_DIFFERS')
    const plan: EconomicWrite = { state, observedAt: new Date(observation.observedAt).toISOString(),
      requestId: `native-lf-${activationHash({ source: sha(backupBytes), observation: observation.id })}`,
      selectCurrent: false, expectedRevision: null, expectedEaId: record.eaId!,
      selectionReason: 'ISOLATED_PROVIDER_BASELINE', policyVersion: 'value-staging-validation-v1' }
    return { record, sourceObservationId: observation.id, plan }
  })
  const bin = 'C:/Program Files/PostgreSQL/14/bin'
  assert(fs.existsSync(path.join(bin, 'initdb.exe')), 'LOCAL_POSTGRESQL_BINARIES_MISSING')
  assert.match(fs.readFileSync('prisma/schema.prisma', 'utf8'), /amount Decimal\? @db\.Decimal\(38, 18\)/)
  const nonce = randomUUID().replaceAll('-', '').slice(0, 12)
  const runRoot = fs.mkdtempSync(path.join(privateRoot, 'value-staging-native-'))
  const cluster = path.join(runRoot, 'cluster'), marker = path.join(runRoot, 'owner.marker')
  fs.writeFileSync(marker, nonce, { flag: 'wx' })
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', NODE_OPTIONS: '', NEXT_TELEMETRY_DISABLED: '1',
    CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
    DATABASE_URL: 'postgresql://disabled@127.0.0.1:9/disabled', DIRECT_URL: 'postgresql://disabled@127.0.0.1:9/disabled' }
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'])
    if (process.env[key]) env[key] = process.env[key]
  env.Path = `${path.dirname(process.execPath)}${path.delimiter}${process.env.Path ?? process.env.PATH ?? ''}`
  const save = (name: string, value: unknown) => fs.writeFileSync(path.join(runRoot, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
  const command = async (executable: string, args: string[], name: string) => {
    const output = fs.openSync(path.join(runRoot, `${name}.log`), 'a')
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(executable, args, { cwd: workspace, env, windowsHide: true, stdio: ['ignore', output, output] })
        child.once('error', reject)
        child.once('exit', code => code === 0 ? resolve() : reject(Error(`${name}_EXIT_${code}`)))
      })
    } finally { fs.closeSync(output) }
  }
  const pg = (name: string, args: string[]) => command(path.join(bin, `${name}.exe`), args, name)
  const portServer = net.createServer()
  await new Promise<void>((resolve, reject) => { portServer.once('error', reject); portServer.listen(0, '127.0.0.1', resolve) })
  const port = (portServer.address() as net.AddressInfo).port
  await new Promise<void>(resolve => portServer.close(() => resolve()))
  const owner = `fs_owner_${nonce}`, writerRole = `fs_writer_${nonce}`, database = `fs_value_${nonce}`
  let started = false, rootDb: Client | undefined, db: Client | undefined, prisma: PrismaClient | undefined
  let summary: Record<string, unknown> | undefined, failure: unknown
  try {
    await pg('initdb', ['-D', cluster, '-U', owner, '-A', 'trust', '--no-locale', '-E', 'UTF8'])
    await pg('pg_ctl', ['-D', cluster, '-l', path.join(runRoot, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'])
    started = true
    rootDb = new Client({ host: '127.0.0.1', port, user: owner, database: 'postgres', ssl: false, connectionTimeoutMillis: 5000 })
    await rootDb.connect()
    const proofSql = `SELECT current_setting('data_directory') AS directory, inet_server_port() AS port,
      host(inet_server_addr()) AS address, current_user AS username, current_database() AS database,
      current_setting('server_version_num') AS version, (SELECT system_identifier::text FROM pg_control_system()) AS system_id,
      (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid`
    const first = (await rootDb.query(proofSql)).rows[0]
    assert.equal(fs.realpathSync(first.directory).toLowerCase(), fs.realpathSync(cluster).toLowerCase())
    assert.equal(first.port, port); assert.equal(first.address, '127.0.0.1'); assert.equal(first.username, owner)
    assert.match(first.version, /^14\d{4}$/)
    await rootDb.query(`CREATE DATABASE "${database}"`)
    db = new Client({ host: '127.0.0.1', port, user: owner, database, ssl: false, connectionTimeoutMillis: 5000 })
    await db.connect()
    const proof = (await db.query(proofSql)).rows[0]
    const verifyDestination = async () => {
      const actual = (await db!.query(proofSql)).rows[0]
      assert.equal(actual.system_id, first.system_id); assert.equal(actual.database, database)
      assert.equal(actual.username, owner); assert.equal(actual.port, port); assert.equal(actual.database_oid, proof.database_oid)
      assert.equal(fs.realpathSync(actual.directory).toLowerCase(), fs.realpathSync(cluster).toLowerCase())
    }
    await verifyDestination(); save('isolation-proof.private.json', { ...proof, host: '127.0.0.1', freshCluster: true, nonce })
    console.log('ISOLATED_CLUSTER_PROVED')
    await db.query('CREATE TABLE "Player" (id TEXT PRIMARY KEY, "externalId" TEXT UNIQUE NOT NULL)')
    await db.query(fs.readFileSync('prisma/migrations/20261006000000_player_economic_data_v1/migration.sql', 'utf8'))
    await db.query('INSERT INTO "Player"(id,"externalId") VALUES ($1,$2)', [coverage[0].playerId, coverage[0].eaId])
    // Exercise the shared column in its OLD type before applying the migration.
    const sharedCases = [
      { id: 'native-wage', field: 'WAGE_WEEKLY', amount: '12345.67', period: 'WEEK' },
      { id: 'native-clause', field: 'RELEASE_CLAUSE', amount: '999999999999999999.99', period: null },
      { id: 'native-null-wage', field: 'WAGE_WEEKLY', amount: null, period: null },
      { id: 'native-null-clause', field: 'RELEASE_CLAUSE', amount: null, period: null },
    ]
    for (const sample of sharedCases) await db.query(`INSERT INTO "PlayerEconomicState"
      (id,"playerId",field,provider,"providerPlayerId",context,"snapshotVersion",presence,amount,currency,period,confidence,"matchState",status,metadata,"contentHash")
      VALUES ($1,$2,$3,'NATIVE_TEST','fixture','REAL_WORLD','native-shared-amount-v1',$4,$5,'EUR',$6,'HIGH','MATCHED',$7,'{}',$8)`,
    [sample.id, coverage[0].playerId, sample.field, sample.amount === null ? 'NULL' : 'VALUE', sample.amount, sample.period,
      sample.amount === null ? 'MISSING' : 'VALID', sha(sample.id)])
    const sharedReadBack = async () => (await db!.query(`SELECT id,amount::text AS amount,(to_jsonb(s)-'amount') AS other
      FROM "PlayerEconomicState" s WHERE "snapshotVersion"='native-shared-amount-v1' ORDER BY id`)).rows
      .map(r => ({ ...r, amount: r.amount === null ? null : canonicalEconomicDecimal(r.amount) }))
    const sharedBefore = await sharedReadBack()
    await verifyDestination()
    const candidate = fs.readFileSync('prisma/migrations/20261020000000_economic_amount_precision_38_18/migration.sql')
    await db.query(candidate.toString())
    assert.deepEqual(await sharedReadBack(), sharedBefore, 'SHARED_ECONOMIC_FIELDS_CHANGED')
    const precision = (await db.query(`SELECT numeric_precision::int AS precision,numeric_scale::int AS scale
      FROM information_schema.columns WHERE table_schema='public' AND table_name='PlayerEconomicState' AND column_name='amount'`)).rows[0]
    assert.deepEqual(precision, { precision: 38, scale: 18 })
    await command(process.execPath, ['node_modules/prisma/build/index.js', 'validate', '--config', 'tests/integration/valueStagingPrisma.config.ts'], 'prisma-validate')
    await command(process.execPath, ['node_modules/prisma/build/index.js', 'generate', '--config', 'tests/integration/valueStagingPrisma.config.ts'], 'prisma-generate')
    const { PrismaClient: NativePrismaClient } = await import('../../app/generated/prisma/client')
    for (let start = 0; start < coverage.length; start += 1000) {
      const slice = coverage.slice(start, start + 1000)
      await db.query('INSERT INTO "Player"(id,"externalId") SELECT * FROM unnest($1::text[],$2::text[]) ON CONFLICT (id) DO NOTHING',
        [slice.map(r => r.playerId), slice.map(r => r.eaId)])
    }
    await db.query(`CREATE ROLE "${writerRole}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO "${writerRole}";
      GRANT SELECT ON "Player","PlayerEconomicState","PlayerEconomicObservation","PlayerEconomicCurrent" TO "${writerRole}";
      GRANT INSERT ON "PlayerEconomicState","PlayerEconomicObservation" TO "${writerRole}"`)
    prisma = new NativePrismaClient({ adapter: new PrismaPg({ host: '127.0.0.1', port, user: writerRole, database,
      ssl: false, max: 3, connectionTimeoutMillis: 5000 }) })
    const writerProof = await prisma.$queryRawUnsafe<{ username: string; database: string; port: number; database_oid: string; current_write: boolean }[]>(
      `SELECT current_user AS username,current_database() AS database,inet_server_port() AS port,
      (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,
      has_table_privilege(current_user,'"PlayerEconomicCurrent"','INSERT,UPDATE,DELETE') AS current_write`)
    assert.equal(writerProof[0].username, writerRole); assert.equal(writerProof[0].database, database)
    assert.equal(writerProof[0].port, port); assert.equal(writerProof[0].database_oid, proof.database_oid)
    assert.equal(writerProof[0].current_write, false)
    const grants = [{ provider: 'LIVE_FOOTBALL', context: 'REAL_WORLD' as const, field: 'MARKET_VALUE' as const, evidenceRef: 'native-isolated-backup-only' },
      { provider: 'FUTSCOUT_VALUE', context: 'REAL_WORLD' as const, field: 'MARKET_VALUE' as const, evidenceRef: 'native-private-staging-not-a-license' }]
    const write = createPlayerEconomicWriter(prisma, grants, { idempotentStaging: true })
    const providerReceipts = []
    for (const item of providerPlans) providerReceipts.push(await write(item.plan))
    // Restore ONLY the supplier baseline in the private fixture, using its own
    // administrator. The writer role cannot select Current; no estimates selected.
    for (let start = 0; start < providerPlans.length; start += 500) {
      const plans = providerPlans.slice(start, start + 500), receipts = providerReceipts.slice(start, start + 500)
      await db.query(`INSERT INTO "PlayerEconomicCurrent"("playerId",field,"observationId",revision,"selectedAt","selectionReason","policyVersion")
        SELECT p,'MARKET_VALUE',o,1,t::timestamptz,'ISOLATED_BACKUP_BASELINE','value-publication-decision-v1'
        FROM unnest($1::text[],$2::text[],$3::text[]) AS x(p,o,t)`,
      [plans.map(r => r.record.playerId), receipts.map(r => r.observationId), plans.map(r => r.plan.observedAt)])
    }
    const snapshotCurrents = async () => activationHash((await db!.query('SELECT * FROM "PlayerEconomicCurrent" ORDER BY "playerId",field')).rows)
    const baseline = await snapshotCurrents()
    const counts = async () => (await db!.query(`SELECT
      (SELECT count(*)::int FROM "PlayerEconomicState" WHERE "snapshotVersion"<>'native-shared-amount-v1') AS states,
      (SELECT count(*)::int FROM "PlayerEconomicObservation") AS observations,
      (SELECT count(*)::int FROM "PlayerEconomicCurrent") AS currents`)).rows[0]
    assert.deepEqual(await counts(), { states: 3948, observations: 3948, currents: 3948 })
    // Force a genuine SQL failure after State insertion, then verify atomic undo.
    await db.query(`CREATE FUNCTION native_fail_observation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."requestId" LIKE 'native-fail-%' THEN RAISE EXCEPTION 'NATIVE_INJECTED_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER native_fail_observation BEFORE INSERT ON "PlayerEconomicObservation" FOR EACH ROW EXECUTE FUNCTION native_fail_observation()`)
    await assert.rejects(write({ ...bundle.items[0].plan, requestId: `native-fail-${bundle.items[0].recordHash}` }), /NATIVE_INJECTED_FAILURE/)
    assert.deepEqual(await counts(), { states: 3948, observations: 3948, currents: 3948 })
    await db.query('DROP TRIGGER native_fail_observation ON "PlayerEconomicObservation"; DROP FUNCTION native_fail_observation()')
    await assert.rejects(stageValueActivation(bundle, prisma, grants, precision, async () => { throw Error('NATIVE_CHECKPOINT_FAILURE') }), /NATIVE_CHECKPOINT_FAILURE/)
    assert.deepEqual(await counts(), { states: 3949, observations: 3949, currents: 3948 })
    const identity = { host: '127.0.0.1', port, database, username: writerRole,
      databaseOid: proof.database_oid, serverVersionNum: proof.version }
    const evidence = { resourceRef: `disposable/${nonce}`, environment: 'DISPOSABLE', expected: identity,
      verificationMethod: 'FRESH_OWNED_CLUSTER_REALPATH_SYSTEM_IDENTIFIER_AND_DATABASE_OID', systemId: proof.system_id }
    save('resource-binding.private.json', evidence)
    const target: ValueReleaseTarget = { version: 'value-release-target-v1', environment: 'DISPOSABLE', resourceRef: evidence.resourceRef,
      expected: identity, connectionEnv: 'FUTSCOUT_NATIVE_RELEASE_WRITER', identityEvidence: {
        file: path.join(runRoot, 'resource-binding.private.json'), sha256: sha(fs.readFileSync(path.join(runRoot, 'resource-binding.private.json'))) } }
    save('target.private.json', target)
    const journalFile = path.join(runRoot, 'release.journal.private.ndjson')
    const releaseOptions = { bundle, bundleSha256: sha(bundleBytes), targetHash: activationHash(target), journalFile,
      client: prisma, grants, providerBaseline: providerPlans.map(p => ({ playerId: p.record.playerId, eaId: p.record.eaId!, amount: p.plan.state.amount! })) }
    const args = ['--target', path.join(runRoot, 'target.private.json'), '--bundle',
      'audit/output/value-final-activation-prep-01/staging-bundle.private.json', '--bundle-sha256', sha(bundleBytes),
      '--coverage', 'audit/output/value-benchmark-remediation-01/coverage.private.json', '--journal', journalFile]
    process.env.FUTSCOUT_NATIVE_RELEASE_WRITER = `postgresql://${writerRole}@127.0.0.1:${port}/${database}`
    await runValueRelease(['preflight', ...args])
    await db.query('SELECT pg_advisory_lock(17002026,72001)')
    try { await assert.rejects(runValueRelease(['import', ...args]), /CONCURRENT_EXECUTOR/) }
    finally { await db.query('SELECT pg_advisory_unlock(17002026,72001)') }
    await assert.rejects(executeValueRelease({ ...releaseOptions, mode: 'import', afterCommitBeforeJournal: async () => { throw Error('COMMIT_BEFORE_JOURNAL_INTERRUPTION') } }), /COMMIT_BEFORE_JOURNAL_INTERRUPTION/)
    assert.equal(new ValueReleaseJournal(journalFile).state().pending, 0)
    await assert.rejects(runValueRelease(['import', ...args]), /PENDING_REQUIRES_RECONCILIATION/)
    await runValueRelease(['reconcile', ...args])
    const unresolvedFile = path.join(runRoot, 'unresolved.journal.private.ndjson')
    fs.copyFileSync(journalFile, unresolvedFile, fs.constants.COPYFILE_EXCL)
    new ValueReleaseJournal(unresolvedFile).append({ kind: 'PENDING', index: 1 })
    await assert.rejects(runValueRelease(['reconcile', ...args.slice(0, -1), unresolvedFile]), /PENDING_WRITE_NOT_FOUND_CONFIRM_TERMINATION/)
    await runValueRelease(['import', ...args])
    const receipt = { batchHash: bundle.batchHash, status: 'STAGED' as const, rows: new ValueReleaseJournal(journalFile).state().rows }
    console.log('OPERATIONAL_IMPORT_COMPLETED_12280')
    assert.deepEqual(await counts(), { states: 16228, observations: 16228, currents: 3948 })
    const exactReadBack = async () => {
      const rows = (await db!.query(`SELECT s."playerId",s.provider,s.amount::text AS amount,s."contentHash",o."requestId",s.metadata
        FROM "PlayerEconomicObservation" o JOIN "PlayerEconomicState" s ON s.id=o."stateId" ORDER BY s."playerId"`)).rows
      assert.equal(rows.length, 16228)
      for (const row of rows) {
        assert.equal(canonicalEconomicDecimal(row.amount), expected.get(row.playerId), 'NATIVE_EXACT_DECIMAL_MISMATCH')
        if (row.provider === 'FUTSCOUT_VALUE') {
          assert.equal(row.metadata.estimate.commercialRights, 'UNKNOWN'); assert.equal(row.metadata.estimate.qualityApproved, false)
        }
      }
      return activationHash(rows)
    }
    const firstReadBack = await exactReadBack()
    assert.equal(await snapshotCurrents(), baseline)
    console.log('FIRST_PASS_EXACT_16228')
    for (let i = 0; i < providerPlans.length; i++) assert.deepEqual(await write(providerPlans[i].plan),
      { ...providerReceipts[i], current: await prisma.playerEconomicCurrent.findUnique({ where: { playerId_field: { playerId: providerPlans[i].record.playerId, field: 'MARKET_VALUE' } } }) })
    await runValueRelease(['import', ...args])
    const second = { batchHash: bundle.batchHash, status: 'STAGED' as const, rows: new ValueReleaseJournal(journalFile).state().rows }
    assert.deepEqual(second, receipt); assert.deepEqual(await counts(), { states: 16228, observations: 16228, currents: 3948 })
    assert.equal(await exactReadBack(), firstReadBack)
    const readerRows = await prisma.player.findMany({ select: { id: true, externalId: true, economicCurrents: economicMarketValueReadSelect } })
    let displayed = 0
    for (const player of readerRows) {
      const read = readEconomicMarketValue(player)
      if (read.marketValue !== null) { displayed++; assert.equal(read.economicMarketValue?.provider, 'LIVE_FOOTBALL') }
    }
    assert.equal(displayed, 3946)
    await assert.rejects(createPlayerEconomicWriter(prisma, grants)({ ...bundle.items[0].plan, selectCurrent: true }), /PUBLICATION/)
    await assert.rejects(prisma.$executeRawUnsafe('DELETE FROM "PlayerEconomicCurrent"'), /permission denied/)
    // Admin-only, rollback-only negative test: even a forced local Current cannot
    // make the real reader publish this experimental provider.
    await db.query('BEGIN')
    try {
      await db.query(`INSERT INTO "PlayerEconomicCurrent" VALUES ($1,'MARKET_VALUE',$2,1,now(),'ISOLATED_GATE_TEST','value-publication-decision-v1')`,
        [receipt.rows[0].playerId, receipt.rows[0].observationId])
      const raw = await db.query(`SELECT o."observedAt",s.* FROM "PlayerEconomicCurrent" c JOIN "PlayerEconomicObservation" o ON o.id=c."observationId"
        JOIN "PlayerEconomicState" s ON s.id=o."stateId" WHERE c."playerId"=$1`, [receipt.rows[0].playerId])
      const r = raw.rows[0], identity = coverage.find(p => p.playerId === r.playerId)!
      assert.equal(readEconomicMarketValue({ id: identity.playerId, externalId: identity.eaId, economicCurrents: [{ observation: {
        observedAt: r.observedAt, state: r,
      } }] as Parameters<typeof readEconomicMarketValue>[0]['economicCurrents'] }).marketValue, null)
    } finally { await db.query('ROLLBACK') }
    assert.equal(await snapshotCurrents(), baseline)
    const withdrawal = await runValueRelease(['withdraw', ...args])
    assert.deepEqual(await runValueRelease(['withdraw', ...args]), withdrawal)
    await assert.rejects(runValueRelease(['import', ...args]), /WITHDRAWN/)
    assert.equal(await snapshotCurrents(), baseline); assert.equal(await exactReadBack(), firstReadBack)
    await verifyDestination(); await db.query(candidate.toString())
    assert.deepEqual(await sharedReadBack(), sharedBefore)
    assert.equal(await exactReadBack(), firstReadBack, 'CANDIDATE_REAPPLY_CHANGED_DATA')
    save('staging-receipt.private.json', receipt); save('withdrawal.private.json', withdrawal)
    save('sources.manifest.private.json', { coverageSha256: sha(coverageBytes), bundleSha256: sha(bundleBytes), backupSha256: sha(backupBytes),
      candidateSha256: sha(candidate), schemaSha256: sha(fs.readFileSync('prisma/schema.prisma')), decimalReadBackHash: firstReadBack })
    summary = { status: 'VALUE_STAGING_VALIDATION_READY', database: 'FRESH_NATIVE_POSTGRESQL_14_LOOPBACK',
      persistedValues: 16228, providerValues: 3948, ownEstimates: 12280, exactDecimalMatches: 16228,
      numberUsedForDecimalComparison: false, secondRunIdempotent: true, duplicateStates: 0, duplicateObservations: 0,
      currentPointersChangedByBatch: 0, displayed, retained: 12282, rollback: 'WITHDRAWN_HISTORY_PRESERVED',
      transactionRollbackProved: true, checkpointFailureResumeProved: true, writerCannotModifyCurrent: true,
      experimentalReaderGateProved: true, candidateReapplicationPreservedData: true, precision,
      prismaRegenerated: true, prismaValidated: true, rights: 'UNKNOWN', publicationApprovalsChanged: false,
      versionedMigrationValidated: true, sharedEconomicCasesPreserved: sharedCases.length, operationalCliValidated: true,
      durableCheckpointAndExplicitReconciliation: true, logicalWithdrawalBlocksReimport: true,
      productionAccess: 0, apiCalls: 0, outputDirectory: runRoot }
  } catch (error) {
    failure = error
    save('failure.private.json', { name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : 'NATIVE_VALIDATION_FAILED' })
  } finally {
    delete process.env.FUTSCOUT_NATIVE_RELEASE_WRITER
    await prisma?.$disconnect(); await db?.end(); await rootDb?.end()
    if (started || fs.existsSync(path.join(cluster, 'postmaster.pid'))) await pg('pg_ctl', ['-D', cluster, '-m', 'fast', '-w', '-t', '20', 'stop'])
    if (fs.existsSync(cluster)) {
      // The only recursive deletion: prove ownership, exact parent and real path.
      assert.equal(fs.readFileSync(marker, 'utf8'), nonce)
      assert.equal(path.dirname(fs.realpathSync(cluster)).toLowerCase(), fs.realpathSync(runRoot).toLowerCase())
      assert.equal(path.basename(fs.realpathSync(cluster)), 'cluster')
      assert(!fs.existsSync(path.join(cluster, 'postmaster.pid')), 'OWNED_CLUSTER_STILL_RUNNING')
      fs.rmSync(cluster, { recursive: true })
    }
    save('cleanup.private.json', { ownClusterStopped: true, ownClusterRemoved: !fs.existsSync(cluster), originalSourcesUntouched: true })
  }
  if (failure) throw failure
  save('summary.aggregate.json', { ...summary, disposableClusterRemoved: true })
  console.log(JSON.stringify({ ...summary, disposableClusterRemoved: true }, null, 2))
}
main().catch(error => { console.error('VALUE_STAGING_VALIDATION_BLOCKED', error instanceof Error ? error.message : 'NATIVE_FAILURE'); process.exitCode = 1 })
