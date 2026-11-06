import { NextResponse } from "next/server"
import { ADMIN_CSRF_COOKIE, ADMIN_SESSION_COOKIE, sameOrigin, SESSION_MS } from "../../../../lib/adminAuth"
import { loginOwner } from "../../../../services/adminAuth.server"

export const dynamic = "force-dynamic"
export async function POST(request: Request) {
  if (!sameOrigin(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json" ||
      Number(request.headers.get("content-length") || 0) > 4096) return new Response(null, { status: 403 })
  try {
    const body = await request.json() as Record<string, unknown>
    const input = { owner: String(body.owner ?? ""), password: String(body.password ?? ""), totp: String(body.totp ?? "") }
    if (input.owner.length > 200 || input.password.length > 1024 || input.totp.length > 20) return new Response(null, { status: 400 })
    const result = await loginOwner(request, input)
    if (!result) return new Response("Credenciais inválidas ou acesso temporariamente limitado.", { status: 401 })
    const response = NextResponse.json({ ok: true })
    response.headers.set("Cache-Control", "no-store")
    const secure = process.env.NODE_ENV === "production"
    response.cookies.set(ADMIN_SESSION_COOKIE, result.token, { httpOnly: true, secure, sameSite: "strict", path: "/admin", maxAge: SESSION_MS / 1000 })
    response.cookies.set(ADMIN_CSRF_COOKIE, result.csrf, { httpOnly: false, secure, sameSite: "strict", path: "/admin", maxAge: SESSION_MS / 1000 })
    return response
  } catch { return new Response("Acesso indisponível.", { status: 503 }) }
}
