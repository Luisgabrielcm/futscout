import type { PrismaClient } from "../app/generated/prisma/client"
import { isDeepStrictEqual } from "node:util"
import { calculateMatchConfidence, canAutomaticallySave, classifyMatchConfidence,
  API_FOOTBALL_PLAYER_MIN_AUTO_SAVE_MARGIN } from "./apiFootballPlayerMatcherCore"
import { BARCELONA_WRITE_EVIDENCE, BARCELONA_WRITE_TARGETS, type PreparedIdentityMatch } from "./barcelonaIdentityWritePolicy"

export type AtomicMatchStatus = "MATCHED" | "ALREADY_MATCHED_SAME_ID" |
  "CONFLICT_PLAYER_ALREADY_HAS_OTHER_ID" | "CONFLICT_PROVIDER_ID_TAKEN" |
  "CONCURRENT_MODIFICATION" | "ATTEMPT_FAILURE" | "VALIDATION_FAILURE" | "INDETERMINATE_COMMIT" | "AUTHORIZATION_MISMATCH"
export type AtomicMatchResult = { status: AtomicMatchStatus; playerId: string; providerId: number }
class AtomicAbort extends Error {
  constructor(readonly status: AtomicMatchStatus) { super(status) }
}
const abort = (status: AtomicMatchStatus): never => { throw new AtomicAbort(status) }
const codeOf = (e: unknown) => typeof e === "object" && e !== null && "code" in e ? e.code : undefined

function validate(m: PreparedIdentityMatch, now: Date) {
  const target = BARCELONA_WRITE_TARGETS.find(t => t.playerId === m.identity.id)
  const pin = BARCELONA_WRITE_EVIDENCE
  if (!target || target.providerId !== m.providerId || m.identity.clubId !== pin.clubId ||
      m.identity.club?.apiFootballId !== 529 || m.decision !== "AUTO_MATCH" ||
      m.cacheRowHash !== pin.cacheRowHash || m.snapshotHash !== pin.snapshotHash ||
      !Number.isFinite(now.getTime()) || !Number.isFinite(m.cacheExpiresAt.getTime()) || m.cacheExpiresAt <= now ||
      !Number.isFinite(m.identity.updatedAt.getTime()) || !Number.isFinite(m.identity.dateOfBirth?.getTime()) ||
      !Number.isInteger(m.nameScore) || m.nameScore > 100 ||
      m.birthMatches !== true || m.clubMatches !== true || typeof m.nationalityMatches !== "boolean" ||
      !Number.isFinite(m.margin) || m.margin > 100 || m.margin < API_FOOTBALL_PLAYER_MIN_AUTO_SAVE_MARGIN ||
      m.confidence !== calculateMatchConfidence(m) ||
      !canAutomaticallySave({ ...m, classification: classifyMatchConfidence(m.confidence) })) abort("VALIDATION_FAILURE")
}

// No singleton, env, network, resolver, retry helper or side effects on import.
// The caller supplies a client; every model operation is scoped to ONE transaction.
export async function persistPlayerApiFootballMatchAtomically(
  db: Pick<PrismaClient, "$transaction">, prepared: PreparedIdentityMatch, clock: () => Date = () => new Date(),
): Promise<AtomicMatchResult> {
  const m = structuredClone(prepared)
  const progress: { stage: "read" | "update" | "attempt" | "commit" } = { stage: "read" }
  const result = (status: AtomicMatchStatus): AtomicMatchResult => ({ status, playerId: m.identity.id, providerId: m.providerId })
  try {
    validate(m, clock())
    return await db.$transaction(async tx => {
      const p = await tx.player.findUnique({ where: { id: m.identity.id }, select: {
        id: true, slug: true, externalId: true, name: true, dateOfBirth: true, nationality: true, position: true, secondaryPositions: true,
        clubId: true, updatedAt: true, apiFootballId: true, club: { select: { name: true, apiFootballId: true } },
      } })
      if (!p) return result("VALIDATION_FAILURE")
      if (p.apiFootballId !== null && p.apiFootballId !== m.providerId) return result("CONFLICT_PLAYER_ALREADY_HAS_OTHER_ID")
      const owner = await tx.player.findUnique({ where: { apiFootballId: m.providerId }, select: { id: true } })
      if (owner && owner.id !== p.id) return result("CONFLICT_PROVIDER_ID_TAKEN")
      const attempt = await tx.apiFootballPlayerMatchAttempt.findUnique({ where: { playerId: p.id } })
      const { apiFootballId, updatedAt, ...identity } = p
      const { updatedAt: expectedUpdatedAt, ...expectedIdentity } = m.identity
      if (!isDeepStrictEqual(identity, expectedIdentity)) return result("VALIDATION_FAILURE")
      if (apiFootballId === m.providerId) {
        // Do not silently repair partial legacy associations or overwrite their attempts.
        return result(attempt?.status === "matched" && attempt.lastApiFootballId === m.providerId
          ? "ALREADY_MATCHED_SAME_ID" : "VALIDATION_FAILURE")
      }
      if (attempt) return result("VALIDATION_FAILURE") // Pilot requires a pristine attempt baseline, even if retry is due.
      if (updatedAt.getTime() !== expectedUpdatedAt.getTime()) return result("CONCURRENT_MODIFICATION")

      // Recheck the small immutable evidence pins inside the transaction as defense against TOCTOU.
      const cache = await tx.$queryRawUnsafe<{ hash: string; expiresAt: Date }[]>(
        'SELECT md5(to_jsonb(t)::text) AS hash, "expiresAt" FROM "ApiFootballTeamRosterCache" t WHERE id = $1', BARCELONA_WRITE_EVIDENCE.cacheId)
      const snapshot = await tx.clubOfficialLineupSnapshot.findUnique({ where: { id: BARCELONA_WRITE_EVIDENCE.snapshotId },
        select: { contentHash: true, clubId: true, teamExternalId: true } })
      if (cache[0]?.hash !== m.cacheRowHash || cache[0]?.expiresAt.getTime() !== m.cacheExpiresAt.getTime() || snapshot?.contentHash !== m.snapshotHash ||
          snapshot.clubId !== m.identity.clubId || snapshot.teamExternalId !== 529) abort("VALIDATION_FAILURE")
      validate(m, clock()) // Waiting for a transaction must not extend cache validity.
      progress.stage = "update"
      const changed = await tx.player.updateMany({ where: { id: p.id, apiFootballId: null, clubId: p.clubId, updatedAt },
        data: { apiFootballId: m.providerId } })
      if (changed.count !== 1) abort("CONCURRENT_MODIFICATION")
      progress.stage = "attempt"
      await tx.apiFootballPlayerMatchAttempt.create({ data: {
        playerId: p.id, status: "matched", attempts: 1, lastApiFootballId: m.providerId,
        lastConfidence: m.confidence, lastNameScore: m.nameScore, lastBirthMatches: m.birthMatches,
        lastNationalityMatches: m.nationalityMatches, lastClubMatches: m.clubMatches,
        lastReason: "API-Football identity pilot: AUTO_MATCH; atomic association.", lastTriedAt: clock(), nextRetryAt: null,
      } })
      validate(m, clock()) // Expiry during persistence also rolls back both records.
      progress.stage = "commit"
      return result("MATCHED")
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 })
  } catch (error) {
    // Catch OUTSIDE $transaction, so a failed attempt cannot commit the Player update.
    if (error instanceof AtomicAbort) return result(error.status)
    const code = codeOf(error)
    if (code === "P2034" || code === "40001" || code === "40P01") return result("CONCURRENT_MODIFICATION")
    if (code === "P2002" && progress.stage === "update") return result("CONFLICT_PROVIDER_ID_TAKEN")
    if (progress.stage === "attempt") return result("ATTEMPT_FAILURE")
    // A lost connection during COMMIT is not proof of rollback. Never auto-retry it.
    if (progress.stage === "commit") return result("INDETERMINATE_COMMIT")
    return result("VALIDATION_FAILURE")
  }
}
