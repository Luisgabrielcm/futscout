import { revalidatePath } from "next/cache"
import { ownerSession } from "../../../../../services/adminAuth.server"
import { readAdminPlayer, readManualEconomics, saveManualEconomic } from "../../../../../services/adminEconomic.server"
import type { ManualSection } from "../../../../../lib/adminEconomic"

export const dynamic = "force-dynamic"
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, { params }: Context) {
  try {
    if (!await ownerSession(request)) return new Response(null, { status: 401 })
    const { id } = await params
    const player = await readAdminPlayer(id)
    return player ? Response.json({ player }, { headers: { "Cache-Control": "no-store" } }) : new Response(null, { status: 404 })
  } catch { return new Response("Indisponível.", { status: 503 }) }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const session = await ownerSession(request, true)
    if (!session) return new Response(null, { status: 403 })
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json" ||
        Number(request.headers.get("content-length") || 0) > 4096) return new Response(null, { status: 400 })
    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    if (!["SALARY", "CONTRACT", "CLAUSE"].includes(String(body.section))) return new Response(null, { status: 400 })
    // Fail before writing if the public runtime cannot read the manual tables.
    await readManualEconomics([id], true)
    const result = await saveManualEconomic({ playerId: id, eaId: String(body.eaId ?? ""), section: body.section as ManualSection,
      payload: body.payload, rollbackTo: typeof body.rollbackTo === "string" ? body.rollbackTo : undefined,
      expectedRevision: Number(body.expectedRevision), requestId: String(body.requestId ?? ""), actor: session.owner })
    const publicValue = (await readManualEconomics([id], true)).get(id)
    if (publicValue?.revisions[body.section as ManualSection] !== result.revision) throw Error("PUBLIC_READ_BACK_FAILED")
    // Public read-back and DB commit precede cache invalidation and success.
    revalidatePath("/pt", "layout")
    revalidatePath("/en", "layout")
    return Response.json({ ok: true, revision: result.revision, replay: result.replay }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_REVISION_CONFLICT") return new Response("Revisão alterada. Atualize o jogador.", { status: 409 })
    if (error instanceof Error && ["INVALID_EDIT","INVALID_PAYLOAD","INVALID_SALARY","INVALID_CONTRACT","INVALID_CLAUSE","INVALID_SECTION","PLAYER_IDENTITY_MISMATCH","ROLLBACK_TARGET_MISSING"].includes(error.message))
      return new Response("Dados inválidos.", { status: 400 })
    return new Response("Salvamento não confirmado. Consulte o estado antes de repetir.", { status: 503 })
  }
}
