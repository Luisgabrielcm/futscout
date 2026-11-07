import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

export const ADMIN_SESSION_COOKIE = "fs_owner_session"
export const ADMIN_CSRF_COOKIE = "fs_owner_csrf"
export const SESSION_MS = 30 * 60 * 1000

export const randomToken = () => randomBytes(32).toString("base64url")
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
const equal = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

export function verifyPassword(password: string, encoded: string) {
  if (password.length < 16 || password.length > 1024) return false
  const [salt, expected] = encoded.split(":")
  if (!salt || !expected || !/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{32}$/.test(salt)) return false
  return equal(scryptSync(password, Buffer.from(salt, "hex"), 32), Buffer.from(expected, "hex"))
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
