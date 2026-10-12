/** Offline evaluation protocol. No trainer, file loader or real-data execution. */
import { hash, normalizeBase, target } from './engine'
import { prepareContextualInput, type ContextualInput } from './contextual-input'
import { predictContextualSynthetic, type ContextualArtifact, type SyntheticRow, type Splits, type FallbackMode } from './contextual-engine'

export function prepareSyntheticEvaluationRows(inputs: ContextualInput[]): SyntheticRow[] {
  return inputs.map(input => {
    if (input.reference.salary.source !== 'SYNTHETIC') throw Error('REAL_DATA_EXECUTION_FORBIDDEN')
    const prepared = prepareContextualInput(input)
    if (prepared.eligibility.reasons.length !== 0 || prepared.features.position === null)
      throw Error('INELIGIBLE_REFERENCE')
    const { leagueId, clubId, season, position, ageYears } = prepared.features
    return { playerId: prepared.playerId, source: 'SYNTHETIC', leagueId, clubId, season, position, ageYears,
      salary: input.reference.salary, ...(input.reference.fx ? { fx: input.reference.fx } : {}) }
  })
}
function actual(row: SyntheticRow) {
  if (row.source !== 'SYNTHETIC' || row.salary.source !== 'SYNTHETIC') throw Error('REAL_DATA_EXECUTION_FORBIDDEN')
  const amount = normalizeBase(row.salary, row.fx).amountEURWeekly
  if (amount === null || !Number.isFinite(amount) || amount <= 0) throw Error('INVALID_LABEL')
  return amount
}
/** One observation per verified player; reject transfers/repeats until grouped identity handling exists.
 * Whole Club.id groups, including across competitions, are indivisible.
 */
export function splitByClub(rows: SyntheticRow[], heldOutLeagues: string[] = []) {
  const ids = new Set<string>(), editions = new Map<string, string>(), groups = new Map<string, SyntheticRow[]>()
  for (const r of rows) {
    actual(r)
    if (!r.playerId?.trim() || !r.clubId?.trim() || !r.leagueId?.trim() || !r.season?.trim()) throw Error('MISSING_CONTEXT')
    if (ids.has(r.playerId)) throw Error('PLAYER_LEAKAGE_OR_DUPLICATE')
    ids.add(r.playerId)
    if (editions.has(r.leagueId) && editions.get(r.leagueId) !== r.season) throw Error('MIXED_SEASONS')
    editions.set(r.leagueId, r.season)
    groups.set(r.clubId, [...(groups.get(r.clubId) ?? []), r])
  }
  if (heldOutLeagues.some(l => !editions.has(l))) throw Error('UNKNOWN_HELD_OUT_LEAGUE')
  const clubs = [...groups.keys()].sort((a, b) => {
    const x = hash(a), y = hash(b)
    return x < y ? -1 : x > y ? 1 : 0
  })
  const reserved = clubs.filter(c => groups.get(c)!.some(r => heldOutLeagues.includes(r.leagueId)))
  const remaining = clubs.filter(c => !reserved.includes(c))
  if (remaining.length < (reserved.length ? 2 : 3)) throw Error('INSUFFICIENT_CLUBS')
  const trainCount = reserved.length ? Math.max(1, Math.floor(remaining.length * 0.8)) : Math.max(1, Math.floor(remaining.length * 0.6))
  const calibrationCount = reserved.length ? remaining.length - trainCount : Math.max(1, Math.floor(remaining.length * 0.2))
  const allocation = { train: remaining.slice(0, trainCount), calibration: remaining.slice(trainCount, trainCount + calibrationCount),
    test: [...remaining.slice(trainCount + calibrationCount), ...reserved] }
  const materialize = (cs: string[]) => cs.flatMap(c => [...groups.get(c)!].sort((a, b) => a.playerId < b.playerId ? -1 : 1))
  const splits: Splits = { train: materialize(allocation.train), calibration: materialize(allocation.calibration), test: materialize(allocation.test) }
  const manifest = { version: 'wage-contextual-evaluation-v0.1', allocation, heldOutLeagues: [...new Set(heldOutLeagues)].sort(),
    ids: Object.fromEntries(Object.entries(splits).map(([k, rs]) => [k, rs.map(r => r.playerId)])),
    inputHash: hash([...rows].sort((a, b) => a.playerId < b.playerId ? -1 : 1)) }
  return { splits, manifest, selectionHash: hash(manifest) }
}
const positive = (n: number) => Number.isFinite(n) && n > 0
export function pointMetrics(pairs: { actual: number; predicted: number }[]) {
  if (!pairs.length) return null
  const errors = pairs.map(p => {
    if (!positive(p.actual) || !positive(p.predicted)) throw Error('INVALID_METRIC_INPUT')
    const bias = p.predicted - p.actual, percentage = Math.abs(bias) / p.actual * 100
    if (!Number.isFinite(percentage)) throw Error('NUMERIC_FAILURE')
    return { bias, absolute: Math.abs(bias), percentage, log: Math.abs(Math.log(p.predicted) - Math.log(p.actual)) }
  })
  // Divide before summing to avoid overflow of a sum of finite large wages.
  const mean = (ns: number[]) => ns.reduce((s, n) => s + n / ns.length, 0)
  const percentages = errors.map(e => e.percentage).sort((a, b) => a - b), mid = Math.floor(errors.length / 2)
  const result = { count: pairs.length, maeEURWeekly: mean(errors.map(e => e.absolute)),
    medianAbsolutePercentageError: errors.length % 2 ? percentages[mid] : percentages[mid - 1] / 2 + percentages[mid] / 2,
    maeLog: mean(errors.map(e => e.log)), biasEURWeekly: mean(errors.map(e => e.bias)) }
  if (Object.values(result).some(n => !Number.isFinite(n))) throw Error('NUMERIC_FAILURE')
  return result
}
export function evaluateSynthetic(rows: SyntheticRow[], artifact: ContextualArtifact, mode: FallbackMode = 'BASELINE') {
  const pairs: { actual: number; predicted: number }[] = [], abstentions: Record<string, number> = {}
  const fallbackLevels: Record<string, number> = {}
  for (const row of rows) {
    const value = actual(row), p = predictContextualSynthetic(row, artifact, mode)
    if (p.prediction === null) {
      const reason = p.abstentionReason ?? 'UNKNOWN'; abstentions[reason] = (abstentions[reason] ?? 0) + 1
    } else {
      pairs.push({ actual: value, predicted: p.prediction })
      fallbackLevels[p.fallbackLevel] = (fallbackLevels[p.fallbackLevel] ?? 0) + 1
    }
  }
  return { target, total: rows.length, predicted: pairs.length, abstained: rows.length - pairs.length,
    predictionCoverage: rows.length ? pairs.length / rows.length : null, abstentions, fallbackLevels, predictionPolicy: mode, metrics: pointMetrics(pairs),
    intervals: { status: 'UNAVAILABLE_NOT_CALIBRATED', coverage50: null, coverage80: null, coverage90: null, meanWidth: null },
    publicationAllowed: false as const, artifactHash: artifact.artifactHash }
}
/** Same frozen rows and artifact; no refit, no tuning against test, no real-data claim. */
export function compareSyntheticFallback(rows: SyntheticRow[], artifact: ContextualArtifact) {
  return { baseline: evaluateSynthetic(rows, artifact), fallback: evaluateSynthetic(rows, artifact, 'LEAGUE_FALLBACK_V01'),
    predictiveImprovementEstablished: false as const }
}
