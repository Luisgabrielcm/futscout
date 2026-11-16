import "server-only"
import { prisma } from "../lib/prisma"
import { canonicalJson } from "../lib/clubContexts"
import { jointHash, jointReadConfiguration, jointReadManifest, jointTransferViews, validateJointTransferPayload, type JointReadManifest, type JointTransferPayload } from "../lib/jointTransferContexts"
import type { PrismaClient } from "../app/generated/prisma/client"
import { selectedGameMembership } from "../lib/realGameProjection"

export type JointSelection = { payload: JointTransferPayload; views: ReturnType<typeof jointTransferViews> }
export async function readJointTransferSelections(ids?: readonly (string | null)[], db: Pick<PrismaClient, "playerClubContextSelection" | "club"> = prisma,
  env: Readonly<Record<string, string | undefined>> = process.env, asOf = new Date().toISOString().slice(0, 10)): Promise<Map<string, JointSelection>> {
  const config = jointReadConfiguration(env)
  if (!config) return new Map()
  const configuredIds = config.source === "DATABASE" ? config.eaIds : config.manifest.entries.map(e => e.eaId)
  if (ids && !configuredIds.some(id => ids.includes(id))) return new Map()
  // A root hash authenticates the whole ordered set, even for a single-profile request.
  const queryIds = config.source === "DATABASE" ? configuredIds : configuredIds.filter(id => !ids || ids.includes(id))
  const rows = await db.playerClubContextSelection.findMany({ where: {
    eaPlayerId: { in: queryIds }, player: { eaImportVisibility: "PUBLIC" },
  }, include: { revision: { include: { rosterReference: true } } } })
  let manifest: JointReadManifest
  if (config.source === "DATABASE") {
    if (rows.length !== config.eaIds.length || new Set(rows.map(r => r.eaPlayerId)).size !== rows.length ||
      config.eaIds.some(id => !rows.some(r => r.eaPlayerId === id)) || rows.some(r => r.version !== config.selectionVersion))
      throw new Error("JOINT_APPROVED_SELECTION_SET_OR_VERSION_CHANGED")
    const reconstructed: JointReadManifest = { version: 1, decisionReference: rows[0].decisionReference,
      entries: config.eaIds.map(eaId => {
        const row = rows.find(r => r.eaPlayerId === eaId)!
        return { eaId, payloadHash: row.revision.contentHash, snapshotHash: row.revision.rosterReference.contentHash,
          contexts: ["REAL", "GAME"], gameView: "FUTSCOUT_PROJECTED" }
      }) }
    const verified = jointReadManifest({ ...env, JOINT_TRANSFER_READ_MANIFEST: JSON.stringify(reconstructed) })
    if (!verified || jointHash(verified) !== config.manifestHash) throw new Error("JOINT_APPROVED_MANIFEST_CHANGED")
    manifest = verified
  } else manifest = config.manifest
  const allowed = manifest.entries.filter(e => config.source === "DATABASE" || !ids || ids.includes(e.eaId))
  const result = new Map<string, JointSelection>()
  const clubIds = new Set<string>()
  for (const approved of allowed) {
    const selected = rows.find(r => r.eaPlayerId === approved.eaId)
    if (!selected) throw new Error("JOINT_APPROVED_SELECTION_MISSING")
    const revision = selected.revision, payload = revision.payload as unknown as JointTransferPayload
    validateJointTransferPayload(payload, approved.eaId)
    if (selected.decisionReference !== manifest.decisionReference || revision.eaPlayerId !== approved.eaId || revision.contentHash !== approved.payloadHash ||
      jointHash(payload) !== approved.payloadHash || payload.game.snapshot.contentHash !== approved.snapshotHash ||
      revision.rosterReferenceId !== payload.game.snapshot.id || revision.rosterReference.contentHash !== approved.snapshotHash ||
      canonicalJson(revision.rosterReference.metadata) !== canonicalJson(payload.game.snapshot)) throw new Error("JOINT_APPROVED_PROVENANCE_CHANGED")
    if (payload.jointTransfer.futscoutProjection?.status === "READY" && approved.contexts.includes("REAL") && approved.gameView !== "FUTSCOUT_PROJECTED")
      throw new Error("JOINT_PROJECTION_REQUIRES_PAIRED_READERS")
    const views = jointTransferViews(payload, asOf, approved.gameView ?? "EA_SNAPSHOT")
    if (approved.gameView === "FUTSCOUT_PROJECTED" && (!views.game || !views.real)) throw new Error("READY_JOINT_PROJECTION_REQUIRED")
    if (approved.contexts.includes("REAL") && !views.real) throw new Error("JOINT_APPROVED_REAL_CONTEXT_MISSING")
    result.set(approved.eaId, { payload, views: { ...views, game: approved.contexts.includes("GAME") ? views.game : null, real: approved.contexts.includes("REAL") ? views.real : null } })
    for (const m of [payload.jointTransfer.game, payload.jointTransfer.real, payload.jointTransfer.futscoutProjection?.membership]) for (const c of [m?.club, m?.parentClub]) if (c) clubIds.add(c.id)
  }
  const clubs = await db.club.findMany({ where: { id: { in: [...clubIds] }, eaImportVisibility: "PUBLIC" },
    select: { id: true, externalId: true, name: true, slug: true, league: { select: { id: true, name: true, slug: true } } } })
  // Metadata enrichment is a join by validated identity, not a change to the immutable source payload/hash.
  for (const [id, selected] of result) {
    const payload = structuredClone(selected.payload)
    for (const m of [payload.jointTransfer.game, payload.jointTransfer.real, payload.jointTransfer.futscoutProjection?.membership]) if (m) for (const key of ["club", "parentClub"] as const) {
      const c = m[key]
      if (!c) continue
      const live = clubs.find(r => r.id === c.id)
      if (!live || live.externalId !== c.eaId) throw new Error("JOINT_READ_CLUB_IDENTITY_CHANGED")
      m[key] = { ...c, slug: live.slug, league: live.league }
    }
    result.set(id, { payload, views: selected.views })
  }
  return ids ? new Map([...result].filter(([id]) => ids.includes(id))) : result
}

/** Only presentation fields are projected. The database Player and economic inputs are never patched. */
export function applyJointPlayerPresentation<T extends { club: unknown; league?: string | null }>(player: T, selected: JointSelection | undefined, context: "GAME" | "REAL" = "GAME") {
  const membership = context === "GAME" ? selected && selectedGameMembership(selected.payload, selected.views.game?.displayContext === "FUTSCOUT_PROJECTED") : selected?.payload.jointTransfer.real
  if (!selected || !membership || !(context === "GAME" ? selected.views.game : selected.views.real)) return player
  const club = membership.club
  return { ...player, transferContexts: selected.views, transferContext: context,
    club: club ? { id: club.id, slug: club.slug, name: club.name, imageUrl: null, asset: null } : null,
    league: club?.league?.name ?? null, leagueSlug: club?.league?.slug ?? null, leagueAsset: null, leagueLogoUrl: null }
}
