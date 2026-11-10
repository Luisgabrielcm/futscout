import { createHash } from "node:crypto"
import { normalizeMatcherText } from "./apiFootballPlayerMatcherCore"

type Person = { name: string; birth: string | null; nationality: string | null; position: string | null }
export type FootyIdentityPlayer = Person & { playerId: string; eaId: string; apiFootballId: number | null; clubId: string | null; season: string | null }
export type FootyIdentitySource = Person & { footyStatsId: number; clubId: number | null; season: string | null }
export type FootyEvidenceReference = { documentId: string; sha256: string; pointer: string }
// Records must be normalized by the caller from independently sourced evidence.
// Hashes prove byte integrity, not authenticity or supplier independence.
export type FootyEvidenceRecord = Person & { eaId: string; apiFootballId: number | null }
export type FootyIdentityInput = {
  source: FootyIdentitySource
  catalog: readonly FootyIdentityPlayer[]
  sources: readonly FootyIdentitySource[]
  owners: readonly { footyStatsId: number; eaId: string }[]
  documents: readonly { id: string; contents: string }[]
  evidence: readonly { eaId: string; origin: "API_FOOTBALL" | "OFFICIAL" | "FOOTYSTATS" | "COHORT"; reference: FootyEvidenceReference }[]
  corrections: readonly { original: FootyEvidenceReference; replacement: FootyEvidenceReference; reason: string; approvedBy: string }[]
  // Explicit crosswalks only; equal club names never establish this mapping.
  clubMaps: readonly { footyClubId: number; eaClubId: string; season: string; reference: FootyEvidenceReference }[]
}

const norm = normalizeMatcherText
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
function day(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}
const equalName = (a: Person, b: Person) => !!norm(a.name) && norm(a.name) === norm(b.name)
const sameReference = (a: FootyEvidenceReference, b: FootyEvidenceReference) => a.documentId === b.documentId && a.sha256 === b.sha256 && a.pointer === b.pointer

function resolveRecord(input: FootyIdentityInput, ref: FootyEvidenceReference): Record<string, unknown> | null {
  const docs = input.documents.filter(d => d.id === ref.documentId)
  if (docs.length !== 1 || !/^[a-f0-9]{64}$/.test(ref.sha256) ||
    createHash("sha256").update(docs[0].contents).digest("hex") !== ref.sha256 ||
    !ref.pointer.startsWith("/") || /~(?![01])/.test(ref.pointer)) return null
  try {
    let value: unknown = JSON.parse(docs[0].contents)
    for (const token of ref.pointer.slice(1).split("/")) {
      const key = token.replace(/~1/g, "/").replace(/~0/g, "~")
      if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return null
      value = (value as Record<string, unknown>)[key]
    }
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch { return null }
}

function resolve(input: FootyIdentityInput, ref: FootyEvidenceReference): FootyEvidenceRecord | null {
  const r = resolveRecord(input, ref) as FootyEvidenceRecord | null
  return r && typeof r.eaId === "string" && typeof r.name === "string" && day(r.birth) &&
    (r.apiFootballId === null || Number.isSafeInteger(r.apiFootballId) && r.apiFootballId > 0) ? r : null
}

/** Pure, conservative proposal generator. No network, persistence, or salary approval. */
export function assessFootyStatsOfflineIdentity(input: FootyIdentityInput) {
  const { source, catalog } = input
  // Secondary lookup only: never replace the primary matcher or treat compact
  // spelling as independent evidence. Even different-DOB rivals block fallback.
  const compact = (name: string) => norm(name).replace(/\s/g, "")
  const key = compact(source.name)
  const compactTargets = key ? catalog.filter(p => compact(p.name) === key) : []
  const compactSources = [source, ...input.sources].filter(p => key && compact(p.name) === key)
  const secondaryTarget = compactTargets.length === 1 &&
    new Set(compactSources.map(p => p.footyStatsId)).size === 1 &&
    day(source.birth) !== null && day(compactTargets[0].birth) === day(source.birth)
    ? compactTargets[0] : null
  const candidates = catalog.filter(p => equalName(source, p) || p === secondaryTarget ||
    input.owners.some(o => o.footyStatsId === source.footyStatsId && o.eaId === p.eaId))
  return candidates.map(p => {
    const reasons: string[] = [], references: FootyEvidenceReference[] = []
    const corrections: FootyIdentityInput["corrections"][number][] = []
    let conflict = false, independent = false
    const reject = (reason: string) => { conflict = true; reasons.push(reason) }
    const birth = day(source.birth), targetBirth = day(p.birth)
    const secondary = !equalName(source, p) && p === secondaryTarget
    if (secondary) reasons.push("SECONDARY_SPACING_MATCH")
    if (!Number.isSafeInteger(source.footyStatsId) || source.footyStatsId <= 0 || !p.playerId.trim() || !p.eaId.trim()) reject("INVALID_ID")
    if (birth && targetBirth && birth !== targetBirth) reject("BIRTH_CONFLICT")
    if (!birth || !targetBirth) reasons.push("BIRTH_MISSING_OR_INVALID")
    if (!equalName(source, p) && !secondary) reject("NAME_CONFLICT")
    if (catalog.filter(x => x.eaId === p.eaId || x.playerId === p.playerId).length !== 1 ||
      p.apiFootballId !== null && catalog.some(x => x.eaId !== p.eaId && x.apiFootballId === p.apiFootballId) ||
      input.owners.some(o => o.footyStatsId === source.footyStatsId && o.eaId !== p.eaId ||
        o.eaId === p.eaId && o.footyStatsId !== source.footyStatsId)) reject("ID_OWNERSHIP_CONFLICT")
    if (catalog.some(x => x.eaId !== p.eaId && equalName(x, source) && (!day(x.birth) || !birth || day(x.birth) === birth)) ||
      input.sources.some(x => x.footyStatsId !== source.footyStatsId && equalName(x, source) && (!day(x.birth) || !birth || day(x.birth) === birth))) reject("AMBIGUOUS_PERSON")
    if (input.sources.some(x => x.footyStatsId === source.footyStatsId && (!equalName(x, source) || day(x.birth) !== birth))) reject("SOURCE_ID_CONFLICT")
    if (source.nationality && p.nationality && norm(source.nationality) !== norm(p.nationality)) reasons.push("NATIONALITY_DIFFERENT")
    if (source.position && p.position && source.position !== p.position) reasons.push("POSITION_DIFFERENT")
    for (const e of input.evidence.filter(e => e.eaId === p.eaId)) {
      let ref = e.reference
      const fixes = input.corrections.filter(c => sameReference(c.original, ref))
      if (fixes.length) {
        const fix = fixes[0]
        if (fixes.length !== 1 || !fix.reason.trim() || !fix.approvedBy.trim() || !resolve(input, fix.original)) {
          reject("INVALID_RECTIFICATION"); continue
        }
        corrections.push(fix); ref = fix.replacement
      }
      references.push(e.reference, ref)
      const r = resolve(input, ref)
      if (!r) { reject("DOCUMENT_UNVERIFIABLE"); continue }
      if (r.eaId !== p.eaId || !(equalName(r, source) || secondary && equalName(r, p)) || day(r.birth) !== birth ||
        r.apiFootballId !== null && p.apiFootballId !== null && r.apiFootballId !== p.apiFootballId) {
        reject("DOCUMENT_PERSON_CONFLICT"); continue
      }
      if (r.nationality && source.nationality && norm(r.nationality) !== norm(source.nationality)) reasons.push("NATIONALITY_DIFFERENT")
      if (r.position && source.position && r.position !== source.position) reasons.push("POSITION_DIFFERENT")
      if (e.origin === "OFFICIAL" || e.origin === "API_FOOTBALL" && r.apiFootballId !== null && r.apiFootballId === p.apiFootballId) independent = true
    }
    if (!independent) reasons.push("INDEPENDENT_EVIDENCE_MISSING")
    const relevantMaps = input.clubMaps.filter(m => m.footyClubId === source.clubId && m.season === source.season)
    const maps = relevantMaps.filter(m => {
      references.push(m.reference)
      const r = resolveRecord(input, m.reference)
      return r?.footyClubId === m.footyClubId && r?.eaClubId === m.eaClubId && r?.season === m.season
    })
    if (maps.length !== relevantMaps.length) reject("CLUB_MAP_DOCUMENT_CONFLICT")
    let context: "CORROBORATED" | "INCOMPATIBLE" | "UNKNOWN" = "UNKNOWN"
    if (source.season && p.season && source.season !== p.season) context = "INCOMPATIBLE"
    else if (maps.length && p.clubId && source.season && p.season) {
      context = maps.every(m => m.eaClubId === p.clubId) && !input.clubMaps.some(m =>
        m.eaClubId === p.clubId && m.season === source.season && m.footyClubId !== source.clubId) ? "CORROBORATED" : "INCOMPATIBLE"
    }
    if (context !== "CORROBORATED") reasons.push(`CLUB_SEASON_${context}`)
    const mismatch = reasons.includes("POSITION_DIFFERENT") || reasons.includes("NATIONALITY_DIFFERENT")
    const classification = conflict ? "CONFLICT" : !birth || !targetBirth || mismatch ? "LOW" : independent ? "HIGH" : "MEDIUM"
    return { playerId: p.playerId, eaId: p.eaId, footyStatsId: source.footyStatsId, classification,
      reasons: [...new Set(reasons)].sort(compare), personalIdentity: { independentEvidence: independent, birthMatches: !!birth && birth === targetBirth },
      sportingContext: { state: context, season: source.season, currentClubConfirmed: false, transferProven: false },
      evidenceReferences: [...new Map(references.map(r => [JSON.stringify(r), r])).values()].sort((a,b) => compare(JSON.stringify(a), JSON.stringify(b))),
      rectifications: [...corrections].sort((a,b) => compare(JSON.stringify(a), JSON.stringify(b))),
      salaryEligibility: { trainingAllowed: false, publicationAllowed: false, reason: "SALARY_NOT_ASSESSED" }, writable: false,
    } as const
  }).sort((a,b) => compare(a.eaId, b.eaId) || compare(a.playerId, b.playerId) || compare(JSON.stringify(a), JSON.stringify(b)))
}
