import test from 'node:test'
import assert from 'node:assert/strict'
import { hash } from '../../../experiments/futscout-wage-v01/engine'
import { mlsSourceKey, parseMlsCsv, reconcileMls, prepareMlsPilot, planMlsSplits, type MlsRow, type Snapshot, type ReviewedLink } from '../../../experiments/futscout-wage-v01/mls-pilot'

const row = (club = 'synthetic-club', first_name = 'synthetic-player'): MlsRow => ({ first_name, last_name: 'Test', club, position: 'Central Midfield', base_salary: '100000.25', guaranteed_comp: '110000.75' })
const snapshot = (rows: MlsRow[], url = 'synthetic:official'): Snapshot => ({ url, contentHash: hash(rows), edition: 'synthetic-edition', declaredReferenceAt: null, observedAt: '2026-10-19', rows })
const reconcile = (rows: MlsRow[] = [row()]) => reconcileMls(snapshot(rows), snapshot(rows, 'synthetic:csv'))
const link = (r = row()): ReviewedLink => ({ sourceKey: mlsSourceKey(r), evidenceReference: 'synthetic:review', input: {
  leagueId: 'MLS', dateOfBirth: '2000-01-01', position: 'MID', positionEvidence: 'synthetic:historical-position', guaranteedAnnualUSD: 110000.75,
  affiliation: { playingClubId: r.club, payerClubId: r.club, status: 'DIRECT', evidenceReference: 'synthetic:contract' },
  reference: { salary: { amount: 100000.25, currency: 'USD', period: 'YEAR', tax: 'GROSS', component: 'BASE', source: 'MLSPA', observedAt: '2026-10-19', effectiveAt: '2026-04-14' },
    fx: { from: 'USD', eurPerUnit: .9, date: '2026-04-14', source: 'SYNTHETIC_FX' }, nature: 'OBSERVED', sourceReference: 'synthetic:official',
    rights: { training: 'CONFIRMED', calibration: 'CONFIRMED', evidenceReference: 'synthetic:license' },
    identity: { playerId: r.first_name, sourcePlayerId: 'synthetic:source-id', confidence: 'HIGH', evidenceReference: 'synthetic:identity' },
    context: { playerId: r.first_name, clubId: r.club, sourceClubId: r.club, season: '2026', sourceSeason: '2026', seasonStart: '2026-01-01', seasonEnd: '2026-12-31', referenceAt: '2026-04-16' } }
} })

test('CSV preserves original decimals, BOM, CRLF, quoted commas and escaped quotes', () => {
  const csv = '\uFEFFfirst_name,last_name,club,position,base_salary,guaranteed_comp,year\r\n"Syn, the ""One""",Test,Club,MID,100000.25,110000.75,2026\r\n'
  const [r] = parseMlsCsv(csv)
  assert.equal(r.first_name, 'Syn, the "One"'); assert.equal(r.base_salary, '100000.25')
})
test('CSV rejects truncated, malformed, blank amounts and wrong edition rows', () => {
  const header = 'first_name,last_name,club,position,base_salary,guaranteed_comp,year\n'
  for (const tail of ['A,B,C,MID,,1,2026', 'A,B,C,MID,1', '"A,B,C,MID,1,2,2026', 'A,B,C,MID,1,2,2025', 'A,B,C,MID,-1,2,2026', '"A"x,B,C,MID,1,2,2026']) assert.throws(() => parseMlsCsv(header + tail))
  assert.throws(() => parseMlsCsv('first_name,first_name\na,b'))
})
test('two sources yield one observation and preserve distinct compensation measures', () => {
  const r = reconcile(); assert.equal(r.summary.COINCIDENT, 1); assert.equal(r.records.length, 1)
  assert.equal(r.records[0].row.base_salary, '100000.25'); assert.equal(r.records[0].row.guaranteed_comp, '110000.75')
  assert.equal(r.trainingAllowed, false)
})
test('cent differences and missing records on either side are explicit', () => {
  const r = reconcileMls(snapshot([row(), row('A', 'only-official')]), snapshot([{ ...row(), guaranteed_comp: '110000.76' }, row('B', 'only-csv')]))
  assert.equal(r.summary.DIVERGENT, 1); assert.equal(r.summary.CSV_ONLY, 1); assert.equal(r.summary.OFFICIAL_ONLY, 1)
})
test('duplicates and position conflicts are quarantined without selecting a winner', () => {
  const d = reconcileMls(snapshot([row(), row()]), snapshot([row()]))
  assert.equal(d.summary.AMBIGUOUS_DUPLICATE, 1); assert.equal(prepareMlsPilot(d, [], false).counts.eligible, 0)
  const p = reconcileMls(snapshot([row()]), snapshot([{ ...row(), position: 'Goalkeeper' }]))
  assert(prepareMlsPilot(p, [link()], true).prepared[0].blockers.includes('POSITION_DIVERGENCE'))
})
test('snapshot edition, unsafe money and missing provenance are rejected', () => {
  assert.throws(() => reconcileMls(snapshot([row()]), { ...snapshot([row()]), edition: 'other' }))
  assert.throws(() => reconcile([{ ...row(), base_salary: '9007199254740992' }]))
  assert.throws(() => reconcileMls({ ...snapshot([row()]), contentHash: '' }, snapshot([row()])))
})
test('no catalog export means zero links, technical references and approved labels', () => {
  const r = prepareMlsPilot(reconcile(), [], false)
  assert.deepEqual(r.counts, { sourceRecords: 1, linkedPlayers: 0, technicallyReady: 0, rightsAndSemanticsApproved: 0, eligible: 0 })
  assert.equal(r.coverage.age.UNKNOWN, 1); assert.equal(r.quarantineKeys.length, 1)
})
test('existing eligibility and context builder are reused; training never self-approves', () => {
  const r = prepareMlsPilot(reconcile(), [link()], true)
  assert.equal(r.counts.eligible, 1); assert.equal(r.counts.technicallyReady, 1)
  assert.equal(r.prepared[0].context?.labels.guaranteedAnnualUSD, 110000.75)
  assert.equal(r.prepared[0].assessment?.normalized?.original.currency, 'USD')
  assert.equal(r.trainingAllowed, false); assert.equal(r.publicationAllowed, false)
})
test('rights, gross-base, historical FX and dates remain blocking', () => {
  const a = link(); a.input.reference.rights.training = 'UNKNOWN'
  const rights = prepareMlsPilot(reconcile(), [a], true)
  assert.equal(rights.counts.technicallyReady, 1); assert.equal(rights.counts.eligible, 0)
  for (const mutate of [(x: ReviewedLink) => { x.input.reference.salary.tax = 'UNKNOWN' }, (x: ReviewedLink) => { x.input.reference.fx = undefined }, (x: ReviewedLink) => { x.input.reference.salary.effectiveAt = null }]) {
    const b = link(); mutate(b); assert.equal(prepareMlsPilot(reconcile(), [b], true).counts.technicallyReady, 0)
  }
  assert.equal(prepareMlsPilot(reconcile(), [link()], false).counts.eligible, 0)
})
test('review cannot replace source labels, estimates, source date or identity evidence', () => {
  for (const mutate of [(x: ReviewedLink) => { x.input.reference.salary.amount = 1 }, (x: ReviewedLink) => { x.input.guaranteedAnnualUSD = 1 },
    (x: ReviewedLink) => { x.input.reference.nature = 'PROVIDER_ESTIMATE' }, (x: ReviewedLink) => { x.input.reference.salary.observedAt = '2026-04-14' },
    (x: ReviewedLink) => { x.input.reference.identity.sourcePlayerId = '' }]) {
    const x = link(); mutate(x); assert.equal(prepareMlsPilot(reconcile(), [x], true).counts.eligible, 0)
  }
})
test('duplicate links, orphan mappings and repeated player across clubs are rejected', () => {
  assert.throws(() => prepareMlsPilot(reconcile(), [link(), link()], true))
  assert.throws(() => prepareMlsPilot(reconcile(), [link(row('other'))], true))
  const rows = [row('A'), row('B')]
  assert.throws(() => prepareMlsPilot(reconcile(rows), rows.map(r => link(r)), true), /PLAYER_LEAKAGE/)
})
test('splits freeze whole clubs and connected source names; invariant to wages, OVR and ordering', () => {
  const rows = ['A', 'B', 'C', 'D', 'E'].map((c, i) => row(c, String(i)))
  rows.push(row('F', '0'))
  const split = planMlsSplits(rows)
  assert.equal(split.status, 'SOURCE_GROUP_PREVIEW_NOT_APPROVED')
  const partitions = [split.train, split.validation, split.test]
  const a = partitions.findIndex(p => p.includes(mlsSourceKey(rows[0]))), f = partitions.findIndex(p => p.includes(mlsSourceKey(rows[5])))
  assert.equal(a, f); assert.equal(new Set(partitions.flat()).size, 6)
  assert.deepEqual(split, planMlsSplits([...rows].reverse().map(r => ({ ...r, base_salary: '1.00', ...{ ovr: 99 } }))))
  assert.equal(planMlsSplits([row()]).status, 'INSUFFICIENT_GROUPS')
})
test('preparation is deterministic, does not mutate inputs and retains distribution tails', () => {
  const rows = [{ ...row('A', 'low'), base_salary: '80000' }, { ...row('B', 'high'), base_salary: '25000000' }]
  const r = reconcile(rows), before = JSON.stringify(r), p = prepareMlsPilot(r, [], false)
  assert.equal(p.coverage.annualBaseUSD['<100k'], 1); assert.equal(p.coverage.annualBaseUSD['>=5m'], 1)
  assert.deepEqual(p, prepareMlsPilot(r, [], false)); assert.equal(JSON.stringify(r), before)
})
