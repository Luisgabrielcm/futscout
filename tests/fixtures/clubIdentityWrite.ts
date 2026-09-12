import assert from "node:assert/strict"
import type { PrismaClient } from "../../app/generated/prisma/client"
import { clubIdentityFixture, identityNow } from "./clubIdentity"
import { clubIdentityHash, runClubPlayerIdentityPipeline, type ClubIdentityEvidence } from "../../services/clubPlayerIdentityPipeline"
import { IDENTITY_AUDIT_TABLES, type IdentityWriteAudit } from "../../services/playerIdentityWritePilot"
import { createClubIdentityAuthorizationSummary, clubIdentityWriteToken } from "../../services/clubIdentityAuthorization"
import { createPrismaClubIdentityWriteDependencies, executeClubIdentityAutoWrite, type ClubIdentityAutoWriteInput } from "../../services/clubIdentityAutoWrite"

type Attempt = { id: string; playerId: string; status: string; lastApiFootballId: number; nextRetryAt: Date | null; [key: string]: unknown }
export class ClubIdentityFakeDatabase {
  evidence: ClubIdentityEvidence
  attempts: Attempt[] = []
  writeTransactions = 0
  readTransactions = 0
  events: string[] = []
  failAttemptFor = ""
  indeterminateFor = ""
  commitDespiteError = false
  corruptProtectedAfterCommit = false
  protectedVersion = 0
  onRead?: (n: number) => void
  onWrite?: (draft: ClubIdentityEvidence) => void
  constructor(evidence: ClubIdentityEvidence) { this.evidence = structuredClone(evidence) }
  audit(evidence = this.evidence, attempts = this.attempts): IdentityWriteAudit {
    const players = evidence.players.map(p => {
      const { attempt: _attempt, ...fields } = p; void _attempt
      const { apiFootballId, updatedAt: _updatedAt, ...protectedFields } = fields; void _updatedAt
      return { id: p.id, apiFootballId, protectedHash: clubIdentityHash(protectedFields), hash: clubIdentityHash(fields) }
    })
    const rows = attempts.map(a => ({ id: a.id, playerId: a.playerId, hash: clubIdentityHash(a), data: structuredClone(a) }))
    const tables = Object.fromEntries(IDENTITY_AUDIT_TABLES.map(t => [t, { count: "1", hash: `protected-${this.protectedVersion}` }])) as IdentityWriteAudit["tables"]
    tables.Player = { count: String(players.length), hash: clubIdentityHash(players) }
    tables.ApiFootballPlayerMatchAttempt = { count: String(rows.length), hash: clubIdentityHash(rows) }
    return { tables, players, attempts: rows }
  }
  client() { return { $transaction: this.transaction.bind(this) } as unknown as PrismaClient }
  async transaction<T>(body: (tx: unknown) => Promise<T>, options: { isolationLevel: string }) {
    const writable = options.isolationLevel === "Serializable"
    assert.ok(writable || options.isolationLevel === "RepeatableRead")
    if (writable) this.writeTransactions++; else { this.readTransactions++; this.onRead?.(this.readTransactions) }
    const draft = structuredClone(this.evidence), attempts = structuredClone(this.attempts)
    if (writable) this.onWrite?.(draft)
    let dirty = false, changedPlayer = ""
    const tx = {
      $executeRawUnsafe: async (sql: string) => { assert.equal(sql, "SET TRANSACTION READ ONLY"); assert.equal(writable, false) },
      $queryRawUnsafe: async (sql: string, id?: string) => {
        if (sql === "SHOW transaction_read_only") return [{ transaction_read_only: "on" }]
        if (sql.startsWith("SELECT count")) {
          const table = /FROM "([^"]+)"/.exec(sql)![1] as typeof IDENTITY_AUDIT_TABLES[number]
          return [this.audit(draft, attempts).tables[table]]
        }
        if (sql.includes('AS "protectedHash"')) return this.audit(draft, attempts).players
        if (sql.includes('to_jsonb(t) AS data')) return this.audit(draft, attempts).attempts
        assert.match(sql, /^SELECT md5/); assert.equal(id, draft.cache?.id)
        return [{ hash: draft.cacheRowHash, expiresAt: draft.cache!.expiresAt }]
      },
      club: { findMany: async () => [draft.club] },
      apiFootballTeamRosterCache: { findUnique: async () => draft.cache },
      clubOfficialLineupSnapshot: {
        findMany: async () => draft.snapshot ? [draft.snapshot] : [],
        findUnique: async () => draft.snapshot ? { contentHash: draft.snapshot.contentHash, clubId: draft.snapshot.clubId, teamExternalId: draft.snapshot.teamExternalId } : null,
      },
      player: {
        findMany: async () => draft.players.map(({ attempt, ...p }) => ({ ...p, apiFootballMatchAttempt: attempt })),
        findUnique: async ({ where }: { where: { id?: string; apiFootballId?: number } }) => {
          const p = draft.players.find(p => where.id ? p.id === where.id : p.apiFootballId === where.apiFootballId)
          if (!p) return null
          if (!where.id) return { id: p.id }
          const { attempt: _attempt, ...fields } = p; void _attempt; return fields
        },
        updateMany: async ({ where, data }: { where: { id: string; clubId: string; apiFootballId: null; updatedAt: Date }; data: { apiFootballId: number } }) => {
          assert.equal(writable, true); assert.equal(where.apiFootballId, null); assert.deepEqual(Object.keys(data), ["apiFootballId"])
          const p = draft.players.find(p => p.id === where.id && p.clubId === where.clubId && p.apiFootballId === null && p.updatedAt.getTime() === where.updatedAt.getTime())
          if (!p) return { count: 0 }
          if (draft.players.some(p => p.apiFootballId === data.apiFootballId)) throw { code: "P2002" }
          p.apiFootballId = data.apiFootballId; p.updatedAt = identityNow; dirty = true; changedPlayer = p.id
          this.events.push(`update:${p.id}`); return { count: 1 }
        },
      },
      apiFootballPlayerMatchAttempt: {
        findUnique: async ({ where }: { where: { playerId: string } }) => attempts.find(a => a.playerId === where.playerId) ?? null,
        create: async ({ data }: { data: Omit<Attempt, "id"> & { playerId: string; status: string; lastApiFootballId: number; nextRetryAt: Date | null } }) => {
          assert.equal(writable, true)
          if (data.playerId === this.failAttemptFor) throw new Error("fake attempt failure")
          if (attempts.some(a => a.playerId === data.playerId)) throw { code: "P2002" }
          const a = { ...data, id: `attempt-${data.playerId}` } as Attempt; attempts.push(a)
          draft.players.find(p => p.id === data.playerId)!.attempt = { status: a.status, lastApiFootballId: a.lastApiFootballId, nextRetryAt: a.nextRetryAt }
          this.events.push(`attempt:${data.playerId}`); return a
        },
      },
    }
    try {
      const result = await body(tx)
      if (dirty && changedPlayer === this.indeterminateFor && !this.commitDespiteError) throw new Error("commit response lost")
      if (dirty) { this.evidence = draft; this.attempts = attempts; this.events.push(`commit:${changedPlayer}`) }
      if (dirty && this.corruptProtectedAfterCommit) this.protectedVersion++
      if (dirty && changedPlayer === this.indeterminateFor) throw new Error("commit response lost")
      return result
    } catch (error) { if (writable) this.events.push(`abort-or-unknown:${changedPlayer}`); throw error }
  }
}

export function clubWriteFixture(size = 2, team = 529, slug = "fc-barcelona") {
  const f = clubIdentityFixture(team, slug, size), db = new ClubIdentityFakeDatabase(f.evidence)
  const head = "a".repeat(40), git = { branch: "beta-next", clean: true, head }
  const clock = { now: identityNow }
  const deps = createPrismaClubIdentityWriteDependencies(db.client(), f.config, () => git, () => clock.now)
  const input = (): ClubIdentityAutoWriteInput => {
    const report = runClubPlayerIdentityPipeline(f.config, db.evidence, clock.now)
    return { mode: "AUTO_WRITE", config: f.config, report, summary: createClubIdentityAuthorizationSummary(report).summary,
      confirmation: clubIdentityWriteToken(report), expectedHead: head }
  }
  return { ...f, db, git, clock, deps, input, run: () => executeClubIdentityAutoWrite(input(), deps) }
}
