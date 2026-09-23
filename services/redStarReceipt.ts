import { open, rename } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import type { RedStarResult, RedStarSnapshot } from "./redStarCorrection"

export async function writeExclusiveDurable(path: string, bytes: string) {
  const handle = await open(path, "wx")
  try { await handle.writeFile(bytes, "utf8"); await handle.sync() }
  finally { await handle.close() }
}

/** Same-directory rename replaces the pending marker only after a complete, synced write.
 * No unlink fallback or retry: on failure keep the marker and temporary evidence. */
export async function publishRedStarReceipt(path: string, bytes: string,
  io = { write: writeExclusiveDurable, publish: rename }) {
  const temporary = `${path}.${randomUUID()}.tmp`
  await io.write(temporary, bytes)
  await io.publish(temporary, path)
}

export function reconciliationStates(input: unknown): { before: RedStarSnapshot; after: RedStarSnapshot } {
  const value = input as { kind?: string; before?: RedStarSnapshot; after?: RedStarSnapshot; result?: RedStarResult }
  const states = value?.kind === "red-star-pending-v2" ? value
    : value?.kind === "red-star-receipt-v1" ? value.result : undefined
  if (!states?.before || !states.after) throw new Error("RECONCILIATION_STATES_REQUIRED")
  // Reject incomplete evidence before connecting. Detailed equality is checked against live reads.
  for (const snapshot of [states.before, states.after]) {
    if (!snapshot.club?.id || !snapshot.identity?.id || !snapshot.asset?.id ||
      !Array.isArray(snapshot.playerIds) || !Array.isArray(snapshot.assetIds) ||
      !Array.isArray(snapshot.otherClubOwners) || !Array.isArray(snapshot.otherIdentityOwners) ||
      typeof snapshot.protectedHash !== "string") throw new Error("INCOMPLETE_RECONCILIATION_STATES")
  }
  return { before: states.before, after: states.after }
}
