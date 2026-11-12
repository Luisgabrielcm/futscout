import "server-only"
import { createHash } from "node:crypto"
import { prisma } from "../lib/prisma"
import { canonicalJson, validateClubContexts, type ClubContexts } from "../lib/clubContexts"

/** Point read only; disabled until a separately authorized schema/data release. */
export async function readPlayerClubContexts(eaPlayerId: string | null): Promise<ClubContexts | undefined> {
  if (process.env.CLUB_CONTEXTS_READ_ENABLED !== "1" || !eaPlayerId) return undefined
  const selection = await prisma.playerClubContextSelection.findUnique({
    where: { eaPlayerId }, include: { revision: { include: { rosterReference: true } } } })
  if (!selection) return undefined
  const { revision } = selection
  const contexts = revision.payload as unknown as ClubContexts
  validateClubContexts(contexts, eaPlayerId)
  if (revision.contentHash !== createHash("sha256").update(canonicalJson(revision.payload)).digest("hex") ||
      contexts.game.snapshot.id !== revision.rosterReferenceId ||
      contexts.game.snapshot.contentHash !== revision.rosterReference.contentHash ||
      canonicalJson(contexts.game.snapshot) !== canonicalJson(revision.rosterReference.metadata))
    throw new Error("CLUB_CONTEXT_PROVENANCE_MISMATCH")
  return contexts
}
