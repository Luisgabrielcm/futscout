import "server-only"
import { Pool } from "pg"
import { ADMIN_CSRF_COOKIE, ADMIN_SESSION_COOKIE, randomToken, readCookie, sameOrigin, SESSION_MS, sha256, verifyPassword, verifyTotp } from "../lib/adminAuth"

let pool: Pool | undefined
function credentialIdentity(value: string) {
  const parsed = new URL(value)
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.username ||
      (process.env.NODE_ENV === "production" && !parsed.password)) {
    throw Error("ADMIN_CONNECTION_INVALID")
  }
  return `${decodeURIComponent(parsed.username)}\0${decodeURIComponent(parsed.password)}`
}

export function adminPool() {
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
  if (!pool) pool = new Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 10000,
    idle_in_transaction_session_timeout: 5000 })
  return pool
}

function credentials() {
  const owner = process.env.FUTSCOUT_ADMIN_OWNER_LOGIN
  const passwordHash = process.env.FUTSCOUT_ADMIN_PASSWORD_HASH
  const totpSecret = process.env.FUTSCOUT_ADMIN_TOTP_SECRET
  if (!owner || !passwordHash || !totpSecret) throw Error("ADMIN_CREDENTIALS_NOT_CONFIGURED")
  return { owner, passwordHash, totpSecret }
}

const rateKey = (request: Request) => sha256(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown")

export async function loginOwner(request: Request, input: { owner: string; password: string; totp: string }) {
  const expected = credentials()
  const db = adminPool()
  const ipKey = rateKey(request)
  const globalKey = "owner-global"
  const limited = await db.query<{ key: string }>(
    'SELECT "key" FROM "AdminLoginAttempt" WHERE "key"=ANY($1::text[]) AND "blockedUntil">now()', [[ipKey, globalKey]])
  if (limited.rowCount) return null
  const correct = input.owner === expected.owner && verifyPassword(input.password, expected.passwordHash)
  const step = correct ? verifyTotp(input.totp, expected.totpSecret) : null
  if (step === null) {
    await db.query(`INSERT INTO "AdminLoginAttempt" ("key","failures","blockedUntil","updatedAt")
      SELECT x,1,NULL,now() FROM unnest($1::text[]) x
      ON CONFLICT ("key") DO UPDATE SET
      "failures"=CASE WHEN "AdminLoginAttempt"."updatedAt"<now()-interval '15 minutes' THEN 1 ELSE "AdminLoginAttempt"."failures"+1 END,
      "blockedUntil"=CASE WHEN "AdminLoginAttempt"."updatedAt"<now()-interval '15 minutes' THEN NULL
        WHEN "AdminLoginAttempt"."failures"+1 >= CASE WHEN "AdminLoginAttempt"."key"=$2 THEN 5 ELSE 25 END THEN now()+interval '15 minutes'
        ELSE "AdminLoginAttempt"."blockedUntil" END,
      "updatedAt"=now()`, [[ipKey, globalKey], ipKey])
    return null
  }
  const token = randomToken(), csrf = randomToken()
  const client = await db.connect()
  try {
    await client.query("BEGIN")
    const used = await client.query('INSERT INTO "AdminTotpStep" ("step") VALUES ($1) ON CONFLICT DO NOTHING', [step])
    if (used.rowCount !== 1) { await client.query("ROLLBACK"); return null }
    await client.query('INSERT INTO "AdminSession" ("tokenHash","csrfHash","ownerId","expiresAt") VALUES ($1,$2,$3,$4)',
      [sha256(token), sha256(csrf), expected.owner, new Date(Date.now() + SESSION_MS)])
    await client.query("COMMIT")
    return { token, csrf }
  } catch { await client.query("ROLLBACK"); throw Error("ADMIN_LOGIN_FAILED") }
  finally { client.release() }
}

export async function ownerSession(request: Request, mutation = false) {
  const token = readCookie(request, ADMIN_SESSION_COOKIE)
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null
  const result = await adminPool().query<{ ownerId: string; csrfHash: string }>(
    'SELECT "ownerId","csrfHash" FROM "AdminSession" WHERE "tokenHash"=$1 AND "expiresAt">now() AND "revokedAt" IS NULL',
    [sha256(token)])
  const row = result.rows[0]
  if (!row || row.ownerId !== credentials().owner) return null
  if (mutation) {
    const csrf = readCookie(request, ADMIN_CSRF_COOKIE)
    if (!sameOrigin(request) || !csrf || request.headers.get("x-csrf-token") !== csrf || sha256(csrf) !== row.csrfHash) return null
  }
  return { owner: row.ownerId, tokenHash: sha256(token) }
}

export async function revokeSession(tokenHash: string) {
  await adminPool().query('UPDATE "AdminSession" SET "revokedAt"=now() WHERE "tokenHash"=$1 AND "revokedAt" IS NULL', [tokenHash])
}
