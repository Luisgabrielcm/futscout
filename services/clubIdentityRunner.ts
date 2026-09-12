import { isDeepStrictEqual } from "node:util"
import { barcelonaClubIdentityDryRunConfig, parseClubIdentityPilotArgs, parseClubIdentityExpansionReadArgs } from "./clubIdentityPilotConfig"
import { requireClubIdentityAuthorization } from "./clubIdentityAuthorization"
import type { ClubIdentityConfig, ClubIdentityReport } from "./clubPlayerIdentityPipeline"

export function parseClubIdentityRunnerArgs(args: string[]) {
  if (args[0] === "--dry-run" && args[2] !== "fc-barcelona") {
    return { mode: "DRY_RUN" as const, config: parseClubIdentityExpansionReadArgs(args) }
  }
  if (args[0] === "--dry-run" || args[0] === "--preflight") {
    return { mode: args[0] === "--preflight" ? "PREFLIGHT" as const : "DRY_RUN" as const,
      config: parseClubIdentityPilotArgs(["--dry-run", ...args.slice(1)]) }
  }
  if (args.length !== 11 || args[0] !== "--write" || args[5] !== "--summary-file" || args[7] !== "--confirmation" ||
      args[9] !== "--expected-head" || !/^audit[\\/]reports[\\/][a-zA-Z0-9_-]+\.json$/.test(args[6]) ||
      !/^AUTHORIZE_CLUB_IDENTITY_V1:[a-f0-9]{64}$/.test(args[8]) || !/^[a-f0-9]{40}$/.test(args[10])) {
    throw new Error("EXPLICIT_CLUB_AUTHORIZATION_REQUIRED")
  }
  return { mode: "AUTO_WRITE" as const, config: parseClubIdentityPilotArgs(["--dry-run", ...args.slice(1, 5)]),
    summaryFile: args[6], confirmation: args[8], expectedHead: args[10] }
}

// Operational policy only, not a matcher rule. The generic adapter has no Eric/Barcelona IDs.
export function requireEricClubIdentityPilot(report: ClubIdentityReport) {
  if (!isDeepStrictEqual(report.config, barcelonaClubIdentityDryRunConfig())) throw new Error("PILOT_CONFIG_MISMATCH")
  const candidates = report.rows.filter(r => r.decision === "AUTO_MATCH")
  const eric = report.rows.find(r => r.providerPlayerId === 619)
  if (report.totalProviderPlayers !== 27 || !eric || eric.localCandidate?.playerId !== "cmt9c25m202a8ukucx37nek1p" ||
      eric.localCandidate.slug !== "eric-garcia" ||
      !(candidates.length === 1 && candidates[0] === eric || candidates.length === 0 && eric.decision === "ALREADY_MATCHED")) {
    throw new Error("EXACT_ERIC_CANDIDATE_SET_REQUIRED")
  }
  if (report.rows.find(r => r.providerPlayerId === 182718)?.decision !== "REVIEW") throw new Error("JOAN_REVIEW_REQUIRED")
}

export async function dispatchClubIdentityRunner(args: string[], deps: {
  git: (...args: string[]) => string; clock: () => Date; blockHttp: () => void
  readSummary: (path: string) => unknown
  readOnly: (mode: "DRY_RUN" | "PREFLIGHT", head: string, workingTree: string, config: ClubIdentityConfig) => Promise<void>
  loadWrite: () => Promise<(input: { report: ClubIdentityReport; summary: unknown; confirmation: string; expectedHead: string }) => Promise<void>>
}) {
  const parsed = parseClubIdentityRunnerArgs(args)
  if (deps.git("branch", "--show-current") !== "beta-next") throw new Error("BETA_NEXT_REQUIRED")
  const head = deps.git("rev-parse", "HEAD"), workingTree = deps.git("status", "--porcelain", "--untracked-files=all")
  if (parsed.mode !== "DRY_RUN" && workingTree) throw new Error("CLEAN_WORKING_TREE_REQUIRED")
  if (parsed.mode !== "AUTO_WRITE") { deps.blockHttp(); return deps.readOnly(parsed.mode, head, workingTree, parsed.config) }
  if (head !== parsed.expectedHead) throw new Error("HEAD_MISMATCH")
  const envelope = deps.readSummary(parsed.summaryFile) as { head: string; report: ClubIdentityReport; authorization: { summary: unknown } }
  if (!envelope || envelope.head !== head) throw new Error("SUMMARY_HEAD_MISMATCH")
  requireEricClubIdentityPilot(envelope.report)
  requireClubIdentityAuthorization(envelope.report, envelope.authorization.summary, parsed.confirmation, deps.clock())
  deps.blockHttp()
  const write = await deps.loadWrite()
  await write({ report: envelope.report, summary: envelope.authorization.summary, confirmation: parsed.confirmation, expectedHead: head })
}
