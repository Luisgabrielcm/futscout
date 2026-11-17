import "server-only"
import { prisma } from "../lib/prisma"
import { canonicalJson } from "../lib/clubContexts"
import { jointHash, jointReadConfiguration, jointReadManifest, jointTransferViews, validateJointTransferPayload, verifyJointReadIndex,
  type JointReadIndexEntry, type JointReadManifest, type JointTransferPayload } from "../lib/jointTransferContexts"
import type { PrismaClient } from "../app/generated/prisma/client"
import { realGamePolicyHash, selectedGameMembership } from "../lib/realGameProjection"

export type JointSelection = { payload: JointTransferPayload; views: ReturnType<typeof jointTransferViews> }
// Process-local, bounded and partitioned by database client, approved root and UTC day.
// Only immutable bodies/views are cached; mutable selection pins and club identities are always read again.
const indexBodies = new WeakMap<object, Map<string, Map<string, JointSelection>>>()
export async function readJointTransferSelections(ids?: readonly (string | null)[], db: Pick<PrismaClient, "playerClubContextSelection" | "club"> = prisma,
  env: Readonly<Record<string, string | undefined>> = process.env, asOf = new Date().toISOString().slice(0, 10)): Promise<Map<string, JointSelection>> {
  const config = jointReadConfiguration(env)
  if (!config) return new Map()
  const configuredIds = config.source === "INLINE" ? config.manifest.entries.map(e => e.eaId) : config.eaIds
  const requested = ids ? new Set(ids) : null
  if (requested && !configuredIds.some(id => requested.has(id))) return new Map()
  let indexEntries: Map<string, JointReadIndexEntry> | null = null
  const cacheKey = config.source === "DATABASE_INDEX" ? `${config.manifestHash}:${asOf}` : null
  let cached: Map<string, JointSelection> | undefined
  if (config.source === "DATABASE_INDEX") {
    // One bounded metadata query authenticates the entire selection set. No JSON payload column is loaded here.
    const headers = await db.playerClubContextSelection.findMany({ where: {
      eaPlayerId: { in: configuredIds }, player: { eaImportVisibility: "PUBLIC" },
    }, select: { eaPlayerId: true, revisionId: true, version: true, decisionReference: true,
      revision: { select: { eaPlayerId: true, contentHash: true, rosterReferenceId: true,
        rosterReference: { select: { id: true, contentHash: true } } } } } })
    const byId = new Map(headers.map(r => [r.eaPlayerId, r]))
    if (headers.length !== configuredIds.length || byId.size !== headers.length || headers.some(r =>
      r.revision.eaPlayerId !== r.eaPlayerId || r.revision.rosterReferenceId !== r.revision.rosterReference.id)) throw new Error("JOINT_APPROVED_INDEX_SELECTIONS_CHANGED")
    const entries = configuredIds.map(eaId => {
      const r = byId.get(eaId)
      if (!r) throw new Error("JOINT_APPROVED_INDEX_SELECTIONS_CHANGED")
      return { eaId, selectionVersion: r.version, revisionId: r.revisionId, decisionReference: r.decisionReference,
        payloadHash: r.revision.contentHash, snapshotId: r.revision.rosterReferenceId, snapshotHash: r.revision.rosterReference.contentHash }
    })
    verifyJointReadIndex({ version: 2, policyHash: realGamePolicyHash, entries }, configuredIds, config.manifestHash)
    indexEntries = new Map(entries.map(e => [e.eaId, e]))
    cached = indexBodies.get(db)?.get(cacheKey!)
  }
  // A root hash authenticates the whole ordered set, even for a single-profile request.
  const queryIds = config.source === "DATABASE" ? configuredIds : configuredIds.filter(id => !requested || requested.has(id))
  const missingIds = cacheKey ? queryIds.filter(id => !cached?.has(id)) : queryIds
  const rows = missingIds.length ? await db.playerClubContextSelection.findMany({ where: {
    eaPlayerId: { in: missingIds }, player: { eaImportVisibility: "PUBLIC" },
  }, include: { revision: { include: { rosterReference: true } } } }) : []
  let manifest: JointReadManifest
  const rowsById = new Map(rows.map(r => [r.eaPlayerId, r]))
  if (config.source === "DATABASE_INDEX") {
    if (rows.length !== missingIds.length || rowsById.size !== rows.length || missingIds.some(id => !rowsById.has(id))) throw new Error("JOINT_APPROVED_INDEX_SELECTIONS_CHANGED")
    manifest = { version: 1, decisionReference: "per-entry-index", entries: queryIds.map(eaId => {
      const entry = indexEntries!.get(eaId)!, row = rowsById.get(eaId)
      if (row && (row.version !== entry.selectionVersion || row.revisionId !== entry.revisionId)) throw new Error("JOINT_APPROVED_INDEX_SELECTIONS_CHANGED")
      return { eaId, payloadHash: entry.payloadHash, snapshotHash: entry.snapshotHash, contexts: ["REAL", "GAME"], gameView: "FUTSCOUT_PROJECTED" }
    }) }
  } else if (config.source === "DATABASE") {
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
  const verifiedBodies = new Map<string, JointSelection>()
  const clubIds = new Set<string>()
  for (const approved of allowed) {
    const hit = cached?.get(approved.eaId)
    if (hit) { result.set(approved.eaId, structuredClone(hit)); continue }
    const selected = rowsById.get(approved.eaId)
    if (!selected) throw new Error("JOINT_APPROVED_SELECTION_MISSING")
    const revision = selected.revision, payload = revision.payload as unknown as JointTransferPayload
    validateJointTransferPayload(payload, approved.eaId)
    if (selected.decisionReference !== (indexEntries?.get(approved.eaId)?.decisionReference ?? manifest.decisionReference) || revision.eaPlayerId !== approved.eaId || revision.contentHash !== approved.payloadHash ||
      jointHash(payload) !== approved.payloadHash || payload.game.snapshot.contentHash !== approved.snapshotHash ||
      revision.rosterReferenceId !== payload.game.snapshot.id || revision.rosterReference.contentHash !== approved.snapshotHash ||
      canonicalJson(revision.rosterReference.metadata) !== canonicalJson(payload.game.snapshot)) throw new Error("JOINT_APPROVED_PROVENANCE_CHANGED")
    if (payload.jointTransfer.futscoutProjection?.status === "READY" && approved.contexts.includes("REAL") && approved.gameView !== "FUTSCOUT_PROJECTED")
      throw new Error("JOINT_PROJECTION_REQUIRES_PAIRED_READERS")
    const views = jointTransferViews(payload, asOf, approved.gameView ?? "EA_SNAPSHOT")
    if (approved.gameView === "FUTSCOUT_PROJECTED" && (!views.game || !views.real)) throw new Error("READY_JOINT_PROJECTION_REQUIRED")
    if (approved.contexts.includes("REAL") && !views.real) throw new Error("JOINT_APPROVED_REAL_CONTEXT_MISSING")
    result.set(approved.eaId, { payload, views: { ...views, game: approved.contexts.includes("GAME") ? views.game : null, real: approved.contexts.includes("REAL") ? views.real : null } })
    if (cacheKey) verifiedBodies.set(approved.eaId, structuredClone(result.get(approved.eaId)!))
  }
  for (const { payload } of result.values()) for (const m of [payload.jointTransfer.game, payload.jointTransfer.real, payload.jointTransfer.futscoutProjection?.membership]) for (const c of [m?.club, m?.parentClub]) if (c) clubIds.add(c.id)
  const clubs = await db.club.findMany({ where: { id: { in: [...clubIds] }, eaImportVisibility: "PUBLIC" },
    select: { id: true, externalId: true, name: true, slug: true, league: { select: { id: true, name: true, slug: true } } } })
  const clubsById = new Map(clubs.map(c => [c.id, c]))
  // Metadata enrichment is a join by validated identity, not a change to the immutable source payload/hash.
  for (const [id, selected] of result) {
    const payload = structuredClone(selected.payload)
    for (const m of [payload.jointTransfer.game, payload.jointTransfer.real, payload.jointTransfer.futscoutProjection?.membership]) if (m) for (const key of ["club", "parentClub"] as const) {
      const c = m[key]
      if (!c) continue
      const live = clubsById.get(c.id)
      if (!live || live.externalId !== c.eaId) throw new Error("JOINT_READ_CLUB_IDENTITY_CHANGED")
      m[key] = { ...c, slug: live.slug, league: live.league }
    }
    result.set(id, { payload, views: selected.views })
  }
  if (cacheKey && verifiedBodies.size) {
    const versions = indexBodies.get(db) ?? new Map<string, Map<string, JointSelection>>()
    const bodies = versions.get(cacheKey) ?? new Map<string, JointSelection>()
    for (const [id, selection] of verifiedBodies) bodies.set(id, selection)
    versions.delete(cacheKey); versions.set(cacheKey, bodies)
    while (versions.size > 2) versions.delete(versions.keys().next().value!)
    indexBodies.set(db, versions)
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
