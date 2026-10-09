import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { adaptPilot, adaptEvidence, type Evidence } from './evidence-adapter'
import { prepare, type ContractInput } from './contract'

const base = 'audit/output/contract-evidence-pilot-20261008/'
const selectionBytes = readFileSync(base + 'selection.json')
const evidenceBytes = readFileSync(base + 'evidence.json')
const selected = JSON.parse(selectionBytes.toString()).players
const evidence = JSON.parse(evidenceBytes.toString())
const pilot = adaptPilot(selectionBytes, evidenceBytes)
const byName = (name: string) => pilot.records.find(r => r.provenance.sourceEvidence.name === name)!

test('frozen hashes verified; expected 12 draft counts', () => {
  assert.deepEqual(pilot.summary, { drafts: 12, officialExplicit: 5, provisional: 1,
    clubConflicts: 4, otherConflicts: 1, reviewEligible: 4, persistenceEligible: 0 })
})
test('tampering with either artifact rejected, even whitespace', () => {
  assert.throws(() => adaptPilot(Buffer.concat([selectionBytes, Buffer.from(' ')]), evidenceBytes), /SELECTION_HASH/)
  assert.throws(() => adaptPilot(selectionBytes, Buffer.concat([evidenceBytes, Buffer.from(' ')])), /EVIDENCE_HASH/)
})
test('DAY MONTH YEAR preserved; no anchors or inferred duration end', () => {
  assert.deepEqual(byName('Lamine Yamal').draft.contractUntil, { value: '2031-06-30', datePrecision: 'DAY' })
  assert.deepEqual(byName('Iván Morante').draft.contractUntil, { value: '2029-06', datePrecision: 'MONTH' })
  assert.deepEqual(byName('Frederik Lauenborg').draft.contractUntil, { value: '2028', datePrecision: 'YEAR' })
  assert.equal(byName('Péter Gulácsi').draft.contractUntil.value, null)
})
test('Vanaken remains provisional; official source does not mean verified access', () => {
  assert.equal(byName('Hans Vanaken').evidenceStatus, 'PROVISIONAL')
  assert.equal(byName('Hans Vanaken').reviewEligible, false)
})
test('Almiron option separate; no invented holder or exercised option', () => {
  const r = byName('Miguel Almirón')
  assert.equal(r.draft.contractUntil.value, '2027')
  assert.equal(r.draft.extensionOptions?.[0].until.value, '2028')
  assert.equal(r.draft.extensionOptions?.[0].holder, 'UNKNOWN')
  assert.equal(r.draft.extensionOptions?.[0].conditions, null)
})
test('four club conflicts retained; source and selected status not conflated', () => {
  for (const name of ['Mohamed Salah', 'Péter Gulácsi', 'Robin Knoche', 'Iván Morante']) {
    assert.equal(byName(name).clubReviewRequired, true)
    assert.equal(byName(name).reviewEligible, false)
  }
  assert.equal(byName('Mohamed Salah').draft.contractStatus, 'INACTIVE')
  assert.equal(byName('Robin Knoche').sourceContext.selectedClubStatus, 'INACTIVE')
  assert.equal(byName('Robin Knoche').draft.contractStatus, 'UNKNOWN')
})
test('no invented club ID, timestamp, signing date, season or identity upgrade', () => {
  for (const r of pilot.records) {
    assert.equal(r.draft.clubId, null); assert.equal(r.draft.observedAt, null)
    assert.equal(r.draft.signedAt.value, null); assert.equal(r.draft.season, null)
    assert.equal(r.draft.providerEffectiveAt, null); assert.equal(r.draft.identityConfidence, 'UNKNOWN')
    assert.equal(r.provenance.reviewRecordedAt, evidence.reviewRecordedAt)
    assert.equal(r.draft.provenance.rights, 'UNKNOWN')
  }
})
test('all current clauses UNKNOWN; historical Yamal evidence audit-only', () => {
  for (const r of pilot.records) {
    assert.equal(r.draft.releaseClause.status, 'UNKNOWN')
    assert.equal(r.draft.releaseClause.amount, null)
  }
  assert.ok(byName('Lamine Yamal').provenance.sourceEvidence.historicalClause)
})
test('insufficient evidence abstains; Bento reported date not promoted', () => {
  for (const name of ['Erick Wiemberg', 'Bento', 'Jeong Seung Won']) {
    assert.equal(byName(name).draft.contractUntil.value, null)
    assert.ok(byName(name).abstentionReasons.includes('INSUFFICIENT_EXPIRY_EVIDENCE'))
  }
  assert.equal(byName('Erick Wiemberg').conflictReason, 'UNRESOLVED_SECONDARY_REPORTS')
})
test('player mismatch, missing context and future source date rejected', () => {
  const r = evidence.records[0] as Evidence
  assert.throws(() => adaptEvidence({ ...r, playerId: 'other' }, selected[0], evidence.reviewRecordedAt), /IDENTITY/)
  assert.throws(() => adaptEvidence({ ...r, name: 'other' }, selected[0], evidence.reviewRecordedAt), /IDENTITY/)
  assert.throws(() => adaptEvidence({ ...r, sourceClub: '' }, selected[0], evidence.reviewRecordedAt), /CLUB/)
  assert.throws(() => adaptEvidence({ ...r, publishedAt: '2099-01-01' }, selected[0], evidence.reviewRecordedAt), /AFTER_REVIEW/)
  assert.throws(() => adaptEvidence(r, selected[0], '2026-02-30T00:00:00Z'), /REVIEW_TIME/)
})
test('invalid calendar date and unsupported expiry source rejected', () => {
  const r = evidence.records[0] as Evidence
  assert.throws(() => adaptEvidence({ ...r, contractUntil: { value: '2027-02-29', datePrecision: 'DAY' } }, selected[0], evidence.reviewRecordedAt))
  assert.throws(() => adaptEvidence({ ...r, evidenceQuality: 'SECONDARY' }, selected[0], evidence.reviewRecordedAt), /UNSUPPORTED_EXPIRY/)
})
test('repeat conversion idempotent, deterministic hashes and no input mutation', () => {
  const before = JSON.stringify(evidence)
  assert.deepEqual(pilot, adaptPilot(selectionBytes, evidenceBytes))
  const r = evidence.records[0] as Evidence
  const reordered = Object.fromEntries(Object.entries(r).reverse()) as Evidence
  assert.deepEqual(adaptEvidence(r, selected[0], evidence.reviewRecordedAt), adaptEvidence(reordered, selected[0], evidence.reviewRecordedAt))
  assert.equal(JSON.stringify(evidence), before)
})
test('drafts fail strict ContractInput gate; cannot become current', () => {
  for (const r of pilot.records) {
    assert.equal(r.currentEligible, false); assert.equal(r.persistenceEligible, false)
    assert.equal(r.publicationAllowed, false)
    assert.throws(() => prepare(r.draft as unknown as ContractInput,
      { playerId: r.draft.playerId, clubId: 'unproven', context: 'REAL_WORLD', season: 'unproven' }))
  }
})
test('unsafe URL rejected without making a request', () => {
  assert.throws(() => adaptEvidence({ ...evidence.records[0], source: 'https://example.test/?token=fake' }, selected[0], evidence.reviewRecordedAt), /UNSAFE/)
})
console.log('OFFLINE_ADAPTER_SUMMARY', JSON.stringify(pilot.summary), 'ARTIFACT_SHA256', pilot.artifactHash)
