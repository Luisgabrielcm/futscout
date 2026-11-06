import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

export const ADMIN_SESSION_COOKIE = "fs_owner_session"
export const ADMIN_CSRF_COOKIE = "fs_owner_csrf"
export const SESSION_MS = 30 * 60 * 1000

export const randomToken = () => randomBytes(32).toString("base64url")
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
const equal = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

export function verifyPassword(password: string, encoded: string) {
  if (password.length > 1024) return false
  const [salt, expected] = encoded.split(":")
  if (!salt || !expected || !/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{32}$/.test(salt)) return false
  return equal(scryptSync(password, Buffer.from(salt, "hex"), 32), Buffer.from(expected, "hex"))
}

function base32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = 0, acc = 0
  const bytes: number[] = []
  for (const ch of value.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(ch)
    if (v < 0) throw Error("INVALID_MFA_SECRET")
    acc = (acc << 5) | v
    bits += 5
    if (bits >= 8) { bits -= 8; bytes.push((acc >>> bits) & 255) }
  }
  if (bytes.length < 20) throw Error("WEAK_MFA_SECRET")
  return Buffer.from(bytes)
}

export function verifyTotp(code: string, secret: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const key = base32(secret)
  const step = Math.floor(now / 30_000)
  for (const candidate of [step - 1, step, step + 1]) {
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(candidate))
    const mac = createHmac("sha1", key).update(counter).digest()
    const offset = mac[mac.length - 1] & 15
    const number = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
    if (equal(Buffer.from(code), Buffer.from(String(number).padStart(6, "0")))) return candidate
  }
  return null
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    const url = new URL(request.url)
    const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname)
    return parsed.host === url.host && parsed.protocol === url.protocol && (url.protocol === "https:" || (local && url.protocol === "http:"))
  } catch { return false }
}

export function readCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map(p => p.trim()).find(p => p.startsWith(name + "="))?.slice(name.length + 1) ?? null
}
