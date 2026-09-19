export type EaGoalkeeperAuditOptions = Readonly<{
  offset: number
  limit: number
  maxBatches: number
}>

function integerFlag(arguments_: string[], name: string, fallback: number, allowZero: boolean): number {
  const entries = arguments_.filter((argument) => argument.startsWith(`${name}=`))
  if (entries.length > 1) throw new Error(`EA_GK_DUPLICATE_FLAG:${name}`)
  if (!entries.length) return fallback
  const raw = entries[0].slice(name.length + 1)
  const value = Number(raw)
  if (!raw || !Number.isInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`EA_GK_INVALID_FLAG:${name}`)
  }
  return value
}

export function parseEaGoalkeeperAuditOptions(arguments_: string[]): EaGoalkeeperAuditOptions {
  if (!arguments_.includes("--dry-run") || arguments_.includes("--write")) {
    throw new Error("EA_GK_AUDIT_REQUIRES_DRY_RUN")
  }
  const allowed = /^(--dry-run|--offset=.+|--limit=.+|--max-batches=.+)$/
  if (arguments_.some((argument) => !allowed.test(argument))) throw new Error("EA_GK_UNKNOWN_ARGUMENT")
  return {
    offset: integerFlag(arguments_, "--offset", 0, true),
    limit: integerFlag(arguments_, "--limit", 100, false),
    maxBatches: integerFlag(arguments_, "--max-batches", 1, false),
  }
}
