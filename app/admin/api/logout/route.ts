import { NextResponse } from "next/server"
import { ADMIN_CSRF_COOKIE, ADMIN_SESSION_COOKIE } from "../../../../lib/adminAuth"
import { ownerSession, revokeSession } from "../../../../services/adminAuth.server"

export const dynamic = "force-dynamic"
export const maxDuration = 45
export async function POST(request: Request) {
  const session = await ownerSession(request, true)
  if (!session) return new Response(null, { status: 403 })
  await revokeSession(session.tokenHash)
  const response = NextResponse.json({ ok: true })
  response.headers.set("Cache-Control", "no-store")
  response.cookies.delete(ADMIN_SESSION_COOKIE)
  response.cookies.delete(ADMIN_CSRF_COOKIE)
  return response
}
