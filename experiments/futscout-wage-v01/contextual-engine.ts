/** Offline synthetic-only hierarchical ridge. No runtime/publication integration.
 * Objective: sum squared log residuals + block-specific L2 penalties.
 * Club deviations are nested in league/season and shrink toward that parent.
 * exp(log prediction) is a conditional log-location, not a bias-corrected mean.
 */
import { hash, normalizeBase, target, type Salary, type FX } from './engine'

export type Context = {
  leagueId: string; clubId: string; season: string
  position: 'GK' | 'DEF' | 'MID' | 'ATT'; ageYears: number
}
export type SyntheticRow = Context & {
  playerId: string; source: 'SYNTHETIC'; salary: Salary; fx?: FX
}
export type Splits = { train: SyntheticRow[]; calibration: SyntheticRow[]; test: SyntheticRow[] }
export type Options = {
  leaguePenalty: number; clubPenalty: number; fixedPenalty: number
  minLeague: number; minClub: number; minPosition: number
  tolerance: number; maxIterations: number
}
const defaults: Options = { leaguePenalty: 2, clubPenalty: 8, fixedPenalty: 1,
  minLeague: 4, minClub: 2, minPosition: 2, tolerance: 1e-10, maxIterations: 20000 }
const positions = ['GK', 'DEF', 'MID', 'ATT']
const leagueKey = (r: Context) => JSON.stringify([r.leagueId, r.season])
const clubKey = (r: Context) => JSON.stringify([r.leagueId, r.season, r.clubId])
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0
function valid(r: Context) {
  return r && text(r.leagueId) && text(r.clubId) && /^\d{4}(?:\/\d{2})?$/.test(r.season) &&
    positions.includes(r.position) && Number.isFinite(r.ageYears) && r.ageYears >= 15 && r.ageYears <= 60
}
function label(r: SyntheticRow) {
  if (r.source !== 'SYNTHETIC' || r.salary?.source !== 'SYNTHETIC') throw Error('REAL_TRAINING_FORBIDDEN')
  if (!text(r.playerId) || !valid(r)) throw Error('INVALID_CONTEXT')
  const n = normalizeBase(r.salary, r.fx).amountEURWeekly
  if (n === null || !Number.isFinite(n) || n <= 0) throw Error('POSITIVE_LABEL_REQUIRED')
  return Math.log(n)
}
export function fitContextualSynthetic(splits: Splits, overrides: Partial<Options> = {}) {
  const options = { ...defaults, ...overrides }
  for (const k of ['leaguePenalty', 'clubPenalty', 'fixedPenalty', 'tolerance'] as const)
    if (!Number.isFinite(options[k]) || options[k] <= 0) throw Error('INVALID_OPTIONS')
  for (const k of ['minLeague', 'minClub', 'minPosition', 'maxIterations'] as const)
    if (!Number.isSafeInteger(options[k]) || options[k] < 1) throw Error('INVALID_OPTIONS')
  const seen = new Set<string>()
  for (const group of [splits.train, splits.calibration, splits.test]) {
    if (!group.length) throw Error('EMPTY_SPLIT')
    for (const r of group) {
      label(r)
      if (seen.has(r.playerId)) throw Error('PLAYER_SPLIT_LEAKAGE')
      seen.add(r.playerId)
    }
  }
  // Only training rows determine scales, support, coefficients and artifact hash.
  const train = [...splits.train].sort((a, b) => a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)
  const leagues = [...new Set(train.map(leagueKey))].sort()
  const clubs = [...new Set(train.map(clubKey))].sort()
  const ageMean = train.reduce((s, r) => s + r.ageYears, 0) / train.length
  const ageScale = Math.sqrt(train.reduce((s, r) => s + (r.ageYears - ageMean) ** 2, 0) / train.length)
  if (ageScale < 1e-8) throw Error('INSUFFICIENT_AGE_SUPPORT')
  const features = ['intercept', 'age', ...positions.map(p => `position:${p}`),
    ...leagues.map(k => `league:${k}`), ...clubs.map(k => `club:${k}`)]
  const vector = (r: Context) => [1, (r.ageYears - ageMean) / ageScale,
    ...positions.map(p => +(r.position === p)), ...leagues.map(k => +(leagueKey(r) === k)),
    ...clubs.map(k => +(clubKey(r) === k))]
  const x = train.map(vector), y = train.map(label), beta = features.map(() => 0)
  const penalties = features.map(f => f === 'intercept' ? 0 : f.startsWith('club:') ? options.clubPenalty :
    f.startsWith('league:') ? options.leaguePenalty : options.fixedPenalty)
  const residual = [...y]
  let converged = false, iterations = 0
  for (; iterations < options.maxIterations; iterations++) {
    let change = 0
    for (let j = 0; j < beta.length; j++) {
      let numerator = 0, denominator = penalties[j]
      for (let i = 0; i < x.length; i++) {
        numerator += x[i][j] * (residual[i] + x[i][j] * beta[j])
        denominator += x[i][j] ** 2
      }
      const next = numerator / denominator, delta = next - beta[j]
      if (!Number.isFinite(next)) throw Error('NUMERIC_FAILURE')
      beta[j] = next; change = Math.max(change, Math.abs(delta))
      for (let i = 0; i < x.length; i++) residual[i] -= x[i][j] * delta
    }
    if (change < options.tolerance) { converged = true; iterations++; break }
  }
  if (!converged) throw Error('NOT_CONVERGED')
  const counts = (keys: string[]) => Object.fromEntries([...new Set(keys)].sort().map(k => [k, keys.filter(v => v === k).length]))
  const payload = { version: 'wage-contextual-engine-v0.2', target, trainingSource: 'SYNTHETIC_ONLY',
    publicationAllowed: false as const, features, coefficients: beta, options, ageMean, ageScale,
    ageDomain: [Math.min(...train.map(r => r.ageYears)), Math.max(...train.map(r => r.ageYears))],
    support: { leagues: counts(train.map(leagueKey)), clubs: counts(train.map(clubKey)), positions: counts(train.map(r => r.position)) },
    trainingHash: hash(train.map(r => ({ playerId: r.playerId, context: vector(r), logLabel: label(r),
      salary: r.salary, fx: r.fx ?? null }))), iterations, calibrated: false as const }
  return { ...payload, artifactHash: hash(payload) }
}
export type ContextualArtifact = ReturnType<typeof fitContextualSynthetic>
export type FallbackMode = 'BASELINE' | 'LEAGUE_FALLBACK_V01'
export type FallbackLevel = 'NONE' | 'CLUB_SPECIFIC' | 'LEAGUE_UNSEEN_CLUB' | 'LEAGUE_SPARSE_CLUB'
export function predictContextualSynthetic(input: Context, artifact: ContextualArtifact, mode: FallbackMode = 'BASELINE') {
  const provenance = { artifactHash: artifact.artifactHash, trainingHash: artifact.trainingHash,
    trainingSource: artifact.trainingSource, predictionPolicy: mode, validation: 'SYNTHETIC_ONLY_NOT_REAL_VALIDATED' }
  const abstain = (reason: string) => ({ prediction: null, abstentionReason: reason, target,
    fallbackLevel: 'NONE' as FallbackLevel, provenance, publicationAllowed: false as const })
  if (!['BASELINE', 'LEAGUE_FALLBACK_V01'].includes(mode)) return abstain('INVALID_POLICY')
  const { artifactHash, ...payload } = artifact
  if (hash(payload) !== artifactHash || artifact.trainingSource !== 'SYNTHETIC_ONLY' || artifact.publicationAllowed !== false)
    return abstain('INVALID_ARTIFACT')
  if (!valid(input)) return abstain('MISSING_OR_INVALID_CONTEXT')
  const s = artifact.support, o = artifact.options
  const clubSupport = s.clubs[clubKey(input)] ?? 0
  if ((s.leagues[leagueKey(input)] ?? 0) < o.minLeague || (mode === 'BASELINE' && clubSupport < o.minClub) ||
    (s.positions[input.position] ?? 0) < o.minPosition) return abstain('INSUFFICIENT_SUPPORT')
  if (input.ageYears < artifact.ageDomain[0] || input.ageYears > artifact.ageDomain[1]) return abstain('OUTSIDE_AGE_DOMAIN')
  const values = artifact.features.map(f => f === 'intercept' ? 1 : f === 'age' ? (input.ageYears - artifact.ageMean) / artifact.ageScale :
    f === `position:${input.position}` || f === `league:${leagueKey(input)}` ||
    (clubSupport >= o.minClub && f === `club:${clubKey(input)}`) ? 1 : 0)
  const prediction = Math.exp(values.reduce((sum, v, j) => sum + v * artifact.coefficients[j], 0))
  if (!Number.isFinite(prediction) || prediction <= 0) return abstain('NUMERIC_FAILURE')
  const fallbackLevel: FallbackLevel = clubSupport >= o.minClub ? 'CLUB_SPECIFIC' :
    clubSupport === 0 ? 'LEAGUE_UNSEEN_CLUB' : 'LEAGUE_SPARSE_CLUB'
  return { prediction, abstentionReason: null, target, fallbackLevel, provenance, publicationAllowed: false as const }
}
