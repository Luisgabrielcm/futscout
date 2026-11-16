import assert from "node:assert/strict"
import test from "node:test"
import { syntheticGenericEconomicRelease, syntheticGenericEconomicEnvironment, syntheticPlayer, syntheticClub } from "../../fixtures/genericEconomicSynthetic"
import { genericEconomicHash, genericEconomicStageIds, selectedGenericEconomicRecord, genericEconomicConflict,
  genericEconomicView, validGenericEconomicRecord, validGenericEconomicRelease, genericEconomicPublicBlocker,
  type GenericEconomicCurrentState } from "../../../lib/genericEconomicPublication"

const release = syntheticGenericEconomicRelease(), pilot = release.artifact.rows[0]
const preview = (stage = "pilot") => syntheticGenericEconomicEnvironment(release, stage)
const production = () => ({ ...preview(), VERCEL_ENV: "production", GENERIC_ECONOMICS_PRODUCTION_ENABLED: "1",
  GENERIC_ECONOMICS_PUBLIC_APPROVAL_HASH: genericEconomicHash(release.approval) })

test("synthetic release has exact unique 231/62 scope without private data imports", () => {
  assert(validGenericEconomicRelease(release)); assert.equal(release.artifact.rows.length, 231)
  assert.equal(release.artifact.excludedEaIds.length, 62)
  for (const row of release.artifact.rows) { assert(validGenericEconomicRecord(row)); assert(!release.artifact.excludedEaIds.includes(row.eaId)) }
  assert.equal(genericEconomicPublicBlocker, "MODEL_B_CONSENT_GAP")
  assert.equal(release.approval.supplierConsentVerified, false)
})

test("defaults and missing private release, flags or pins are disabled", () => {
  assert.equal(selectedGenericEconomicRecord(pilot.playerId), undefined)
  assert.equal(selectedGenericEconomicRecord(pilot.playerId, preview()), undefined)
  for (const key of Object.keys(preview())) {
    const env: Record<string, string> = preview(); delete env[key]
    assert.equal(selectedGenericEconomicRecord(pilot.playerId, env, release), undefined, key)
  }
  for (const patch of [{ GENERIC_ECONOMICS_BATCH_HASH: "wrong" }, { GENERIC_ECONOMICS_PROJECTION_HASH: "wrong" },
    { VERCEL_ENV: "development" }, { GENERIC_ECONOMICS_READ_ENABLED: "true" }])
    assert.equal(selectedGenericEconomicRecord(pilot.playerId, { ...preview(), ...patch }, release), undefined)
})

test("Production still requires separate reviewed evidence and operator decision", () => {
  assert.equal(selectedGenericEconomicRecord(pilot.playerId, production(), release)?.eaId, pilot.eaId)
  for (const key of ["modelPublicReuseReviewSha256", "publicActivationDecisionSha256"] as const) {
    const missing = { ...release, approval: { ...release.approval, [key]: null } }
    assert.equal(selectedGenericEconomicRecord(pilot.playerId, { ...production(),
      GENERIC_ECONOMICS_PUBLIC_APPROVAL_HASH: genericEconomicHash(missing.approval),
      GENERIC_ECONOMICS_RIGHTS_APPROVED: "1" }, missing), undefined)
  }
  for (const patch of [{ GENERIC_ECONOMICS_PRODUCTION_ENABLED: "0" }, { GENERIC_ECONOMICS_PUBLIC_APPROVAL_HASH: "wrong" }])
    assert.equal(selectedGenericEconomicRecord(pilot.playerId, { ...production(), ...patch }, release), undefined)
})

test("exact rollout, exclusions and player identity survive separate release configuration", () => {
  assert.equal(genericEconomicStageIds("pilot", release).length, 1)
  assert.equal(genericEconomicStageIds("club", release).length, 20)
  assert.equal(genericEconomicStageIds("batch", release).length, 231)
  for (const stage of ["pilot", "club", "batch"]) for (const row of release.artifact.rows)
    assert.equal(!!selectedGenericEconomicRecord(row.playerId, preview(stage), release), genericEconomicStageIds(stage, release).includes(row.eaId))
  for (const id of [pilot.eaId, "example-name", "example-slug", "outside"])
    assert.equal(selectedGenericEconomicRecord(id, preview("batch"), release), undefined)
  for (const ids of ["", `${pilot.eaId},${pilot.eaId}`, `${pilot.eaId},1`, "1", `${pilot.eaId},`])
    assert.equal(selectedGenericEconomicRecord(pilot.playerId, { ...preview(), GENERIC_ECONOMICS_EA_IDS: ids }, release), undefined)
})

test("changed private values or source references cannot pass the original projection pin", () => {
  for (const field of ["weeklyWageEur", "marketValueEur"] as const) {
    const changed = { ...release, artifact: { ...release.artifact, rows: [{ ...pilot, [field]: pilot[field] + 1 }, ...release.artifact.rows.slice(1)] } }
    assert.equal(selectedGenericEconomicRecord(pilot.playerId, preview(), changed), undefined)
  }
  const changed = { ...release, artifact: { ...release.artifact, sourceVersion: "different" } }
  changed.approval = { ...changed.approval, projectionHash: genericEconomicHash(changed.artifact) }
  assert.equal(selectedGenericEconomicRecord(pilot.playerId, preview(), changed), undefined)
})

test("malformed identities, amounts, classifications and purported rights clearance fail closed", () => {
  for (const value of [null, {}, [], { ...release, artifact: null }, { ...release, approval: { ...release.approval, supplierConsentVerified: true } }])
    assert.equal(validGenericEconomicRelease(value), false)
  for (const patch of [{ weeklyWageEur: 0 }, { weeklyWageEur: -1 }, { marketValueEur: Infinity },
    { weeklyWageEur: Number.MAX_SAFE_INTEGER + 1 }, { confidence: "HIGH" }, { identityClassification: "FICTITIOUS" },
    { simulation: { ...pilot.simulation, actualClauseStatus: "NO" } },
    { contractReference: { ...pilot.contractReference, precision: "DAY" } },
    { contractReference: { ...pilot.contractReference, realContractConfirmed: true } }])
    assert.equal(validGenericEconomicRecord({ ...pilot, ...patch }), false)
  const duplicate = { ...release, artifact: { ...release.artifact, rows: [pilot, pilot, ...release.artifact.rows.slice(2)] } }
  assert.equal(validGenericEconomicRelease(duplicate), false)
})

test("simulation references never become real contracts or clauses", () => {
  const view = genericEconomicView(pilot, release.artifact)
  assert.equal(view.identityClassification, "UNKNOWN"); assert.equal(view.confidence, "LOW")
  assert.equal(view.contractReference.endYear, 2029); assert.equal(view.contractReference.precision, "YEAR")
  assert.equal(view.contractReference.realContractConfirmed, false); assert.equal(view.contractReference.effectiveRosterDate, null)
  assert.equal(view.simulation.actualClauseStatus, "UNKNOWN"); assert.equal(view.simulation.actualClauseEur, null)
  assert.equal(view.simulation.releaseClauseEur, view.marketValueEur * 2)
  for (const key of ["contractUntil", "releaseClause", "salary", "realMarketValue", "apiFootballId"]) assert(!Object.hasOwn(view, key))
})

test("database conflicts preserve current economics, identities, links and manual edits", () => {
  const state: GenericEconomicCurrentState = { record: syntheticPlayer(0), club: syntheticClub(0), hasExistingEconomics: false, hasClubContexts: false, readOnly: "on" }
  assert.equal(genericEconomicConflict(pilot, state), null)
  for (const [patch, reason] of [[{ readOnly: "off" }, "READ_ONLY_REQUIRED"], [{ hasExistingEconomics: true }, "EXISTING_ECONOMIC_DATA"],
    [{ hasClubContexts: true }, "CLUB_CONTEXT_REVIEW_REQUIRED"]] as const)
    assert.equal(genericEconomicConflict(pilot, { ...state, ...patch }), reason)
  for (const amount of [0, "0", 123]) assert.equal(genericEconomicConflict(pilot,
    { ...state, record: { ...state.record, marketValue: amount } }), "EXISTING_ECONOMIC_DATA")
  assert.equal(genericEconomicConflict(pilot, { ...state, record: { ...state.record, apiFootballId: 1 } }), "REAL_IDENTITY_REVIEW_REQUIRED")
  assert.equal(genericEconomicConflict(pilot, { ...state, record: { ...state.record, externalId: "1" } }), "EA_IDENTITY_CONFLICT")
  assert.equal(genericEconomicConflict(pilot, { ...state, club: null }), "PROTECTED_BASELINE_CHANGED")
  const before = JSON.stringify(state); genericEconomicConflict(pilot, state); assert.equal(JSON.stringify(state), before)
})
