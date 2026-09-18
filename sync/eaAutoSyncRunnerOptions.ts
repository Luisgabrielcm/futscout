import type { EaAutoSyncMode } from "./eaAutoSyncCore"

export type EaAutoSyncRunnerOptions = {
  mode: EaAutoSyncMode
  initialOffset: number
  batchSize: number
  maxBatches: number
}

type EaAutoSyncRunnerEnvironment = Record<string, string | undefined>

function integerArgument(
  value: string | undefined,
  fallback: number,
  name: string,
  allowZero = false,
): number {
  const source = value ?? String(fallback)
  if (!/^(?:0|[1-9]\d*)$/.test(source)) throw new Error(`${name}_INVALID`)

  const parsed = Number(source)
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw new Error(`${name}_INVALID`)
  }

  return parsed
}

function optionalFlag(arguments_: string[], name: string): string | undefined {
  const prefix = `${name}=`
  const matches = arguments_.filter((argument) => argument.startsWith(prefix))
  if (matches.length > 1) throw new Error(`${name.slice(2).replaceAll("-", "_").toUpperCase()}_DUPLICATE`)
  return matches[0]?.slice(prefix.length)
}

export function parseEaAutoSyncRunnerOptions(
  arguments_: string[],
  environment: EaAutoSyncRunnerEnvironment,
  checkpointOffset: number,
): EaAutoSyncRunnerOptions {
  const write = arguments_.includes("--write")
  const dryRun = arguments_.includes("--dry-run")
  if (write === dryRun) throw new Error("Use exatamente um modo: --dry-run ou --write")

  const offsetValue = optionalFlag(arguments_, "--offset")
  const limitValue = optionalFlag(arguments_, "--limit")
  const maxBatchesValue = optionalFlag(arguments_, "--max-batches")
  const recognized = new Set([
    "--write",
    "--dry-run",
    ...arguments_.filter((argument) =>
      argument.startsWith("--offset=") ||
      argument.startsWith("--limit=") ||
      argument.startsWith("--max-batches=")
    ),
  ])
  const unknown = arguments_.find((argument) => !recognized.has(argument))
  if (unknown) throw new Error(`EA_AUTO_SYNC_ARGUMENT_UNKNOWN:${unknown}`)

  if (write && offsetValue !== undefined) throw new Error("EA_AUTO_SYNC_WRITE_OFFSET_FORBIDDEN")
  if (write && environment.EA_AUTO_SYNC_WRITE_ENABLED !== "true") {
    throw new Error("EA_AUTO_SYNC_WRITE_DISABLED")
  }

  return {
    mode: write ? "write" : "dry-run",
    initialOffset: offsetValue === undefined
      ? integerArgument(String(checkpointOffset), checkpointOffset, "EA_AUTO_SYNC_INITIAL_OFFSET", true)
      : integerArgument(offsetValue, checkpointOffset, "EA_AUTO_SYNC_OFFSET", true),
    batchSize: integerArgument(
      limitValue ?? environment.EA_AUTO_SYNC_BATCH_SIZE,
      50,
      "EA_AUTO_SYNC_LIMIT",
    ),
    maxBatches: integerArgument(
      maxBatchesValue ?? environment.EA_AUTO_SYNC_MAX_BATCHES,
      1,
      "EA_AUTO_SYNC_MAX_BATCHES",
    ),
  }
}
