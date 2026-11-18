/** The decision is included in the authenticated selection index. Old decisions retain paired behavior. */
const prefix = "real-only-transfer:v1:"
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
  return isRealOnlyTransferDecision(decision) ? { contexts: ["REAL"], gameView: "EA_SNAPSHOT" } :
    { contexts: ["REAL", "GAME"], gameView: "FUTSCOUT_PROJECTED" }
}
