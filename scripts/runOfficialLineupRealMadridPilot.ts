// PREPARED ONLY. Requires separate Real Madrid pilot authorization.
import { assertAdditionalPilotArguments } from "../services/officialLineupAdditionalPilot"
async function main() {
  assertAdditionalPilotArguments("real", process.argv.slice(2))
  const { executeAdditionalPilot } = await import("../services/officialLineupAdditionalPilotRuntime")
  await executeAdditionalPilot("real")
}
main().catch(() => {
  // Never print provider bodies, headers, configuration or raw database errors.
  console.error(JSON.stringify({ event: "real-madrid-pilot-stopped", operatorReviewRequired: true }))
  process.exitCode = 1
})
