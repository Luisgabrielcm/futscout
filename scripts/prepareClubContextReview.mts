/** Local-file proposal preparation only. No database, HTTP, import or publication client. */
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { canonicalJson, validateClubContexts, type ClubContexts, type RosterReference } from "../lib/clubContexts"

const input = resolve(process.argv[2] ?? "audit/output/fc27-game-vs-real-20261112")
const output = resolve(process.argv[3] ?? "audit/output/club-context-proposals")
type AuditRow = {
  eaPlayerId: string; name: string; category: string; publicClub: { eaId: string }
  frozenGameDb: { status: string; clubLinks: { eaTeamId: string }[]; specialLinks: { eaTeamId: string }[]; nationalTeams: { eaTeamId: string }[] }
  realClub: { name: string; eaClubId: string; evidenceUrl: string }
  eaRatingsClub?: { teamId: string }
  [key: string]: unknown
}
const json = async (file: string) => JSON.parse(await readFile(resolve(input, file), "utf8"))
const lines = async (file: string): Promise<AuditRow[]> => (await readFile(resolve(input, file), "utf8"))
  .trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
const sha = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex")
const summary = await json("summary.private.json")
const snapshot: RosterReference = {
  id: `fc27-template-${summary.sourcePins.binarySha256}`, gameVersion: "FC27", origin: "THIRD_PARTY_TEMPLATE",
  sourceUrl: `https://github.com/ViniMacacari/eafc-db-kit/blob/${summary.sourcePins.commit}/templates/FC%2027/fifa_ng_db.db`,
  contentHash: summary.sourcePins.binarySha256, observedAt: summary.checkedAt,
  effectiveAt: null, effectiveDateEvidence: null, platform: null, gameBuild: null, rosterVersion: null, approvedForCareer: false,
}
const four = await lines("direct-link-corrections.private.jsonl")
assert.deepEqual(four.map(row => row.eaPlayerId).sort(), ["218191", "225964", "261176", "83924"].sort())
const corrections = four.map(row => {
  assert.equal(row.frozenGameDb.status, "NG_FA_IN_GAME_NOT_REAL_FREE_AGENT_PROOF")
  assert.equal(row.frozenGameDb.clubLinks.length, 0)
  const contexts: ClubContexts = { eaPlayerId: row.eaPlayerId,
    game: { status: "NG_FA", club: null, nativeTeamIds: [...row.frozenGameDb.specialLinks, ...row.frozenGameDb.nationalTeams]
      .map(link => link.eaTeamId), nativeClubTeamIds: row.frozenGameDb.clubLinks.map(link => link.eaTeamId),
      snapshot, authenticity: "UNVERIFIED", evidenceHash: sha(row.frozenGameDb) },
    real: { status: "CLUB", club: { name: row.realClub.name, eaId: row.realClub.eaClubId }, sourceUrl: row.realClub.evidenceUrl,
      observedAt: summary.checkedAt, effectiveAt: null, evidenceKind: "CACHED_SOURCE_REVIEW", evidenceHash: sha(row.realClub) } }
  validateClubContexts(contexts, row.eaPlayerId)
  return { name: row.name, eaPlayerId: row.eaPlayerId, contexts, contentHash: sha(contexts),
    status: "PROPOSAL_ONLY", evidenceTiming: "CACHED_EVIDENCE_REVIEW_TIME_NOT_NEW_SOURCE_FETCH",
    legacyProjectionProposal: { expectedClubEaId: row.publicClub.eaId, proposedClubEaId: null },
    preserve: ["economic-data", "potential", "contracts", "manual-edits", "public-visibility"],
    productionWriteAllowed: false }
})
const identity = await lines("club-identity-corrections.private.jsonl")
const homonyms = identity.filter(row => row.category.startsWith("HOMONYM_"))
assert.equal(homonyms.length, 27)
assert.equal(new Set(homonyms.map(row => row.eaPlayerId)).size, 27)
for (const row of homonyms) {
  const nacional = row.category === "HOMONYM_NACIONAL_PORTUGAL_VS_URUGUAY"
  assert.equal(row.publicClub.eaId, nacional ? "1891" : "101085")
  assert.equal(row.eaRatingsClub!.teamId, nacional ? "111325" : "112615")
}
const missing = [...identity.filter(row => row.category === "PUBLIC_CLUB_MISSING"),
  ...await lines("missing-game-club-links.private.jsonl")].map(row => ({ ...row,
    status: "PROPOSAL_ONLY", source: row.eaRatingsClub ? "EA_RATINGS" : "THIRD_PARTY_TEMPLATE",
    requiresReferenceApproval: true, realClubInferenceAllowed: false, productionWriteAllowed: false }))
assert.equal(missing.length, 577)
assert.equal(new Set(missing.map(row => row.eaPlayerId)).size, 577)
const groups: { category: string; eaTeamId: string; name: string; rows: { eaPlayerId: string; name: string }[] }[] =
  await json("brazil-roster-review.private.json")
const suspected = groups.filter(group => group.category !== "REAL_ROSTER_EVIDENCE_BAHIA_BOTAFOGO")
  .flatMap(group => group.rows.map(row => ({ ...row, clubEaId: group.eaTeamId, clubName: group.name,
    authenticity: "UNVERIFIED", reviewReason: "SUSPECTED_GENERIC_CLUSTER_NO_PER_PLAYER_FLAG",
    nextEvidence: "VERIFY_NATIVE_EA_ID_AND_INDEPENDENT_IDENTITY_OR_GAME_EDITOR_GENERIC_FLAG",
    deleteAllowed: false, publicVisibilityChangeAllowed: false })))
assert.equal(suspected.length, 240)
assert.equal(new Set(suspected.map(row => row.eaPlayerId)).size, 240)
await mkdir(output, { recursive: true })
for (const [file, data] of Object.entries({ "four-context-proposals.private.json": corrections,
  "homonyms-27.private.json": homonyms, "suspected-generic-240.private.json": suspected,
  "missing-club-577.private.json": missing })) await writeFile(resolve(output, file), JSON.stringify(data, null, 2) + "\n")
await writeFile(resolve(output, "summary.private.json"), JSON.stringify({ status: "PROPOSALS_ONLY_NO_DB_OR_HTTP",
  four: corrections.length, homonyms: homonyms.length, suspectedGeneric: suspected.length,
  missingClubs: missing.length, careerReferenceApproved: false, remaining184Blocked: true,
  other3040ChangesPrepared: 0, sourceSummaryHash: sha(summary) }, null, 2) + "\n")
console.log(JSON.stringify({ four: 4, homonyms: 27, suspectedGeneric: 240, missingClubs: 577, productionWrites: 0 }))
