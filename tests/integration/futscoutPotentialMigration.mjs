/* Optional integration, not discovered by the ordinary *.test.ts unit suite.
 * Real PostgreSQL WASM (PGlite), fresh in-memory instance; never accepts a URL.
 * Run: node tests/integration/futscoutPotentialMigration.mjs
 * No dotenv, Prisma application client, network provider or model calculation.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
const { Client } = pg;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaBase = process.argv.includes('--schema-base');
assert(process.argv.slice(2).every(arg => arg === '--schema-base'), 'Only --schema-base is supported; no database targets accepted');
const migration = '20260929120000_futscout_potential_estimates';
const tables = ['FutscoutPotentialModel', 'PlayerFutscoutPotentialEstimate', 'PlayerFutscoutPotentialCurrent'];
const report = { runId: randomUUID(), baseStrategy: schemaBase ? 'expected-schema-before-potential' : 'historical-migrations', productionAccess: false, storage: 'memory', tests: [], migrations: [], commands: [] };
const out = path.join(root, 'audit/output/potential-persistence-validation-20260929', report.runId);
const hash = data => createHash('sha256').update(data).digest('hex');
const schemaPath = path.join(root, 'prisma/schema.prisma');
const migrationPath = path.join(root, 'prisma/migrations', migration, 'migration.sql');
const immutable = [schemaPath, migrationPath];
const before = immutable.map(file => ({ file: path.relative(root, file), hash: hash(fs.readFileSync(file)) }));
fs.mkdirSync(out, { recursive: true });

// Whitelist process essentials; neither application credentials nor dotenv are inherited.
function cleanEnv() {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.CHECKPOINT_DISABLE = '1';
  return env;
}
function prisma(args, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), ...args], {
      cwd: root, env: { ...cleanEnv(), FUTSCOUT_DISPOSABLE_URL: url }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill(), 60000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const result = { args, code, signal, stdout, stderr };
      report.commands.push(result);
      resolve(result);
    });
  });
}

async function main() {
  // No path/options: this constructor cannot select an existing persistent database.
  const db = new PGlite();
  let server;
  let inTransaction = false;
  try {
    await db.waitReady;
    report.engine = (await db.query('SELECT version() AS version')).rows[0].version;
    const empty = await db.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')");
    assert.equal(empty.rows[0].n, 0);
    // Isolated schema marker proves the socket and direct execution address this instance.
    await db.exec('CREATE SCHEMA disposable_proof; CREATE TABLE disposable_proof.marker (id text PRIMARY KEY)');
    await db.query('INSERT INTO disposable_proof.marker VALUES ($1)', [report.runId]);
    server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, inspect: false, debug: false });
    await server.start();
    const conn = `postgresql://postgres@${server.getServerConn()}/postgres?sslmode=disable`;
    const url = new URL(conn);
    assert.equal(url.hostname, '127.0.0.1');
    const probe = new Client({ connectionString: conn, connectionTimeoutMillis: 5000 });
    try {
      await probe.connect();
      assert.equal((await probe.query('SELECT id FROM disposable_proof.marker')).rows[0].id, report.runId);
    } finally { await probe.end(); }
    report.targetProof = { constructor: 'new PGlite() without path', emptyPublicTables: 0, loopback: url.hostname, markerMatched: true };
    console.log(JSON.stringify({ preMigrationTargetProof: report.targetProof, engine: report.engine }));

    const config = path.join(out, 'disposable.config.ts');
    // Only this child-process variable, no fallback to DATABASE_URL / DIRECT_URL.
    fs.writeFileSync(config, `import { defineConfig } from 'prisma/config';\nconst url = process.env.FUTSCOUT_DISPOSABLE_URL;\nif (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).port !== '${url.port}') throw new Error('DISPOSABLE_TARGET_REQUIRED');\nexport default defineConfig({ schema: ${JSON.stringify(schemaPath)}, datasource: {url} });\n`);
    const cliConfig = ['--config', config];
    const positiveControl = await prisma(['migrate', 'diff', '--from-empty', '--to-schema', schemaPath, '--script', '--exit-code', ...cliConfig], conn);
    assert.equal(positiveControl.code, 2, 'Nonempty schema diff must exit 2, not silently 0');
    assert.match(positiveControl.stdout, /CREATE TABLE "PlayerFutscoutPotentialEstimate"/);
    fs.writeFileSync(path.join(out, 'expected-from-empty.sql'), positiveControl.stdout);

    // Remove ONLY the new isolated models and inverse relations to establish the
    // expected pre-migration schema; do not repair historical migrations.
    let base = fs.readFileSync(schemaPath, 'utf8');
    for (const name of [...tables, 'FutscoutPotentialEstimateStatus']) {
      const block = new RegExp(`(?:model|enum) ${name} \\{[^}]*\\}`, 'g');
      assert.equal([...base.matchAll(block)].length, 1);
      base = base.replace(block, '');
    }
    base = base.replace(/^.*futscoutPotentialEstimates PlayerFutscoutPotentialEstimate\[\].*\r?\n/m,'')
      .replace(/^.*currentFutscoutPotential\s+PlayerFutscoutPotentialCurrent\?.*\r?\n/m,'');
    const basePath=path.join(out,'before.prisma');
    fs.writeFileSync(basePath,base);
    report.baseSchemaHash=hash(base);

    // Replay the checked-in migration chain on an empty isolated instance, no DML source data.
    const dirs = fs.readdirSync(path.join(root, 'prisma/migrations')).filter(name => /^\d/.test(name)).sort();
    assert.equal(dirs.at(-1), migration, 'Unexpected later migration; review before applying');
    let baselineDrift;
    if (schemaBase) {
      const baseDDL=await prisma(['migrate','diff','--from-empty','--to-schema',basePath,'--script','--exit-code',...cliConfig],conn);
      assert.equal(baseDDL.code,2);
      assert.match(baseDDL.stdout,/CREATE TABLE "Player"/);
      assert(!baseDDL.stdout.includes('CREATE TABLE "FutscoutPotentialModel"'));
      fs.writeFileSync(path.join(out,'base.sql'),baseDDL.stdout);
      await db.exec(baseDDL.stdout);
    }
    for (const name of dirs.filter(name => !schemaBase || name===migration)) {
      if (name===migration) {
        baselineDrift=await prisma(['migrate','diff','--from-config-datasource','--to-schema',basePath,'--script','--exit-code',...cliConfig],conn);
        assert([0,2].includes(baselineDrift.code));
        assert(baselineDrift.stdout.trim().length>0);
        fs.writeFileSync(path.join(out,'baseline-drift.sql'),baselineDrift.stdout);
        if(schemaBase) { assert.equal(baselineDrift.code,0); assert.match(baselineDrift.stdout,/empty migration/i); }
      }
      const sql = fs.readFileSync(path.join(root, 'prisma/migrations', name, 'migration.sql'), 'utf8');
      await db.exec(sql);
      report.migrations.push({ name, sha256: hash(sql) });
    }
    report.migrationApplied = true;
    report.catalog = {};
    report.catalog.columns = (await db.query(`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default,datetime_precision FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1) ORDER BY table_name,ordinal_position`, [tables])).rows;
    report.catalog.constraints = (await db.query(`SELECT c.conname,c.contype,c.conrelid::regclass::text AS relation,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=ANY($1) ORDER BY c.conname`, [tables])).rows;
    report.catalog.indexes = (await db.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1) ORDER BY indexname`, [tables])).rows;
    report.catalog.triggers = (await db.query(`SELECT t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname=ANY($1) AND NOT t.tgisinternal ORDER BY t.tgname`, [tables])).rows;
    assert.equal(report.catalog.columns.length, 28); // 4 model + 18 estimate + 6 current
    assert.equal(report.catalog.constraints.filter(c => c.contype === 'p').length, 3);
    assert.equal(report.catalog.constraints.filter(c => c.contype === 'f').length, 4);
    assert.equal(report.catalog.constraints.filter(c => c.contype === 'c').length, 5);
    assert.equal(report.catalog.indexes.length, 9);
    assert.equal(report.catalog.triggers.length, 7);
    for (const name of ['futscout_potential_input_key','futscout_potential_identity_key','futscout_potential_player_history_idx','futscout_potential_filter_idx','futscout_potential_current_identity_key','PlayerFutscoutPotentialCurrent_estimateId_key']) {
      assert(report.catalog.indexes.some(index => index.indexname === name), name);
    }
    assert(report.catalog.constraints.filter(c => c.contype === 'f').every(c => /ON UPDATE RESTRICT ON DELETE RESTRICT/.test(c.definition)));

    await db.exec('BEGIN; SET LOCAL statement_timeout = \'5s\'');
    inTransaction = true;
    let serial = 0;
    async function test(name, action, expectedCode) {
      await db.exec('SAVEPOINT test_case');
      let error;
      try { await action(); } catch (e) { error = e; }
      await db.exec('ROLLBACK TO SAVEPOINT test_case; RELEASE SAVEPOINT test_case');
      if (expectedCode) assert.equal(error?.code, expectedCode, `${name}: ${error?.message ?? 'unexpectedly accepted'}`);
      else if (error) throw error;
      report.tests.push({ name, result: 'PASS', ...(expectedCode ? { rejectedWith: expectedCode } : {}) });
    }
    async function insert(table, data) {
      const keys = Object.keys(data);
      return db.query(`INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map((_,i) => '$'+(i+1)).join(',')})`, Object.values(data));
    }
    function estimate(override={}) {
      const id = `test-estimate-${++serial}`;
      return { id, playerId:'test-player-1', modelVersion:'test-model', inputHash:hash(id), inputSnapshot:JSON.stringify({age:23,overall:80,position:'MC'}), inputAge:23, inputOverall:80,inputPosition:'MC',referenceAt:'2026-09-29T00:00:00Z', provenance:JSON.stringify({kind:'FUTSCOUT_ESTIMATE'}),status:'EXPERIMENTAL',potentialRaw:85.5,potentialRounded:86,peakSeason:2,computedAt:'2026-09-29T00:00:00Z', ...override };
    }
    const selection = (override={}) => ({playerId:'test-player-1',estimateId:'valid-1',version:1,selectedAt:'2026-09-29T00:00:00Z',decisionRef:'synthetic-test',...override});
    for (let n=1;n<=3;n++) await insert('Player',{id:`test-player-${n}`,slug:`test-player-${n}`,name:'Synthetic integration fixture',position:'MC',officialOverall:80,updatedAt:'2026-09-29T00:00:00Z'});
    await test('valid registry',()=>insert(tables[0],{version:'valid-model',artifactHash:'a'.repeat(64),inputContractVersion:'test-v1'}));
    await insert(tables[0],{version:'test-model',artifactHash:'a'.repeat(64),inputContractVersion:'test-v1'});
    await insert(tables[1],estimate({id:'valid-1',inputHash:'b'.repeat(64)}));
    await insert(tables[1],estimate({id:'valid-2'}));
    await insert(tables[1],estimate({id:'invalid-1',status:'INVALID',inputAge:null,inputSnapshot:'{}',potentialRaw:null,potentialRounded:null,peakSeason:null,invalidReason:'MISSING_INPUT'}));
    await test('valid experimental',()=>insert(tables[1],estimate()));
    await test('valid INVALID missing input',()=>insert(tables[1],estimate({status:'INVALID',inputAge:null,inputSnapshot:'{}',potentialRaw:null,potentialRounded:null,peakSeason:null,invalidReason:'MISSING_INPUT'})));
    for(const [name,override,code] of [
      ['duplicate input',{inputHash:'b'.repeat(64)},'23505'],
      ['player FK',{playerId:'missing'},'23503'], ['model FK',{modelVersion:'missing'},'23503'],
      ['snapshot NULL',{inputSnapshot:null},'23502'], ['snapshot not object',{inputSnapshot:'[]'},'23514'],
      ['snapshot missing projection',{inputSnapshot:'{}'},'23514'], ['snapshot mismatched age',{inputAge:24},'23514'],
      ['snapshot mismatched overall',{inputOverall:81},'23514'], ['snapshot mismatched position',{inputPosition:'GOL'},'23514'],
      ['snapshot numeric string',{inputSnapshot:JSON.stringify({age:'23',overall:80,position:'MC'})},'23514'],
      ['provenance missing kind',{provenance:'{}'},'23514'], ['invalid hash',{inputHash:'bad'},'23514'],
      ['raw below domain',{potentialRaw:0,potentialRounded:0},'23514'], ['raw above domain',{potentialRaw:100,potentialRounded:100},'23514'],
      ['raw NaN',{potentialRaw:'NaN'},'23514'], ['raw infinity',{potentialRaw:'Infinity'},'23514'],
      ['rounding mismatch',{potentialRounded:85},'23514'], ['EXPERIMENTAL no result',{potentialRaw:null},'23514'],
      ['EXPERIMENTAL reason',{invalidReason:'reason'},'23514'], ['INVALID numbers',{status:'INVALID',invalidReason:'reason'},'23514'],
      ['INVALID missing reason',{status:'INVALID',potentialRaw:null,potentialRounded:null,peakSeason:null},'23514'],
      ['peak zero',{peakSeason:0},'23514'], ['peak eleven',{peakSeason:11},'23514'],
      ['age negative',{inputAge:-1},'23514'], ['unknown position',{inputPosition:'unknown'},'23514'],
    ]) await test(name,()=>insert(tables[1],estimate(override)),code);
    for(const raw of [1,85.499999999,85.5,99]) await test(`rounding accepted ${raw}`,()=>insert(tables[1],estimate({potentialRaw:raw,potentialRounded:Math.round(raw)})));
    await test('valid selection',()=>insert(tables[2],selection()));
    await test('cross-player selection',()=>insert(tables[2],selection({playerId:'test-player-2'})),'23514');
    await test('INVALID selection',()=>insert(tables[2],selection({estimateId:'invalid-1'})),'23514');
    await test('unknown selection',()=>insert(tables[2],selection({estimateId:'missing'})),'23514');
    await test('current player FK',()=>insert(tables[2],selection({playerId:'missing',estimateId:null})),'23503');
    await test('initial revision',()=>insert(tables[2],selection({version:2})),'23514');
    await test('empty decision',()=>insert(tables[2],selection({decisionRef:' '})),'23514');
    await insert(tables[2],selection());
    await test('CAS success + stale rejection + withdrawal',async()=>{
      const result=await db.query(`UPDATE "PlayerFutscoutPotentialCurrent" SET "estimateId"='valid-2',version=2 WHERE "playerId"='test-player-1' AND version=1 AND "estimateId"='valid-1' RETURNING version`);
      assert.equal(result.rows[0].version,2);
      const stale=await db.query(`UPDATE "PlayerFutscoutPotentialCurrent" SET "estimateId"=NULL,version=2 WHERE "playerId"='test-player-1' AND version=1 RETURNING version`);
      assert.equal(stale.rows.length,0);
      const withdrawal=await db.query(`UPDATE "PlayerFutscoutPotentialCurrent" SET "estimateId"=NULL,version=3 WHERE "playerId"='test-player-1' AND version=2 RETURNING version`);
      assert.equal(withdrawal.rows[0].version,3);
    });
    for(const [name,sql,code] of [
      ['revision jump',`UPDATE "PlayerFutscoutPotentialCurrent" SET "estimateId"='valid-2',version=3`,'23514'],
      ['same estimate touch',`UPDATE "PlayerFutscoutPotentialCurrent" SET version=2`,'23514'],
      ['current identity mutation',`UPDATE "PlayerFutscoutPotentialCurrent" SET "playerId"='test-player-2',"estimateId"=NULL,version=2`,'23514'],
      ['current createdAt mutation',`UPDATE "PlayerFutscoutPotentialCurrent" SET "createdAt"='2000-01-01',"estimateId"=NULL,version=2`,'23514'],
      ['model immutable update',`UPDATE "FutscoutPotentialModel" SET "artifactHash"=repeat('c',64)`,'23514'],
      ['model immutable delete',`DELETE FROM "FutscoutPotentialModel"`,'23514'],
      ['estimate immutable update',`UPDATE "PlayerFutscoutPotentialEstimate" SET "computedAt"=now()`,'23514'],
      ['estimate immutable delete',`DELETE FROM "PlayerFutscoutPotentialEstimate"`,'23514'],
      ['current immutable delete',`DELETE FROM "PlayerFutscoutPotentialCurrent"`,'23514'],
      ['model truncate',`TRUNCATE "FutscoutPotentialModel" CASCADE`,'23514'],
      ['estimate truncate',`TRUNCATE "PlayerFutscoutPotentialEstimate" CASCADE`,'23514'],
      ['current truncate',`TRUNCATE "PlayerFutscoutPotentialCurrent"`,'23514'],
      ['player delete restrict',`DELETE FROM "Player" WHERE id='test-player-1'`,'23503'],
      ['player ID update restrict',`UPDATE "Player" SET id='changed' WHERE id='test-player-1'`,'23503'],
    ]) await test(name,()=>db.exec(sql),code);
    // Independently exercise the composite FK with only its guard trigger disabled,
    // in a savepoint; other constraints stay enabled. Rollback restores the trigger.
    await test('composite FK independently rejects cross-player',async()=>{
      await db.exec('ALTER TABLE "PlayerFutscoutPotentialCurrent" DISABLE TRIGGER futscout_potential_current_validate');
      await insert(tables[2],selection({playerId:'test-player-2',estimateId:'valid-2'}));
    },'23503');
    await db.exec('ROLLBACK'); inTransaction=false;
    for(const table of ['Player',...tables]) assert.equal((await db.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n,0);
    report.testDataRolledBack=true;
    const drift=await prisma(['migrate','diff','--from-config-datasource','--to-schema',schemaPath,'--script','--exit-code',...cliConfig],conn);
    report.drift={code:drift.code,stdout:drift.stdout,stderr:drift.stderr};
    fs.writeFileSync(path.join(out,'drift.sql'),drift.stdout);
    assert.equal(drift.code,baselineDrift.code,'New schema drift introduced');
    assert.equal(drift.stdout,baselineDrift.stdout,'New schema drift introduced (see drift.sql)');
    report.drift.preexistingOnly=drift.code===2;
    if(schemaBase) {
      assert.equal(drift.code,0,'Schema drift (see drift.sql)');
      assert.match(drift.stdout,/empty migration/i,'Silent output is not proof of no drift');
    }
    report.status='PASS';
  } catch(e) {
    report.status='FAIL'; report.error={name:e.name,code:e.code,message:e.message};
    process.exitCode=1;
  } finally {
    if(inTransaction) { await db.exec('ROLLBACK'); report.testDataRolledBack=true; }
    if(server) await server.stop();
    await db.close();
    report.disposed=true;
    report.preserved=before.map(entry=>({...entry,unchanged:hash(fs.readFileSync(path.join(root,entry.file)))===entry.hash}));
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,tests:report.tests.length,error:report.error,disposed:report.disposed,artifact:out}));
    process.exitCode=report.status==='PASS'?0:1;
  }
}
main().catch(e=>{ console.error({name:e.name,code:e.code,message:e.message}); process.exitCode=1; });
