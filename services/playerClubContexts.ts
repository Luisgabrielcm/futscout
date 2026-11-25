import "server-only"
import { createHash } from "node:crypto"
import { prisma } from "../lib/prisma"
import { canonicalJson, validateClubContexts, type ClubContexts } from "../lib/clubContexts"
import { canReadClubContexts, expectedClubContextPilotSelection } from "../lib/clubContextReadGate"

type SelectedContext = { revisionId: string; decisionReference: string; version: number; revision: {
  payload: unknown; contentHash: string; rosterReferenceId: string; rosterReference: { contentHash: string; metadata: unknown }
} }

function approvedContexts(selection: SelectedContext, eaPlayerId: string): ClubContexts {
  const { revision } = selection
  const contexts = revision.payload as ClubContexts
  validateClubContexts(contexts, eaPlayerId)
  if (revision.contentHash !== createHash("sha256").update(canonicalJson(revision.payload)).digest("hex") ||
      contexts.game.snapshot.id !== revision.rosterReferenceId ||
      contexts.game.snapshot.contentHash !== revision.rosterReference.contentHash ||
      canonicalJson(contexts.game.snapshot) !== canonicalJson(revision.rosterReference.metadata))
    throw new Error("CLUB_CONTEXT_PROVENANCE_MISMATCH")
  const approved = expectedClubContextPilotSelection(eaPlayerId)!
  if (selection.revisionId !== approved.revisionId || selection.decisionReference !== approved.decisionReference ||
      selection.version !== approved.version || revision.contentHash !== approved.contentHash)
    throw new Error("CLUB_CONTEXT_PILOT_SELECTION_NOT_APPROVED")
  return contexts
}

/** Same four-player gate and provenance checks as the point reader, in one bounded query. */
export async function readPlayerClubContextsBatch(eaPlayerIds: readonly (string | null | undefined)[]): Promise<Map<string, ClubContexts>> {
  const ids = [...new Set(eaPlayerIds.filter((id): id is string => !!id && canReadClubContexts(id, process.env)))]
  if (!ids.length) return new Map()
  const rows = await prisma.playerClubContextSelection.findMany({
    where: { eaPlayerId: { in: ids }, player: { eaImportVisibility: "PUBLIC" } },
    include: { revision: { include: { rosterReference: true } } },
  })
  const result = new Map<string, ClubContexts>()
  for (const row of rows) {
    if (!ids.includes(row.eaPlayerId) || result.has(row.eaPlayerId)) throw new Error("CLUB_CONTEXT_SCOPE_MISMATCH")
    result.set(row.eaPlayerId, approvedContexts(row, row.eaPlayerId))
  }
  return result
}

/** Point read only; disabled until a separately authorized schema/data release. */
export async function readPlayerClubContexts(eaPlayerId: string | null): Promise<ClubContexts | undefined> {
  if (!canReadClubContexts(eaPlayerId, process.env) || !eaPlayerId) return undefined
  const selection = await prisma.playerClubContextSelection.findUnique({
    where: { eaPlayerId }, include: { revision: { include: { rosterReference: true } } } })
  if (!selection) return undefined
  return approvedContexts(selection, eaPlayerId)
}
