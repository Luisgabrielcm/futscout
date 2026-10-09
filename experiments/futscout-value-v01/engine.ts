// Offline only. No Prisma, network, environment, UI or production writer dependencies.
import { createHash } from 'node:crypto'

export const MODEL_VERSION = 'futscout-value-v0.1'
export const INPUT_SCHEMA = 'futscout-value-input-v0.1'
export const LIVE_FOOTBALL_RIGHTS = Object.freeze({
  status: 'UNKNOWN' as 'UNKNOWN' | 'CONFIRMED' | 'RESTRICTED', evidence: 'https://www.live-football-api.com/terms',
  note: 'Commercial data use does not explicitly settle model training/calibration or parameter retention.',
})
export type Position = 'GK' | 'DEF' | 'MID' | 'ATT'
export type Inputs = {
  playerId: string; externalId: string | null; ovr: number; dateOfBirth: string
  referenceAt: string; ageYears: number; position: string; positionGroup: Position
  clubId: string; clubGroup: string; leagueId: string
}
export type Row = {
  playerId: string; inputs: Inputs; inputHash: string
  target: { amountEUR: string; currency: string; provider: string; identityConfidence: string }
}
export type Split = 'train' | 'calibration' | 'holdout' | 'unseen_leagues'
export type Assignment = { playerId: string; clubGroup: string; leagueId: string; split: Split }
export type Dataset = {
  source: 'SYNTHETIC' | 'LIVE_FOOTBALL'; version: string; manifestHash: string
  rows: Row[]; assignments: Assignment[]
}
type Payload = {
  modelVersion: typeof MODEL_VERSION; inputSchemaVersion: typeof INPUT_SCHEMA; baseline: 'A' | 'B'
  trainingDatasetVersion: string; datasetManifestHash: string; trainingSource: Dataset['source']
  publicationAllowed: false; targetDefinition: 'ln(EUR); exp(log-fit), not arithmetic mean'
  normalization: { ovr: [number, number]; age: [number, number] }
  featureOrder: string[]; coefficients: number[]
  applicabilityDomain: { ovr: [number, number]; age: [number, number]; positions: Position[]; policy: 'TRAIN_RANGE_ONLY_NOT_VALIDATED_SUPPORT' }
  calibration: { version: 'absolute-log-residual-conformal-v1'; n: number; quantiles: Record<string, number | null> }
  trainingIds: string[]; calibrationIds: string[]; validationManifestHash: string
  evaluationEvidence: null
}
export type Artifact = Payload & { artifactHash: string }
const hashPattern = /^[0-9a-f]{64}$/
const positions: Position[] = ['GK', 'DEF', 'MID', 'ATT']
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const requireThat: (ok: unknown, message: string) => asserts ok = (ok, message) => { if (!ok) throw new Error(message) }
export const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')
export function canonical(value: unknown): string {
  function normalized(x: unknown): unknown {
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return x
    if (typeof x === 'number') { requireThat(Number.isFinite(x), 'NON_FINITE_HASH_INPUT'); return Object.is(x, -0) ? 0 : x }
    if (Array.isArray(x)) return x.map(normalized)
    requireThat(typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype, 'INVALID_HASH_INPUT')
    return Object.fromEntries(Object.entries(x).sort(([a], [b]) => compare(a, b)).map(([k, v]) => [k, normalized(v)]))
  }
  return JSON.stringify(normalized(value))
}
function positionGroup(p: string): Position | undefined {
  if (['GK', 'GOL'].includes(p)) return 'GK'
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'ZAG', 'LE', 'LD', 'ALA'].includes(p)) return 'DEF'
  if (['CDM', 'CM', 'CAM', 'LM', 'RM', 'VOL', 'MC', 'MEI', 'MD', 'ME'].includes(p)) return 'MID'
  if (['ST', 'CF', 'LW', 'RW', 'ATA', 'SA', 'PE', 'PD'].includes(p)) return 'ATT'
}
export function validateInputs(x: Inputs): void {
  requireThat(x && typeof x === 'object', 'INVALID_INPUT')
  const keys = ['playerId', 'externalId', 'ovr', 'dateOfBirth', 'referenceAt', 'ageYears', 'position', 'positionGroup', 'clubId', 'clubGroup', 'leagueId']
  requireThat(Object.keys(x).length === keys.length && Object.keys(x).every(k => keys.includes(k)), 'INPUT_FIELDS')
  for (const k of ['playerId', 'clubId', 'clubGroup', 'leagueId'] as const) requireThat(typeof x[k] === 'string' && x[k].length > 0, 'INPUT_ID')
  requireThat(x.externalId === null || typeof x.externalId === 'string', 'EXTERNAL_ID')
  requireThat(Number.isInteger(x.ovr) && x.ovr >= 1 && x.ovr <= 99, 'OVR_INVALID')
  const instant = (s: string) => typeof s === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s.slice(0, 10)
  requireThat(instant(x.dateOfBirth) && instant(x.referenceAt), 'DATE_INVALID')
  const age = (Date.parse(x.referenceAt) - Date.parse(x.dateOfBirth)) / (365.2425 * 86400000)
  requireThat(Number.isFinite(x.ageYears) && x.ageYears >= 0 && Math.abs(age - x.ageYears) < 1e-12, 'AGE_INVALID')
  requireThat(positions.includes(x.positionGroup) && positionGroup(x.position) === x.positionGroup, 'POSITION_INVALID')
}
export function inputHash(inputs: Inputs): string {
  validateInputs(inputs)
  return sha256(canonical({ inputSchemaVersion: INPUT_SCHEMA, inputs }))
}
export function assertTrainingLicense(source: Dataset['source']): void {
  requireThat(source === 'SYNTHETIC' || source === 'LIVE_FOOTBALL', 'SOURCE_INVALID')
  if (source === 'LIVE_FOOTBALL') requireThat(LIVE_FOOTBALL_RIGHTS.status === 'CONFIRMED', 'LIVE_FOOTBALL_TRAINING_LICENSE_PENDING')
}
export function validateSplits(d: Dataset): void {
  const rows = new Map(d.rows.map(r => [r.playerId, r]))
  requireThat(rows.size === d.rows.length && d.assignments.length === d.rows.length, 'DUPLICATE_OR_MISSING_PLAYER')
  const seen = new Set<string>(), clubs = new Map<string, Split>(), leagues = new Map<string, boolean>(), ea = new Set<string>()
  const counts = { train: 0, calibration: 0, holdout: 0, unseen_leagues: 0 }
  for (const a of d.assignments) {
    const row = rows.get(a.playerId)
    requireThat(row && !seen.has(a.playerId) && Object.hasOwn(counts, a.split), 'ASSIGNMENT_INVALID'); seen.add(a.playerId)
    validateInputs(row.inputs)
    requireThat(row.inputs.playerId === row.playerId && row.inputHash === inputHash(row.inputs), 'INPUT_HASH_MISMATCH')
    requireThat(a.clubGroup === row.inputs.clubGroup && a.leagueId === row.inputs.leagueId, 'GROUP_MISMATCH')
    requireThat(!clubs.has(a.clubGroup) || clubs.get(a.clubGroup) === a.split, 'CLUB_LEAKAGE'); clubs.set(a.clubGroup, a.split)
    const unseen = a.split === 'unseen_leagues'
    requireThat(!leagues.has(a.leagueId) || leagues.get(a.leagueId) === unseen, 'LEAGUE_LEAKAGE'); leagues.set(a.leagueId, unseen)
    if (row.inputs.externalId) { requireThat(!ea.has(row.inputs.externalId), 'DUPLICATE_EA_ID'); ea.add(row.inputs.externalId) }
    counts[a.split]++
  }
  requireThat(Object.values(counts).every(n => n > 0), 'EMPTY_SPLIT')
}
function amount(row: Row, source: Dataset['source']): number {
  requireThat(row.target.provider === source && row.target.identityConfidence === 'HIGH' && row.target.currency === 'EUR', 'TARGET_PROVENANCE_INVALID')
  requireThat(typeof row.target.amountEUR === 'string' && /^\d+\.\d{2}$/.test(row.target.amountEUR), 'TARGET_INVALID')
  const n = Number(row.target.amountEUR)
  requireThat(Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER, 'TARGET_INVALID')
  return n
}
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
function scale(values: number[]): [number, number] {
  const m = mean(values), s = Math.sqrt(mean(values.map(x => (x - m) ** 2)))
  requireThat(Number.isFinite(s) && s > 0, 'CONSTANT_FEATURE'); return [m, s]
}
function features(x: Inputs, model: Pick<Payload, 'normalization' | 'baseline'>): number[] {
  const { ovr, age } = model.normalization
  return [1, (x.ovr - ovr[0]) / ovr[1], (x.ageYears - age[0]) / age[1], ...(model.baseline === 'B' ? ['DEF', 'MID', 'ATT'].map(p => Number(x.positionGroup === p)) : [])]
}
// Small QR least-squares solver, reorthogonalized MGS; never normal equations or silent regularization.
function leastSquares(x: number[][], y: number[]): number[] {
  const n = x.length, p = x[0].length
  requireThat(n > p, 'INSUFFICIENT_TRAIN_ROWS')
  const q: number[][] = [], r = Array.from({ length: p }, () => Array<number>(p).fill(0))
  for (let j = 0; j < p; j++) {
    const v = x.map(row => row[j])
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < j; k++) {
      const dot = v.reduce((s, a, i) => s + a * q[k][i], 0); r[k][j] += dot
      for (let i = 0; i < n; i++) v[i] -= dot * q[k][i]
    }
    const norm = Math.sqrt(v.reduce((s, a) => s + a * a, 0))
    requireThat(norm > Number.EPSILON * Math.max(n, p) * 100, 'RANK_DEFICIENT')
    r[j][j] = norm; q.push(v.map(a => a / norm))
  }
  const b = q.map(col => col.reduce((s, a, i) => s + a * y[i], 0))
  for (let j = p - 1; j >= 0; j--) { for (let k = j + 1; k < p; k++) b[j] -= r[j][k] * b[k]; b[j] /= r[j][j] }
  requireThat(b.every(Number.isFinite), 'NUMERIC_FAILURE'); return b
}
const logPredict = (x: Inputs, m: Pick<Payload, 'baseline' | 'normalization' | 'coefficients'>) => features(x, m).reduce((s, f, i) => s + f * m.coefficients[i], 0)
export function fitOffline(d: Dataset, baseline: 'A' | 'B'): Artifact {
  assertTrainingLicense(d.source) // Before inspecting any real labels.
  requireThat(['A', 'B'].includes(baseline) && hashPattern.test(d.manifestHash), 'FIT_CONTRACT')
  validateSplits(d)
  const assignment = new Map(d.assignments.map(a => [a.playerId, a.split]))
  const rows = (s: Split) => d.rows.filter(r => assignment.get(r.playerId) === s).sort((a, b) => compare(a.playerId, b.playerId))
  const train = rows('train'), calibration = rows('calibration')
  const normalization = { ovr: scale(train.map(r => r.inputs.ovr)), age: scale(train.map(r => r.inputs.ageYears)) }
  const coefficients = leastSquares(train.map(r => features(r.inputs, { baseline, normalization })), train.map(r => Math.log(amount(r, d.source))))
  const residuals = calibration.map(r => Math.abs(Math.log(amount(r, d.source)) - logPredict(r.inputs, { baseline, normalization, coefficients }))).sort((a, b) => a - b)
  const quantiles = Object.fromEntries([0.5, 0.8, 0.9].map(level => {
    const rank = Math.ceil((residuals.length + 1) * level)
    return [String(level), rank > residuals.length ? null : residuals[rank - 1]]
  }))
  const range = (a: number[]): [number, number] => [Math.min(...a), Math.max(...a)]
  const payload: Payload = {
    modelVersion: MODEL_VERSION, inputSchemaVersion: INPUT_SCHEMA, baseline, trainingDatasetVersion: d.version,
    datasetManifestHash: d.manifestHash, trainingSource: d.source, publicationAllowed: false,
    targetDefinition: 'ln(EUR); exp(log-fit), not arithmetic mean', normalization,
    featureOrder: ['intercept', 'ovr_train_standardized', 'age_train_standardized', ...(baseline === 'B' ? ['DEF_vs_GK', 'MID_vs_GK', 'ATT_vs_GK'] : [])], coefficients,
    applicabilityDomain: { ovr: range(train.map(r => r.inputs.ovr)), age: range(train.map(r => r.inputs.ageYears)), positions: positions.filter(p => train.some(r => r.inputs.positionGroup === p)), policy: 'TRAIN_RANGE_ONLY_NOT_VALIDATED_SUPPORT' },
    calibration: { version: 'absolute-log-residual-conformal-v1', n: calibration.length, quantiles },
    trainingIds: train.map(r => r.playerId), calibrationIds: calibration.map(r => r.playerId),
    validationManifestHash: sha256(canonical([...d.assignments].sort((a, b) => compare(a.playerId, b.playerId)))), evaluationEvidence: null,
  }
  return { ...payload, artifactHash: sha256(canonical(payload)) }
}
export function infer(model: Artifact, inputs: Inputs) {
  const { artifactHash, ...payload } = model
  requireThat(artifactHash === sha256(canonical(payload)), 'ARTIFACT_HASH_MISMATCH')
  requireThat(model.modelVersion === MODEL_VERSION && model.inputSchemaVersion === INPUT_SCHEMA && model.publicationAllowed === false, 'MODEL_CONTRACT')
  const base = { modelVersion: MODEL_VERSION, artifactHash, inputHash: null as string | null, kind: 'MODEL_ESTIMATE' as const, currency: 'EUR', publicationAllowed: false,
    identityConfidence: null, uncertaintyKind: 'CALIBRATED_LOG_RESIDUAL_NOT_IDENTITY_CONFIDENCE' }
  const abstain = (reason: string) => ({ ...base, prediction: null, predictionInterval: null, abstentionReason: reason })
  try { base.inputHash = inputHash(inputs) } catch { return abstain('INVALID_INPUT') }
  const d = model.applicabilityDomain
  if (inputs.ovr < d.ovr[0] || inputs.ovr > d.ovr[1] || inputs.ageYears < d.age[0] || inputs.ageYears > d.age[1]) return abstain('OUTSIDE_TRAIN_RANGE')
  if (!d.positions.includes(inputs.positionGroup)) return abstain('UNSUPPORTED_POSITION')
  const log = logPredict(inputs, model), prediction = Math.exp(log)
  const predictionInterval = Object.fromEntries(Object.entries(model.calibration.quantiles).map(([level, q]) => [level, q === null ? null : { lower: Math.exp(log - q), upper: Math.exp(log + q) }]))
  if (!(prediction > 0) || !Number.isFinite(prediction) || Object.values(predictionInterval).some(v => v && (!(v.lower > 0) || !Number.isFinite(v.upper)))) return abstain('NUMERIC_RANGE')
  if (Object.values(predictionInterval).some(v => v === null)) return abstain('INSUFFICIENT_CALIBRATION')
  return { ...base, prediction, predictionInterval, abstentionReason: null }
}
