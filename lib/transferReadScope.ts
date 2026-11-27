/** The decision is included in the authenticated selection index. Old decisions retain paired behavior. */
const prefix = "real-only-transfer:v1:"
const nativePrefix = "ea-snapshot-real:v1:"
const gameClubPrefix = "game-club-snapshot:v1:"
export type GameClubSnapshotScope = "GAME" | "PAIRED_NATIVE" | "PAIRED_PROJECTED"
export function gameClubSnapshotDecision(evidenceHash: string, scope: GameClubSnapshotScope) {
  if (!/^[a-f0-9]{64}$/.test(evidenceHash) || !["GAME", "PAIRED_NATIVE", "PAIRED_PROJECTED"].includes(scope))
    throw new Error("GAME_CLUB_SNAPSHOT_DECISION_INVALID")
  return gameClubPrefix + evidenceHash + ":" + scope
}
export function isGameClubSnapshotDecision(decision: string) { return decision.startsWith("game-club-snapshot:") }
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
  if (isGameClubSnapshotDecision(decision)) {
    const match = /^game-club-snapshot:v1:[a-f0-9]{64}:(GAME|PAIRED_NATIVE|PAIRED_PROJECTED)$/.exec(decision)
    if (!match) throw new Error("GAME_CLUB_SNAPSHOT_DECISION_INVALID")
    return { contexts: match[1] === "GAME" ? ["GAME"] : ["REAL", "GAME"],
      gameView: match[1] === "PAIRED_PROJECTED" ? "FUTSCOUT_PROJECTED" : "EA_SNAPSHOT" }
  }
  if (decision.startsWith("ea-snapshot-real:")) {
    if (!decision.startsWith(nativePrefix) || !/^[a-f0-9]{64}$/.test(decision.slice(nativePrefix.length))) throw new Error("NATIVE_SNAPSHOT_DECISION_INVALID")
    return { contexts: ["REAL", "GAME"], gameView: "EA_SNAPSHOT" }
  }
  return isRealOnlyTransferDecision(decision) ? { contexts: ["REAL"], gameView: "EA_SNAPSHOT" } :
    { contexts: ["REAL", "GAME"], gameView: "FUTSCOUT_PROJECTED" }
}
