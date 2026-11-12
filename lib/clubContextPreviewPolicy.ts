import { canReadClubContexts } from "./clubContextReadGate"

type Environment = Readonly<Record<string, string | undefined>>

/** Preview-wide SQL isolation; the four-ID gate still controls presentation only. */
export function clubContextPreviewReadOnly(env: Environment): boolean {
  const requested = env.CLUB_CONTEXTS_PREVIEW_READ_ONLY === "1" ||
    (env.VERCEL_ENV === "preview" && env.CLUB_CONTEXTS_READ_ENABLED === "1")
  if (!requested) return false
  if (env.VERCEL_ENV !== "preview") throw Error("CLUB_CONTEXT_READ_ONLY_REQUIRES_PREVIEW")
  if (env.CLUB_CONTEXTS_READ_ENABLED === "1" && !canReadClubContexts("218191", env))
    throw Error("CLUB_CONTEXT_READ_ONLY_INVALID_PILOT_SCOPE")
  return true
}

/** Returns a deployment-local value; never mutates process.env or shared settings. */
export function previewPooledConnectionString(value: string): string {
  const url = new URL(value)
  if (url.hostname !== "pooled.db.prisma.io") throw Error("CLUB_CONTEXT_PREVIEW_REQUIRES_POOLED")
  const options = url.searchParams.get("options")
  if (options && options !== "-c default_transaction_read_only=on")
    throw Error("CLUB_CONTEXT_PREVIEW_UNSUPPORTED_STARTUP_OPTIONS")
  url.searchParams.delete("options")
  url.searchParams.set("sslmode", "verify-full")
  return url.toString()
}

export function rejectPreviewAlternateDatabase(env: Environment): void {
  if (clubContextPreviewReadOnly(env)) throw Error("CLUB_CONTEXT_PREVIEW_ALTERNATE_DATABASE_DISABLED")
}
