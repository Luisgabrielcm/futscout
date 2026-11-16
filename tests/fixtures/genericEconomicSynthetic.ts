// Entirely synthetic test identities, amounts and hashes. Never a publishable player release.
import { genericEconomicHash, genericEconomicStageIds } from "../../lib/genericEconomicPublication"
import type { GenericEconomicArtifact, GenericEconomicRelease } from "../../lib/genericEconomicTypes"

export function syntheticPlayer(index: number) {
  return { id: `synthetic-player-${index}`, externalId: index === 0 ? "230430" : String(9000000000 + index),
    eaImportVisibility: "PUBLIC", apiFootballId: null, marketValue: null }
}
export function syntheticClub(index: number) {
  return { id: `synthetic-club-${index < 20 ? 0 : 1}`, externalId: index < 20 ? "1043" : "9000000001" }
}

export function syntheticGenericEconomicRelease(): GenericEconomicRelease {
  const artifact: GenericEconomicArtifact = {
    version: "generic-economic-projection-v1", sourceBatchHash: genericEconomicHash({ fixture: "synthetic-batch" }),
    asOf: "2026-01-01", sourceVersion: "SYNTHETIC_TEST_ONLY", simulationModel: "synthetic-simulation-test",
    salaryModel: "synthetic-wage-test", marketModel: "SYNTHETIC_TEST_ONLY", publicDisplayRightsApproval: null,
    excludedEaIds: Array.from({ length: 62 }, (_, i) => String(9900000000 + i)),
    rows: Array.from({ length: 231 }, (_, i) => {
      const player = syntheticPlayer(i), club = syntheticClub(i), value = 50000 + i * 100
      return { eaId: player.externalId, playerId: player.id, clubId: club.id, clubEaId: club.externalId,
        expectedPlayerHash: genericEconomicHash(player), expectedClubHash: genericEconomicHash(club),
        sourceRecordHash: genericEconomicHash({ fixture: "synthetic-record", index: i }),
        identityClassification: "UNKNOWN", status: "ESTIMATED", confidence: "LOW",
        weeklyWageEur: 100 + i, marketValueEur: value,
        contractReference: { endYear: 2029, precision: "YEAR", sourceFileSha256: "c".repeat(64),
          sourceCommit: "d".repeat(40), effectiveRosterDate: null, realContractConfirmed: false },
        simulation: { durationYears: 3, releaseClauseEur: value * 2, actualClauseStatus: "UNKNOWN", actualClauseEur: null } }
    }),
  }
  return { version: "generic-economic-private-release-v1", artifact,
    approval: { version: "generic-economic-public-approval-v1", sourceBatchHash: artifact.sourceBatchHash,
      projectionHash: genericEconomicHash(artifact), modelPublicReuseReviewSha256: genericEconomicHash({ fixture: "synthetic-review" }),
      publicActivationDecisionSha256: genericEconomicHash({ fixture: "synthetic-operation" }),
      supplierConsentStatus: "MODEL_B_CONSENT_GAP", supplierConsentVerified: false } }
}

export function syntheticGenericEconomicEnvironment(release = syntheticGenericEconomicRelease(), stage = "pilot") {
  return { VERCEL_ENV: "preview", GENERIC_ECONOMICS_PRIVATE_PREVIEW: "1", GENERIC_ECONOMICS_READ_ENABLED: "1",
    GENERIC_ECONOMICS_BATCH_HASH: release.artifact.sourceBatchHash,
    GENERIC_ECONOMICS_PROJECTION_HASH: genericEconomicHash(release.artifact), GENERIC_ECONOMICS_STAGE: stage,
    GENERIC_ECONOMICS_EA_IDS: genericEconomicStageIds(stage, release).join(",") }
}
