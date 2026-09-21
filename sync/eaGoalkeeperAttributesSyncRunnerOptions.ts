export type EaGoalkeeperSyncMode = "dry-run" | "write"

export function parseEaGoalkeeperSyncMode(arguments_: string[],
  env: Readonly<Record<string, string | undefined>> = process.env): EaGoalkeeperSyncMode {
  const dryRun = arguments_.includes("--dry-run")
  const write = arguments_.includes("--write")
  if (dryRun === write || arguments_.some(argument => !["--dry-run", "--write"].includes(argument))) {
    throw new Error("Use exatamente um modo: --dry-run ou --write")
  }
  if (write && env.EA_GOALKEEPER_ATTRIBUTES_WRITE_ENABLED !== "true") {
    throw new Error("EA_GOALKEEPER_ATTRIBUTES_WRITE_DISABLED")
  }
  return write ? "write" : "dry-run"
}
