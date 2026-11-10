// Explicit operational entry point. Never imports dotenv or lib/prisma.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../app/generated/prisma/client'
import { activationHash, type ValueActivationBundle } from '../services/valueActivationPreparation'
import { executeValueRelease, type ReleaseMode } from '../services/valueReleaseExecution'
import { frozenValueLexemes } from '../lib/economicData/frozenDecimal'
import { canonicalEconomicDecimal } from '../lib/economicData/decimal'

export type ValueReleaseTarget = {
  version: 'value-release-target-v1'; environment: 'DISPOSABLE' | 'STAGING' | 'PRODUCTION'; resourceRef: string;
  connectionEnv: string; identityEvidence: { file: string; sha256: string };
  expected: { host: string; port: number; database: string; username: string; databaseOid: string; serverVersionNum: string }
}
function fail(code: string): never { throw Error(`RELEASE_${code}`) }
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function privateFile(file: string) {
  const root = fs.realpathSync('audit/output'), actual = fs.realpathSync(file), rel = path.relative(root, actual)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) fail('PRIVATE_FILE_REQUIRED')
  return fs.readFileSync(actual)
}
export function validateReleaseTarget(target: ValueReleaseTarget, authorization?: string) {
  if (target.version !== 'value-release-target-v1' || !['DISPOSABLE', 'STAGING', 'PRODUCTION'].includes(target.environment) ||
      !/^[a-zA-Z0-9._:/-]{1,160}$/.test(target.resourceRef) ||
      !/^[A-Z][A-Z0-9_]{1,80}$/.test(target.connectionEnv) || ['DATABASE_URL', 'DIRECT_URL'].includes(target.connectionEnv) ||
      !target.expected?.host || !target.expected.database || !target.expected.username ||
      !Number.isInteger(target.expected.port) || target.expected.port < 1 || target.expected.port > 65535 ||
      !/^\d+$/.test(target.expected.databaseOid) || !/^\d{6}$/.test(target.expected.serverVersionNum) ||
      !/^[a-f0-9]{64}$/.test(target.identityEvidence?.sha256)) fail('EXPLICIT_TARGET_REQUIRED')
  if (target.environment === 'PRODUCTION' && authorization !== target.resourceRef) fail('PRODUCTION_AUTHORIZATION_REQUIRED')
}

export async function runValueRelease(argv: string[]) {
  const [mode, ...rest] = argv
  if (!['preflight', 'import', 'reconcile', 'withdraw'].includes(mode) || rest.length % 2) fail('ARGUMENTS')
  const args = new Map<string, string>()
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--target', '--bundle', '--bundle-sha256', '--coverage', '--journal', '--authorize-production'].includes(rest[i]) || args.has(rest[i])) fail('ARGUMENTS')
    args.set(rest[i], rest[i + 1])
  }
  for (const key of ['--target', '--bundle', '--bundle-sha256', '--coverage', '--journal']) if (!args.get(key)) fail('ARGUMENTS')
  const target = JSON.parse(privateFile(args.get('--target')!).toString()) as ValueReleaseTarget
  validateReleaseTarget(target, args.get('--authorize-production'))
  const evidenceBytes = privateFile(target.identityEvidence.file)
  if (sha(evidenceBytes) !== target.identityEvidence.sha256) fail('RESOURCE_EVIDENCE_HASH')
  const evidence = JSON.parse(evidenceBytes.toString())
  // The evidence is a separately reviewed resource-to-database binding, not a
  // hostname inference or a declaration that provider licensing is confirmed.
  if (evidence.resourceRef !== target.resourceRef || evidence.environment !== target.environment ||
      activationHash(evidence.expected) !== activationHash(target.expected) || !evidence.verificationMethod) fail('RESOURCE_EVIDENCE_BINDING')
  const bytes = privateFile(args.get('--bundle')!)
  if (sha(bytes) !== args.get('--bundle-sha256')) fail('BUNDLE_FILE_HASH')
  const bundle = JSON.parse(bytes.toString()) as ValueActivationBundle
  const coverageBytes = privateFile(args.get('--coverage')!)
  if (sha(coverageBytes) !== bundle.sourceHash) fail('COVERAGE_HASH')
  const coverage = JSON.parse(coverageBytes.toString()).rows as { playerId: string; eaId: string; type: string }[]
  const lexemes = frozenValueLexemes(coverageBytes.toString())
  if (coverage.length !== 16228 || lexemes.size !== 16228) fail('COVERAGE_SCOPE')
  const frozenIdentities = new Map(coverage.map(p => [p.playerId, p.eaId]))
  if (bundle.items.some(i => frozenIdentities.get(i.playerId) !== i.eaId ||
      canonicalEconomicDecimal(i.plan.state.amount!) !== canonicalEconomicDecimal(lexemes.get(i.playerId)!))) fail('FROZEN_ESTIMATE_CHANGED')
  const providerBaseline = coverage.filter(p => p.type === 'PROVIDER').map(p => ({ playerId: p.playerId, eaId: p.eaId, amount: lexemes.get(p.playerId)! }))
  const journal = path.resolve(args.get('--journal')!), parent = fs.realpathSync(path.dirname(journal))
  const privateRoot = fs.realpathSync('audit/output'), relative = path.relative(privateRoot, parent)
  if (relative.startsWith('..') || path.isAbsolute(relative) || fs.existsSync(journal) && fs.lstatSync(journal).isSymbolicLink()) fail('PRIVATE_JOURNAL_REQUIRED')
  // Never use DATABASE_URL/DIRECT_URL, even if the selected credential is absent.
  const connectionString = process.env[target.connectionEnv]
  if (!connectionString) fail('SELECTED_CONNECTION_MISSING')
  const url = new URL(connectionString)
  if (url.searchParams.has('options') || url.searchParams.has('application_name')) fail('CONNECTION_OPTIONS')
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== target.expected.host ||
      Number(url.port || 5432) !== target.expected.port || decodeURIComponent(url.pathname.slice(1)) !== target.expected.database ||
      decodeURIComponent(url.username) !== target.expected.username) fail('CONNECTION_TARGET_MISMATCH')
  if (target.environment === 'DISPOSABLE') {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) fail('DISPOSABLE_LOOPBACK_REQUIRED')
  } else if (url.searchParams.get('sslmode') !== 'verify-full' || url.searchParams.has('sslaccept') ||
      url.searchParams.has('sslpassword')) fail('VERIFIED_TLS_REQUIRED')
  const config = { connectionString, connectionTimeoutMillis: 5000, application_name: `futscout-value-${bundle.batchHash.slice(0, 16)}`,
    options: mode === 'import' ? '' : '-c default_transaction_read_only=on' }
  const guard = new Client(config)
  let client: PrismaClient | undefined, locked = false, leaseLost = false
  guard.on('error', () => { leaseLost = true; void client?.$disconnect() })
  try {
    await guard.connect()
    const actual = (await guard.query(`SELECT current_database() AS database,current_user AS username,
      current_setting('server_version_num') AS version,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid`)).rows[0]
    if (actual.database !== target.expected.database || actual.username !== target.expected.username ||
        actual.oid !== target.expected.databaseOid || actual.version !== target.expected.serverVersionNum) fail('DATABASE_IDENTITY')
    const privilege = (await guard.query(`SELECT r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls AS elevated,
      has_schema_privilege(current_user,'public','CREATE') AS schema_create,
      has_table_privilege(current_user,'"PlayerEconomicCurrent"','INSERT,UPDATE,DELETE,TRUNCATE') AS current_write,
      EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('"PlayerEconomicState"'::regclass,'"PlayerEconomicObservation"'::regclass,
        '"PlayerEconomicCurrent"'::regclass) AND pg_has_role(current_user,relowner,'MEMBER')) AS owns_history,
      has_table_privilege(current_user,'"PlayerEconomicState"','UPDATE,DELETE,TRUNCATE') OR
      has_table_privilege(current_user,'"PlayerEconomicObservation"','UPDATE,DELETE,TRUNCATE') AS history_mutation
      FROM pg_roles r WHERE rolname=current_user`)).rows[0]
    if (Object.values(privilege).some(Boolean)) fail('WRITER_PRIVILEGES')
    const capabilities = (await guard.query(`SELECT
      has_table_privilege(current_user,'"Player"','SELECT') AND
      has_table_privilege(current_user,'"PlayerEconomicState"','SELECT') AND
      has_table_privilege(current_user,'"PlayerEconomicObservation"','SELECT') AND
      has_table_privilege(current_user,'"PlayerEconomicCurrent"','SELECT') AND
      has_table_privilege(current_user,'"PlayerEconomicState"','INSERT') AND
      has_table_privilege(current_user,'"PlayerEconomicObservation"','INSERT') AS stage`)).rows[0]
    if (!capabilities.stage) fail('WRITER_CAPABILITIES_MISSING')
    const immutable = (await guard.query(`SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid IN ('"PlayerEconomicState"'::regclass,'"PlayerEconomicObservation"'::regclass)
      AND t.tgname IN ('economic_state_immutable','economic_observation_immutable','economic_state_no_truncate','economic_observation_no_truncate')
      AND t.tgenabled IN ('O','A') AND p.proname='economic_history_immutable'`)).rows[0].n
    if (immutable !== 4) fail('IMMUTABLE_HISTORY_GUARDS')
    if (mode !== 'preflight') {
      locked = (await guard.query('SELECT pg_try_advisory_lock(17002026,72001) AS locked')).rows[0].locked
      if (!locked) fail('CONCURRENT_EXECUTOR')
      // An advisory lock lost in transport must stop the data connection too.
    }
    client = new PrismaClient({ adapter: new PrismaPg({ ...config, max: 2 }) })
    const result = await executeValueRelease({ mode: mode as ReleaseMode, bundle, bundleSha256: sha(bytes),
      targetHash: activationHash(target), journalFile: journal, client, providerBaseline,
      onProgress: completed => console.log(JSON.stringify({ status: 'STAGING_PROGRESS', completed, total: 12280 })),
      verifyLease: () => { if (leaseLost) fail('EXECUTOR_LEASE_LOST') }, grants: [{ provider: 'FUTSCOUT_VALUE',
        context: 'REAL_WORLD', field: 'MARKET_VALUE', evidenceRef: 'authorized-stage-only-not-publication-or-license' }] })
    console.log(JSON.stringify(result))
    return result
  } finally {
    await client?.$disconnect()
    try { if (locked) await guard.query('SELECT pg_advisory_unlock(17002026,72001)') } finally { await guard.end() }
  }
}

// Importing this module for offline tests never connects to a database.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runValueRelease(process.argv.slice(2)).catch(error => {
    const message = error instanceof Error ? error.message : ''
    console.error(/^RELEASE_[A-Z_]+$/.test(message) ? message : 'RELEASE_STOPPED_RECONCILE_BEFORE_RESUME')
    process.exitCode = 1
  })
}
