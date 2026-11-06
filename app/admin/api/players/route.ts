import { ownerSession } from "../../../../services/adminAuth.server"
import { searchAdminPlayers } from "../../../../services/adminEconomic.server"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    if (!await ownerSession(request)) return new Response(null, { status: 401 })
    const query = new URL(request.url).searchParams.get("q")
    const players = query ? await searchAdminPlayers(query) : []
    return Response.json({ players }, { headers: { "Cache-Control": "no-store" } })
  } catch { return new Response("Indisponível.", { status: 503 }) }
}
