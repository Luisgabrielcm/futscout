import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { assertTrainingLicense, canonical, fitOffline, infer, sha256, validateSplits, type Assignment, type Artifact, type Dataset, type Row } from './engine'

export const EXPECTED_MANIFEST_HASH = '83f6e21025aa1b308223bfccdf76146811510ac72c2314662d416cab05cabdc6'
function demand(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code) }

// Read-only verification of bytes; does not parse the real labels or rebuild the dataset.
export function verifyFreeze(directory: string) {
  const bytes = readFileSync(join(directory, 'dataset.manifest.json'))
  demand(sha256(bytes) === EXPECTED_MANIFEST_HASH, 'FROZEN_MANIFEST_MISMATCH')
  const manifest = JSON.parse(bytes.toString('utf8')) as { files: Record<string, string>; trainingDatasetVersion: string; eligible: number }
  for (const [file, hash] of Object.entries(manifest.files)) {
    demand(basename(file) === file && /^[a-f0-9]{64}$/.test(hash), 'MANIFEST_ENTRY_INVALID')
    demand(sha256(readFileSync(join(directory, file))) === hash, 'FROZEN_FILE_MISMATCH')
  }
  return manifest
}
export function verifyFrozenSplits(directory: string) {
  verifyFreeze(directory)
  const v = JSON.parse(readFileSync(join(directory, 'validation.manifest.json'), 'utf8')) as { assignments: Assignment[]; unseenLeagueIds: string[]; counts: Record<string, number> }
  const players = new Set<string>(), clubs = new Map<string, string>(), unseen = new Set(v.unseenLeagueIds)
  const counts: Record<string, number> = { train: 0, calibration: 0, holdout: 0, unseen_leagues: 0 }
  for (const a of v.assignments) {
    demand(!players.has(a.playerId) && Object.hasOwn(counts, a.split), 'DUPLICATE_OR_INVALID_SPLIT'); players.add(a.playerId)
    demand(!clubs.has(a.clubGroup) || clubs.get(a.clubGroup) === a.split, 'CLUB_LEAKAGE'); clubs.set(a.clubGroup, a.split)
    demand(unseen.has(a.leagueId) === (a.split === 'unseen_leagues'), 'LEAGUE_LEAKAGE'); counts[a.split]++
  }
  demand(canonical(counts) === canonical(v.counts) && canonical(counts) === canonical({ train: 1707, calibration: 455, holdout: 577, unseen_leagues: 718 }), 'SPLIT_COUNTS_MISMATCH')
  return { counts, players: players.size, clubs: clubs.size, unseenLeagues: unseen.size, manifestHash: EXPECTED_MANIFEST_HASH }
}
export function evaluate(model: Artifact, rows: Row[], source: Dataset['source']) {
  assertTrainingLicense(source)
  const errors: number[] = [], ape: number[] = [], logErrors: number[] = []
  const intervals = Object.fromEntries(['0.5', '0.8', '0.9'].map(k => [k, { n: 0, covered: 0, widthEUR: 0, widthRatio: 0 }]))
  const abstentions: Record<string, number> = {}
  for (const row of rows) {
    demand(row.target.provider === source && row.target.identityConfidence === 'HIGH' && row.target.currency === 'EUR' && typeof row.target.amountEUR === 'string' && /^\d+\.\d{2}$/.test(row.target.amountEUR), 'EVALUATION_TARGET_INVALID')
    const actual = Number(row.target.amountEUR); demand(Number.isFinite(actual) && actual > 0, 'EVALUATION_TARGET_INVALID')
    const p = infer(model, row.inputs)
    if (p.prediction === null) { const why = p.abstentionReason!; abstentions[why] = (abstentions[why] ?? 0) + 1; continue }
    errors.push(p.prediction - actual); ape.push(100 * Math.abs(p.prediction / actual - 1)); logErrors.push(Math.abs(Math.log(p.prediction / actual)))
    for (const [k, interval] of Object.entries(p.predictionInterval!)) if (interval) {
      const s = intervals[k]; s.n++; s.covered += Number(actual >= interval.lower && actual <= interval.upper)
      s.widthEUR += interval.upper - interval.lower; s.widthRatio += interval.upper / interval.lower
    }
  }
  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  const sorted = ape.sort((a, b) => a - b), n = sorted.length
  return { selected: rows.length, predicted: n, abstentions, maeEUR: avg(errors.map(Math.abs)), biasEUR: avg(errors), maeLog: avg(logErrors),
    medianAPE: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
    intervals: Object.fromEntries(Object.entries(intervals).map(([k, s]) => [k, { n: s.n, coverage: s.n ? s.covered / s.n : null, meanWidthEUR: s.n ? s.widthEUR / s.n : null, meanUpperLowerRatio: s.n ? s.widthRatio / s.n : null }])) }
}

// No CLI bypass, DB, API, automatic selection, output files or current writes.
// A future reviewed license change is necessary before this path can read real labels.
export function trainFrozenDataset(directory: string) {
  assertTrainingLicense('LIVE_FOOTBALL')
  const m = verifyFreeze(directory)
  const rows = JSON.parse(readFileSync(join(directory, 'dataset.json'), 'utf8')) as Row[]
  const validation = JSON.parse(readFileSync(join(directory, 'validation.manifest.json'), 'utf8')) as { assignments: Assignment[]; datasetSha256: string }
  demand(rows.length === m.eligible && validation.datasetSha256 === m.files['dataset.json'], 'DATASET_MANIFEST_MISMATCH')
  const dataset: Dataset = { source: 'LIVE_FOOTBALL', version: m.trainingDatasetVersion, manifestHash: EXPECTED_MANIFEST_HASH, rows, assignments: validation.assignments }
  const artifacts = { A: fitOffline(dataset, 'A'), B: fitOffline(dataset, 'B') }
  // Deliberately no holdout evaluation/selection here. Freeze artifacts before a separately authorized evaluation.
  return artifacts
}

// Evaluation never fits or changes coefficients, quantiles, domains or approvals.
export function evaluateFrozenDataset(directory: string, artifacts: { A: Artifact; B: Artifact }) {
  assertTrainingLicense('LIVE_FOOTBALL')
  const m = verifyFreeze(directory)
  const rows = JSON.parse(readFileSync(join(directory, 'dataset.json'), 'utf8')) as (Row & { context: { region: string } })[]
  const v = JSON.parse(readFileSync(join(directory, 'validation.manifest.json'), 'utf8')) as { assignments: Assignment[] }
  validateSplits({ source: 'LIVE_FOOTBALL', version: m.trainingDatasetVersion, manifestHash: EXPECTED_MANIFEST_HASH, rows, assignments: v.assignments })
  const assignments = new Map(v.assignments.map(a => [a.playerId, a.split]))
  const sortedIds = (split: string) => v.assignments.filter(a => a.split === split).map(a => a.playerId).sort()
  const validationHash = sha256(canonical([...v.assignments].sort((a, b) => a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)))
  const report = (model: Artifact, selected: typeof rows) => {
    const dimensions = {
      ovr: (r: Row) => r.inputs.ovr < 60 ? '<60' : r.inputs.ovr < 70 ? '60-69' : r.inputs.ovr < 75 ? '70-74' : r.inputs.ovr < 80 ? '75-79' : r.inputs.ovr < 85 ? '80-84' : '85+',
      age: (r: Row) => r.inputs.ageYears < 20 ? '<20' : r.inputs.ageYears < 23 ? '20-22' : r.inputs.ageYears < 26 ? '23-25' : r.inputs.ageYears < 30 ? '26-29' : r.inputs.ageYears < 34 ? '30-33' : '34+',
      position: (r: Row) => r.inputs.positionGroup,
      region: (r: typeof rows[number]) => r.context.region,
    }
    return { overall: evaluate(model, selected, 'LIVE_FOOTBALL'), groups: Object.fromEntries(Object.entries(dimensions).map(([key, fn]) => [key,
      Object.fromEntries([...new Set(selected.map(fn))].sort().map(group => [group, evaluate(model, selected.filter(r => fn(r) === group), 'LIVE_FOOTBALL')]))])) }
  }
  return Object.fromEntries((['A', 'B'] as const).map(key => {
    const model = artifacts[key]
    demand(model.baseline === key && model.trainingSource === 'LIVE_FOOTBALL' && model.datasetManifestHash === EXPECTED_MANIFEST_HASH && model.trainingDatasetVersion === m.trainingDatasetVersion, 'ARTIFACT_DATASET_MISMATCH')
    demand(canonical(model.trainingIds) === canonical(sortedIds('train')) && canonical(model.calibrationIds) === canonical(sortedIds('calibration')) && model.validationManifestHash === validationHash, 'ARTIFACT_SPLITS_MISMATCH')
    return [key, { artifactHash: model.artifactHash, holdout: report(model, rows.filter(r => assignments.get(r.playerId) === 'holdout')),
      unseenLeagues: report(model, rows.filter(r => assignments.get(r.playerId) === 'unseen_leagues')), publicationApproved: false, selectedWinner: null }]
  }))
}
