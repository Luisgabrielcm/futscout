/** The decision is included in the authenticated selection index. Old decisions retain paired behavior. */
const prefix = "real-only-transfer:v1:"
const nativePrefix = "ea-snapshot-real:v1:"
/** Explicitly selected native GAME evidence and REAL employment; no projected transfer claim. */
export function nativeSnapshotRealDecision(evidenceHash: string) {
  if (!/^[a-f0-9]{64}$/.test(evidenceHash)) throw new Error("NATIVE_SNAPSHOT_DECISION_HASH_INVALID")
  return nativePrefix + evidenceHash
}
export function realOnlyTransferDecision(evidenceHash: string) {
  if (!/^[a-f0-9]{64}$/.test(evidenceHash)) throw new Error("REAL_ONLY_DECISION_HASH_INVALID")
  return prefix + evidenceHash
}
export function isRealOnlyTransferDecision(decision: string): boolean {
  if (!decision.startsWith("real-only-transfer:")) return false
  if (!decision.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(decision.slice(prefix.length))) throw new Error("REAL_ONLY_DECISION_INVALID")
  return true
}
export function transferDecisionReadScope(decision: string): { contexts: ("REAL" | "GAME")[]; gameView: "EA_SNAPSHOT" | "FUTSCOUT_PROJECTED" } {
  if (decision.startsWith("ea-snapshot-real:")) {
    if (!decision.startsWith(nativePrefix) || !/^[a-f0-9]{64}$/.test(decision.slice(nativePrefix.length))) throw new Error("NATIVE_SNAPSHOT_DECISION_INVALID")
    return { contexts: ["REAL", "GAME"], gameView: "EA_SNAPSHOT" }
  }
  return isRealOnlyTransferDecision(decision) ? { contexts: ["REAL"], gameView: "EA_SNAPSHOT" } :
    { contexts: ["REAL", "GAME"], gameView: "FUTSCOUT_PROJECTED" }
}
