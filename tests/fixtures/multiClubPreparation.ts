import { clubIdentityFixture, identityNow } from "./clubIdentity"
import { runMultiClubIdentityPipeline } from "../../services/multiClubIdentityPipeline"
import { clubIdentityHash } from "../../services/clubPlayerIdentityPipeline"
export function multiClubPreparationFixture() {
  const clubs = Array.from({ length: 5 }, (_, i) => {
    const f = clubIdentityFixture(100 + i, `synthetic-${i}`, 6)
    f.config.cache.expectedRowHash = f.evidence.cacheRowHash = String(i).repeat(32)
    f.players.forEach((p, j) => { p.id = `c${i}-p${j}`; p.slug = p.id })
    f.roster.forEach((p, j) => { p.player.id = 10000 + i * 100 + j })
    return f
  })
  const run = () => runMultiClubIdentityPipeline({ clubs: clubs.map(c => c.config), mode: "DRY_RUN" }, {
    load: async c => ({ status: "READY", evidence: clubs.find(f => f.config.clubId === c.clubId)!.evidence }),
    audit: async () => true,
  }, identityNow)
  // Explicit scoring fakes for ranking/transaction-model tests; matcher tests remain separate.
  const rankedReport = async () => {
    const r = await run()
    const margins = [[75,75,75,75,53,30], [85,85,85,85,75,30], [75,75,75,75,75,30],
      [85,85,75,75,75,30], [85,85,85,75,75,30]]
    r.clubs.forEach((c, i) => {
      c.report!.rows.forEach((row, j) => { row.margin = margins[i][j] })
      const ordered = [...c.report!.rows].sort((a,b) => (b.margin ?? -1) - (a.margin ?? -1) || a.providerPlayerId - b.providerPlayerId)
      const candidates = ordered.map(row => ({ playerId: row.localCandidate!.playerId, slug: row.localCandidate!.slug,
        providerId: row.providerPlayerId, confidence: row.confidence!, margin: row.margin, expectedUpdatedAt: row.localCandidate!.expectedUpdatedAt }))
      c.summary.orderedAutoMatchCandidates = candidates.slice(0,5); c.deferred = candidates.slice(5)
      c.dryRunHash = clubIdentityHash({ config: c.report!.config, status: c.status, reason: c.reason, summary: c.summary,
        deferred: c.deferred, inputHash: c.report!.inputHash, rows: c.report!.rows, localAssociations: c.report!.localAssociations })
    })
    r.envelope.clubs = r.clubs.map(c => ({ ...c.summary, status: c.status, reason: c.reason, dryRunHash: c.dryRunHash }))
    r.batchHash = clubIdentityHash(r.envelope)
    return r
  }
  return { clubs, run, rankedReport }
}
