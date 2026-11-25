/** Deployment-scoped rollout; no shared configuration or automatic global activation. */
export function canReadRealEconomics(eaId: string | null | undefined, env: Record<string, string | undefined>) {
  if (env.REAL_ECONOMICS_READ_ENABLED !== "1" || !eaId) return false
  const raw = env.REAL_ECONOMICS_READ_EA_IDS ?? ""
  const ids = raw.split(",")
  if (!raw || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => !/^[1-9]\d*$/.test(id))) return false
  return ids.includes(eaId)
}
