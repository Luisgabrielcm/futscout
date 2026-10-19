/** Pure offline preparation. No network, persistence, fitting or publication. */
import { hash } from './engine'
import { assessReference } from './reference-eligibility'
import { prepareContextualInput, type ContextualInput } from './contextual-input'

export type MlsRow = {
  first_name: string; last_name: string; club: string; position: string
  base_salary: string; guaranteed_comp: string
}
export type Snapshot = {
  url: string; contentHash: string; edition: string; declaredReferenceAt: string | null
  observedAt: string; rows: MlsRow[]
}
const clean = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
/** Source comparison key only; never a FutScout identity assertion. */
export const mlsSourceKey = (r: MlsRow) => JSON.stringify([clean(r.first_name), clean(r.last_name), clean(r.club)])
function cents(raw: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw Error('INVALID_DECIMAL')
  const [whole, fraction = ''] = raw.split('.')
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(n)) throw Error('UNSAFE_AMOUNT')
  return n
}

/** Strict CSV, including quoted fields/newlines; reject rather than drop malformed rows. */
export function parseMlsCsv(input: string): MlsRow[] {
  const table: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false
  const cell = () => { row.push(field); field = ''; closed = false }
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { quoted = false; closed = true }
      else field += c
    } else if (c === '"') {
      if (field || closed) throw Error('INVALID_CSV_QUOTE')
      quoted = true
    } else if (c === ',') cell()
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++
      cell(); table.push(row); row = []
    } else { if (closed) throw Error('INVALID_CSV_TRAILING_TEXT'); field += c }
  }
  if (quoted) throw Error('UNTERMINATED_CSV')
  if (field || row.length || closed) { cell(); table.push(row) }
  const header = table.shift()?.map(s => s.replace(/^\uFEFF/, '')) ?? []
  const required = ['first_name', 'last_name', 'club', 'position', 'base_salary', 'guaranteed_comp'] as const
  if (new Set(header).size !== header.length || required.some(k => !header.includes(k))) throw Error('INVALID_CSV_HEADER')
  return table.map(values => {
    if (values.length !== header.length) throw Error('INVALID_CSV_WIDTH')
    if (header.includes('year') && values[header.indexOf('year')] !== '2026') throw Error('NON_2026_RECORD')
    const r = Object.fromEntries(required.map(k => [k, values[header.indexOf(k)]])) as MlsRow
    validateRow(r); return r
  })
}
function validateRow(r: MlsRow) {
  if (![r.first_name, r.last_name, r.club, r.position].every(x => typeof x === 'string' && x.trim())) throw Error('MISSING_SOURCE_CONTEXT')
  cents(r.base_salary); cents(r.guaranteed_comp)
}
function index(s: Snapshot) {
  if (!s.url.trim() || !s.edition.trim() || !/^[a-f0-9]{64}$/.test(s.contentHash) || !Number.isFinite(Date.parse(s.observedAt))) throw Error('SNAPSHOT_PROVENANCE_REQUIRED')
  const groups = new Map<string, MlsRow[]>()
  for (const r of s.rows) { validateRow(r); const k = mlsSourceKey(r); groups.set(k, [...(groups.get(k) ?? []), r]) }
  return groups
}
export function reconcileMls(official: Snapshot, csv: Snapshot) {
  if (official.edition !== csv.edition) throw Error('EDITION_RECONCILIATION_REQUIRED')
  const a = index(official), b = index(csv)
  const records = [...new Set([...a.keys(), ...b.keys()])].sort().map(key => {
    const left = a.get(key) ?? [], right = b.get(key) ?? []
    const row = left[0] ?? right[0]
    const status = left.length > 1 || right.length > 1 ? 'AMBIGUOUS_DUPLICATE' :
      !left.length ? 'CSV_ONLY' : !right.length ? 'OFFICIAL_ONLY' :
        cents(left[0].base_salary) !== cents(right[0].base_salary) || cents(left[0].guaranteed_comp) !== cents(right[0].guaranteed_comp) ? 'DIVERGENT' : 'COINCIDENT'
    return { key, status, row, currency: 'USD' as const, period: 'YEAR' as const,
      tax: 'UNKNOWN' as const, effectiveAt: null, officialRows: left, csvRows: right,
      positionAgrees: left.length === 1 && right.length === 1 ? clean(left[0].position) === clean(right[0].position) : null }
  })
  const summary = Object.fromEntries(['COINCIDENT', 'DIVERGENT', 'CSV_ONLY', 'OFFICIAL_ONLY', 'AMBIGUOUS_DUPLICATE'].map(s => [s, records.filter(r => r.status === s).length]))
  return { edition: official.edition, sources: [official, csv].map(({ rows, ...s }) => ({ ...s, rowCount: rows.length })), records, summary,
    reconciliationHash: hash({ official, csv }), trainingAllowed: false as const, publicationAllowed: false as const }
}

export type ReviewedLink = { sourceKey: string; evidenceReference: string; input: ContextualInput }
type Reconciled = ReturnType<typeof reconcileMls>
/** A reviewed input is an assertion, not a database join or a license verifier. */
export function prepareMlsPilot(reconciled: Reconciled, links: ReviewedLink[], editionConfirmed: boolean) {
  const mappings = new Map<string, ReviewedLink>()
  for (const link of links) {
    if (mappings.has(link.sourceKey)) throw Error('DUPLICATE_REVIEWED_LINK')
    if (!reconciled.records.some(r => r.key === link.sourceKey)) throw Error('ORPHAN_REVIEWED_LINK')
    mappings.set(link.sourceKey, link)
  }
  const prepared = reconciled.records.map(r => {
    const blockers: string[] = []
    if (!editionConfirmed) blockers.push('EDITION_CUTOFF_UNRESOLVED')
    if (r.status !== 'COINCIDENT') blockers.push(r.status)
    if (r.positionAgrees === false) blockers.push('POSITION_DIVERGENCE')
    const link = mappings.get(r.key)
    let context: ReturnType<typeof prepareContextualInput> | null = null
    let assessment: ReturnType<typeof assessReference> | null = null
    if (!link) blockers.push('NO_REVIEWED_CATALOG_IDENTITY')
    else {
      const ref = link.input.reference
      if (!link.evidenceReference.trim() || ref.identity.confidence !== 'HIGH' || !ref.identity.sourcePlayerId.trim() || !ref.identity.evidenceReference.trim()) blockers.push('IDENTITY_EVIDENCE_REQUIRED')
      if (ref.nature !== 'OBSERVED' || ref.salary.source !== 'MLSPA' || ref.sourceReference !== reconciled.sources[0].url ||
        ref.salary.currency !== 'USD' || ref.salary.period !== 'YEAR' || ref.salary.component !== 'BASE' ||
        ref.salary.amount !== cents(r.row.base_salary) / 100 || link.input.guaranteedAnnualUSD !== cents(r.row.guaranteed_comp) / 100 ||
        ref.salary.observedAt !== reconciled.sources[0].observedAt) blockers.push('SOURCE_LABEL_OR_PROVENANCE_MISMATCH')
      if (link.input.leagueId !== 'MLS' || ref.context.season !== '2026' || !link.input.position ||
        link.input.affiliation.status === 'UNKNOWN' || !link.input.affiliation.evidenceReference?.trim() ||
        !link.input.affiliation.payerClubId || !link.input.affiliation.playingClubId) blockers.push('MLS_2026_CONTEXT_REQUIRED')
      try {
        assessment = assessReference(ref)
        context = prepareContextualInput(link.input)
        blockers.push(...assessment.reasons.map(reason => reason.code))
      } catch { blockers.push('INVALID_CONTEXT_INPUT') }
    }
    const uniqueBlockers = [...new Set(blockers)].sort()
    const technicalBlockers = uniqueBlockers.filter(x => !['RIGHTS_NOT_DOCUMENTED', 'RIGHTS_RESTRICTED'].includes(x))
    return { sourceKey: r.key, original: r, context, assessment, blockers: uniqueBlockers,
      technicallyReady: technicalBlockers.length === 0,
      rightsAndSemanticsApproved: assessment !== null && !assessment.reasons.some(x => ['RIGHTS_UNKNOWN', 'SEMANTICS_INCOMPATIBLE'].includes(x.classification)) }
  })
  const linked = prepared.filter(r => r.context !== null && !r.blockers.some(b => ['IDENTITY_EVIDENCE_REQUIRED', 'SOURCE_LABEL_OR_PROVENANCE_MISMATCH'].includes(b)))
  const playerIds = linked.map(r => r.context!.playerId)
  if (new Set(playerIds).size !== playerIds.length) throw Error('PLAYER_LEAKAGE_OR_DUPLICATE')
  const coverage = (group: (r: typeof prepared[number]) => string) => {
    const counts: Record<string, number> = {}
    for (const r of prepared) { const k = group(r); counts[k] = (counts[k] ?? 0) + 1 }
    return counts
  }
  return { version: 'wage-mls-pilot-v0.1', reconciliation: reconciled, prepared,
    counts: { sourceRecords: prepared.length, linkedPlayers: linked.length, technicallyReady: prepared.filter(r => r.technicallyReady).length,
      rightsAndSemanticsApproved: prepared.filter(r => r.rightsAndSemanticsApproved).length, eligible: prepared.filter(r => !r.blockers.length).length },
    coverage: { club: coverage(r => r.original.row.club), position: coverage(r => r.original.row.position),
      age: coverage(r => r.context ? String(Math.floor(r.context.features.ageYears / 5) * 5) + '-' + String(Math.floor(r.context.features.ageYears / 5) * 5 + 4) : 'UNKNOWN'),
      annualBaseUSD: coverage(r => { const n = cents(r.original.row.base_salary) / 100; return n < 100000 ? '<100k' : n < 250000 ? '100k-250k' : n < 1000000 ? '250k-1m' : n < 5000000 ? '1m-5m' : '>=5m' }) },
    quarantineKeys: prepared.filter(r => r.blockers.length).map(r => r.sourceKey),
    baselineEvaluation: {
      status: 'BLOCKED_NO_AUTHORIZED_REAL_EXECUTION', metrics: null,
      baselines: ['TRAIN_ONLY_GLOBAL_MEDIAN', 'TRAIN_ONLY_LEAGUE_SEASON_MEDIAN'],
      metricsModule: 'contextual-evaluation.ts#pointMetrics',
      metricsPlanned: ['MAE_EUR_WEEK', 'MEDIAN_ABSOLUTE_PERCENTAGE_ERROR', 'MAE_LOG', 'SIGNED_BIAS'],
      tailPolicy: 'Freeze salary bands before evaluation; report low/high bands and denominators without winsorizing away extremes.',
      splitsPolicy: 'Source-only preview is not an identity split; freeze verified player groups and temporal cutoff before fitting; one edition cannot validate forward generalization.',
      intervals: null,
    },
    trainingAllowed: false as const, publicationAllowed: false as const }
}

/** Preview only: whole clubs, connected through conservative source names, stay together.
 * No monetary label affects allocation. Never convert an unresolved source key to Player.id. */
export function planMlsSplits(rows: MlsRow[]) {
  const parent = new Map<string, string>()
  const root = (x: string): string => { const p = parent.get(x); if (!p) { parent.set(x, x); return x }; if (p === x) return x; const r = root(p); parent.set(x, r); return r }
  const join = (a: string, b: string) => { const x = root(a), y = root(b); if (x !== y) parent.set(x < y ? y : x, x < y ? x : y) }
  for (const r of rows) { validateRow(r); join('club:' + clean(r.club), 'name:' + clean(r.first_name + ' ' + r.last_name)) }
  const groups = new Map<string, Set<string>>()
  for (const r of rows) { const k = root('club:' + clean(r.club)); groups.set(k, new Set([...(groups.get(k) ?? []), mlsSourceKey(r)])) }
  const ordered = [...groups.values()].map(s => [...s].sort()).sort((a, b) => hash(a) < hash(b) ? -1 : hash(a) > hash(b) ? 1 : 0)
  if (ordered.length < 3) return { status: 'INSUFFICIENT_GROUPS', train: [], validation: [], test: [], trainingAllowed: false as const }
  const n = Math.max(1, Math.floor(ordered.length * .6)), v = Math.max(1, Math.floor(ordered.length * .2))
  return { status: 'SOURCE_GROUP_PREVIEW_NOT_APPROVED', train: ordered.slice(0, n).flat(), validation: ordered.slice(n, n + v).flat(), test: ordered.slice(n + v).flat(), trainingAllowed: false as const }
}
