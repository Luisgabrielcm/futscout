// PREPARED ONLY. Requires separate Manchester City pilot authorization.
import { assertAdditionalPilotArguments } from "../services/officialLineupAdditionalPilot"
async function main() {
  assertAdditionalPilotArguments("city", process.argv.slice(2))
  const { executeAdditionalPilot } = await import("../services/officialLineupAdditionalPilotRuntime")
  await executeAdditionalPilot("city")
}
main().catch(() => {
  // Never print provider bodies, headers, configuration or raw database errors.
  console.error(JSON.stringify({ event: "manchester-city-pilot-stopped", operatorReviewRequired: true }))
  process.exitCode = 1
})
