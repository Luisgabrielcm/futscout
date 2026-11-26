/** Deployment-scoped rollout; no shared configuration or automatic global activation. */
export function canReadRealEconomics(eaId: string | null | undefined, env: Record<string, string | undefined>) {
  if (env.REAL_ECONOMICS_READ_ENABLED !== "1" || !eaId) return false
  const raw = env.REAL_ECONOMICS_READ_EA_IDS ?? ""
  const ids = decodeJointReadIds(raw)
  if (!ids || ids.length > 1024) return false
  return ids.includes(eaId)
}
import { decodeJointReadIds } from "./jointReadIds"
