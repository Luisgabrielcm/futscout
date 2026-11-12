import "server-only"
import { rejectPreviewAlternateDatabase } from "../lib/clubContextPreviewPolicy"
import { Pool, type PoolClient } from "pg"
import { ADMIN_CSRF_COOKIE, ADMIN_SESSION_COOKIE, normalizeOwnerLogin, passwordHashFormatValid, randomToken, readCookie, sameOrigin, SESSION_MS, sha256, verifyPassword } from "../lib/adminAuth"

type AuthCode = "CONFIG_MISSING" | "HASH_FORMAT_INVALID" | "CONNECTION_UNAVAILABLE" | "RATE_CHECK_FAILED" |
  "RATE_LIMIT_BLOCKED" | "OWNER_MISMATCH" | "PASSWORD_MISMATCH" | "ATTEMPT_WRITE_FAILED" |
  "SESSION_CREATED" | "SESSION_CONNECT_FAILED" | "SESSION_WRITE_FAILED" | "SESSION_COMMIT_UNCERTAIN" | "SESSION_NOT_FOUND" |
  "SESSION_OWNER_MISMATCH" | "CSRF_REJECTED"
function authCode(code: AuthCode) {
  if (process.env.FUTSCOUT_ADMIN_AUTH_DIAGNOSTIC === "1") console.info(`FUTSCOUT_ADMIN_AUTH code=${code}`)
}

let pool: Pool | undefined
function credentialIdentity(value: string) {
  let parsed: URL
  try { parsed = new URL(value) }
  catch { throw Error("ADMIN_CONNECTION_INVALID") }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.username ||
      (process.env.NODE_ENV === "production" && !parsed.password)) {
    throw Error("ADMIN_CONNECTION_INVALID")
  }
  try { return `${decodeURIComponent(parsed.username)}\0${decodeURIComponent(parsed.password)}` }
  catch { throw Error("ADMIN_CONNECTION_INVALID") }
}

export function adminPool() {
  rejectPreviewAlternateDatabase(process.env)
  const url = process.env.FUTSCOUT_ADMIN_DATABASE_URL
  if (!url) throw Error("ADMIN_CONNECTION_NOT_CONFIGURED")
  const identity = credentialIdentity(url)
  for (const existing of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
    if (existing && credentialIdentity(existing) === identity) throw Error("ADMIN_CONNECTION_NOT_DEDICATED")
  }
  if (process.env.NODE_ENV === "production" &&
      !["require", "verify-ca", "verify-full"].includes(new URL(url).searchParams.get("sslmode") ?? "")) {
    throw Error("ADMIN_CONNECTION_TLS_REQUIRED")
  }
  // Keep the pooled Prisma Postgres startup packet compatible with the public PrismaPg pool.
  if (!pool) pool = new Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 10000,
    query_timeout: 10000 })
  return pool
}

function credentials() {
  if (process.env.FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC === '1') throw Error('ADMIN_DISABLED_DURING_IDENTITY_DIAGNOSTIC')
  const owner = process.env.FUTSCOUT_ADMIN_OWNER_LOGIN
  const passwordHash = process.env.FUTSCOUT_ADMIN_PASSWORD_HASH
  const normalizedOwner = owner ? normalizeOwnerLogin(owner) : ""
  if (!normalizedOwner || !passwordHash) { authCode("CONFIG_MISSING"); throw Error("ADMIN_CREDENTIALS_NOT_CONFIGURED") }
  return { owner: normalizedOwner, passwordHash }
}

const rateKey = (request: Request) => sha256(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown")

export async function loginOwner(request: Request, input: { owner: string; password: string }) {
  const expected = credentials()
  let db: Pool
  try { db = adminPool() }
  catch { authCode("CONNECTION_UNAVAILABLE"); throw Error("ADMIN_CONNECTION_UNAVAILABLE") }
  const ipKey = rateKey(request)
  const globalKey = "owner-global"
  let limited
  try { limited = await db.query<{ key: string }>(
    'SELECT "key" FROM "AdminLoginAttempt" WHERE "key"=ANY($1::text[]) AND "blockedUntil">now()', [[ipKey, globalKey]]) }
  catch { authCode("RATE_CHECK_FAILED"); throw Error("ADMIN_RATE_CHECK_FAILED") }
  if (limited.rowCount) { authCode("RATE_LIMIT_BLOCKED"); return null }
  if (!passwordHashFormatValid(expected.passwordHash)) { authCode("HASH_FORMAT_INVALID"); return null }
  const ownerMatches = normalizeOwnerLogin(input.owner) === expected.owner
  const passwordMatches = verifyPassword(input.password, expected.passwordHash)
  if (!ownerMatches || !passwordMatches) {
    authCode(ownerMatches ? "PASSWORD_MISMATCH" : "OWNER_MISMATCH")
    try { await db.query(`INSERT INTO "AdminLoginAttempt" ("key","failures","blockedUntil","updatedAt")
      SELECT x,1,NULL,now() FROM unnest($1::text[]) x
      ON CONFLICT ("key") DO UPDATE SET
      "failures"=CASE WHEN "AdminLoginAttempt"."updatedAt"<now()-interval '15 minutes' THEN 1 ELSE "AdminLoginAttempt"."failures"+1 END,
      "blockedUntil"=CASE WHEN "AdminLoginAttempt"."updatedAt"<now()-interval '15 minutes' THEN NULL
        WHEN "AdminLoginAttempt"."failures"+1 >= CASE WHEN "AdminLoginAttempt"."key"=$2 THEN 5 ELSE 25 END THEN now()+interval '15 minutes'
        ELSE "AdminLoginAttempt"."blockedUntil" END,
      "updatedAt"=now()`, [[ipKey, globalKey], ipKey]) }
    catch { authCode("ATTEMPT_WRITE_FAILED"); throw Error("ADMIN_ATTEMPT_WRITE_FAILED") }
    return null
  }
  const token = randomToken(), csrf = randomToken()
  let client: PoolClient
  try { client = await db.connect() }
  catch { authCode("SESSION_CONNECT_FAILED"); throw Error("ADMIN_SESSION_CONNECTION_FAILED") }
  let commitStarted = false
  try {
    await client.query("BEGIN")
    await client.query("SET LOCAL statement_timeout = '8s'")
    await client.query("SET LOCAL lock_timeout = '3s'")
    await client.query("SET LOCAL transaction_timeout = '20s'")
    await client.query('INSERT INTO "AdminSession" ("tokenHash","csrfHash","ownerId","expiresAt") VALUES ($1,$2,$3,$4)',
      [sha256(token), sha256(csrf), expected.owner, new Date(Date.now() + SESSION_MS)])
    commitStarted = true
    await client.query("COMMIT")
    authCode("SESSION_CREATED")
    return { token, csrf }
  } catch {
    authCode(commitStarted ? "SESSION_COMMIT_UNCERTAIN" : "SESSION_WRITE_FAILED")
    try { await client.query("ROLLBACK") } catch { /* The commit outcome may be uncertain. */ }
    throw Error("ADMIN_LOGIN_FAILED")
  }
  finally { client.release() }
}

export async function ownerSession(request: Request, mutation = false) {
  if (process.env.FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC === '1') return null
  const token = readCookie(request, ADMIN_SESSION_COOKIE)
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null
  const result = await adminPool().query<{ ownerId: string; csrfHash: string }>(
    'SELECT "ownerId","csrfHash" FROM "AdminSession" WHERE "tokenHash"=$1 AND "expiresAt">now() AND "revokedAt" IS NULL',
    [sha256(token)])
  const row = result.rows[0]
  if (!row) { authCode("SESSION_NOT_FOUND"); return null }
  if (row.ownerId !== credentials().owner) { authCode("SESSION_OWNER_MISMATCH"); return null }
  if (mutation) {
    const csrf = readCookie(request, ADMIN_CSRF_COOKIE)
    if (!sameOrigin(request) || !csrf || request.headers.get("x-csrf-token") !== csrf || sha256(csrf) !== row.csrfHash) {
      authCode("CSRF_REJECTED"); return null
    }
  }
  return { owner: row.ownerId, tokenHash: sha256(token) }
}

export async function revokeSession(tokenHash: string) {
  await adminPool().query('UPDATE "AdminSession" SET "revokedAt"=now() WHERE "tokenHash"=$1 AND "revokedAt" IS NULL', [tokenHash])
}
