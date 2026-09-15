import { firstMultiClubBatchPolicy, firstMultiClubPreflightPins } from "./firstMultiClubIdentityBatch"
import type { MultiClubResumeConfig } from "./multiClubIdentityResume"
import type { IdentityWriteAudit } from "./playerIdentityWritePilot"

// F.1/F.2 independent AFTER audit, 2026-09-15. Operational data pins, not generic engine logic.
export function firstMultiClubResumeConfig(id="first-multi-club-resume-v1"):MultiClubResumeConfig {
  if(id!=="first-multi-club-resume-v1")throw new Error("UNKNOWN_RESUME_CONFIG")
  const original=firstMultiClubBatchPolicy(),pins=firstMultiClubPreflightPins()
  const ordered=original.executionOrder.map(id=>original.selectionOrder.find(p=>p.playerId===id)!)
  const confirmed=ordered.slice(0,16).map(p=>({...p,expectedStatus:"ALREADY_MATCHED" as const,expectedAttempt:"matched" as const}))
  const remaining=ordered.slice(16),clubs=original.orderedClubList.filter(c=>remaining.some(p=>p.clubId===c.clubId))
  const tables=structuredClone(pins.baseline.tables) as IdentityWriteAudit["tables"]
  tables.Player={count:"16228",hash:"68161348ee295d29cd183759045e7196"}
  tables.ApiFootballPlayerMatchAttempt={count:"107",hash:"94ed01c1bba014c52472a40786502c9c"}
  return {id,resumeVersion:1,original,originalExpectedHead:"0805d6eab76032b10e3c9b00c4bd037f51abe821",
    originalBaseline:{players:16228,associated:92,attempts:91,tables:pins.baseline.tables as IdentityWriteAudit["tables"]},
    resumeBaseline:{players:16228,associated:108,attempts:107,tables},confirmed,remaining,clubs,
    caches:clubs.map(c=>({clubId:c.clubId,cacheRowHash:pins.clubs.find(v=>v.teamId===c.teamId)!.cacheRowHash,snapshotHash:null}))}
}
